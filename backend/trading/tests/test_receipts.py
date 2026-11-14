"""P2-09: every human order gets a Solana receipt in the background, and trades never wait for it."""

import asyncio
import hashlib
import json
import os
import time

import pytest

from trading.accounts import create_guest_user
from trading.chain.receipts import FillLine, build_trade_memo, fills_hash
from trading.chain.wallets import wallet_address
from trading.chain.worker import ReceiptWorker
from trading.db import Database
from trading.tests.conftest import FakeSender, auth


# --- The memo ---------------------------------------------------------------------

def test_memo_says_who_traded_what_at_what_price():
    fills = [FillLine(10, 15026, 150), FillLine(10, 15169, 152)]
    memo = json.loads(build_trade_memo(order_id="ord_1", wallet="WALLET", symbol="SGA", side="buy",
                                       fills=fills, t=1729555206.0))
    assert memo == {"app": "hoopstreet", "v": 1, "kind": "trade", "order": "ord_1", "wallet": "WALLET",
                    "sym": "SGA", "side": "buy", "qty": 20, "avg": 150.98, "fee": 3.02, "fills": 2,
                    "h": fills_hash(fills), "t": 1729555206.0}


def test_hash_can_be_checked_against_the_fill_list():
    fills = [FillLine(10, 15026, 150), FillLine(5, 15169, 76)]
    assert fills_hash(fills) == hashlib.sha256(b"10@15026,5@15169").hexdigest()[:16]


def test_memo_stays_small_even_for_a_huge_order():
    fills = [FillLine(10, 9500 + i, 10) for i in range(45)]  # 450 shares in 45 fills
    memo = build_trade_memo(order_id="ord_" + "a" * 12, wallet="W" * 44, symbol="GIANNIS",
                            side="buy", fills=fills, t=1729555206.0)
    assert len(memo) < 400  # one Solana transaction holds ~1,200 bytes


# --- Through the API ----------------------------------------------------------------

@pytest.fixture
def player(client):
    session = client.post("/trading/guest").json()
    return auth(session["token"]), session


def buy(client, headers, symbol="SGA", qty=5):
    response = client.post("/trading/orders", headers=headers, json={"symbol": symbol, "side": "buy", "qty": qty})
    assert response.status_code == 200, response.json()
    return response.json()


def wait_for_receipt(client, headers, order_id, timeout_s=3.0):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        receipt = client.get(f"/trading/orders/{order_id}/receipt", headers=headers).json()
        if receipt["status"] != "pending":
            return receipt
        time.sleep(0.02)
    raise AssertionError(f"receipt for {order_id} still pending after {timeout_s}s")


def test_order_gets_a_confirmed_receipt(client, player, fake_sender):
    headers, session = player
    order = buy(client, headers)
    assert order["receipt_status"] == "pending"

    receipt = wait_for_receipt(client, headers, order["order_id"])
    assert {k: receipt[k] for k in ("order_id", "status", "signature", "explorer_url")} == {
        "order_id": order["order_id"], "status": "confirmed", "signature": "fakesig1",
        "explorer_url": "https://explorer.solana.com/tx/fakesig1?cluster=devnet"}
    assert 0 <= receipt["confirm_ms"] < 3000  # measured from send to confirmation

    memo, cosigner = fake_sender.sent[0]
    memo = json.loads(memo)
    assert (memo["order"], memo["sym"], memo["qty"], memo["wallet"]) == (
        order["order_id"], "SGA", 5, session["wallet_address"])
    assert str(cosigner.pubkey()) == session["wallet_address"]  # the player's wallet co-signs


def test_every_fill_of_the_order_shows_the_receipt(client, player):
    headers, _ = player
    order = buy(client, headers, "LUKA", 25)  # several fills
    wait_for_receipt(client, headers, order["order_id"])
    trades = client.get("/trading/trades", headers=headers).json()
    assert len(trades) == len(order["fills"]) > 1
    confirm_times = {trade["receipt_confirm_ms"] for trade in trades}
    assert len(confirm_times) == 1 and confirm_times.pop() >= 0
    for trade in trades:
        assert (trade["receipt_status"], trade["receipt_signature"]) == ("confirmed", "fakesig1")
        assert trade["receipt_explorer_url"].endswith("/tx/fakesig1?cluster=devnet")


def test_one_receipt_per_order(client, player, fake_sender):
    headers, _ = player
    orders = [buy(client, headers, s) for s in ("SGA", "TATUM", "CURRY")]
    for order in orders:
        wait_for_receipt(client, headers, order["order_id"])
    assert len(fake_sender.sent) == 3
    assert {json.loads(m)["order"] for m, _ in fake_sender.sent} == {o["order_id"] for o in orders}


def test_trades_never_wait_for_solana(client, player, fake_sender):
    headers, _ = player
    fake_sender.delay_s = 1.5  # a slow devnet
    start = time.monotonic()
    order = buy(client, headers)
    assert time.monotonic() - start < 0.5
    assert order["status"] == "filled"
    assert client.get(f"/trading/orders/{order['order_id']}/receipt", headers=headers).json()["status"] == "pending"


def test_failed_sends_are_retried(client, player, fake_sender):
    headers, _ = player
    fake_sender.fail_times = 2
    order = buy(client, headers)
    assert wait_for_receipt(client, headers, order["order_id"])["status"] == "confirmed"
    assert fake_sender.attempts == 3


def test_rate_limited_status_checks_do_not_resend(client, player, fake_sender):
    headers, _ = player
    fake_sender.status_errors = 3  # devnet says 429 three times
    order = buy(client, headers)
    assert wait_for_receipt(client, headers, order["order_id"], timeout_s=5)["status"] == "confirmed"
    assert len(fake_sender.sent) == 1  # sent once, checked until it showed up


def test_a_transaction_the_chain_rejects_is_sent_again(client, player, fake_sender):
    headers, _ = player
    fake_sender.reject_times = 1
    order = buy(client, headers)
    receipt = wait_for_receipt(client, headers, order["order_id"], timeout_s=5)
    assert (receipt["status"], receipt["signature"]) == ("confirmed", "fakesig2")
    assert len(fake_sender.sent) == 2


def test_gives_up_after_five_tries_but_the_trade_stands(client, player, fake_sender):
    headers, _ = player
    fake_sender.always_fail = True
    order = buy(client, headers)
    receipt = wait_for_receipt(client, headers, order["order_id"])
    assert (receipt["status"], receipt["signature"], receipt["explorer_url"]) == ("failed", None, None)
    assert fake_sender.attempts == 5
    portfolio = client.get("/trading/portfolio", headers=headers).json()
    assert portfolio["positions"][0]["qty"] == 5  # the trade itself is untouched


def test_receipt_of_someone_elses_order_is_404(client, player):
    headers, _ = player
    order = buy(client, headers)
    other = auth(client.post("/trading/guest").json()["token"])
    assert client.get(f"/trading/orders/{order['order_id']}/receipt", headers=other).status_code == 404
    assert client.get("/trading/orders/ord_nope/receipt", headers=headers).status_code == 404
    assert client.get(f"/trading/orders/{order['order_id']}/receipt").status_code == 401


def test_receipts_off_leaves_trades_pending(monkeypatch, fake_sender):
    from fastapi.testclient import TestClient

    from trading import market_provider
    from trading.db import DB_PATH_ENV
    from trading.fake_market import FakeMarket

    monkeypatch.setenv(DB_PATH_ENV, ":memory:")
    monkeypatch.setenv("SOLANA_RECEIPTS", "off")
    market_provider.use_market(FakeMarket(seed=3))
    from main import app
    with TestClient(app) as client:
        headers = auth(client.post("/trading/guest").json()["token"])
        order = buy(client, headers)
        time.sleep(0.2)
        assert client.get(f"/trading/orders/{order['order_id']}/receipt", headers=headers).json()["status"] == "pending"
    market_provider.use_market(None)
    assert fake_sender.sent == []


# --- The worker on its own -------------------------------------------------------------

def _insert_trade(db, user_id, order_id, qty=3, price=10_000):
    with db.lock, db.conn:
        db.conn.execute(
            "INSERT INTO trades (trade_id, order_id, user_id, symbol, side, qty, price_cents, fee_cents, t)"
            " VALUES (?, ?, ?, 'SGA', 'buy', ?, ?, 30, 1729555206.0)",
            (f"t_{order_id}", order_id, user_id, qty, price))


def fast_worker(db, sender, **overrides):
    settings = dict(base_delay_s=0, check_interval_s=0.01)
    settings.update(overrides)
    return ReceiptWorker(db, sender, **settings)


def test_pending_receipts_from_before_a_restart_are_sent(tmp_path):
    async def scenario():
        db = Database(":memory:")
        user = create_guest_user(db)
        _insert_trade(db, user.user_id, "ord_old1")
        _insert_trade(db, user.user_id, "ord_old2")
        sender = FakeSender()
        worker = fast_worker(db, sender)
        await worker.start()  # picks up both without being told
        await worker.wait_idle()
        await worker.stop()
        statuses = [r[0] for r in db.conn.execute("SELECT receipt_status FROM trades")]
        return sender, statuses, wallet_address(db, user.user_id)

    sender, statuses, wallet = asyncio.run(scenario())
    assert statuses == ["confirmed", "confirmed"]
    assert [json.loads(m)["order"] for m, _ in sender.sent] == ["ord_old1", "ord_old2"]
    assert json.loads(sender.sent[0][0])["wallet"] == wallet
    assert sender.closed


def test_already_confirmed_orders_are_not_sent_twice():
    async def scenario():
        db = Database(":memory:")
        user = create_guest_user(db)
        _insert_trade(db, user.user_id, "ord_1")
        sender = FakeSender()
        worker = fast_worker(db, sender)
        await worker.start()
        await worker.wait_idle()
        worker.enqueue("ord_1")  # queued again by mistake
        worker.enqueue("ord_unknown")
        await worker.wait_idle()
        await worker.stop()
        return sender

    assert len(asyncio.run(scenario()).sent) == 1


def test_a_sent_receipt_is_checked_not_resent_after_a_restart():
    async def scenario():
        db = Database(":memory:")
        user = create_guest_user(db)
        _insert_trade(db, user.user_id, "ord_1")
        with db.lock, db.conn:  # sent before the restart, confirmation not seen yet
            db.conn.execute("UPDATE trades SET receipt_signature = 'sig_before_restart'")
        sender = FakeSender()
        worker = fast_worker(db, sender)
        await worker.start()
        await worker.wait_idle()
        await worker.stop()
        row = db.conn.execute("SELECT receipt_status, receipt_signature FROM trades").fetchone()
        return sender, tuple(row)

    sender, row = asyncio.run(scenario())
    assert sender.sent == []
    assert row == ("confirmed", "sig_before_restart")


def test_a_receipt_that_never_lands_is_resent_then_marked_failed():
    async def scenario():
        db = Database(":memory:")
        user = create_guest_user(db)
        _insert_trade(db, user.user_id, "ord_1")
        sender = FakeSender()
        sender.never_lands = True
        worker = fast_worker(db, sender, landing_timeout_s=0.05, max_attempts=3)
        await worker.start()
        await worker.wait_idle()
        await worker.stop()
        return sender, db.conn.execute("SELECT receipt_status FROM trades").fetchone()[0]

    sender, status = asyncio.run(scenario())
    assert len(sender.sent) == 3
    assert status == "failed"


def test_status_checks_are_batched():
    async def scenario():
        db = Database(":memory:")
        user = create_guest_user(db)
        for i in range(10):
            _insert_trade(db, user.user_id, f"ord_{i}")
        sender = FakeSender()
        worker = fast_worker(db, sender, check_interval_s=0.2)
        await worker.start()
        await worker.wait_idle()
        await worker.stop()
        return sender

    sender = asyncio.run(scenario())
    assert len(sender.sent) == 10
    assert sender.status_calls <= 3  # one request covers every receipt in flight


# --- Real devnet (opt-in) ---------------------------------------------------------------

@pytest.mark.skipif(not os.environ.get("HOOP_DEVNET_TESTS"), reason="set HOOP_DEVNET_TESTS=1 to hit devnet")
def test_devnet_confirms_a_real_receipt(monkeypatch):
    from solders.keypair import Keypair

    from trading.chain import config
    from trading.chain.receipts import DevnetSender
    monkeypatch.setattr(config, "FEE_PAYER_PATH", config.REPO_ROOT / ".solana" / "fee-payer-keypair.json")

    async def scenario():
        sender = DevnetSender()
        memo = build_trade_memo(order_id="ord_devnet_test", wallet="test", symbol="SGA", side="buy",
                                fills=[FillLine(1, 15000, 15)], t=time.time())
        try:
            signature = await sender.send(memo, Keypair())
            for _ in range(60):
                await asyncio.sleep(0.5)
                if (await sender.statuses([signature]))[signature] == "confirmed":
                    return signature, True
            return signature, False
        finally:
            await sender.close()

    signature, confirmed = asyncio.run(scenario())
    assert len(signature) > 60 and confirmed
