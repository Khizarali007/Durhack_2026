"""Accounts survive a backend restart with the season engine; portfolios restart calmly."""

from __future__ import annotations

import asyncio
import csv
import sqlite3

import pytest
from fastapi.testclient import TestClient

from market.engine import LiveMarket
from trading.market_provider import use_market


def make_engine(tmp_path):
    db = tmp_path / "games.sqlite"
    if not db.exists():
        with sqlite3.connect(db) as conn:
            conn.execute("CREATE TABLE player_games (player_id INTEGER, player_name TEXT, team_abbreviation TEXT,"
                         " game_date TEXT, game_score REAL, did_not_play INTEGER, game_id INTEGER)")
            conn.execute("INSERT INTO player_games VALUES (1, 'Victor Wembanyama', 'SAS', '2024-10-22', 40, 0, 1)")
        with (tmp_path / "values.csv").open("w") as f:
            w = csv.writer(f)
            w.writerow(["player_id", "player_name", "team", "expected_game_score", "starting_price", "prior_games"])
            w.writerow([1, "Victor Wembanyama", "SAS", 20, 100, 100])
        (tmp_path / "injuries.csv").write_text("player_id,report_date,report_datetime\n")
    return LiveMarket(database=db, values=tmp_path / "values.csv", injuries=tmp_path / "injuries.csv")


@pytest.fixture
def boot(tmp_path, monkeypatch):
    """Start the app on a fresh season engine; the identity store is a file in tmp_path."""
    monkeypatch.setenv("SOLANA_RECEIPTS", "off")
    monkeypatch.setenv("ACCOUNTS_DB_PATH", str(tmp_path / "accounts.sqlite"))

    def start():
        engine = make_engine(tmp_path)

        async def paused():
            await asyncio.Event().wait()

        monkeypatch.setattr(engine, "run", paused)
        use_market(engine)
        from main import app
        return TestClient(app)

    yield start
    use_market(None)


def test_login_and_token_survive_a_restart_and_the_portfolio_restarts(boot):
    with boot() as c:
        session = c.post("/trading/signup", json={"username": "maya_r", "password": "hoops123"}).json()
        headers = {"Authorization": "Bearer " + session["token"]}
        assert c.post("/trading/orders", headers=headers, json={"symbol": "WEMBY", "side": "buy", "qty": 3}).status_code == 200
        assert c.get("/trading/me", headers=headers).json()["season_reset"] is False

    with boot() as c:  # backend restart: new market, new in-memory trading DB
        me = c.get("/trading/me", headers=headers)
        assert me.status_code == 200, me.text  # the old token still works
        body = me.json()
        assert body["username"] == "maya_r" and body["season_reset"] is True and body["cash"] == 100_000
        assert c.get("/trading/portfolio", headers=headers).json()["positions"] == []
        assert c.post("/trading/login", json={"username": "MAYA_R", "password": "hoops123"}).status_code == 200
        assert c.post("/trading/login", json={"username": "maya_r", "password": "wrong-one"}).status_code == 401
        assert c.post("/trading/signup", json={"username": "maya_r", "password": "hoops123"}).status_code == 409
        c.post("/trading/me/season-reset/dismiss", headers=headers)
        assert c.get("/trading/me", headers=headers).json()["season_reset"] is False


def test_guest_saves_progress_and_logout_ends_the_token_for_good(boot):
    with boot() as c:
        guest = c.post("/trading/guest").json()
        headers = {"Authorization": "Bearer " + guest["token"]}
        c.post("/trading/orders", headers=headers, json={"symbol": "WEMBY", "side": "buy", "qty": 2})
        up = c.post("/trading/upgrade", headers=headers, json={"username": "theo", "password": "secret99"})
        assert up.status_code == 200 and up.json()["is_guest"] is False and up.json()["username"] == "theo"
        assert c.get("/trading/portfolio", headers=headers).json()["positions"][0]["qty"] == 2  # kept
        again = c.post("/trading/upgrade", headers=headers, json={"username": "theo2", "password": "secret99"})
        assert again.status_code == 400
        c.post("/trading/logout", headers=headers)
        assert c.get("/trading/me", headers=headers).status_code == 401

    with boot() as c:
        assert c.get("/trading/me", headers=headers).status_code == 401  # logged out stays logged out
        assert c.post("/trading/login", json={"username": "theo", "password": "secret99"}).status_code == 200
