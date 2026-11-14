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

There are two kinds of job, sharing the same senders, checker and rate limiter:
- ``order``: a human order's receipt (rows in ``trades``), co-signed by the player.
- ``bundle``: a market minute of bot trades (a row in ``bot_bundles``, P2-10),
  signed by the fee payer alone.

Set ``SOLANA_RECEIPTS=off`` to run without Solana (trades stay ``pending``).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time
from dataclasses import dataclass

from typing import Literal

from solders.keypair import Keypair

from ..db import Database
from .bot_bundles import bundle_lines
from .receipts import DevnetSender, FillLine, ReceiptSender, build_bot_bundle_memo, build_trade_memo
from .wallets import ensure_wallet, wallet_keypair

JobKind = Literal["order", "bundle"]

log = logging.getLogger("trading.receipts")

# The public devnet server allows only about 10 getSignatureStatuses calls per
# 10 s per user (x-ratelimit-method-limit: 10). Polling every 0.4 s got
# rate-limited forever once anything was in flight, so check every 2 s and
# back off further on errors. A dedicated RPC (SOLANA_RPC_URL) can go faster.
CHECK_INTERVAL_S = 2.0   # override with SOLANA_STATUS_INTERVAL_S
MAX_CHECK_INTERVAL_S = 16.0
LANDING_TIMEOUT_S = 60.0   # a blockhash expires after ~60-90 s, so resending after this can't double up


def receipts_enabled() -> bool:
    return os.environ.get("SOLANA_RECEIPTS", "on").lower() not in ("off", "0", "false", "no")


def default_sender_factory() -> ReceiptSender:
    return DevnetSender()


# Tests replace this with a fake sender.
sender_factory = default_sender_factory


@dataclass(frozen=True)
class Job:
    kind: JobKind
    id: str             # order_id or bundle_id


@dataclass
class _InFlight:
    job: Job
    sent_at: float      # time.monotonic() when the send started
    attempt: int


class ReceiptWorker:
    def __init__(self, db: Database, sender: ReceiptSender, *, senders: int = 2, max_attempts: int = 5,
                 base_delay_s: float | None = None, check_interval_s: float | None = None,
                 landing_timeout_s: float = LANDING_TIMEOUT_S, notify=None) -> None:
        self.db = db
        self.sender = sender
        self.notify = notify   # notify(job, status, signature, confirm_ms) when a receipt confirms or fails
        self.senders = senders
        self.max_attempts = max_attempts
        if base_delay_s is None:
            base_delay_s = float(os.environ.get("SOLANA_RECEIPT_RETRY_BASE_S", "1"))
        self.base_delay_s = base_delay_s
        if check_interval_s is None:
            check_interval_s = float(os.environ.get("SOLANA_STATUS_INTERVAL_S", CHECK_INTERVAL_S))
        self.check_interval_s = check_interval_s
        self.landing_timeout_s = landing_timeout_s
        self._queue: asyncio.Queue[tuple[Job, int]] = asyncio.Queue()
        self._in_flight: dict[str, _InFlight] = {}   # signature -> details
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        self._tasks = [asyncio.create_task(self._send_loop(), name=f"receipt-sender-{i}")
                       for i in range(self.senders)]
        self._tasks.append(asyncio.create_task(self._check_loop(), name="receipt-checker"))
        for job, signature in self._pending_jobs():
            if signature:
                self._in_flight[signature] = _InFlight(job, time.monotonic(), 1)
            else:
                self._queue.put_nowait((job, 1))

    def enqueue(self, order_id: str) -> None:
        """Queue the receipt for a human order."""
        self._queue.put_nowait((Job("order", order_id), 1))

    def enqueue_bundle(self, bundle_id: str) -> None:
        """Queue the receipt for a minute of bot trades (P2-10)."""
        self._queue.put_nowait((Job("bundle", bundle_id), 1))

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
            job, attempt = await self._queue.get()
            try:
                await self._send(job, attempt)
            except Exception:  # never let one bad receipt kill the worker
                log.exception("receipt for %s %s crashed", job.kind, job.id)
            finally:
                self._queue.task_done()

    def _build(self, job: Job) -> tuple[bytes, Keypair | None] | None:
        """The memo and co-signer for a job, or None if it's unknown or already handled."""
        if job.kind == "order":
            with self.db.lock:
                rows = self.db.conn.execute(
                    "SELECT user_id, symbol, side, qty, price_cents, fee_cents, t, receipt_status"
                    " FROM trades WHERE order_id = ? ORDER BY rowid", (job.id,)
                ).fetchall()
            if not rows or rows[0]["receipt_status"] != "pending":
                return None
            user_id = rows[0]["user_id"]
            memo = build_trade_memo(
                order_id=job.id, wallet=ensure_wallet(self.db, user_id), symbol=rows[0]["symbol"],
                side=rows[0]["side"], fills=[FillLine(r["qty"], r["price_cents"], r["fee_cents"]) for r in rows],
                t=rows[0]["t"],
            )
            return memo, wallet_keypair(self.db, user_id)

        with self.db.lock:
            row = self.db.conn.execute(
                "SELECT minute_t, trade_count, total_volume, trades_hash, receipt_status"
                " FROM bot_bundles WHERE bundle_id = ?", (job.id,)
            ).fetchone()
        if row is None or row["receipt_status"] != "pending":
            return None
        memo = build_bot_bundle_memo(bundle_id=job.id, minute_t=row["minute_t"], count=row["trade_count"],
                                     volume=row["total_volume"], trades_hash=row["trades_hash"])
        return memo, None

    async def _send(self, job: Job, attempt: int) -> None:
        built = self._build(job)
        if built is None:
            return
        memo, cosigner = built
        while True:
            started = time.monotonic()
            try:
                signature = await self.sender.send(memo, cosigner)
            except Exception as exc:
                if attempt >= self.max_attempts:
                    log.warning("receipt for %s %s failed after %d attempts: %r", job.kind, job.id, attempt, exc)
                    self._set(job, "failed", None, None)
                    return
                await asyncio.sleep(self.base_delay_s * 2 ** (attempt - 1))
                attempt += 1
                continue
            self._set(job, "pending", signature, None)   # saved before we wait for it
            self._in_flight[signature] = _InFlight(job, started, attempt)
            return

    # --- Checking ---------------------------------------------------------------------

    async def _check_loop(self) -> None:
        interval = self.check_interval_s
        while True:
            await asyncio.sleep(interval)
            if not self._in_flight:
                continue
            signatures = list(self._in_flight)
            try:
                statuses = await self.sender.statuses(signatures)
            except Exception as exc:  # devnet busy or rate limiting: wait longer, then look again
                interval = min(interval * 2, max(MAX_CHECK_INTERVAL_S, self.check_interval_s))
                log.debug("status check failed (next in %.1fs): %r", interval, exc)
                continue
            interval = self.check_interval_s
            now = time.monotonic()
            for signature in signatures:
                flight = self._in_flight.get(signature)
                if flight is None:
                    continue
                status = statuses.get(signature)
                if status == "confirmed":
                    del self._in_flight[signature]
                    self._set(flight.job, "confirmed", signature, round((now - flight.sent_at) * 1000))
                elif status == "failed" or now - flight.sent_at > self.landing_timeout_s:
                    del self._in_flight[signature]
                    self._retry_or_fail(flight)

    def _retry_or_fail(self, flight: _InFlight) -> None:
        job = flight.job
        if flight.attempt >= self.max_attempts:
            log.warning("receipt for %s %s never landed after %d attempts", job.kind, job.id, flight.attempt)
            self._set(job, "failed", None, None)
        else:
            self._set(job, "pending", None, None)
            self._queue.put_nowait((job, flight.attempt + 1))

    # --- Database ---------------------------------------------------------------------

    def _pending_jobs(self) -> list[tuple[Job, str | None]]:
        with self.db.lock:
            orders = self.db.conn.execute(
                "SELECT order_id, max(receipt_signature) FROM trades WHERE receipt_status = 'pending'"
                " GROUP BY order_id ORDER BY min(rowid)"
            ).fetchall()
            bundles = self.db.conn.execute(
                "SELECT bundle_id, receipt_signature FROM bot_bundles WHERE receipt_status = 'pending'"
                " ORDER BY created_at"
            ).fetchall()
        return ([(Job("order", r[0]), r[1]) for r in orders]
                + [(Job("bundle", r[0]), r[1]) for r in bundles])

    def _set(self, job: Job, status: str, signature: str | None, confirm_ms: int | None) -> None:
        table, key = ("trades", "order_id") if job.kind == "order" else ("bot_bundles", "bundle_id")
        with self.db.lock, self.db.conn:
            self.db.conn.execute(
                f"UPDATE {table} SET receipt_status = ?, receipt_signature = ?, receipt_confirm_ms = ?"
                f" WHERE {key} = ?", (status, signature, confirm_ms, job.id),
            )
        if self.notify and status in ("confirmed", "failed"):
            try:
                self.notify(job, status, signature, confirm_ms)
            except Exception:
                log.exception("receipt notification for %s failed", job.id)
