"""P2-22: holders earn HOOP from player performances, recorded so they can see why their cash changed."""

import json

import anyio
import pytest

from trading.accounts import create_guest_user
from trading.adapters import TradesAdapter
from trading.db import Database
from trading.fake_market import (
    PAYOUT_HOOP_PER_GAME_SCORE,
    SESSION_MARKET_MINUTES,
    TICKS_PER_MARKET_MINUTE,
    FakeMarket,
)
from trading.market_contract import PerformancePayout
from trading.orders import place_market_order
from trading.payouts import PayoutProcessor, apply_payout, payout_cents
from trading.portfolio import build_portfolio
from trading.tests.conftest import auth


@pytest.fixture
def setup():
    db = Database(":memory:")
    market = FakeMarket(seed=41)
    return db, market


def payout(symbol="SGA", hoop=0.6, score=30.0):
    return PerformancePayout(1729560000.0, symbol, hoop, score, f"{symbol}: {score:g} Game Score")


def cash(db, user_id):
    return db.conn.execute("SELECT cash_cents FROM users WHERE user_id = ?", (user_id,)).fetchone()[0]


def assert_pnl_adds_up(db, market, user_id):
    v = build_portfolio(db, market, user_id)
    assert v.total_pnl_cents == v.realised_cents + v.unrealised_cents - v.fees_cents + v.payouts_cents


# --- The fake market announces payouts -----------------------------------------------------

def test_final_whistle_pays_0_02_per_game_score_point(setup):
    db, market = setup
    [event] = market.final_whistle({"SGA": 31.5})
    assert (event.symbol, event.game_score) == ("SGA", 31.5)
    assert event.hoop_per_share == pytest.approx(31.5 * PAYOUT_HOOP_PER_GAME_SCORE)
    assert event.reason == "Shai Gilgeous-Alexander: 31.5 Game Score"


def test_bad_games_pay_nothing(setup):
    db, market = setup
    [event] = market.final_whistle({"FOX": -3.0})
    assert event.hoop_per_share == 0


def test_payouts_come_every_game_day(setup):
    db, market = setup
    payouts = []
    for _ in range(TICKS_PER_MARKET_MINUTE * SESSION_MARKET_MINUTES * 2):  # two game days (2 real minutes)
        payouts += [e for e in market.step() if isinstance(e, PerformancePayout)]
    days = {e.t for e in payouts}
    assert len(days) == 2
    assert 0 < len(payouts) <= 2 * len(market.players())


# --- Paying holders --------------------------------------------------------------------------

def test_holders_are_paid_qty_times_payout(setup):
    db, market = setup
    a, b, nobody = (create_guest_user(db).user_id for _ in range(3))
    place_market_order(db, market, a, "SGA", "buy", 10)
    place_market_order(db, market, b, "SGA", "buy", 3)
    before = {u: cash(db, u) for u in (a, b, nobody)}

    paid = apply_payout(db, payout("SGA", 0.6))

    assert {(p.user_id, p.qty_held, p.amount_cents) for p in paid} == {(a, 10, 600), (b, 3, 180)}
    assert cash(db, a) - before[a] == 600
    assert cash(db, b) - before[b] == 180
    assert cash(db, nobody) == before[nobody]


def test_each_payment_is_recorded(setup):
    db, market = setup
    user = create_guest_user(db).user_id
    place_market_order(db, market, user, "LUKA", "buy", 7)
    apply_payout(db, payout("LUKA", 0.537, 26.85))
    row = db.conn.execute("SELECT * FROM payouts WHERE user_id = ?", (user,)).fetchone()
    assert (row["symbol"], row["qty_held"], row["hoop_per_share"], row["amount_cents"], row["game_score"]) == (
        "LUKA", 7, 0.537, 376, 26.85)  # 7 x 0.537 = 3.759 -> 3.76
    assert row["reason"] == "LUKA: 26.85 Game Score"


def test_rounding_is_half_up_per_holder():
    assert payout_cents(1, 0.005) == 1
    assert payout_cents(3, 0.1234) == 37
    assert payout_cents(-4, 0.6) == -240  # a short seller pays (P2-14)


def test_zero_payout_changes_nothing(setup):
    db, market = setup
    user = create_guest_user(db).user_id
    place_market_order(db, market, user, "FOX", "buy", 5)
    assert apply_payout(db, payout("FOX", 0.0, -3.0)) == []
    assert db.conn.execute("SELECT count(*) FROM payouts").fetchone()[0] == 0


def test_profit_adds_up_with_payouts(setup):
    db, market = setup
    user = create_guest_user(db).user_id
    place_market_order(db, market, user, "TATUM", "buy", 20)
    apply_payout(db, payout("TATUM", 0.45))
    place_market_order(db, market, user, "TATUM", "sell", 8)
    apply_payout(db, payout("TATUM", 0.3))
    view = build_portfolio(db, market, user)
    assert view.payouts_cents == 20 * 45 + 12 * 30
    assert_pnl_adds_up(db, market, user)


def test_payouts_survive_a_mission_reset_and_restore(setup):
    db, market = setup
    user = create_guest_user(db).user_id
    adapter = TradesAdapter(db, lambda: market)
    place_market_order(db, market, user, "SGA", "buy", 10)
    apply_payout(db, payout("SGA", 0.5))
    before = build_portfolio(db, market, user)

    adapter.apply_start_state(user, 100_000.0, [])
    assert build_portfolio(db, market, user).payouts_cents == 0        # missions start fresh
    adapter.restore_start_state(user)
    after = build_portfolio(db, market, user)
    assert after.payouts_cents == before.payouts_cents == 500          # and the real account keeps its payouts
    assert_pnl_adds_up(db, market, user)


def test_processor_listens_to_the_market_and_notifies(setup):
    db, market = setup
    user = create_guest_user(db).user_id
    place_market_order(db, market, user, "JOKIC", "buy", 4)
    private, public = [], []
    processor = PayoutProcessor(db, market, notify_user=lambda u, m: private.append((u, m)),
                                notify_public=public.append)
    paid = processor.handle(payout("JOKIC", 0.7, 35))
    assert len(paid) == 1
    [(to, message)] = private
    assert (to, message["type"], message["amount"], message["qty_held"]) == (user, "payout", 2.8, 4)
    assert public[0] == {"type": "payout_announced", "symbol": "JOKIC", "hoop_per_share": 0.7,
                         "game_score": 35, "reason": "JOKIC: 35 Game Score", "t": 1729560000.0}


# --- Through the API ----------------------------------------------------------------------

def recv_until(ws, wanted, timeout_s=4.0):
    async def get():
        with anyio.fail_after(timeout_s):
            return await ws._send_rx.receive()
    for _ in range(50):
        message = ws.portal.call(get)
        ws._raise_on_close(message)
        data = json.loads(message["text"])
        if data["type"] == wanted:
            return data
    raise AssertionError(f"never got {wanted}")


def test_payout_reaches_the_api_and_the_websocket(client):
    from trading.market_provider import get_market

    session = client.post("/trading/guest").json()
    headers = auth(session["token"])
    client.post("/trading/orders", headers=headers, json={"symbol": "CURRY", "side": "buy", "qty": 10})
    cash_before = client.get("/trading/portfolio", headers=headers).json()["cash"]

    with client.websocket_connect(f"/trading/ws?token={session['token']}") as ws:
        recv_until(ws, "hello")
        client.portal.call(lambda: _whistle(get_market()))   # final whistle on the app's event loop
        announced = recv_until(ws, "payout_announced")
        mine = recv_until(ws, "payout")
    assert announced["symbol"] == "CURRY"
    assert (mine["symbol"], mine["qty_held"], mine["amount"]) == ("CURRY", 10, 6.4)  # 10 x 32 x 0.02

    portfolio = client.get("/trading/portfolio", headers=headers).json()
    assert portfolio["payouts_received"] == 6.4
    assert portfolio["cash"] == pytest.approx(cash_before + 6.4, abs=0.001)
    history = client.get("/trading/payouts", headers=headers).json()
    assert [(p["symbol"], p["amount"], p["reason"]) for p in history] == [
        ("CURRY", 6.4, "Stephen Curry: 32 Game Score")]
    assert client.get("/trading/payouts").status_code == 401


async def _whistle(market):
    market.final_whistle({"CURRY": 32.0})
