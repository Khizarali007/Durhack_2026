# Person 4 context (learning layer + demo)

Read this first in any later session working on the learning layer.

## Project

DurHack 2026, team of 4. **HoopStreet** is an NBA player stock exchange game
that teaches investing. 300 NBA players are "stocks", priced in play money
(HOOP; users start with 100,000). Prices come from real 2024-25 game logs,
scripted fake events (injuries, hot streaks; each injury has an early warning
20-40 s before) and an order book with market makers and bots.
**Clock:** 1 market minute = 5 real seconds (12x). The UI updates every 0.5 s.

## Team

- **Person 1:** market engine, data, order book, scenario director (Python/FastAPI/SQLite). Branch `person-1-tasks`.
- **Person 2:** accounts, trading, portfolios, Solana receipts (same FastAPI backend). Branch `person2branch`.
- **Person 3:** React + Vite frontend, the trading terminal.
- **Person 4 (me):** learning layer: 6 guided missions, Composition panel and
  grade, report card, glossary and tooltips, Coach Hoops (Gemini), scenario
  JSON files, plus demo delivery. Branch **`person4-learning`**.

Everyone builds in parallel. I work in isolation against interfaces I define
(`docs/person4-interfaces.md`), with mocks I swap for the real code at merge.

## Missions

1. Buy low, sell high (**ready**: `scenarios/m1_buy_low_sell_high.json`)
2. Read the spread (placeholder)
3. Compose your portfolio (placeholder)
4. Hype vs fundamentals (placeholder)
5. Survive the storm (placeholder)
6. Danger zone (placeholder)

Copy: `content/missions.json`. Glossary seed: `content/glossary.json`.
Tone: friendly, a bit silly, weather-forecast and trading-floor flavour,
short sentences, written for beginners.

## Files I own (stay inside these)

```
backend/learning/            package: router.py, deps.py, scenario.py, mock_router.py, dev_app.py
backend/learning/adapters/   models.py, base.py (Protocols), mock_market.py, mock_trades.py
backend/learning/tests/      pytest
backend/requirements-learning.txt
content/                     missions.json, glossary.json
scenarios/                   *.json, SCHEMA.md, check_scenarios.py
docs/person4-*.md
```

Never create `backend/main.py`, `frontend/`, or a top-level `requirements.txt`.

## Running (macOS, VS Code integrated terminal, repo root)

```bash
/opt/homebrew/bin/python3.12 -m venv .venv      # once (brew install python@3.12)
source .venv/bin/activate
pip install -r backend/requirements-learning.txt
python -m pytest backend/learning -q
python scenarios/check_scenarios.py
uvicorn learning.dev_app:app --app-dir backend --port 8001 --reload
```

## Decisions so far

- **Git:** when I started, `origin/main` already had an initial commit
  (README only), so I branched from it and left main alone. My root
  `.gitignore` lives on my branch. Teammates' branches also add one, so expect a
  trivial merge conflict there. It ignores `data/`, as I was asked to; Person 1
  tracks `data/README.md`, which stays tracked, but new files in `data/` will
  be ignored. Check this at merge.
- **No AI attribution** in commits or files, ever.
- **Python 3.12** from Homebrew. The system Python is 3.9, which is too old.
- **Imports:** the package is `learning`, with `backend/` on the path
  (`--app-dir backend`; pytest finds it through the `__init__.py` layout).
  That matches a future `backend/main.py` doing `from learning import router`.
- **Adapters are Protocols.** Teammates needn't import my code. The adapters
  are sync methods, because the reads are cheap and in-memory.
- **Wiring:** `learning.configure(market, trades)` sets module-level adapters,
  and routes get them via `deps.get_market()` / `deps.get_trades()` (503 if
  not configured).
- **Mock market:** its own simulated clock (`step(dt)`), so tests are
  deterministic with a seed. Market time starts at 2025-01-19 19:00 UTC
  (epoch 1737313200). Price pull toward fair value: half the gap closes in
  ~2 s. Noise is 0.4%/√s. Half-spread is 0.10% × volatility. Event dynamics
  are per-kind profiles (table in the interfaces doc).
- **Mock trades:** market orders only. Buy/cover fill at the ask, sell/short at
  the bid, with a 0.10% fee. No margin. You can't short while long, or buy
  while short. `place_market_order` is mock-only; the real learning layer
  only reads.
- **Scenario step `t`** is in real seconds from mission start. A market step
  converts to `MarketEvent.t = mission_start_market_t + t * 12`
  (`Step.to_market_event`).
- **Content rules** (enforced in `learning/scenario.py`): every injury has an
  early_warning for the same symbol 20-40 s earlier; missions run 30-60 s;
  copy is scanned against a whole-word block-list. "tear" and "charged" are
  deliberately *not* blocked ("on a tear", "charged up"); "torn" and
  "ligament" are. "Thunder" and "tornado" are fine.
- **M1 grading** (`learning/evaluators.py`, `evaluate_m1`):
  - The outcome order is in `_notes.outcome_rules` in `content/missions.json`.
  - Pass = realised P&L after fees > 0 on the goal symbol. Average cost is
    used: buy fees go into the cost basis, sell fees come off the proceeds.
  - Score (0-100) = (avg sell fill - avg buy fill) / (highest price at or
    after the hot streak fired - lowest price at or before it), clamped.
  - `passed_great` means score ≥ `grading.great_min_score` (60). This
    replaced the earlier "≥ 8% return" rule.
  - On the mock, M1 peaks at about +17% around t=25-30 and ends about 3%
    below the peak. Buying at t≈5 and selling at t≈27 scores about 90.
- **Evaluator registry:** `EVALUATORS[mission_number]`. A mission is
  `available` only if its status is `ready`, its scenario file exists and it
  has an evaluator.
- **Mission runner** (`learning/missions.py`, `MissionManager`):
  - It is tick-driven. `tick()` reads an injectable `Clock`, fires due steps,
    records the price path and ends the mission at `duration_s`.
  - In the app, a background task ticks every 0.1 s and starts lazily on the
    first mission start. Tests use `ManualClock` plus manual `market.step()`
    with `autorun=False`.
  - Market steps are injected with `t = market_time()` at fire time (no
    future scheduling), so a stop cancels the remaining steps.
  - One active mission per user. A finished or stopped mission can be
    restarted. A stopped mission is still evaluated (state `stopped`).
  - The price path re-reads `recent_ticks(sym, 240)` each tick, keyed by `t`.
- **`TradesAdapter.apply_start_state`** was added (the only write the learning
  layer makes). Mission start resets cash and positions to the scenario's
  `start_state`.
- **WebSocket `/learning/ws`:** sends a snapshot on connect, mission messages
  through per-user `asyncio.Queue` fan-out, and ticks at 2 Hz for the mission
  symbols (or `?symbols=`).
- **CORS** in `dev_app.py` allows `http://localhost:5174` (my sandbox frontend).
- **Known open issue:** the market is shared, so one user's mission events move
  prices for everyone. That's fine for the demo; to decide at merge.
- `/learning/mock/*` debug routes are mounted only by `dev_app.py` and are
  marked **remove at merge**.

- **Frontend components** (`frontend/src/learning/`):
  - Plain React: `.jsx` + one `learning.css` with `hs-learn-` classes.
    Dark by default, `data-theme="light"` and `data-projector="true"` hooks,
    all sizes in em.
  - `useMission` is server-driven: every WebSocket mission message triggers a
    status refetch, and the feed is `status.messages` (the latest 10). The
    countdown is interpolated locally from `seconds_left`. It falls back to
    polling every 2 s while running if the socket is down.
  - `useLearningSocket` shares one socket per URL, uses exponential-backoff
    reconnect (0.5-5 s), and closes 250 ms after the last user (StrictMode-safe).
  - Headline styles by event kind: hot_streak = "Heat advisory" (striped
    hazard banner), early_warning = "Weather watch", injury = "Storm warning",
    rest_day = "Calm spell", trade_rumour = "Fog advisory".
  - "Need a hint?" reveals the mission's `hint` from `missions.json`.
    Scheduled hints appear by themselves under "Coach's tips".
  - Passed missions are tracked client-side (`passedIds`) for the session only.
- **Sandbox** (`learning-sandbox/`, throwaway): Vite 8 + React 19, port 5174.
  Imports the components via the `@learning` alias, with
  `resolve.dedupe: ['react','react-dom']` and `server.fs.allow: ['..']`.
- **Tooling:** Node is installed via Homebrew (`brew install node`; v26 at the
  time).
- **Verified end to end** in headless Chrome (with puppeteer-core from a
  scratch dir, not committed): buy low/sell high gives a "Mission passed!"
  debrief, never buying gives the `never_bought` debrief, and Retry and Stop
  work. There's no horizontal overflow at 375 px.

## Next steps

- Report card; Composition panel and grade.
- Coach Hoops (Gemini); missions 2-6 scenarios, evaluators and copy.
- Reconcile with teammates at the end: see the open items in
  `docs/person4-interfaces.md`.
