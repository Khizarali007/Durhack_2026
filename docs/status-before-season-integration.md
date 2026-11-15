# HoopStreet status

Last updated: 14 November 2026.
Working location: `/Users/jonathanlyria/Documents/Projects/Durhack_2026`,
branch `backend` (integrated from `integration/person1-person2`).

## Current milestone

Person 1 market and Person 2 trading backend integrated with performance dividends,
slow ability / fast form expectations and discounted future-payout valuation.
Person 2 changes through 5541fb0 are included. User authorized merging the completed integration into `backend` and pushing on
14 November 2026. Remote backend had no divergent changes; integration was a
fast-forward, preserving the tested Person 1 model and merged Person 2 features.

## Complete

- Full 2024–25 regular season: 580 players, 174 replay days; opening expectations
  use prior seasons and age, with no current-season scores in opening estimates.
- Shared live/offline model: 3% clipped ability update, 20% recent form update,
  25% decaying form contribution and $0.02 per positive Game Score per share.
- Finite bot and maker trading, human buy/sell, previews, limit/stop orders,
  accounts, portfolios, equity history and local leaderboard.
- Noon ownership snapshots and day-close payouts for humans, bots and makers;
  transactional retry-safe session journal, duplicate protection, rollback and
  issuer funding reconciliation. Pending rights included in equity, not cash.
- Model and per-player valuation APIs; payout-entitlement history.
- Regenerated opening-value table and 100,920-row offline graph data, ignored by Git.

## Verification

340 tests passed; three optional live-devnet tests skipped. Full-season live-engine
run settled 100,920 journal events without pending rights. Ten WEMBY shares earned
$190.66, exactly matching recorded results. Human and institutional funding and
cash/share conservation reconciled. HTTP check confirmed a seller after cutoff
received the payment and a buyer after cutoff did not. All 580 CSV opening prices
match the engine; offline quotes are uncrossed.

## Boundaries and next actions

- All money is virtual. Solana is off by default; shorts/leverage disabled.
- Restart resets accounts and market together. Journal is session-local, not
  durable across crashes. Add coordinated disk persistence before retaining accounts.
- Timing is synthetic daily noon/day-close. Forecast fixture calendars follow
  opening teams; map mid-season moves before claiming exact team scheduling.
- Career risk, discount rate and injury recovery are explicit prototype assumptions;
  calibrate them and test forecast sensitivity next.
- Demo frontend simplified at user request: original-style live graph, formula
  overlay, buy/sell, cash/holdings and payout totals at `/demo/`.
  Port 8765 is offline replay; port 8000 is the live trading backend.

Current specification: `docs/dividend-model.md`.
Run instructions: `docs/backend-integration.md`.

Browser demo milestone: `web/demo/`, served by `backend/main.py`. Run guide and
verified flows: `docs/backend-demo.md`. Trade-history receipt status now correctly
reports disabled when the receipt worker is off. Demo changes are local only.

Latest UI refinement: removed the detailed tabs, restored the original graph
style and added a dashed formula-value line. Verified buy/sell and player
switching in-browser. Backend functionality is unchanged. No push performed.

## Timeline controls — 14 November 2026

Implemented an actual-market day slider, pause/play, speed controls and daily
chart-history backfill. Forward seeks retain accounts and process the existing
economic ticks; rewind rebuilds the complete runtime and resets accounts.
Local-only controls reject seeks with Solana writes enabled. Large seeks take
time; the demo shows progress and prevents trading during replay.
Working location remains the backend branch above. Commit locally; do not push.

Verification: 336 backend tests plus five model tests passed; three optional
devnet tests skipped. Targeted timeline/order tests passed after the final test
addition. Browser verified a 17-day seek preserving holdings and paying $26.54,
rewind resetting the account, history reload, and faster playback. Next: user
review of the minimal demo; no push authorized.

## Wallet/onboarding and replay speed — 14 November 2026

First purchase gates the minimal market view. Wallet now explains spendable cash,
share value, total wealth and paid/pending dividends. Purchase/sale notices and
a payout banner with an itemized scrollable ledger show money movement.
Replay speed now reaches 500× target. Cached quotes, periodic full audits and
throttled browser serialization preserve economic tick/order processing.
Same-seed five-day benchmark: 3.16s → 0.66s; identical quotes and cash.
Browser verified first buy, wallet debit, fast playback and credited payouts.
Session data reset for a fresh start; source NBA data preserved. Local commit only.

Verification: full regression passed 341 tests; three optional devnet tests
skipped. Demo left paused on opening day with no accounts/trades and 200×
selected for playback after the first purchase.
