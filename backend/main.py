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
from trading.db import Database
from trading.market_provider import get_market


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.trading_db = Database()
    market = get_market()
    market_task = asyncio.create_task(market.run())
    # Person 4 plugs in here at merge (see docs/person4-interfaces.md on their branch):
    #   configure_learning(market_adapter, trades_adapter)
    try:
        yield
    finally:
        # Person 4: await shutdown_learning()
        market_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await market_task
        app.state.trading_db.close()


app = FastAPI(title="HoopStreet", lifespan=lifespan)
app.include_router(trading_router)
# Still to add: Person 1's market routes, Person 4's learning router,
# and the built frontend served as static files from the same URL.
