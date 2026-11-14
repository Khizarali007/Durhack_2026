"""P2-17: the off-chain leaderboard ranks players by equity, always works, and updates live."""

from types import SimpleNamespace

import pytest

from trading.accounts import create_account, create_guest_user
from trading.adapters import TradesAdapter
from trading.chain.wallets import ensure_wallet
from trading.db import Database
from trading.fake_market import FakeMarket
from trading.leaderboard import LeaderboardBroadcaster, standings
from trading.orders import place_market_order
from trading.portfolio import build_portfolio
from trading.tests.conftest import auth
from trading.tests.test_live import recv


@pytest.fixture
def setup():
    db = Database(":memory:")
    return db, FakeMarket(seed=17)


def move_price(market, symbol, factor):
    m = market._markets[symbol]
    m.fair_cents *= factor
    m.last_cents = round(m.last_cents * factor)


def set_cash(db, user_id, cents):
    with db.lock, db.conn:
        db.conn.execute("UPDATE users SET cash_cents = ? WHERE user_id = ?", (cents, user_id))


def by_user(ranked):
    return {s.user_id: s for s in ranked}


# --- Ranking ----------------------------------------------------------------------------------

def test_ranked_by_equity_with_idle_guests_left_off(setup):
    db, market = setup
    winner = create_account(db, "hoopsfan", "secret1").user_id
    loser = create_guest_user(db).user_id
    idle = create_guest_user(db).user_id
    place_market_order(db, market, winner, "SGA", "buy", 50)
    place_market_order(db, market, loser, "WEMBY", "buy", 50)
    move_price(market, "SGA", 1.1)
    move_price(market, "WEMBY", 0.8)

    ranked = standings(db, market)
    assert [s.user_id for s in ranked] == [winner, loser]
    assert [s.rank for s in ranked] == [1, 2]
    assert idle not in by_user(ranked)
    first, second = ranked
    assert (first.name, first.is_guest) == ("hoopsfan", False)
    assert second.name == f"Guest {loser[-4:]}" and second.is_guest
    assert first.return_pct > 0 > second.return_pct
    for s in ranked:  # equity is exactly the portfolio's
        view = build_portfolio(db, market, s.user_id)
        assert (s.equity_cents, s.total_pnl_cents) == (view.equity_cents, view.total_pnl_cents)


def test_shorts_and_leverage_are_valued_like_the_portfolio(setup):
    db, market = setup
    short = create_guest_user(db).user_id
    levered = create_guest_user(db).user_id
    place_market_order(db, market, short, "JOKIC", "short", 30)
    set_cash(db, levered, 500_000)
    place_market_order(db, market, levered, "TATUM", "buy", 1000, leverage=3)
    move_price(market, "JOKIC", 0.9)
    move_price(market, "TATUM", 0.95)
    for s in standings(db, market):
        assert s.equity_cents == build_portfolio(db, market, s.user_id).equity_cents


def test_ties_go_to_whoever_joined_first(setup):
    db, market = setup
    first, second = create_guest_user(db).user_id, create_guest_user(db).user_id
    for user_id in (second, first):
        place_market_order(db, market, user_id, "SGA", "buy", 1)
        place_market_order(db, market, user_id, "SGA", "sell", 1)
        set_cash(db, user_id, 10_000_000)
    assert [s.user_id for s in standings(db, market)] == [first, second]


def test_players_in_a_mission_are_ranked_on_their_real_account(setup):
    db, market = setup
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 20)
    real = by_user(standings(db, market))[user_id]
    adapter = TradesAdapter(db, lambda: market)

    adapter.apply_start_state(user_id, 900_000.0, [SimpleNamespace(symbol="WEMBY", qty=100, avg_cost=105.0)])
    during = by_user(standings(db, market))[user_id]
    assert during.in_mission and during.equity_cents == real.equity_cents  # not the 900,000 sandbox
    move_price(market, "SGA", 1.2)                                      # still follows the real holdings
    assert by_user(standings(db, market))[user_id].equity_cents > real.equity_cents

    adapter.restore_start_state(user_id)
    after = by_user(standings(db, market))[user_id]
    assert not after.in_mission
    assert after.equity_cents == build_portfolio(db, market, user_id).equity_cents


def test_orders_and_confirmed_receipts_are_counted(setup):
    db, market = setup
    user_id = create_guest_user(db).user_id
    ensure_wallet(db, user_id)
    first = place_market_order(db, market, user_id, "SGA", "buy", 25)   # several fills, one order
    place_market_order(db, market, user_id, "SGA", "sell", 5)
    with db.lock, db.conn:
        db.conn.execute("UPDATE trades SET receipt_status = 'confirmed' WHERE order_id = ?", (first.order_id,))
    [s] = standings(db, market)
    assert (s.orders, s.receipts_confirmed) == (2, 1)
    assert s.wallet_address and len(s.wallet_address) > 30


# --- Live updates ------------------------------------------------------------------------------

def test_broadcasts_once_a_minute_and_only_when_it_changes(setup):
    db, market = setup
    sent = []
    broadcaster = LeaderboardBroadcaster(db, market, sent.append)
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 10)

    t = 600_000.0  # the start of a market minute
    assert broadcaster.on_tick(t)["entries"][0]["user_id"] == user_id
    assert broadcaster.on_tick(t + 6) is None                   # same minute
    assert broadcaster.on_tick(t + 60) is None                  # nothing changed
    move_price(market, "SGA", 1.05)
    message = broadcaster.on_tick(t + 120)
    assert message and message["type"] == "leaderboard" and message["source"] == "off-chain"
    assert len(sent) == 2 and sent[-1]["entries"][0]["equity"] > sent[0]["entries"][0]["equity"]


def test_live_message_holds_the_top_10(setup):
    db, market = setup
    users = [create_guest_user(db).user_id for _ in range(12)]
    for i, user_id in enumerate(users):
        place_market_order(db, market, user_id, "SGA", "buy", i + 1)
    message = LeaderboardBroadcaster(db, market, lambda m: None).on_tick(0.0)
    assert len(message["entries"]) == 10 and message["total_players"] == 12
    assert [e["rank"] for e in message["entries"]] == list(range(1, 11))


# --- Over the API -------------------------------------------------------------------------------

def test_leaderboard_over_the_api(client):
    players = [client.post("/trading/session").json() for _ in range(3)]
    for p, qty in zip(players, (5, 10, 15)):
        client.post("/trading/orders", headers=auth(p["token"]), json={"symbol": "SGA", "side": "buy", "qty": qty})
    idle = client.post("/trading/session").json()

    public = client.get("/trading/leaderboard").json()
    assert public["source"] == "off-chain" and public["total_players"] == 3 and public["you"] is None
    entry = public["entries"][0]
    assert set(entry) == {"rank", "user_id", "name", "is_guest", "equity", "total_pnl", "return_pct", "orders",
                          "receipts_confirmed", "wallet_address", "in_mission", "chain_verified"}
    assert entry["chain_verified"] is False
    assert [e["equity"] for e in public["entries"]] == sorted((e["equity"] for e in public["entries"]), reverse=True)

    me = players[1]
    mine = client.get("/trading/leaderboard", headers=auth(me["token"]), params={"limit": 1}).json()
    assert len(mine["entries"]) == 1 and mine["you"]["user_id"] == me["user_id"]
    assert client.get("/trading/leaderboard", headers=auth(idle["token"])).json()["you"] is None
    assert client.get("/trading/leaderboard", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_works_with_solana_down(client, fake_sender):
    fake_sender.always_fail = True
    p = client.post("/trading/session").json()
    assert client.post("/trading/orders", headers=auth(p["token"]),
                       json={"symbol": "SGA", "side": "buy", "qty": 3}).status_code == 200
    board = client.get("/trading/leaderboard").json()
    assert board["entries"][0]["user_id"] == p["user_id"] and board["entries"][0]["receipts_confirmed"] == 0


def test_spectators_get_live_leaderboard_updates(client):
    p = client.post("/trading/session").json()
    with client.websocket_connect("/trading/ws") as ws:  # a projector screen, no token
        assert recv(ws)["type"] == "hello"
        client.post("/trading/orders", headers=auth(p["token"]), json={"symbol": "CURRY", "side": "buy", "qty": 4})
        for _ in range(60):
            message = recv(ws, timeout_s=8)
            if message["type"] == "leaderboard" and message["entries"]:
                break
        assert message["entries"][0]["user_id"] == p["user_id"]
