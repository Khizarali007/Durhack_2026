"""P2-12: the order ticket can show spread, slippage, fee and total before you confirm, and the actuals after."""

import pytest

from trading.accounts import create_guest_user
from trading.db import Database
from trading.estimates import estimate_order
from trading.fake_market import FakeMarket
from trading.money import to_cents
from trading.open_orders import create_open_order
from trading.orders import fee_cents, place_market_order
from trading.tests.conftest import auth


@pytest.fixture
def setup():
    db = Database(":memory:")
    market = FakeMarket(seed=21)
    return db, market, create_guest_user(db).user_id


# --- The estimate itself ------------------------------------------------------------

def test_preview_does_not_trade(setup):
    db, market, user_id = setup
    before = market.quote("SGA")
    estimate_order(db, market, user_id, "SGA", "buy", 300)
    assert market.quote("SGA") == before
    assert db.conn.execute("SELECT count(*) FROM trades").fetchone()[0] == 0


def test_estimate_matches_what_the_order_then_does(setup):
    db, market, user_id = setup
    e = estimate_order(db, market, user_id, "LUKA", "buy", 120)
    outcome = place_market_order(db, market, user_id, "LUKA", "buy", 120)  # no tick in between
    assert e.method == "engine preview"
    assert e.fillable_qty == outcome.filled_qty == 120
    assert e.notional_cents == sum(f.qty * f.price_cents for f in outcome.fills)
    assert e.fee_cents == outcome.total_fee_cents
    assert e.slippage_cents == pytest.approx(outcome.slippage_cents)


def test_small_order_has_no_slippage_and_shows_the_spread(setup):
    db, market, user_id = setup
    q = market.quote("SGA")
    e = estimate_order(db, market, user_id, "SGA", "buy", 1)
    assert (e.best_bid_cents, e.best_ask_cents, e.best_price_cents) == (to_cents(q.bid), to_cents(q.ask), to_cents(q.ask))
    assert e.spread_cents == to_cents(q.ask) - to_cents(q.bid) > 0
    assert e.slippage_cents == 0
    assert e.fee_cents == fee_cents(to_cents(q.ask))
    assert e.total_cents == to_cents(q.ask) + e.fee_cents
    assert e.warnings == []


def test_bigger_orders_slip_more(setup):
    db, market, user_id = setup
    slips = [estimate_order(db, market, user_id, "TATUM", "buy", n).slippage_cents for n in (10, 100, 300)]
    assert slips[0] < slips[1] < slips[2]


def test_sell_estimate_counts_the_fee_off_the_proceeds(setup):
    db, market, user_id = setup
    place_market_order(db, market, user_id, "CURRY", "buy", 20)
    e = estimate_order(db, market, user_id, "CURRY", "sell", 20)
    assert e.best_price_cents == to_cents(market.quote("CURRY").bid)
    assert e.total_cents == e.notional_cents - e.fee_cents
    assert e.sellable_qty == 20


# --- Warnings -------------------------------------------------------------------------

def test_warns_when_makers_cannot_fill_it_all(setup):
    db, market, user_id = setup
    e = estimate_order(db, market, user_id, "CADE", "buy", 600)
    assert e.fillable_qty == 450
    assert any("can only fill about 450 of 600" in w for w in e.warnings)
    assert any(w.startswith("big order") for w in e.warnings)


def test_warns_when_cash_runs_short(setup):
    db, market, user_id = setup
    with db.lock, db.conn:
        db.conn.execute("UPDATE users SET cash_cents = 100000 WHERE user_id = ?", (user_id,))  # 1,000 HOOP
    e = estimate_order(db, market, user_id, "JOKIC", "buy", 20)
    assert 0 < e.affordable_qty < 7
    assert any(f"you can afford about {e.affordable_qty}" in w for w in e.warnings)


def test_reserved_cash_and_shares_are_left_out(setup):
    db, market, user_id = setup
    place_market_order(db, market, user_id, "ANT", "buy", 10)
    create_open_order(db, market, user_id, symbol="ANT", side="sell", order_type="stop", qty=7,
                      price_cents=to_cents(market.last_price("ANT")) - 1000)
    e = estimate_order(db, market, user_id, "ANT", "sell", 5)
    assert e.sellable_qty == 3
    assert any("you can sell 3 (you hold 10, 7 reserved for open orders)" in w for w in e.warnings)


def test_falls_back_to_maker_quotes_without_a_preview(setup):
    db, market, user_id = setup

    class NoPreview:  # an engine that can't preview orders
        def __init__(self, inner):
            self._inner = inner

        def __getattr__(self, name):
            if name == "preview_order":
                raise AttributeError(name)
            return getattr(self._inner, name)

    e = estimate_order(db, NoPreview(market), user_id, "SGA", "buy", 200)
    assert e.method == "maker quotes (approximate)"
    assert e.fillable_qty == 200
    assert e.slippage_cents > 0  # walks into the second maker's quote


# --- Through the API ----------------------------------------------------------------

@pytest.fixture
def player(client):
    return auth(client.post("/trading/guest").json()["token"])


def quote(client, headers, symbol, side, qty):
    response = client.post("/trading/orders/quote", headers=headers, json={"symbol": symbol, "side": side, "qty": qty})
    assert response.status_code == 200, response.json()
    return response.json()


def test_quote_endpoint_for_a_small_buy(client, player):
    q = quote(client, player, "SGA", "buy", 5)
    assert q["method"] == "engine preview"
    assert q["best_price"] == q["best_ask"]
    assert q["spread"] == pytest.approx(q["best_ask"] - q["best_bid"], abs=0.001)
    assert 0 < q["spread_pct"] < 2
    assert q["fee_rate_pct"] == 0.1
    assert q["estimated_total"] == pytest.approx(q["estimated_notional"] + q["estimated_fee"], abs=0.001)
    assert (q["ok"], q["warnings"], q["can_afford_qty"] >= 5) == (True, [], True)
    assert [m["maker_id"] for m in q["makers"]] == ["MM1", "MM2", "MM3"]


def test_quote_endpoint_for_a_big_buy_warns(client, player):
    q = quote(client, player, "FOX", "buy", 600)
    assert q["ok"] is False
    assert q["estimated_fillable_qty"] == 450
    assert q["estimated_slippage_pct"] > 1
    assert len(q["warnings"]) >= 2


def test_quote_for_a_sell_you_cannot_make(client, player):
    q = quote(client, player, "SGA", "sell", 3)
    assert (q["ok"], q["sellable_qty"]) == (False, 0)
    assert "you can sell 0 (you hold 0)" in q["warnings"]


def test_order_response_shows_actual_slippage(client, player):
    order = client.post("/trading/orders", headers=player, json={"symbol": "WEMBY", "side": "buy", "qty": 200}).json()
    assert order["quoted_best_price"] > 0
    assert order["slippage"] == pytest.approx(order["average_price"] - order["quoted_best_price"], abs=0.0001)
    assert order["slippage"] > 0 and order["slippage_pct"] > 0

    small = client.post("/trading/orders", headers=player, json={"symbol": "SGA", "side": "buy", "qty": 1}).json()
    assert small["slippage"] == 0


def test_trade_history_shows_quoted_price_and_slippage(client, player):
    order = client.post("/trading/orders", headers=player, json={"symbol": "LUKA", "side": "buy", "qty": 30}).json()
    trades = client.get("/trading/trades", headers=player).json()
    assert {t["quoted_price"] for t in trades} == {order["quoted_best_price"]}
    for t in trades:
        assert t["slippage"] == pytest.approx(t["price"] - t["quoted_price"], abs=0.001)


def test_quote_errors(client, player):
    assert client.post("/trading/orders/quote", headers=player,
                       json={"symbol": "NOPE", "side": "buy", "qty": 1}).status_code == 404
    assert client.post("/trading/orders/quote", headers=player,
                       json={"symbol": "SGA", "side": "buy", "qty": 0}).status_code == 422
    assert client.post("/trading/orders/quote", json={"symbol": "SGA", "side": "buy", "qty": 1}).status_code == 401


def test_old_database_gets_the_new_column(tmp_path):
    import sqlite3
    path = tmp_path / "old.sqlite"
    old = sqlite3.connect(path)
    old.execute("CREATE TABLE trades (trade_id TEXT PRIMARY KEY, order_id TEXT, user_id TEXT, symbol TEXT,"
                " side TEXT, qty INTEGER, price_cents INTEGER, fee_cents INTEGER, t REAL, reason TEXT,"
                " counterparty TEXT, receipt_status TEXT, receipt_signature TEXT, receipt_confirm_ms INTEGER)")
    old.commit()
    old.close()
    db = Database(path)
    columns = {r["name"] for r in db.conn.execute("PRAGMA table_info(trades)")}
    assert "quoted_price_cents" in columns
