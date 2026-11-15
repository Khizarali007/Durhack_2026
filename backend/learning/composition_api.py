"""GET /learning/composition: the signed-in player's basket, graded A-F.

Reads Person 2's portfolio (marked at the quote midpoint, like the Portfolio page)
and grades it with learning.composition. Auth is Person 2's bearer token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from trading.accounts import User
from trading.db import Database
from trading.deps import current_user, get_db
from trading.market_provider import get_market
from trading.money import to_hoop
from trading.portfolio import build_portfolio

from .composition import Holding, compose

router = APIRouter(prefix="/learning", tags=["learning"])


@router.get("/composition")
async def composition(user: User = Depends(current_user), db: Database = Depends(get_db)) -> dict:
    view = build_portfolio(db, get_market(), user.user_id)
    holdings = [Holding(p.symbol, p.name or p.symbol, p.team or "?", to_hoop(p.market_value_cents))
                for p in view.positions]
    return compose(holdings, to_hoop(view.cash_cents)).to_dict()
