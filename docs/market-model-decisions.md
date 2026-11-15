# Market model decision history — 14 November 2026

**Current implementation:** [Integrated dividend model](dividend-model.md).
The decisions below describe the earlier prototype and are retained as history.
Its prior/form mixing, fixed price multiplier and injury factors have been replaced.

Scope: improve the autonomous daily replay independently of Person 2's human
order flow. These are transparent game-model choices, not fitted financial or
medical estimates. Price is the last executed trade. No human orders, payouts,
shorting or fees are added by this change.

## 1. Estimate quality from evidence, not one-game performance

Decision: keep the age-adjusted pre-season estimate `S0`, maintain recent form
`F`, and shrink form toward the prior. After each played game:

```
observed = clamp(GameScore, S0 - 25, S0 + 25)
F = 0.75 * F + 0.25 * observed       # F initially equals S0
n = min(games_observed, 36)
S = (k * S0 + n * F) / (k + n)
```

`k = 18` for established players; `k = 6` with fewer than 20 prior NBA games.
The opening model still uses the five earlier NBA seasons and age. DNPs and
rest days do not count as zero performances.

Market rationale: estimates should change when new evidence arrives, with
larger updates when prior evidence is weak. A single unusual game should not
erase years of observations. These weights are interpretable starting settings,
not parameters optimized to this season's eventual results.

## 2. Separate availability from underlying quality

Decision: official status and reason choose an assumed near-term availability
fraction `a`. This is a rough expectation over the next ten team games, not the
probability of playing the next scheduled game and not a medically validated
prediction. The CSV exposes it alongside the source report.

```
availability factor = 0.65 + 0.35 * a
reference value = max(10, 5 * S * availability factor) HOOP
```

For an Out report, assumed availability is 0.71 for minor, 0.49 for moderate
and 0.14 for severe reasons, giving factors 0.898, 0.822 and 0.699. Available
or a played box score restores 1.00. A repeated report replaces the current
state without stacking another discount.

Market rationale: missed near-term opportunities matter, while an absence
does not automatically erase underlying ability. The 65/35 split is a model
assumption. Recovery-duration data and payout/settlement rules would justify
replacing it with an explicit expected-cash-flow calculation. At present the
shares are a synthetic performance-index game, not a valued claim on cash flows.

## 3. Give traders different objectives and scarce resources

Decision: 30 shared-account bots, six of each style:

| Style | What changes its estimate or behaviour |
|---|---|
| Value | Estimated quality, availability and a small individual valuation bias |
| Momentum | Recent three-close price trend |
| Contrarian | Opposes recent price trends relative to the reference estimate |
| News | Participates on material new injury or performance information |
| Risk-averse | Discounts uncertain availability and reduces holdings after a major downgrade |

Every bot begins with 100,000 HOOP and 20 shares of each player transferred
from makers. This is an institutional-style endowment, not the human starting
wallet. Bots cannot overspend or sell shares they do not hold. New purchases
are capped at 5,000 HOOP exposure per player; appreciation can take existing
holdings above that cap. Each bot can execute at most 45 orders per replay day.
Limited attention makes trading more likely around fresh information and games.
Daily market processing order is shuffled with a reproducible seed so the same
players do not always consume the network's cash and attention first.

Market rationale: disagreement, attention, inventory and capital constraints
produce trading. Bots do not receive guaranteed profit. The report compares
each bot with holding its original endowment through the same price path;
this is a model diagnostic, not an independent strategy backtest.

## 4. Make liquidity finite but usable

Decision: three makers each receive 1,500 shares and 1,000,000 HOOP per player.
After distributing bot endowments evenly, makers hold 3,900 shares in total
per market. Total outstanding shares remain 4,500. No automatic restocking.

Aggregate inventory pressure shifts maker quotes. A small bounded local skew
and dealer offsets create competing prices without crossed quotes. Base full
spreads are 1.6%, 1.9% and 2.2%; uncertain Questionable/Doubtful reports widen
them by 1.2 percentage points. Trades update cash, holdings and the last price.

Market rationale: buying consumes liquidity and shifts subsequent quotes;
selling replenishes inventory. A market must have enough depth relative to
wallet sizes, but large orders should still matter. Matching a human order
across multiple quotes remains part of the forthcoming engine adapter.

## Validation and next calibration

Run `python3 -m unittest discover -s tests -v` and the full replay. Each replay
checks nonnegative balances, share conservation per player and cash conservation
across the network. `data/bot_performance.csv` reports orders, ending equity,
profit and excess performance over holding the initial portfolio. The daily
market CSV exposes prior, form, projected quality, availability and trade counts
by bot style so future tuning can be evaluated rather than judged by animation.

Next: compare multiple seeds and held-out seasons before claiming robust
strategy performance. Agree an explicit payout/settlement contract before
treating the reference formula as intrinsic financial value. The replay is
daily; it cannot reproduce intraday information timing from daily final reports.


## 15 November 2026 — season challenge integration (supersedes earlier scope)

The current dividend contract is documented in docs/dividend-model.md; earlier
statements above describing shares as having no payout contract are historical.
Currency in the UI is now virtual dollars. Human order matching is implemented.

Confirmed by the user: rank final portfolios using estimated liquidation value
after fees and price impact. This avoids scoring a purchase-induced quote rise
as cash profit. Pending rights are included once; paid dividends already sit in cash.
Alternative marked-price ranking is retained only as a separate equity display.
Reconsider if a real simultaneous end-of-season auction is introduced.

Confirmed by the user: retain speculative bot personalities and increase their
number, rather than introduce target-portfolio rebalancing. Count is configurable
through 10,000; the test uses 300. Total cash funding remains a pending choice.
Both fixed-pool and per-bot funding are supported so this choice is explicit.
The original share supply is preserved in both cases. More traders alone cannot
guarantee active two-sided trading indefinitely.

Prepared, not approved: replace the league-level no-history prior with a cautious
historical newcomer prior. Active opening values have not been regenerated.
An alternative is excluding those players for the demo. Reconsider the simple
prior when trustworthy preseason draft/role and playing-time estimates exist.
