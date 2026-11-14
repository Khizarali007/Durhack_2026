"""P2-08: fee-payer keypair, one wallet per user, and the chain status check.

None of these touch the network. To also check the real devnet connection:
    HOOP_DEVNET_TESTS=1 python -m pytest backend/trading -k devnet
"""

import json
import os
import stat

import pytest
from solders.keypair import Keypair
from solders.pubkey import Pubkey

from trading.chain import status
from trading.chain.keys import keypair_from_text, load_or_create_keypair, secret_to_text
from trading.chain.wallets import ensure_wallet, wallet_keypair
from trading.tests.conftest import auth


# --- Fee-payer keypair ---------------------------------------------------------

def test_keypair_is_created_once_then_reloaded(tmp_path):
    path = tmp_path / "nested" / "fee-payer-keypair.json"
    first, created = load_or_create_keypair(path)
    again, created_again = load_or_create_keypair(path)
    assert (created, created_again) == (True, False)
    assert first.pubkey() == again.pubkey()


def test_keypair_file_is_cli_format_and_owner_only(tmp_path):
    path = tmp_path / "fee-payer-keypair.json"
    keypair, _ = load_or_create_keypair(path)
    numbers = json.loads(path.read_text())
    assert len(numbers) == 64 and all(0 <= n <= 255 for n in numbers)  # Solana CLI format
    assert bytes(numbers) == bytes(keypair)
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600


def test_secret_text_round_trip():
    keypair = Keypair()
    assert keypair_from_text(secret_to_text(keypair)).pubkey() == keypair.pubkey()


def test_fee_payer_is_kept_out_of_git():
    gitignore = (status.config.REPO_ROOT / ".gitignore").read_text()
    assert ".solana/" in gitignore and "*keypair*.json" in gitignore


# --- One wallet per user ---------------------------------------------------------

def test_every_new_account_gets_its_own_wallet(client):
    guest = client.post("/trading/guest").json()
    member = client.post("/trading/signup", json={"username": "ricky", "password": "hoops123"}).json()
    addresses = {guest["wallet_address"], member["wallet_address"]}
    assert len(addresses) == 2
    for address in addresses:
        Pubkey.from_string(address)  # a valid Solana address


def test_wallet_stays_the_same_across_logins(client):
    first = client.post("/trading/signup", json={"username": "ricky", "password": "hoops123"}).json()
    again = client.post("/trading/login", json={"username": "ricky", "password": "hoops123"}).json()
    assert again["wallet_address"] == first["wallet_address"]


def test_me_shows_the_wallet_and_an_explorer_link(client):
    session = client.post("/trading/guest").json()
    me = client.get("/trading/me", headers=auth(session["token"])).json()
    assert me["wallet_address"] == session["wallet_address"]
    assert me["wallet_explorer_url"] == (
        f"https://explorer.solana.com/address/{session['wallet_address']}?cluster=devnet")


def test_server_can_sign_for_the_user_but_never_sends_the_secret(client, db):
    session = client.post("/trading/guest").json()
    keypair = wallet_keypair(db, session["user_id"])
    assert str(keypair.pubkey()) == session["wallet_address"]
    secret = secret_to_text(keypair)
    me = client.get("/trading/me", headers=auth(session["token"])).text
    assert secret not in json.dumps(session) and secret not in me


def test_ensure_wallet_is_idempotent(db):
    db.conn.execute("INSERT INTO users (user_id, cash_cents, created_at) VALUES ('u_old', 0, 0)")
    assert ensure_wallet(db, "u_old") == ensure_wallet(db, "u_old")
    assert db.conn.execute("SELECT count(*) FROM wallets WHERE user_id = 'u_old'").fetchone()[0] == 1


# --- Chain status (network faked) -------------------------------------------------

def test_status_when_funded(client, monkeypatch, temp_fee_payer):
    async def fake_balance(address, timeout_s=5.0):
        return 2.0
    monkeypatch.setattr(status, "get_balance_sol", fake_balance)

    body = client.get("/trading/chain/status").json()
    assert (body["cluster"], body["balance_sol"], body["reachable"], body["ready"]) == ("devnet", 2.0, True, True)
    assert temp_fee_payer.exists()  # created on first use
    assert body["fee_payer_address"] in body["fee_payer_explorer_url"]


def test_status_when_not_funded_yet(client, monkeypatch):
    async def fake_balance(address, timeout_s=5.0):
        return 0.0
    monkeypatch.setattr(status, "get_balance_sol", fake_balance)
    body = client.get("/trading/chain/status").json()
    assert (body["reachable"], body["ready"], body["faucet_url"]) == (True, False, "https://faucet.solana.com")


def test_status_when_devnet_is_unreachable(client, monkeypatch):
    async def broken(address, timeout_s=5.0):
        raise ConnectionError("no internet")
    monkeypatch.setattr(status, "get_balance_sol", broken)
    body = client.get("/trading/chain/status").json()
    assert (body["reachable"], body["ready"], body["balance_sol"]) == (False, False, None)
    assert "no internet" in body["error"]


@pytest.mark.skipif(not os.environ.get("HOOP_DEVNET_TESTS"), reason="set HOOP_DEVNET_TESTS=1 to hit devnet")
def test_devnet_answers_a_balance_request():
    import asyncio
    assert asyncio.run(status.get_balance_sol(str(Keypair().pubkey()))) == 0.0
