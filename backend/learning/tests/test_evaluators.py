"""Mission 1 evaluator, with hand-built trades and price paths."""

import pytest

from learning import content
from learning.adapters.models import Portfolio, Position, Tick, Trade
from learning.evaluators import (
    EvalInput,
    FiredEvent,
    available_move,
    evaluate,
    evaluate_m1,
    round_trip,
)
from learning.scenario import load_scenario

T0 = 1_000_000.0
FEE = 0.001
SC = load_scenario("m1_buy_low_sell_high")
ENTRY = content.mission_entry("m1_buy_low_sell_high")
STREAK_T = T0 + 10 * 12

# Price per real second: calm ~48 with a dip to 47.5 at t=6, streak at t=10,
# peak 56 at t=28, fade to 54 by t=45.
PRICES = {0: 48.0, 3: 48.2, 6: 47.5, 9: 48.0, 10: 48.1, 15: 50.0, 20: 53.0, 25: 55.5,
          28: 56.0, 32: 55.6, 38: 55.0, 45: 54.0}
BEST_LOW, BEST_HIGH = 47.5, 56.0


def path(prices=PRICES):
    return {
        "SGA": [
            Tick(t=T0 + s * 12, symbol="SGA", price=p, fair_value=p, best_bid=p - 0.05, best_ask=p + 0.05)
            for s, p in sorted(prices.items())
        ]
    }


_ids = iter(range(10_000))


def tr(side, qty, price, at_s, symbol="SGA"):
    return Trade(
        trade_id=f"t{next(_ids)}", user_id="u", symbol=symbol, side=side, qty=qty,
        price=price, fee=round(qty * price * FEE, 6), t=T0 + at_s * 12,
    )


def run(trades, held=0.0, prices=PRICES):
    positions = [Position(symbol="SGA", qty=held, avg_cost=50.0)] if held else []
    inp = EvalInput(
        scenario=SC,
        mission=ENTRY,
        trades=trades,
        portfolio=Portfolio(cash=100_000, equity=100_000, positions=positions),
        price_path=path(prices),
        start_t=T0,
        end_t=T0 + 45 * 12,
        fired=[FiredEvent("hot_streak", "SGA", 10, STREAK_T)],
    )
    return evaluate(inp)


def test_never_bought():
    r = run([])
    assert (r.outcome, r.passed, r.score) == ("never_bought", False, 0)
    assert r.entry_price is None and r.exit_price is None
    assert r.debrief == ENTRY["debrief"]["never_bought"]
    assert r.lesson == ENTRY["lesson"]


def test_trades_in_other_symbols_do_not_count():
    r = run([tr("buy", 10, 35, 5, symbol="ANT"), tr("sell", 10, 40, 30, symbol="ANT")])
    assert r.outcome == "never_bought"


def test_sold_at_loss():
    r = run([tr("buy", 10, 55.5, 25), tr("sell", 10, 54.0, 44)])
    assert r.outcome == "sold_at_loss" and not r.passed
    expected = 10 * 54.0 - 10 * 54.0 * FEE - (10 * 55.5 + 10 * 55.5 * FEE)
    assert r.realised_pnl == pytest.approx(expected, abs=1e-6)
    assert r.score == 0
    assert r.debrief == ENTRY["debrief"]["sold_at_loss"]


def test_tiny_gross_profit_eaten_by_fees_is_a_loss():
    r = run([tr("buy", 10, 50.0, 15), tr("sell", 10, 50.05, 16)])
    assert r.realised_pnl < 0
    assert r.outcome == "sold_at_loss"


def test_still_holding():
    r = run([tr("buy", 10, 48.0, 5)], held=10)
    assert r.outcome == "still_holding" and not r.passed
    assert r.qty_bought == 10 and r.qty_sold == 0 and r.qty_held_at_end == 10
    assert r.entry_price == 48.0 and r.exit_price is None


def test_partial_sale_at_loss_while_still_holding():
    r = run([tr("buy", 10, 55.5, 25), tr("sell", 5, 54.0, 40)], held=5)
    assert r.outcome == "still_holding"
    assert r.realised_pnl < 0


def test_passed_ok_small_profit_late_entry():
    r = run([tr("buy", 10, 53.0, 20), tr("sell", 10, 54.5, 40)])
    assert r.outcome == "passed_ok" and r.passed
    assert r.realised_pnl > 0
    assert r.score == round((54.5 - 53.0) / (BEST_HIGH - BEST_LOW) * 100)
    assert r.score < 60
    assert r.debrief == ENTRY["debrief"]["passed_ok"]


def test_passed_great_caught_the_heater():
    r = run([tr("buy", 100, 48.05, 9), tr("sell", 100, 55.9, 28)])
    assert r.outcome == "passed_great" and r.passed
    assert r.score == round((55.9 - 48.05) / (BEST_HIGH - BEST_LOW) * 100) >= 60
    assert r.best_entry_price == BEST_LOW and r.best_exit_price == BEST_HIGH
    assert r.entry_price == 48.05 and r.exit_price == 55.9
    assert r.return_pct == pytest.approx(r.realised_pnl / (100 * 48.05 * (1 + FEE)) * 100, abs=0.01)
    assert r.debrief == ENTRY["debrief"]["passed_great"]


def test_profit_plus_leftover_shares_still_passes():
    r = run([tr("buy", 20, 48.0, 5), tr("sell", 10, 55.8, 28)], held=10)
    assert r.passed and r.qty_held_at_end == 10


def test_score_is_capped_at_100():
    r = run([tr("buy", 10, 47.0, 6), tr("sell", 10, 57.0, 28)])
    assert r.score == 100


def test_multiple_fills_use_average_prices():
    r = run([tr("buy", 10, 48.0, 5), tr("buy", 30, 50.0, 15), tr("sell", 40, 55.0, 30)])
    assert r.entry_price == pytest.approx(49.5)
    assert r.exit_price == pytest.approx(55.0)
    assert r.score == round((55.0 - 49.5) / (BEST_HIGH - BEST_LOW) * 100)


def test_threshold_comes_from_content():
    inp_trades = [tr("buy", 10, 50.0, 15), tr("sell", 10, 55.0, 28)]  # score 59
    assert run(inp_trades).outcome == "passed_ok"
    strict = dict(ENTRY, grading={"great_min_score": 50})
    inp = EvalInput(SC, strict, inp_trades, Portfolio(cash=0, equity=0), path(), T0, T0 + 540,
                    [FiredEvent("hot_streak", "SGA", 10, STREAK_T)])
    assert evaluate_m1(inp).outcome == "passed_great"


def test_round_trip_ignores_sells_without_shares():
    rt = round_trip([tr("sell", 5, 50, 1)], "SGA")
    assert rt.qty_sold == 0 and rt.realised_pnl == 0


def test_available_move_pivot_and_fallback():
    ticks = path()["SGA"]
    assert available_move(ticks, STREAK_T) == (BEST_LOW, BEST_HIGH)
    assert available_move(ticks, None) == (47.5, 56.0)
    assert available_move([], STREAK_T) is None


def test_pivot_falls_back_to_scenario_time_without_fired_events():
    inp = EvalInput(SC, ENTRY, [tr("buy", 10, 48.05, 9), tr("sell", 10, 55.9, 28)],
                    Portfolio(cash=0, equity=0), path(), T0, T0 + 540, fired=[])
    assert evaluate(inp).best_entry_price == BEST_LOW


def test_unknown_mission_number_has_no_evaluator():
    sc2 = SC.model_copy(update={"mission_number": 2})
    with pytest.raises(NotImplementedError):
        evaluate(EvalInput(sc2, ENTRY, [], Portfolio(cash=0, equity=0), {}, T0, T0))
