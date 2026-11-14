"""A fake market engine that stands in for Person 1's until it has a live API.

It copies the shape of Person 1's prototype (scripts/simulate_market.py on
person-1-tasks):
- integer cents internally, floats in HOOP at the edges
- 3 market makers per player with finite cash (100,000 HOOP) and shares (150)
- maker quotes centred on fair value, skewed by the maker's inventory, with
  spreads of 2.0%, 2.5% and 3.0%
- the price is the last executed trade, never set directly
- small bot trades from value / momentum / casual / contrarian styles

and the live clock from the plan and Person 4's conventions:
- one tick every 0.5 real seconds, market time in epoch seconds at 12x real time
- 10 ticks = 1 market minute, with one bot-trade summary per minute

Differences from Person 1 (stand-ins until their engine is live):
- fair value drifts randomly each tick instead of moving on real box scores
  and injury reports
- bots have unlimited cash and shares (Person 1 tracks 20 shared accounts)
- player ids are placeholders, not real ESPN ids

Pure standard library. Deterministic for a given seed, so tests can call
``step()`` directly instead of waiting.
"""

from __future__ import annotations

import asyncio
import copy
import itertools
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone

from .market_contract import (
    BotTrade,
    BotTradeSummary,
    Fill,
    MakerQuote,
    MarketEvent,
    MarketTick,
    OrderResult,
    Player,
    Quote,
    Side,
)

# Symbols match Person 4's mocks (SGA, JOKIC, TATUM, WEMBY, ANT) plus a few more.
# player_id values are PLACEHOLDERS; Person 1 uses real ESPN athlete ids.
DEFAULT_PLAYERS: tuple[Player, ...] = (
    Player(1, "SGA", "Shai Gilgeous-Alexander", "OKC", 150.0),
    Player(2, "JOKIC", "Nikola Jokic", "DEN", 160.0),
    Player(3, "GIANNIS", "Giannis Antetokounmpo", "MIL", 145.0),
    Player(4, "LUKA", "Luka Doncic", "DAL", 140.0),
    Player(5, "TATUM", "Jayson Tatum", "BOS", 115.0),
    Player(6, "ANT", "Anthony Edwards", "MIN", 110.0),
    Player(7, "WEMBY", "Victor Wembanyama", "SAS", 105.0),
    Player(8, "LEBRON", "LeBron James", "LAL", 110.0),
    Player(9, "CURRY", "Stephen Curry", "GSW", 105.0),
    Player(10, "BRUNSON", "Jalen Brunson", "NYK", 105.0),
    Player(11, "CADE", "Cade Cunningham", "DET", 100.0),
    Player(12, "FOX", "De'Aaron Fox", "SAC", 95.0),
)

# Clock (plan + Person 4): 0.5 s ticks, market time 12x real time.
TICK_SECONDS = 0.5
MARKET_SECONDS_PER_TICK = 6.0
TICKS_PER_MARKET_MINUTE = 10
SEASON_START_T = datetime(2024, 10, 22, tzinfo=timezone.utc).timestamp()  # Person 1's opening day

# Makers (Person 1's constants).
MAKER_IDS = ("MM1", "MM2", "MM3")
MAKER_CASH_CENTS = 10_000_000
MAKER_STARTING_SHARES = 150
MAKER_OFFSETS = (-0.007, 0.0, 0.007)
MAKER_SPREADS = (0.020, 0.025, 0.030)
INVENTORY_SKEW = 0.15
MIN_PRICE_CENTS = 1_000

FILL_CHUNK = 10              # shares per fill before makers re-quote (gives smooth slippage)
FAIR_VALUE_VOL = 0.002       # random drift of fair value per tick (stand-in for real news)
BOT_ACTIONS_PER_TICK = 3
BOT_STYLES = ("value", "momentum", "casual", "contrarian")
BOT_IDS = tuple(f"{BOT_STYLES[i % 4]}-{i // 4 + 1:02d}" for i in range(20))


@dataclass
class _Maker:
    maker_id: str
    offset: float
    spread: float
    cash: int = MAKER_CASH_CENTS
    shares: int = MAKER_STARTING_SHARES


@dataclass
class _Market:
    player: Player
    fair_cents: float
    last_cents: int
    prev_last_cents: int
    makers: list[_Maker] = field(default_factory=list)

    def maker_quote(self, maker: _Maker) -> tuple[int | None, int | None]:
        skew = INVENTORY_SKEW * (MAKER_STARTING_SHARES - maker.shares) / MAKER_STARTING_SHARES
        mid = self.fair_cents * max(0.5, 1 + skew + maker.offset)
        bid = max(1, round(mid * (1 - maker.spread / 2)))
        ask = max(bid + 1, round(mid * (1 + maker.spread / 2)))
        return (bid if maker.cash >= bid else None, ask if maker.shares > 0 else None)

    def best(self, side: Side) -> tuple[int, _Maker] | None:
        """Best price for the taker: lowest ask to buy, highest bid to sell."""
        options = []
        for maker in self.makers:
            bid, ask = self.maker_quote(maker)
            price = ask if side == "buy" else bid
            if price is not None:
                options.append((price, maker.maker_id, maker))
        if not options:
            return None
        price, _, maker = min(options) if side == "buy" else max(options)
        return price, maker


class FakeMarket:
    def __init__(self, *, seed: int = 2026, start_t: float = SEASON_START_T,
                 players: tuple[Player, ...] = DEFAULT_PLAYERS) -> None:
        self._rng = random.Random(seed)
        self._t = start_t
        self._tick = 0
        self._minute_start_t = start_t
        self._order_ids = itertools.count(1)
        self._subscribers: list[asyncio.Queue[MarketEvent]] = []
        self._bot_trades: list[BotTrade] = []
        self._players = {p.symbol: p for p in players}
        self._markets = {
            p.symbol: _Market(
                player=p,
                fair_cents=p.start_price * 100,
                last_cents=round(p.start_price * 100),
                prev_last_cents=round(p.start_price * 100),
                makers=[_Maker(m, o, s) for m, o, s in zip(MAKER_IDS, MAKER_OFFSETS, MAKER_SPREADS)],
            )
            for p in players
        }
        self._bot_bias = {bot: self._rng.gauss(0, 0.035) for bot in BOT_IDS}

    # --- Market data ------------------------------------------------------------

    def players(self) -> list[Player]:
        return list(self._players.values())

    def market_time(self) -> float:
        return self._t

    def quote(self, symbol: str) -> Quote:
        market = self._markets[symbol]
        makers = []
        for maker in market.makers:
            bid, ask = market.maker_quote(maker)
            makers.append(MakerQuote(maker.maker_id, _hoop(bid), _hoop(ask), maker.shares))
        bids = [m.bid for m in makers if m.bid is not None]
        asks = [m.ask for m in makers if m.ask is not None]
        return Quote(
            symbol=symbol,
            bid=max(bids) if bids else None,
            ask=min(asks) if asks else None,
            last=_hoop(market.last_cents),
            fair_value=_hoop(round(market.fair_cents)),
            makers=tuple(makers),
        )

    def last_price(self, symbol: str) -> float:
        return _hoop(self._markets[symbol].last_cents)

    # --- Orders -------------------------------------------------------------------

    def submit_order(self, *, account_id: str, symbol: str, side: Side, qty: int) -> OrderResult:
        order_id = f"o{next(self._order_ids)}"
        if symbol not in self._markets:
            return OrderResult(order_id, "rejected", (), qty, f"unknown symbol {symbol!r}")
        if side not in ("buy", "sell"):
            return OrderResult(order_id, "rejected", (), qty, f"side must be 'buy' or 'sell', not {side!r}")
        if not isinstance(qty, int) or isinstance(qty, bool) or qty <= 0:
            return OrderResult(order_id, "rejected", (), qty, "qty must be a positive whole number")

        fills = self._execute(order_id, symbol, side, qty)
        remaining = qty - sum(f.qty for f in fills)
        if remaining == 0:
            return OrderResult(order_id, "filled", tuple(fills), 0)
        reason = "market makers ran out of shares" if side == "buy" else "market makers ran out of cash"
        if not fills:
            return OrderResult(order_id, "rejected", (), qty, reason)
        return OrderResult(order_id, "partially_filled", tuple(fills), remaining, reason)

    def preview_order(self, *, symbol: str, side: Side, qty: int) -> OrderResult:
        """What ``submit_order`` would return right now, without trading or changing anything."""
        if symbol not in self._markets:
            return OrderResult("preview", "rejected", (), qty, f"unknown symbol {symbol!r}")
        real = self._markets[symbol]
        self._markets[symbol] = copy.deepcopy(real)   # trade against a throwaway copy
        try:
            fills = self._execute("preview", symbol, side, qty)
        finally:
            self._markets[symbol] = real
        remaining = qty - sum(f.qty for f in fills)
        if remaining == 0:
            return OrderResult("preview", "filled", tuple(fills), 0)
        reason = "market makers ran out of shares" if side == "buy" else "market makers ran out of cash"
        return OrderResult("preview", "partially_filled" if fills else "rejected", tuple(fills), remaining, reason)

    # --- Events -------------------------------------------------------------------

    def subscribe(self) -> asyncio.Queue[MarketEvent]:
        queue: asyncio.Queue[MarketEvent] = asyncio.Queue(maxsize=1000)
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[MarketEvent]) -> None:
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    async def run(self) -> None:
        while True:
            self.step()
            await asyncio.sleep(TICK_SECONDS)

    def step(self) -> list[MarketEvent]:
        """Advance one tick. Returns the events and pushes them to subscribers."""
        self._tick += 1
        self._t += MARKET_SECONDS_PER_TICK
        for market in self._markets.values():
            market.prev_last_cents = market.last_cents
            market.fair_cents = max(
                MIN_PRICE_CENTS, market.fair_cents * math.exp(self._rng.gauss(0, FAIR_VALUE_VOL))
            )
        self._run_bots()

        events: list[MarketEvent] = [MarketTick(self._t, {s: self.quote(s) for s in self._markets})]
        if self._tick % TICKS_PER_MARKET_MINUTE == 0:
            trades = tuple(self._bot_trades)
            self._bot_trades.clear()
            events.append(BotTradeSummary(self._minute_start_t, len(trades),
                                          sum(t.qty for t in trades), trades))
            self._minute_start_t = self._t
        for event in events:
            self._publish(event)
        return events

    # --- Internals ------------------------------------------------------------------

    def _execute(self, order_id: str, symbol: str, side: Side, qty: int) -> list[Fill]:
        """Fill against the best maker in chunks, re-quoting after each chunk."""
        market = self._markets[symbol]
        fills: list[Fill] = []
        remaining = qty
        while remaining > 0:
            best = market.best(side)
            if best is None:
                break
            price, maker = best
            capacity = maker.shares if side == "buy" else maker.cash // price
            take = min(remaining, FILL_CHUNK, capacity)
            if take <= 0:
                break
            if side == "buy":
                maker.shares -= take
                maker.cash += price * take
            else:
                maker.shares += take
                maker.cash -= price * take
            remaining -= take
            market.last_cents = price
            last = fills[-1] if fills else None
            if last and last.counterparty == maker.maker_id and last.price == _hoop(price):
                fills[-1] = Fill(order_id, symbol, side, last.qty + take, last.price, maker.maker_id, self._t)
            else:
                fills.append(Fill(order_id, symbol, side, take, _hoop(price), maker.maker_id, self._t))
        return fills

    def _run_bots(self) -> None:
        rng = self._rng
        symbols = list(self._markets)
        for _ in range(BOT_ACTIONS_PER_TICK):
            bot_id = rng.choice(BOT_IDS)
            style = bot_id.split("-")[0]
            market = self._markets[rng.choice(symbols)]
            best_bid, best_ask = market.best("sell"), market.best("buy")
            momentum = max(-0.15, min(0.15, market.last_cents / market.prev_last_cents - 1))
            trend = 0.8 * momentum if style == "momentum" else -0.8 * momentum if style == "contrarian" else 0
            perceived = market.fair_cents * max(0.5, 1 + self._bot_bias[bot_id] + trend + rng.gauss(0, 0.015))
            side: Side | None = None
            if style == "casual" and rng.random() < 0.2:
                side = rng.choice(("buy", "sell"))
            elif best_ask and best_ask[0] < perceived * 0.985:
                side = "buy"
            elif best_bid and best_bid[0] > perceived * 1.015:
                side = "sell"
            if side is None:
                continue
            for fill in self._execute(f"bot-{bot_id}", market.player.symbol, side, rng.randint(1, 3)):
                self._bot_trades.append(BotTrade(bot_id, fill.symbol, side, fill.qty, fill.price, fill.t))

    def _publish(self, event: MarketEvent) -> None:
        for queue in self._subscribers:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass  # slow subscriber: drop rather than stall the market


def _hoop(cents: int | None) -> float | None:
    return None if cents is None else round(cents / 100, 2)
