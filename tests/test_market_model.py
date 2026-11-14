"""Checks for the market model's economic invariants and new-information updates."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from simulate_market import make_markets  # noqa: E402


def one_market():
    players = {1: {"name": "Test Player", "team": "TST", "starting_price": 100.0}}
    return make_markets(players, 42)[1]


class MarketModelTests(unittest.TestCase):
    def test_one_outlier_does_not_erase_prior_quality(self):
        market = one_market()
        market.reveal([100.0])
        self.assertEqual(market.games_observed, 1)
        self.assertGreater(market.mean_score, market.prior_score)
        self.assertLess(market.mean_score, market.prior_score + 1)
        self.assertLess(market.fair_cents, 10500)

    def test_repeated_report_is_not_compounded_and_recovery_restores_value(self):
        market = one_market()
        report = {"status": "Out", "reason": "Injury/Illness - Fracture",
                  "impact_level": "severe", "availability_probability": ".14",
                  "target_factor": ".699"}
        self.assertTrue(market.set_injury(report))
        first = market.fair_cents
        self.assertFalse(market.set_injury(report))
        self.assertEqual(market.fair_cents, first)
        market.set_injury({**report, "status": "Available",
                           "availability_probability": "1.0", "target_factor": "1.0"})
        self.assertEqual(market.fair_cents, 10000)

    def test_maker_inventory_changes_quote_and_trades_conserve_shares(self):
        market = one_market()
        bot = market.bots[0]
        before = market.best_quote("buy")[0]
        market.trade(bot, "buy", 100)
        self.assertGreater(market.best_quote("buy")[0], before)
        market.check_ledger()

    def test_competing_dealers_do_not_offer_crossed_quotes(self):
        market = one_market()
        market.makers[0].shares = 1
        market.makers[1].shares = 3000
        self.assertLess(market.best_quote("sell")[0], market.best_quote("buy")[0])

    def test_limited_history_learns_faster_and_rest_day_is_not_zero(self):
        veteran = one_market()
        rookie = one_market()
        rookie.prior_strength = 6
        veteran.reveal([30])
        rookie.reveal([30])
        self.assertGreater(rookie.mean_score, veteran.mean_score)
        before = rookie.mean_score
        rookie.reveal([])
        self.assertEqual(rookie.mean_score, before)


if __name__ == "__main__":
    unittest.main()
