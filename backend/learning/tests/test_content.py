import json

from learning.content import CONTENT_DIR
from learning.scenario import SCENARIOS_DIR

OUTCOMES = {"never_bought", "sold_at_loss", "still_holding", "passed_ok", "passed_great"}
TITLES = [
    "Buy low, sell high",
    "Read the spread",
    "Compose your portfolio",
    "Hype vs fundamentals",
    "Survive the storm",
    "Danger zone",
]


def missions():
    return json.loads((CONTENT_DIR / "graded-missions.json").read_text())["missions"]


def test_six_missions_in_order_with_titles():
    ms = missions()
    assert [m["number"] for m in ms] == [1, 2, 3, 4, 5, 6]
    assert [m["title"] for m in ms] == TITLES


def test_mission1_copy_complete():
    m1 = missions()[0]
    assert m1["status"] == "ready"
    assert set(m1["debrief"]) == OUTCOMES
    assert all(m1["debrief"][k].strip() for k in OUTCOMES)
    for key in ("goal", "hint", "lesson"):
        assert m1[key] and "TODO" not in m1[key]
    assert (SCENARIOS_DIR / f"{m1['scenario_id']}.json").is_file()


def test_placeholders_marked():
    for m in missions()[1:]:
        assert m["status"] == "placeholder"


def test_ready_missions_point_at_real_scenarios():
    for m in missions():
        if m["scenario_id"]:
            assert (SCENARIOS_DIR / f"{m['scenario_id']}.json").is_file()


def test_glossary_has_terms():
    terms = json.loads((CONTENT_DIR / "glossary.json").read_text())["terms"]
    names = {t["term"] for t in terms}
    assert {"Bid", "Ask", "Spread", "Realised profit"} <= names
    assert all(t["short"] for t in terms)
