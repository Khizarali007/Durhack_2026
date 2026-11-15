"""Development holdout: predict 2023–24 mean Game Score from 2019–23 data.

Measures pre-age opening score estimates, not stock prices or trading returns.
Only cached historical source files are read; no replay-season outcomes train
these estimates. This single holdout is a tuning check, not proof of calibration.
"""
import argparse
import csv
import json
import statistics as stats
from collections import defaultdict
from pathlib import Path
from build_starting_values import opening_expectation, equal_player_prior, SEASON_WEIGHTS, LEGACY_WEIGHTS
from import_player_box import game_score


def check(source):
    scores = defaultdict(lambda: defaultdict(list))
    for year in range(2020, 2025):
        with (source / f'player_box_{year}.csv').open() as file:
            for row in csv.DictReader(file):
                if row['season_type'] != '2' or row['did_not_play'].lower() == 'true':
                    continue
                if not row['team_id'].isdigit() or not 1 <= int(row['team_id']) <= 30:
                    continue
                value = game_score(row)
                if value is not None:
                    scores[int(row['athlete_id'])][year].append(max(0, value))
    league = stats.mean(x for seasons in scores.values() for y, games in seasons.items() if y < 2024 for x in games)
    rookies = stats.mean(stats.mean(s[min(s)]) for s in scores.values() if min(s) in (2022, 2023))
    equal = equal_player_prior(scores, 2023)
    results = {}
    for model, weights, shrink, rookie in [('legacy', LEGACY_WEIGHTS, league, league), ('balanced', SEASON_WEIGHTS, equal, rookies)]:
        # Move weights back one year; 2019 is unavailable and receives no weight.
        prior_weights = {y - 1: w for y, w in weights.items() if y - 1 >= 2020}
        errors, low_history = [], []
        for seasons in scores.values():
            if len(seasons.get(2024, [])) < 10:
                continue
            prediction = opening_expectation(seasons, prior_weights, shrink, rookie)
            error = prediction - stats.mean(seasons[2024])
            errors.append(error)
            if sum(len(seasons.get(y, [])) for y in prior_weights) < 20:
                low_history.append(error)
        results[model] = {'players': len(errors), 'mean_absolute_error': round(stats.mean(map(abs, errors)), 3),
                          'mean_error': round(stats.mean(errors), 3), 'overpredicted_pct': round(100 * sum(x > 0 for x in errors) / len(errors), 1),
                          'limited_history_players': len(low_history), 'limited_history_mean_error': round(stats.mean(low_history), 3)}
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=Path('data/source'))
    args = parser.parse_args()
    print(json.dumps(check(args.source_dir), indent=2))
