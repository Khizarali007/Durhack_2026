"""P2-16: equity history once per market minute, and max drawdown from it."""

import time
from types import SimpleNamespace

import pytest

from trading.accounts import create_guest_user
from trading.adapters import TradesAdapter
from trading.db import Database
from trading.equity import EquityRecorder, equity_history, max_drawdown, snapshot_equity
from trading.fake_market import FakeMarket
from trading.market_provider import get_market
from trading.orders import place_market_order
from trading.portfolio import build_portfolio
from trading.tests.conftest import auth


@pytest.fixture
def setup():
    db = Database(":memory:")
    market = FakeMarket(seed=16)
    for _ in range(9):  # so the next tick starts a market minute and step_minute sees exactly one boundary
        market.step()
    return db, market, create_guest_user(db).user_id, EquityRecorder(db, market)


def move_price(market, symbol, factor):
    m = market._markets[symbol]
    m.fair_cents *= factor
    m.last_cents = round(m.last_cents * factor)


def step_minute(market, recorder):
    """One market minute: 10 ticks, the recorder seeing each one."""
    written = 0
    for _ in range(10):
        market.step()
        written += recorder.on_tick(market.market_time())
    return written


# --- Max drawdown -------------------------------------------------------------------------------

def test_max_drawdown_is_the_biggest_fall_from_a_running_peak():
    series = [(1, 100), (2, 120), (3, 90), (4, 130), (5, 104), (6, 125), (7, 110)]
    dd = max_drawdown(series)
    assert (dd.amount_cents, dd.peak_t, dd.trough_t, dd.peak_cents) == (30, 2, 3, 130)  # 120 -> 90 beats 130 -> 104
    assert dd.pct == 25.0


def test_a_deeper_later_fall_wins():
    dd = max_drawdown([(1, 100), (2, 80), (3, 150), (4, 90)])
    assert (dd.amount_cents, dd.pct, dd.peak_t, dd.trough_t) == (60, 40.0, 3, 4)


@pytest.mark.parametrize("series", [[], [(1, 100)], [(1, 100), (2, 100), (3, 150)]])
def test_never_falling_means_no_drawdown(series):
    dd = max_drawdown(series)
    assert (dd.amount_cents, dd.pct, dd.peak_t, dd.trough_t) == (0, 0.0, None, None)


# --- Recording ----------------------------------------------------------------------------------

def test_one_point_per_market_minute_matching_the_portfolio(setup):
    db, market, user_id, recorder = setup
    place_market_order(db, market, user_id, "SGA", "buy", 20)
    place_market_order(db, market, user_id, "JOKIC", "short", 5)
    for _ in range(4):
        assert step_minute(market, recorder) == 1                  # then exactly once a minute
    points = equity_history(db, user_id)
    assert len(points) == 4
    assert [round(b.t - a.t) for a, b in zip(points, points[1:])] == [60, 60, 60]

    snapshot_equity(db, market, market.market_time())
    last = equity_history(db, user_id)[-1]
    view = build_portfolio(db, market, user_id)
    assert (last.equity_cents, last.cash_cents, last.positions_value_cents) == (
        view.equity_cents, view.cash_cents, view.positions_value_cents)
    assert last.total_pnl_cents == view.total_pnl_cents


def test_untouched_guests_are_skipped(setup):
    db, market, user_id, recorder = setup
    idle = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 1)
    step_minute(market, recorder)
    assert equity_history(db, idle) == [] and len(equity_history(db, user_id)) == 1


def test_closed_out_accounts_keep_being_recorded(setup):
    db, market, user_id, recorder = setup
    place_market_order(db, market, user_id, "SGA", "buy", 5)
    place_market_order(db, market, user_id, "SGA", "sell", 5)
    step_minute(market, recorder)
    [p] = equity_history(db, user_id)
    assert p.positions_value_cents == 0 and p.equity_cents == p.cash_cents < 10_000_000


def test_since_t_and_limit(setup):
    db, market, user_id, recorder = setup
    place_market_order(db, market, user_id, "SGA", "buy", 1)
    for _ in range(5):
        step_minute(market, recorder)
    points = equity_history(db, user_id)
    assert [p.t for p in equity_history(db, user_id, since_t=points[2].t)] == [p.t for p in points[2:]]
    assert [p.t for p in equity_history(db, user_id, limit=2)] == [p.t for p in points[-2:]]


# --- Missions and Person 4 ------------------------------------------------------------------------

def test_mission_reset_and_restore_record_a_point_straight_away(setup):
    db, market, user_id, recorder = setup
    adapter = TradesAdapter(db, lambda: market)
    adapter.apply_start_state(user_id, 20_000.0, [SimpleNamespace(symbol="WEMBY", qty=50, avg_cost=105.0)])
    [start] = equity_history(db, user_id)
    assert start.t == market.market_time() and start.baseline_cents == 2_525_000
    assert start.equity_cents == 2_000_000 + 50 * round(market.last_price("WEMBY") * 100)

    market.step()
    adapter.restore_start_state(user_id)
    assert equity_history(db, user_id)[-1].equity_cents == 10_000_000


def test_person_4_can_work_out_max_drawdown_from_it(setup):
    """The ticket's 'done when': a storm, then the report card's max drawdown from the adapter's points."""
    db, market, user_id, recorder = setup
    adapter = TradesAdapter(db, lambda: market)
    adapter.apply_start_state(user_id, 50_000.0, [SimpleNamespace(symbol="WEMBY", qty=200, avg_cost=105.0)])
    mission_start = market.market_time()
    for factor in (1.05, 1.04, 0.9, 0.8, 0.95, 1.1):  # up, then the storm, then a bounce
        move_price(market, "WEMBY", factor)
        step_minute(market, recorder)

    history = adapter.equity_history(user_id, since_t=mission_start)
    assert all(isinstance(p.t, float) and isinstance(p.equity, float) for p in history)

    # Worked out the way Person 4's evaluator would, from floats:
    peak, worst = history[0].equity, 0.0
    for p in history:
        peak = max(peak, p.equity)
        worst = max(worst, (peak - p.equity) / peak)
    assert worst > 0.05

    ours = max_drawdown([(p.t, round(p.equity * 100)) for p in history])
    assert ours.pct == pytest.approx(100 * worst, abs=0.01)
    assert ours.peak_t < ours.trough_t


# --- Over the API ----------------------------------------------------------------------------------

def test_equity_history_over_the_api(client, db):
    session = client.post("/trading/session").json()
    headers, user_id = auth(session["token"]), session["user_id"]
    assert client.post("/trading/orders", headers=headers, json={"symbol": "SGA", "side": "buy", "qty": 10}).status_code == 200
    market = get_market()
    for i in range(3):
        snapshot_equity(db, market, 1_000_000.0 + 60 * i, [user_id])

    body = client.get("/trading/equity-history", headers=headers).json()
    assert body["interval_s"] == 60.0 and len(body["points"]) >= 3
    first = body["points"][0]
    assert set(first) == {"t", "equity", "cash", "positions_value", "total_pnl"}
    assert first["equity"] == pytest.approx(first["cash"] + first["positions_value"], abs=0.01)
    portfolio = client.get("/trading/portfolio", headers=headers).json()
    assert body["current_equity"] == pytest.approx(portfolio["equity"], abs=1.0)
    assert body["max_drawdown"] >= 0 and body["max_drawdown_pct"] >= 0
    assert body["start_equity"] == first["equity"]

    later = client.get("/trading/equity-history", headers=headers, params={"since_t": 1_000_060.0, "limit": 1}).json()
    assert len(later["points"]) == 1
    assert client.get("/trading/equity-history").status_code == 401


def test_the_live_app_records_every_market_minute(client):
    session = client.post("/trading/session").json()
    headers = auth(session["token"])
    client.post("/trading/orders", headers=headers, json={"symbol": "LUKA", "side": "buy", "qty": 3})
    deadline = time.time() + 7  # a market minute is 5 real seconds
    while time.time() < deadline:
        points = client.get("/trading/equity-history", headers=headers).json()["points"]
        if points:
            break
        time.sleep(0.25)
    assert len(points) == 1 and points[0]["t"] % 60 == 0  # recorded on the minute (the fake starts at midnight)
