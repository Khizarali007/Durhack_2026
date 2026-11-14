"""MOCK ONLY - REMOVE AT MERGE.

Debug endpoints for the mock adapters during local dev, mounted by dev_app.py
under /learning/mock. Never mount this in backend/main.py: in the real app
users trade through Person 2's API (POST /learning/mock/order and
GET /learning/mock/portfolio stand in for it).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .adapters.mock_market import MockMarket
from .adapters.mock_trades import MockOrderError, MockTrades
from .adapters.models import (
    MARKET_SECONDS_PER_REAL_SECOND,
    EventKind,
    MarketEvent,
    Portfolio,
    Side,
    Tick,
    Trade,
)

router = APIRouter(prefix="/learning/mock", tags=["learning-mock"])

_market: MockMarket | None = None
_trades: MockTrades | None = None


def bind(market: MockMarket, trades: MockTrades) -> None:
    global _market, _trades
    _market, _trades = market, trades


def _m() -> MockMarket:
    if _market is None:
        raise HTTPException(503, "mock market not running")
    return _market


def _t() -> MockTrades:
    if _trades is None:
        raise HTTPException(503, "mock trades not running")
    return _trades


@router.get("/symbols")
async def symbols() -> list[dict]:
    m = _m()
    return [m.info(s) for s in m.symbols()]


@router.get("/tick", response_model=Tick)
async def tick(symbol: str = Query(...)) -> Tick:
    tk = _m().get_tick(symbol)
    if tk is None:
        raise HTTPException(404, f"unknown symbol {symbol!r}")
    return tk


@router.get("/ticks", response_model=list[Tick])
async def ticks(symbol: str = Query(...), limit: int = Query(120, ge=1, le=600)) -> list[Tick]:
    m = _m()
    if m.get_tick(symbol) is None:
        raise HTTPException(404, f"unknown symbol {symbol!r}")
    return m.recent_ticks(symbol, limit)


class EventIn(BaseModel):
    symbol: str
    kind: EventKind
    headline: str
    impact: float = 0.0
    storm: float = Field(1.0, gt=0)
    delay_s: float = Field(0.0, ge=0, description="Real seconds from now")


@router.post("/event", response_model=MarketEvent)
async def event(body: EventIn) -> MarketEvent:
    m = _m()
    ev = MarketEvent(
        t=m.market_time() + body.delay_s * MARKET_SECONDS_PER_REAL_SECOND,
        symbol=body.symbol,
        kind=body.kind,
        headline=body.headline,
        impact=body.impact,
        storm=body.storm,
    )
    try:
        m.inject_event(ev)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    return ev


@router.get("/events", response_model=list[MarketEvent])
async def events() -> list[MarketEvent]:
    return _m().recent_events()


class OrderIn(BaseModel):
    user_id: str = "demo"
    symbol: str
    side: Side
    qty: float = Field(gt=0)


@router.post("/order", response_model=Trade)
async def order(body: OrderIn) -> Trade:
    try:
        return _t().place_market_order(body.user_id, body.symbol, body.side, body.qty)
    except MockOrderError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/portfolio", response_model=Portfolio)
async def portfolio(user_id: str = "demo") -> Portfolio:
    return _t().portfolio(user_id)


@router.get("/trades", response_model=list[Trade])
async def trades(user_id: str = "demo", since_t: float | None = None) -> list[Trade]:
    return _t().trades_for_user(user_id, since_t)
