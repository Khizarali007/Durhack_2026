"""P2-22: performance payouts. Holding a player's shares earns HOOP when they perform.

This is why a share is worth something: hold for the payouts, or sell when the
price is good.

When the engine announces ``PerformancePayout(t, symbol, hoop_per_share, game_score, reason)``,
every human holder of that player is paid ``qty x hoop_per_share``, rounded to
the cent per holder, and each payment is recorded in ``payouts``. Short sellers
(negative qty, P2-14) pay the same amount instead, like dividends on a real
stock. It all happens in one database transaction per announcement.

Person 1's engine pays its own bots and makers. This only handles human players.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from .db import Database
from .market_contract import MarketEngine, PerformancePayout
from .money import to_hoop

log = logging.getLogger("trading.payouts")


@dataclass(frozen=True)
class PaidOut:
    payout_id: str
    user_id: str
    symbol: str
    qty_held: int
    hoop_per_share: float
    amount_cents: int
    cash_cents_after: int


def payout_cents(qty: int, hoop_per_share: float) -> int:
    return int((Decimal(qty) * Decimal(str(hoop_per_share)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def apply_payout(db: Database, event: PerformancePayout) -> list[PaidOut]:
    """Pay (or charge) every human holder of ``event.symbol``. Returns one entry per holder."""
    if event.hoop_per_share <= 0:
        return []
    paid: list[PaidOut] = []
    with db.lock, db.conn:
        holders = db.conn.execute(
            "SELECT p.user_id, p.qty, u.cash_cents FROM positions p JOIN users u ON u.user_id = p.user_id"
            " WHERE p.symbol = ? AND p.qty != 0 ORDER BY p.user_id", (event.symbol,)
        ).fetchall()
        now = time.time()
        for user_id, qty, cash in holders:
            amount = payout_cents(qty, event.hoop_per_share)
            if amount == 0:
                continue
            payout_id = f"po_{secrets.token_hex(6)}"
            db.conn.execute(
                "INSERT INTO payouts (payout_id, user_id, symbol, qty_held, hoop_per_share, amount_cents,"
                " game_score, reason, t, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (payout_id, user_id, event.symbol, qty, event.hoop_per_share, amount, event.game_score,
                 event.reason, event.t, now),
            )
            db.conn.execute("UPDATE users SET cash_cents = cash_cents + ? WHERE user_id = ?", (amount, user_id))
            paid.append(PaidOut(payout_id, user_id, event.symbol, qty, event.hoop_per_share, amount, cash + amount))
    return paid


def payout_message(event: PerformancePayout, paid: PaidOut) -> dict:
    """Live update for one holder (P2-13 WebSocket)."""
    return {"type": "payout", "payout_id": paid.payout_id, "symbol": paid.symbol, "qty_held": paid.qty_held,
            "hoop_per_share": paid.hoop_per_share, "amount": to_hoop(paid.amount_cents),
            "cash": to_hoop(paid.cash_cents_after), "game_score": event.game_score, "reason": event.reason,
            "t": event.t}


def announcement_message(event: PerformancePayout) -> dict:
    """Public: a player's performance paid out (for a ticker everyone sees)."""
    return {"type": "payout_announced", "symbol": event.symbol, "hoop_per_share": event.hoop_per_share,
            "game_score": event.game_score, "reason": event.reason, "t": event.t}


class PayoutProcessor:
    """Listens for PerformancePayout events and pays human holders."""

    def __init__(self, db: Database, market: MarketEngine,
                 notify_user: Callable[[str, dict], None] | None = None,
                 notify_public: Callable[[dict], None] | None = None) -> None:
        self.db = db
        self.market = market
        self.notify_user = notify_user
        self.notify_public = notify_public
        self._queue = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._queue = self.market.subscribe()
        self._task = asyncio.create_task(self._run(), name="payout-processor")

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
            if not isinstance(event, PerformancePayout):
                continue
            try:
                self.handle(event)
            except Exception:
                log.exception("paying out %s failed", event.symbol)

    def handle(self, event: PerformancePayout) -> list[PaidOut]:
        paid = apply_payout(self.db, event)
        if self.notify_public and event.hoop_per_share > 0:
            self.notify_public(announcement_message(event))
        if self.notify_user:
            for p in paid:
                self.notify_user(p.user_id, payout_message(event, p))
        return paid
