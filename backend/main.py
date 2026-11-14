"""HoopStreet backend app, shared by Person 1 (market) and Person 2 (trading).

This is Person 2's starting version. Merge it with Person 1's when their API
lands; keep each person's routes in their own package.

Run from the repo root, with the venv active:
    uvicorn main:app --app-dir backend --reload
Then open http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI

from trading import router as trading_router
from trading.adapters import TradesAdapter
from trading.chain import worker as receipt_worker
from trading.chain.bot_bundles import BotBundleRecorder
from trading.db import Database
from trading.live import LiveHub, receipt_notifier
from trading.market_provider import get_market
from trading.open_orders import OrderWatcher
from trading.payouts import PayoutProcessor


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.trading_db = Database()
    market = get_market()
    market_task = asyncio.create_task(market.run())

    # Live updates over /trading/ws (P2-13).
    app.state.live = LiveHub()
    app.state.live.bind_loop()

    # Solana receipts (P2-09). SOLANA_RECEIPTS=off runs without them.
    app.state.receipts = None
    if receipt_worker.receipts_enabled():
        app.state.receipts = receipt_worker.ReceiptWorker(
            app.state.trading_db, receipt_worker.sender_factory(),
            notify=receipt_notifier(app.state.trading_db, app.state.live))
        await app.state.receipts.start()

    # Bot trades: one bundle (and one receipt) per market minute (P2-10).
    bundles = BotBundleRecorder(app.state.trading_db, market,
                                on_bundle=app.state.receipts.enqueue_bundle if app.state.receipts else None)
    await bundles.start()

    # Limit and stop-loss orders fire on market ticks (P2-11); their trades get receipts too.
    watcher = OrderWatcher(app.state.trading_db, market,
                           on_fill=app.state.receipts.enqueue if app.state.receipts else None,
                           notify_user=app.state.live.publish_user)
    await watcher.start()

    # Performance payouts to holders (P2-22), announced live.
    payouts = PayoutProcessor(app.state.trading_db, market, notify_user=app.state.live.publish_user,
                              notify_public=app.state.live.publish_public)
    await payouts.start()

    # Person 4's TradesAdapter (P2-21). At merge, Person 4 plugs in here (see
    # docs/person4-interfaces.md on their branch):
    #   configure_learning(market_adapter, app.state.trades_adapter)
    app.state.trades_adapter = TradesAdapter(app.state.trading_db)
    try:
        yield
    finally:
        # Person 4: await shutdown_learning()
        await payouts.stop()
        await watcher.stop()
        await bundles.stop()
        if app.state.receipts:
            await app.state.receipts.stop()
        market_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await market_task
        app.state.trading_db.close()


app = FastAPI(title="HoopStreet", lifespan=lifespan)
app.include_router(trading_router)
# Still to add: Person 1's market routes, Person 4's learning router,
# and the built frontend served as static files from the same URL.
