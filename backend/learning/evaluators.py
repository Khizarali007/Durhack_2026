"""Mission evaluators: one function per mission number.

Each evaluator takes an EvalInput (trades in the mission window, final
portfolio, recorded price path, scenario, mission copy) and returns a
MissionResult. Add missions 2-6 to EVALUATORS as they are written.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal

from pydantic import BaseModel

from .adapters.models import MARKET_SECONDS_PER_REAL_SECOND, Portfolio, Tick, Trade
from .scenario import Scenario

Outcome = Literal["never_bought", "sold_at_loss", "still_holding", "passed_ok", "passed_great"]

DEFAULT_GREAT_MIN_SCORE = 60


@dataclass(frozen=True)
class FiredEvent:
    kind: str
    symbol: str | None
    step_t: float  # real seconds from mission start
    market_t: float  # market time it actually fired


@dataclass
class EvalInput:
    scenario: Scenario
    mission: dict  # entry from content/graded-missions.json
    trades: list[Trade]  # the user's fills inside the mission window, oldest first
    portfolio: Portfolio  # at mission end
    price_path: dict[str, list[Tick]]  # per mission symbol, oldest first
    start_t: float  # market time
    end_t: float  # market time
    fired: list[FiredEvent] = field(default_factory=list)


class MissionResult(BaseModel):
    mission_id: str
    mission_number: int
    user_id: str | None = None
    state: str | None = None  # completed / failed / stopped, set by the runner
    passed: bool
    outcome: str
    score: int  # 0-100
    realised_pnl: float  # after fees
    return_pct: float | None  # realised_pnl / cost of the shares sold
    qty_bought: float
    qty_sold: float
    qty_held_at_end: float
    entry_price: float | None  # average buy fill
    exit_price: float | None  # average sell fill
    best_entry_price: float | None  # lowest price before the move
    best_exit_price: float | None  # highest price after it
    final_equity: float
    start_t: float
    end_t: float
    debrief: str
    lesson: str


@dataclass
class RoundTrip:
    qty_bought: float = 0.0
    qty_sold: float = 0.0
    buy_notional: float = 0.0
    sell_notional: float = 0.0
    realised_pnl: float = 0.0
    cost_of_sold: float = 0.0
    qty_held: float = 0.0

    @property
    def avg_buy(self) -> float | None:
        return self.buy_notional / self.qty_bought if self.qty_bought else None

    @property
    def avg_sell(self) -> float | None:
        return self.sell_notional / self.qty_sold if self.qty_sold else None


def round_trip(
    trades: list[Trade], symbol: str, start_qty: float = 0.0, start_avg_cost: float = 0.0
) -> RoundTrip:
    """Average-cost realised P&L for long buy/sell trades on one symbol.
    Buy fees go into the cost basis, sell fees come off the proceeds."""
    rt = RoundTrip(qty_held=max(0.0, start_qty))
    basis = rt.qty_held * start_avg_cost
    for tr in trades:
        if tr.symbol != symbol:
            continue
        if tr.side == "buy":
            rt.qty_bought += tr.qty
            rt.buy_notional += tr.qty * tr.price
            basis += tr.qty * tr.price + tr.fee
            rt.qty_held += tr.qty
        elif tr.side == "sell" and rt.qty_held > 0:
            qty = min(tr.qty, rt.qty_held)
            cost = basis * qty / rt.qty_held
            rt.qty_sold += qty
            rt.sell_notional += qty * tr.price
            rt.realised_pnl += qty * tr.price - tr.fee - cost
            rt.cost_of_sold += cost
            basis -= cost
            rt.qty_held -= qty
    return rt


def available_move(path: list[Tick], pivot_t: float | None) -> tuple[float, float] | None:
    """(lowest price at/before pivot, highest price at/after pivot).
    With no pivot: lowest price, then the highest price after it."""
    if not path:
        return None
    if pivot_t is None:
        low_tick = min(path, key=lambda tk: tk.price)
        after = [tk.price for tk in path if tk.t >= low_tick.t]
        return low_tick.price, max(after)
    before = [tk.price for tk in path if tk.t <= pivot_t]
    after = [tk.price for tk in path if tk.t >= pivot_t]
    if not before or not after:
        return None
    return min(before), max(after)


def _pivot(inp: EvalInput, kind: str, symbol: str) -> float | None:
    for ev in inp.fired:
        if ev.kind == kind and ev.symbol == symbol:
            return ev.market_t
    for step in inp.scenario.timeline:
        if step.kind == kind and step.symbol == symbol:
            return inp.start_t + step.t * MARKET_SECONDS_PER_REAL_SECOND
    return None


def evaluate_m1(inp: EvalInput) -> MissionResult:
    """Buy low, sell high: buy the goal symbol, sell it for a realised profit."""
    sc = inp.scenario
    symbol = sc.goal.symbol or sc.symbols[0]
    start_pos = next((p for p in sc.start_state.positions if p.symbol == symbol), None)
    rt = round_trip(
        inp.trades,
        symbol,
        start_qty=start_pos.qty if start_pos else 0.0,
        start_avg_cost=start_pos.avg_cost if start_pos else 0.0,
    )
    held_at_end = next((p.qty for p in inp.portfolio.positions if p.symbol == symbol), 0.0)

    move = available_move(inp.price_path.get(symbol, []), _pivot(inp, "hot_streak", symbol))
    best_low, best_high = move if move else (None, None)

    score = 0
    if rt.qty_sold and move and best_high > best_low:
        captured = rt.avg_sell - rt.avg_buy
        score = round(max(0.0, min(1.0, captured / (best_high - best_low))) * 100)

    min_pnl = float(sc.goal.params.get("min_realised_pnl", 0.0))
    great_min = inp.mission.get("grading", {}).get("great_min_score", DEFAULT_GREAT_MIN_SCORE)

    outcome: Outcome
    if rt.qty_bought == 0:
        outcome = "never_bought"
    elif rt.qty_sold > 0 and rt.realised_pnl > min_pnl:
        outcome = "passed_great" if score >= great_min else "passed_ok"
    elif held_at_end > 0:
        outcome = "still_holding"
    else:
        outcome = "sold_at_loss"

    return MissionResult(
        mission_id=sc.id,
        mission_number=1,
        passed=outcome in ("passed_ok", "passed_great"),
        outcome=outcome,
        score=score,
        realised_pnl=round(rt.realised_pnl, 4),
        return_pct=round(rt.realised_pnl / rt.cost_of_sold * 100, 2) if rt.cost_of_sold else None,
        qty_bought=rt.qty_bought,
        qty_sold=rt.qty_sold,
        qty_held_at_end=held_at_end,
        entry_price=_r(rt.avg_buy),
        exit_price=_r(rt.avg_sell),
        best_entry_price=best_low,
        best_exit_price=best_high,
        final_equity=inp.portfolio.equity,
        start_t=inp.start_t,
        end_t=inp.end_t,
        debrief=inp.mission.get("debrief", {}).get(outcome, ""),
        lesson=inp.mission.get("lesson") or sc.lesson,
    )


def _r(x: float | None) -> float | None:
    return None if x is None else round(x, 4)


EVALUATORS: dict[int, Callable[[EvalInput], MissionResult]] = {
    1: evaluate_m1,
}


def has_evaluator(mission_number: int | None) -> bool:
    return mission_number in EVALUATORS


def evaluate(inp: EvalInput) -> MissionResult:
    n = inp.scenario.mission_number
    if n not in EVALUATORS:
        raise NotImplementedError(f"no evaluator for mission {n}")
    return EVALUATORS[n](inp)
