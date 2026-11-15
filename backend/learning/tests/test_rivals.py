"""Practice rivals: real engine bots with fictional names, tracked cheaply, compared with you."""

import asyncio
import csv
import sqlite3

import pytest
from fastapi.testclient import TestClient

from market.engine import LiveMarket
from learning.currency import hoop
from market.rivals import RIVAL_CASH_CENTS
from trading.db import STARTING_CASH_CENTS
from trading.market_provider import use_market


def build(tmp_path, bot_count=10):
    db = tmp_path / "games.sqlite"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE player_games (player_id INTEGER, player_name TEXT, team_abbreviation TEXT,"
                     " game_date TEXT, game_score REAL, did_not_play INTEGER, game_id INTEGER)")
        conn.executemany("INSERT INTO player_games VALUES (?,?,?,?,?,?,?)", [
            (1, "Victor Wembanyama", "SAS", "2024-10-22", 40, 0, 1), (2, "Nikola Jokic", "DEN", "2024-10-23", 35, 0, 2),
            (1, "Victor Wembanyama", "SAS", "2024-10-24", 30, 0, 3), (2, "Nikola Jokic", "DEN", "2024-10-25", 28, 0, 4)])
    with (tmp_path / "values.csv").open("w") as f:
        w = csv.writer(f)
        w.writerow(["player_id", "player_name", "team", "expected_game_score", "starting_price", "prior_games"])
        w.writerow([1, "Victor Wembanyama", "SAS", 20, 100, 100])
        w.writerow([2, "Nikola Jokic", "DEN", 22, 110, 100])
    (tmp_path / "injuries.csv").write_text("player_id,report_date,report_datetime\n")
    return LiveMarket(database=db, values=tmp_path / "values.csv", injuries=tmp_path / "injuries.csv", bot_count=bot_count)


def play(engine, days):
    end = engine.market_time() + days * 86400
    while engine.market_time() < end and not engine.finished:
        engine.step()


def test_five_named_rivals_are_funded_tracked_and_the_ledger_still_balances(tmp_path):
    engine = build(tmp_path)
    names = {r.name: r for r in engine.rivals.rivals.values()}
    assert set(names) == {"Maya", "Theo", "Priya", "Sam", "Jordan"}
    assert RIVAL_CASH_CENTS == STARTING_CASH_CENTS  # rivals start with a player's H$100 of cash
    assert all(r.bot.cash >= RIVAL_CASH_CENTS for r in names.values())
    play(engine, 3)
    engine.check_ledger()
    traded = [r for r in names.values() if r.fills]
    assert traded, "rivals should trade"
    maya = names["Maya"]
    assert len(maya.equity) >= 3 and maya.equity[0][1] == maya.opening_equity
    assert sum(p.amount for r in names.values() for p in r.payments) > 0  # rivals hold shares on game days


@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = build(tmp_path)
    play(engine, 3)

    async def paused():
        await asyncio.Event().wait()

    monkeypatch.setattr(engine, "run", paused)
    monkeypatch.setenv("SOLANA_RECEIPTS", "off")
    use_market(engine)
    from main import app
    with TestClient(app) as c:
        token = c.post("/trading/guest").json()["token"]
        yield c, {"Authorization": "Bearer " + token}
    use_market(None)


def test_rivals_endpoints_rank_you_among_simulated_traders_and_explain_the_difference(client):
    c, auth = client
    rows = c.get("/learning/rivals", headers=auth).json()["rows"]
    assert len(rows) == 6 and [r["rank"] for r in rows] == [1, 2, 3, 4, 5, 6]
    assert sum(1 for r in rows if r["simulated"]) == 5 and any(r["id"] == "you" for r in rows)
    assert all(r["label"] == "Simulated trader" for r in rows if r["simulated"])

    detail = c.get("/learning/rivals/maya", headers=auth).json()
    assert detail["rival"]["name"] == "Maya" and detail["rival"]["persona"] == "Value Hunter"
    assert detail["equity"] and detail["composition"]["holdings"] >= 1 and detail["top_holdings"]
    assert c.get("/learning/rivals/nobody", headers=auth).status_code == 404

    cmp = c.get("/learning/rivals/maya/compare", headers=auth).json()
    assert any(d.startswith("Maya owns") for d in cmp["differences"])
    # The H$ in the sentence is the UI's formatting of the raw number the list API returns.
    maya = next(r for r in rows if r["id"] == "maya")
    assert any(f"Maya has been paid {hoop(maya['payouts'])} from games" in d for d in cmp["differences"])
    # Rival money is scaled to a H$100 start: their list equity is H$100 x (1 + return).
    assert maya["equity"] == pytest.approx(100_000 * (1 + maya["return_pct"] / 100), rel=1e-3)
    assert detail["equity"][0]["equity"] == pytest.approx(100_000, rel=1e-3)
    assert all(0 < h["weight_pct"] <= 100 for h in detail["top_holdings"])
    assert cmp["try"]["kind"] in ("tutorial", "glossary")

    coach = c.post("/learning/coach", headers=auth, json={"rival_id": "maya"}).json()
    assert len(coach["bullets"]) == 3
