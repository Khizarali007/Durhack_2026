"""Practice rivals: five of Person 1's real market bots, given fictional names.

They are simulated traders, never presented as people. Everything shown about
them is real engine data: their cash, holdings, trades, payouts and equity.
Only these five bots are tracked (a trade log, payouts and one equity point
per market day), so the cost is negligible next to the 300-bot market.

Funding: each rival has at least the same cash a player starts with (H$100 in
the UI's denomination = 10,000,000 ledger cents), set when the market is created,
before the market's conservation baseline is taken (the ledger stays exact).
With the tenfold share economics a fixed-pool bot already starts with that much,
so the top-up only matters for other bot counts. Rivals also hold their opening
shares, so their return is measured from opening equity, not from cash.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from trading.db import STARTING_CASH_CENTS

RIVAL_CASH_CENTS = STARTING_CASH_CENTS  # H$100 displayed: the same cash a player starts with

# (bot style, rival id, name, persona, one-line strategy)
ROSTER = (
    ("value", "maya", "Maya", "Value Hunter", "Buys players trading below the analyst estimate."),
    ("momentum", "theo", "Theo", "Momentum Chaser", "Buys what is rising, sells what is falling."),
    ("contrarian", "priya", "Priya", "Contrarian", "Buys the dip and sells the rally."),
    ("news", "sam", "Sam", "Headline Trader", "Trades on game results and injury reports."),
    ("risk_averse", "jordan", "Jordan", "Safety First", "Avoids injured players and big swings."),
)


@dataclass
class RivalFill:
    order_id: str
    symbol: str
    side: str
    qty: int
    price: float
    t: float


@dataclass
class RivalPayment:
    symbol: str
    qty_held: int
    amount: float
    t: float


@dataclass
class Rival:
    id: str
    name: str
    persona: str
    strategy: str
    style: str
    bot: Any
    opening_equity: float = 0.0
    opening_t: float = 0.0
    fills: list[RivalFill] = field(default_factory=list)
    payments: list[RivalPayment] = field(default_factory=list)
    equity: list[tuple[float, float]] = field(default_factory=list)


class RivalTracker:
    def __init__(self, markets: dict, topup_cents: int = RIVAL_CASH_CENTS) -> None:
        bots = next(iter(markets.values())).bots if markets else []
        by_id = {b.bot_id: b for b in bots}
        self.rivals: dict[str, Rival] = {}
        for style, rid, name, persona, strategy in ROSTER:
            bot = by_id.get(f"{style}-01")
            if bot is None:
                continue
            bot.cash = max(bot.cash, topup_cents)
            self.rivals[rid] = Rival(rid, name, persona, strategy, style, bot)
        self.by_bot = {r.bot.bot_id: r for r in self.rivals.values()}
        self._seq = 0

    def equity_of(self, rival: Rival, market) -> float:
        value = 0
        for pid, qty in rival.bot.holdings.items():
            if qty:
                value += qty * market.mark_price(market.symbols[pid])
        return round(rival.bot.cash / 100 + value, 2)

    def start(self, market) -> None:
        for r in self.rivals.values():
            r.opening_equity = self.equity_of(r, market)
            r.opening_t = market.market_time()
            r.equity = [(r.opening_t, r.opening_equity)]

    def on_trade(self, bot_id: str, symbol: str, side: str, qty: int, cents: int, t: float) -> None:
        rival = self.by_bot.get(bot_id)
        if rival is None:
            return
        self._seq += 1
        rival.fills.append(RivalFill(f"{rival.id}-{self._seq}", symbol, side, qty, cents / 100, t))

    def on_payout(self, bot_id: str, symbol: str, qty: int, amount_cents: int, t: float) -> None:
        rival = self.by_bot.get(bot_id)
        if rival is not None and amount_cents:
            rival.payments.append(RivalPayment(symbol, qty, amount_cents / 100, t))

    def on_day_close(self, market, t: float) -> None:
        for r in self.rivals.values():
            r.equity.append((t, self.equity_of(r, market)))

    def holdings(self, rival: Rival, market) -> dict[str, int]:
        return {market.symbols[pid]: qty for pid, qty in rival.bot.holdings.items() if qty}
