"""Standalone dev server for the learning layer, wired to MOCK adapters.

LOCAL DEV ONLY. The real app is backend/main.py (owned by teammates).

Run from the repo root, with the venv active:
    uvicorn learning.dev_app:app --app-dir backend --port 8001 --reload
or:
    python backend/learning/dev_app.py
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

if __package__ in (None, ""):  # allow `python backend/learning/dev_app.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from learning import configure, router  # noqa: E402
from learning import mock_router  # noqa: E402
from learning.adapters.mock_market import MockMarket  # noqa: E402
from learning.adapters.mock_trades import MockTrades  # noqa: E402

DEV_PORT = 8001


@asynccontextmanager
async def lifespan(app: FastAPI):
    market = MockMarket()
    trades = MockTrades(market)
    configure(market, trades)
    mock_router.bind(market, trades)
    market.start()
    try:
        yield
    finally:
        await market.stop()


app = FastAPI(title="HoopStreet learning layer (dev, mock adapters)", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(mock_router.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=DEV_PORT)
