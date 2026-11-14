import time

import pytest
from fastapi.testclient import TestClient

from learning import deps
from learning.dev_app import app


@pytest.fixture
def client():
    with TestClient(app) as c:  # runs the lifespan, so the mock market ticks
        yield c
    deps.reset()


def test_health(client):
    r = client.get("/learning/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "component": "learning", "adapters": {"market": True, "trades": True}}


def test_mock_tick_moves(client):
    first = client.get("/learning/mock/tick", params={"symbol": "SGA"}).json()
    assert set(first) == {"t", "symbol", "price", "fair_value", "best_bid", "best_ask"}
    time.sleep(1.2)
    second = client.get("/learning/mock/tick", params={"symbol": "SGA"}).json()
    assert second["t"] > first["t"]
    assert second["best_bid"] < second["best_ask"]


def test_unknown_symbol_404(client):
    assert client.get("/learning/mock/tick", params={"symbol": "NOPE"}).status_code == 404


def test_order_and_portfolio(client):
    r = client.post("/learning/mock/order", json={"user_id": "u1", "symbol": "SGA", "side": "buy", "qty": 10})
    assert r.status_code == 200, r.text
    assert r.json()["side"] == "buy"
    p = client.get("/learning/mock/portfolio", params={"user_id": "u1"}).json()
    assert p["positions"][0]["qty"] == 10
    assert len(client.get("/learning/mock/trades", params={"user_id": "u1"}).json()) == 1
    bad = client.post("/learning/mock/order", json={"user_id": "u1", "symbol": "SGA", "side": "sell", "qty": 99})
    assert bad.status_code == 400


def test_inject_event(client):
    r = client.post(
        "/learning/mock/event",
        json={"symbol": "SGA", "kind": "hot_streak", "headline": "SGA heating up", "impact": 0.18},
    )
    assert r.status_code == 200
    assert len(client.get("/learning/mock/events").json()) == 1


def test_content_endpoints(client):
    ms = client.get("/learning/missions").json()
    assert ms[0]["title"] == "Buy low, sell high"
    assert client.get("/learning/glossary").status_code == 200
    sc = client.get("/learning/scenarios/m1_buy_low_sell_high").json()
    assert sc["mission_number"] == 1
    assert client.get("/learning/scenarios/nope").status_code == 404
    assert client.get("/learning/scenarios/..%2Fsecrets").status_code == 404
