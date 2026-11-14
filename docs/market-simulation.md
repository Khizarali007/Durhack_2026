# 2024–25 season market replay

From the repository root:

```bash
python3 -m pip install requests
python3 scripts/import_player_box.py
python3 scripts/build_starting_values.py
python3 scripts/simulate_market.py --player Wembanyama
python3 scripts/market_graph.py
```

Open `http://127.0.0.1:8765` for the multi-player graph and
`http://127.0.0.1:8765/values` for the complete ranked opening-value table.
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
trade using value, momentum and casual strategies. The displayed market price
is the last executed trade; basketball results never overwrite it directly.

Each day has bot trades, a reveal of that day's real box scores and any dated
news event, more bot trades, then a saved daily close. A played game moves the
projected Game Score 4% toward that game's score. A rest day or DNP is not
treated as a zero. The included 20 February Wembanyama season-ending event is
[historical news](https://www.nba.com/news/nightly-pulse-nba-news-highlights-from-feb-20),
but its 0.90 value multiplier is an explicit simulation assumption. It
represents a moderate expected-value haircut rather than erasing the player's
underlying ability. There is no general injury-news feed yet.

The simulation checks that each trade conserves cash and shares and prevents
negative balances. Daily prices, volume, trade count, executed-trade OHLC,
estimated fair value and best remaining quotes are recorded in the generated
CSV. The graph replays those completed daily records at 0.4–4 seconds per day;
it is not a live trading service.

These are independent player markets, not a persistent limit-order book. Human
orders, portfolios, fees, on-chain receipts, dividends and shorting are not
implemented in this prototype.
