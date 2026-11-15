"""Each review rule fires on a small synthetic season, with the right H$ impact and lesson link."""

import pytest

from learning.insights import DAY, Alert, Fill, Payment, SeasonData, group_orders, review

T0 = 1730419200.0  # 1 Nov 2024 00:00 UTC
NAMES = {"WEMBY": "Victor Wembanyama", "SGA": "Shai Gilgeous-Alexander", "JOKIC": "Nikola Jokic"}
TEAMS = {"WEMBY": "SAS", "SGA": "OKC", "JOKIC": "DEN"}


def fill(oid, symbol, side, qty, price, t, fee=0.0, quoted=None):
    return Fill(oid, symbol, side, qty, price, fee, t, quoted)


def season(fills, daily=None, alerts=(), payments=(), cash=100_000.0, prices=None, game=None, equity=(),
           now=T0 + 30 * DAY):
    daily = daily or {}
    return SeasonData(
        name="You", starting_cash=100_000.0, cash=cash, now=now, fills=list(fills), payments=list(payments),
        equity=list(equity), alerts=list(alerts), names=NAMES, teams=TEAMS, prices=prices or {},
        daily=lambda s: daily.get(s, []), game_payout=game or (lambda s, d: None))


def ids(r):
    return [i.id for i in r.insights]


def test_fills_group_into_orders_with_average_price_and_realised_pnl():
    orders = group_orders([
        fill("o1", "SGA", "buy", 1, 100, T0, fee=0.1), fill("o1", "SGA", "buy", 1, 102, T0, fee=0.1),
        fill("o2", "SGA", "sell", 2, 110, T0 + DAY, fee=0.2),
    ])
    assert [(o.side, o.qty, o.avg_price) for o in orders] == [("buy", 2, 101), ("sell", 2, 110)]
    assert orders[1].realised == pytest.approx(220 - 0.2 - 202.2)


def test_concentration_names_the_player_and_prices_a_20pct_shock():
    r = review(season([fill("o1", "WEMBY", "buy", 100, 120, T0)], prices={"WEMBY": 120}, cash=88_000))
    card = r.insights[0]
    assert card.id == "concentration" and card.tone == "warning"
    assert card.impact == pytest.approx(-0.2 * 12_000)
    assert "Victor Wembanyama" in card.what and card.learn.id == "diversification"


def test_buying_under_a_storm_warning_is_flagged_with_the_drop_that_followed():
    alert = Alert("WEMBY", "early_warning", T0 + 3 * DAY, "Early warning: Victor Wembanyama listed doubtful for 3 Nov on the official injury report")
    daily = {"WEMBY": [(T0 + 3 * DAY, 120), (T0 + 4 * DAY, 108), (T0 + 5 * DAY, 110)]}
    r = review(season([fill("o1", "WEMBY", "buy", 10, 120, T0 + 2 * DAY + 3600)], daily, [alert], prices={"WEMBY": 110}))
    card = next(i for i in r.insights if i.id == "bought_into_storm")
    assert card.impact == pytest.approx(-120) and "listed doubtful" in card.what
    assert card.learn.id == "survive-the-storm"


def test_panic_sell_before_a_recovery():
    daily = {"SGA": [(T0 + 3 * DAY, 92), (T0 + 6 * DAY, 99)]}
    r = review(season([fill("b", "SGA", "buy", 10, 100, T0), fill("s", "SGA", "sell", 10, 90, T0 + 2 * DAY)], daily))
    card = next(i for i in r.insights if i.id == "panic_sell")
    assert card.impact == pytest.approx(-90)


def test_selling_before_the_noon_cutoff_on_a_game_day_counts_the_missed_payout():
    sell_t = T0 + 5 * DAY + 3600
    game = lambda s, d: 0.5 if (s, d) == ("JOKIC", "2024-11-06") else None
    r = review(season([fill("b", "JOKIC", "buy", 20, 150, T0), fill("s", "JOKIC", "sell", 20, 150, sell_t)], game=game))
    card = next(i for i in r.insights if i.id == "sold_before_payout")
    assert card.impact == pytest.approx(-10) and card.learn.id == "performance-payouts"


def test_overpaying_through_slippage_and_fees():
    r = review(season([fill("o", "SGA", "buy", 10, 101, T0, fee=5, quoted=100)], prices={"SGA": 101}))
    card = next(i for i in r.insights if i.id == "overpaid")
    assert card.impact == pytest.approx(-15) and card.learn.id == "read-the-spread"


def test_churning_three_losing_round_trips():
    fills = []
    for k in range(3):
        fills += [fill(f"b{k}", "SGA", "buy", 5, 100, T0 + k * DAY, fee=1), fill(f"s{k}", "SGA", "sell", 5, 99, T0 + k * DAY + 600, fee=1)]
    r = review(season(fills))
    card = next(i for i in r.insights if i.id == "churning")
    assert card.impact == pytest.approx(3 * (-5 - 2))


def test_holding_an_out_player_for_five_days():
    alert = Alert("WEMBY", "injury", T0 + 4 * DAY, "Storm: Victor Wembanyama ruled out for 3 Nov on the official injury report")
    daily = {"WEMBY": [(T0 + 4 * DAY, 120), (T0 + 7 * DAY, 105), (T0 + 9 * DAY, 100)]}
    r = review(season([fill("b", "WEMBY", "buy", 10, 120, T0)], daily, [alert], prices={"WEMBY": 100}))
    card = next(i for i in r.insights if i.id == "held_out_player")
    assert card.impact == pytest.approx(-200) and card.learn.id == "stop-loss"


def test_praise_for_spreading_out_buying_before_a_run_and_selling_on_the_warning():
    symbols = ["A", "B", "C", "D", "E", "F", "G", "H"]
    fills = [fill(f"o{s}", s, "buy", 10, 100, T0) for s in symbols]
    prices = {s: 100 for s in symbols}
    teams = {s: f"T{i}" for i, s in enumerate(symbols)}
    data = season(fills, prices=prices)
    data.teams = teams
    assert "diversified" in ids(review(data))

    hot = review(season([fill("b", "SGA", "buy", 10, 100, T0)], {"SGA": [(T0 + 3 * DAY, 112)]}, prices={"SGA": 112}))
    assert "hot_stretch_buy" in ids(hot)

    alert = Alert("WEMBY", "early_warning", T0 + 2 * DAY, "Early warning: Victor Wembanyama listed doubtful for 1 Nov on the official injury report")
    saved = review(season([fill("b", "WEMBY", "buy", 10, 120, T0), fill("s", "WEMBY", "sell", 10, 119, T0 + DAY + 3600)],
                          {"WEMBY": [(T0 + 3 * DAY, 105)]}, [alert]))
    card = next(i for i in saved.insights if i.id == "sold_on_warning")
    assert card.tone == "praise" and card.impact == pytest.approx(140)


def test_timeline_gives_plain_english_context_and_summary_adds_up():
    alert = Alert("WEMBY", "early_warning", T0 + 2 * DAY, "Early warning: Victor Wembanyama listed doubtful for 2 Nov on the official injury report")
    fills = [fill("b", "WEMBY", "buy", 10, 124.18, T0 + 3600, fee=1.2), fill("s", "WEMBY", "sell", 4, 130, T0 + 8 * DAY, fee=0.5)]
    payments = [Payment("WEMBY", 10, 3.0, T0 + DAY), Payment("WEMBY", 6, 2.0, T0 + 3 * DAY)]
    equity = [(T0, 100_000), (T0 + DAY, 100_200), (T0 + 2 * DAY, 99_198), (T0 + 3 * DAY, 100_100)]
    r = review(season(fills, alerts=[alert], payments=payments, prices={"WEMBY": 125}, equity=equity, cash=99_276.0))
    texts = [i.text for i in r.timeline]
    # 124.18 accounting units = H$0.12418, exactly what formatPrice shows in the UI.
    assert "You bought 10 shares of Victor Wembanyama at H$0.12418, the day before Wembanyama was listed doubtful." in texts
    assert any(t.startswith("Victor Wembanyama earned you H$0.003 for the") for t in texts)
    s = r.summary
    assert s.payouts == 5.0 and s.fees == pytest.approx(1.7) and s.trades == 2
    assert s.best_trade.symbol == "WEMBY" and s.max_drawdown_pct == pytest.approx(-1.0)
    assert review(season(fills, alerts=[alert], payments=payments, prices={"WEMBY": 125}, equity=equity)).to_dict() \
        == review(season(fills, alerts=[alert], payments=payments, prices={"WEMBY": 125}, equity=equity)).to_dict()


def test_an_empty_season_says_what_to_do():
    r = review(season([]))
    assert r.insights == [] and r.summary.grade is None and "first players" in r.summary.biggest_lesson


def test_a_rivals_review_talks_about_the_rival_not_you():
    data = season([fill("b", "SGA", "buy", 10, 100, T0)], {"SGA": [(T0 + 3 * DAY, 112)]}, prices={"SGA": 112},
                  payments=[Payment("SGA", 10, 3.0, T0 + DAY)])
    data.subject = "Maya"
    r = review(data)
    texts = [i.text for i in r.timeline]
    assert "Maya bought 10 shares of Shai Gilgeous-Alexander at H$0.10000." in texts
    assert any(t.startswith("Shai Gilgeous-Alexander earned Maya H$0.003") for t in texts)
    hot = next(i for i in r.insights if i.id == "hot_stretch_buy")
    assert hot.what.startswith("Maya bought 10 shares of Shai Gilgeous-Alexander")
    assert not any("You " in t or " you" in t for t in texts)
