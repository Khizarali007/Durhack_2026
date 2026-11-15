"""Portfolio Composition: what's in your basket, how balanced it is, and an A-F grade.

Pure functions over holdings (no database, no market), so the grade is easy to
test and explain. Exposure is the absolute market value of each position, so a
short counts as exposure too. Cash is reported but not graded: the grade is
about how the invested money is spread.

Grade ladder (checked from A down; the first rung a basket meets wins):
  A  effective holdings >= 8, no player above 20%, no team above 30%
  B  effective holdings >= 5, no player above 30%, no team above 40%
  C  effective holdings >= 3, no player above 50%
  D  effective holdings >= 1.5
  F  otherwise (in practice: almost everything on one player)
Effective holdings = 1 / HHI, where HHI is the sum of squared player weights.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass, field

LADDER = (
    ("A", 8.0, 0.20, 0.30),
    ("B", 5.0, 0.30, 0.40),
    ("C", 3.0, 0.50, 1.00),
    ("D", 1.5, 1.00, 1.00),
)


@dataclass(frozen=True)
class Holding:
    symbol: str
    name: str
    team: str
    value: float  # HOOP market value; negative for a short


@dataclass
class Slice:
    key: str
    label: str
    value: float
    pct: float


@dataclass
class Composition:
    grade: str | None              # None when nothing is invested yet
    reason: str
    invested: float
    cash: float
    cash_pct: float
    holdings: int
    teams: int
    effective_holdings: float
    hhi: float                     # 0-1; 1 = everything in one player
    top_player_pct: float
    top_team_pct: float
    by_player: list[Slice] = field(default_factory=list)
    by_team: list[Slice] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _pct(part: float, whole: float) -> float:
    return round(100 * part / whole, 1) if whole > 0 else 0.0


def grade_basket(effective: float, top_player: float, top_team: float) -> str:
    for grade, min_eff, max_player, max_team in LADDER:
        if effective >= min_eff and top_player <= max_player + 1e-9 and top_team <= max_team + 1e-9:
            return grade
    return "F"


def compose(holdings: list[Holding], cash: float) -> Composition:
    exposures = [(h, abs(h.value)) for h in holdings if abs(h.value) > 0]
    invested = sum(v for _, v in exposures)
    total = invested + max(cash, 0.0)
    if invested <= 0:
        return Composition(None, "All cash so far: buy a few players and your basket gets a grade.",
                           0.0, cash, _pct(max(cash, 0), total) if total else 100.0, 0, 0, 0.0, 0.0, 0.0, 0.0)

    by_player = sorted(((h, v) for h, v in exposures), key=lambda hv: hv[1], reverse=True)
    teams: dict[str, float] = defaultdict(float)
    for h, v in exposures:
        teams[h.team or "?"] += v
    by_team = sorted(teams.items(), key=lambda kv: kv[1], reverse=True)

    weights = [v / invested for _, v in exposures]
    hhi = sum(w * w for w in weights)
    effective = 1 / hhi
    top_h, top_v = by_player[0]
    top_team, top_team_v = by_team[0]
    top_player_w, top_team_w = top_v / invested, top_team_v / invested
    grade = grade_basket(effective, top_player_w, top_team_w)
    reason = _reason(grade, top_h, top_player_w, top_team, top_team_w, len(exposures), len(teams))

    return Composition(
        grade=grade, reason=reason, invested=round(invested, 2), cash=round(cash, 2),
        cash_pct=_pct(max(cash, 0), total), holdings=len(exposures), teams=len(teams),
        effective_holdings=round(effective, 2), hhi=round(hhi, 4),
        top_player_pct=_pct(top_v, invested), top_team_pct=_pct(top_team_v, invested),
        by_player=[Slice(h.symbol, h.name, round(v, 2), _pct(v, invested)) for h, v in by_player],
        by_team=[Slice(t, t, round(v, 2), _pct(v, invested)) for t, v in by_team],
    )


def _reason(grade: str, top, top_w: float, team: str, team_w: float, n: int, n_teams: int) -> str:
    if n == 1:
        return f"Everything rides on {top.name}: one injury report and the whole basket gets wet."
    if top_w > 0.5:
        return f"{round(top_w * 100)}% of your money is on {top.name}. Spread it so one bad night can't sink you."
    if team_w > 0.4 and n_teams > 1:
        return f"{round(team_w * 100)}% sits on {team}. Players on one team share the same schedule and storms."
    if team_w > 0.4:
        return f"Every holding plays for {team}: one team's bad week hits all of them at once."
    if grade in ("A", "B"):
        return f"Well spread: {n} players across {n_teams} teams, biggest position {round(top_w * 100)}%."
    return f"{n} players, but {top.name} is {round(top_w * 100)}% of it. Add a few more names to balance it out."
