"""P2-04: market buy/sell moves cash and shares correctly, and refuses what it can't do."""

import pytest

from trading.orders import fee_cents
from trading.tests.conftest import auth


@pytest.fixture
def player(client):
    """A fresh session: (headers, user_id)."""
    session = client.post("/trading/session").json()
    return auth(session["token"]), session["user_id"]


def order(client, headers, symbol, side, qty):
    return client.post("/trading/orders", headers=headers, json={"symbol": symbol, "side": side, "qty": qty})


def cash_of(client, headers):
    return client.get("/trading/me", headers=headers).json()["cash"]


def position(db, user_id, symbol):
    row = db.conn.execute(
        "SELECT qty, cost_basis_cents FROM positions WHERE user_id = ? AND symbol = ?", (user_id, symbol)
    ).fetchone()
    return tuple(row) if row else None


def trades(db, user_id):
    return [dict(r) for r in db.conn.execute(
        "SELECT * FROM trades WHERE user_id = ? ORDER BY rowid", (user_id,))]


def cents(fills):
    """Total notional and fees of a response's fills, in cents."""
    notional = sum(round(f["price"] * 100) * f["qty"] for f in fills)
    return notional, sum(round(f["fee"] * 100) for f in fills)


# --- Buying ---------------------------------------------------------------------

def test_buy_lowers_cash_and_adds_shares(client, db, player):
    headers, user_id = player
    body = order(client, headers, "SGA", "buy", 5).json()

    assert body["status"] == "filled"
    assert body["filled_qty"] == 5
    assert body["position_qty"] == 5
    notional, fees = cents(body["fills"])
    assert fees == sum(fee_cents(round(f["price"] * 100) * f["qty"]) for f in body["fills"]) > 0
    assert round(body["cash"] * 100) == 10_000_000 - notional - fees
    assert cash_of(client, headers) == body["cash"]
    assert position(db, user_id, "SGA") == (5, notional)  # cost basis excludes fees


def test_every_fill_is_saved_as_a_trade(client, db, player):
    headers, user_id = player
    body = order(client, headers, "LUKA", "buy", 25).json()
    rows = trades(db, user_id)
    assert [r["trade_id"] for r in rows] == [f["trade_id"] for f in body["fills"]]
    assert sum(r["qty"] for r in rows) == 25
    for r in rows:
        assert (r["side"], r["reason"]) == ("buy", "market")
        assert r["receipt_status"] in ("pending", "confirmed")  # the fake sender confirms fast
        assert r["order_id"] == body["order_id"]


def test_big_buy_is_split_and_pays_more_per_share(client, player):
    headers, _ = player
    ask = client.get("/trading/debug/quote/TATUM").json()["ask"]
    body = order(client, headers, "TATUM", "buy", 200).json()
    assert body["status"] == "filled"
    assert body["average_price"] > ask  # slippage


def test_buy_more_than_the_makers_hold_is_partly_filled(client, player):
    headers, _ = player
    body = order(client, headers, "CADE", "buy", 1000).json()  # makers hold 3 x 150 shares
    assert body["status"] == "partially_filled"
    assert body["filled_qty"] == 450
    assert body["reason"] == "market makers ran out of shares"


def test_cannot_spend_more_than_you_have(client, db, player):
    headers, user_id = player
    with db.lock, db.conn:  # leave them 1,000 HOOP
        db.conn.execute("UPDATE users SET cash_cents = 100000 WHERE user_id = ?", (user_id,))
    body = order(client, headers, "JOKIC", "buy", 100).json()  # ~160 HOOP each
    assert body["status"] == "partially_filled"
    assert body["reason"] == "not enough cash"
    assert 0 < body["filled_qty"] < 7
    assert 0 <= body["cash"] < 200


def test_no_cash_at_all_is_rejected_and_nothing_trades(client, db, player):
    headers, user_id = player
    with db.lock, db.conn:
        db.conn.execute("UPDATE users SET cash_cents = 5000 WHERE user_id = ?", (user_id,))
    response = order(client, headers, "SGA", "buy", 1)
    assert response.status_code == 400
    assert response.json()["detail"] == "not enough cash"
    assert trades(db, user_id) == []
    assert cash_of(client, headers) == 50.0


# --- Selling --------------------------------------------------------------------

def test_sell_returns_cash_and_removes_shares(client, db, player):
    headers, user_id = player
    order(client, headers, "CURRY", "buy", 10)
    cash_before = cash_of(client, headers)
    basis_before = position(db, user_id, "CURRY")[1]

    body = order(client, headers, "CURRY", "sell", 4).json()
    assert body["status"] == "filled"
    assert body["position_qty"] == 6
    notional, fees = cents(body["fills"])
    assert round(body["cash"] * 100) == round(cash_before * 100) + notional - fees
    assert position(db, user_id, "CURRY") == (6, round(basis_before * 6 / 10))


def test_selling_everything_closes_the_position(client, db, player):
    headers, user_id = player
    order(client, headers, "ANT", "buy", 3)
    assert order(client, headers, "ANT", "sell", 3).json()["position_qty"] == 0
    assert position(db, user_id, "ANT") is None


def test_round_trip_costs_the_spread_and_fees(client, player):
    headers, _ = player
    order(client, headers, "WEMBY", "buy", 10)
    order(client, headers, "WEMBY", "sell", 10)
    assert cash_of(client, headers) < 100_000.0


@pytest.mark.parametrize("held, selling", [(0, 1), (2, 3)])
def test_cannot_sell_more_than_you_hold(client, db, player, held, selling):
    headers, user_id = player
    if held:
        order(client, headers, "FOX", "buy", held)
    response = order(client, headers, "FOX", "sell", selling)
    assert response.status_code == 400
    assert f"you hold {held} FOX" in response.json()["detail"]


# --- Bad requests ---------------------------------------------------------------

def test_unknown_symbol_is_404(client, player):
    headers, _ = player
    assert order(client, headers, "NOPE", "buy", 1).status_code == 404


@pytest.mark.parametrize("payload", [
    {"symbol": "SGA", "side": "buy", "qty": 0},
    {"symbol": "SGA", "side": "buy", "qty": -3},
    {"symbol": "SGA", "side": "buy", "qty": 2.5},
    {"symbol": "SGA", "side": "buy", "qty": 20_000},
    {"symbol": "SGA", "side": "lend", "qty": 1},
    {"symbol": "SGA", "side": "buy"},
])
def test_invalid_orders_are_422(client, player, payload):
    headers, _ = player
    assert client.post("/trading/orders", headers=headers, json=payload).status_code == 422


def test_orders_need_a_session(client):
    assert client.post("/trading/orders", json={"symbol": "SGA", "side": "buy", "qty": 1}).status_code == 401


def test_two_players_ledgers_are_separate(client, db):
    a = auth(client.post("/trading/session").json()["token"])
    b = auth(client.post("/trading/session").json()["token"])
    order(client, a, "SGA", "buy", 5)
    assert cash_of(client, b) == 100_000.0
    assert order(client, b, "SGA", "sell", 1).status_code == 400  # B holds nothing
