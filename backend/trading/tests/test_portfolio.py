"""P2-05: the portfolio's numbers add up after any sequence of buys and sells."""

import random

import pytest

from trading.market_provider import get_market
from trading.portfolio import build_portfolio
from trading.tests.conftest import auth


@pytest.fixture
def player(client):
    session = client.post("/trading/session").json()
    return auth(session["token"]), session["user_id"]


def order(client, headers, symbol, side, qty):
    response = client.post("/trading/orders", headers=headers, json={"symbol": symbol, "side": side, "qty": qty})
    assert response.status_code == 200, response.json()
    return response.json()


def portfolio(client, headers):
    response = client.get("/trading/portfolio", headers=headers)
    assert response.status_code == 200
    return response.json()


def c(hoop):
    return round(hoop * 100)


def test_new_player_has_only_cash(client, player):
    headers, user_id = player
    p = portfolio(client, headers)
    assert p == {
        "user_id": user_id, "cash": 100_000.0, "reserved_cash": 0.0, "available_cash": 100_000.0,
        "positions_value": 0.0, "equity": 100_000.0,
        "starting_cash": 100_000.0, "total_pnl": 0.0, "total_pnl_pct": 0.0, "unrealised_pnl": 0.0,
        "realised_pnl": 0.0, "fees_paid": 0.0, "positions": [],
    }


def test_position_after_a_buy(client, player):
    headers, _ = player
    bought = order(client, headers, "SGA", "buy", 10)
    p = portfolio(client, headers)

    [pos] = p["positions"]
    assert (pos["symbol"], pos["name"], pos["team"], pos["qty"]) == ("SGA", "Shai Gilgeous-Alexander", "OKC", 10)
    assert pos["avg_cost"] == pytest.approx(bought["average_price"], abs=1e-4)
    assert c(pos["market_value"]) == 10 * c(pos["last_price"])
    assert c(pos["unrealised_pnl"]) == c(pos["market_value"]) - c(pos["avg_cost"] * 10)
    assert p["fees_paid"] == bought["total_fee"]
    assert p["cash"] == bought["cash"]


def test_equity_is_cash_plus_holdings(client, player):
    headers, _ = player
    order(client, headers, "SGA", "buy", 10)
    order(client, headers, "WEMBY", "buy", 30)
    p = portfolio(client, headers)
    assert c(p["positions_value"]) == sum(c(x["market_value"]) for x in p["positions"])
    assert c(p["equity"]) == c(p["cash"]) + c(p["positions_value"])
    assert c(p["total_pnl"]) == c(p["equity"]) - c(p["starting_cash"])


def test_largest_holding_first_and_weights(client, player):
    headers, _ = player
    order(client, headers, "FOX", "buy", 2)
    order(client, headers, "JOKIC", "buy", 40)
    p = portfolio(client, headers)
    assert [x["symbol"] for x in p["positions"]] == ["JOKIC", "FOX"]
    total_weight = sum(x["weight_pct"] for x in p["positions"])
    assert total_weight == pytest.approx(100 * p["positions_value"] / p["equity"], abs=0.02)


def test_realised_pnl_after_selling(client, player):
    headers, _ = player
    buy = order(client, headers, "CURRY", "buy", 10)
    basis = sum(c(f["price"]) * f["qty"] for f in buy["fills"])
    sell = order(client, headers, "CURRY", "sell", 4)
    proceeds = sum(c(f["price"]) * f["qty"] for f in sell["fills"])

    p = portfolio(client, headers)
    assert c(p["realised_pnl"]) == proceeds - round(basis * 4 / 10)
    assert p["positions"][0]["qty"] == 6
    assert c(p["fees_paid"]) == c(buy["total_fee"]) + c(sell["total_fee"])


def test_closed_position_leaves_only_realised_pnl(client, player):
    headers, _ = player
    order(client, headers, "ANT", "buy", 5)
    order(client, headers, "ANT", "sell", 5)
    p = portfolio(client, headers)
    assert p["positions"] == []
    assert p["unrealised_pnl"] == 0.0
    assert c(p["total_pnl"]) == c(p["realised_pnl"]) - c(p["fees_paid"])
    assert p["total_pnl"] < 0  # paid the spread and fees on the round trip


def test_pnl_identity_holds_after_random_trading(client, db, player):
    """equity - starting cash == realised + unrealised - fees, exactly, in cents."""
    headers, user_id = player
    rng = random.Random(5)
    symbols = ["SGA", "LUKA", "TATUM", "BRUNSON"]
    held = {s: 0 for s in symbols}
    for _ in range(25):
        symbol = rng.choice(symbols)
        if held[symbol] and rng.random() < 0.4:
            qty = rng.randint(1, held[symbol])
            held[symbol] -= order(client, headers, symbol, "sell", qty)["filled_qty"]
        else:
            held[symbol] += order(client, headers, symbol, "buy", rng.randint(1, 25))["filled_qty"]

        view = build_portfolio(db, get_market(), user_id)  # cents, no rounding at all
        assert view.total_pnl_cents == view.realised_cents + view.unrealised_cents - view.fees_cents
        assert {p.symbol: p.qty for p in view.positions} == {s: q for s, q in held.items() if q}


def test_portfolio_needs_a_session(client):
    assert client.get("/trading/portfolio").status_code == 401


def test_portfolios_are_private(client):
    a = auth(client.post("/trading/session").json()["token"])
    b = auth(client.post("/trading/session").json()["token"])
    order(client, a, "SGA", "buy", 3)
    assert portfolio(client, b)["positions"] == []
