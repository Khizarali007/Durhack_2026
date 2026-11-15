# Current work — change-tests

Updated: 15 November 2026
Working location: /Users/jonathanlyria/Documents/Projects/Durhack_2026
Branch: change-tests. Commit locally; push only when explicitly requested.

## Current milestone
H$100 denomination throughout the game, preserving economic behavior and existing holdings.

## Latest change
- Currency display/input boundary scales all monetary amounts by 1,000: H$100 starting cash, corresponding share prices, fees, payouts, reports and tutorial examples. Shares and return percentages are unchanged.
- Kept ledger/API units for precision and signed-receipt compatibility. One stored cent now displays as H$0.00001. Price input supports five decimals and converts back to API units.
- Build/lint, 4 currency tests, 3 season/setup tests, 6 learning tests and 23 backend open-order tests passed. Browser verified fresh H$100, one-share buy leaving H$99.84579, H$0.15 limit placement/cancellation, scaled charts and existing reports.
- New preview: http://localhost:8006 (fresh opening screen); http://127.0.0.1:8006 has a one-share test purchase. Both use the latest backend; receipts off.

## Completed
- Replaced Next week with Play season / Pause. Starting after setup runs the market continuously; reports never stop it.
- Backend captures every weekly boundary, including accelerated replay and final partial week. Authenticated reports persist throughout the in-memory market session, independent of browser activity.
- Updates tab shows report history, investment gains after costs, payments and optional player breakdowns; final result uses the accepted liquidation score.
- Searchable opening player selection retained. Setup now requires three meaningful positions across two teams, with the largest at most 50% of invested value.
- Setup shows available cash and actual holdings after each purchase, resumes on refresh, and keeps Start season locked until diversified. Existing trading accounts are not forced to restart.
- Welcome tutorial and overview updated for continuous play. Previous UI simplification, order action visibility and learning features retained.

## Verification
- Backend suite: 71 passed, 1 optional devnet test skipped. Added boundary capture, no auto-pause, report reconciliation, final interval, large-step, isolation and authenticated endpoint/reset coverage.
- Frontend production build and lint passed; 3 season/setup tests and 6 learning tests passed.
- Browser: bought Jokic, Wembanyama and Daniels; first purchase did not exit setup; reload preserved setup; third diversified position enabled Start season. Playback continued through four weekly boundaries; all four reports remained after refresh and the first report stayed unchanged.

## Run / inspect
- Current preview: http://localhost:8006 (new server with current backend; receipts off).
- Run: SOLANA_RECEIPTS=off MARKET_START_PAUSED=1 MARKET_BOT_COUNT=300 MARKET_BOT_FUNDING=fixed MARKET_DAY_SECONDS=60 .venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8006
- Older ports may still run earlier backend code. Use 8006 for these changes.

## Limits / next actions
- Reports and accounts reset on rewind or server restart. Demo clock is shared across accounts; this is not an independent replay per user.
- Setup completion is browser-local; it is a tutorial gate, not a backend portfolio restriction.
- Fast replay remains constrained by market processing. No actual Solana transaction was sent in this verification.
- Review the preview; push only when requested.

## Main files
- backend/trading/weekly_reports.py: account snapshots and report archive.
- backend/market/engine.py: weekly-boundary capture alongside settlement.
- frontend/src/pages/UpdatesPage.tsx and components/SeasonReview.tsx: report feed.
- frontend/src/api/useSeason.ts and components/SeasonControls.tsx: continuous replay and report polling.
- frontend/src/components/Onboarding.tsx and utils/starterPortfolio.ts: diversified setup and progress.
