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


def test_mission_lifecycle_over_http(client):
    assert client.get("/learning/missions/status", params={"user_id": "u_test"}).json()["state"] == "idle"
    assert client.get("/learning/missions/result", params={"user_id": "u_test"}).status_code == 404

    r = client.post("/learning/missions/start", json={"user_id": "u_test", "mission_id": "m1_buy_low_sell_high"})
    assert r.status_code == 200, r.text
    st = r.json()
    assert st["state"] == "running" and st["goal"] and st["seconds_left"] > 40
    assert client.post("/learning/missions/start", json={"user_id": "u_test", "mission_id": "m1_buy_low_sell_high"}).status_code == 409
    assert client.get("/learning/missions/result", params={"user_id": "u_test"}).status_code == 409

    order = client.post("/learning/mock/order", json={"user_id": "u_test", "symbol": "SGA", "side": "buy", "qty": 10})
    assert order.status_code == 200
    time.sleep(0.6)
    client.post("/learning/mock/order", json={"user_id": "u_test", "symbol": "SGA", "side": "sell", "qty": 10})

    stop = client.post("/learning/missions/stop", json={"user_id": "u_test"})
    assert stop.json()["state"] == "stopped"
    res = client.get("/learning/missions/result", params={"user_id": "u_test"}).json()
    assert res["state"] == "stopped" and res["qty_bought"] == 10 and res["qty_sold"] == 10
    assert res["outcome"] in {"sold_at_loss", "passed_ok", "passed_great"}
    assert res["debrief"] and res["lesson"]
    assert client.post("/learning/missions/stop", json={"user_id": "u_test"}).status_code == 409


def test_start_unknown_or_placeholder_mission_404(client):
    for mid in ("nope", "m2_read_the_spread"):
        r = client.post("/learning/missions/start", json={"user_id": "u", "mission_id": mid})
        assert r.status_code == 404


def test_websocket_pushes_mission_messages_and_ticks(client):
    with client.websocket_connect("/learning/ws?user_id=u_ws") as ws:
        snap = ws.receive_json()
        assert snap["type"] == "mission" and snap["kind"] == "snapshot" and snap["state"] == "idle"
        client.post("/learning/missions/start", json={"user_id": "u_ws", "mission_id": "m1_buy_low_sell_high"})
        seen_kinds, ticks = [], []
        for _ in range(20):
            msg = ws.receive_json()
            if msg["type"] == "tick":
                ticks.append(msg)
            else:
                assert msg["state"] == "running" and "text" in msg
                seen_kinds.append(msg["kind"])
            if len(ticks) >= 2 and "message" in seen_kinds:
                break
        assert seen_kinds[:2] == ["state", "message"]
        assert ticks[0]["symbol"] == "SGA" and set(ticks[0]) >= {"t", "price", "best_bid", "best_ask"}


def test_websocket_symbols_param_without_mission(client):
    with client.websocket_connect("/learning/ws?user_id=u_idle&symbols=ANT") as ws:
        ws.receive_json()
        assert ws.receive_json()["symbol"] == "ANT"


def test_cors_allows_sandbox_frontend(client):
    r = client.options(
        "/learning/health",
        headers={"Origin": "http://localhost:5174", "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5174"


def test_content_endpoints(client):
    ms = client.get("/learning/missions").json()
    assert ms[0]["title"] == "Buy low, sell high"
    assert ms[0]["available"] is True and ms[1]["available"] is False
    assert client.get("/learning/glossary").status_code == 200
    sc = client.get("/learning/scenarios/m1_buy_low_sell_high").json()
    assert sc["mission_number"] == 1
    assert client.get("/learning/scenarios/nope").status_code == 404
    assert client.get("/learning/scenarios/..%2Fsecrets").status_code == 404
