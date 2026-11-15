"""Audit formula outcomes, without bot trades, for a candidate opening-values CSV.

Replay results are evaluation data only. This command never modifies opening
estimates or searches for a coefficient that forces a target win rate.
"""
import argparse
import json
import statistics
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from market.engine import LiveMarket


def audit(values):
    market = LiveMarket(values=values)
    opening = {p.player_id: p.start_price for p in market.players()}
    while market.day.timestamp() < market.end.timestamp():
        market._close_day()
    rows = [{'prior': m.prior_games, 'games': m.games_observed,
             'price_return': m.fair_cents / 100 / opening[pid] - 1,
             'total_return': (m.fair_cents / 100 + m.cumulative_payout) / opening[pid] - 1}
            for pid, m in market.markets.items()]
    result = {'method': 'Formula-only replay; total return includes cash payouts, excludes spread and fees. Not an executable trading backtest.', 'cohorts': {}}
    for name, group in [('all', rows), ('no_history', [r for r in rows if not r['prior']]),
                        ('history', [r for r in rows if r['prior']]),
                        ('at_least_40_games', [r for r in rows if r['games'] >= 40])]:
        result['cohorts'][name] = {'players': len(group), 'price_gainers': sum(r['price_return'] > 0 for r in group),
                                  'total_return_gainers': sum(r['total_return'] > 0 for r in group),
                                  'median_price_return_pct': round(100 * statistics.median(r['price_return'] for r in group), 3),
                                  'median_total_return_pct': round(100 * statistics.median(r['total_return'] for r in group), 3)}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--values', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(audit(args.values), indent=2))
