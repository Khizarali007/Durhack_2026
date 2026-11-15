"""Learning layer on the REAL adapters: Person 1's season engine and Person 2's trading DB.

Small fixture data only (no network, no local dataset, no full replay).
"""

from __future__ import annotations

import asyncio
import csv
import sqlite3

import pytest
from fastapi.testclient import TestClient

from learning.adapters.base import MarketAdapter, TradesAdapter as TradesProtocol
from learning.adapters.models import MarketEvent, Position
from learning.adapters.season_market import SeasonMarketAdapter
from market.engine import LiveMarket
from trading.accounts import create_guest_user
from trading.adapters import TradesAdapter
from trading.db import Database
from trading.market_provider import use_market
from trading.orders import place_market_order


@pytest.fixture
def engine(tmp_path):
    db = tmp_path / "games.sqlite"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE player_games (player_id INTEGER, player_name TEXT, team_abbreviation TEXT,"
                     " game_date TEXT, game_score REAL, did_not_play INTEGER, game_id INTEGER)")
        conn.executemany("INSERT INTO player_games VALUES (?,?,?,?,?,?,?)", [
            (1, "Victor Wembanyama", "SAS", "2024-10-22", 40, 0, 1),
            (2, "Shai Gilgeous-Alexander", "OKC", "2024-10-23", 30, 0, 2)])
    values = tmp_path / "values.csv"
    with values.open("w") as f:
        w = csv.writer(f)
        w.writerow(["player_id", "player_name", "team", "expected_game_score", "starting_price", "prior_games"])
        w.writerow([1, "Victor Wembanyama", "SAS", 20, 100, 100])
        w.writerow([2, "Shai Gilgeous-Alexander", "OKC", 18, 90, 100])
    injuries = tmp_path / "injuries.csv"
    injuries.write_text("player_id,report_date,report_datetime\n")
    return LiveMarket(database=db, values=values, injuries=injuries)


def test_season_adapter_satisfies_protocol_and_reads_real_quotes(engine):
    adapter = SeasonMarketAdapter(lambda: engine)
    assert isinstance(adapter, MarketAdapter)
    assert sorted(adapter.symbols()) == ["SGA", "WEMBY"]
    tick = adapter.get_tick("WEMBY")
    q = engine.quote("WEMBY")
    assert tick.price == q.last and tick.best_bid == q.bid and tick.best_ask == q.ask
    assert tick.t == engine.market_time()
    assert adapter.get_tick("NOPE") is None
    assert adapter.recent_ticks("WEMBY")  # the opening timeline point


def test_learning_events_never_move_the_shared_replay(engine):
    adapter = SeasonMarketAdapter(lambda: engine)
    before = engine.quote("SGA")
    now = adapter.market_time()
    adapter.inject_event(MarketEvent(t=now, symbol="SGA", kind="hot_streak", headline="SGA heats up", impact=0.2))
    adapter.inject_event(MarketEvent(t=now + 3600, symbol="SGA", kind="injury", headline="Later"))
    adapter.set_fair_value_shift("SGA", 0.2)
    assert engine.quote("SGA") == before
    assert [e.headline for e in adapter.recent_events()] == ["SGA heats up"]
    assert adapter.requested_shifts() == {"SGA": 0.2}


def test_trades_adapter_sees_real_fills_and_restores_account(engine):
    db = Database(":memory:")
    try:
        trades = TradesAdapter(db, market=lambda: engine)
        assert isinstance(trades, TradesProtocol)
        uid = create_guest_user(db).user_id
        place_market_order(db, engine, uid, "SGA", "buy", 3)
        fills = trades.trades_for_user(uid)
        # The season engine fills one share at a time (execution_chunk_size = 1).
        assert {(t.side, t.symbol) for t in fills} == {("buy", "SGA")} and sum(t.qty for t in fills) == 3
        real_cash = trades.portfolio(uid).cash
        trades.apply_start_state(uid, 5000.0, [Position(symbol="WEMBY", qty=0, avg_cost=0)])
        assert trades.portfolio(uid).cash == 5000.0
        assert trades.restore_start_state(uid)
        assert trades.portfolio(uid).cash == real_cash
    finally:
        db.close()


def test_one_backend_serves_learning_with_real_adapters(engine, monkeypatch):
    from main import app

    monkeypatch.setenv("SOLANA_RECEIPTS", "off")

    async def paused():
        await asyncio.Event().wait()

    monkeypatch.setattr(engine, "run", paused)
    use_market(engine)
    try:
        with TestClient(app) as c:
            health = c.get("/learning/health").json()
            assert health["adapters"] == {"market": True, "trades": True}
            assert c.get("/learning/glossary").status_code == 200
            assert isinstance(c.get("/learning/missions").json(), list)
            assert c.get("/market/players").status_code == 200
    finally:
        use_market(None)
