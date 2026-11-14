"""The fake market behaves the way Person 2's code will rely on.

Run from the repo root:  python -m pytest backend/trading
"""

import asyncio

import pytest

from trading.fake_market import (
    MAKER_STARTING_SHARES,
    MARKET_SECONDS_PER_TICK,
    SEASON_START_T,
    TICKS_PER_MARKET_MINUTE,
    FakeMarket,
)
from trading.market_contract import BotTradeSummary, MarketTick


@pytest.fixture
def market():
    return FakeMarket(seed=1)


# --- Quotes ---------------------------------------------------------------------

def test_best_bid_and_ask_come_from_the_three_makers(market):
    q = market.quote("WEMBY")
    assert [m.maker_id for m in q.makers] == ["MM1", "MM2", "MM3"]
    assert q.bid == max(m.bid for m in q.makers)
    assert q.ask == min(m.ask for m in q.makers)
    assert q.bid < q.fair_value < q.ask


def test_spreads_match_person_1s_makers(market):
    q = market.quote("SGA")
    # Each maker quotes 2.0 / 2.5 / 3.0% wide, but their mids are offset by -0.7 / 0 / +0.7%,
    # so the best bid and best ask come from different makers: about 1.1% overall.
    for maker, width in zip(q.makers, (0.020, 0.025, 0.030)):
        assert (maker.ask - maker.bid) / q.fair_value == pytest.approx(width, abs=0.002)
    assert 0.008 < (q.ask - q.bid) / q.fair_value < 0.015


def test_opening_price_is_the_start_price(market):
    for player in market.players():
        assert market.last_price(player.symbol) == player.start_price


def test_same_seed_gives_same_market():
    a, b = FakeMarket(seed=7), FakeMarket(seed=7)
    for _ in range(50):
        a.step()
        b.step()
    assert a.quote("SGA") == b.quote("SGA")


def test_market_time_runs_twelve_times_real_time(market):
    assert market.market_time() == SEASON_START_T
    for _ in range(10):
        market.step()
    assert market.market_time() == SEASON_START_T + 10 * MARKET_SECONDS_PER_TICK  # 5 real s = 60 market s


# --- Orders ---------------------------------------------------------------------

def test_small_buy_fills_at_best_ask_and_sets_the_price(market):
    ask = market.quote("TATUM").ask
    result = market.submit_order(account_id="u1", symbol="TATUM", side="buy", qty=5)
    assert result.status == "filled"
    assert result.filled_qty == 5
    assert result.average_price == ask
    assert market.last_price("TATUM") == ask


def test_small_sell_fills_at_best_bid(market):
    bid = market.quote("TATUM").bid
    result = market.submit_order(account_id="u1", symbol="TATUM", side="sell", qty=5)
    assert result.average_price == bid


def test_big_buy_gets_slippage_and_lifts_the_quotes(market):
    before = market.quote("LUKA")
    result = market.submit_order(account_id="u1", symbol="LUKA", side="buy", qty=200)
    assert result.status == "filled"
    assert result.average_price > before.ask
    assert len({f.counterparty for f in result.fills}) > 1
    assert market.quote("LUKA").ask > before.ask  # makers short of shares quote higher


def test_buying_more_than_makers_hold_is_partly_filled(market):
    result = market.submit_order(account_id="u1", symbol="CURRY", side="buy", qty=1000)
    assert result.status == "partially_filled"
    assert result.filled_qty == 3 * MAKER_STARTING_SHARES
    assert result.remaining_qty == 1000 - 3 * MAKER_STARTING_SHARES
    assert "ran out of shares" in result.reason
    assert market.quote("CURRY").ask is None


def test_selling_without_holdings_is_allowed_by_the_engine(market):
    # Person 2 checks holdings; the engine doesn't (needed for shorting).
    result = market.submit_order(account_id="nobody", symbol="ANT", side="sell", qty=5)
    assert result.status == "filled"


@pytest.mark.parametrize("order", [
    dict(symbol="NOPE", side="buy", qty=1),
    dict(symbol="SGA", side="buy", qty=0),
    dict(symbol="SGA", side="buy", qty=2.5),
    dict(symbol="SGA", side="short", qty=1),
])
def test_bad_orders_are_rejected(market, order):
    result = market.submit_order(account_id="u1", **order)
    assert result.status == "rejected"
    assert result.reason


# --- Events ---------------------------------------------------------------------

def test_every_tick_sends_all_quotes(market):
    ticks = [e for e in market.step() if isinstance(e, MarketTick)]
    assert len(ticks) == 1
    assert set(ticks[0].quotes) == {p.symbol for p in market.players()}
    assert ticks[0].t == market.market_time()


def test_prices_move_over_time(market):
    start = market.quote("SGA").fair_value
    for _ in range(100):
        market.step()
    assert market.quote("SGA").fair_value != start


def test_bot_summary_once_per_market_minute(market):
    summaries = []
    for _ in range(TICKS_PER_MARKET_MINUTE * 3):
        summaries += [e for e in market.step() if isinstance(e, BotTradeSummary)]
    assert len(summaries) == 3
    assert summaries[1].minute_t - summaries[0].minute_t == 60
    for s in summaries:
        assert s.count == len(s.trades) > 0
        assert s.total_volume == sum(t.qty for t in s.trades)


def test_subscribers_receive_events_until_they_unsubscribe():
    async def scenario():
        market = FakeMarket(seed=7)
        queue = market.subscribe()
        market.step()
        first = await asyncio.wait_for(queue.get(), timeout=1)
        market.unsubscribe(queue)
        market.step()
        return first, queue.qsize()

    first, leftover = asyncio.run(scenario())
    assert isinstance(first, MarketTick)
    assert leftover == 0


def test_run_ticks_in_real_time():
    async def scenario():
        market = FakeMarket(seed=8)
        queue = market.subscribe()
        task = asyncio.create_task(market.run())
        await asyncio.sleep(1.2)
        task.cancel()
        return sum(isinstance(queue.get_nowait(), MarketTick) for _ in range(queue.qsize()))

    assert asyncio.run(scenario()) in (2, 3)
