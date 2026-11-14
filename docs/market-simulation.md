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

The weighted expected Game Score receives an age factor of
`clamp(1 + 0.008 × (27 − age), 0.88, 1.08)`. Finally,
`opening price = max(10, 5 × max(2, age-adjusted expected Game Score))` HOOP.
Age has a deliberately small effect: similar prior performance produces
similar prices. Five HOOP per expected Game Score point and the 10-HOOP floor
are game parameters, not a real-world financial valuation. The output table
shows each player's age, per-season games and averages, projected Game Score,
age factor, confidence and opening price in decreasing order.

The [SportsDataverse ESPN player box-score releases](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_player_boxscores)
provide the regular-season game logs. The
[ESPN roster release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_rosters)
and ESPN athlete API provide dates of birth. All downloaded source files stay
under the ignored `data/source` directory.

## Daily market

The replay spans **22 October 2024 through 13 April 2025**, including days
without games: 174 calendar dates, 580 player markets. Three finite-inventory
market makers quote a bid and ask for each player. Twenty finite-cash bots
share accounts across all markets and trade using value, momentum, casual,
risk-averse, injury-news and contrarian strategies. The displayed market price
is the last executed trade; basketball results never overwrite it directly.

Each day incorporates the latest published official injury status, then bot
trades, the reveal of real box scores, more trades and a saved close. Played
games move projected Game Score 4% toward the result. Rest days and DNPs are
not zero-score games. The [SportsDataverse NBA injury-report archive](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nba_stats_injury_report)
contains historical versions of official NBA reports. The importer keeps the
last version on each report date for each player and regular-season game. It
retains Injury/Illness and Concussion Protocol entries: 16,952 daily listings,
16,392 matched to the 580 market players. Five reported players have no market
because they are absent from the imported player-game universe. The full CSV
keeps their reports. This is a list of reported statuses, not every injury.

Status and reason are historical data. The impact classification and valuation
factors are game assumptions, not medical severity ratings. An Out status sets
a target factor of 0.90, 0.82 or 0.70 for minor, moderate or severe keyword
classes. Other statuses have smaller discounts; Available restores 1.00. A
played box score clears a stale discount. Each report replaces the current
factor instead of multiplying it, so repeated Out reports do not compound.
Bots trade on the changed valuation and makers quote around it; the market
price changes only through executed trades. Use `--no-injuries` for a
box-score-only comparison.

The simulation checks that each trade conserves cash and shares and prevents
negative balances. Daily prices, volume, trade count, executed-trade OHLC,
estimated fair value and best remaining quotes are recorded in the generated
CSV. The graph replays those completed daily records at 0.4–4 seconds per day;
it is not a live trading service.

These are player markets with shared bot accounts, not a persistent limit-order book. Human
orders, portfolios, fees, on-chain receipts, dividends and shorting are not
implemented in this prototype.
