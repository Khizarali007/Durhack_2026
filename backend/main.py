"""HoopStreet backend app, shared by Person 1 (market) and Person 2 (trading).

Historical market, account trading, settlement and the standalone browser demo
share one process and one replay session.

Run from the repo root, with the venv active:
    uvicorn main:app --app-dir backend --reload
Then open http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import asyncio
import contextlib
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from trading import router as trading_router
from trading.adapters import TradesAdapter
from solders.pubkey import Pubkey

from trading.chain import config as chain_config
from trading.chain import worker as receipt_worker
from trading.chain.portfolio_sync import PortfolioSyncer
from trading.chain.bot_bundles import BotBundleRecorder
from trading.db import Database
from trading.equity import EquityRecorder
from trading.leaderboard import LeaderboardBroadcaster
from trading.live import LiveHub, receipt_notifier
from trading.margin import MarginMonitor
from trading.market_provider import get_market, use_market
from trading.open_orders import OrderWatcher
from trading.payouts import PayoutProcessor


@asynccontextmanager
async def lifespan(app: FastAPI):
    market = get_market()
    fresh = getattr(market, "requires_fresh_session", False)
    app.state.trading_db = Database(":memory:" if fresh else None)


    # Live updates over /trading/ws (P2-13).
    app.state.live = LiveHub()
    app.state.live.bind_loop()
    if getattr(market, "settles_payouts_directly", False):
        market.bind_settlement(app.state.trading_db, app.state.live.publish_user, app.state.live.publish_public)
    market_task = asyncio.create_task(market.run())

    # Solana receipts (P2-09). SOLANA_RECEIPTS=off runs without them.
    app.state.receipts = None
    if receipt_worker.receipts_enabled() and (not fresh or os.environ.get("SOLANA_RECEIPTS", "off").lower() == "on"):
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
    if getattr(market, "supports_payouts", True) and not getattr(market, "settles_payouts_directly", False):
        await payouts.start()

    # Margin calls and liquidation for leveraged and short positions (P2-15).
    margin = MarginMonitor(app.state.trading_db, market,
                           on_fill=app.state.receipts.enqueue if app.state.receipts else None,
                           notify_user=app.state.live.publish_user)
    if getattr(market, "supports_advanced_trading", True):
        await margin.start()

    # Equity once per market minute, for the report card's max drawdown (P2-16).
    equity = EquityRecorder(app.state.trading_db, market)
    await equity.start()

    # The off-chain leaderboard, pushed live once per market minute when it changes (P2-17).
    leaderboard = LeaderboardBroadcaster(app.state.trading_db, market, app.state.live.publish_public)
    await leaderboard.start()

    # Level 1 (P2-18): every player's portfolio as a Solana account, once
    # SOLANA_PORTFOLIO_PROGRAM_ID points at the deployed program. Shares the receipt sender.
    app.state.portfolios = None
    if app.state.receipts and chain_config.PORTFOLIO_PROGRAM_ID:
        app.state.portfolios = PortfolioSyncer(app.state.trading_db, market, app.state.receipts.sender,
                                               Pubkey.from_string(chain_config.PORTFOLIO_PROGRAM_ID))
        await app.state.portfolios.start()

    # Person 4's TradesAdapter (P2-21). At merge, Person 4 plugs in here (see
    # docs/person4-interfaces.md on their branch):
    #   configure_learning(market_adapter, app.state.trades_adapter)
    app.state.trades_adapter = TradesAdapter(app.state.trading_db)
    try:
        yield
    finally:
        # Person 4: await shutdown_learning()
        if app.state.portfolios:
            await app.state.portfolios.stop()
        await leaderboard.stop()
        await equity.stop()
        await margin.stop()
        await payouts.stop()
        await watcher.stop()
        await bundles.stop()
        if app.state.receipts:
            await app.state.receipts.stop()
        market_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await market_task
        app.state.trading_db.close()
        if fresh:
            use_market(None)


app = FastAPI(title="HoopStreet", lifespan=lifespan)
from market.router import router as market_router

app.include_router(trading_router)
app.include_router(market_router)
# Standalone integration demo; keeps the production frontend namespace free.
app.mount("/demo", StaticFiles(directory=Path(__file__).resolve().parents[1] / "web" / "demo", html=True), name="demo")
