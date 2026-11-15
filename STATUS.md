# Current work — change-tests

Updated: 15 November 2026
Working location: /Users/jonathanlyria/Documents/Projects/Durhack_2026
Branch: change-tests, based on main e5ad6f7. Local work; do not push without instruction.

## Latest interface pass
- Removed taglines and repeated explanations. Overview now focuses on portfolio value, holdings, payments and the next round.
- Compact first trade, short weekly/final results, optional research/depth details, fixed visible trade action.
- Refined dark/light colors, typography, line icons, hover feedback, round entry and payment notifications. Reduced-motion preferences respected.
- Build/lint and all nine frontend tests passed. Browser verified opening buy, weekly results, sell confirmation, dark/light layouts, and tutorial access to hidden controls. No backend changes in this pass.
- Changes committed locally; require explicit instruction before pushing this interface pass.

## Milestone
A clearer research → invest → play a week → review → decide loop, using the existing market and liquidation score.

## Completed
- Opening allocation choices (5%, 10%, 25%), player examples and current payout forecast.
- One shared season score across the header, replay controls and account summary.
- Play-next-week action and before/after reports, retained on refresh within the same browser tab/account/market session.
- Final season results with payouts, investment gains after costs, pending rights and player contributions, including sold positions.
- Diversification wording explicitly excludes cash and is not a performance grade.
- Detailed replay controls moved behind disclosure; guided tutorials keep access to their controls.
- Forward replay allowed with Solana workers active; rewind still blocked to avoid diverging from immutable receipts.

## Verification
- Targeted backend suite: 69 passed, 1 optional devnet test skipped.
- Frontend production build and lint passed.
- Three season-state tests and six existing learning tests passed.
- Browser: opening purchase, first weekly replay, payment/score reconciliation and report persistence after reload, and full-season results verified. Full-season sample: H$103,043.37 = H$100,000 + H$2,698.15 paid + H$345.22 net investment gain.

## Limits / next actions
- Full-season replay processes all intermediate market activity; it is not an instant jump. Prepare the final-results stage before a timed presentation.
- Local historical simulation, not live NBA data. Accounts still reset on rewind/server restart.
- No actual devnet transaction sent during this change. Receipt queue tests and the forward/rewind gate are verified locally; funded devnet demonstration remains a separate check.
- Run with SOLANA_RECEIPTS=off MARKET_START_PAUSED=1 PORT=8004 scripts/demo for a fresh local review, or use the already-running http://127.0.0.1:8004.

## Main files
- frontend/src/api/useSeason.ts: shared score/clock, replay actions and persisted round snapshots.
- frontend/src/components/SeasonReview.tsx: weekly and final results.
- frontend/src/components/SeasonControls.tsx: weekly action and detailed replay controls.
- frontend/src/components/Onboarding.tsx: challenge and first allocation.
- backend/trading/scoring.py: per-player contribution accounting.
- backend/market/timeline.py: forward replay / rewind policy.
