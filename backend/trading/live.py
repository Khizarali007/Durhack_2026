"""P2-13: live messages pushed to players over the WebSocket at /trading/ws.

The hub keeps one queue per open connection.
- Private messages go only to that player's connections.
- Public messages (bot bundles settling on Solana) go to everyone, including
  spectator screens that connect without a token.

Every message is flat JSON with a ``type``:

- ``hello``: once, on connect
- ``fill``: an order of yours filled (market, or a limit/stop that fired)
- ``open_order``: one of your limit/stop orders was placed, fired, filled, cancelled or failed
- ``receipt``: your order's Solana receipt confirmed or failed, with the Explorer link
- ``bot_bundle``: a minute of bot trades settled on Solana (public)
- ``payout`` / ``payout_announced``: performance payouts (P2-22)
- ``margin``: your margin status changed: warning, margin_call, liquidated or ok (P2-15)
- ``pong``: reply to a ``ping`` you send

Producers (the order route, the open-order watcher, the receipt worker) call
``publish_user`` / ``publish_public`` from the event loop. Calls from a worker
thread are handed to the loop safely.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Callable

from .chain.config import explorer_url
from .db import Database
from .money import to_hoop

QUEUE_SIZE = 200


class LiveHub:
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._by_user: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._everyone: set[asyncio.Queue] = set()

    def bind_loop(self) -> None:
        """Call once from the running event loop (app startup)."""
        self._loop = asyncio.get_running_loop()

    def subscribe(self, user_id: str | None) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._everyone.add(queue)
        if user_id:
            self._by_user[user_id].add(queue)
        return queue

    def unsubscribe(self, user_id: str | None, queue: asyncio.Queue) -> None:
        self._everyone.discard(queue)
        if user_id:
            self._by_user[user_id].discard(queue)
            if not self._by_user[user_id]:
                del self._by_user[user_id]

    def connections(self) -> int:
        return len(self._everyone)

    def publish_user(self, user_id: str, message: dict) -> None:
        self._dispatch(lambda: [self._put(q, message) for q in list(self._by_user.get(user_id, ()))])

    def publish_public(self, message: dict) -> None:
        self._dispatch(lambda: [self._put(q, message) for q in list(self._everyone)])

    def _dispatch(self, deliver: Callable[[], object]) -> None:
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if self._loop is None or running is self._loop:
            deliver()
        else:  # from a worker thread: hand it to the event loop
            self._loop.call_soon_threadsafe(deliver)

    @staticmethod
    def _put(queue: asyncio.Queue, message: dict) -> None:
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            pass  # a stuck client misses messages rather than slowing everyone down


# --- Message builders ------------------------------------------------------------

def fill_message(outcome, fill_reason: str = "market") -> dict:
    """An OrderOutcome from orders.place_market_order."""
    return {
        "type": "fill", "order_id": outcome.order_id, "reason": fill_reason, "status": outcome.status,
        "symbol": outcome.symbol, "side": outcome.side, "requested_qty": outcome.requested_qty,
        "filled_qty": outcome.filled_qty, "average_price": round(outcome.average_price_cents / 100, 4),
        "total_fee": to_hoop(outcome.total_fee_cents), "cash": to_hoop(outcome.cash_cents_after),
        "position_qty": outcome.position_qty_after,
        "slippage": round(outcome.slippage_cents / 100, 4) if outcome.slippage_cents is not None else None,
        "receipt_status": "pending", "t": outcome.fills[0].t if outcome.fills else None,
    }


def open_order_message(order, event: str) -> dict:
    """An OpenOrder from open_orders. ``event``: placed, fired, filled, cancelled or failed."""
    return {
        "type": "open_order", "event": event, "order_id": order.order_id, "symbol": order.symbol,
        "side": order.side, "order_type": order.order_type, "price": to_hoop(order.price_cents),
        "qty": order.qty, "filled_qty": order.filled_qty, "remaining_qty": order.remaining_qty,
        "status": order.status, "reason": order.reason, "last_fill_order_id": order.last_fill_order_id,
    }


def receipt_message(order_id: str, status: str, signature: str | None, confirm_ms: int | None) -> dict:
    return {"type": "receipt", "order_id": order_id, "status": status, "signature": signature,
            "explorer_url": explorer_url("tx", signature) if signature else None, "confirm_ms": confirm_ms}


def bundle_message(bundle_id: str, count: int, volume: int, minute_t: float, status: str,
                   signature: str | None, confirm_ms: int | None) -> dict:
    return {"type": "bot_bundle", "bundle_id": bundle_id, "trade_count": count, "total_volume": volume,
            "minute_t": minute_t, "status": status, "signature": signature,
            "explorer_url": explorer_url("tx", signature) if signature else None, "confirm_ms": confirm_ms}


def receipt_notifier(db: Database, hub: LiveHub) -> Callable:
    """Callback for the receipt worker: tells the right people when a receipt confirms or fails."""

    def notify(job, status: str, signature: str | None, confirm_ms: int | None) -> None:
        if job.kind == "order":
            with db.lock:
                row = db.conn.execute("SELECT user_id FROM trades WHERE order_id = ? LIMIT 1", (job.id,)).fetchone()
            if row:
                hub.publish_user(row[0], receipt_message(job.id, status, signature, confirm_ms))
        else:
            with db.lock:
                row = db.conn.execute(
                    "SELECT trade_count, total_volume, minute_t FROM bot_bundles WHERE bundle_id = ?", (job.id,)
                ).fetchone()
            if row:
                hub.publish_public(bundle_message(job.id, row[0], row[1], row[2], status, signature, confirm_ms))

    return notify
