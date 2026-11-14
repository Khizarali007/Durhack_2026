# Bot market prototype

Run from the repository root after generating the local box-score database:

```bash
python3 scripts/import_player_box.py
python3 scripts/simulate_market.py --player Wembanyama --player Doncic
python3 scripts/market_graph.py
```

Open `http://127.0.0.1:8765` to watch an animated replay of the generated
daily prices. Search for any player, change playback speed, or drag the date
slider. Re-run the simulator and restart the graph server to load a new seed.

The simulation prints the selected players' daily closing prices and writes
`data/market_daily_prices.csv` for every player and replay date. The same seed
produces the same result. Use `--seed 123`, `--rounds 2`, or repeated `--player`
options to explore other runs. `--no-events` runs using box scores alone.

The prototype has no human orders. Each player has an independent market with
three market makers and 20 bots. Every bot and maker has finite HOOP cash and
shares. The simulation checks that trades conserve cash and shares and that
balances never become negative.

## Pricing rules

1. **Initial estimate:** For each player, average their Game Scores from the
   history period, blended with three games at the league average to reduce
   one-game outliers. Players with no history use the league average.
2. **Reference value:** Five HOOP per estimated Game Score point, with a
   10-HOOP floor. This is a game parameter, not a guaranteed share payout.
3. **New performance:** A revealed game moves the estimated Game Score 20%
   toward that game's score. A rest day or DNP is not scored as zero.
4. **Maker quotes:** Three makers post different bid/ask spreads around their
   reference values. Each maker raises quotes when its share inventory is low
   and lowers them when inventory is high.
5. **Bot orders:** Value, momentum and casual bots have different estimates.
   They may buy at the cheapest ask or sell at the highest bid.
6. **Market price:** Only a completed trade changes the last-traded price.
   Each daily CSV row reports that close, traded volume, number of trades,
   executed-trade OHLC, reference value and best remaining quotes. A day with
   no trades carries its previous close and has zero volume.

The daily order is: pre-result bot trades, reveal real box scores and any dated
news event, post-result bot trades, then record the close. Future box scores do
not affect the opening estimate or earlier days.

The included 20 February Wembanyama event is [historical news](https://www.nba.com/news/nightly-pulse-nba-news-highlights-from-feb-20).
Its `value_factor` of 0.65 is an explicit **simulation assumption** about bot
expectations, not an observed stock-price move. The news changes the bots' and
makers' reference values; the displayed price changes when a trade executes.

## Scope

These are 549 independent simulated player markets. The maker quotes are
immediate offers, not a persistent limit-order book. There are no user wallets,
dividends, fees, short positions or Solana transactions in this prototype.
Those features need a separate shared account and order layer. The CSV is
generated market data, while the box scores are historical source data.
