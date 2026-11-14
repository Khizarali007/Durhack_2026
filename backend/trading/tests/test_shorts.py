"""P2-14: short selling and cover.

Shorting before a price drop makes money, the loss keeps growing while the
price rises, collateral is held back, and long and short never mix in one player.
"""

import json
import random
import time
from types import SimpleNamespace

import pytest

from trading.accounts import create_guest_user
from trading.adapters import TradesAdapter
from trading.db import Database
from trading.estimates import estimate_order
from trading.fake_market import FakeMarket
from trading.market_contract import PerformancePayout
from trading.money import to_cents
from trading.open_orders import create_open_order
from trading.orders import (
    NOT_ENOUGH_COLLATERAL,
    OrderError,
    fee_cents,
    free_cash,
    place_market_order,
    short_collateral,
)
from trading.payouts import apply_payout
from trading.portfolio import build_portfolio
from trading.tests.conftest import auth

START = 10_000_000  # 100,000 HOOP in cents


@pytest.fixture
def setup():
    """A market we step by hand, so prices only move when a test moves them."""
    db = Database(":memory:")
    market = FakeMarket(seed=14)
    return db, market, create_guest_user(db).user_id


def move_price(market, symbol, factor):
    """Stand-in for news: fair value and the last price jump together (the makers re-quote around it)."""
    m = market._markets[symbol]
    m.fair_cents *= factor
    m.last_cents = round(m.last_cents * factor)


def cash(db, user_id):
    return db.conn.execute("SELECT cash_cents FROM users WHERE user_id = ?", (user_id,)).fetchone()[0]


def position(db, user_id, symbol):
    row = db.conn.execute("SELECT qty, cost_basis_cents FROM positions WHERE user_id = ? AND symbol = ?",
                          (user_id, symbol)).fetchone()
    return tuple(row) if row else None


def set_cash(db, user_id, cents):
    with db.lock, db.conn:
        db.conn.execute("UPDATE users SET cash_cents = ? WHERE user_id = ?", (cents, user_id))


def assert_pnl_adds_up(db, market, user_id):
    v = build_portfolio(db, market, user_id)
    assert v.total_pnl_cents == v.realised_cents + v.unrealised_cents - v.fees_cents + v.payouts_cents
    return v


def notional_and_fees(outcome):
    notional = sum(f.qty * f.price_cents for f in outcome.fills)
    return notional, sum(f.fee_cents for f in outcome.fills)


# --- Shorting ------------------------------------------------------------------------

def test_short_adds_the_proceeds_and_opens_a_negative_position(setup):
    db, market, user_id = setup
    bid = to_cents(market.quote("SGA").bid)
    maker_shares = sum(m.shares for m in market.quote("SGA").makers)

    outcome = place_market_order(db, market, user_id, "SGA", "short", 20)

    assert (outcome.status, outcome.side, outcome.filled_qty, outcome.position_qty_after) == ("filled", "short", 20, -20)
    notional, fees = notional_and_fees(outcome)
    assert fees == sum(fee_cents(f.qty * f.price_cents) for f in outcome.fills) > 0
    assert cash(db, user_id) == outcome.cash_cents_after == START + notional - fees
    assert position(db, user_id, "SGA") == (-20, notional)  # basis = what they were sold for
    assert outcome.quoted_best_cents == bid and outcome.slippage_cents >= 0
    # To the engine it was a sale: the makers bought 20 shares.
    assert sum(m.shares for m in market.quote("SGA").makers) == maker_shares + 20
    rows = db.conn.execute("SELECT side, reason FROM trades WHERE user_id = ?", (user_id,)).fetchall()
    assert {tuple(r) for r in rows} == {("short", "market")}


def test_shorting_before_a_price_drop_makes_money(setup):
    """The ticket's 'done when', part 1."""
    db, market, user_id = setup
    place_market_order(db, market, user_id, "WEMBY", "short", 50)
    move_price(market, "WEMBY", 0.75)  # "ruled out for the season"

    v = assert_pnl_adds_up(db, market, user_id)
    [pos] = v.positions
    assert pos.is_short and pos.unrealised_cents > 0

    covered = place_market_order(db, market, user_id, "WEMBY", "cover", 50)
    assert covered.position_qty_after == 0 and position(db, user_id, "WEMBY") is None
    v = assert_pnl_adds_up(db, market, user_id)
    assert v.positions == [] and v.realised_cents > 0
    assert v.total_pnl_cents == v.realised_cents - v.fees_cents > 0
    assert cash(db, user_id) > START


def test_a_shorts_loss_keeps_growing_while_the_price_rises(setup):
    """The ticket's 'done when', part 2."""
    db, market, user_id = setup
    place_market_order(db, market, user_id, "SGA", "short", 30)
    qty, basis = position(db, user_id, "SGA")

    losses = []
    for _ in range(5):
        move_price(market, "SGA", 1.15)
        v = assert_pnl_adds_up(db, market, user_id)
        [pos] = v.positions
        last = to_cents(market.last_price("SGA"))
        assert pos.unrealised_cents == basis - 30 * last  # sold for basis, buying back costs 30 x last
        assert pos.market_value_cents == -30 * last
        losses.append(pos.unrealised_cents)
    assert losses == sorted(losses, reverse=True) and losses[-1] < -basis  # lost more than it was sold for

    covered = place_market_order(db, market, user_id, "SGA", "cover", 30)
    v = assert_pnl_adds_up(db, market, user_id)
    assert v.realised_cents < -basis and covered.position_qty_after == 0


def test_partial_cover_releases_its_share_of_the_basis(setup):
    db, market, user_id = setup
    place_market_order(db, market, user_id, "LUKA", "short", 40)
    _, basis = position(db, user_id, "LUKA")
    move_price(market, "LUKA", 0.9)

    covered = place_market_order(db, market, user_id, "LUKA", "cover", 10)
    cost, _ = notional_and_fees(covered)
    assert position(db, user_id, "LUKA") == (-30, basis - round(basis * 10 / 40))
    v = assert_pnl_adds_up(db, market, user_id)
    assert v.realised_cents == round(basis * 10 / 40) - cost > 0


# --- Collateral ------------------------------------------------------------------------

def test_a_short_holds_back_twice_its_value(setup):
    db, market, user_id = setup
    outcome = place_market_order(db, market, user_id, "JOKIC", "short", 10)
    notional, fees = notional_and_fees(outcome)
    last = to_cents(market.last_price("JOKIC"))
    assert short_collateral(db, market, user_id) == 2 * 10 * last
    # Free cash fell by about the short's value (+ fee): like spending it on a buy.
    assert free_cash(db, market, user_id) == START + notional - fees - 2 * 10 * last

    move_price(market, "JOKIC", 1.5)  # the hold-back follows the price
    assert short_collateral(db, market, user_id) == 2 * 10 * to_cents(market.last_price("JOKIC"))


def test_cannot_short_more_than_your_free_cash_backs(setup):
    db, market, user_id = setup
    set_cash(db, user_id, 100_000)  # 1,000 HOOP backs about 6 SGA (~150 each)
    outcome = place_market_order(db, market, user_id, "SGA", "short", 100)
    assert outcome.status == "partially_filled" and outcome.reason == NOT_ENOUGH_COLLATERAL
    assert 0 < outcome.filled_qty <= 6
    assert free_cash(db, market, user_id) >= 0

    set_cash(db, user_id, 5_000)
    with pytest.raises(OrderError) as error:
        place_market_order(db, market, user_id, "TATUM", "short", 1)
    assert (error.value.status_code, error.value.message) == (400, NOT_ENOUGH_COLLATERAL)


def test_no_leverage_yet_gross_exposure_stays_within_equity(setup):
    db, market, user_id = setup
    place_market_order(db, market, user_id, "SGA", "buy", 300)       # ~45,000 long
    place_market_order(db, market, user_id, "JOKIC", "short", 1000)  # stops when free cash runs out
    v = build_portfolio(db, market, user_id)
    gross = sum(abs(p.market_value_cents) for p in v.positions)
    assert gross <= v.equity_cents
    assert free_cash(db, market, user_id) >= 0


def test_short_collateral_blocks_buys_with_that_cash(setup):
    db, market, user_id = setup
    set_cash(db, user_id, 500_000)
    place_market_order(db, market, user_id, "SGA", "short", 100)  # stops once the 5,000 HOOP is used up
    assert cash(db, user_id) > 900_000  # the cash is there (proceeds) but it's all held back
    with pytest.raises(OrderError) as error:
        place_market_order(db, market, user_id, "JOKIC", "buy", 1)
    assert error.value.message == "not enough cash"


def test_you_can_always_cover_even_when_the_price_has_run_away(setup):
    db, market, user_id = setup
    set_cash(db, user_id, 500_000)
    shorted = place_market_order(db, market, user_id, "CADE", "short", 100).filled_qty  # as much as allowed
    move_price(market, "CADE", 1.6)
    assert free_cash(db, market, user_id) < 0  # under-collateralised (P2-15 will margin-call this)

    covered = place_market_order(db, market, user_id, "CADE", "cover", shorted)
    assert covered.status == "filled" and position(db, user_id, "CADE") is None
    assert cash(db, user_id) >= 0
    assert build_portfolio(db, market, user_id).realised_cents < 0  # (set_cash skews total_pnl, so not checked)


# --- Long and short don't mix ------------------------------------------------------------

@pytest.mark.parametrize("first, then, message", [
    (("buy", 5), ("short", 1), "you hold 5 SGA: sell them before shorting"),
    (("short", 5), ("buy", 1), "you're short 5 SGA: use cover to buy them back"),
    (("short", 5), ("sell", 1), "you're short 5 SGA: there's nothing to sell"),
    (("short", 5), ("cover", 6), "you're short 5 SGA, so you can't cover 6"),
    (None, ("cover", 1), "you're short 0 SGA, so you can't cover 1"),
])
def test_wrong_side_for_your_position_is_refused(setup, first, then, message):
    db, market, user_id = setup
    if first:
        place_market_order(db, market, user_id, "SGA", *first)
    trades_before = db.conn.execute("SELECT count(*) FROM trades").fetchone()[0]
    with pytest.raises(OrderError) as error:
        place_market_order(db, market, user_id, "SGA", *then)
    assert error.value.status_code == 400 and message in error.value.message
    assert db.conn.execute("SELECT count(*) FROM trades").fetchone()[0] == trades_before


def test_open_orders_respect_a_short(setup):
    db, market, user_id = setup
    place_market_order(db, market, user_id, "SGA", "short", 5)
    last = to_cents(market.last_price("SGA"))
    for side, kind, price in (("buy", "limit", last - 500), ("sell", "limit", last + 500), ("sell", "stop", last - 500)):
        with pytest.raises(OrderError) as error:
            create_open_order(db, market, user_id, symbol="SGA", side=side, order_type=kind, qty=1, price_cents=price)
        assert "you're short 5 SGA" in error.value.message


def test_buy_limits_cannot_reserve_short_collateral(setup):
    db, market, user_id = setup
    set_cash(db, user_id, 500_000)
    place_market_order(db, market, user_id, "SGA", "short", 30)
    with pytest.raises(OrderError, match="not enough cash"):
        create_open_order(db, market, user_id, symbol="JOKIC", side="buy", order_type="limit", qty=10,
                          price_cents=to_cents(market.quote("JOKIC").ask))


# --- Profit/loss stays exact ----------------------------------------------------------------

def test_pnl_identity_holds_after_random_long_and_short_trading(setup):
    db, market, user_id = setup
    rng = random.Random(14)
    symbols = ["SGA", "LUKA", "TATUM", "FOX"]
    held = dict.fromkeys(symbols, 0)
    for _ in range(60):
        symbol = rng.choice(symbols)
        q = held[symbol]
        if q > 0:
            side, qty = rng.choice([("sell", rng.randint(1, q)), ("buy", rng.randint(1, 15))])
        elif q < 0:
            side, qty = rng.choice([("cover", rng.randint(1, -q)), ("short", rng.randint(1, 15))])
        else:
            side, qty = rng.choice(["buy", "short"]), rng.randint(1, 15)
        outcome = place_market_order(db, market, user_id, symbol, side, qty)
        held[symbol] += outcome.filled_qty * (1 if side in ("buy", "cover") else -1)
        assert outcome.position_qty_after == held[symbol]
        market.step()
        if rng.random() < 0.2:
            move_price(market, symbol, rng.choice([0.85, 1.15]))

        v = assert_pnl_adds_up(db, market, user_id)
        assert {p.symbol: p.qty for p in v.positions} == {s: q for s, q in held.items() if q}
    sides = {r[0] for r in db.conn.execute("SELECT DISTINCT side FROM trades")}
    assert sides == {"buy", "sell", "short", "cover"}  # every kind of trade was exercised


def test_shorts_pay_performance_payouts(setup):
    db, market, user_id = setup
    place_market_order(db, market, user_id, "SGA", "short", 20)
    before = cash(db, user_id)
    [paid] = apply_payout(db, PerformancePayout(market.market_time(), "SGA", 0.6, 30.0, "SGA: 30 Game Score"))
    assert (paid.qty_held, paid.amount_cents) == (-20, -1200)
    assert cash(db, user_id) == before - 1200
    v = assert_pnl_adds_up(db, market, user_id)
    assert v.payouts_cents == -1200


# --- Estimate before you confirm ---------------------------------------------------------------

def test_short_estimate_matches_the_real_short(setup):
    db, market, user_id = setup
    e = estimate_order(db, market, user_id, "TATUM", "short", 120)
    assert e.method == "engine preview" and e.best_price_cents == to_cents(market.quote("TATUM").bid)
    assert e.ok and e.total_cents == e.notional_cents - e.fee_cents
    assert any("no limit to how high" in w for w in e.warnings)

    outcome = place_market_order(db, market, user_id, "TATUM", "short", 120)
    notional, fees = notional_and_fees(outcome)
    assert (notional, fees) == (e.notional_cents, e.fee_cents)
    assert outcome.slippage_cents == pytest.approx(e.slippage_cents)


def test_cover_and_wrong_side_estimates(setup):
    db, market, user_id = setup
    place_market_order(db, market, user_id, "SGA", "short", 10)
    cover = estimate_order(db, market, user_id, "SGA", "cover", 10)
    assert cover.ok and cover.best_price_cents == to_cents(market.quote("SGA").ask)
    assert cover.total_cents == cover.notional_cents + cover.fee_cents

    too_many = estimate_order(db, market, user_id, "SGA", "cover", 15)
    assert not too_many.ok and any("cover at most" in w for w in too_many.warnings)
    buy = estimate_order(db, market, user_id, "SGA", "buy", 1)
    assert not buy.ok and any("use cover" in w for w in buy.warnings)


# --- Missions (Person 4) ---------------------------------------------------------------------

def test_missions_can_start_with_a_short_and_restore_after(setup):
    db, market, user_id = setup
    adapter = TradesAdapter(db, lambda: market)
    place_market_order(db, market, user_id, "SGA", "buy", 10)
    real = build_portfolio(db, market, user_id)

    adapter.apply_start_state(user_id, 20_000.0, [SimpleNamespace(symbol="WEMBY", qty=-40, avg_cost=105.0)])
    assert position(db, user_id, "WEMBY") == (-40, 420_000)
    p = adapter.portfolio(user_id)
    assert [(x.symbol, x.qty, x.avg_cost) for x in p.positions] == [("WEMBY", -40.0, 105.0)]
    v = build_portfolio(db, market, user_id)
    assert v.starting_cash_cents == 2_000_000 - 420_000  # equity at the start, marking WEMBY at 105

    move_price(market, "WEMBY", 0.7)
    place_market_order(db, market, user_id, "WEMBY", "cover", 40)
    v = assert_pnl_adds_up(db, market, user_id)
    assert v.realised_cents > 0
    assert [t.side for t in adapter.trades_for_user(user_id)][-1] == "cover"

    assert adapter.restore_start_state(user_id)
    back = build_portfolio(db, market, user_id)
    assert (back.cash_cents, [(p.symbol, p.qty) for p in back.positions]) == (
        real.cash_cents, [(p.symbol, p.qty) for p in real.positions])


# --- Over the API -------------------------------------------------------------------------------

@pytest.fixture
def player(client):
    session = client.post("/trading/session").json()
    return auth(session["token"]), session["user_id"]


def order(client, headers, symbol, side, qty):
    return client.post("/trading/orders", headers=headers, json={"symbol": symbol, "side": side, "qty": qty})


def test_short_and_cover_over_the_api(client, player, fake_sender):
    headers, user_id = player
    shorted = order(client, headers, "SGA", "short", 12)
    assert shorted.status_code == 200, shorted.json()
    body = shorted.json()
    assert (body["side"], body["filled_qty"], body["position_qty"]) == ("short", 12, -12)
    assert body["cash"] > 100_000

    p = client.get("/trading/portfolio", headers=headers).json()
    [pos] = p["positions"]
    assert (pos["side"], pos["qty"]) == ("short", -12)
    assert pos["market_value"] == pytest.approx(-12 * pos["last_price"], abs=0.01)
    assert pos["avg_cost"] == pytest.approx(body["average_price"], abs=1e-4)
    assert p["short_collateral"] == pytest.approx(2 * 12 * pos["last_price"], abs=0.01)
    assert p["available_cash"] == pytest.approx(p["cash"] - p["short_collateral"], abs=0.01)
    assert round(p["total_pnl"] * 100) == (round(p["realised_pnl"] * 100) + round(p["unrealised_pnl"] * 100)
                                           - round(p["fees_paid"] * 100) + round(p["payouts_received"] * 100))

    estimate = client.post("/trading/orders/quote", headers=headers,
                           json={"symbol": "SGA", "side": "cover", "qty": 12}).json()
    assert estimate["position_qty"] == -12 and estimate["can_afford_qty"] >= 12 and estimate["ok"]

    covered = order(client, headers, "SGA", "cover", 12).json()
    assert (covered["side"], covered["position_qty"]) == ("cover", 0)
    trades = client.get("/trading/trades", headers=headers).json()
    assert [t["side"] for t in trades] == ["short"] * len(body["fills"]) + ["cover"] * len(covered["fills"])
    assert client.get("/trading/portfolio", headers=headers).json()["positions"] == []

    # The Solana receipt says what kind of trade it was.
    for _ in range(100):
        sides = {json.loads(m)["side"] for m, _ in fake_sender.sent_trades}
        if sides == {"short", "cover"}:
            break
        time.sleep(0.05)
    assert sides == {"short", "cover"}


@pytest.mark.parametrize("first, then, status", [
    (("buy", 3), ("short", 1), 400),
    (("short", 3), ("buy", 1), 400),
    (None, ("cover", 1), 400),
])
def test_wrong_side_is_400_over_the_api(client, player, first, then, status):
    headers, _ = player
    if first:
        assert order(client, headers, "JOKIC", *first).status_code == 200
    response = order(client, headers, "JOKIC", *then)
    assert response.status_code == status and response.json()["detail"]
