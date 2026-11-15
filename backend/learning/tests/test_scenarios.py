import copy
import json

import pytest

from learning.scenario import (
    SCENARIOS_DIR,
    blocked_words,
    check_data,
    check_file,
    load_scenario,
    scenario_files,
)


def m1_data() -> dict:
    return json.loads((SCENARIOS_DIR / "m1_buy_low_sell_high.json").read_text())


@pytest.mark.parametrize("path", scenario_files(), ids=lambda p: p.name)
def test_every_scenario_file_passes(path):
    assert check_file(path) == []


def test_m1_exists_and_matches_brief():
    sc = load_scenario("m1_buy_low_sell_high")
    assert sc.mission_number == 1
    assert 30 <= sc.duration_s <= 60
    assert sc.symbols == ["SGA"]
    streak = [s for s in sc.timeline if s.kind == "hot_streak"]
    assert len(streak) == 1 and 8 <= streak[0].t <= 12
    assert streak[0].impact == pytest.approx(0.18)
    assert any(s.kind == "hint" and s.t < streak[0].t for s in sc.timeline)
    assert sc.goal.type == "round_trip_profit" and sc.goal.symbol == "SGA"


def with_steps(*steps, **top):
    d = m1_data()
    d["timeline"] = list(steps)
    d.update(top)
    return d


INJURY = {"t": 40, "kind": "injury", "symbol": "SGA", "impact": -0.2, "headline": "SGA sits with a sore ankle"}


def warning(t):
    return {"t": t, "kind": "early_warning", "symbol": "SGA", "impact": -0.02, "headline": "SGA listed as questionable"}


def test_injury_without_warning_fails():
    problems = check_data(with_steps(INJURY))
    assert any("early_warning" in p for p in problems)


@pytest.mark.parametrize("lead,ok", [(19, False), (20, True), (30, True), (40, True), (41, False)])
def test_injury_warning_lead_window(lead, ok):
    problems = check_data(with_steps(warning(40 - lead), INJURY))
    assert (problems == []) is ok, problems


def test_warning_for_other_symbol_does_not_count():
    d = with_steps(dict(warning(15), symbol="ANT"), INJURY, symbols=["SGA", "ANT"])
    assert any("early_warning" in p for p in check_data(d))


@pytest.mark.parametrize(
    "headline",
    [
        "SGA arrested after game",
        "Police called to arena",
        "SGA facing legal trouble",
        "SGA needs surgery",
        "Torn hamstring for SGA",
        "SGA fracture confirmed",
        "Locker room scandal",
        "SGA off-court drama",
    ],
)
def test_blocked_headlines_fail(headline):
    d = with_steps({"t": 10, "kind": "hot_streak", "symbol": "SGA", "impact": 0.1, "headline": headline})
    assert any("blocked word" in p for p in check_data(d))


@pytest.mark.parametrize(
    "text",
    ["SGA on a tear", "Thunder roll on", "Tornado warning for the bench", "Illegal screen? Not today", "Court vision!"],
)
def test_mild_basketball_copy_is_allowed(text):
    assert blocked_words(text) == []


def test_blocked_words_in_hint_text_fail():
    d = with_steps({"t": 1, "kind": "hint", "text": "Rumour: police at the arena"})
    assert check_data(d)


@pytest.mark.parametrize("duration,ok", [(29, False), (30, True), (60, True), (61, False)])
def test_mission_duration(duration, ok):
    d = with_steps(duration_s=duration)
    assert (check_data(d) == []) is ok


def test_free_play_scenario_may_be_long():
    assert check_data(with_steps(duration_s=600, mission_number=None)) == []


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d["timeline"].append({"t": 50, "kind": "hint", "text": "late"}),  # after duration
        lambda d: d["timeline"].insert(0, {"t": 5, "kind": "hint", "text": "x"}) or d["timeline"].insert(0, {"t": 9, "kind": "hint", "text": "y"}),  # unsorted
        lambda d: d["timeline"].append({"t": 44, "kind": "hot_streak", "symbol": "ANT", "impact": 0.1, "headline": "x"}),  # unknown symbol
        lambda d: d["timeline"].append({"t": 44, "kind": "hot_streak", "symbol": "SGA", "headline": "x"}),  # no impact
        lambda d: d["timeline"].append({"t": 44, "kind": "hint", "text": "x", "impact": 0.1}),  # hint with impact
        lambda d: d["timeline"].append({"t": 44, "kind": "explosion", "text": "x"}),  # bad kind
        lambda d: d.update(id="wrong_id"),
        lambda d: d.update(surprise=True),
    ],
)
def test_schema_violations_fail(mutate):
    d = copy.deepcopy(m1_data())
    mutate(d)
    assert check_data(d, expected_id="m1_buy_low_sell_high")


def test_checker_script_runs(capsys):
    import importlib.util

    spec = importlib.util.spec_from_file_location("check_scenarios", SCENARIOS_DIR / "check_scenarios.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.main([]) == 0
    assert "m1_buy_low_sell_high.json" in capsys.readouterr().out
