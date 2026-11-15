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

## D23. Accounts survive restarts; portfolios restart with the season (Part 1)
- **Decision:** `backend/trading/identity.py` mirrors identity only (user id, username, scrypt password hash, SHA-256 session-token hashes, devnet wallet) into `data/accounts.sqlite` (git-ignored, `ACCOUNTS_DB_PATH` overrides; memory under pytest). Every fresh season trading DB (backend start or rewind) restores all accounts with H$100,000 and flags them; `/trading/me` returns `season_reset: true` until `POST /trading/me/season-reset/dismiss`. The UI shows "The season was reset. Your account is safe; your portfolio restarted with H$100,000."
- **Options:** persist the whole trading DB to a file (rejected: the season engine's maker inventory and share ownership live in memory, so a persisted portfolio would disagree with the market after a restart); keep everything in memory (rejected: logins lost on every restart).
- **Changed test:** `market/tests/test_integration.py` used to assert that a rewind invalidates the old token (401); it now asserts the account survives with a fresh portfolio.
- **Revert:** remove `identity.use_store(...)` in `main.py`.

## D24. No silent guest; `/login` is the way in
- **Decision:** the app no longer creates a guest on load. Without a session the shell redirects to `/login` (Play as guest, Log in, Sign up). A backend that's down keeps the stored token and retries every 2 s ("Connecting to the market…"); only a rejected token (401/403) sends you to `/login`. New `POST /trading/upgrade` turns a guest into a named account, keeping its portfolio ("Save your progress" in the header menu).
- **Revert:** call `joinAsGuest()` from `AppShell` when there's no session.

## D25. Blocking onboarding replaced by an optional welcome card
- **Decision:** `Onboarding.tsx` (which hid the whole app until a purchase) is deleted. Home shows a dismissible welcome card for brand-new players: two sentences, "Take the 2-minute tour" (starts the Welcome tutorial) and "Make your first investment" (the same quick buy, restyled with tokens). Dismissal is remembered per account in localStorage.
- **Also:** the season bar and payout ledger are rewritten with the design system (no hardcoded colours, readable code) behind a new `src/api/season.ts`; payment and season-reset notices share one `Notice` component; the header gains a user menu with projector mode.

## D26. Readable tickers (audit #4)
- **Decision:** `market/engine.py make_tickers`: the 12 famous aliases first, then the surname (max 8 letters, accents and suffixes like Jr./II stripped), then first initial + surname, then a number. Deterministic by ESPN player id, so a ticker never changes between runs. All 580 are unique (Kyle Lowry → LOWRY, Seth Curry → SCURRY).
- **Revert:** restore `ALIASES.get(name, f'NBA{pid}')`.

## D27. Chart data flow (Part 2)
- **Decision:** one point per market day. Every time maps to the end of its day (`dayKey`), the same timestamp as the day-close history point. History loads once per selection and season session (`GET /market/history`); live quotes call `series.update()` on today's point; a reset or a jump of more than a day reloads the closes after 1.5 s. Zoom is never reset by data, only by 1M / 3M / Season / Fit. Compares switch the price scale to % change and hide the dashed estimate. Colours come from new `--hs-color-chart-1..4` tokens (no green or red, which mean price moves). Early warnings (●) and storms (▼) are v5 series markers from `GET /market/events` plus live events.
- **Sparklines:** 30 daily closes for all players from the new `GET /market/sparklines`, fetched once per market day, plus the live midpoint (the old ones were 30 seconds of tick noise, empty after each reload).
- **Revert:** `git revert 8a0c460`.

## D28. Season review = deterministic insights engine + optional Coach Hoops (Part 3)
- **Decision:** `backend/learning/insights.py` is a pure function from a season (fills grouped into orders, payouts, equity, official alerts, daily prices, game payouts) to a summary strip, review cards and a plain-English timeline. Eleven fixed rules (each documented with its threshold at the top of the file): concentration, bought into a storm, panic sell before a recovery, sold before a payout cutoff, overpaid (spread + slippage + fees > 1% of an order ≥ H$500), churning, held an Out player 5+ days, plus praise for diversification, holding through noise, buying before a hot stretch and selling on an early warning. Cards show the H$ impact, what to do next time, and a link to the tutorial or glossary term. `season_source.py` builds the input from the trading DB and the engine, so rivals use the same rules.
- **Why deterministic:** judges and players must be able to check every claim; the model never invents facts.
- **Coach Hoops:** `POST /learning/coach` sends only rule ids, titles, H$ numbers and lessons (no usernames, ids or keys) to Gemini (`GEMINI_API_KEY`, `google-genai`, model `GEMINI_MODEL` default `gemini-2.5-flash`, 8 s timeout), cached per subject per market day. With no key, or on any error or timeout, it returns template bullets built from the same insights. The UI says which one answered and "not financial advice".
- **Activity page:** now "Your season review": summary strip (return, payouts, fees, best/worst trade, max drawdown, grade, biggest lesson), review cards, Coach Hoops, timeline, lessons completed (real-time, from the tour store, so listed separately from market time), payout ledger, and every fill with its Solana receipt in a collapsible section.

## D29. Practice rivals = five real market bots with invented names (Part 4)
- **Decision:** `market/rivals.py` picks the first bot of each style (`value-01` → Maya, Value Hunter; `momentum-01` → Theo, Momentum Chaser; `contrarian-01` → Priya, Contrarian; `news-01` → Sam, Headline Trader; `risk_averse-01` → Jordan, Safety First). They're labelled "Simulated trader" everywhere, with initials avatars in token colours and no photos. The engine records only these five: every trade they make (via the existing `trade_observer`), every payout they receive (in `_pay_day`) and one equity point per day close. A 12-day smoke run: 16–395 trades each, H$320–2,900 in payouts, ledger exact.
- **Funding:** a fixed-pool bot starts with about H$10,000 cash and spends it within days, so each rival is topped up to H$100,000 cash at market creation, before `_initial_cash` is taken, so `check_ledger` stays exact. This adds H$450k of buying power to a H$3m bot pool, still capped by the bots' H$5,000-per-player limit and 45 orders a day.
- **Opening shares:** every bot starts with about 2 shares of each player. Rival reviews use their real holdings (`holdings_qty`) and seed their cost basis at opening prices (`opening`), so equity, best/worst trade and composition are right. Their return is from their opening equity (cash + opening shares), shown as % so it compares fairly with a H$100,000 player.
- **APIs:** `GET /learning/rivals` (ranked list including you, with "vs you" in % points), `GET /learning/rivals/{id}` (review, daily equity vs yours, composition, top holdings, key moves), `GET /learning/rivals/{id}/compare` (plain-English differences from both reviews and the lesson to try), and `POST /learning/coach {rival_id}`. The leaderboard mixes the rivals in, flagged "Simulated", so a solo player never sees an empty board.
- **Revert:** remove `self.rivals = RivalTracker(...)` and its four hooks in `market/engine.py`.

## D30. Projector mode and the Director page (Part 5 audit)
- **Decision:** projector mode (header user menu) now overrides the font-size scale (+25–30%) and raises text-secondary and border contrast in both themes via `[data-projector="true"]` in `tokens.css`. The Director page is rebuilt on the design system and points the demo at Activity and Friends after the storm.
- **Revert:** delete the projector block at the end of `tokens.css`.
## 15 November — change-tests gameplay review

- **Default round: one historical week.** Daily controls remain available, but the main action produces a before/after report. Holding is a valid decision. Reconsider the duration after timing a judged demo.
- **One score: estimated liquidation value.** Retain the accepted formula (cash + net sale proceeds + pending rights); quoted equity is secondary. Paid payouts are never added twice.
- **Honest attribution.** Per-player outcome includes realised trades, remaining sale proceeds, acquisition cost, fees, paid dividends and pending rights. Sold players remain in results. Forecast/report changes are observations, not asserted causes of price movement.
- **Opening allocations: approximately 5%, 10%, 25%.** Shares remain whole units and the execution preview is authoritative. No forced diversification, auto-rebalancing, scripted profitable trades or future-season knowledge.
- **Solana: forward replay is causal; rewind is a reset.** Allow forward replay while existing asynchronous receipt workers continue. Block backward replay when receipt/portfolio writes are enabled. UI does not claim that local completion implies chain confirmation.
- **Weekly report scope:** captures the account immediately before a round and after the requested target. Trades between rounds affect the live/final score, but precede the next round's baseline. The last report is immutable and stored per browser tab, account and market session, not a multi-device history service.

## 15 November — interface simplification

- Replace promotional copy with functional labels and one Next week action. Keep the accepted liquidation score and market rules unchanged.
- Put market depth, performance inputs, detailed attribution and replay settings behind disclosure. Active tutorials open the controls they teach.
- Keep the buy/sell action pinned outside the scrollable order details.
- Use brief entry/feedback animations, real replay progress and transient payment notifications. No invented chart movement or interpolated account balances; respect reduced-motion settings.

## 15 November — continuous replay and diversified setup

These choices supersede the weekly-stop and single-purchase setup decisions above.

- **Continuous clock:** Start season begins normal playback; Play/Pause remains explicit. Week boundaries generate reports without pausing, navigating or forcing a trade. Advanced date jumps still stop at the requested date.
- **Server reports:** capture account snapshots every seven days from the season start, plus the final shorter interval. Steps clamp to report boundaries so acceleration cannot skip a report. Reports survive browser refresh/closure, belong to the authenticated account, and clear with the in-memory market on rewind/server restart. No permanent history or cross-server persistence is claimed.
- **Report accounting:** include purchases and sales within the interval, fees, paid dividends and changes in pending rights. The first baseline is registered while setting up the portfolio; later reports use the previous boundary. Late joiners receive an initial partial week. Reports have no market impact.
- **Opening tutorial:** require three meaningful player positions (about 5% of initial cash each), at least two teams, and no position above 50% of invested market value. Cash is excluded from concentration. A 2% tolerance on the minimum accounts for whole shares; this is a teaching target, not a risk guarantee or a continuing trading restriction.
- **Setup cash:** cap previewed acquisition value per player at 25% of initial cash during setup, with 5/10/20% presets. This leaves room to add other players. After setup, normal trading rules apply. This client-side tutorial gate is not an anti-cheat boundary.
- **Resume:** unfinished setup persists locally per account. Existing accounts with trades are not forced through the new setup. Rewinds create fresh accounts and require setup again. Reconsider server-side onboarding persistence for a multi-device product.

## 15 November — H$100 denomination

- **Uniform unit change:** 1,000 existing API accounting units now represent H$1. Starting funds display H$100; share values, bot wealth, payouts, fees and portfolio scores have the same economic ratios. Quantities, returns and model coefficients are unchanged.
- **Keep the integer ledger:** do not divide stored cents and round away small dividends/fees, migrate historical data or rewrite signed Solana receipts. Existing receipts retain their original accounting denomination. Current UI and typed-price boundaries perform the conversion; raw API numbers deliberately stay compatible.
- **Precision:** five decimal places preserve one original ledger cent. Forecast payouts show six decimals; cash and totals show up to five. Limit/stop prices accept five decimals and convert back once before validation/submission. Charts use scaled numeric series as well as scaled labels.
- **Content:** starting allocations become H$5/H$10/H$20 and the payout coefficient is H$0.00002 per positive Game Score point. Update glossary, challenges and tours together.
- **Reconsider:** if the team needs an API explicitly denominated in displayed H$, version that contract and its Solana encoding together. Do not silently divide the current API or scale it twice in clients.


## 15 November — neutral roster builder and larger shares

- **Selection:** remove featured names and automatic Jokic selection. Browse all 580 players, sorted by current buy price, with name/team/ticker search, team filtering and price/name sorting. No future-season winners or manual player recommendations appear in setup. Six rows per page keep the laptop layout readable.
- **Fantasy presentation:** show budget and empty roster slots first. Selecting a player opens a compact purchase panel; successful trades return to the roster with confirmation. Existing picks can be sold through the same panel, at actual bids with fees, rather than silently refunded. Prices in the list round to two displayed decimals; the ticket keeps exact executable precision.
- **Economics:** shares represent 10× the previous payout claim. Multiply the live valuation coefficient by ten so present values, expected dividends and settled dividends stay consistent. Human starting cash remains H$100; quantities are not automatically multiplied or divided. Bot cash, dealer cash, position limits and the price-based attention reference also scale tenfold to keep institutional liquidity comparable. Share supply stays fixed. Keeping dividends unchanged would slash yield and conflict with the existing valuation formula; that alternative was rejected.
- **Setup:** retain the agreed 3-player / 2-team / 50%-concentration gate and 25% acquisition cap. Allocation presets are H$10/H$15/H$20: the old H$5 button could round below the qualifying minimum with more expensive whole shares.
- **Session boundary:** use a fresh market for the changed economics, never silently revalue an existing running server or rewrite stored receipts. The API/display denomination still maps 1,000 accounting units to H$1. The old frontend-only mock is a separate development fixture, not this historical live engine.
- **Reconsider:** a true five-position fantasy lineup would need reliable player-position data and explicit roster limits. Current holdings remain investment positions; no positions or sporting constraints are invented.


## 15 November — fairer priors, full names and ESPN portraits

- **Expectations:** replace pooled league priors with the equal-player previous-season mean for shrinkage and historical newcomer mean for no-history players. Recent-season weight rises from 45% to 65%, based on an earlier-season development check. No universal price discount or forced win/loss quota. Evidence and limitations: [opening-value review](OPENING_VALUE_REVIEW.md).
- **Presentation:** replace bespoke ticker labels with full player names throughout user-facing market and trading views. Retain internal IDs for trade/receipt/link compatibility. Equal row/photo dimensions and a two-line watchlist prevent long names squeezing out prices.
- **Photos:** the user's explicit request supersedes the earlier initials-only design rule. Use ESPN-hosted portraits by existing ESPN athlete ID, with lazy loading and initials on failure. Keep NBA team logos out, avoid copying portraits into the repo, and acknowledge current uniforms may differ from historical team labels.
