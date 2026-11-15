import pytest

from learning.adapters import TradesAdapter
from learning.adapters.mock_market import MockMarket
from learning.adapters.mock_trades import START_CASH, MockOrderError, MockTrades


@pytest.fixture
def setup():
    m = MockMarket(seed=11)
    m.step()
    return m, MockTrades(m)


def test_implements_protocol(setup):
    _, tr = setup
    assert isinstance(tr, TradesAdapter)


def test_new_user_starts_with_100k(setup):
    _, tr = setup
    p = tr.portfolio("alice")
    assert p.cash == START_CASH == 100_000
    assert p.equity == START_CASH
    assert p.positions == []


def test_buy_fills_at_ask_with_fee(setup):
    m, tr = setup
    tk = m.get_tick("SGA")
    trade = tr.place_market_order("alice", "SGA", "buy", 10)
    assert trade.price == tk.best_ask
    assert trade.fee == pytest.approx(tk.best_ask * 10 * 0.001)
    assert trade.t == tk.t and trade.reason == "market"
    p = tr.portfolio("alice")
    assert p.cash == pytest.approx(START_CASH - tk.best_ask * 10 * 1.001)
    assert p.positions[0].qty == 10
    assert p.positions[0].avg_cost == pytest.approx(tk.best_ask)
    assert p.equity == pytest.approx(p.cash + 10 * tk.price)


def test_sell_fills_at_bid_and_closes_position(setup):
    m, tr = setup
    tr.place_market_order("alice", "SGA", "buy", 10)
    m.step()
    tk = m.get_tick("SGA")
    sell = tr.place_market_order("alice", "SGA", "sell", 10)
    assert sell.price == tk.best_bid
    assert tr.portfolio("alice").positions == []


def test_avg_cost_is_weighted(setup):
    m, tr = setup
    a = tr.place_market_order("alice", "SGA", "buy", 10)
    m.step()
    b = tr.place_market_order("alice", "SGA", "buy", 30)
    pos = tr.portfolio("alice").positions[0]
    assert pos.avg_cost == pytest.approx((a.price * 10 + b.price * 30) / 40)


def test_rejects_bad_orders(setup):
    _, tr = setup
    with pytest.raises(MockOrderError):
        tr.place_market_order("alice", "SGA", "sell", 1)
    with pytest.raises(MockOrderError):
        tr.place_market_order("alice", "SGA", "buy", 1_000_000)
    with pytest.raises(MockOrderError):
        tr.place_market_order("alice", "NOPE", "buy", 1)
    with pytest.raises(MockOrderError):
        tr.place_market_order("alice", "SGA", "cover", 1)


def test_short_and_cover(setup):
    m, tr = setup
    tk = m.get_tick("SGA")
    tr.place_market_order("bob", "SGA", "short", 5)
    p = tr.portfolio("bob")
    assert p.positions[0].qty == -5
    assert p.cash == pytest.approx(START_CASH + tk.best_bid * 5 * 0.999)
    tr.place_market_order("bob", "SGA", "cover", 5)
    assert tr.portfolio("bob").positions == []


def test_trades_since_t(setup):
    m, tr = setup
    tr.place_market_order("alice", "SGA", "buy", 1)
    m.step()
    cutoff = m.market_time()
    tr.place_market_order("alice", "SGA", "buy", 1)
    assert len(tr.trades_for_user("alice")) == 2
    assert len(tr.trades_for_user("alice", since_t=cutoff)) == 1
    assert tr.trades_for_user("carol") == []
