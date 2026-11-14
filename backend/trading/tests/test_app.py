"""P2-01: the app starts, the routes are registered, the tables exist and the market ticks."""

import time

import pytest

from trading.db import TABLES, Database


def test_health(client):
    body = client.get("/trading/health").json()
    assert body["status"] == "ok"
    assert body["component"] == "trading"
    assert body["players"] > 0
    assert set(TABLES) <= set(body["tables"])


def test_routes_show_up_in_the_docs(client):
    assert client.get("/docs").status_code == 200
    paths = client.get("/openapi.json").json()["paths"]
    assert "/trading/health" in paths
    assert "/trading/debug/quote/{symbol}" in paths


def test_market_ticks_in_the_background(client):
    first = client.get("/trading/health").json()["market_time"]
    time.sleep(1.1)
    assert client.get("/trading/health").json()["market_time"] > first


def test_debug_quote(client):
    q = client.get("/trading/debug/quote/SGA").json()
    assert q["symbol"] == "SGA"
    assert q["bid"] < q["ask"]
    assert len(q["makers"]) == 3
    assert client.get("/trading/debug/quote/NOPE").status_code == 404


def test_database_rejects_bad_trades():
    db = Database(":memory:")
    db.conn.execute("INSERT INTO users (user_id, cash_cents, created_at) VALUES ('u1', 100, 0)")
    with pytest.raises(Exception):
        db.conn.execute(
            "INSERT INTO trades (trade_id, order_id, user_id, symbol, side, qty, price_cents, t)"
            " VALUES ('t1', 'o1', 'u1', 'SGA', 'hold', 1, 100, 0)"
        )
    db.close()


def test_demo_serves_assets_without_shadowing_api(client):
    page = client.get('/demo/')
    assert page.status_code == 200
    assert 'text/html' in page.headers['content-type']
    assert client.get('/demo/app.js').status_code == 200
    assert client.get('/demo/style.css').status_code == 200
    assert client.get('/market/players').json()
    assert client.get('/demo/../../backend/main.py').status_code == 404


def test_disabled_receipts_are_consistent_in_trade_history(client):
    worker = client.app.state.receipts
    client.app.state.receipts = None
    token = client.post('/trading/guest').json()['token']
    headers = {'Authorization': 'Bearer ' + token}
    order = client.post('/trading/orders', headers=headers,
                        json={'symbol': 'SGA', 'side': 'buy', 'qty': 1})
    assert order.status_code == 200
    assert order.json()['receipt_status'] == 'disabled'
    history = client.get('/trading/trades', headers=headers).json()
    assert history and all(t['receipt_status'] == 'disabled' for t in history)
    assert client.get('/market/status').json()['receipts_enabled'] is False

    client.app.state.receipts = worker
