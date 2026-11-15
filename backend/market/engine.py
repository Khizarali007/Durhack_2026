"""Live adapter over the same finite-account market used by the offline replay.

Replay days are synthetic UTC day buckets: final daily results/reports become
known only at the day boundary. They are not claimed to be real final-whistle
or injury publication timestamps. Ownership detaches at synthetic noon; actual performance settles at day close.
"""
from __future__ import annotations

import asyncio
import copy
import itertools
import math
import uuid
import logging
import random
from collections import defaultdict
from contextlib import contextmanager, nullcontext
from datetime import datetime, timedelta, timezone
from dataclasses import replace
from pathlib import Path

from market.core import load_data, load_injuries, make_markets
from market.valuation import CONFIG, day_end, payout_per_share, model_parameters
from trading.payouts import payout_cents
from trading.dividends import DividendSettlement
from trading.market_contract import Player, Quote, MakerQuote, Fill, OrderResult, MarketTick, BotTrade, BotTradeSummary

ROOT = Path(__file__).resolve().parents[2]


def data_file(name):
    """A locally rebuilt file in data/ wins; otherwise use the committed data/runtime/ bundle."""
    local = ROOT / 'data' / name
    return local if local.exists() else ROOT / 'data' / 'runtime' / name

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
    supports_payouts = True
    settles_payouts_directly = True
    requires_fresh_session = True
    liquidation_scoring = True
    execution_chunk_size = 1  # exact cash/limit check before every human share

    def __init__(self, *, database=None, values=None, injuries=None, seed=2026,
                 day_seconds=60.0, tick_seconds=0.5, bot_count=30, bot_funding="fixed"):
        if not math.isfinite(day_seconds) or day_seconds <= 0:
            raise ValueError("day_seconds must be finite and positive")
        if not math.isfinite(tick_seconds) or tick_seconds <= 0:
            raise ValueError("tick_seconds must be finite and positive")
        self.replay_config = dict(database=database, values=values, injuries=injuries, seed=seed, day_seconds=day_seconds, tick_seconds=tick_seconds, bot_count=bot_count, bot_funding=bot_funding)
        self.day_seconds, self.tick_seconds = day_seconds, tick_seconds
        data, self.results = load_data(database or data_file('player_games_2024_25.sqlite'),
                                      values or data_file('starting_values_2024_25.csv'))
        self.markets = make_markets(data, seed, bot_count, bot_funding)
        self._players = [Player(pid, ALIASES.get(p['name'], f'NBA{pid}'), p['name'], p['team'], self.markets[pid].fair_cents / 100)
                         for pid, p in sorted(data.items())]
        self.ids = {p.symbol: p.player_id for p in self._players}
        if len(self.ids) != len(self._players):
            raise ValueError('Duplicate player ticker')
        self.symbols = {v: k for k, v in self.ids.items()}
        path = injuries if injuries is not None else data_file('injury_reports_2024_25.csv')
        self.injuries = load_injuries(path)
        self.day = datetime.fromisoformat(min(self.results)).replace(tzinfo=timezone.utc)
        self.end = datetime.fromisoformat(max(self.results)).replace(tzinfo=timezone.utc) + timedelta(days=1)
        self._t = self.day.timestamp()
        self.finished = False
        self._quote_cache = {}
        self._players = [replace(p, start_price=self.mark_price(p.symbol)) for p in self._players]
        self._tick_count = 0
        self.paused = False
        self.playback_rate = 1.0
        self.start_t = self._t
        self.timeline_history = {p.symbol: [self.history_point(p.symbol, self._t)] for p in self._players}
        self.rng = random.Random(seed + 9999991)
        self._orders = itertools.count(1)
        self._subscribers = []
        self.human_shares = {}  # account/player -> net shares acquired from makers
        self.human_cash_flow = 0  # net pre-fee cash paid by humans to makers
        self._initial_cash = self._market_cash()
        self.session_id = uuid.uuid4().hex
        self.settlement = None
        self._snapshots = {}
        self._settled_days = set()
        self.institutional_dividends = 0
        self.human_dividends = {}
        self.last_error = None
        self._bot_trades = []
        self._bundle_minute = int(self._t // 60) * 60
        for m in self.markets.values():
            m.trade_observer = self._record_bot

    def _record_bot(self, bot_id, pid, side, qty, cents):
        self.markets[pid].last_trade_t = self._t
        self._bot_trades.append(BotTrade(bot_id, self.symbols[pid], side, qty, cents / 100, self._t))

    def _flush_bots(self):
        if self._bot_trades:
            trades = tuple(self._bot_trades)
            self._publish(BotTradeSummary(self._bundle_minute, len(trades), sum(t.qty for t in trades), trades))
            self._bot_trades.clear()
        self._bundle_minute = int(self._t // 60) * 60

    def bind_settlement(self, db, notify_user=None, notify_public=None):
        self.settlement = DividendSettlement(db, notify_user, notify_public)

    def mark_price(self, symbol):
        q = self.quote(symbol)
        if q.bid is not None and q.ask is not None:
            return round((q.bid + q.ask) / 2, 2)
        return q.bid if q.bid is not None else q.ask if q.ask is not None else q.fair_value

    def _cutoff_day(self):
        day = self.day.date().isoformat()
        if day in self._snapshots or day in self._settled_days:
            return
        # Sparse ownership indexing avoids checking every bot against every player.
        bot_owners = defaultdict(dict)
        for bot in next(iter(self.markets.values())).bots:
            for pid, qty in bot.holdings.items():
                if qty:
                    bot_owners[pid][bot.bot_id] = qty
        records = {}
        for pid,m in self.markets.items():
            records[pid] = {'symbol':self.symbols[pid],
                'humans':{uid:qty for (uid,p),qty in self.human_shares.items() if p==pid and qty},
                'makers':[mm.shares for mm in m.makers],
                'bots':bot_owners.get(pid, {}),
                'expected':m.expected_payout() if day in m.schedule else 0.}
        cutoff_t = self.day.timestamp() + 43200
        if self.settlement:
            self.settlement.snapshot(self.session_id,day,records,cutoff_t)
        self._snapshots[day] = records
        for m in self.markets.values():
            m.valuation_time = cutoff_t
            m.detach(day)

    def _pay_day(self, day):
        if day in self._settled_days:
            return
        records = self._snapshots[day]
        scores = {pid:(sum(xs),round(sum(payout_per_share(x) for x in xs),8))
                  for pid,xs in self.results.get(day,{}).items()}
        bots = {b.bot_id:b for b in next(iter(self.markets.values())).bots}
        credits, human, totals = [], {}, {}
        for pid,r in records.items():
            rate=scores.get(pid,(0.,0.))[1]
            amounts = [(mm,payout_cents(qty,rate)) for mm,qty in zip(self.markets[pid].makers,r['makers'])]
            amounts += [(bots[bid],payout_cents(qty,rate)) for bid,qty in r['bots'].items()]
            credits.extend(amounts)
            totals[pid]=sum(amount for _,amount in amounts)
            for uid,qty in r['humans'].items():
                human[uid]=human.get(uid,0)+payout_cents(qty,rate)
        old_cash = {id(actor):(actor,actor.cash) for actor,_ in credits}
        old_total=self.institutional_dividends
        old_humans=dict(self.human_dividends)
        try:
            with self.settlement.transaction() if self.settlement else nullcontext():
                notices = self.settlement.apply(self.session_id,day,records,scores,day_end(day),totals) if self.settlement else []
                for actor,amount in credits:
                    actor.cash+=amount
                self.institutional_dividends+=sum(totals.values())
                for uid,amount in human.items():
                    self.human_dividends[uid]=self.human_dividends.get(uid,0)+amount
                self.check_ledger()
        except BaseException:
            for actor,cash in old_cash.values():
                actor.cash=cash
            self.institutional_dividends=old_total
            self.human_dividends=old_humans
            raise
        self._settled_days.add(day)
        for pid,(_,rate) in scores.items():
            self.markets[pid].cumulative_payout+=rate
        if self.settlement:
            try:
                self.settlement.notify(notices)
                if self.settlement.notify_public:
                    for pid,(score,rate) in scores.items():
                        if rate > 0:
                            self.settlement.notify_public({'type':'payout_announced','symbol':self.symbols[pid],
                                'hoop_per_share':rate,'dollars_per_share':rate,'game_score':score,
                                'reason':'Daily performance settlement','t':day_end(day)})
            except Exception:
                logging.getLogger(__name__).exception('Payout committed; UI notification failed')
        # Financial audit remains in SQLite; retain only current-day ownership in RAM.
        del self._snapshots[day]

    def players(self):
        return list(self._players)

    def market_time(self):
        return self._t

    def quote(self, symbol):
        m = self.markets[self.ids[symbol]]
        key = (m.last_cents, m.last_trade_t, m.fair_cents, m.injury_status, m.injury_reason,
               tuple((maker.cash, maker.shares) for maker in m.makers))
        cached = self._quote_cache.get(symbol)
        if cached and cached[0] == key:
            return cached[1]
        makers = tuple(MakerQuote(f'MM{i+1}', bid / 100 if bid is not None else None,
                                  ask / 100 if ask is not None else None, maker.shares)
                       for i, maker in enumerate(m.makers) for bid, ask in [m.quote(i)])
        bids = [q.bid for q in makers if q.bid is not None]
        asks = [q.ask for q in makers if q.ask is not None]
        result = Quote(symbol, max(bids) if bids else None, min(asks) if asks else None,
                     m.last_cents / 100, m.fair_cents / 100, makers,
                     round((max(bids)+min(asks))/2,2) if bids and asks else None, m.last_trade_t, m.injury_status, m.injury_reason)
        self._quote_cache[symbol] = (key, result)
        return result

    def history_point(self, symbol, t):
        q = self.quote(symbol)
        return {"t": t, "last": q.last, "fair": q.fair_value, "mid": q.quoted_price,
                "bid": q.bid, "ask": q.ask, "last_trade_t": q.last_trade_t}

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
            m.last_trade_t = self._t
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
        if self.finished or self.last_error:
            return OrderResult(oid, 'rejected', (), qty, self.last_error or 'replay has ended')
        result = self._execute(self.markets[self.ids[symbol]], symbol, side, qty, oid)
        direction = 1 if side == 'buy' else -1
        key = (account_id, self.ids[symbol])
        self.human_shares[key] = self.human_shares.get(key, 0) + direction * result.filled_qty
        self.human_cash_flow += direction * sum(round(f.price * 100) * f.qty for f in result.fills)
        return result

    def preview_order(self, *, symbol, side, qty):
        if symbol not in self.ids or side not in ('buy', 'sell') or type(qty) is not int or qty <= 0:
            return OrderResult('preview', 'rejected', (), qty, 'invalid symbol, side or quantity')
        # Closing quotes remain available for non-mutating season scoring.
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
                 dict(self.human_shares), self.human_cash_flow, m.last_trade_t)
        try:
            yield
        except BaseException:
            m.makers, m.last_cents, m.trades_today, m.volume_today, self.human_shares, self.human_cash_flow, m.last_trade_t = saved
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
        self._cutoff_day()
        self._pay_day(day)
        for pid, m in self.markets.items():
            m.valuation_time = day_end(day)
            report = self.injuries.get(day, {}).get(pid)
            if report:
                m.set_injury(report)
            else:
                m.injury_signal = 0.0
            scores = self.results.get(day, {}).get(pid, [])
            m.reveal(scores)
            if scores:
                m.last_game_score = sum(scores)/len(scores)
                m.last_game_day = day
            if scores and m.injury_factor < 1:
                m.injury_factor = 1.0
                m.availability_probability = CONFIG.healthy_availability
                m.injury_status, m.injury_reason = 'Available', 'Played in official box score'
                m.update_fair()
            self.timeline_history[self.symbols[pid]].append(self.history_point(self.symbols[pid], day_end(day)))
            m.price_history.append(m.last_cents)
            m.prior_close = m.last_cents
            m.trades_today.clear()
            m.volume_today = 0
            m.bot_trades_today.clear()
        for bot in next(iter(self.markets.values())).bots:
            bot.orders_today = 0
        self.day += timedelta(days=1)

    def step(self, target_t=None):
        if self.finished:
            return
        self._t = min(self.end.timestamp(), self._t + 86400 * self.tick_seconds / self.day_seconds, target_t if target_t is not None else float("inf"))
        if int(self._t // 60) * 60 != self._bundle_minute:
            self._flush_bots()
        while self.day.timestamp() + 86400 <= self._t:
            self._close_day()
        if self._t >= self.day.timestamp() + 43200 and self.day < self.end:
            self._cutoff_day()
        self.finished = self._t >= self.end.timestamp()
        if not self.finished:
            for m in self.rng.sample(list(self.markets.values()), min(12, len(self.markets))):
                m.bot_round(bool(m.game_signal))
        if self.finished:
            self._flush_bots()
        self._tick_count += 1
        # Full conservation is also checked transactionally at each day-close payout.
        # Repeating the complete 580-player audit every tick dominated fast replay.
        if self.finished or self._tick_count % 120 == 0:
            self.check_ledger()
        self._publish(MarketTick(self._t, {p.symbol: self.quote(p.symbol) for p in self._players}))

    async def run(self):
        while True:
            await asyncio.sleep(self.tick_seconds / self.playback_rate)
            if self.paused or self.finished:
                continue
            try:
                self.step()
                self.last_error = None
            except Exception as exc:
                self.last_error = f"Replay settlement paused: {type(exc).__name__}"
                logging.getLogger(__name__).exception('Replay step failed; retrying before allowing new orders')

    def _market_cash(self):
        return (sum(maker.cash for m in self.markets.values() for maker in m.makers)
                + sum(b.cash for b in next(iter(self.markets.values())).bots))

    def check_ledger(self):
        assert self._market_cash() == self._initial_cash + self.human_cash_flow + self.institutional_dividends
        human_totals = {}
        for (_, pid), qty in self.human_shares.items():
            human_totals[pid] = human_totals.get(pid, 0) + qty
        bot_totals = defaultdict(int)
        for bot in next(iter(self.markets.values())).bots:
            assert bot.cash >= 0
            for pid, qty in bot.holdings.items():
                assert pid in self.markets and qty >= 0
                bot_totals[pid] += qty
        for pid, m in self.markets.items():
            assert all(mm.cash >= 0 and mm.shares >= 0 for mm in m.makers)
            assert sum(mm.shares for mm in m.makers) + bot_totals[pid] + human_totals.get(pid, 0) == m.initial_shares
