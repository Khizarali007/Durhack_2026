import pytest

from learning.composition import Holding, compose, grade_basket


def h(symbol, team, value, name=None):
    return Holding(symbol, name or symbol, team, value)


def test_all_cash_has_no_grade():
    c = compose([], 100_000)
    assert c.grade is None and c.invested == 0 and c.cash_pct == 100.0
    assert "All cash" in c.reason


def test_single_player_is_f_and_names_the_player():
    c = compose([h("JOKIC", "DEN", 1500, "Nikola Jokic")], 98_500)
    assert c.grade == "F"
    assert c.top_player_pct == 100.0 and c.effective_holdings == 1.0
    assert "Nikola Jokic" in c.reason


def test_ten_equal_players_on_ten_teams_is_a():
    c = compose([h(f"P{i}", f"T{i}", 1000) for i in range(10)], 0)
    assert c.grade == "A"
    assert c.effective_holdings == pytest.approx(10)
    assert c.hhi == pytest.approx(0.1)
    assert [s.pct for s in c.by_team] == [10.0] * 10
    assert c.reason.startswith("Well spread")


def test_one_team_stack_is_capped_even_with_many_players():
    c = compose([h(f"P{i}", "OKC", 1000) for i in range(8)], 0)
    assert c.effective_holdings == pytest.approx(8)
    assert c.grade == "C"  # spread across players, but 100% on one team
    assert "OKC" in c.reason


def test_heavy_top_position_drops_the_grade_and_explains_why():
    c = compose([h("SGA", "OKC", 6000, "Shai"), h("A", "BOS", 1000), h("B", "NYK", 1000), h("C", "LAL", 1000)], 0)
    assert c.top_player_pct == pytest.approx(66.7)
    assert c.grade == "D"
    assert "67% of your invested money is on Shai" in c.reason


def test_shorts_count_as_exposure():
    c = compose([h("A", "BOS", 1000), h("B", "NYK", -1000)], 0)
    assert c.invested == 2000 and c.holdings == 2


def test_percentages_sum_to_100_and_sort_biggest_first():
    c = compose([h("A", "BOS", 300), h("B", "BOS", 200), h("C", "NYK", 500)], 1000)
    assert sum(s.pct for s in c.by_player) == pytest.approx(100, abs=0.2)
    assert c.by_player[0].key == "C" and c.by_team[0].key == "BOS"
    assert c.cash_pct == 50.0


def test_ladder_boundaries():
    assert grade_basket(8, 0.20, 0.30) == "A"
    assert grade_basket(7.99, 0.20, 0.30) == "B"
    assert grade_basket(5, 0.31, 0.40) == "C"
    assert grade_basket(1.5, 0.9, 0.9) == "D"
    assert grade_basket(1.4, 0.9, 0.9) == "F"
