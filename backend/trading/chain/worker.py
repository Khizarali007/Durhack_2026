"""Background worker that writes trade receipts to Solana without ever blocking a trade.

1. ``POST /trading/orders`` fills the trade, saves it with
   ``receipt_status='pending'`` and calls ``enqueue(order_id)``. The player gets
   their fill straight away.
2. **Senders** (2 tasks) take order ids off a queue, build the memo and submit
   it. The signature is saved at once, still ``pending``.
3. **One checker** asks devnet about every in-flight signature in a single
   request, about twice a second.
   - **Confirmed:** every fill of that order becomes ``confirmed``, with the
     signature and the time from send to confirmation.
   - **Rejected by the chain, or never seen within 60 s:** sent again.
4. A send that fails is retried with backoff (1, 2, 4, 8 s by default). After 5
   attempts the order is marked ``failed``, and the trade itself still stands.
   A receipt is only re-sent when the earlier attempt verifiably didn't land,
   never because a status check hiccuped, so it can't appear on-chain twice.
5. On startup, ``pending`` orders are picked up again. Ones that already have a
   signature are checked, not re-sent.

Set ``SOLANA_RECEIPTS=off`` to run without Solana (trades stay ``pending``).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time
from dataclasses import dataclass

from ..db import Database
from .receipts import DevnetSender, FillLine, ReceiptSender, build_trade_memo
from .wallets import ensure_wallet, wallet_keypair

log = logging.getLogger("trading.receipts")

CHECK_INTERVAL_S = 0.4
LANDING_TIMEOUT_S = 60.0   # a blockhash expires after ~60-90 s, so resending after this can't double up


def receipts_enabled() -> bool:
    return os.environ.get("SOLANA_RECEIPTS", "on").lower() not in ("off", "0", "false", "no")


def default_sender_factory() -> ReceiptSender:
    return DevnetSender()


# Tests replace this with a fake sender.
sender_factory = default_sender_factory


@dataclass
class _InFlight:
    order_id: str
    sent_at: float      # time.monotonic() when the send started
    attempt: int


class ReceiptWorker:
    def __init__(self, db: Database, sender: ReceiptSender, *, senders: int = 2, max_attempts: int = 5,
                 base_delay_s: float | None = None, check_interval_s: float = CHECK_INTERVAL_S,
                 landing_timeout_s: float = LANDING_TIMEOUT_S) -> None:
        self.db = db
        self.sender = sender
        self.senders = senders
        self.max_attempts = max_attempts
        if base_delay_s is None:
            base_delay_s = float(os.environ.get("SOLANA_RECEIPT_RETRY_BASE_S", "1"))
        self.base_delay_s = base_delay_s
        self.check_interval_s = check_interval_s
        self.landing_timeout_s = landing_timeout_s
        self._queue: asyncio.Queue[tuple[str, int]] = asyncio.Queue()
        self._in_flight: dict[str, _InFlight] = {}   # signature -> details
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        self._tasks = [asyncio.create_task(self._send_loop(), name=f"receipt-sender-{i}")
                       for i in range(self.senders)]
        self._tasks.append(asyncio.create_task(self._check_loop(), name="receipt-checker"))
        for order_id, signature in self._pending_orders():
            if signature:
                self._in_flight[signature] = _InFlight(order_id, time.monotonic(), 1)
            else:
                self.enqueue(order_id)

    def enqueue(self, order_id: str, attempt: int = 1) -> None:
        self._queue.put_nowait((order_id, attempt))

    async def wait_idle(self, timeout_s: float = 10.0) -> None:
        """Wait until nothing is queued or in flight (used by tests)."""
        deadline = time.monotonic() + timeout_s
        while self._queue.qsize() or self._queue._unfinished_tasks or self._in_flight:  # noqa: SLF001
            if time.monotonic() > deadline:
                raise TimeoutError("receipts still in progress")
            await asyncio.sleep(0.01)

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await self.sender.close()

    # --- Sending ----------------------------------------------------------------------

    async def _send_loop(self) -> None:
        while True:
            order_id, attempt = await self._queue.get()
            try:
                await self._send(order_id, attempt)
            except Exception:  # never let one bad receipt kill the worker
                log.exception("receipt for %s crashed", order_id)
            finally:
                self._queue.task_done()

    async def _send(self, order_id: str, attempt: int) -> None:
        with self.db.lock:
            rows = self.db.conn.execute(
                "SELECT user_id, symbol, side, qty, price_cents, fee_cents, t, receipt_status"
                " FROM trades WHERE order_id = ? ORDER BY rowid", (order_id,)
            ).fetchall()
        if not rows or rows[0]["receipt_status"] != "pending":
            return  # unknown, or already handled
        user_id = rows[0]["user_id"]
        memo = build_trade_memo(
            order_id=order_id, wallet=ensure_wallet(self.db, user_id), symbol=rows[0]["symbol"],
            side=rows[0]["side"], fills=[FillLine(r["qty"], r["price_cents"], r["fee_cents"]) for r in rows],
            t=rows[0]["t"],
        )
        cosigner = wallet_keypair(self.db, user_id)

        while True:
            started = time.monotonic()
            try:
                signature = await self.sender.send(memo, cosigner)
            except Exception as exc:
                if attempt >= self.max_attempts:
                    log.warning("receipt for %s failed after %d attempts: %r", order_id, attempt, exc)
                    self._set(order_id, "failed", None, None)
                    return
                await asyncio.sleep(self.base_delay_s * 2 ** (attempt - 1))
                attempt += 1
                continue
            self._set(order_id, "pending", signature, None)   # saved before we wait for it
            self._in_flight[signature] = _InFlight(order_id, started, attempt)
            return

    # --- Checking ---------------------------------------------------------------------

    async def _check_loop(self) -> None:
        while True:
            await asyncio.sleep(self.check_interval_s)
            if not self._in_flight:
                continue
            signatures = list(self._in_flight)
            try:
                statuses = await self.sender.statuses(signatures)
            except Exception as exc:  # devnet busy or rate limiting: just look again next round
                log.debug("status check failed: %r", exc)
                continue
            now = time.monotonic()
            for signature in signatures:
                flight = self._in_flight.get(signature)
                if flight is None:
                    continue
                status = statuses.get(signature)
                if status == "confirmed":
                    del self._in_flight[signature]
                    self._set(flight.order_id, "confirmed", signature, round((now - flight.sent_at) * 1000))
                elif status == "failed" or now - flight.sent_at > self.landing_timeout_s:
                    del self._in_flight[signature]
                    self._retry_or_fail(flight)

    def _retry_or_fail(self, flight: _InFlight) -> None:
        if flight.attempt >= self.max_attempts:
            log.warning("receipt for %s never landed after %d attempts", flight.order_id, flight.attempt)
            self._set(flight.order_id, "failed", None, None)
        else:
            self._set(flight.order_id, "pending", None, None)
            self.enqueue(flight.order_id, flight.attempt + 1)

    # --- Database ---------------------------------------------------------------------

    def _pending_orders(self) -> list[tuple[str, str | None]]:
        with self.db.lock:
            rows = self.db.conn.execute(
                "SELECT order_id, max(receipt_signature) FROM trades WHERE receipt_status = 'pending'"
                " GROUP BY order_id ORDER BY min(rowid)"
            ).fetchall()
        return [(r[0], r[1]) for r in rows]

    def _set(self, order_id: str, status: str, signature: str | None, confirm_ms: int | None) -> None:
        with self.db.lock, self.db.conn:
            self.db.conn.execute(
                "UPDATE trades SET receipt_status = ?, receipt_signature = ?, receipt_confirm_ms = ?"
                " WHERE order_id = ?", (status, signature, confirm_ms, order_id),
            )
