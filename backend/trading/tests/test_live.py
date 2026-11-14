"""P2-13: live updates over /trading/ws: fills, open orders and receipts, privately; bot bundles publicly."""

import asyncio
import json
import threading

import anyio
import pytest
from starlette.websockets import WebSocketDisconnect

from trading.live import LiveHub
from trading.tests.conftest import auth


def recv(ws, timeout_s=4.0):
    """Next message, or fail after timeout_s (the test client has no timeout of its own)."""
    async def get():
        with anyio.fail_after(timeout_s):
            return await ws._send_rx.receive()
    message = ws.portal.call(get)
    ws._raise_on_close(message)
    return json.loads(message["text"])


def recv_until(ws, wanted_type, timeout_s=4.0, **match):
    """Skip messages until one of ``wanted_type`` (matching ``match``) arrives."""
    seen = []
    while True:
        message = recv(ws, timeout_s)
        seen.append(message["type"])
        if message["type"] == wanted_type and all(message.get(k) == v for k, v in match.items()):
            return message
        if len(seen) > 50:
            raise AssertionError(f"never got {wanted_type}; saw {seen}")


@pytest.fixture
def session(client):
    body = client.post("/trading/guest").json()
    return body["token"], body["user_id"]


# --- The hub on its own ----------------------------------------------------------------

def test_hub_sends_private_messages_only_to_that_player():
    async def scenario():
        hub = LiveHub()
        hub.bind_loop()
        a, b, spectator = hub.subscribe("u_a"), hub.subscribe("u_b"), hub.subscribe(None)
        hub.publish_user("u_a", {"type": "fill"})
        hub.publish_public({"type": "bot_bundle"})
        return [q.get_nowait() for q in (a, a)], [b.get_nowait()], [spectator.get_nowait()], b.empty()

    a_msgs, b_msgs, spectator_msgs, b_empty = asyncio.run(scenario())
    assert [m["type"] for m in a_msgs] == ["fill", "bot_bundle"]
    assert [m["type"] for m in b_msgs] == ["bot_bundle"]
    assert [m["type"] for m in spectator_msgs] == ["bot_bundle"]
    assert b_empty


def test_hub_accepts_messages_from_another_thread():
    async def scenario():
        hub = LiveHub()
        hub.bind_loop()
        queue = hub.subscribe("u_a")
        thread = threading.Thread(target=hub.publish_user, args=("u_a", {"type": "open_order"}))
        thread.start()
        thread.join()
        return await asyncio.wait_for(queue.get(), 1)

    assert asyncio.run(scenario())["type"] == "open_order"


def test_unsubscribed_queues_get_nothing():
    async def scenario():
        hub = LiveHub()
        hub.bind_loop()
        queue = hub.subscribe("u_a")
        hub.unsubscribe("u_a", queue)
        hub.publish_user("u_a", {"type": "fill"})
        hub.publish_public({"type": "bot_bundle"})
        return queue.empty(), hub.connections()

    assert asyncio.run(scenario()) == (True, 0)


# --- Connecting -------------------------------------------------------------------------

def test_connect_with_a_token_says_hello(client, session):
    token, user_id = session
    with client.websocket_connect(f"/trading/ws?token={token}") as ws:
        hello = recv(ws)
    assert (hello["type"], hello["user_id"], hello["public_only"]) == ("hello", user_id, False)
    assert hello["market_time"] > 0


def test_connect_without_a_token_gets_the_public_feed(client):
    with client.websocket_connect("/trading/ws") as ws:
        hello = recv(ws)
    assert (hello["user_id"], hello["public_only"]) == (None, True)


def test_bad_token_is_refused(client):
    with pytest.raises(WebSocketDisconnect) as refused:
        with client.websocket_connect("/trading/ws?token=nope") as ws:
            recv(ws)
    assert refused.value.code == 4401


def test_ping_pong(client, session):
    token, _ = session
    with client.websocket_connect(f"/trading/ws?token={token}") as ws:
        recv(ws)
        ws.send_text("ping")
        assert recv_until(ws, "pong")["type"] == "pong"
        ws.send_text('{"type":"ping"}')
        assert recv_until(ws, "pong")["type"] == "pong"


# --- Private updates ---------------------------------------------------------------------

def test_an_order_pushes_a_fill_then_its_receipt(client, session):
    token, _ = session
    with client.websocket_connect(f"/trading/ws?token={token}") as ws:
        recv(ws)
        order = client.post("/trading/orders", headers=auth(token),
                            json={"symbol": "SGA", "side": "buy", "qty": 5}).json()
        fill = recv_until(ws, "fill")
        assert (fill["order_id"], fill["filled_qty"], fill["reason"], fill["receipt_status"]) == (
            order["order_id"], 5, "market", "pending")
        assert fill["cash"] == order["cash"]

        receipt = recv_until(ws, "receipt", order_id=order["order_id"])
        assert receipt["status"] == "confirmed"
        assert receipt["explorer_url"].endswith(f"/tx/{receipt['signature']}?cluster=devnet")


def test_open_orders_push_placed_fired_and_cancelled(client, session):
    token, _ = session
    headers = auth(token)
    with client.websocket_connect(f"/trading/ws?token={token}") as ws:
        recv(ws)
        ask = client.get("/trading/debug/quote/CADE").json()["ask"]
        limit = client.post("/trading/orders/open", headers=headers, json={
            "symbol": "CADE", "side": "buy", "order_type": "limit", "qty": 4, "price": ask + 3}).json()
        placed = recv_until(ws, "open_order", event="placed")
        assert placed["order_id"] == limit["order_id"]

        filled = recv_until(ws, "open_order", event="filled")  # the watcher fires it on the next tick
        assert (filled["order_id"], filled["filled_qty"], filled["status"]) == (limit["order_id"], 4, "filled")
        fill = recv_until(ws, "receipt", order_id=filled["last_fill_order_id"])
        assert fill["status"] == "confirmed"

        far = client.post("/trading/orders/open", headers=headers, json={
            "symbol": "CADE", "side": "buy", "order_type": "limit", "qty": 1, "price": 1.0}).json()
        recv_until(ws, "open_order", event="placed", order_id=far["order_id"])
        client.delete(f"/trading/orders/{far['order_id']}", headers=headers)
        cancelled = recv_until(ws, "open_order", event="cancelled")
        assert cancelled["order_id"] == far["order_id"]


def test_fired_order_also_sends_a_fill_tagged_with_its_type(client, session):
    token, _ = session
    with client.websocket_connect(f"/trading/ws?token={token}") as ws:
        recv(ws)
        ask = client.get("/trading/debug/quote/JOKIC").json()["ask"]
        client.post("/trading/orders/open", headers=auth(token), json={
            "symbol": "JOKIC", "side": "buy", "order_type": "limit", "qty": 2, "price": ask + 3})
        fill = recv_until(ws, "fill")
        assert (fill["reason"], fill["symbol"], fill["filled_qty"]) == ("limit", "JOKIC", 2)


def test_players_only_see_their_own_updates(client, session):
    token, _ = session
    other = client.post("/trading/guest").json()["token"]
    with client.websocket_connect(f"/trading/ws?token={other}") as theirs:
        recv(theirs)
        client.post("/trading/orders", headers=auth(token), json={"symbol": "SGA", "side": "buy", "qty": 1})
        client.post("/trading/orders", headers=auth(other), json={"symbol": "LUKA", "side": "buy", "qty": 1})
        fill = recv_until(theirs, "fill")
        assert fill["symbol"] == "LUKA"  # never SGA, which was the other player's


# --- Public updates ----------------------------------------------------------------------

def test_spectators_see_bot_bundles_settle(client):
    """One market minute is 5 real seconds, so the first bundle confirms after about 5.5 s."""
    with client.websocket_connect("/trading/ws") as ws:
        recv(ws)
        bundle = recv_until(ws, "bot_bundle", timeout_s=9)
    assert bundle["status"] == "confirmed"
    assert bundle["trade_count"] > 0
    assert bundle["explorer_url"].startswith("https://explorer.solana.com/tx/")
