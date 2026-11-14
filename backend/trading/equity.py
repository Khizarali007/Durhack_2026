"""P2-16: equity history, for the report card's return and max drawdown.

**What's recorded:** every market minute (10 ticks = 5 real seconds), one row
per active account in ``equity_snapshots``: market time, equity, cash,
positions value and the profit/loss baseline. Shares are marked at the last
price, exactly like the portfolio.

- "Active" means the account has made a trade or holds a position. Untouched
  guests sit flat at their starting cash, so they're skipped.
- A mission reset or restore (P2-21) records a point straight away, so a
  mission's window starts with its true starting equity.

**Max drawdown** is the biggest fall from a running peak to a later low, in
HOOP and as a % of that peak. ``max_drawdown`` computes it, so the API, the
report card and Person 4's evaluators all agree.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections import defaultdict
from dataclasses import dataclass

from .db import STARTING_CASH_CENTS, Database
from .market_contract import MarketEngine, MarketTick
from .money import to_cents

log = logging.getLogger("trading.equity")

INTERVAL_S = 60.0   # market seconds between snapshots: one market minute


@dataclass(frozen=True)
class EquityPoint:
    t: float                     # market time, epoch seconds
    equity_cents: int
    cash_cents: int
    positions_value_cents: int
    baseline_cents: int          # what profit/loss is measured from (starting cash, or a mission's start)

    @property
    def total_pnl_cents(self) -> int:
        return self.equity_cents - self.baseline_cents


@dataclass(frozen=True)
class Drawdown:
    amount_cents: int            # peak equity - the lowest equity after it (0 if it never fell)
    pct: float                   # amount / peak x 100
    peak_t: float | None
    trough_t: float | None
    peak_cents: int | None       # highest equity in the window


def max_drawdown(points: list[tuple[float, int]]) -> Drawdown:
    """``points``: (t, equity_cents), oldest first. The biggest peak-to-later-low fall."""
    best = Drawdown(0, 0.0, None, None, None)
    peak_t, peak = None, None
    highest = None
    for t, equity in points:
        highest = equity if highest is None else max(highest, equity)
        if peak is None or equity > peak:
            peak_t, peak = t, equity
            continue
        fall = peak - equity
        if fall > best.amount_cents:
            best = Drawdown(fall, round(100 * fall / peak, 2) if peak > 0 else 0.0, peak_t, t, None)
    return Drawdown(best.amount_cents, best.pct, best.peak_t, best.trough_t, highest)


def snapshot_equity(db: Database, market: MarketEngine, t: float, user_ids: list[str] | None = None) -> int:
    """Record equity at market time ``t`` for ``user_ids`` (default: every active account).
    Returns the number of rows written. One query per table, so it stays cheap with many players."""
    with db.lock:
        if user_ids is None:
            users = db.conn.execute(
                "SELECT user_id, cash_cents, baseline_cents FROM users WHERE user_id IN"
                " (SELECT user_id FROM positions UNION SELECT user_id FROM trades)").fetchall()
        else:
            marks = ",".join("?" * len(user_ids))
            users = db.conn.execute(
                f"SELECT user_id, cash_cents, baseline_cents FROM users WHERE user_id IN ({marks})",
                user_ids).fetchall()
        positions = db.conn.execute("SELECT user_id, symbol, qty FROM positions").fetchall()
    if not users:
        return 0
    prices: dict[str, int] = {}
    value: dict[str, int] = defaultdict(int)
    for user_id, symbol, qty in positions:
        if symbol not in prices:
            prices[symbol] = to_cents(market.last_price(symbol))
        value[user_id] += qty * prices[symbol]
    rows = []
    for user_id, cash, baseline in users:
        v = value.get(user_id, 0)
        rows.append((user_id, t, cash + v, cash, v, baseline if baseline is not None else STARTING_CASH_CENTS))
    with db.lock, db.conn:
        db.conn.executemany(
            "INSERT OR REPLACE INTO equity_snapshots (user_id, t, equity_cents, cash_cents,"
            " positions_value_cents, baseline_cents) VALUES (?, ?, ?, ?, ?, ?)", rows)
    return len(rows)


def equity_history(db: Database, user_id: str, *, since_t: float | None = None,
                   limit: int | None = None) -> list[EquityPoint]:
    """Recorded points, oldest first. ``since_t`` is inclusive; ``limit`` keeps the most recent N."""
    sql = "SELECT t, equity_cents, cash_cents, positions_value_cents, baseline_cents FROM equity_snapshots" \
          " WHERE user_id = ?"
    params: list = [user_id]
    if since_t is not None:
        sql += " AND t >= ?"
        params.append(since_t)
    sql += " ORDER BY t DESC"
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    with db.lock:
        rows = db.conn.execute(sql, params).fetchall()
    return [EquityPoint(*r) for r in reversed(rows)]


class EquityRecorder:
    """Snapshots every active account once per market minute (P2-16)."""

    def __init__(self, db: Database, market: MarketEngine, interval_s: float = INTERVAL_S) -> None:
        self.db = db
        self.market = market
        self.interval_s = interval_s
        self._last_bucket: int | None = None
        self._queue = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._queue = self.market.subscribe()
        self._task = asyncio.create_task(self._run(), name="equity-recorder")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        if self._queue is not None:
            self.market.unsubscribe(self._queue)

    async def _run(self) -> None:
        while True:
            event = await self._queue.get()
            if isinstance(event, MarketTick):
                try:
                    self.on_tick(event.t)
                except Exception:
                    log.exception("recording equity failed")

    def on_tick(self, t: float) -> int:
        """Record if ``t`` is in a new interval (the first tick of each market minute). Returns rows written."""
        bucket = int(t // self.interval_s)
        if bucket == self._last_bucket:
            return 0
        self._last_bucket = bucket
        return snapshot_equity(self.db, self.market, t)
