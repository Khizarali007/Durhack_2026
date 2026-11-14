"""Live adapter over the same finite-account market used by the offline replay.

Replay days are synthetic UTC day buckets: final daily results/reports become
known only at the day boundary. They are not claimed to be real final-whistle
or injury publication timestamps. No dividends are emitted in this milestone.
"""
from __future__ import annotations

import asyncio
import copy
import itertools
import math
import random
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from market.core import load_data, load_injuries, make_markets
from trading.market_contract import Player, Quote, MakerQuote, Fill, OrderResult, MarketTick, BotTrade, BotTradeSummary

ROOT = Path(__file__).resolve().parents[2]
ALIASES = {
    "Shai Gilgeous-Alexander": "SGA", "Nikola Jokic": "JOKIC",
    "Giannis Antetokounmpo": "GIANNIS", "Luka Doncic": "LUKA",
    "Jayson Tatum": "TATUM", "Anthony Edwards": "ANT",
    "Victor Wembanyama": "WEMBY", "LeBron James": "LEBRON",
    "Stephen Curry": "CURRY", "Jalen Brunson": "BRUNSON",
    "Cade Cunningham": "CADE", "De'Aaron Fox": "FOX",
}


class LiveMarket:
    supports_advanced_trading = False
    supports_payouts = False
    requires_fresh_session = True
    execution_chunk_size = 1  # exact cash/limit check before every human share

    def __init__(self, *, database=None, values=None, injuries=None, seed=2026,
                 day_seconds=60.0, tick_seconds=0.5):
        if not math.isfinite(day_seconds) or day_seconds <= 0:
            raise ValueError("day_seconds must be finite and positive")
        if not math.isfinite(tick_seconds) or tick_seconds <= 0:
            raise ValueError("tick_seconds must be finite and positive")
        self.day_seconds, self.tick_seconds = day_seconds, tick_seconds
        data, self.results = load_data(database or ROOT / 'data/player_games_2024_25.sqlite',
                                      values or ROOT / 'data/starting_values_2024_25.csv')
        self.markets = make_markets(data, seed)
        self._players = [Player(pid, ALIASES.get(p['name'], f'NBA{pid}'), p['name'], p['team'], p['starting_price'])
                         for pid, p in sorted(data.items())]
        self.ids = {p.symbol: p.player_id for p in self._players}
        if len(self.ids) != len(self._players):
            raise ValueError('Duplicate player ticker')
        self.symbols = {v: k for k, v in self.ids.items()}
        path = injuries if injuries is not None else ROOT / 'data/injury_reports_2024_25.csv'
        self.injuries = load_injuries(path)
        self.day = datetime.fromisoformat(min(self.results)).replace(tzinfo=timezone.utc)
        self.end = datetime.fromisoformat(max(self.results)).replace(tzinfo=timezone.utc) + timedelta(days=1)
        self._t = self.day.timestamp()
        self.finished = False
        self.rng = random.Random(seed + 9999991)
        self._orders = itertools.count(1)
        self._subscribers = []
        self.human_shares = {}  # account/player -> net shares acquired from makers
        self.human_cash_flow = 0  # net pre-fee cash paid by humans to makers
        self._initial_cash = self._market_cash()
        self._bot_trades = []
        self._bundle_minute = int(self._t // 60) * 60
        for m in self.markets.values():
            m.trade_observer = self._record_bot

    def _record_bot(self, bot_id, pid, side, qty, cents):
        self._bot_trades.append(BotTrade(bot_id, self.symbols[pid], side, qty, cents / 100, self._t))

    def _flush_bots(self):
        if self._bot_trades:
            trades = tuple(self._bot_trades)
            self._publish(BotTradeSummary(self._bundle_minute, len(trades), sum(t.qty for t in trades), trades))
            self._bot_trades.clear()
        self._bundle_minute = int(self._t // 60) * 60

    def players(self):
        return list(self._players)

    def market_time(self):
        return self._t

    def quote(self, symbol):
        m = self.markets[self.ids[symbol]]
        makers = tuple(MakerQuote(f'MM{i+1}', bid / 100 if bid is not None else None,
                                  ask / 100 if ask is not None else None, maker.shares)
                       for i, maker in enumerate(m.makers) for bid, ask in [m.quote(i)])
        bids = [q.bid for q in makers if q.bid is not None]
        asks = [q.ask for q in makers if q.ask is not None]
        return Quote(symbol, max(bids) if bids else None, min(asks) if asks else None,
                     m.last_cents / 100, m.fair_cents / 100, makers)

    def last_price(self, symbol):
        return self.quote(symbol).last

    def _execute(self, m, symbol, side, qty, order_id):
        fills = []
        remaining = qty
        while remaining:
            best = m.best_quote(side)
            if best is None:
                break
            price, index = best
            maker = m.makers[index]
            take = min(remaining, 1, maker.shares if side == 'buy' else maker.cash // price)
            if not take:
                break
            direction = 1 if side == 'buy' else -1
            maker.shares -= direction * take
            maker.cash += direction * take * price
            m.last_cents = price
            m.trades_today.append(price)
            m.volume_today += take
            fills.append(Fill(order_id, symbol, side, take, price / 100, f'MM{index+1}', self._t))
            remaining -= take
        return OrderResult(order_id, 'filled' if not remaining else 'partially_filled' if fills else 'rejected',
                           tuple(fills), remaining, 'insufficient maker liquidity' if remaining else None)

    def submit_order(self, *, account_id, symbol, side, qty):
        oid = f'live-{next(self._orders)}'
        if symbol not in self.ids or side not in ('buy', 'sell') or type(qty) is not int or qty <= 0:
            return OrderResult(oid, 'rejected', (), qty, 'invalid symbol, side or quantity')
        if self.finished:
            return OrderResult(oid, 'rejected', (), qty, 'replay has ended')
        result = self._execute(self.markets[self.ids[symbol]], symbol, side, qty, oid)
        direction = 1 if side == 'buy' else -1
        key = (account_id, self.ids[symbol])
        self.human_shares[key] = self.human_shares.get(key, 0) + direction * result.filled_qty
        self.human_cash_flow += direction * sum(round(f.price * 100) * f.qty for f in result.fills)
        return result

    def preview_order(self, *, symbol, side, qty):
        if symbol not in self.ids or side not in ('buy', 'sell') or type(qty) is not int or qty <= 0:
            return OrderResult('preview', 'rejected', (), qty, 'invalid symbol, side or quantity')
        if self.finished:
            return OrderResult('preview', 'rejected', (), qty, 'replay has ended')
        # Only maker/execution state needs copying; never mutate RNG, bots or counters.
        m = copy.copy(self.markets[self.ids[symbol]])
        m.makers = copy.deepcopy(m.makers)
        m.trades_today = list(m.trades_today)
        return self._execute(m, symbol, side, qty, 'preview')

    @contextmanager
    def order_transaction(self, symbol):
        """Restore maker state if account settlement raises, including SQLite failure."""
        m = self.markets.get(self.ids.get(symbol))
        if m is None:
            yield
            return
        saved = (copy.deepcopy(m.makers), m.last_cents, list(m.trades_today), m.volume_today,
                 dict(self.human_shares), self.human_cash_flow)
        try:
            yield
        except BaseException:
            m.makers, m.last_cents, m.trades_today, m.volume_today, self.human_shares, self.human_cash_flow = saved
            raise

    def subscribe(self):
        q = asyncio.Queue(maxsize=1000)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, queue):
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    def _publish(self, event):
        for q in self._subscribers:
            if q.full():
                # This milestone emits only display ticks and optional audit summaries.
                # No cash-moving payout event may use this lossy channel.
                q.get_nowait()
            q.put_nowait(event)

    def _close_day(self):
        day = self.day.date().isoformat()
        for pid, m in self.markets.items():
            report = self.injuries.get(day, {}).get(pid)
            if report:
                m.set_injury(report)
            else:
                m.injury_signal = 0.0
            scores = self.results.get(day, {}).get(pid, [])
            m.reveal(scores)
            if scores and m.injury_factor < 1:
                m.injury_factor = m.availability_probability = 1.0
                m.injury_status, m.injury_reason = 'Available', 'Played in official box score'
                m.update_fair()
            m.price_history.append(m.last_cents)
            m.prior_close = m.last_cents
            m.trades_today.clear()
            m.volume_today = 0
            m.bot_trades_today.clear()
        for bot in next(iter(self.markets.values())).bots:
            bot.orders_today = 0
        self.day += timedelta(days=1)

    def step(self):
        if self.finished:
            return
        self._t = min(self.end.timestamp(), self._t + 86400 * self.tick_seconds / self.day_seconds)
        if int(self._t // 60) * 60 != self._bundle_minute:
            self._flush_bots()
        while self.day.timestamp() + 86400 <= self._t:
            self._close_day()
        self.finished = self._t >= self.end.timestamp()
        if not self.finished:
            for m in self.rng.sample(list(self.markets.values()), min(12, len(self.markets))):
                m.bot_round(bool(m.game_signal))
        if self.finished:
            self._flush_bots()
        self.check_ledger()
        self._publish(MarketTick(self._t, {p.symbol: self.quote(p.symbol) for p in self._players}))

    async def run(self):
        while not self.finished:
            await asyncio.sleep(self.tick_seconds)
            self.step()

    def _market_cash(self):
        return (sum(maker.cash for m in self.markets.values() for maker in m.makers)
                + sum(b.cash for b in next(iter(self.markets.values())).bots))

    def check_ledger(self):
        assert self._market_cash() == self._initial_cash + self.human_cash_flow
        human_totals = {}
        for (_, pid), qty in self.human_shares.items():
            human_totals[pid] = human_totals.get(pid, 0) + qty
        for pid, m in self.markets.items():
            assert all(mm.cash >= 0 and mm.shares >= 0 for mm in m.makers)
            assert all(b.cash >= 0 and b.holdings[pid] >= 0 for b in m.bots)
            assert sum(mm.shares for mm in m.makers) + sum(b.holdings[pid] for b in m.bots) + human_totals.get(pid, 0) == m.initial_shares
