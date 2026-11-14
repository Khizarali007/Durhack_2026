"""Person 2's HTTP routes, all under /trading."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from .accounts import User, create_guest_user, create_session
from .db import Database
from .deps import current_user, get_db
from .market_provider import get_market
from .money import to_hoop

router = APIRouter(prefix="/trading", tags=["trading"])


class SessionOut(BaseModel):
    token: str
    user_id: str
    cash: float


class MeOut(BaseModel):
    user_id: str
    username: str | None
    is_guest: bool
    cash: float


@router.get("/health")
def health(db: Database = Depends(get_db)) -> dict:
    market = get_market()
    return {
        "status": "ok",
        "component": "trading",
        "market_time": market.market_time(),
        "players": len(market.players()),
        "tables": db.tables(),
    }


@router.post("/session", status_code=status.HTTP_201_CREATED)
def new_session(db: Database = Depends(get_db)) -> SessionOut:
    """Start playing: creates a temporary account with 100,000 HOOP and returns its token.

    Send the token on every later request as `Authorization: Bearer <token>`.
    """
    user = create_guest_user(db)
    token = create_session(db, user.user_id)
    return SessionOut(token=token, user_id=user.user_id, cash=to_hoop(user.cash_cents))


@router.get("/me")
def me(user: User = Depends(current_user)) -> MeOut:
    """Who the token belongs to, and their cash."""
    return MeOut(user_id=user.user_id, username=user.username, is_guest=user.is_guest,
                 cash=to_hoop(user.cash_cents))


@router.get("/debug/quote/{symbol}")
def debug_quote(symbol: str) -> dict:
    """Current quote straight from the market engine (fake for now). For checking the wiring."""
    market = get_market()
    if symbol not in {p.symbol for p in market.players()}:
        raise HTTPException(404, f"unknown symbol {symbol!r}")
    return asdict(market.quote(symbol))
