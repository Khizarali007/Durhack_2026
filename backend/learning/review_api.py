"""GET /learning/review and POST /learning/coach for the signed-in player.

The review is built from the trading database and the season engine by the
deterministic insights engine; Coach Hoops only rephrases it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from trading.accounts import User
from trading.db import Database
from trading.deps import current_user, get_db
from trading.market_provider import get_market

from .coach import coach
from .insights import review
from .season_source import user_season

router = APIRouter(prefix="/learning", tags=["learning"])
DAY = 86400


def my_review(db: Database, user: User) -> dict:
    return review(user_season(db, get_market(), user.user_id)).to_dict()


@router.get("/review")
async def season_review(user: User = Depends(current_user), db: Database = Depends(get_db)) -> dict:
    """Your season so far: summary strip, review cards and a plain-English timeline."""
    return my_review(db, user)


class CoachIn(BaseModel):
    rival_id: str | None = None


@router.post("/coach")
async def coach_hoops(body: CoachIn, user: User = Depends(current_user), db: Database = Depends(get_db)) -> dict:
    """Three friendly bullets from Coach Hoops about your review (or you vs a rival)."""
    mine = my_review(db, user)
    comparison = None
    subject = f"user:{user.user_id}"
    if body.rival_id:
        from .rivals_api import compare_with
        comparison = compare_with(db, user, body.rival_id)
        subject += f"|rival:{body.rival_id}"
    day = int(get_market().market_time() // DAY)
    return await coach(subject, day, mine, comparison)
