"""P2-10: bundle each market minute's bot trades into one Solana receipt.

Bots trade every tick (about 15-20 trades per market minute). A receipt per
bot trade would hit devnet's rate limits, so instead:

1. The market sends a ``BotTradeSummary`` once per market minute (every 5 real seconds).
2. ``record_bundle`` saves the full trade list (``bot_trades``) and its sha256
   hash (``bot_bundles``) in one transaction.
3. The receipt worker writes one memo per bundle: count, volume and the hash.

Anyone can recompute the hash from the stored list and compare it with the one
on-chain (``bundle_detail`` does exactly that).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import secrets
import time
from collections.abc import Callable

from ..db import Database
from ..market_contract import BotTradeSummary, MarketEngine
from ..money import to_cents
from .receipts import BotTradeLine, bot_trades_hash

log = logging.getLogger("trading.bot_bundles")


def record_bundle(db: Database, summary: BotTradeSummary) -> str | None:
    """Save one minute of bot trades. Returns the bundle id, or None if the bots didn't trade."""
    if summary.count == 0:
        return None
    lines = [BotTradeLine(t.bot_id, t.symbol, t.side, t.qty, to_cents(t.price), t.t) for t in summary.trades]
    bundle_id = f"bb_{secrets.token_hex(6)}"
    with db.lock, db.conn:
        db.conn.execute(
            "INSERT INTO bot_bundles (bundle_id, minute_t, trade_count, total_volume, trades_hash, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (bundle_id, summary.minute_t, len(lines), sum(b.qty for b in lines), bot_trades_hash(lines),
             time.time()),
        )
        db.conn.executemany(
            "INSERT INTO bot_trades (bundle_id, seq, bot_id, symbol, side, qty, price_cents, t)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [(bundle_id, i, b.bot_id, b.symbol, b.side, b.qty, b.price_cents, b.t) for i, b in enumerate(lines)],
        )
    return bundle_id


def bundle_lines(db: Database, bundle_id: str) -> list[BotTradeLine]:
    with db.lock:
        rows = db.conn.execute(
            "SELECT bot_id, symbol, side, qty, price_cents, t FROM bot_trades WHERE bundle_id = ? ORDER BY seq",
            (bundle_id,),
        ).fetchall()
    return [BotTradeLine(*row) for row in rows]


class BotBundleRecorder:
    """Listens to the market and records a bundle every market minute."""

    def __init__(self, db: Database, market: MarketEngine,
                 on_bundle: Callable[[str], None] | None = None) -> None:
        self.db = db
        self.market = market
        self.on_bundle = on_bundle
        self._queue = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._queue = self.market.subscribe()
        self._task = asyncio.create_task(self._run(), name="bot-bundle-recorder")

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
            if not isinstance(event, BotTradeSummary):
                continue  # ticks are for other listeners
            try:
                bundle_id = record_bundle(self.db, event)
                if bundle_id and self.on_bundle:
                    self.on_bundle(bundle_id)
            except Exception:
                log.exception("couldn't record the bot bundle for minute %s", event.minute_t)
