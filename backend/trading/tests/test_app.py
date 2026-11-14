"""P2-01: the app starts, the routes are registered, the tables exist and the market ticks."""

import time

import pytest
from fastapi.testclient import TestClient

from trading.db import DB_PATH_ENV, TABLES, Database


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv(DB_PATH_ENV, ":memory:")
    from main import app

    with TestClient(app) as c:  # runs the lifespan, so the market ticks in the background
        yield c


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
