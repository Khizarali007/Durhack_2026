import math
import pytest
from market.valuation import (CONFIG, OPENING_T, YEAR_SECONDS, annual_exit, dividend_value,
                              payout_per_share, update_expectations, projected_score)


def test_agreed_response_examples():
    ability,form=update_expectations(20,20,40)
    assert ability==pytest.approx(20.45)
    assert form==24
    assert projected_score(ability,form)==pytest.approx(21.3375)
    assert payout_per_share(40)==.8
    ability=form=20
    for _ in range(5):
        ability,form=update_expectations(ability,form,5)
    assert ability==pytest.approx(17.8810103855)
    assert projected_score(ability,form)==pytest.approx(15.889557789125002)
    assert payout_per_share(-20)==0


def test_infinite_formula_matches_direct_sum():
    ability,form,age=20,24,30
    hazard=math.log1p(.2)-math.log1p(-annual_exit(age))
    # Moderate Out: initial availability zero, recovers toward .9 over 10 games.
    direct=sum(.02*math.exp(-hazard*(k+1)/82)*(.9-.9*math.exp(-k/10))*
               (ability+.25*(form-ability)*.9**k) for k in range(12000))
    actual=dividend_value(ability,form,age=age,status='Out',level='moderate')
    assert actual==pytest.approx(direct,rel=1e-10)


def test_detachment_removes_only_that_payment():
    schedule=('2024-10-22','2024-10-25')
    before=dividend_value(20,20,schedule=schedule)
    after=dividend_value(20,20,schedule=schedule,excluded={'2024-10-22'})
    hazard=math.log1p(.2)-math.log1p(-annual_exit(27))
    assert before-after==pytest.approx(.02*.9*20*math.exp(-hazard*86400/YEAR_SECONDS))


def test_injury_reduces_near_payout_more_than_career_value():
    healthy=dividend_value(20,20)
    minor=dividend_value(20,20,status='Out',level='minor')
    severe=dividend_value(20,20,status='Out',level='severe')
    assert healthy>minor>severe>healthy*.75


def test_reputation_affects_forecast_not_identical_actual_payout():
    assert payout_per_share(25)==.5
    low=dividend_value(*update_expectations(5,5,25))
    high=dividend_value(*update_expectations(25,25,25))
    assert high>low
