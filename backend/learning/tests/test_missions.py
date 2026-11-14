"""Mission runner integration tests, with time sped up (ManualClock + manual market steps)."""

import pytest

from learning.adapters.mock_market import MockMarket
from learning.adapters.mock_trades import MockTrades
from learning.clock import ManualClock
from learning.missions import MissionConflict, MissionManager, MissionNotFound, MissionState

M1 = "m1_buy_low_sell_high"


class World:
    def __init__(self, seed=0):
        self.market = MockMarket(seed=seed)
        self.trades = MockTrades(self.market)
        self.clock = ManualClock()
        self.mgr = MissionManager(self.market, self.trades, clock=self.clock, autorun=False)

    def play(self, seconds, actions=None, dt=0.5):
        """Advance real time by `seconds`; run actions[t]() once elapsed reaches t."""
        actions = dict(actions or {})
        start = self.clock.now()
        for _ in range(int(round(seconds / dt))):
            self.market.step(dt)
            self.clock.advance(dt)
            self.mgr.tick()
            el = self.clock.now() - start
            for t in sorted(k for k in actions if k <= el + 1e-9):
                actions.pop(t)()


@pytest.fixture
def w():
    return World(seed=0)


@pytest.mark.parametrize("seed", range(5))
def test_buy_before_streak_sell_near_peak_is_passed_great(seed):
    w = World(seed=seed)
    w.mgr.start("u_test", M1)
    w.play(
        50,
        {
            5: lambda: w.trades.place_market_order("u_test", "SGA", "buy", 100),
            27: lambda: w.trades.place_market_order("u_test", "SGA", "sell", 100),
        },
    )
    run = w.mgr.get("u_test")
    assert run.state == MissionState.completed
    r = w.mgr.result("u_test")
    assert r.outcome == "passed_great", r
    assert r.passed and r.score >= 60 and r.realised_pnl > 0
    assert r.state == "completed" and r.user_id == "u_test"
    assert r.best_entry_price <= r.entry_price and r.exit_price <= r.best_exit_price + 0.5


def test_never_buys_is_never_bought_and_failed(w):
    w.mgr.start("u_test", M1)
    w.play(46)
    assert w.mgr.get("u_test").state == MissionState.failed
    r = w.mgr.result("u_test")
    assert r.outcome == "never_bought" and not r.passed and r.score == 0


def test_timeline_messages_in_order(w):
    w.mgr.start("u_test", M1)
    st = w.mgr.status("u_test")
    assert st["state"] == "running"
    assert [m["kind"] for m in st["messages"]] == ["state", "message"]  # t=0 fires on start
    w.play(11)
    st = w.mgr.status("u_test")
    assert st["hints"] == ["Watch the ticker - a player is heating up."]
    event = [m for m in st["messages"] if m["kind"] == "event"]
    assert event and event[0]["symbol"] == "SGA" and "heating up" in event[0]["text"]
    assert event[0]["event_kind"] == "hot_streak"
    assert st["seconds_left"] == pytest.approx(34, abs=0.01)
    assert len(w.market.recent_events()) == 1
    w.play(40)
    kinds = [m.kind for m in w.mgr.get("u_test").messages]
    assert kinds[-2:] == ["state", "result"]
    assert w.mgr.status("u_test")["seconds_left"] == 0


def test_mission_window_and_price_path_recorded(w):
    w.mgr.start("u_test", M1)
    w.play(46)
    run = w.mgr.get("u_test")
    assert run.end_market_t - run.start_market_t == pytest.approx(45 * 12, abs=12)
    ticks = run.price_path()["SGA"]
    assert ticks[0].t == run.start_market_t
    assert len(ticks) >= 90
    assert [tk.t for tk in ticks] == sorted(tk.t for tk in ticks)
    assert run.fired[0].market_t == pytest.approx(run.start_market_t + 10 * 12)


def test_one_active_mission_per_user(w):
    w.mgr.start("u_test", M1)
    with pytest.raises(MissionConflict):
        w.mgr.start("u_test", M1)
    w.mgr.start("someone_else", M1)  # other users are independent
    assert w.mgr.get("someone_else").state == MissionState.running


def test_stop_early_gives_result(w):
    w.mgr.start("u_test", M1)
    w.play(4, {2: lambda: w.trades.place_market_order("u_test", "SGA", "buy", 10)})
    w.mgr.stop("u_test")
    run = w.mgr.get("u_test")
    assert run.state == MissionState.stopped
    assert w.mgr.result("u_test").outcome == "still_holding"
    w.play(10)  # no more steps fire after a stop
    assert run.next_step == 2 and w.market.recent_events() == []
    with pytest.raises(MissionConflict):
        w.mgr.stop("u_test")


def test_restart_after_end_resets_start_state(w):
    w.mgr.start("u_test", M1)
    w.play(3, {1: lambda: w.trades.place_market_order("u_test", "SGA", "buy", 10)})
    w.mgr.stop("u_test")
    assert w.trades.portfolio("u_test").positions
    w.mgr.start("u_test", M1)
    p = w.trades.portfolio("u_test")
    assert p.cash == 100_000 and p.positions == []


def test_trades_before_mission_start_are_ignored(w):
    w.trades.place_market_order("u_test", "SGA", "buy", 10)
    w.play(1)
    w.mgr.start("u_test", M1)
    w.play(46)
    assert w.mgr.result("u_test").outcome == "never_bought"


def test_result_before_end_and_unknown_missions(w):
    with pytest.raises(MissionNotFound):
        w.mgr.result("nobody")
    assert w.mgr.status("nobody")["state"] == "idle"
    with pytest.raises(MissionNotFound):
        w.mgr.start("u_test", "m2_read_the_spread")  # placeholder
    with pytest.raises(MissionNotFound):
        w.mgr.start("u_test", "nope")
    w.mgr.start("u_test", M1)
    with pytest.raises(MissionConflict):
        w.mgr.result("u_test")


def test_catalogue_marks_availability(w):
    cat = {m["id"]: m["available"] for m in w.mgr.catalogue()}
    assert cat[M1] is True
    assert sum(cat.values()) == 1
