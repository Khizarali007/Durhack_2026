# 2024–25 season market replay

From the repository root:

```bash
python3 -m pip install requests
python3 scripts/import_player_box.py
python3 scripts/build_starting_values.py
python3 scripts/import_injury_reports.py
python3 scripts/simulate_market.py --player Wembanyama
python3 scripts/market_graph.py
```

Open `http://127.0.0.1:8765` for the multi-player graph and
`http://127.0.0.1:8765/values` for the complete ranked opening-value table,
and `http://127.0.0.1:8765/injuries` for the report browser and CSV download.
The CSV files are `data/starting_values_2024_25.csv` and
`data/market_daily_prices.csv`. The importer, valuation script and simulator
must run in that order. Re-run them and restart the graph server to change the
model, data or seed. The same seed gives the same market replay.

## Opening valuation

The opening is **22 October 2024**, before the first regular-season game.
Only 2019–20 through 2023–24 NBA regular-season box scores and player dates
of birth enter the opening calculation. The five seasons have weights 5%, 10%,
15%, 25% and 45%, respectively. Missing seasons are skipped and their weights
are renormalized. Each season's average Game Score is blended with 10 games at
the five-season league average, so a tiny sample cannot set an extreme price.
Players with no prior NBA games receive the league average and a low-confidence
label. This intentionally makes rookies hard to distinguish without college,
draft or scouting data.

Season averages now use nonnegative Game Score, matching the payout rule.
The weighted estimate retains the age factor
`clamp(1 + 0.008 × (27 − age), 0.88, 1.08)`. Opening prices now equal discounted
expected future payouts, including availability and career-risk assumptions.
The old five-dollar multiplier and ten-dollar floor are removed. See the
[current dividend model](dividend-model.md) for all equations and assumptions.

The [SportsDataverse ESPN player box-score releases](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_player_boxscores)
provide the regular-season game logs. The
[ESPN roster release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_rosters)
and ESPN athlete API provide dates of birth. All downloaded source files stay
under the ignored `data/source` directory.

## Daily market

The replay spans **22 October 2024 through 13 April 2025**, including days
without games: 174 calendar dates, 580 player markets. Three finite-inventory
market makers quote a bid and ask for each player. Thirty finite-cash bots
share accounts across all markets and trade using value, momentum,
risk-averse, injury-news and contrarian strategies. The displayed market price
is the last executed trade; basketball results never overwrite it directly.

Each day allows bot trading, snapshots payout ownership at synthetic noon,
then reveals final daily injury reports and box scores at day close. Actual
performance payouts credit the snapshot owners. Ability and form update with
the 3%/20% rules, with the form contribution fading into future expectations.
Rest days and DNPs are not zero-score games. See the [current model](dividend-model.md).
The [SportsDataverse NBA injury-report archive](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nba_stats_injury_report)
contains historical versions of official NBA reports. The importer keeps the
last version on each report date for each player and regular-season game. It
retains Injury/Illness and Concussion Protocol entries: 16,952 daily listings,
16,392 matched to the 580 market players. Five reported players have no market
because they are absent from the imported player-game universe. The full CSV
keeps their reports. This is a list of reported statuses, not every injury.

Status and reason are historical data. Impact classifications are game assumptions,
not medical severity ratings. They now determine the recovery timescale in expected
availability. Legacy target-factor columns remain in the imported CSV for traceability
but are not multiplied into prices. Bots and makers price expected future dividends;
actual trade prices move only on fills. Use `--no-injuries` for comparison.

The generated replay includes daily and cumulative dividends per share. The
all-player graph table ranks price returns only (as labelled), excluding dividends.
Bot performance includes received dividends and a dividend-inclusive holding benchmark.
