# Current work — change-tests

Updated: 15 November 2026
Working location: /Users/jonathanlyria/Documents/Projects/Durhack_2026
Branch: change-tests. Commit locally; push only when explicitly requested.

## Current milestone
Neutral fantasy roster setup with H$100 cash and shares worth 10× more.

## Latest change
- Removed featured Jokic/Wembanyama/Daniels suggestions and default selection. All players remain available through a neutral price-sorted, searchable list with team filters and pagination.
- New roster builder shows empty slots, budget, actual holdings, qualification checks and a compact purchase panel. Sell an existing pick to change the roster; normal spread and fees apply.
- Live prices and both forecast/actual dividends scale 10×. Institutional funding and position limits scale with them; human cash stays H$100. Setup allocation buttons are H$10/H$15/H$20.
- New preview: http://localhost:8007. Fresh paused session; receipts off. Earlier server ports retain older economies.
- Implementation: components/Onboarding.tsx and Onboarding.css; backend/market/valuation.py and core.py; learning examples/glossary; regression tests.

## Completed
- Replaced Next week with Play season / Pause. Starting after setup runs the market continuously; reports never stop it.
- Backend captures every weekly boundary, including accelerated replay and final partial week. Authenticated reports persist throughout the in-memory market session, independent of browser activity.
- Updates tab shows report history, investment gains after costs, payments and optional player breakdowns; final result uses the accepted liquidation score.
- Searchable opening player selection retained. Setup now requires three meaningful positions across two teams, with the largest at most 50% of invested value.
- Setup shows available cash and actual holdings after each purchase, resumes on refresh, and keeps Start season locked until diversified. Existing trading accounts are not forced to restart.
- Welcome tutorial and overview updated for continuous play. Previous UI simplification, order action visibility and learning features retained.

## Verification
- Backend full suite: 464 passed, 3 skipped. Additional valuation run: 7 passed, including two new cases verifying 10× price/payment scaling with unchanged yield for healthy and injured players.
- Frontend build/lint passed; 3 season/setup, 6 learning and 4 currency tests passed. Quiz answers and glossary use the new payout coefficient.
- Browser: H$100 empty roster, no selected player; team filtering and name search; Luka/Tatum/Curry buys; 3 diversified positions unlocked Start; selling Curry removed the holding and locked Start; repurchase unlocked it. Start entered the dashboard and Pause stopped playback. No real Solana writes.
- Updated the previously stale Playwright smoke script to the new roster flow. Its flow was exercised through the browser tools; the Playwright CLI suite was not run.

## Run / inspect
- Current preview: http://localhost:8007 (new server with current backend; receipts off).
- Run: SOLANA_RECEIPTS=off MARKET_START_PAUSED=1 MARKET_BOT_COUNT=300 MARKET_BOT_FUNDING=fixed MARKET_DAY_SECONDS=60 .venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8007
- Older ports may still run earlier backend code. Use 8007 for these changes.

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
