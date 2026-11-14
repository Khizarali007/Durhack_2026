"""P2-17: the off-chain leaderboard. Ranks players by equity, straight from our database.

It never touches Solana, so it always works, even when devnet is down. P2-18
(Level 1) will add a leaderboard read from on-chain accounts; the frontend
falls back to this one if that read fails.

**Who's on it:** every account that has traded or holds a position. Untouched
guests (all on 100,000) are left off.

**Players in a mission** (P2-21) are ranked on their *real* account, the one
saved when the mission reset them, valued at today's prices. Mission sandboxes
never show up on the leaderboard.

**Ranking:** equity (cash + positions at the last price), highest first. Ties
go to whoever joined first. ``return_pct`` is measured from each account's own
starting point (100,000 for everyone outside missions).

**Live:** ``LeaderboardBroadcaster`` pushes the top 10 to everyone over the
WebSocket (public ``leaderboard`` message) once per market minute, only when
it changed.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass

from .db import STARTING_CASH_CENTS, Database
from .market_contract import MarketEngine, MarketTick
from .money import to_cents, to_hoop

log = logging.getLogger("trading.leaderboard")

TOP_N_LIVE = 10
BROADCAST_INTERVAL_S = 60.0   # market seconds (one market minute = 5 real seconds)


@dataclass(frozen=True)
class Standing:
    rank: int
    user_id: str
    name: str                  # username, or "Guest 4085" (from the end of the user id)
    is_guest: bool
    equity_cents: int
    baseline_cents: int
    orders: int                # orders that traded
    receipts_confirmed: int    # of those, how many have a confirmed Solana receipt
    wallet_address: str | None
    in_mission: bool           # ranked on the real account saved before the mission

    @property
    def total_pnl_cents(self) -> int:
        return self.equity_cents - self.baseline_cents

    @property
    def return_pct(self) -> float:
        return round(100 * self.total_pnl_cents / self.baseline_cents, 2) if self.baseline_cents > 0 else 0.0


def display_name(username: str | None, user_id: str) -> str:
    return username or f"Guest {user_id[-4:]}"


def standings(db: Database, market: MarketEngine) -> list[Standing]:
    """Every active account, ranked. A handful of queries in total, however many players there are."""
    with db.lock:
        users = db.conn.execute(
            "SELECT u.user_id, u.username, u.is_guest, u.cash_cents, u.baseline_cents, u.created_at,"
            " s.cash_cents AS snap_cash, s.positions_json AS snap_positions, s.baseline_cents AS snap_baseline,"
            " w.address FROM users u"
            " LEFT JOIN account_snapshots s ON s.user_id = u.user_id"
            " LEFT JOIN wallets w ON w.user_id = u.user_id"
            " WHERE u.user_id IN (SELECT user_id FROM positions UNION SELECT user_id FROM trades)").fetchall()
        positions = db.conn.execute("SELECT user_id, symbol, qty FROM positions").fetchall()
        activity = db.conn.execute(
            "SELECT user_id, count(DISTINCT order_id),"
            " count(DISTINCT CASE WHEN receipt_status = 'confirmed' THEN order_id END)"
            " FROM trades GROUP BY user_id").fetchall()

    prices: dict[str, int] = {}

    def price(symbol: str) -> int:
        if symbol not in prices:
            prices[symbol] = to_cents(market.last_price(symbol))
        return prices[symbol]

    live_value: dict[str, int] = defaultdict(int)
    for user_id, symbol, qty in positions:
        live_value[user_id] += qty * price(symbol)
    counts = {user_id: (orders, confirmed) for user_id, orders, confirmed in activity}

    rows = []
    for u in users:
        in_mission = u["snap_cash"] is not None
        if in_mission:  # value the real account they'll get back, not the mission sandbox
            saved = json.loads(u["snap_positions"])
            equity = u["snap_cash"] + sum(qty * price(symbol) for symbol, qty, _ in saved)
            baseline = u["snap_baseline"]
        else:
            equity = u["cash_cents"] + live_value.get(u["user_id"], 0)
            baseline = u["baseline_cents"] if u["baseline_cents"] is not None else STARTING_CASH_CENTS
        orders, confirmed = counts.get(u["user_id"], (0, 0))
        rows.append((equity, u["created_at"], u, baseline, orders, confirmed, in_mission))
    rows.sort(key=lambda r: (-r[0], r[1]))
    return [
        Standing(rank, u["user_id"], display_name(u["username"], u["user_id"]), bool(u["is_guest"]), equity,
                 baseline, orders, confirmed, u["address"], in_mission)
        for rank, (equity, _, u, baseline, orders, confirmed, in_mission) in enumerate(rows, start=1)
    ]


def standing_dict(s: Standing) -> dict:
    """The JSON shape shared by the REST endpoint and the live message."""
    return {"rank": s.rank, "user_id": s.user_id, "name": s.name, "is_guest": s.is_guest,
            "equity": to_hoop(s.equity_cents), "total_pnl": to_hoop(s.total_pnl_cents), "return_pct": s.return_pct,
            "orders": s.orders, "receipts_confirmed": s.receipts_confirmed, "wallet_address": s.wallet_address,
            "in_mission": s.in_mission, "chain_verified": False}


def leaderboard_message(ranked: list[Standing], t: float, top_n: int = TOP_N_LIVE) -> dict:
    return {"type": "leaderboard", "t": t, "total_players": len(ranked), "source": "off-chain",
            "entries": [standing_dict(s) for s in ranked[:top_n]]}


class LeaderboardBroadcaster:
    """Pushes the top 10 to everyone once per market minute, when it changed (P2-17)."""

    def __init__(self, db: Database, market: MarketEngine, publish: Callable[[dict], None],
                 interval_s: float = BROADCAST_INTERVAL_S) -> None:
        self.db = db
        self.market = market
        self.publish = publish
        self.interval_s = interval_s
        self._last_bucket: int | None = None
        self._last_sent: list | None = None
        self._queue = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._queue = self.market.subscribe()
        self._task = asyncio.create_task(self._run(), name="leaderboard")

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
                    log.exception("leaderboard update failed")

    def on_tick(self, t: float) -> dict | None:
        """Publish on the first tick of each interval if the top N changed. Returns what was sent."""
        bucket = int(t // self.interval_s)
        if bucket == self._last_bucket:
            return None
        self._last_bucket = bucket
        message = leaderboard_message(standings(self.db, self.market), t)
        fingerprint = [(e["user_id"], e["equity"]) for e in message["entries"]]
        if fingerprint == self._last_sent:
            return None
        self._last_sent = fingerprint
        self.publish(message)
        return message
