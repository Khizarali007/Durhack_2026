import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_starting_values import newcomer_prior


def test_newcomer_prior_ignores_later_results_and_weights_players_equally():
    sample={1:{2020:[30],2024:[30]},2:{2022:[2]*80,2025:[100]},3:{2024:[6]},4:{2025:[100]}}
    assert newcomer_prior(sample)==(4,2)


def test_newcomer_prior_fails_instead_of_making_up_data():
    with pytest.raises(ValueError):newcomer_prior({1:{2020:[10]}})


def test_equal_player_target_does_not_overweight_frequent_players_or_future_games():
    from build_starting_values import equal_player_prior
    assert equal_player_prior({1: {2024: [20] * 82}, 2: {2024: [0], 2025: [999]}}, 2024) == 10


def test_opening_forecast_uses_only_allowed_seasons_and_renormalizes_missing_ones():
    from build_starting_values import opening_expectation
    history = {2024: [10] * 10, 2025: [999] * 80}
    assert opening_expectation(history, {2024: .65, 2023: .20}, 6, 3) == 8
    assert opening_expectation({2025: [999]}, {2024: .65}, 6, 3) == 3


def test_recent_performance_matters_more_without_favoring_a_named_player():
    from build_starting_values import opening_expectation, SEASON_WEIGHTS, LEGACY_WEIGHTS
    improved = {2023: [5] * 70, 2024: [15] * 70}
    declined = {2023: [15] * 70, 2024: [5] * 70}
    assert opening_expectation(improved, SEASON_WEIGHTS, 7, 3.7) > opening_expectation(improved, LEGACY_WEIGHTS, 7, 3.7)
    assert opening_expectation(declined, SEASON_WEIGHTS, 7, 3.7) < opening_expectation(declined, LEGACY_WEIGHTS, 7, 3.7)
