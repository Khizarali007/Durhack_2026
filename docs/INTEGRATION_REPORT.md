# Integration report

15 November 2026. `main` = `integration/final`. Every remote branch is an
ancestor of `main` (real merges, checked with `git merge-base --is-ancestor`).
Each pre-integration tip is tagged `archive/2026-11-15/<branch>`.

## 1. What's on main

| Feature | Status | From |
|---|---|---|
| 2024–25 season replay: 580 players, real box scores, valuation, 300 speculative bots, 3 market makers per player | Working | Person 1 |
| Day controls: Play/Pause, speed, Next day, jump to date, Finish season (rewind resets accounts) | Working | Person 1 |
| Performance payouts (H$0.02 per Game Score point, noon cutoff) and the payout ledger | Working | Person 1 + 2 |
| Guest accounts, market/limit/stop-loss orders, cost preview, fees, slippage, liquidation score | Working | Person 2 |
| Off-chain leaderboard with live updates | Working (page from Person 3) | Person 2 |
| Solana devnet receipts: settling → confirmed in X s + Explorer link | **Degraded**: auto mode is on, but the fee payer has no test SOL, so the UI says "Solana paused" (see TODO) | Person 2; auto mode from integration |
| Chain-read leaderboard (Level 1 on-chain portfolios) | **Off**: needs a funded fee payer + `SOLANA_PORTFOLIO_PROGRAM_ID`; falls back to off-chain with `chain_error` | Person 2 |
| Bot-trade bundle receipts | **Off** in the season replay (rate limits); recorded and hashed | Person 2 |
| Shorts, 3x leverage, margin calls | **Off** (`supports_advanced_trading = False` in the season engine) | Person 2 (built and tested), off by Person 1 |
| React trading terminal: Home movers, Market list (search, team filter), Stock page (chart, ticket, quotes), Portfolio, Activity, Leaderboard, Learn, light/dark | Working | Person 3, season-adapted by Person 1 |
| First-purchase onboarding | Working | Person 1 |
| **Portfolio Composition**: % by team and player, effective holdings, A–F grade with a reason; panel + account-strip chip | **Working (new)** | Person 4 / integration |
| **Storm Radar + early warnings** from the official injury report; "Why did it move?" names the cause; Wembanyama storm shortcut on `/director` | **Working (new)** | Person 1 data; Person 4 / integration |
| Guided tutorials (6), searchable glossary, knowledge check | Working | Person 4, season-adapted by Person 1 |
| `/learning` API (missions, glossary, health) on real adapters, in the one backend | Working; graded timed missions are not shown in the UI | Person 4 |
| WebSocket and session reconnect without a page reload | Working | Person 3 + integration |
| Mock mode (`VITE_USE_MOCKS=true`) for frontend-only work | Working (build verified) | Person 3 |
| Person 1's standalone demo at `/demo` | Kept | Person 1 |

## 2. Commands and test results

Fresh clone (Python 3.11+, Node 20+):

```sh
scripts/setup     # venv + backend deps + frontend deps + data check
scripts/demo      # build + ONE process: http://127.0.0.1:8000
scripts/dev       # backend :8000 with reload + Vite :5173 with hot reload
scripts/setup_data --rebuild   # optional: re-download and regenerate data/runtime/
```

Settings: copy `.env.example` to `.env`. Demo defaults: 300 bots (fixed pool), 60 s per day, start paused, `SOLANA_RECEIPTS=auto`.

Results (last run):
- Backend `cd backend && ../.venv/bin/python -m pytest -q`: **460 passed, 3 skipped** (live-devnet tests).
- Root `tests/`: **7 passed**.
- Frontend: `npm run build` clean, `npm run lint` clean, `npm run test:learning` **6/6**.
- Playwright smoke `npm run test:e2e` (guest → buy → Next day until a payout → sell → score → Learn): **passes**, also from a brand-new clone in a temp folder following only the README.
- Manual (scripted) browser checks: Composition panel with 4 holdings (grade C, reason names Luka); storm story on the real backend (19 Feb calm → 20 Feb early warning H$124.18 → H$123.19 → 21 Feb storm H$111.11, no medical text, no page errors).

## 3. Decisions (full detail in INTEGRATION_DECISIONS.md)
- D1 Base on midnight-pizza; real merge of learn-mode; all branches are now ancestors.
- D2 All 64 frontend/learning conflicts keep the season-adapted version.
- D3 Removed the committed root node_modules, root package files and `.claude/settings.local.json`.
- D4 History scanned for secrets: none found.
- D5 Committed a 5 MB runtime data bundle; full sources rebuildable.
- D6 One backend on port 8000; FastAPI serves the built frontend in demo mode.
- D7 The real MarketAdapter never moves the shared replay; learning events are recorded only.
- D8 Graded mission definitions moved to `content/graded-missions.json`.
- D9 One `backend/requirements.txt`.
- D10 Session creation retries by itself; no reload needed after a backend restart.
- D11 Mock mode kept.
- D12 One currency: HOOP, shown as `H$`.
- D13 Bot funding: fixed pool, 300 bots.
- D14 Newcomer prior not activated.
- D15 Demo defaults in `scripts/_env.sh`.
- D16 Shorts and leverage stay off.
- D17 Composition grade ladder (effective holdings + player/team caps).
- D18 List of Person 3 files touched.
- D19 `SOLANA_RECEIPTS=auto` probes devnet and the fee payer once, then degrades calmly.
- D20 Bot-bundle receipts off in the fast replay.
- D21 Official injury-report changes become early-warning/storm events; medical reasons are never shown.
- D22 `H$… HOOP` unit label is slightly redundant; kept.

## 4. Known issues and risks (most serious first)
1. **Solana is not live until a human funds the fee payer** (TODO 1). Without it the Solana prize demo shows "Solana paused". After funding, restart the backend: auto mode re-checks only at startup.
2. **Restarting the backend wipes accounts** (in-memory DB by design in the season engine; rewinds do too). The frontend reconnects and makes a fresh guest by itself, but holdings are gone. Don't restart mid-demo.
3. **The storm jump takes about 47 s** of processing. Do it before judges arrive, not live.
4. **Shorts/leverage/margin calls are off**, so the "danger zone" lesson and SGX-FX margin-call must-have are missing.
5. **The data licence is unconfirmed** for the SportsDataverse release (TODO 4).
6. Graded timed missions (Person 4's runner) are mounted but not used by the UI. Their m1 scenario expects an injected hot streak, which the real adapter deliberately doesn't apply (D7).
7. With no Solana, the account WebSocket and `/trading` still work, but `receipt_status` is `disabled` for every trade, so trade history shows "Solana paused".
8. Minor: `H$… HOOP` redundancy; "a H$50" grammar in one quiz question; the analyst-estimate model is a prototype (Person 1's note).
9. Local single-laptop only: no public link was set up (Phase 2i skipped).

## 5. Human TODO
1. **Fund the devnet fee payer:** address `7ezcFoQa2rpEkveycovjCRkQXioeTT8XhKWPDQjKPk5A` (keypair in git-ignored `.solana/` on Khizar's laptop). Use https://faucet.solana.com, Devnet, 1–2 SOL. Check with `cd backend && ../.venv/bin/python -m trading.chain.setup_wallet`, then restart `scripts/demo`. The programmatic airdrop was rate-limited.
2. **Chain-read leaderboard:** after step 1, set `SOLANA_PORTFOLIO_PROGRAM_ID=9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp` in `.env` (Person 2 deployed it). Then confirm `GET /trading/leaderboard?source=chain` answers. Untested with the season engine.
3. If the demo runs on another laptop, it needs its own funded fee payer (or copy `.solana/` privately; never commit it).
4. **Confirm the data licence** for the SportsDataverse ESPN box-score release and decide whether committing `data/runtime/` is OK for a public repo (otherwise `git rm -r data/runtime` and use `scripts/setup_data --rebuild`).
5. No keys were found in history; nothing to rotate.
6. Gemini / ElevenLabs keys are only needed if Coach Hoops (skipped) is built.

## Skipped (time limit; nothing removed)
- Phase 2: (d) shorts and 3x leverage with margin calls and the danger-zone tutorial; (e) report card; (f) graded challenges on the real market with account restore; (g) glossary "?" tooltips across the trading UI; (h) Coach Hoops (Gemini) and ElevenLabs voice; (i) projector-mode wiring, sirens, public-link guide.
- Phase 3: README screenshots and architecture diagram, docs/DEMO.md, docs/DEVPOST.md.
- Testing: full-season simulations and benchmarks were not run (by instruction); one tutorial was not clicked through by hand this round (the learn-mode/midnight versions were verified earlier by their authors).

## 6. Suggested next tasks
- **Person 1 (Jonathan):** decide whether advanced trading (shorts/3x) can be enabled with the season engine; check the injury-event headlines for any name-matching gaps (`/market/events`); optional: intra-day report timing for an even earlier warning.
- **Person 2 (Riccardo):** fund the fee payer and verify receipts and the chain-read leaderboard live (TODO 1–2); then enable margin calls against the season engine with Person 1.
- **Person 3 (Eshan):** projector mode and the header toggle; place `GlossaryTerm` "?" tips on ticket and stock-card jargon; tidy the `H$… HOOP` unit labels; README screenshots.
- **Person 4 (Khizar):** report card (four grades from trades + equity history via Person 2's `equity_history`); the danger-zone tutorial once shorts are on; docs/DEMO.md and DEVPOST.md; Coach Hoops if time allows.

## 7. How each teammate syncs onto main without losing work

Commit or stash local work first: `git stash push -u -m "before main sync"` (restore later with `git stash pop`).

All your branch's commits are already in main, so a fast merge brings you up to date:

```sh
git fetch origin
git switch <your-branch>            # person-1-tasks, person2branch, frontend, person4-learning, learn-mode, backend
git merge origin/main               # fast-forward or a clean merge; your old commits are already in main
git push origin <your-branch>
```

If you'd rather work on main directly from now on:

```sh
git fetch origin
git switch -c my-next-feature origin/main
# ... commit ...
git push -u origin my-next-feature   # then open a PR into main
```

If you had unpushed commits on an old branch, `git merge origin/main` keeps them; resolve any conflicts in favour of main for files listed in D2/D18 and re-apply your change on top. Nothing on the archive tags is ever deleted.
