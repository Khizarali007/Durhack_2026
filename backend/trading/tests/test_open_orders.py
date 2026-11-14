"""P2-11: limit and stop-loss orders wait for their price, fire as market orders, and hold back what they need."""

import time

import pytest

from trading.accounts import create_guest_user
from trading.db import Database
from trading.fake_market import FakeMarket
from trading.market_contract import MarketTick, Quote
from trading.money import to_cents
from trading.open_orders import (
    OrderWatcher,
    buy_reservation,
    cancel_open_order,
    create_open_order,
    get_open_order,
)
from trading.orders import OrderError, place_market_order
from trading.tests.conftest import auth


# --- Unit: the watcher with a market we step by hand ----------------------------------

@pytest.fixture
def setup():
    db = Database(":memory:")
    market = FakeMarket(seed=11)
    user = create_guest_user(db)
    fired = []
    watcher = OrderWatcher(db, market, on_fill=fired.append)
    return db, market, user.user_id, watcher, fired


def tick_with(market, symbol, **changes):
    """A tick where one symbol's quote is overridden (to trigger an order on purpose)."""
    quotes = {s: market.quote(s) for s in (p.symbol for p in market.players())}
    q = quotes[symbol]
    quotes[symbol] = Quote(symbol, changes.get("bid", q.bid), changes.get("ask", q.ask),
                           changes.get("last", q.last), q.fair_value, q.makers)
    return MarketTick(market.market_time(), quotes)


def test_buy_limit_waits_then_fires_when_the_ask_reaches_it(setup):
    db, market, user_id, watcher, fired = setup
    ask = market.quote("SGA").ask
    order = create_open_order(db, market, user_id, symbol="SGA", side="buy", order_type="limit",
                              qty=10, price_cents=to_cents(ask) - 300)
    assert watcher.check(tick_with(market, "SGA")) == []  # ask still above the limit
    assert get_open_order(db, order.order_id).status == "open"

    # The real ask is above the limit, so even if a tick says otherwise, nothing fills over the limit.
    watcher.check(tick_with(market, "SGA", ask=ask - 3))
    assert get_open_order(db, order.order_id).filled_qty == 0


def test_marketable_buy_limit_fills_at_or_under_the_limit(setup):
    db, market, user_id, watcher, fired = setup
    limit = to_cents(market.quote("SGA").ask) + 200
    order = create_open_order(db, market, user_id, symbol="SGA", side="buy", order_type="limit",
                              qty=10, price_cents=limit)
    [market_order] = watcher.check(tick_with(market, "SGA"))
    after = get_open_order(db, order.order_id)
    assert (after.status, after.filled_qty, after.reserved_cash_cents) == ("filled", 10, 0)
    assert after.last_fill_order_id == market_order == fired[0]
    rows = db.conn.execute("SELECT reason, price_cents FROM trades WHERE order_id = ?", (market_order,)).fetchall()
    assert {r[0] for r in rows} == {"limit"}
    assert all(r[1] <= limit for r in rows)


def test_buy_limit_stops_at_its_price_and_keeps_the_rest_open(setup):
    db, market, user_id, watcher, fired = setup
    ask = to_cents(market.quote("FOX").ask)
    order = create_open_order(db, market, user_id, symbol="FOX", side="buy", order_type="limit",
                              qty=400, price_cents=ask + 150)  # big: the ask climbs past the limit as it fills
    watcher.check(tick_with(market, "FOX"))
    after = get_open_order(db, order.order_id)
    assert after.status == "open"
    assert 0 < after.filled_qty < 400
    assert after.reserved_cash_cents == buy_reservation(400 - after.filled_qty, ask + 150)
    prices = [r[0] for r in db.conn.execute("SELECT price_cents FROM trades WHERE user_id = ?", (user_id,))]
    assert max(prices) <= ask + 150


def test_sell_limit_fires_when_the_bid_reaches_it(setup):
    db, market, user_id, watcher, fired = setup
    place_market_order(db, market, user_id, "LUKA", "buy", 10)
    bid = to_cents(market.quote("LUKA").bid)
    order = create_open_order(db, market, user_id, symbol="LUKA", side="sell", order_type="limit",
                              qty=10, price_cents=bid - 100)  # take-profit already reachable
    watcher.check(tick_with(market, "LUKA"))
    after = get_open_order(db, order.order_id)
    assert (after.status, after.filled_qty) == ("filled", 10)
    assert db.conn.execute("SELECT count(*) FROM positions WHERE user_id = ?", (user_id,)).fetchone()[0] == 0


def test_stop_loss_fires_when_the_price_falls_to_the_trigger(setup):
    db, market, user_id, watcher, fired = setup
    place_market_order(db, market, user_id, "WEMBY", "buy", 20)
    last = to_cents(market.last_price("WEMBY"))
    order = create_open_order(db, market, user_id, symbol="WEMBY", side="sell", order_type="stop",
                              qty=20, price_cents=last - 500)
    assert watcher.check(tick_with(market, "WEMBY")) == []           # price above the trigger
    assert watcher.check(tick_with(market, "WEMBY", last=(last - 600) / 100)) != []  # storm!
    after = get_open_order(db, order.order_id)
    assert (after.status, after.filled_qty) == ("filled", 20)
    reasons = {r[0] for r in db.conn.execute(
        "SELECT reason FROM trades WHERE order_id = ?", (after.last_fill_order_id,))}
    assert reasons == {"stop"}


# --- Unit: reservations ----------------------------------------------------------------

def test_buy_limit_holds_back_cash(setup):
    db, market, user_id, watcher, fired = setup
    with db.lock, db.conn:
        db.conn.execute("UPDATE users SET cash_cents = 200000 WHERE user_id = ?", (user_id,))  # 2,000 HOOP
    order = create_open_order(db, market, user_id, symbol="SGA", side="buy", order_type="limit",
                              qty=12, price_cents=14000)
    # About 1,682 held back leaves about 318 free: a market buy of 3 SGA (~150 each) only gets 2
    outcome = place_market_order(db, market, user_id, "SGA", "buy", 3)
    assert (outcome.status, outcome.filled_qty, outcome.reason) == ("partially_filled", 2, "not enough cash")
    assert outcome.cash_cents_after >= order.reserved_cash_cents  # the held-back cash was never touched


def test_cannot_reserve_more_cash_than_you_have(setup):
    db, market, user_id, watcher, fired = setup
    with pytest.raises(OrderError) as error:
        create_open_order(db, market, user_id, symbol="SGA", side="buy", order_type="limit",
                          qty=1000, price_cents=15000)  # 150,000 HOOP > 100,000
    assert error.value.message.startswith("not enough cash")


def test_sell_orders_hold_back_shares(setup):
    db, market, user_id, watcher, fired = setup
    place_market_order(db, market, user_id, "TATUM", "buy", 10)
    create_open_order(db, market, user_id, symbol="TATUM", side="sell", order_type="stop", qty=6,
                      price_cents=to_cents(market.last_price("TATUM")) - 1000)
    with pytest.raises(OrderError) as error:
        place_market_order(db, market, user_id, "TATUM", "sell", 5)
    assert "6 reserved for open orders" in error.value.message
    place_market_order(db, market, user_id, "TATUM", "sell", 4)  # the unreserved 4 are fine
    with pytest.raises(OrderError):
        create_open_order(db, market, user_id, symbol="TATUM", side="sell", order_type="limit", qty=1,
                          price_cents=20000)  # nothing left to reserve


def test_cancel_releases_what_was_held_back(setup):
    db, market, user_id, watcher, fired = setup
    order = create_open_order(db, market, user_id, symbol="SGA", side="buy", order_type="limit",
                              qty=600, price_cents=15000)  # holds back ~90,000
    cancelled = cancel_open_order(db, user_id, order.order_id)
    assert (cancelled.status, cancelled.reserved_cash_cents) == ("cancelled", 0)
    place_market_order(db, market, user_id, "SGA", "buy", 300)  # spending it is fine again
    watcher.check(tick_with(market, "SGA", ask=1.0))
    assert get_open_order(db, order.order_id).filled_qty == 0  # cancelled orders never fire


@pytest.mark.parametrize("kwargs, message", [
    (dict(symbol="NOPE", side="buy", order_type="limit"), "unknown symbol"),
    (dict(symbol="SGA", side="buy", order_type="stop"), "a stop-loss sells"),
])
def test_bad_open_orders(setup, kwargs, message):
    db, market, user_id, watcher, fired = setup
    with pytest.raises(OrderError) as error:
        create_open_order(db, market, user_id, qty=1, price_cents=10000, **kwargs)
    assert message in error.value.message


def test_stop_loss_must_be_below_the_current_price(setup):
    db, market, user_id, watcher, fired = setup
    place_market_order(db, market, user_id, "SGA", "buy", 5)
    last = to_cents(market.last_price("SGA"))
    with pytest.raises(OrderError) as error:
        create_open_order(db, market, user_id, symbol="SGA", side="sell", order_type="stop", qty=5, price_cents=last)
    assert "must be below the current price" in error.value.message


# --- Through the API, with the market running ---------------------------------------

@pytest.fixture
def player(client):
    return auth(client.post("/trading/guest").json()["token"])


def post_open(client, headers, **body):
    return client.post("/trading/orders/open", headers=headers, json=body)


def wait_for_status(client, headers, order_id, want, timeout_s=4.0):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        orders = client.get("/trading/orders/open", headers=headers, params={"include_closed": True}).json()
        order = next(o for o in orders if o["order_id"] == order_id)
        if order["status"] == want:
            return order
        time.sleep(0.1)
    raise AssertionError(f"{order_id} is {order['status']}, wanted {want}")


def test_limit_order_fills_through_the_api_with_a_receipt(client, player):
    ask = client.get("/trading/debug/quote/CADE").json()["ask"]
    response = post_open(client, player, symbol="CADE", side="buy", order_type="limit", qty=5, price=ask + 3)
    assert response.status_code == 201
    created = response.json()
    assert (created["status"], created["remaining_qty"]) == ("open", 5)
    assert created["reserved_cash"] > 5 * ask

    filled = wait_for_status(client, player, created["order_id"], "filled")
    assert (filled["filled_qty"], filled["reserved_cash"]) == (5, 0.0)
    trades = client.get("/trading/trades", headers=player).json()
    assert {t["reason"] for t in trades} == {"limit"}
    receipt = client.get(f"/trading/orders/{filled['last_fill_order_id']}/receipt", headers=player).json()
    assert receipt["status"] in ("pending", "confirmed")


def test_stop_loss_fires_in_a_real_sell_off(client, player):
    """Another player dumps shares, the price drops through the stop, and it sells."""
    client.post("/trading/orders", headers=player, json={"symbol": "BRUNSON", "side": "buy", "qty": 20})
    last = client.get("/trading/debug/quote/BRUNSON").json()["last"]
    stop = post_open(client, player, symbol="BRUNSON", side="sell", order_type="stop", qty=20,
                     price=round(last * 0.97, 2)).json()

    from trading.market_provider import get_market
    get_market().submit_order(account_id="whale", symbol="BRUNSON", side="sell", qty=400)  # a sell-off

    filled = wait_for_status(client, player, stop["order_id"], "filled")
    assert filled["filled_qty"] == 20
    portfolio = client.get("/trading/portfolio", headers=player).json()
    assert all(p["symbol"] != "BRUNSON" for p in portfolio["positions"])


def test_portfolio_shows_reserved_and_available_cash(client, player):
    post_open(client, player, symbol="SGA", side="buy", order_type="limit", qty=100, price=100.0)
    portfolio = client.get("/trading/portfolio", headers=player).json()
    assert portfolio["reserved_cash"] == pytest.approx(100 * 100 * 1.001 + 1, abs=0.01)
    assert portfolio["available_cash"] == pytest.approx(portfolio["cash"] - portfolio["reserved_cash"], abs=0.01)


def test_cancel_and_list_through_the_api(client, player):
    created = post_open(client, player, symbol="SGA", side="buy", order_type="limit", qty=2, price=50.0).json()
    assert [o["order_id"] for o in client.get("/trading/orders/open", headers=player).json()] == [created["order_id"]]

    response = client.delete(f"/trading/orders/{created['order_id']}", headers=player)
    assert (response.status_code, response.json()["status"]) == (200, "cancelled")
    assert client.get("/trading/orders/open", headers=player).json() == []
    assert client.delete(f"/trading/orders/{created['order_id']}", headers=player).status_code == 409


def test_other_players_cannot_cancel_your_orders(client, player):
    created = post_open(client, player, symbol="SGA", side="buy", order_type="limit", qty=2, price=50.0).json()
    other = auth(client.post("/trading/guest").json()["token"])
    assert client.delete(f"/trading/orders/{created['order_id']}", headers=other).status_code == 404
    assert client.get("/trading/orders/open", headers=other).json() == []


@pytest.mark.parametrize("body, code", [
    (dict(symbol="SGA", side="buy", order_type="limit", qty=1, price=0), 422),
    (dict(symbol="SGA", side="buy", order_type="market", qty=1, price=10), 422),
    (dict(symbol="SGA", side="buy", order_type="stop", qty=1, price=10), 400),
    (dict(symbol="SGA", side="sell", order_type="limit", qty=1, price=10), 400),  # holds nothing
    (dict(symbol="NOPE", side="buy", order_type="limit", qty=1, price=10), 404),
])
def test_bad_requests(client, player, body, code):
    assert post_open(client, player, **body).status_code == code


def test_open_orders_need_a_session(client):
    assert client.get("/trading/orders/open").status_code == 401
    assert client.post("/trading/orders/open", json={}).status_code in (401, 422)
