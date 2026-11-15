"""Official injury reports become an early warning (cloudy) before the storm (out), with mild text."""
import csv
import sqlite3
from datetime import datetime, timezone

import pytest

from market.engine import LiveMarket
from trading.market_contract import MarketTick

FIELDS = ["report_date", "report_datetime", "game_date", "player_id", "report_player_name", "player_name", "team",
          "status", "reason", "impact_level", "availability_probability", "target_factor"]


@pytest.fixture
def engine(tmp_path):
    db = tmp_path / "games.sqlite"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE player_games (player_id INTEGER, player_name TEXT, team_abbreviation TEXT,"
                     " game_date TEXT, game_score REAL, did_not_play INTEGER, game_id INTEGER)")
        conn.executemany("INSERT INTO player_games VALUES (?,?,?,?,?,?,?)", [
            (1, "Victor Wembanyama", "SAS", "2025-02-18", 30, 0, 1),
            (2, "Other Player", "BOS", "2025-02-21", 10, 0, 2)])
    values = tmp_path / "values.csv"
    with values.open("w") as f:
        w = csv.writer(f)
        w.writerow(["player_id", "player_name", "team", "expected_game_score", "starting_price", "prior_games"])
        w.writerow([1, "Victor Wembanyama", "SAS", 20, 100, 100])
        w.writerow([2, "Other Player", "BOS", 10, 50, 100])
    injuries = tmp_path / "injuries.csv"
    with injuries.open("w") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        base = dict(player_id=1, report_player_name="Wembanyama, Victor", player_name="Victor Wembanyama",
                    team="San Antonio Spurs")
        w.writerow({**base, "report_date": "2025-02-19", "report_datetime": "2025-02-19T21:30:00",
                    "game_date": "2025-02-20", "status": "Doubtful", "reason": "Illness",
                    "impact_level": "minor", "availability_probability": .83, "target_factor": .941})
        w.writerow({**base, "report_date": "2025-02-20", "report_datetime": "2025-02-20T21:30:00",
                    "game_date": "2025-02-20", "status": "Out", "reason": "Deep Vein Thrombosis",
                    "impact_level": "severe", "availability_probability": .14, "target_factor": .699})
    return LiveMarket(database=db, values=values, injuries=injuries)


def close_through(engine, iso_day):
    end = datetime.fromisoformat(iso_day).replace(tzinfo=timezone.utc).timestamp() + 86400 + 1
    while engine.market_time() < end and not engine.finished:
        engine.step(target_t=end)


def test_warning_comes_a_day_before_the_storm_and_text_stays_mild(engine):
    queue = engine.subscribe()

    close_through(engine, "2025-02-19")
    q = engine.quote("WEMBY")
    assert q.injury_status == "Doubtful"
    assert [e["kind"] for e in engine.news] == ["early_warning"]

    close_through(engine, "2025-02-20")
    q = engine.quote("WEMBY")
    assert q.injury_status == "Out"
    assert [e["kind"] for e in engine.news] == ["early_warning", "injury"]
    warning, storm_event = engine.news
    assert storm_event["impact"] < warning["impact"] < 0  # the warning is the small move; the storm is the big one

    storm = engine.news[-1]
    assert storm["symbol"] == "WEMBY" and storm["headline"].startswith("Storm: Victor Wembanyama ruled out for 20 Feb")
    events = []
    while not queue.empty():
        e = queue.get_nowait()
        if isinstance(e, dict):
            events.append(e)
        else:
            assert isinstance(e, MarketTick) or e is not None
    assert [e["kind"] for e in events] == ["early_warning", "injury"]
    for text in [q.injury_reason, *(e["headline"] for e in engine.news)]:
        assert "Thrombosis" not in text and "Illness" not in text
    assert q.injury_reason == "Listed out on the official NBA injury report"
