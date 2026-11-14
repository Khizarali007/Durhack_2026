"""P2-10: one Solana receipt per market minute of bot trades, checkable against the stored list."""

import asyncio
import hashlib
import json
import time

from trading.chain.bot_bundles import BotBundleRecorder, bundle_lines, record_bundle
from trading.chain.receipts import BotTradeLine, bot_trades_hash, build_bot_bundle_memo
from trading.chain.worker import ReceiptWorker
from trading.db import Database
from trading.fake_market import TICKS_PER_MARKET_MINUTE, FakeMarket
from trading.market_contract import BotTrade, BotTradeSummary
from trading.tests.conftest import FakeSender


def summary(n=3, minute_t=1729555200.0):
    trades = tuple(BotTrade(f"value-{i:02d}", "SGA", "buy" if i % 2 else "sell", i + 1, 150.0 + i, minute_t + i)
                   for i in range(n))
    return BotTradeSummary(minute_t, n, sum(t.qty for t in trades), trades)


# --- Hash and memo ------------------------------------------------------------------

def test_hash_is_sha256_of_one_line_per_trade():
    lines = [BotTradeLine("value-01", "SGA", "buy", 2, 15000, 1.0), BotTradeLine("momentum-02", "LUKA", "sell", 1, 14050, 7.5)]
    expected = hashlib.sha256(b"value-01,SGA,buy,2,15000,1.0\nmomentum-02,LUKA,sell,1,14050,7.5").hexdigest()
    assert bot_trades_hash(lines) == expected


def test_any_change_to_a_trade_changes_the_hash():
    lines = [BotTradeLine("value-01", "SGA", "buy", 2, 15000, 1.0)]
    tampered = [BotTradeLine("value-01", "SGA", "buy", 3, 15000, 1.0)]
    assert bot_trades_hash(lines) != bot_trades_hash(tampered)


def test_bundle_memo():
    memo = json.loads(build_bot_bundle_memo(bundle_id="bb_1", minute_t=1729555200.0, count=17, volume=34,
                                            trades_hash="ab" * 32))
    assert memo == {"app": "hoopstreet", "v": 1, "kind": "bots", "bundle": "bb_1", "minute": 1729555200.0,
                    "count": 17, "vol": 34, "h": "ab" * 32}


# --- Recording ----------------------------------------------------------------------

def test_record_bundle_saves_the_list_and_its_hash():
    db = Database(":memory:")
    bundle_id = record_bundle(db, summary(3))
    row = db.conn.execute("SELECT * FROM bot_bundles WHERE bundle_id = ?", (bundle_id,)).fetchone()
    assert (row["trade_count"], row["total_volume"], row["receipt_status"]) == (3, 6, "pending")
    lines = bundle_lines(db, bundle_id)
    assert [(b.bot_id, b.qty, b.price_cents) for b in lines] == [("value-00", 1, 15000), ("value-01", 2, 15100),
                                                                  ("value-02", 3, 15200)]
    assert row["trades_hash"] == bot_trades_hash(lines)


def test_a_minute_without_bot_trades_is_skipped():
    db = Database(":memory:")
    assert record_bundle(db, BotTradeSummary(0.0, 0, 0, ())) is None
    assert db.conn.execute("SELECT count(*) FROM bot_bundles").fetchone()[0] == 0


def test_recorder_bundles_each_market_minute_and_the_worker_confirms_it():
    async def scenario():
        db = Database(":memory:")
        market = FakeMarket(seed=4)
        sender = FakeSender()
        worker = ReceiptWorker(db, sender, base_delay_s=0, check_interval_s=0.01)
        await worker.start()
        recorder = BotBundleRecorder(db, market, on_bundle=worker.enqueue_bundle)
        await recorder.start()
        for _ in range(TICKS_PER_MARKET_MINUTE * 2):  # two market minutes
            market.step()
        await asyncio.sleep(0.05)
        await worker.wait_idle()
        await recorder.stop()
        await worker.stop()
        rows = db.conn.execute("SELECT * FROM bot_bundles ORDER BY rowid").fetchall()
        return sender, rows

    sender, rows = asyncio.run(scenario())
    assert len(rows) == 2
    assert rows[1]["minute_t"] - rows[0]["minute_t"] == 60
    assert all(r["receipt_status"] == "confirmed" and r["receipt_signature"] for r in rows)
    memos = [json.loads(m) for m, _ in sender.sent_bundles]
    assert [m["bundle"] for m in memos] == [r["bundle_id"] for r in rows]
    assert [(m["count"], m["h"]) for m in memos] == [(r["trade_count"], r["trades_hash"]) for r in rows]
    assert all(cosigner is None for _, cosigner in sender.sent_bundles)  # fee payer signs alone


def test_pending_bundles_are_sent_after_a_restart():
    async def scenario():
        db = Database(":memory:")
        record_bundle(db, summary(2))
        sender = FakeSender()
        worker = ReceiptWorker(db, sender, base_delay_s=0, check_interval_s=0.01)
        await worker.start()
        await worker.wait_idle()
        await worker.stop()
        return sender, db.conn.execute("SELECT receipt_status FROM bot_bundles").fetchone()[0]

    sender, status = asyncio.run(scenario())
    assert (len(sender.sent_bundles), status) == (1, "confirmed")


def test_failed_bundle_receipt_is_marked_failed():
    async def scenario():
        db = Database(":memory:")
        record_bundle(db, summary(2))
        sender = FakeSender()
        sender.always_fail = True
        worker = ReceiptWorker(db, sender, base_delay_s=0, check_interval_s=0.01, max_attempts=3)
        await worker.start()
        await worker.wait_idle()
        await worker.stop()
        return db.conn.execute("SELECT receipt_status FROM bot_bundles").fetchone()[0]

    assert asyncio.run(scenario()) == "failed"


# --- API ------------------------------------------------------------------------------

def test_bundle_endpoints_show_the_list_and_verify_the_hash(client, db):
    first = record_bundle(db, summary(2, minute_t=100.0))
    second = record_bundle(db, summary(4, minute_t=160.0))

    listing = client.get("/trading/bot-bundles").json()
    assert [b["bundle_id"] for b in listing][:2] == [second, first]  # newest first

    detail = client.get(f"/trading/bot-bundles/{second}").json()
    assert (detail["trade_count"], detail["total_volume"], len(detail["trades"])) == (4, 10, 4)
    assert detail["trades"][0] == {"bot_id": "value-00", "symbol": "SGA", "side": "sell", "qty": 1,
                                   "price": 150.0, "t": 160.0}
    assert detail["hash_matches"] is True
    assert detail["recomputed_hash"] == detail["trades_hash"]


def test_tampering_with_a_stored_trade_is_caught(client, db):
    bundle_id = record_bundle(db, summary(3))
    with db.lock, db.conn:
        db.conn.execute("UPDATE bot_trades SET qty = qty + 100 WHERE bundle_id = ? AND seq = 1", (bundle_id,))
    detail = client.get(f"/trading/bot-bundles/{bundle_id}").json()
    assert detail["hash_matches"] is False


def test_unknown_bundle_is_404(client):
    assert client.get("/trading/bot-bundles/bb_nope").status_code == 404


def test_bundles_are_public(client, db):
    bundle_id = record_bundle(db, summary(1))
    assert client.get("/trading/bot-bundles").status_code == 200
    assert client.get(f"/trading/bot-bundles/{bundle_id}").status_code == 200


def test_running_app_settles_a_real_market_minute(client, fake_sender):
    """The full app: market ticks -> bundle recorded -> receipt confirmed (one market minute = 5 s)."""
    deadline = time.monotonic() + 9
    while time.monotonic() < deadline:
        bundles = client.get("/trading/bot-bundles").json()
        if bundles and bundles[-1]["receipt_status"] == "confirmed":
            break
        time.sleep(0.2)
    oldest = bundles[-1]
    assert oldest["receipt_status"] == "confirmed"
    assert oldest["trade_count"] > 0
    assert client.get(f"/trading/bot-bundles/{oldest['bundle_id']}").json()["hash_matches"] is True
    assert fake_sender.sent_bundles
