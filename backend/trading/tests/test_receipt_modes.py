"""SOLANA_RECEIPTS=auto/on/off with the season engine: receipts degrade calmly, trades never wait."""

from __future__ import annotations

import asyncio
import csv
import sqlite3
import time

import pytest
from fastapi.testclient import TestClient

from market.engine import LiveMarket
from trading.chain import status as chain_status_module
from trading.chain.status import ChainStatus
from trading.market_provider import use_market


@pytest.fixture
def season(tmp_path, monkeypatch):
    db = tmp_path / "games.sqlite"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE player_games (player_id INTEGER, player_name TEXT, team_abbreviation TEXT,"
                     " game_date TEXT, game_score REAL, did_not_play INTEGER, game_id INTEGER)")
        conn.execute("INSERT INTO player_games VALUES (1, 'Victor Wembanyama', 'SAS', '2024-10-22', 40, 0, 1)")
    values = tmp_path / "values.csv"
    with values.open("w") as f:
        w = csv.writer(f)
        w.writerow(["player_id", "player_name", "team", "expected_game_score", "starting_price", "prior_games"])
        w.writerow([1, "Victor Wembanyama", "SAS", 20, 100, 100])
    injuries = tmp_path / "injuries.csv"
    injuries.write_text("player_id,report_date,report_datetime\n")
    engine = LiveMarket(database=db, values=values, injuries=injuries)

    async def paused():
        await asyncio.Event().wait()

    monkeypatch.setattr(engine, "run", paused)
    use_market(engine)
    yield engine
    use_market(None)


def fake_status(ready: bool, reachable: bool):
    async def status():
        return ChainStatus(cluster="devnet", rpc_url="x", fee_payer_address="P", fee_payer_explorer_url="u",
                           balance_sol=1.0 if ready else (0.0 if reachable else None), reachable=reachable,
                           ready=ready, faucet_url="f")
    return status


def buy(client):
    token = client.post("/trading/guest").json()["token"]
    headers = {"Authorization": "Bearer " + token}
    r = client.post("/trading/orders", headers=headers, json={"symbol": "WEMBY", "side": "buy", "qty": 1})
    assert r.status_code == 200, r.text
    return headers, r.json()


@pytest.mark.parametrize("ready,reachable,words", [(False, False, "isn't answering"), (False, True, "needs test SOL")])
def test_auto_pauses_receipts_calmly_and_trades_still_fill(season, monkeypatch, ready, reachable, words):
    from main import app
    monkeypatch.setenv("SOLANA_RECEIPTS", "auto")
    monkeypatch.setattr(chain_status_module, "chain_status", fake_status(ready, reachable))
    app.state.receipts_probe = None
    with TestClient(app) as c:
        status = c.get("/market/status").json()
        assert status["receipts_enabled"] is False and words in status["receipts_note"]
        _, order = buy(c)
        assert order["receipt_status"] == "disabled"


def test_auto_with_funded_devnet_confirms_human_receipts_but_not_bot_bundles(season, monkeypatch, fake_sender):
    from main import app
    monkeypatch.setenv("SOLANA_RECEIPTS", "auto")
    monkeypatch.setattr(chain_status_module, "chain_status", fake_status(True, True))
    app.state.receipts_probe = None
    with TestClient(app) as c:
        assert c.get("/market/status").json()["receipts_enabled"] is True
        headers, order = buy(c)
        deadline = time.time() + 10
        receipt = None
        while time.time() < deadline:
            trades = c.get("/trading/trades", headers=headers).json()
            receipt = trades[0]["receipt_status"]
            if receipt == "confirmed":
                break
            time.sleep(0.05)
        assert receipt == "confirmed"
        assert trades[0]["receipt_explorer_url"]
        assert fake_sender.sent_bundles == []
