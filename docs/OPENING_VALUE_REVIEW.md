# Opening-value and player presentation review

15 November 2026. Branch: change-tests. All currency in the UI is virtual.

## Pricing decision

Keep the existing dividend valuation, ability/form update speeds, age adjustment,
injury handling, market rules and H$100 budget. Fix the *preseason expectation*
that supplies the model, applying the same policy to every player:

- Most-recent-to-oldest season weights: 65/20/8/5/2%, previously 45/25/15/10/5%.
- Each season still has ten pseudo-games of shrinkage. Its target is the equal-player
  mean of the last prior NBA season (6.926), not the pooled appearance-weighted
  league mean (8.605), which overrepresents regular starters.
- Players with no NBA history use the equal-player mean from first-observed
  2021–22 through 2023–24 newcomer seasons: 3.721, based on 332 players. This is a
  newcomer proxy, not verified rookie status. Previously all 108 no-history players
  in this market received the 8.605 league mean.
- No 2024–25 result chooses a player's starting estimate. Uniform pricing policies
  do not mean equal prices or a guaranteed 50/50 split of winners and losers.
- These are new-session opening values. Do not overwrite a running account's
  acquisition cost, trade records or receipts.

## Earlier-season development check

Predict 2023–24 player means using 2019–20 through 2022–23 data only. Cohort:
500 players with at least ten appearances in the evaluation year. Compare scores
before the unchanged age adjustment. This single season informed model selection;
it is not an independent validation of the final coefficients.

| Metric | Previous | Revised |
| --- | ---: | ---: |
| Mean absolute error, Game Score points | 2.559 | 2.155 |
| Mean overprediction | 0.911 | 0.086 |
| Players overpredicted | 62.6% | 56.0% |
| Mean overprediction, <20 prior appearances | 3.419 | -0.097 |

Reproduce with `python scripts/check_opening_forecasts.py` after caching the
historical CSV inputs in `data/source`. Rebuild values using
`python scripts/build_starting_values.py`; `--model legacy` reproduces the former
expectation policy with the current dividend units. Copy the resulting values CSV
to `data/runtime` when updating the bundled demo. No new raw dataset is published.

## 2024–25 outcome audit

Formula-only daily replay, **not executed stock returns**. Cash payments are
included in total return; spread, fees and order flow are excluded. All 580
players are counted, including very limited appearances. Outcomes were used to
report the change, not force a desired win rate.

| Metric | Previous | Revised |
| --- | ---: | ---: |
| Players with rising formula value | 111 | 155 |
| Players ahead including payments | 235 | 275 |
| Median price return | -19.93% | -15.76% |
| Median total return | -10.93% | -3.41% |
| Median total return, at least 40 appearances | +6.70% | +14.38% |

Reproduce with `python scripts/audit_opening_values.py --values <values.csv>`.
Lower share prices can coexist with positive returns because cash has been paid
out. Actual transaction prices and executable returns differ from formula values.

## Real engine smoke run

174 days, seed 2026, 300 speculative bots, fixed institutional funding, revised
values. 163,892 bot orders, 580/580 two-sided end quotes; cash/share conservation
passed. Replay took approximately 79 seconds on this machine. Sample final
liquidation scores from H$100: established H$108.21, broad diversified H$102.80,
random hold H$98.67, frequent trading H$86.06, cash H$100.00. These are selected
single-seed smoke strategies, not recommended portfolios or robust performance
estimates. The random reference baskets are selected independently of results.

Reproduce with `python scripts/benchmark_gameplay.py --days 174 --bots 300 --strategies`.

## Names and photos

- Player-facing labels use full names, including charts, orders, holdings and
  confirmation messages. Legacy symbols remain internal/API routing keys so
  receipts, existing links and learning scenarios continue to work.
- Portraits use ESPN headshot URLs joined by existing SportsDataverse ESPN athlete
  IDs. Availability check: 573/580 URLs returned an image response. This verifies
  URL availability, not a manual identity review of every image.
- Fixed image dimensions, lazy loading, stable crops and initials fallback keep
  rows aligned and usable offline. No images are copied into the repository.
- Current ESPN portraits may show later uniforms; all team labels and pricing
  remain tied to the historical replay. The photos never inform the formula.
- Source: https://sdvplot.sportsdataverse.org/docs/tutorials/headshots
  and https://www.espn.com/nba/players . Headshots remain their owners' material.

## Verification

Backend: 466 passed, 3 optional tests skipped. Historical data/formula tests: 10
passed, including future-data exclusion, equal-player weighting, missing-season
normalization and symmetric treatment of improving/declining histories.
Frontend: build/lint, 3 season tests, 4 currency tests and 6 learning tests passed.
Browser: portraits loaded at matching dimensions; unavailable Boo Buie image fell
back to initials; full-name Anthony Edwards selection, roster trades, season
entry, portfolio photos and full-name trading view verified.
