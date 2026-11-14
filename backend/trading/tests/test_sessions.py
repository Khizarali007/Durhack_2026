"""P2-03: sessions give each player their own account with 100,000 HOOP."""

import pytest

from trading.accounts import get_user
from trading.tests.conftest import auth


def new_session(client) -> dict:
    response = client.post("/trading/session")
    assert response.status_code == 201
    return response.json()


def test_new_session_starts_with_100k_hoop(client):
    session = new_session(client)
    assert session["cash"] == 100_000.0
    assert session["user_id"].startswith("u_")
    assert len(session["token"]) >= 32


def test_token_identifies_the_user(client):
    session = new_session(client)
    me = client.get("/trading/me", headers=auth(session["token"])).json()
    assert {k: me[k] for k in ("user_id", "username", "is_guest", "cash", "wallet_address")} == {
        "user_id": session["user_id"], "username": None, "is_guest": True, "cash": 100_000.0,
        "wallet_address": session["wallet_address"]}


def test_two_sessions_have_separate_balances(client, db):
    a, b = new_session(client), new_session(client)
    assert a["user_id"] != b["user_id"]
    assert a["token"] != b["token"]

    # No orders yet (P2-04), so change one balance directly and check the other is untouched.
    with db.lock, db.conn:
        db.conn.execute("UPDATE users SET cash_cents = cash_cents - 2500 WHERE user_id = ?", (a["user_id"],))

    assert client.get("/trading/me", headers=auth(a["token"])).json()["cash"] == 99_975.0
    assert client.get("/trading/me", headers=auth(b["token"])).json()["cash"] == 100_000.0


@pytest.mark.parametrize("headers", [
    {},
    {"Authorization": "Bearer not-a-real-token"},
    {"Authorization": "Basic abc"},
    {"Authorization": "Bearer"},
])
def test_missing_or_bad_token_is_rejected(client, headers):
    response = client.get("/trading/me", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_tokens_are_stored_hashed(client, db):
    session = new_session(client)
    stored = [row[0] for row in db.conn.execute("SELECT token_hash FROM sessions")]
    assert session["token"] not in stored
    assert len(stored[0]) == 64  # sha256 hex


def test_session_user_is_saved_in_cents(client, db):
    session = new_session(client)
    assert get_user(db, session["user_id"]).cash_cents == 10_000_000


def test_token_survives_many_requests(client):
    token = new_session(client)["token"]
    for _ in range(5):
        assert client.get("/trading/me", headers=auth(token)).status_code == 200
