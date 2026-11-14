"""Person 2's HTTP routes, all under /trading.

P2-01 only has the health check and a debug quote. Sessions, orders and the
portfolio arrive in P2-03 to P2-06.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Request

from .market_provider import get_market

router = APIRouter(prefix="/trading", tags=["trading"])


@router.get("/health")
def health(request: Request) -> dict:
    db = request.app.state.trading_db
    market = get_market()
    return {
        "status": "ok",
        "component": "trading",
        "market_time": market.market_time(),
        "players": len(market.players()),
        "tables": db.tables(),
    }


@router.get("/debug/quote/{symbol}")
def debug_quote(symbol: str) -> dict:
    """Current quote straight from the market engine (fake for now). For checking the wiring."""
    market = get_market()
    if symbol not in {p.symbol for p in market.players()}:
        raise HTTPException(404, f"unknown symbol {symbol!r}")
    return asdict(market.quote(symbol))
