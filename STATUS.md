# Current work — change-tests

Updated: 15 November 2026
Working location: /Users/jonathanlyria/Documents/Projects/Durhack_2026
Branch: change-tests. Commit locally; push only when explicitly requested.

## Current milestone
Full player names, consistent portraits and less inflated preseason expectations.

## Latest change
- ESPN image URLs responded for 573/580 players; portraits cover roster, watchlist, player page, movers and holdings. Fixed sizing/lazy loading and initials fallback handle missing images.
- Removed bespoke ticker labels from player-facing market, chart, order and activity views; internal IDs remain compatible with prior links and receipts. Watchlist layout gives full names more room.
- Preseason model: historical newcomer prior 3.721 instead of 8.605; equal-player shrink target 6.926; most recent season weight 65% instead of 45%. No change to payout coefficient, human starting funds or injury/form response.
- Rebuilt local and committed runtime opening-values CSV. Earlier-season forecast MAE improved 2.559 → 2.155. Formula-only replay total-return gainers improved 235 → 275 of 580; this is not an executable-price claim.
- Detailed evidence, reproduction commands and caveats: docs/OPENING_VALUE_REVIEW.md.
- Current preview: http://localhost:8008. New paused market with revised values; receipts off. Earlier ports retain prior model sessions.

## Completed
- Replaced Next week with Play season / Pause. Starting after setup runs the market continuously; reports never stop it.
- Backend captures every weekly boundary, including accelerated replay and final partial week. Authenticated reports persist throughout the in-memory market session, independent of browser activity.
- Updates tab shows report history, investment gains after costs, payments and optional player breakdowns; final result uses the accepted liquidation score.
- Searchable opening player selection retained. Setup now requires three meaningful positions across two teams, with the largest at most 50% of invested value.
- Setup shows available cash and actual holdings after each purchase, resumes on refresh, and keeps Start season locked until diversified. Existing trading accounts are not forced to restart.
- Welcome tutorial and overview updated for continuous play. Previous UI simplification, order action visibility and learning features retained.

## Verification
- Backend full suite: 466 passed, 3 skipped. Historical/formula tests: 10 passed.
- Frontend production build/lint, 3 season/setup, 6 learning and 4 currency tests passed.
- Browser: six opening photos loaded at equal sizes, missing Boo Buie portrait fell back to initials, full-name Anthony Edwards roster purchase, diversified setup, season entry and improved stock/watchlist layout verified.
- Full 174-day, 300-bot run: 163,892 bot orders, 580/580 two-sided markets at end, cash/share conservation passed. Single-seed example liquidation returns: established +8.21%, diversified +2.80%, random hold -1.33%, frequent trading -13.94%. These are smoke checks, not validated strategies.

## Run / inspect
- Current preview: http://localhost:8008 (new server with current backend; receipts off).
- Run: SOLANA_RECEIPTS=off MARKET_START_PAUSED=1 MARKET_BOT_COUNT=300 MARKET_BOT_FUNDING=fixed MARKET_DAY_SECONDS=60 .venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8008
- Older ports may still run earlier backend code. Use 8008 for these changes.

## Limits / next actions
- Reports and accounts reset on rewind or server restart. Demo clock is shared across accounts; this is not an independent replay per user.
- Setup completion is browser-local; it is a tutorial gate, not a backend portfolio restriction.
- Fast replay remains constrained by market processing. No actual Solana transaction was sent in this verification.
- Review the preview; push only when requested.

## Main files
- scripts/build_starting_values.py and data/runtime/starting_values_2024_25.csv: revised preseason expectations.
- scripts/check_opening_forecasts.py and audit_opening_values.py: reproducible formula checks.
- frontend/src/components/PlayerIdentity.tsx/.css: consistent names, portraits and fallback.
- backend/trading/weekly_reports.py: account snapshots and report archive.
- backend/market/engine.py: weekly-boundary capture alongside settlement.
- frontend/src/pages/UpdatesPage.tsx and components/SeasonReview.tsx: report feed.
- frontend/src/api/useSeason.ts and components/SeasonControls.tsx: continuous replay and report polling.
- frontend/src/components/Onboarding.tsx and utils/starterPortfolio.ts: diversified setup and progress.
