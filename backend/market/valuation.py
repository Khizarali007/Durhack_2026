"""Proposed dividend model. Forecast coefficients partially tested; risk assumptions are not calibrated."""
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from functools import lru_cache
import math

# A share now bundles ten of the original payout claims; human starting cash stays fixed.
SHARE_VALUE_MULTIPLIER = 10

YEAR_SECONDS = 365.25 * 86400
OPENING_T = datetime(2024, 10, 22, tzinfo=timezone.utc).timestamp()
NEXT_SEASON_T = datetime(2025, 10, 22, tzinfo=timezone.utc).timestamp()


@dataclass(frozen=True)
class ModelConfig:
    ability_alpha: float = .03
    form_alpha: float = .20
    form_weight: float = .25
    form_decay: float = .90
    max_ability_surprise: float = 15.
    dollars_per_score: float = .02 * SHARE_VALUE_MULTIPLIER
    annual_required_return: float = .20
    healthy_availability: float = .90
    annual_game_opportunities: int = 82
    annual_exit_base: float = .04
    annual_exit_age_coefficient: float = .0015
    annual_exit_age_start: float = 27.
    annual_exit_cap: float = .35


CONFIG = ModelConfig()


def model_parameters():
    return {**asdict(CONFIG), 'injury_recovery_games': {'minor': 3, 'moderate': 10, 'severe': 40},
            'calibration': '3% ability and 25% form weighting selected as stability compromise; other parameters are explicit prototype assumptions',
            'career_assumption': 'current age-conditioned annual exit probability held constant in each valuation; recalculated as replay age advances',
            'terminal_assumption': 'after the known season, 82 evenly spaced opportunities/year forever, weighted by career survival; no resale-value shortcut'}


def payout_per_share(score):
    return round(CONFIG.dollars_per_score * max(0., float(score)), 8)


def update_expectations(ability, form, score):
    x = max(0., float(score))
    surprise = max(-CONFIG.max_ability_surprise, min(CONFIG.max_ability_surprise, x - ability))
    return (ability + CONFIG.ability_alpha * surprise,
            form + CONFIG.form_alpha * (x - form))


def projected_score(ability, form, k=0, weight=None):
    return max(0., ability + (CONFIG.form_weight if weight is None else weight) * (form-ability) * CONFIG.form_decay ** k)


def annual_exit(age):
    return min(CONFIG.annual_exit_cap, CONFIG.annual_exit_base + CONFIG.annual_exit_age_coefficient * max(0., age-CONFIG.annual_exit_age_start)**2)


def availability(status='', level=''):
    healthy = CONFIG.healthy_availability
    first = {'Out': 0., 'Doubtful': .15, 'Questionable': .5, 'Probable': .85}.get(status, healthy)
    tau = {'minor': 3., 'moderate': 10., 'severe': 40.}.get(level, 3.)
    return first, tau


@lru_cache(maxsize=4096)
def day_end(day):
    return datetime.fromisoformat(day).replace(tzinfo=timezone.utc).timestamp() + 86400


def dividend_value(ability, form, *, age=27., as_of=OPENING_T, schedule=(),
                   excluded=(), status='', level='', weight=None, required_return=None):
    """Exact PV of known remaining team schedule plus an analytic infinite continuation.

    No future player results, injuries, actual appearances or future retirement
    dates are read. Schedule entries are team fixtures, not player appearances.
    Excluded fixtures belong to detached entitlement holders; still advance k.
    """
    first, tau = availability(status, level)
    a = CONFIG.healthy_availability
    gap, beta = a-first, math.exp(-1/tau)
    b = (CONFIG.form_weight if weight is None else weight) * (form-ability)
    rho = CONFIG.form_decay
    rate = CONFIG.annual_required_return if required_return is None else required_return
    hazard = math.log1p(rate) - math.log1p(-annual_exit(age))
    k, pv = 0, 0.
    for day in schedule:
        due = day_end(day)
        if due <= as_of:
            continue
        if day not in excluded:
            years = (due-as_of)/YEAR_SECONDS
            pv += math.exp(-hazard*years) * (a-gap*beta**k) * (ability+b*rho**k)
        k += 1
    # Scheduled 2024-25 fixtures end in April. The continuation begins next October.
    # Standalone fixtures without calendar data instead use evenly spaced future games.
    tail_start = NEXT_SEASON_T if schedule else as_of + YEAR_SECONDS / CONFIG.annual_game_opportunities
    tail_start = max(tail_start, as_of)
    gamma = math.exp(-hazard / CONFIG.annual_game_opportunities)
    tail = (a*ability/(1-gamma) + a*b*rho**k/(1-gamma*rho)
            - gap*ability*beta**k/(1-gamma*beta)
            - gap*b*(rho*beta)**k/(1-gamma*rho*beta))
    pv += math.exp(-hazard*(tail_start-as_of)/YEAR_SECONDS) * tail
    return max(0., CONFIG.dollars_per_score * pv)


def expected_fixture_payout(ability, form, status='', level=''):
    return CONFIG.dollars_per_score * availability(status, level)[0] * projected_score(ability, form)


def payout_cents(qty, rate):
    from decimal import Decimal, ROUND_HALF_UP
    return int((Decimal(qty) * Decimal(str(rate)) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
