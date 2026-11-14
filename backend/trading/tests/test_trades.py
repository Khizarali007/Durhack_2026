"""P2-06: every order shows up in the trade history, in order, with the right prices and fees."""

import time

import pytest

from trading.tests.conftest import auth

PERSON_4_TRADE_FIELDS = {"trade_id", "user_id", "symbol", "side", "qty", "price", "fee", "t", "reason"}


@pytest.fixture
def player(client):
    session = client.post("/trading/session").json()
    return auth(session["token"]), session["user_id"]


def order(client, headers, symbol, side, qty):
    response = client.post("/trading/orders", headers=headers, json={"symbol": symbol, "side": side, "qty": qty})
    assert response.status_code == 200, response.json()
    return response.json()


def history(client, headers, **params):
    response = client.get("/trading/trades", headers=headers, params=params)
    assert response.status_code == 200, response.json()
    return response.json()


def test_new_player_has_no_trades(client, player):
    headers, _ = player
    assert history(client, headers) == []


def test_every_fill_is_listed_in_order_with_the_right_values(client, player):
    headers, user_id = player
    orders = [
        order(client, headers, "SGA", "buy", 25),
        order(client, headers, "WEMBY", "buy", 5),
        order(client, headers, "SGA", "sell", 12),
    ]
    expected = [(o["order_id"], o["side"], o["symbol"], f) for o in orders for f in o["fills"]]
    trades = history(client, headers)

    assert len(trades) == len(expected)
    for trade, (order_id, side, symbol, fill) in zip(trades, expected):
        assert trade["trade_id"] == fill["trade_id"]
        assert (trade["order_id"], trade["side"], trade["symbol"]) == (order_id, side, symbol)
        assert (trade["qty"], trade["price"], trade["fee"], trade["t"]) == (
            fill["qty"], fill["price"], fill["fee"], fill["t"])
        assert trade["user_id"] == user_id
        assert trade["reason"] == "market"
        assert trade["receipt_status"] == "pending"
        assert trade["receipt_signature"] is None


def test_trades_have_person_4s_fields(client, player):
    headers, _ = player
    order(client, headers, "ANT", "buy", 2)
    [trade] = history(client, headers)
    assert PERSON_4_TRADE_FIELDS <= set(trade)
    assert trade["qty"] > 0 and trade["price"] > 0 and trade["fee"] >= 0


def test_times_never_go_backwards(client, player):
    headers, _ = player
    for symbol in ("SGA", "LUKA", "TATUM"):
        order(client, headers, symbol, "buy", 3)
        time.sleep(0.6)  # let the market tick between orders
    times = [t["t"] for t in history(client, headers)]
    assert times == sorted(times)
    assert times[0] < times[-1]


def test_since_t_is_inclusive(client, player):
    headers, _ = player
    order(client, headers, "SGA", "buy", 3)
    time.sleep(0.6)
    second = order(client, headers, "CURRY", "buy", 3)
    cutoff = second["fills"][0]["t"]
    trades = history(client, headers, since_t=cutoff)
    assert {t["symbol"] for t in trades} == {"CURRY"}
    assert history(client, headers, since_t=cutoff + 1) == []


def test_filter_by_symbol(client, player):
    headers, _ = player
    order(client, headers, "SGA", "buy", 3)
    order(client, headers, "FOX", "buy", 3)
    assert {t["symbol"] for t in history(client, headers, symbol="FOX")} == {"FOX"}


def test_limit_keeps_the_most_recent_oldest_first(client, player):
    headers, _ = player
    for symbol in ("SGA", "LUKA", "TATUM", "CURRY"):
        order(client, headers, symbol, "buy", 1)
    assert [t["symbol"] for t in history(client, headers, limit=2)] == ["TATUM", "CURRY"]


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 5001}, {"since_t": "yesterday"}])
def test_bad_query_parameters_are_422(client, player, params):
    headers, _ = player
    assert client.get("/trading/trades", headers=headers, params=params).status_code == 422


def test_history_is_private(client):
    a = auth(client.post("/trading/session").json()["token"])
    b = auth(client.post("/trading/session").json()["token"])
    order(client, a, "SGA", "buy", 3)
    assert history(client, b) == []


def test_history_needs_a_session(client):
    assert client.get("/trading/trades").status_code == 401
