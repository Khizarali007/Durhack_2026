# Integrated season gameplay prototype

## Sources and scope

Backend base: b3834af. Frontend files imported from origin/frontend 832f6b7.
Glossary imported from origin/learn-mode 3b65932 and corrected to describe the
implemented game. No scripted mock missions or invented market headlines are
part of the real season flow. Mock mode is explicit VITE_USE_MOCKS=true.
All money is virtual; owning shares confers no rights in an actual NBA player.

## Run locally

Keep the existing local historical SQLite and opening/injury CSV files in data/.
They are ignored by Git and are not included in this integration commit.
From the repository root, in one terminal:

```sh
SOLANA_RECEIPTS=off MARKET_START_PAUSED=1 MARKET_DAY_SECONDS=60 MARKET_BOT_COUNT=300 MARKET_BOT_FUNDING=fixed .venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8002
```

In another terminal:

```sh
cd frontend
npm ci
VITE_API_TARGET=http://127.0.0.1:8002 npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. Start with a purchase, select Next day or Play,
inspect payments and holdings, then sell. The stock chart shows quotes and
analyst estimates; Fit history restores the complete revealed range after pan/zoom.
A forward date jump preserves accounts; backward jumps reset all demo accounts.
The speed selection is a processing target, not a guaranteed throughput.
Restarting the backend resets the demo. Keep this local development service private.

## Scoring and pricing

The approved challenge is growth across the 2024–25 regular season.
Score = cash + proceeds from selling holdings into current maker liquidity
minus execution fees + pending payout rights. A nonmutating preview uses the
same fill/fee logic as execution. Unsellable quantity is reported and contributes
zero proceeds. Scores assume each account exits independently against current
liquidity, not a simultaneous auction of every participant. Open orders are
ignored for this hypothetical exit (as if cancelled first).

The prominent stock price is the two-sided bid/ask midpoint. It is indicative:
actual buy/sell prices differ because of spread, impact and fees. Last trade
and its age remain separate. A stale last trade no longer draws an apparently
unchanging current market. The analyst estimate is the existing dividend model,
not a guaranteed redemption price. Opening percentage comparisons use the
opening quote; the starting-value CSV remains the model's opening estimate.

## Bots and performance

Five speculative styles remain: value, momentum, contrarian, news and risk-averse.
No automatic portfolio targets or replenishment were added. Total shares per
player stay 4,500, including 600 initially assigned to bots and 3,900 to makers.
MARKET_BOT_COUNT supports 1–10,000. MARKET_BOT_FUNDING=fixed shares the original
$3m bot cash pool; per_bot assigns $100k to each participant. The latter changes
market buying power as well as population. Funding decision is still pending.
The running test uses 300 / fixed; defaults have not silently been changed.

Sparse holdings and ownership/audit indexing avoid scanning every bot for every
player. A selected market round samples up to 120 bots; 10,000 registered bots
therefore does not mean 10,000 active orders per tick. More bots cannot guarantee
liquidity indefinitely: finite speculative traders may still polarize holdings.

Reproduce an isolated benchmark (does not affect the UI account):

```sh
PYTHONPATH=backend .venv/bin/python scripts/benchmark_gameplay.py --bots 300 --funding fixed --days 174 --strategies
```

One full-season seed completed in 78.04s at 728 MB peak process RSS, with all
580 markets two-sided at finish and conserved money/shares. Five sample strategy
returns ranged from -19.80% for repetitive trading to +7.80% for a prior-star
basket. They shared one market: these are integration smoke results, not a
controlled strategy comparison or a promise about optimal gameplay.
After sparse-audit optimization, 10,000 fixed-funded bots replayed seven days
in 5.15s at 248 MB. Full-season memory includes event/history accumulation;
seven-day memory does not establish full-season resource requirements.

## Newcomer-prior candidate: pending approval

The optional conservative prior uses equal-player averages from historical NBA
newcomers first observed in 2022–2024, with 2020–2021 as wash-in history.
It has 332 players and conditional Game Score 3.721, versus the generic league
prior 8.605. It uses no 2024–25 performances. The cohort is a newcomer proxy,
not a verified rookie/draft/role dataset. It does not forecast playing time.
The candidate reduces Bronny James' estimate from $60.86 to $26.32 while leaving
players with NBA history unchanged. Local candidate file:
data/starting_values_candidate_2024_25.csv. Active data remains unchanged.

## Validation and limitations

Browser verified: purchase, preserved holdings during date replay, $24.90 credited
payouts, and a complete sale matching the preview and liquidation score exactly.
Production frontend build and lint pass. Final Python suite: 351 passed, 3 optional live-devnet tests skipped.
Solana is disabled in this run; optional devnet tests were skipped. This demo does
not prove blockchain operation, live NBA ingestion, calibrated economics or
production durability. No Tiger Data connection is implemented here.
Daily results and final injury reports are revealed at synthetic day close;
ownership cutoff is synthetic noon. Forecast schedules still use opening teams,
so midseason transfers need a causal schedule update. Ability, form, career risk,
discounting and injury-duration coefficients remain explicit prototype assumptions.
