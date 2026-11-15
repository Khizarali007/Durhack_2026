"""GET /learning/review and POST /learning/coach on the real season engine (fixture data)."""

import asyncio
import csv
import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from learning import coach as coach_module
from market.engine import LiveMarket
from trading.market_provider import use_market


@pytest.fixture
def client(tmp_path, monkeypatch):
    db = tmp_path / "games.sqlite"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE player_games (player_id INTEGER, player_name TEXT, team_abbreviation TEXT,"
                     " game_date TEXT, game_score REAL, did_not_play INTEGER, game_id INTEGER)")
        conn.execute("INSERT INTO player_games VALUES (1, 'Victor Wembanyama', 'SAS', '2024-10-22', 40, 0, 1)")
    with (tmp_path / "values.csv").open("w") as f:
        w = csv.writer(f)
        w.writerow(["player_id", "player_name", "team", "expected_game_score", "starting_price", "prior_games"])
        w.writerow([1, "Victor Wembanyama", "SAS", 20, 100, 100])
    (tmp_path / "injuries.csv").write_text("player_id,report_date,report_datetime\n")
    engine = LiveMarket(database=db, values=tmp_path / "values.csv", injuries=tmp_path / "injuries.csv")

    async def paused():
        await asyncio.Event().wait()

    monkeypatch.setattr(engine, "run", paused)
    monkeypatch.setenv("SOLANA_RECEIPTS", "off")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    coach_module._cache.clear()
    use_market(engine)
    from main import app
    with TestClient(app) as c:
        yield c, engine
    use_market(None)


def test_review_after_a_buy_has_a_summary_cards_and_a_timeline(client):
    c, engine = client
    session = c.post("/trading/signup", json={"username": "reviewer", "password": "hoops123"}).json()
    headers = {"Authorization": "Bearer " + session["token"]}
    assert c.get("/learning/review").status_code == 401
    empty = c.get("/learning/review", headers=headers).json()
    assert empty["insights"] == [] and "first players" in empty["summary"]["biggest_lesson"]

    c.post("/trading/orders", headers=headers, json={"symbol": "WEMBY", "side": "buy", "qty": 5})
    engine.news.append({"type": "event", "t": engine.market_time() + 86400, "symbol": "WEMBY", "kind": "injury",
                        "headline": "Storm: Victor Wembanyama ruled out for 22 Oct on the official injury report",
                        "impact": -0.3, "storm": 2.0})
    r = c.get("/learning/review", headers=headers).json()
    assert r["summary"]["trades"] == 1 and r["summary"]["grade"] == "F"
    assert r["insights"][0]["id"] == "concentration"
    texts = [i["text"] for i in r["timeline"]]  # newest first
    assert texts[0].startswith("Out for a player you owned: Victor Wembanyama ruled out")
    buy = next(t for t in texts if t.startswith("You bought 5 shares of Victor Wembanyama at H$"))
    assert "the same day Wembanyama was ruled out" in buy


def test_coach_without_a_key_uses_the_template_and_sends_no_identity(client, monkeypatch):
    c, _ = client
    session = c.post("/trading/signup", json={"username": "secretname", "password": "hoops123"}).json()
    headers = {"Authorization": "Bearer " + session["token"]}
    c.post("/trading/orders", headers=headers, json={"symbol": "WEMBY", "side": "buy", "qty": 3})
    out = c.post("/learning/coach", headers=headers, json={}).json()
    assert out["source"] == "template" and len(out["bullets"]) == 3

    seen = {}

    async def fake_gemini(facts):
        seen["facts"] = json.dumps(facts)
        return ["One.", "Two.", "Three."]

    monkeypatch.setattr(coach_module, "_gemini", fake_gemini)
    coach_module._cache.clear()
    out = c.post("/learning/coach", headers=headers, json={}).json()
    assert out == {"bullets": ["One.", "Two.", "Three."], "source": "gemini"}
    assert "secretname" not in seen["facts"] and session["user_id"] not in seen["facts"]


def test_facts_for_gemini_are_preformatted_in_the_ui_denomination():
    review = {"summary": {"return_pct": -0.43, "payouts": 30.62, "fees": 61.6, "trades": 1, "grade": "F",
                          "max_drawdown_pct": -0.2, "biggest_lesson": "x"},
              "insights": [{"id": "concentration", "tone": "warning", "title": "t", "impact": -1234.5, "next_time": "n"}]}
    facts = coach_module.facts_for(review)
    assert facts["season_return"] == "-0.43%" and facts["biggest_drop"] == "-0.20%"
    assert facts["payouts"] == "H$0.03062" and facts["fees"] == "H$0.0616" and facts["starting_cash"] == "H$100.00"
    assert facts["insights"][0]["impact"] == "-H$1.2345"
