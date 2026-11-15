# HoopStreet status

Last updated: 15 November 2026.
Working location: `/Users/jonathanlyria/Documents/Projects/Durhack_2026`.
Branch: `integration/season-gameplay`. Local integration; do not push.

## Current milestone

Working frontend/backend season challenge. Core loop verified in browser:
first purchase → historical replay → game payouts → sale → liquidation score.
Frontend imported from `origin/frontend` (832f6b7), backend based on b3834af.
These are selective file imports, not a completed Git history merge.

## Complete

- Real frontend API/quote stream, 580 players, first-purchase onboarding,
  quote/analyst chart with player comparisons, actual market timeline controls.
- Wallet, payout notice and ledger, buy/sell previews, resting-order adapter,
  activity and leaderboard using real backend responses.
- Final score uses cash + estimated liquidation proceeds after fees/impact +
  pending payout rights. Paid dividends are already cash and are not counted twice.
- Quote midpoint and last-trade age separated, including updates while paused.
- Configurable speculative bots (1–10,000), sparse holdings and bounded activity.
  Five existing styles preserved; no target-portfolio/rebalancing policy imposed.
- Conservative newcomer-prior candidate prepared and tested, NOT activated.

## Verification

Final Python suite: 351 passed, 3 optional live-devnet tests skipped.
Frontend production build and lint pass.
Browser: 10 JOKIC bought for $1,542.45; replay to 1 November credited $24.90;
all 10 sold for $1,560.13, exactly matching preview and exit score $100,042.58.
A development-page reconnect required a reload; the account was preserved.

Full-season 300-bot smoke run: 174 days, 78 seconds, about 728 MB peak RSS,
all 580 markets two-sided at finish, cash/share conservation passed.
This is one seed with sample strategies, not evidence of calibrated balance.
10,000-bot seven-day run after sparse-audit optimization: 5.15 seconds, 248 MB.
At most 120 bots are sampled per selected market round, not all 10,000 each tick.

## Pending choices and limits

- User chose speculative bots with more participants. Funding choice pending:
  split original $3m, or $100k per bot. Test server uses 300 / fixed pool;
  library defaults remain 30 until the funding choice is resolved.
- No-history opening values: cautious historical newcomer prior or exclusion.
  Candidate CSV is local; active starting values remain unchanged pending choice.
- Forecast schedules still use opening teams; midseason team changes remain
  a known modelling limitation. Actual recorded game payouts are independent.
- Valuation coefficients are prototype assumptions, not calibrated estimates.
- Solana receipts off in this demo; shorts/leverage off. No Tiger Data integration.
- Restart/rewind resets accounts and market; session storage is not durable.

Run guide and boundaries: docs/season-integration.md.
Previous milestone log: docs/status-before-season-integration.md.
