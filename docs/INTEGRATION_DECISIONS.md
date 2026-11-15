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
