# Backend contracts as found on the team repo (14 Nov 2026, evening)

Read from `origin/person-1-tasks`, `origin/person2branch`, `origin/person4-learning`. `main` and `backend` are empty. To check anything against the source, run `git fetch origin` then `git show origin/<branch>:<path>`. Never merge or check out those branches, and never edit their files.

## Currency update — 15 November 2026

The current interface starts at **H$100**. Wire/storage monetary numbers retain
the legacy accounting denomination: **1,000 API units = H$1**; one stored cent
is H$0.00001. All formulas, bots, price ticks and signed receipt payloads remain
unchanged. The frontend converts values for display and converts typed prices
back before submitting orders. The historical HOOP references below describe
API accounting units, not the current displayed H$ denomination.

## Conventions the whole team agreed
- Market time `t` = epoch seconds (float). The market runs 12x real time (1 market minute = 5 real seconds).
- Money crosses the API as floats in HOOP (2 dp). The backend stores integer cents internally.
- Players are addressed by `symbol` (string, e.g. `SGA`). Quantities are whole shares.
- Users start with 100,000 HOOP. Fee = 0.10% of notional.
- Sides: `buy | sell | short | cover`. Fill reasons: `market | limit | stop | liquidation`.

## Person 2 REST (built, `origin/person2branch`, backend/trading/router.py)
Base path `/trading`. Auth = `Authorization: Bearer <token>`. Missing or bad token gives 401.

| Method + path | Body | Returns |
|---|---|---|
| `POST /trading/session` | none | 201 `{token, user_id, cash}` (guest account with 100,000 HOOP) |
| `GET /trading/me` | none | `{user_id, username: string or null, is_guest, cash}` |
| `POST /trading/orders` | `{symbol, side: "buy"/"sell", qty: int 1..10000}` | OrderOut (below) |
| `GET /trading/portfolio` | none | PortfolioOut (below) |
| `GET /trading/health` | none | `{status, component, market_time, players, tables}` |
| `GET /trading/debug/quote/{symbol}` | none | Quote (below). Debug only. |

**OrderOut:** `order_id, status ("filled" or "partially_filled"), symbol, side, requested_qty, filled_qty, average_price, total_fee, cash, position_qty, fills[{trade_id, qty, price, fee, t, counterparty}], reason (string or null)`.
Errors: 400 not enough cash or shares, 404 unknown symbol, 409 market makers could not fill any of it, 422 bad input, 401 no token.
Buys are sent to the engine in 10-share chunks, so big orders slip. Each player has 3 market makers with 150 shares each (450 in total), so buying more than 450 comes back `partially_filled` with a `reason`. That is a deliberate demo moment.

**PortfolioOut:** `user_id, cash, positions_value, equity, starting_cash, total_pnl, total_pnl_pct, unrealised_pnl, realised_pnl, fees_paid, positions[{symbol, name, team, qty, avg_cost, last_price, market_value, unrealised_pnl, unrealised_pnl_pct, weight_pct}]` (largest holding first; `weight_pct` is the share of equity, which Composition panel can use).

## Person 2 REST (PLANNED, not built, shapes not final)
`GET /trading/trades` · `POST /trading/signup` · `POST /trading/login` · `POST /trading/guest` (all return `{token, user_id, cash}`) · `DELETE /trading/orders/{id}` · `GET /trading/orders/open` · `POST /trading/orders/quote` (estimate before confirm: best price, spread, slippage, 0.10% fee) · `GET /trading/leaderboard` · `/trading/ws` (per-user fills, order fires, receipt status) · short/cover, margin status, equity history, performance payouts, Solana receipts (`receipt_status` pending then confirmed or failed, `receipt_signature`, `receipt_confirm_ms`).
Limit and stop-loss orders live in Person 2's layer, because the market engine has no resting order book.

## Market shapes (`backend/trading/market_contract.py`)
- **Quote:** `{symbol, bid: number or null, ask: number or null, last, fair_value, makers[{maker_id: "MM1"|"MM2"|"MM3", bid or null, ask or null, shares}]}`. **bid and ask can be null** (a maker with no cash cannot bid, one with no shares cannot ask). The UI must handle that. `last` is the price. Price = the last executed trade.
- **MarketTick** (engine event, every 0.5 s real time): `{t, quotes: {symbol: Quote}}`.
- **BotTradeSummary** (once per market minute): `{minute_t, count, total_volume, trades[]}`. For Solana bundles, probably not needed in the UI.
- **Player:** `{player_id, symbol, name, team (abbreviation), start_price}`.

## Person 1 (no API yet, `origin/person-1-tasks`)
- Status: prototype scripts, not exposed over HTTP. Their next step is the shared contract and a backend API.
- Data: SQLite `player_games_2024_25.sqlite` (git-ignored) with 32,610 player-game rows, 580 players, 30 teams, 22 Oct 2024 to 13 Apr 2025 (174 calendar days). **This differs from the plan's 300 players and two-month window.** Table `player_games` has `game_date, player_id, player_name, team_abbreviation, opponent_team_abbreviation, minutes, points, ..., game_score, home_away, team_score, opponent_team_score`.
- Their prototype daily output columns: `date, player_id, player_name, team, fair_value, open, high, low, close, change_pct, volume, trades, games_revealed, game_score, news, best_bid, best_ask`.
- Opening price = `max(10, 5 x expected Game Score)` HOOP. Fair value = 5 HOOP x projected Game Score x injury factor.
- **No symbols yet.** Players are keyed by ESPN `player_id`. Person 2's fake market uses placeholders like `SGA, JOKIC, TATUM, WEMBY, ANT, FOX`.
- **Nobody has defined a frontend endpoint for "all players' ticks" or for candle history.** This is the biggest open gap (see questions at the bottom).

## Person 4 (`origin/person4-learning`)
- Dev server `http://localhost:8001` (CORS allows only `:5174` in their dev app). After merge it's the main backend.
- REST: `GET /learning/missions`, `POST /learning/missions/start {user_id, mission_id}`, `POST /learning/missions/stop {user_id}`, `GET /learning/missions/status?user_id=`, `GET /learning/missions/result?user_id=`, `GET /learning/glossary` (returns `[{term, short}]`), `GET /learning/scenarios/{id}`.
- WebSocket `/learning/ws?user_id=<id>[&symbols=A,B]`. Server sends mission messages, plus 2 Hz ticks `{type:"tick", t, symbol, price, fair_value, best_bid, best_ask}` **for the current mission's symbols only**.
- `user_id` must be the same id Person 2's `/trading/session` returns.
- **Components (plain JSX, `origin/person4-learning:frontend/src/learning/`):** `MissionPanel`, `MissionDebrief`, `useMission({apiBase, userId})`, `useLearningSocket`, `learning.css` (import once). They will land at `frontend/src/learning/` (NOT `src/components/learning/`). Our app is TypeScript, so enable `allowJs` or add a `declare module` shim.
- Theming: they read `data-theme="light"` and `data-projector="true"` on any ancestor, and `--hs-learn-*` CSS variables. Our `useTheme` already sets `data-theme` on `<html>`, so use the same `data-projector` attribute for projector mode.
- **Not built yet by Person 4:** Composition panel, report card, glossary drawer, "?" tooltips (only the `/learning/glossary` endpoint exists).

## Integration facts that affect the frontend
- Person 2's `main.py` has **no CORS middleware yet**. Use a Vite dev proxy for `/trading` and `/learning` (with `ws: true`) to `http://localhost:8000`, and call same-origin paths.
- Person 4's `apiBase` can be `''` when proxied.
- Backend run command: `uvicorn main:app --app-dir backend --reload` (port 8000).

## Questions to send to the team
1. **Person 1:** which endpoint streams all quotes to the frontend (`/market/ws`?), and what is the candle-history endpoint? Please confirm shapes: per-symbol quote `{t, symbol, last, fair_value, bid, ask, makers}` at 2 Hz for all stocks, and candles `{t, open, high, low, close, volume}`.
2. **Person 1:** the symbol for each player, and the final player universe: 580, or the top 10 per team (300)?
3. **Person 1:** is intraday history generated by the backend (as in the plan's `generate_history.py`), or do I generate it? Your data is daily only.
4. **Person 1:** where do events, early warnings, radar state and final-whistle lines appear for the frontend, and in what shape? Person 4's `MarketEvent` has `t, symbol, kind, headline, impact, storm`.
5. **Person 2:** confirm the planned endpoint shapes above, especially `/trading/ws` messages, `orders/quote`, and the open-orders and cancel endpoints.
6. **Person 2:** where does the leaderboard's chain-verified flag come from?
