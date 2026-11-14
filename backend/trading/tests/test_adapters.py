"""P2-21: Person 4's TradesAdapter, backed by the real trading database."""

import importlib
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace

import pytest

from trading.accounts import create_guest_user
from trading.adapters import TradesAdapter
from trading.db import Database
from trading.fake_market import FakeMarket
from trading.money import to_cents
from trading.open_orders import create_open_order, get_open_order
from trading.orders import place_market_order
from trading.portfolio import build_portfolio
from trading.resets import has_snapshot
from trading.tests.conftest import auth

REPO = Path(__file__).resolve().parents[3]


@pytest.fixture
def setup():
    db = Database(":memory:")
    market = FakeMarket(seed=31)
    user_id = create_guest_user(db).user_id
    return db, market, user_id, TradesAdapter(db, lambda: market)


def pos(symbol, qty, avg_cost):
    return SimpleNamespace(symbol=symbol, qty=qty, avg_cost=avg_cost)  # like Person 4's Position model


def assert_pnl_adds_up(db, market, user_id):
    v = build_portfolio(db, market, user_id)
    assert v.total_pnl_cents == v.realised_cents + v.unrealised_cents - v.fees_cents + v.payouts_cents


# --- Reading ---------------------------------------------------------------------------

def test_trades_for_user_has_person_4s_fields(setup):
    db, market, user_id, adapter = setup
    outcome = place_market_order(db, market, user_id, "SGA", "buy", 15)
    trades = adapter.trades_for_user(user_id)
    assert [t.trade_id for t in trades] == [f.trade_id for f in outcome.fills]
    t = trades[0]
    assert set(asdict(t)) == {"trade_id", "user_id", "symbol", "side", "qty", "price", "fee", "t", "reason"}
    assert (t.user_id, t.symbol, t.side, t.reason) == (user_id, "SGA", "buy", "market")
    assert isinstance(t.qty, float) and t.price == outcome.fills[0].price_cents / 100


def test_since_t_is_inclusive(setup):
    db, market, user_id, adapter = setup
    place_market_order(db, market, user_id, "SGA", "buy", 2)
    for _ in range(3):
        market.step()
    second = place_market_order(db, market, user_id, "LUKA", "buy", 2)
    cutoff = second.fills[0].t
    assert {t.symbol for t in adapter.trades_for_user(user_id, since_t=cutoff)} == {"LUKA"}
    assert adapter.trades_for_user(user_id, since_t=cutoff + 1) == []
    assert adapter.trades_for_user("u_nobody") == []


def test_portfolio_matches_the_trading_api(setup):
    db, market, user_id, adapter = setup
    place_market_order(db, market, user_id, "WEMBY", "buy", 12)
    p = adapter.portfolio(user_id)
    view = build_portfolio(db, market, user_id)
    assert (p.cash, p.equity) == (view.cash_cents / 100, view.equity_cents / 100)
    [position] = p.positions
    assert (position.symbol, position.qty) == ("WEMBY", 12.0)
    assert position.avg_cost == pytest.approx(view.positions[0].avg_cost_cents / 100)


# --- Mission resets ----------------------------------------------------------------------

def test_apply_start_state_sets_exactly_that_account(setup):
    db, market, user_id, adapter = setup
    place_market_order(db, market, user_id, "SGA", "buy", 20)
    order = create_open_order(db, market, user_id, symbol="SGA", side="sell", order_type="stop", qty=20,
                              price_cents=to_cents(market.last_price("SGA")) - 1000)

    adapter.apply_start_state(user_id, 50_000.0, [pos("JOKIC", 10, 155.5)])

    p = adapter.portfolio(user_id)
    assert p.cash == 50_000.0
    assert [(x.symbol, x.qty, x.avg_cost) for x in p.positions] == [("JOKIC", 10.0, 155.5)]
    assert get_open_order(db, order.order_id).status == "cancelled"   # nothing reserved is left behind
    assert len(adapter.trades_for_user(user_id)) >= 1                   # history is kept
    view = build_portfolio(db, market, user_id)
    assert view.starting_cash_cents == 50_000_00 + 10 * 155_50           # profit/loss starts again from here
    assert (view.realised_cents, view.fees_cents) == (0, 0)
    assert_pnl_adds_up(db, market, user_id)


def test_mission_1_start_state_is_100k_and_nothing(setup):
    db, market, user_id, adapter = setup
    place_market_order(db, market, user_id, "CURRY", "buy", 30)
    adapter.apply_start_state(user_id, 100_000.0, [])
    p = adapter.portfolio(user_id)
    assert (p.cash, p.equity, p.positions) == (100_000.0, 100_000.0, [])


def test_trading_after_a_reset_adds_up_including_the_starting_shares(setup):
    db, market, user_id, adapter = setup
    adapter.apply_start_state(user_id, 20_000.0, [pos("TATUM", 30, 110.0)])
    place_market_order(db, market, user_id, "TATUM", "sell", 10)   # sells shares the mission gave
    place_market_order(db, market, user_id, "SGA", "buy", 5)
    place_market_order(db, market, user_id, "TATUM", "sell", 20)
    view = build_portfolio(db, market, user_id)
    assert [p.symbol for p in view.positions] == ["SGA"]
    assert view.realised_cents != 0
    assert_pnl_adds_up(db, market, user_id)


def test_restore_brings_back_the_real_account(setup):
    db, market, user_id, adapter = setup
    place_market_order(db, market, user_id, "LUKA", "buy", 25)
    place_market_order(db, market, user_id, "LUKA", "sell", 5)
    before = build_portfolio(db, market, user_id)

    adapter.apply_start_state(user_id, 100_000.0, [])
    place_market_order(db, market, user_id, "SGA", "buy", 40)          # mission trading
    adapter.apply_start_state(user_id, 100_000.0, [])                  # mission replayed: snapshot kept
    assert has_snapshot(db, user_id)

    assert adapter.restore_start_state(user_id) is True
    after = build_portfolio(db, market, user_id)
    assert after.cash_cents == before.cash_cents
    assert [(p.symbol, p.qty, p.cost_basis_cents) for p in after.positions] == [
        (p.symbol, p.qty, p.cost_basis_cents) for p in before.positions]
    assert (after.starting_cash_cents, after.realised_cents, after.fees_cents) == (
        before.starting_cash_cents, before.realised_cents, before.fees_cents)
    assert_pnl_adds_up(db, market, user_id)
    assert adapter.restore_start_state(user_id) is False                # nothing left to restore


def test_reset_validation(setup):
    db, market, user_id, adapter = setup
    with pytest.raises(ValueError, match="unknown symbol"):
        adapter.apply_start_state(user_id, 1000.0, [pos("NOPE", 1, 10.0)])
    with pytest.raises(ValueError, match="can't be negative"):
        adapter.apply_start_state(user_id, 1000.0, [pos("SGA", -5, -150.0)])
    with pytest.raises(ValueError, match="whole shares"):
        adapter.apply_start_state(user_id, 1000.0, [pos("SGA", 2.5, 150.0)])
    with pytest.raises(KeyError):
        adapter.apply_start_state("u_nobody", 1000.0, [])


# --- Against Person 4's real code ----------------------------------------------------------

@pytest.fixture
def person4(tmp_path):
    """Person 4's `learning` package, taken straight from their branch."""
    archive = subprocess.run(["git", "-C", str(REPO), "archive", "origin/person4-learning", "backend/learning"],
                             capture_output=True)
    if archive.returncode != 0:
        pytest.skip("person4-learning branch not available locally (git fetch to include this test)")
    subprocess.run(["tar", "-x", "-C", str(tmp_path)], input=archive.stdout, check=True)
    sys.path.insert(0, str(tmp_path / "backend"))
    try:
        yield SimpleNamespace(models=importlib.import_module("learning.adapters.models"),
                              base=importlib.import_module("learning.adapters.base"),
                              evaluators=importlib.import_module("learning.evaluators"))
    finally:
        sys.path.remove(str(tmp_path / "backend"))
        for name in [m for m in sys.modules if m == "learning" or m.startswith("learning.")]:
            del sys.modules[name]


def test_person_4s_protocol_accepts_our_adapter(setup, person4):
    *_, adapter = setup
    assert isinstance(adapter, person4.base.TradesAdapter)


def test_person_4s_models_accept_our_objects(setup, person4):
    db, market, user_id, adapter = setup
    place_market_order(db, market, user_id, "SGA", "buy", 8)
    for trade in adapter.trades_for_user(user_id):
        person4.models.Trade.model_validate(asdict(trade))
    person4.models.Portfolio.model_validate(asdict(adapter.portfolio(user_id)))


def test_person_4s_evaluator_scores_our_trades(setup, person4):
    db, market, user_id, adapter = setup
    adapter.apply_start_state(user_id, 100_000.0,
                              [person4.models.Position(symbol="SGA", qty=0, avg_cost=0)])  # their model works too
    place_market_order(db, market, user_id, "SGA", "buy", 100)
    for _ in range(20):
        market.step()
    place_market_order(db, market, user_id, "SGA", "sell", 100)
    rt = person4.evaluators.round_trip(adapter.trades_for_user(user_id), "SGA")
    assert (rt.qty_bought, rt.qty_sold, rt.qty_held) == (100, 100, 0)
    ours = build_portfolio(db, market, user_id)
    # Their realised profit puts buy fees in the cost basis; ours keeps fees separate. Same money either way:
    assert rt.realised_pnl == pytest.approx((ours.realised_cents - ours.fees_cents) / 100, abs=0.01)


# --- Through the API ------------------------------------------------------------------------

def test_restore_endpoint(client):
    session = client.post("/trading/guest").json()
    headers = auth(session["token"])
    assert client.post("/trading/account/restore", headers=headers).status_code == 404
    client.post("/trading/orders", headers=headers, json={"symbol": "SGA", "side": "buy", "qty": 4})

    client.app.state.trades_adapter.apply_start_state(session["user_id"], 100_000.0, [])  # a mission starts
    assert client.get("/trading/portfolio", headers=headers).json()["positions"] == []

    assert client.post("/trading/account/restore", headers=headers).json() == {"restored": True}
    positions = client.get("/trading/portfolio", headers=headers).json()["positions"]
    assert [(p["symbol"], p["qty"]) for p in positions] == [("SGA", 4)]
    assert client.post("/trading/account/restore").status_code == 401
