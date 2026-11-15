# Combined backend prototype

Working branch: `integration/person1-person2`. Person 2's `person2branch`
(commit bf2d8fd) is merged locally. No push is required to run this prototype.

## Run

From the repository root, with Python 3.11 or newer:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
SOLANA_RECEIPTS=off MARKET_DAY_SECONDS=60 .venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/docs. The existing local NBA data files must be
present: `data/player_games_2024_25.sqlite`, `data/starting_values_2024_25.csv`,
and `data/injury_reports_2024_25.csv`. See `market-simulation.md` for generation.
They are deliberately not committed. Missing files fail startup; the server
never silently substitutes fake prices.

This is one process/one worker. Do not run multiple workers: market state is
in memory and must be shared by all accounts in the session.

## Try a trade

1. `GET /market/status` confirms `LiveMarket`, 580 players and feature flags.
2. `GET /market/players` supplies names, real ESPN IDs, tickers and opening prices.
3. `POST /trading/guest` returns a token and a fresh $100,000 virtual account.
4. In Swagger's Authorize button, paste that token.
5. `GET /market/quote/WEMBY` shows the executable bid/ask and maker inventory.
6. `POST /trading/orders/quote` with `{ "symbol": "WEMBY", "side": "buy", "qty": 10 }` previews the order.
7. Send the same body to `POST /trading/orders` to execute it.
8. Inspect `GET /trading/portfolio` and `GET /trading/trades`.
9. Send `{ "symbol": "WEMBY", "side": "sell", "qty": 10 }` to sell the position.

Buying and immediately selling generally loses the spread and fees. That is
expected. The account and makers use the same fills, in integer cents.
Limit and stop orders remain available through `/trading/orders/open`.
Every limit fill is checked individually; stop orders become market orders.

Live quotes: `ws://127.0.0.1:8000/market/ws?symbols=WEMBY,SGA`.
Account events: `ws://127.0.0.1:8000/trading/ws?token=YOUR_TOKEN`.
REST snapshots: `/market/quotes`; unknown tickers return 404.

## Ownership and implementation

- `backend/market/core.py`: shared pricing, injuries, finite bots and makers.
- `scripts/simulate_market.py`: backwards-compatible offline replay entry point.
- `backend/market/engine.py`: live clock, historical-day reveal, tickers, order
  execution, previews, event subscriptions and conservation checks.
- `backend/market/router.py`: player, quote, status and quote-stream API.
- `backend/trading/market_provider.py`: one shared `LiveMarket` instance.
- Person 2's account ledger continues to own human cash, positions, reservations,
  fees, trade history and order watching. It trusts internal engine execution;
  clients cannot access `submit_order` directly.

Existing popular tickers are retained. Other players get stable `NBA<ESPN_ID>`
tickers; names do not determine identity. All 580 players are available.
Makers initially hold 3,900 shares per player after bots receive 600 shares.
Bot cash and holdings are finite; no automatic inventory replenishment.

Human orders conserve shares across humans, bots and makers. A synchronous
execution checkpoint restores maker state if account settlement fails. This
protects against exceptions and SQLite transaction failures, not process death.
There is no await inside a trade. Live buys are checked one share at a time
for affordability; fees are rounded per fill. The 2% affordability buffer is
conservative, so an order can stop slightly before the exact cash balance is spent.

## Explicit prototype boundaries

- **Restart resets the entire session:** live accounts use an in-memory SQLite
  database alongside the in-memory market. Existing on-disk `trading.sqlite`
  is not opened, deleted or overwritten. Tokens become invalid on restart.
- **Performance payouts are enabled.** They settle through the transactional
  entitlement journal. Shorts and leverage remain disabled.
- **The dividend valuation is now implemented.** See [model details](dividend-model.md)
  for coefficients, career/recovery assumptions and verification.
- **Daily, synthetic replay timing:** one historical day is 60 real seconds by
  default, with ticks every 0.5 seconds. Daily final results and daily final
  injury reports are revealed at the synthetic UTC day boundary, not before.
  These timestamps are not actual final-whistle/report publication times.
  The season takes about 174 minutes. `MARKET_DAY_SECONDS` changes this speed.
  At the end, market time freezes and new execution is rejected.
- **Solana is off by default for LiveMarket.** Explicit `SOLANA_RECEIPTS=on`
  enables Person 2's existing devnet worker after wallet setup. No devnet
  transaction was used to validate this integration. Disabled receipts are
  labelled `disabled` on order responses. Database receipt records retain
  Person 2's pending state, so do not interpret those as submissions while off.
- **Event queues are bounded:** ticks and bot audit summaries may be dropped for
  a slow subscriber. This is not a durable audit stream. Cash-moving payouts
  must not be implemented using this channel without durable event delivery.
- **The old port-8765 graph remains the offline CSV replay.** It is not a view
  of human trades in this live backend. Use the new quote API/WebSocket when
  connecting the team's frontend.
- Person 4's mission resets are not integrated with market inventory. Do not
  connect those account-reset operations until both sides reconcile transfers.

## Verification

```sh
PYTHONPATH=backend .venv/bin/python -m pytest backend/market/tests backend/trading/tests tests -q
```

Latest verification after the formula integration: **338 passed, 3 skipped**
(the optional live-devnet tests).
A separate HTTP smoke test against all 580 local players bought and sold 10
WEMBY shares and reconciled cash, fills and fees exactly.

Integration fixtures are small and generated locally, so those tests do not
need the large datasets. They cover previews, guest buy/sell, account balances,
finite liquidity, no overspending, unsupported trades, no early result reveal,
replay end, limits crossing makers, WebSocket startup/disconnect, conservation
with human and bot trades, and rollback on an actual SQLite write failure.

## Next milestone

Calibrate career/availability assumptions, integrate the frontend with the model
and entitlement endpoints, and add coordinated persistence before keeping accounts
across restarts. Shorts/leverage and mission resets remain separate work.

## Person 2 update: 5541fb0

Merged equity history/max drawdown, the off-chain leaderboard with public live
updates, and optional Solana portfolio snapshots/chain-read rankings. New routes:
`/trading/equity-history`, `/trading/leaderboard`, `/trading/chain/portfolio`.
Historical ticks may skip minute buckets; snapshots record actual observed ticks.
The Solana representation is limited to 16 holdings and 8-byte tickers. Accounts
outside those limits are not partially synced, and leaderboard auto-selection
uses complete off-chain standings instead. Solana is still explicitly opt-in;
no live chain deployment or transaction is asserted by this merge.

Current economic implementation and payout API: [dividend-model.md](dividend-model.md).
