# Backend demo

A small browser client for the integrated backend. All actions use the actual
local API, market and ledger; the frontend has no fake prices or account balances.

## Run

From the repository root, after the data/dependency setup in
[backend-integration.md](backend-integration.md):

```sh
SOLANA_RECEIPTS=off MARKET_DAY_SECONDS=60 .venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/demo/ . No npm installation or frontend build is needed.
`web/demo/index.html`, `app.js` and `style.css` are served by FastAPI under `/demo`.
This does not replace the team's final frontend or occupy its root URL.

## Quick walkthrough

1. Start a guest with $100,000, or sign up/log in using a temporary demo account.
2. Search any of the 580 players. Compare up to four players using the dropdown.
   Preview a buy of ten shares, then place it. Inspect maker quotes and fees.
3. Open Portfolio & orders to see quote-marked holdings and equity history.
4. Place a buy limit below the current ask. Check reserved cash, then cancel it.
   You can also place sell limits and stop-loss orders against held shares.
5. Hold through noon UTC. Payouts shows the recorded rights and estimated amount.
   At day close the actual positive Game Score determines cash credited. An off
   day pays zero. Sell after cutoff to verify that the rights stay with you.
6. Check trade history, bot bundle executions and local leaderboard position.
   Model & system shows coefficients, settlement health and runtime Solana status.

At 60 real seconds/day, noon and settlement occur 30 seconds apart. Games need
not occur every day; choose a player and hold for several replay days to see cash
payouts. Backend restart is the way to begin another full season and resets all
accounts, including registered accounts. There is no UI reset that silently
changes other users' portfolios.

## Scope and limits

- Market/limit buy and sell, stop-loss sell, fees, partial fills, reservations,
  cancellation, holdings, equity/drawdown, cash payments and detached rights.
- Live quotes over WebSocket; account views refresh every three real seconds.
  Reconnection falls back to quote polling. Sessions are kept per browser tab.
- All-player search, opening-price returns, valuation/ability/form/injury details,
  finite maker quotes, bot bundles, live events and leaderboard source selection.
- Solana connectivity and portfolio status are available for inspection; this UI
  does not enable chain writes or send transactions itself. Disabled receipts
  display as disabled rather than indefinitely pending. Shorts/leverage remain off.
- Chart stores the latest 600 observations per player in this page, rebased to
  the first retained observation. Reload clears chart history. Portfolio history
  uses the latest 600 backend observations; payouts/trades show latest 100,
  bot bundles latest 20. All-player price returns exclude dividends.
- Optional full-season offline graph runs separately with `scripts/market_graph.py`
  on port 8765. It is not the live human market.
- Mission/learning flows are not part of the integrated backend and are not shown.
- Prototype, localhost only; all balances are virtual and session-local.

## Verification

Browser checks covered guest creation, signup/login/logout, reload persistence, search, two-player
comparison, order preview, market buy and sell, limit reservation/cancellation,
stop-loss placement/cancellation, holdings, equity history, leaderboard, bot
bundle inspection, and pending-to-paid dividend display. Eight WEMBY shares
received $1.10 for a Game Score of 6.9 (8 × $0.138, rounded at holder level).
Backend restart was also checked: the page clears the expired account, reconnects
to live quotes and offers a fresh guest session. No browser errors were reported
during the functional checks before that deliberate restart. Optional devnet transactions
were not exercised.

Regression suite: 340 passed, three optional devnet tests skipped. Added coverage
for static demo routing and disabled receipt status in trade history.
