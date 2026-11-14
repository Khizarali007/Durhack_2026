"""P2-15: 3x leverage, margin warnings, margin calls and liquidation.

The ticket's 'done when': a 3x position gets a margin call, then is liquidated,
during a storm.
"""

import pytest

from trading.accounts import create_guest_user
from trading.adapters import TradesAdapter
from trading.db import Database
from trading.fake_market import FakeMarket
from trading.margin import (
    LIQUIDATION_TARGET,
    MARGIN_CALL_GRACE_S,
    MarginMonitor,
    margin_view,
    next_status,
    raw_status,
)
from trading.market_provider import get_market
from trading.money import to_cents
from trading.open_orders import create_open_order, get_open_order
from trading.orders import (
    NOT_ENOUGH_BUYING_POWER,
    OrderError,
    buying_power,
    exposure,
    place_market_order,
)
from trading.tests.conftest import auth
from trading.tests.test_live import recv_until


class Recorder:
    def __init__(self):
        self.messages, self.fills = [], []

    def notify(self, user_id, message):
        self.messages.append((user_id, message))

    def of(self, kind):
        return [m for _, m in self.messages if m["type"] == kind]


@pytest.fixture
def setup():
    db = Database(":memory:")
    market = FakeMarket(seed=15)
    user_id = create_guest_user(db).user_id
    rec = Recorder()
    monitor = MarginMonitor(db, market, on_fill=rec.fills.append, notify_user=rec.notify)
    return db, market, user_id, monitor, rec


def move_price(market, symbol, factor):
    m = market._markets[symbol]
    m.fair_cents *= factor
    m.last_cents = round(m.last_cents * factor)


def set_cash(db, user_id, cents):
    with db.lock, db.conn:
        db.conn.execute("UPDATE users SET cash_cents = ? WHERE user_id = ?", (cents, user_id))


def go_3x_long(db, market, user_id, symbol="WEMBY"):
    """5,000 HOOP of equity, levered up to about 15,000 of one player."""
    set_cash(db, user_id, 500_000)
    outcome = place_market_order(db, market, user_id, symbol, "buy", 1000, leverage=3)
    assert outcome.reason == NOT_ENOUGH_BUYING_POWER  # it stopped at 3x, not at the makers
    return outcome


def slide(market, monitor, symbol, until, t=None, factor=0.99):
    """The storm: move the price 1% at a time, checking margins each step, until ``until`` happens."""
    t = market.market_time() if t is None else t
    events = []
    for _ in range(80):
        move_price(market, symbol, factor)
        t += 6
        events += monitor.check(t).values()
        if until in events:
            return events, t
    raise AssertionError(f"never got {until}: {events}")


def ratio(db, market, user_id):
    return exposure(db, market, user_id).margin_ratio


def liquidation_trades(db, user_id):
    return db.conn.execute("SELECT side, qty FROM trades WHERE user_id = ? AND reason = 'liquidation'",
                           (user_id,)).fetchall()


# --- The rules -------------------------------------------------------------------------------

@pytest.mark.parametrize("r, status", [
    (None, "ok"), (1.0, "ok"), (0.30, "ok"), (0.2999, "warning"), (0.25, "warning"),
    (0.2499, "margin_call"), (0.20, "margin_call"), (0.1999, "liquidate"), (-0.5, "liquidate"),
])
def test_status_bands(r, status):
    assert raw_status(r) == status


def test_getting_better_needs_a_point_of_headroom():
    assert next_status(0.305, "warning") == "warning"      # wobbling around 30%: no flood of messages
    assert next_status(0.311, "warning") == "ok"
    assert next_status(0.255, "margin_call") == "margin_call"
    assert next_status(0.262, "margin_call") == "warning"
    assert next_status(0.24, "ok") == "margin_call"         # getting worse is immediate


# --- Leverage --------------------------------------------------------------------------------

def test_buying_power_is_leverage_times_equity_minus_exposure(setup):
    db, market, user_id, *_ = setup
    assert buying_power(db, market, user_id, 1) == 10_000_000
    assert buying_power(db, market, user_id, 3) == 30_000_000
    place_market_order(db, market, user_id, "SGA", "buy", 100)
    e = exposure(db, market, user_id)
    assert buying_power(db, market, user_id, 3) == 3 * e.equity_cents - e.gross_cents


def test_a_3x_buy_borrows_and_reaches_three_times_equity(setup):
    db, market, user_id, *_ = setup
    set_cash(db, user_id, 500_000)
    one_x = place_market_order(db, market, user_id, "WEMBY", "buy", 1000).filled_qty
    place_market_order(db, market, user_id, "WEMBY", "sell", one_x)

    outcome = go_3x_long(db, market, user_id)
    e = exposure(db, market, user_id)
    assert outcome.leverage == 3 and outcome.filled_qty > 2.5 * one_x
    assert e.cash_cents < 0                       # a margin loan
    # About 3x. A bit under, because buying pushed the price up and shares are marked at the last trade.
    assert 2.6 < e.gross_cents / e.equity_cents <= 3.0
    assert 0.33 <= e.margin_ratio < 0.39


def test_leverage_must_be_1_to_3(setup):
    db, market, user_id, *_ = setup
    with pytest.raises(OrderError, match="leverage must be 1 to 3"):
        place_market_order(db, market, user_id, "SGA", "buy", 1, leverage=4)


def test_cant_add_while_over_leveraged_but_can_always_reduce(setup):
    db, market, user_id, *_ = setup
    monitor = MarginMonitor(db, market)
    go_3x_long(db, market, user_id)
    slide(market, monitor, "WEMBY", "warning")
    assert buying_power(db, market, user_id, 3) < 0
    with pytest.raises(OrderError, match="buying power"):
        place_market_order(db, market, user_id, "SGA", "buy", 1, leverage=3)
    with pytest.raises(OrderError):
        place_market_order(db, market, user_id, "SGA", "short", 1, leverage=3)
    sold = place_market_order(db, market, user_id, "WEMBY", "sell", 50)
    assert sold.filled_qty == 50 and ratio(db, market, user_id) > 0.3


def test_a_3x_short_works_too(setup):
    db, market, user_id, *_ = setup
    set_cash(db, user_id, 500_000)
    outcome = place_market_order(db, market, user_id, "SGA", "short", 1000, leverage=3)
    assert outcome.reason == NOT_ENOUGH_BUYING_POWER and outcome.leverage == 3
    e = exposure(db, market, user_id)
    assert 2.6 < e.gross_cents / e.equity_cents <= 3.0 and e.cash_cents > 0


# --- Warning, margin call, liquidation ---------------------------------------------------------

def test_storm_warning_then_margin_call_then_liquidation(setup):
    """The 'done when': a 3x position is margin-called, then liquidated, as the price slides."""
    db, market, user_id, monitor, rec = setup
    go_3x_long(db, market, user_id)
    t = market.market_time()
    assert monitor.check(t) == {}  # a fresh 3x position is fine

    events, call_t = slide(market, monitor, "WEMBY", "margin_call", t)
    assert events == ["warning", "margin_call"]
    [warning, call] = rec.of("margin")
    assert warning["status"] == "warning" and 25 <= warning["margin_ratio_pct"] < 30
    assert call["status"] == "margin_call" and 20 <= call["margin_ratio_pct"] < 25
    assert call["deadline_t"] == call_t + MARGIN_CALL_GRACE_S
    assert "MARGIN CALL" in call["message"]
    view = margin_view(db, market, user_id)
    assert (view.status, view.deadline_t) == ("margin_call", call_t + MARGIN_CALL_GRACE_S)

    assert monitor.check(call_t + MARGIN_CALL_GRACE_S - 1) == {}  # still time to fix it
    assert liquidation_trades(db, user_id) == []

    assert monitor.check(call_t + MARGIN_CALL_GRACE_S) == {user_id: "liquidated"}
    sold = liquidation_trades(db, user_id)
    assert sold and {side for side, _ in sold} == {"sell"}
    assert ratio(db, market, user_id) >= 0.30
    liquidated = rec.of("margin")[-1]
    assert liquidated["event"] == "liquidated" and liquidated["liquidated"][0]["symbol"] == "WEMBY"
    assert [f["reason"] for f in rec.of("fill")] == ["liquidation"] * len(liquidated["liquidated"])
    assert rec.fills == [o["order_id"] for o in liquidated["liquidated"]]  # receipts queued
    assert margin_view(db, market, user_id).status in ("ok", "warning")
    assert margin_view(db, market, user_id).deadline_t is None


def test_fixing_it_in_time_cancels_the_margin_call(setup):
    db, market, user_id, monitor, rec = setup
    bought = go_3x_long(db, market, user_id).filled_qty
    _, t = slide(market, monitor, "WEMBY", "margin_call")
    place_market_order(db, market, user_id, "WEMBY", "sell", bought // 2)  # the player sells in time
    assert monitor.check(t + 6) == {user_id: "ok"}
    assert monitor.check(t + MARGIN_CALL_GRACE_S) == {}
    assert liquidation_trades(db, user_id) == []
    assert rec.of("margin")[-1]["event"] == "ok"


def test_a_gap_below_20_percent_liquidates_straight_away(setup):
    db, market, user_id, monitor, rec = setup
    go_3x_long(db, market, user_id)
    move_price(market, "WEMBY", 0.75)  # "ruled out for the season"
    assert ratio(db, market, user_id) < 0.20
    assert monitor.check(market.market_time()) == {user_id: "liquidated"}
    assert ratio(db, market, user_id) >= 0.30
    assert exposure(db, market, user_id).gross_cents > 0  # only what was needed was sold


def test_wiped_out_equity_closes_everything(setup):
    db, market, user_id, monitor, rec = setup
    go_3x_long(db, market, user_id)
    move_price(market, "WEMBY", 0.6)
    assert exposure(db, market, user_id).equity_cents <= 0
    monitor.check(market.market_time())
    e = exposure(db, market, user_id)
    assert e.gross_cents == 0 and e.cash_cents < 0  # the loss is more than the player had: they owe it
    assert db.conn.execute("SELECT count(*) FROM positions WHERE user_id = ?", (user_id,)).fetchone()[0] == 0


def test_a_short_squeeze_liquidates_by_covering(setup):
    db, market, user_id, monitor, rec = setup
    set_cash(db, user_id, 500_000)
    place_market_order(db, market, user_id, "CADE", "short", 1000)  # 1x: as much as free cash backs
    assert ratio(db, market, user_id) > 0.9
    move_price(market, "CADE", 1.75)
    assert monitor.check(market.market_time()) == {user_id: "liquidated"}
    assert {side for side, _ in liquidation_trades(db, user_id)} == {"cover"}
    assert ratio(db, market, user_id) is None or ratio(db, market, user_id) >= 0.30


def test_liquidation_cancels_open_orders(setup):
    db, market, user_id, monitor, rec = setup
    go_3x_long(db, market, user_id)
    last = to_cents(market.last_price("WEMBY"))
    stop = create_open_order(db, market, user_id, symbol="WEMBY", side="sell", order_type="stop", qty=10,
                             price_cents=last // 2)
    move_price(market, "WEMBY", 0.75)
    monitor.check(market.market_time())
    assert get_open_order(db, stop.order_id).status == "cancelled"


def test_unleveraged_long_accounts_are_never_margin_called(setup):
    db, market, user_id, monitor, rec = setup
    place_market_order(db, market, user_id, "SGA", "buy", 300)
    move_price(market, "SGA", 0.3)
    assert monitor.check(market.market_time()) == {}
    assert rec.messages == []


def test_mission_reset_clears_the_margin_status(setup):
    db, market, user_id, monitor, rec = setup
    go_3x_long(db, market, user_id)
    slide(market, monitor, "WEMBY", "margin_call")
    assert margin_view(db, market, user_id).status == "margin_call"
    TradesAdapter(db, lambda: market).apply_start_state(user_id, 10_000.0, [])
    assert margin_view(db, market, user_id).status == "ok"
    assert margin_view(db, market, user_id).deadline_t is None


# --- Over the API and the WebSocket ------------------------------------------------------------

def order(client, headers, symbol, side, qty, leverage=1):
    return client.post("/trading/orders", headers=headers,
                       json={"symbol": symbol, "side": side, "qty": qty, "leverage": leverage})


def test_leverage_and_margin_over_the_api(client, db):
    session = client.post("/trading/session").json()
    headers, user_id = auth(session["token"]), session["user_id"]
    set_cash(db, user_id, 500_000)

    quote = client.post("/trading/orders/quote", headers=headers,
                        json={"symbol": "FOX", "side": "buy", "qty": 100, "leverage": 3}).json()
    assert quote["leverage"] == 3 and any("3x leverage" in w for w in quote["warnings"])
    assert quote["available_cash"] == pytest.approx(15_000.0, rel=0.01)

    body = order(client, headers, "FOX", "buy", 100, leverage=3).json()
    assert body["leverage"] == 3 and body["cash"] < 0
    m = client.get("/trading/margin", headers=headers).json()
    assert m["status"] == "ok" and m["borrowed"] == -body["cash"]
    assert 1.5 < m["leverage"] <= 3.0
    assert client.get("/trading/portfolio", headers=headers).json()["margin"] == m

    assert order(client, headers, "FOX", "buy", 1, leverage=4).status_code == 422
    assert client.get("/trading/margin").status_code == 401


def test_margin_call_and_liquidation_arrive_over_the_websocket(client, db):
    session = client.post("/trading/session").json()
    headers, user_id = auth(session["token"]), session["user_id"]
    set_cash(db, user_id, 500_000)
    assert order(client, headers, "WEMBY", "buy", 1000, leverage=3).status_code == 200

    with client.websocket_connect(f"/trading/ws?token={session['token']}") as ws:
        recv_until(ws, "hello")
        move_price(get_market(), "WEMBY", 0.7)  # the storm: the live monitor sees it on the next tick
        liquidated = recv_until(ws, "margin", event="liquidated")
        assert liquidated["liquidated"] and liquidated["margin_ratio_pct"] >= 100 * 0.30
        fills = [t for t in client.get("/trading/trades", headers=headers).json() if t["reason"] == "liquidation"]
        assert fills and {t["side"] for t in fills} == {"sell"}
    assert LIQUIDATION_TARGET > 0.30
