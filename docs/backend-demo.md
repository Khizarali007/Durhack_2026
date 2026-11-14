# Minimal market demo

Open http://127.0.0.1:8000/demo/ . The page uses the original replay graph styling,
with the live backend and a compact buy/sell box. No frontend build is needed.

```sh
SOLANA_RECEIPTS=off MARKET_DAY_SECONDS=60 .venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Search a player, compare up to four, and switch between dollars and percentage
change since opening. Solid lines are executed trade prices; the dashed line is
the main player's formula value. Ability, form and expected next payout appear
below the chart. Prices may remain flat until a trade executes.

Click **Start with $100,000**, enter a whole number of shares, then **Buy** or
**Sell**. The result shows executed quantity, average price and fees. Cash,
portfolio equity, selected-player holdings, paid dividends and pending rights
refresh automatically. Buy/sell actions use actual market orders against the
local simulation, not frontend-generated balances.

Chart history contains the latest 600 observations collected while the page is
open; reload clears it. The backend advances independently, currently one day per
60 real seconds. Noon records payout rights; day close settles them. Restarting
the backend resets the session and accounts. All money is virtual.

The previous detailed tabs were removed at the user's request. Limit/stop orders,
leaderboard, bot audit and other backend features remain available through `/docs`.
The separate offline full-season graph on port 8765 is unchanged.

Files: `web/demo/index.html`, `web/demo/style.css`, `web/demo/app.js`.
Verified the simplified page in-browser: guest creation, buy ten/sell two shares,
holdings and cash updates, player switching, percentage scale and formula overlay.
Backend code was unchanged by the simplification; its previous regression run
passed 340 tests with three optional devnet tests skipped.
