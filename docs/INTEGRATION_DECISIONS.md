# Integration decisions

Running log for `integration/final` → `main` (15 November 2026). Each entry gives
the decision, the options considered, why, and how to revert. Archive tags
`archive/2026-11-15/<branch>` mark every remote branch tip before integration.

## D1. Base branch and real merges
- **Decision:** start from `merged-version-midnight-pizza` (Person 1 + Person 2 merged, season gameplay) and do a real `git merge` of `learn-mode` (which already contains `frontend` and `person4-learning`).
- **Options:** rebuild from `frontend` and re-apply the season work; merge everything with `-X theirs`.
- **Why:** midnight-pizza is the only branch where the real backend and the UI run together. A real merge makes every team branch an ancestor, so future syncs don't re-conflict (verified with `git merge-base --is-ancestor` for all 9 branches).
- **Revert:** `git reset --hard archive/2026-11-15/merged-version-midnight-pizza` on a scratch branch.

## D2. Conflict rule: season-adapted files win
- **Decision:** all 64 add/add conflicts (frontend, learning UI, content) take midnight-pizza's version.
- **Why:** midnight-pizza imported `frontend` 832f6b7 and `learn-mode` 3b65932 *and then adapted them* to the real backend. learn-mode's versions are the pre-adaptation copies. The diff showed no feature that exists only on the learn-mode side of a conflicted file. Files only learn-mode had (backend/learning, scenarios, Person 4 docs, design refs, learning-sandbox) came in unchanged.
- **Revert:** `git checkout archive/2026-11-15/learn-mode -- <file>`.

## D3. Committed junk removed
- **Decision:** removed the root `node_modules/` (302 files), root `package.json`/`package-lock.json` (a stray install of lightweight-charts and react-router) and `.claude/settings.local.json` (one teammate's local tool permissions). All are now git-ignored.
- **Revert:** `git checkout d5f2c2a~1 -- node_modules package.json package-lock.json` (nothing uses them).

## D4. Secret scan
- **Decision:** scanned the full history of all branches for API keys, private keys and keypair JSON files. **Nothing found.** Keypairs live in git-ignored `.solana/`. `.env.example` documents every variable.

## D5. Runtime data is committed (5 MB), sources stay downloadable
- **Decision:** commit `data/runtime/` with the slimmed box-score SQLite (7 of 57 columns), the opening values and the official injury-report feed. The engine prefers a locally rebuilt `data/<file>` and falls back to the bundle.
- **Options:** download at setup (fragile at a venue, about 120 MB and 580 ESPN requests); commit the full 28 MB SQLite plus CSVs.
- **Why:** a fresh clone must play with no network. The data is factual game statistics (SportsDataverse ESPN releases; the hoopR and sportsdataverse code is MIT) and the NBA's publicly posted injury reports. I couldn't confirm a licence file on the data repo itself, so it is attributed in the README and listed as a human TODO.
- **Revert:** `git rm -r data/runtime` and run `scripts/setup_data --rebuild`.

## D6. One backend, one port (8000)
- **Decision:** `/learning` is mounted in `backend/main.py`. Vite proxies `/market`, `/trading` and `/learning` to one target (`VITE_API_TARGET`, default `http://127.0.0.1:8000`). In demo mode FastAPI also serves `frontend/dist` with an SPA fallback (`SERVE_FRONTEND=0` turns this off). `/demo` (Person 1's browser demo) is kept.
- **Revert:** set `VITE_LEARNING_TARGET` to a separate server; `backend/learning/dev_app.py` (port 8001, mocks) still works for standalone learning development.

## D7. Real MarketAdapter never rewrites the season
- **Decision:** `SeasonMarketAdapter` reads Person 1's live quotes and revealed timeline. `inject_event` and `set_fair_value_shift` are **recorded for the learning layer only** and never move a real price. Person 2's real `TradesAdapter` is wired in. Mocks are kept for tests and the sandbox.
- **Options:** let missions push fair value on the shared market.
- **Why:** every player shares one historical replay. A lesson that bends prices would hand everyone fake profits and contradict "every price is explained" (the same rule midnight-pizza applied to tutorials).
- **Revert:** implement both methods on `LiveMarket` (adjust `m.fair_cents` and call `update_fair`) and call them from the adapter.

## D8. Graded mission definitions moved to `content/graded-missions.json`
- **Decision:** midnight-pizza rewrote `content/missions.json` as lesson copy for the season tutorials. The mission runner's timed-mission definitions (learn-mode's file) now live in `content/graded-missions.json`.
- **Revert:** point `backend/learning/content.py` back at `missions.json`.

## D9. One `backend/requirements.txt`
- **Decision:** merged `requirements-trading.txt` and `requirements-learning.txt`, which were identical apart from Solana and requests. Docs updated.

## D10. WebSocket and session reconnect without reload
- **Finding:** both sockets already reconnect on a timer. The "needs a reload" came from session creation: if the backend was restarting, `ensureGuest` failed once and the shell showed "Reload".
- **Decision:** guest creation retries every 2 s by itself. The shell shows a calm "Connecting to the market…" with a "Try now" button (no page reload). Accounts still reset when the backend restarts, because the season engine uses a fresh in-memory DB (see risks).
- **Revert:** `git revert f82a023`.

## D11. Mock mode kept
- **Decision:** `VITE_USE_MOCKS=true` still builds and runs for frontend-only work; the default is the real backend.

## D12. Currency: HOOP, shown as `H$`
- **Decision:** one currency name, HOOP, formatted by the single helper `formatHOOP` as `H$1,234.56` (and `-H$12.00`). Copy and content saying "$100,000" or "virtual dollars" now say H$/HOOP; the backend status reports `HOOP (virtual)`.
- **Options:** keep Person 1's "$ virtual dollars" (consistent in midnight-pizza but contradicts the pitch and earlier screens); a bare "1,234 HOOP" suffix (wider table columns).
- **Why:** the pitch and sponsor story use HOOP. The `H$` prefix keeps the familiar money shape and table widths and can never be mistaken for real dollars.
- **Revert:** `git revert 4331363`.

## D13. Bot funding: fixed pool, 300 bots
- **Decision:** demo default `MARKET_BOT_COUNT=300`, `MARKET_BOT_FUNDING=fixed` (bots share the original H$3m pool).
- **Why:** this is the configuration Person 1 tested end to end (a full-season run kept all 580 markets two-sided with cash and shares conserved). `per_bot` multiplies market buying power 10x and is untested in the browser.
- **Revert:** `MARKET_BOT_FUNDING=per_bot` in `.env`.

## D14. Newcomer prior: not activated
- **Decision:** keep the active league prior for players with no NBA history. The candidate CSV stays opt-in.
- **Why:** it changes opening prices for 332 players and was not browser-tested; risk is higher than the benefit for a 3-minute demo.
- **Revert/activate:** regenerate starting values with the candidate prior (see `docs/season-integration.md`) and rebuild `data/runtime/`.

## D15. Demo defaults
- **Decision:** `scripts/demo` uses `MARKET_START_PAUSED=1` (so the first purchase happens before day 1 runs), `MARKET_DAY_SECONDS=60` and `SOLANA_RECEIPTS=off` until Phase 2(a) turns receipts on. Everything can be overridden in `.env`.

## D16. Shorts and leverage stay off in this build
- **Decision:** unchanged from midnight-pizza (`LiveMarket.supports_advanced_trading = False`). Phase 2(d) was out of scope for the time limit.
- **Revert/enable:** set `supports_advanced_trading = True` after testing Person 2's margin monitor against the season engine.

## D17. Composition grade (Phase 2b)
- **Decision:** the backend (`backend/learning/composition.py`) grades the invested basket from player weights: effective holdings = 1/HHI, plus caps on the biggest player and team. Ladder: A ≥ 8 effective, player ≤ 20%, team ≤ 30%; B ≥ 5, ≤ 30%, ≤ 40%; C ≥ 3, player ≤ 50%; D ≥ 1.5; else F. Cash is shown but not graded; shorts count as exposure. `GET /learning/composition` uses Person 2's bearer auth. The panel sits in Person 3's Portfolio mount; a compact chip sits in the account strip.
- **Options:** a client-side grade (rejected: the brief asks for the backend); a volatility-weighted risk score (more realistic, not explainable in one line).
- **Why:** each rung can be explained in one sentence and checked by a test. The one-line reason always names the biggest problem (one player, one team, too few names).
- **Revert:** remove the `composition_router` include in `main.py` and the panel import in `PortfolioPage.tsx`.

## D18. Person 3 files touched during integration
`AppShell.tsx` (reconnect copy), `PortfolioPage.tsx` + `.module.css` (Composition panel; sections no longer squeezed, which fixed the holdings table collapsing), `AccountStrip.tsx` + `.module.css` (5th "Composition" cell; leftover "virtual $" removed), `PlayerCard.tsx` (Radar badge, "Why did it move?" label, `data-tour="stock-why-moved"` restored, unit HOOP), `OrderTicket.tsx` (unit HOOP), `TradesTable.tsx` ("Solana paused"), `DirectorPage.tsx` (storm shortcut on the real backend), `radarInfo.ts` (tooltips), `api/*` (additive: composition hook, `reconnectSession`, `jumpToWembyStorm`, `/learning/` routing in `apiFetch`, radar mapping, reason window).

## D19. Solana receipts: `auto` mode (Phase 2a)
- **Decision:** `SOLANA_RECEIPTS=auto` is the demo default. At startup (once per process) it checks devnet and the fee-payer balance with a 5 s timeout. Receipts start only if both are fine; otherwise `/market/status.receipts_note` explains calmly and trades show "Solana paused". `on` and `off` still force it either way. Person 2's worker already retries with backoff and never blocks a trade.
- **Why:** an unfunded fee payer or flaky venue wifi must never produce a wall of failed receipts on stage.
- **Revert:** `SOLANA_RECEIPTS=off` (old demo behaviour) or `on` (always try).

## D20. Bot-bundle receipts off in the season replay
- **Decision:** bundles are still recorded and hashed for audit, but only sent on-chain with `SOLANA_BOT_BUNDLES=on`.
- **Why:** the replay runs a day per minute, so a "market minute" closes every tick (twice a second): far above devnet's rate limit (about 10 status calls per 10 s) and the fee budget. Human trade receipts are the ones judges see.
- **Revert:** `SOLANA_BOT_BUNDLES=on`.

## D21. Early warnings from the official injury report (Phase 2c)
- **Decision:** when a player's official status changes, the engine publishes an event: Questionable/Doubtful → `early_warning` (radar cloudy), Out → `injury` (radar storm). Events go to the market WebSocket and `GET /market/events`. "Why did it move?" names the report for as long as the status stands. Probable is treated as calm.
- **Privacy:** the player-facing reason is now "Listed out on the official NBA injury report"; the medical reason column is never shown (it previously reached the stock card).
- **Shortcut:** `/director` → "Jump to 19 Feb 2025" (forward jump keeps accounts; measured 47 s). From there: Next day → Wembanyama listed doubtful (early warning, about −0.8%); Next day → ruled out (storm, about −10%).
- **Not changed:** the engine still reveals each day's final report at day close; there is no intra-day timing. The early warning is the real Doubtful listing a day before the Out.
- **Revert:** `git revert d075db0 eea796d`.

## D22. Currency unit labels
- Price blocks show `H$111.11 HOOP` (an `H$` number plus a small HOOP unit label). Slightly redundant, kept because the unit label is part of Person 3's layout; drop the `unit` spans to tidy it.
