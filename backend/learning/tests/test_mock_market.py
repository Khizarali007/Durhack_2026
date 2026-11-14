from learning.adapters import MarketAdapter, MarketEvent
from learning.adapters.mock_market import MockMarket
from learning.scenario import load_scenario


def run(m: MockMarket, seconds: float) -> None:
    for _ in range(int(round(seconds / 0.5))):
        m.step(0.5)


def test_implements_protocol():
    assert isinstance(MockMarket(seed=1), MarketAdapter)


def test_has_sga_near_48_with_tick_from_start():
    m = MockMarket(seed=1)
    assert "SGA" in m.symbols()
    assert len(m.symbols()) >= 4
    tk = m.get_tick("SGA")
    assert tk is not None and 45 <= tk.price <= 51
    assert m.get_tick("NOPE") is None


def test_ticks_move_and_spread_wraps_price():
    m = MockMarket(seed=2)
    t0 = m.get_tick("SGA")
    run(m, 5)
    ticks = m.recent_ticks("SGA", 1000)
    assert len(ticks) == 11
    assert ticks[-1].t - t0.t == 5 * 12  # 1 market minute = 5 real seconds
    assert len({tk.price for tk in ticks}) > 1
    for tk in ticks:
        assert tk.best_bid < tk.best_ask
        assert tk.best_bid <= tk.price <= tk.best_ask
    assert len(m.recent_ticks("SGA", 3)) == 3


def test_price_mean_reverts_to_fair_value_without_events():
    m = MockMarket(seed=3)
    run(m, 60)
    tk = m.get_tick("SGA")
    assert abs(tk.price - tk.fair_value) / tk.fair_value < 0.05


def test_hot_streak_ramps_peaks_then_fades():
    m = MockMarket(seed=4)
    run(m, 2)
    m.inject_event(
        MarketEvent(t=m.market_time(), symbol="SGA", kind="hot_streak", headline="h", impact=0.18)
    )
    fv0 = 48.0
    run(m, 5)
    early = m.get_tick("SGA").fair_value
    run(m, 10)  # ~15 s after the event: at peak
    peak = m.get_tick("SGA").fair_value
    run(m, 30)
    later = m.get_tick("SGA").fair_value
    assert fv0 < early < peak
    assert abs(peak / fv0 - 1.18) < 0.01
    assert fv0 < later < peak  # hype fades, but some of it sticks
    assert len(m.recent_events()) == 1


def test_future_event_is_scheduled():
    m = MockMarket(seed=5)
    m.inject_event(
        MarketEvent(
            t=m.market_time() + 3 * 12, symbol="SGA", kind="injury", headline="x", impact=-0.2
        )
    )
    run(m, 2)
    assert m.recent_events() == []
    run(m, 1.5)
    assert len(m.recent_events()) == 1


def test_set_fair_value_shift_ramps():
    m = MockMarket(seed=6)
    m.set_fair_value_shift("SGA", 0.10, ramp_s=4)
    run(m, 2)
    assert abs(m.get_tick("SGA").fair_value - 48 * 1.05) < 0.05
    run(m, 3)
    assert abs(m.get_tick("SGA").fair_value - 48 * 1.10) < 0.05
    m.set_fair_value_shift("SGA", 0.0)
    m.step()
    assert abs(m.get_tick("SGA").fair_value - 48) < 0.05


def test_storm_widens_spread():
    m = MockMarket(seed=7)
    m.step()
    calm = m.get_tick("SGA")
    m.inject_event(
        MarketEvent(t=m.market_time(), symbol="SGA", kind="trade_rumour", headline="r", storm=3.0)
    )
    m.step()
    stormy = m.get_tick("SGA")
    assert (stormy.best_ask - stormy.best_bid) > (calm.best_ask - calm.best_bid) * 2


def test_mission1_shape_on_mock():
    """Playing the m1 timeline on the mock gives: calm, a rise to a peak
    around t=25-30, then a partial give-back before the bell."""
    sc = load_scenario("m1_buy_low_sell_high")
    wins = []
    for seed in range(10):
        m = MockMarket(seed=seed)
        start_t = m.market_time()
        for step in sc.market_steps():
            m.inject_event(step.to_market_event(start_t))
        run(m, sc.duration_s)
        prices = {round((tk.t - start_t) / 12, 1): tk.price for tk in m.recent_ticks("SGA", 1000)}
        at_event = prices[10.0]
        peak_t = max((t for t in prices if t >= 10), key=lambda t: prices[t])
        peak = prices[peak_t]
        end = prices[float(sc.duration_s)]
        wins.append(20 <= peak_t <= 35 and peak > at_event * 1.12 and end < peak)
    assert sum(wins) >= 8, wins
