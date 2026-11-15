# Learning layer — integrated season version

Restored from origin/learn-mode (3b65932), adapted to integration/season-gameplay.

## Active experience

- Six guided tutorials: welcome, a small trade, spread/costs, price vs expectations,
  injury risk and performance payouts. Highlighted live controls, Back/Exit/Resume/
  Restart and completion summaries are restored, with a Home invitation.
- Searchable glossary with links to relevant lessons.
- Real-account purchase/sale/payout checklist and five-question knowledge check,
  scored 0–100 with explanations and retry. Learning scores do not affect cash
  or the season competition. No separate learning service is needed.
- First trade uses one SGA share and accepts a loss from spread/fees as a valid
  lesson. Payout lesson buys one JOKIC share and waits for actual credited cash.
  It intentionally leaves that share owned and advances the shared replay.
- Injury lesson previews stop controls; it does not place a stop, inject an
  injury or promise a guaranteed sale. Spread lesson resets its large preview
  quantity to one and does not place a limit order.

Tutorials use the existing account and therefore change its actual virtual trades.
Trade-dependent lessons require cash/available holdings and an unfinished season.
When unable to trade, exit the lesson; rewinding starts a new account.

## Contracts and persistence

Progress: hs-learn-tour-v2:<user id>. A fresh account cannot inherit completed
old actions. Original v1 data is ignored because its lessons used a different
model. Progress survives refresh for the same account. Quiz best scores are
also scoped by account. Only successful placeOrder responses emit the learning
fill event. History reloads, failed orders and duplicate fills cannot satisfy a
new action. Payout completion reads authoritative credited-cash totals.

No scripted director is enabled. Copy distinguishes indicative quote midpoints,
uncertain analyst estimates and executable bid/ask prices. Targets use explicit
data-tour attributes, including Button and SegmentedControl; no child-position
selectors are needed. The overlay scrolls clipped targets and offers Exit.

Old standalone mission components/API remain as reusable legacy source, but
are not mounted or queried in the season flow. Their forced-profit SGA mission
is replaced by real actions and the knowledge check. Do not enable the legacy
panels without backend adapters and updated mock-specific copy.

## Checks

From frontend/: npm run test:learning, npm run build, npm run lint.
Browser checks cover real order progression, saved completion, quiz grading,
and payout progression. Latest verification is recorded in STATUS.md.
