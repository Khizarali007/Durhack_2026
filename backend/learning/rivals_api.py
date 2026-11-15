"""Friends → practice rivals: five simulated traders from the real market (market/rivals.py).

GET /learning/rivals                 ranked list including you
GET /learning/rivals/{id}            one rival: review, equity curve vs yours, composition, holdings
GET /learning/rivals/{id}/compare    what the rival did differently, in plain English, and what to try

Every number comes from the engine; the rivals are labelled "simulated trader" everywhere.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from trading.accounts import User
from trading.db import Database
from trading.deps import current_user, get_db
from trading.equity import equity_history
from trading.market_provider import get_market
from trading.money import to_hoop

from .composition import Holding, compose
from .currency import hoop
from .insights import Fill, Payment, SeasonData, review
from .review_api import my_review
from .season_source import MarketView

router = APIRouter(prefix="/learning", tags=["learning"])
DAY = 86400


def _tracker():
    tracker = getattr(get_market(), "rivals", None)
    if tracker is None:
        raise HTTPException(503, "Practice rivals need the season replay engine")
    return tracker


def _rival(rid: str):
    rival = _tracker().rivals.get(rid)
    if rival is None:
        raise HTTPException(404, "No such rival")
    return rival


def rival_season(rival) -> SeasonData:
    market = get_market()
    view = MarketView(market)
    holdings = _tracker().holdings(rival, market)
    symbols = set(holdings) | {f.symbol for f in rival.fills}
    # Shares held at the opening bell = now minus what the trade log added.
    net: dict[str, int] = {}
    for f in rival.fills:
        net[f.symbol] = net.get(f.symbol, 0) + (f.qty if f.side == "buy" else -f.qty)
    opening = {}
    for s in symbols:
        start_qty = holdings.get(s, 0) - net.get(s, 0)
        first = view.daily(s)
        if start_qty > 0 and first:
            opening[s] = (float(start_qty), first[0][1])
    return SeasonData(
        name=rival.name, starting_cash=rival.opening_equity, cash=rival.bot.cash / 100, now=view.now(),
        fills=[Fill(f.order_id, f.symbol, f.side, float(f.qty), f.price, 0.0, f.t) for f in rival.fills],
        payments=[Payment(p.symbol, float(p.qty_held), p.amount, p.t) for p in rival.payments],
        equity=list(rival.equity), alerts=view.alerts(), names=view.names, teams=view.teams,
        prices=view.prices(symbols), daily=view.daily, game_payout=view.game_payout,
        holdings_qty={s: float(q) for s, q in holdings.items()}, opening=opening)


def _profile(rival) -> dict:
    return {"id": rival.id, "name": rival.name, "persona": rival.persona, "strategy": rival.strategy,
            "style": rival.style, "simulated": True, "label": "Simulated trader"}


def _row(profile: dict, summary: dict, mine: dict | None) -> dict:
    row = {**profile, "return_pct": summary["return_pct"], "equity": summary["equity"],
           "payouts": summary["payouts"], "grade": summary["grade"], "trades": summary["trades"]}
    if mine is not None:
        row["vs_you"] = round(summary["return_pct"] - mine["return_pct"], 2)
    return row


def _daily(points: list[tuple[float, float]]) -> list[dict]:
    """One point per market day (the last one), oldest first."""
    by_day: dict[int, float] = {}
    for t, equity in points:
        by_day[int(-(-t // DAY))] = equity
    return [{"t": d * DAY, "equity": round(e, 2)} for d, e in sorted(by_day.items())]


@router.get("/rivals")
async def rivals(user: User = Depends(current_user), db: Database = Depends(get_db)) -> dict:
    mine = my_review(db, user)["summary"]
    you = {"id": "you", "name": "You", "persona": "That's you", "strategy": "", "style": "you", "simulated": False,
           "label": "You", **{k: mine[k] for k in ("return_pct", "equity", "payouts", "grade", "trades")}}
    rows = [_row(_profile(r), review(rival_season(r)).to_dict()["summary"], mine) for r in _tracker().rivals.values()]
    ranked = sorted(rows + [you], key=lambda r: r["return_pct"], reverse=True)
    for i, r in enumerate(ranked, 1):
        r["rank"] = i
    return {"rows": ranked}


@router.get("/rivals/{rid}")
async def rival_detail(rid: str, user: User = Depends(current_user), db: Database = Depends(get_db)) -> dict:
    rival = _rival(rid)
    data = rival_season(rival)
    theirs = review(data).to_dict()
    mine = my_review(db, user)
    yours_curve = _daily([(p.t, to_hoop(p.equity_cents)) for p in equity_history(db, user.user_id)])
    held = sorted(((s, q, q * data.prices.get(s, 0.0)) for s, q in (data.holdings_qty or {}).items()),
                  key=lambda x: x[2], reverse=True)
    rival_comp = compose([Holding(s, data.names.get(s, s), data.teams.get(s, "?"), v) for s, _, v in held],
                         data.cash).to_dict()
    return {
        "rival": _profile(rival),
        "review": theirs,
        "your_summary": mine["summary"],
        "equity": _daily(rival.equity),
        "your_equity": yours_curve,
        "composition": rival_comp,
        "top_holdings": [{"symbol": s, "name": data.names.get(s, s), "qty": q, "value": round(v, 2)} for s, q, v in held[:8]],
    }


def compare_with(db: Database, user: User, rid: str) -> dict:
    """Concrete differences between you and a rival, from both reviews, plus what to try."""
    rival = _rival(rid)
    data = rival_season(rival)
    theirs = review(data).to_dict()
    mine = my_review(db, user)
    t, m, name = theirs["summary"], mine["summary"], rival.name
    their_holdings = len(data.holdings_qty or {})
    their_teams = len({data.teams.get(s, "?") for s in (data.holdings_qty or {})})
    my_ids = {i["id"] for i in mine["insights"]}
    diffs = []
    my_grade = m["grade"] or "no grade yet"
    diffs.append(f"{name} owns {their_holdings} players across {their_teams} teams (diversification grade "
                 f"{t['grade'] or '–'}). Yours: {my_grade}.")
    diffs.append(f"{name} has been paid {hoop(t['payouts'])} from games so far; you have been paid {hoop(m['payouts'])}.")
    diffs.append(f"Season so far: {name} {t['return_pct']:+.2f}%, you {m['return_pct']:+.2f}%.")
    praise = [i for i in theirs["insights"] if i["tone"] == "praise" and i["id"] != "diversified"]
    if praise:
        diffs.append(f"{name}: {praise[0]['what']}")
    if "bought_into_storm" in my_ids:
        diffs.append(f"You bought a player during an injury warning. {name}'s approach: {rival.strategy.lower()}")
    if "churning" in my_ids:
        diffs.append(f"You traded {m['trades']} times and lost money after fees; {name} made {t['trades']} trades.")
    warnings = [i for i in mine["insights"] if i["tone"] == "warning"]
    learn = warnings[0]["learn"] if warnings else (praise[0]["learn"] if praise else
                                                    {"kind": "glossary", "id": "diversification", "label": "Diversification"})
    return {"rival": _profile(rival), "differences": diffs[:5], "try": learn}


@router.get("/rivals/{rid}/compare")
async def rival_compare(rid: str, user: User = Depends(current_user), db: Database = Depends(get_db)) -> dict:
    return compare_with(db, user, rid)
