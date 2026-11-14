"""P2-07: sign-up, login, guest and logout."""

import pytest

from trading.passwords import hash_password, verify_password
from trading.tests.conftest import auth


def signup(client, username="ricky", password="hoops123"):
    return client.post("/trading/signup", json={"username": username, "password": password})


def login(client, username="ricky", password="hoops123"):
    return client.post("/trading/login", json={"username": username, "password": password})


# --- Sign-up --------------------------------------------------------------------

def test_signup_creates_an_account_and_logs_in(client):
    response = signup(client)
    assert response.status_code == 201
    body = response.json()
    assert (body["username"], body["is_guest"], body["cash"]) == ("ricky", False, 100_000.0)
    me = client.get("/trading/me", headers=auth(body["token"])).json()
    assert me == {"user_id": body["user_id"], "username": "ricky", "is_guest": False, "cash": 100_000.0}


@pytest.mark.parametrize("second", ["ricky", "RICKY", "Ricky"])
def test_usernames_are_unique_ignoring_case(client, second):
    assert signup(client).status_code == 201
    response = signup(client, username=second)
    assert response.status_code == 409
    assert response.json()["detail"] == "that username is taken"


@pytest.mark.parametrize("username, password", [
    ("ab", "hoops123"),           # too short
    ("a" * 21, "hoops123"),       # too long
    ("bad name", "hoops123"),     # space
    ("ricky!", "hoops123"),       # symbol
    ("ricky", "12345"),           # password too short
    ("ricky", "x" * 129),         # password too long
])
def test_bad_usernames_and_passwords_are_422(client, username, password):
    assert signup(client, username, password).status_code == 422


# --- Login ----------------------------------------------------------------------

def test_login_returns_a_new_working_token(client):
    first = signup(client).json()
    response = login(client)
    assert response.status_code == 200
    second = response.json()
    assert second["user_id"] == first["user_id"]
    assert second["token"] != first["token"]
    for token in (first["token"], second["token"]):  # both sessions work
        assert client.get("/trading/me", headers=auth(token)).status_code == 200


def test_login_ignores_username_case(client):
    signup(client)
    assert login(client, username="RiCkY").status_code == 200


@pytest.mark.parametrize("username, password", [("ricky", "wrong-pass"), ("nobody", "hoops123")])
def test_wrong_password_or_unknown_user_get_the_same_401(client, username, password):
    signup(client)
    response = login(client, username, password)
    assert response.status_code == 401
    assert response.json()["detail"] == "wrong username or password"


def test_portfolio_survives_logging_back_in(client):
    first = signup(client).json()
    client.post("/trading/orders", headers=auth(first["token"]), json={"symbol": "SGA", "side": "buy", "qty": 7})
    client.post("/trading/logout", headers=auth(first["token"]))

    again = login(client).json()
    portfolio = client.get("/trading/portfolio", headers=auth(again["token"])).json()
    assert [(p["symbol"], p["qty"]) for p in portfolio["positions"]] == [("SGA", 7)]
    assert portfolio["cash"] < 100_000.0


def test_guests_cannot_log_in(client, db):
    client.post("/trading/guest")
    assert db.conn.execute("SELECT count(*) FROM users WHERE username IS NULL").fetchone()[0] == 1
    assert login(client, username="null", password="whatever").status_code == 401


# --- Passwords are never stored as plain text -------------------------------------

def test_passwords_are_stored_hashed_and_salted(client, db):
    signup(client, "alice", "same-password")
    signup(client, "bob", "same-password")
    hashes = [row[0] for row in db.conn.execute("SELECT password_hash FROM users ORDER BY username")]
    assert all(h.startswith("scrypt$") for h in hashes)
    assert all("same-password" not in h for h in hashes)
    assert hashes[0] != hashes[1]  # different salts


def test_verify_password():
    stored = hash_password("correct horse")
    assert verify_password("correct horse", stored)
    assert not verify_password("Correct horse", stored)
    assert not verify_password("correct horse", "garbage")
    assert not verify_password("correct horse", "")


# --- Guest and logout -------------------------------------------------------------

def test_guest_is_one_tap_and_can_trade(client):
    response = client.post("/trading/guest")
    assert response.status_code == 201
    body = response.json()
    assert (body["username"], body["is_guest"], body["cash"]) == (None, True, 100_000.0)
    order = client.post("/trading/orders", headers=auth(body["token"]), json={"symbol": "SGA", "side": "buy", "qty": 1})
    assert order.status_code == 200


def test_old_session_endpoint_still_makes_a_guest(client):
    body = client.post("/trading/session").json()
    assert body["is_guest"] is True


def test_logout_ends_only_that_session(client):
    first = signup(client).json()
    second = login(client).json()
    assert client.post("/trading/logout", headers=auth(first["token"])).status_code == 204
    assert client.get("/trading/me", headers=auth(first["token"])).status_code == 401
    assert client.get("/trading/me", headers=auth(second["token"])).status_code == 200


def test_logout_needs_a_valid_token(client):
    assert client.post("/trading/logout").status_code == 401
    assert client.post("/trading/logout", headers=auth("nope")).status_code == 401
