# Integrated performance-dividend model

Implemented in `backend/market/valuation.py`, shared by the live engine and offline
replay. All dollars are virtual. The price is an executed trade, not a forced
assignment to estimated value. The API exposes both, plus a portfolio mark.

## Performance and expectations

For each actually played regular-season game:

```
X = max(0, GameScore)
actual dividend per share = 0.02 * X
L <- L + 0.03 * clip(X-L, -15, 15)
F <- F + 0.20 * (X-F)
expected performance at future opportunity k = L + 0.25*(F-L)*0.90**k
```

Here k=0 is the next opportunity. L is underlying ability; F is recent form.
Missed games do not enter either estimate as zero scores. Negative played games
update performance with X=0, but never create a negative dividend. Every player
uses the same payout rule; reputation changes expectations, not actual rewards.
The surprise clip applies to ability only, not to cash payouts or recent form.

Opening L=F is estimated from nonnegative Game Score over 2019–20 through
2023–24, retaining the existing 5/10/15/25/45% season weights, ten league-average
pseudo-games per season and modest age adjustment. No 2024–25 result enters the
opening performance estimate. The player universe and known team calendar come
from the local 2024–25 dataset. Rookie priors remain league-average estimates.
The same 3% update currently applies to rookies; it is not separately calibrated.

Example starting at L=F=20: one Game Score 40 pays $0.80/share, moves L to 20.45
and F to 24, and forecasts 21.3375 next game. Five Game Score 5 performances move
L to 17.8810 and the next conditional forecast to 15.8896. Actual payouts for
those games are $0.10/share each.

## Share value

The estimate sums discounted expected future performance dividends:

```
V = sum(0.02 * career_survival(t_k) * availability(k)
        * expected_performance(k) / (1+r)**years_to_payment)
```

Known remaining team fixtures use their synthetic day-close payment times. Once
this regular season ends, continuation starts on 22 October 2025 with 82 evenly
spaced opportunities/year. Its infinite tail is evaluated analytically as
geometric series, not replaced with an arbitrary resale price. Shares retain
value when the replay ends. The known fixture calendar follows each player's
opening team; mid-season team moves are not yet mapped into the forecast calendar.
Historical payout results still pay the actual player, regardless of team.

Prototype risk assumptions, **not fitted or medically validated**:

- Annual required return r=20%.
- Healthy participation probability = 90%.
- Annual career-exit probability:
  `min(0.35, 0.04 + 0.0015 * max(age-27, 0)**2)`.
- Career survival over y years is `(1-h)**y`. Current age is updated through the
  replay, but h is held constant within each valuation's future forecast. This
  is a simplifying stationary-risk approximation, not a calibrated career model.
- Next-opportunity availability: Out=0, Doubtful=.15, Questionable=.50,
  Probable=.85, otherwise=.90.
- Recovery timescale tau: minor=3, moderate=10, severe=40 team opportunities.
- Future availability is `.90 - (.90-a0)*exp(-k/tau)`.

Out therefore removes expected near-term payments without multiplying the
entire career by a permanent injury discount. Repeated identical reports replace
status; they do not compound discounts. A played result or Available report
clears the restriction. The current model does not infer permanent impairment,
medical prognosis or an exact retirement date from injury text. Imported legacy
`target_factor` values are no longer used in pricing.

The 3% ability rate and 25% form weight were chosen as a stability/forecast-error
compromise in the earlier historical experiment. The 20% form rate, 0.90 decay,
15-point clip, recovery and career assumptions remain design choices. This
implementation is not a calibrated financial valuation or profitability claim.

## Ownership and settlement

The replay uses **synthetic daily timing**, not real intragame timestamps:

1. Before 12:00 UTC, shares include today's expected payment if the player's
   opening team has a scheduled fixture.
2. At 12:00 UTC, ownership is recorded for humans, bots and makers. The expected
   current-fixture payment is excluded from the remaining share valuation.
3. Selling after cutoff does not transfer that day's entitlement. Buying after
   cutoff does not receive it.
4. At day close, actual results are revealed and dividends are paid to recorded
   owners. Multiple played games, if present, each use max(0, GameScore).
5. Holder payments are rounded half-up to cents after multiplying quantity by
   the per-share payout. The issuer funds the actual sum of these rounded credits.

Cutoffs record all players, so no future appearance or score is exposed to traders
by selecting only eventual participants. A player who did not play pays zero.
Bots and makers follow exactly the same ownership and payout rules as humans.
The offline replay has a different bot-action cadence but the same economics.

`dividend_events` and `dividend_entitlements` are the authoritative SQLite journal.
Event IDs include session/day/player. Existing events and payments cannot be
credited twice. Account writes and institutional cash changes are coordinated;
an exception rolls both back and settlement can retry. A failed live step pauses
new orders until retry succeeds. Display/WebSocket queues do not move money.

The journal shares the current **in-memory session database**. It protects against
retries and dropped UI events within that session; it is not crash recovery across
restarts. A restart still resets all accounts and the market together. There is
no claim of durable disk persistence.

## Portfolios, leaderboards and bots

Live positions are marked at the current bid/ask midpoint (one-sided quote or
fair value fallback), rather than a stale pre-cutoff last trade. Last trade is
still returned separately. This is a quote-based mark, not a guaranteed liquidation
value for a large position.

Pending entitlements are shown separately and added to equity, equity-history
snapshots and the off-chain leaderboard; they cannot be spent before settlement.
They are removed when cash is credited. Profit reconciliation is:

```
equity - baseline = realised + unrealised - fees + settled payouts + pending rights
```

Solana snapshots cannot represent pending rights, so accounts with them remain
on the complete off-chain path. Solana stays opt-in. Shorts/leverage stay disabled.

Bots retain finite cash/positions, attention limits, inventory-driven execution
and their existing styles. Their valuations now use dividend expectations with
form weights: value .10, momentum .50, contrarian .10, news .35, risk-averse .20.
Risk-averse bots use a 28% required return; others use 20%. These personality
settings are transparent simulation assumptions, not proven profitable strategies.

## Inspect

- `/market/model`: coefficients and assumptions.
- `/market/valuation/WEMBY`: ability, form, expected payout, fair value, mark,
  actual last trade and cumulative actual payouts/share.
- `/trading/payout-entitlements`: your ownership cutoffs, pending estimates and settlements.
- `/trading/payouts`: actual credited payments.
- `/trading/portfolio`: `pending_payouts`, `payouts_received`, equity and position marks.
- `/market/status`: enabled model, settlement errors and issuer payout totals.

Generated files remain ignored: opening-value CSV, 100,920 daily price rows,
including per-share dividends/ability, and bot-performance results. The port-8765
chart is the refreshed offline replay; port 8000 is the live human market.

## Verification

338 tests passed; three optional devnet tests skipped. New checks include the
agreed coefficient examples, the analytic infinite tail versus a direct numerical
sum, detachment value, injury severity, pre/post-cutoff ownership, duplicate
settlement, negative games, queue overflow, and rollback before/after cash credits.

A full 580-player, 174-day live-engine run settled 100,920 journal events with no
pending rights at the end. Holding ten WEMBY shares earned exactly $190.66,
matching actual recorded positive Game Scores. Human/institutional funding and
cash/share conservation reconciled. A separate HTTP test bought then sold before
payment and confirmed the old holder was paid while the post-cutoff buyer was not.
