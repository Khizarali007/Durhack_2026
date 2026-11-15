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
