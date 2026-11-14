# API Assumptions

This document records which API shapes and endpoints are confirmed from actual branch code vs. which are proposed/guessed and need sign-off.

---

## Section 1: Confirmed from team branches

| Shape / endpoint | Source |
|-----------------|--------|
| `SessionOut`, `MeOut`, `OrderIn`, `OrderOut`, `FillOut`, `PortfolioOut`, `PositionOut` | `origin/person2branch:backend/trading/router.py` |
| `Player`, `MakerQuote`, `Quote`, `MarketTick` | `origin/person2branch:backend/trading/market_contract.py` |
| Buy-chunk loop, 400/409 error codes, fee calc (Decimal ROUND_HALF_UP 0.10%) | `origin/person2branch:backend/trading/orders.py` |
| Clock constants (12×, 0.5s, FILL_CHUNK=10, MAKER_STARTING_SHARES=150, spreads 2/2.5/3%) | `origin/person2branch:backend/trading/fake_market.py` |
| Auth endpoints (signup, login, guest, logout) | `origin/person2branch:backend/trading/router.py` via P2-07 ticket |
| Trades: `GET /trading/trades?since_t=&symbol=&limit=` | `origin/person2branch` via P2-06 ticket |
| Open orders: `POST /trading/orders/open`, `GET /trading/orders/open`, `DELETE /trading/orders/{id}` | `origin/person2branch` via P2-11 ticket |
| Solana receipt: `GET /trading/orders/{id}/receipt` | `origin/person2branch` via P2-09 ticket |
| `Tick`, `MarketEvent` shapes | `origin/person4-learning:docs/person4-interfaces.md` |
| Person 4 WebSocket: `ws://localhost:8001/learning/ws?user_id=<id>[&symbols=A,B]` | `origin/person4-learning:docs/person4-interfaces.md` |
| Backend contracts overview | `docs/backend-contracts.md` (checked in) |

The endpoints above that are only "via ticket" exist as paths, but their request and response **shapes** are not built. The frontend's guesses for them are in Section 3.

---

## Section 2: Proposed / guessed market endpoints (Person 1)

| Item | Assumed behaviour | Owner |
|------|------------------|-------|
| Market tick WebSocket endpoint | `MARKET_WS_PATH = ws(s)://<same-origin>/trading/ws` (PROPOSAL) — no such endpoint confirmed from any branch | Person 1 |
| Candle history endpoint | `GET /trading/candles/{symbol}?timeframe=1m\|5m\|1h\|1d` (PROPOSAL) — not in router.py. Candle `time` must be the **start of its bucket** in UTC seconds, oldest first, with the still-forming candle last | Person 1 |
| Player universe (300 symbols) | 12 confirmed from `fake_market.py`; 288 generated from 2024-25 rosters | Person 1 |
| `GET /trading/players` | Assumed endpoint returning `Player[]` — not in router.py | Person 1 |
| `Player.position` | Optional string (`Guard` / `Forward` / `Center`). Not in `market_contract.py`. The UI hides it when absent | Person 1 |
| Event history | None assumed. The UI only knows events it has seen on the stream since the page loaded, so chart markers and the headline ticker start empty after a refresh | Person 1 |
| `MarketEvent.impact` / `.storm` | `impact` is the fractional fair-value shift, `storm` a volatility multiplier that does **not** scale the impact (per `person4-interfaces.md`). The mock used to multiply them; it no longer does | Person 1 |
| Radar state | Derived in the frontend from events: `injury` = storm for 30 market minutes; `early_warning`, `hot_streak`, `trade_rumour` = cloudy for 10. No radar message assumed | Person 1 |
| Director / scenario API | None exists. `pauseMarket`, `resumeMarket`, `resetMarket`, `playScenario('wemby_storm')` work on mocks only and return `{ok:false, detail:"not available"}` against the real backend | Person 1 |

---

## Section 3: PLANNED trading features — shapes guessed, confirm with Person 2

Every function below is marked `// PLANNED: shape guessed, confirm with Person 2` in `frontend/src/api/rest.ts` and has a mock in `frontend/src/mocks/`. TypeScript shapes are in `frontend/src/api/types.ts` under the PLANNED banner. The four built endpoints (session, me, orders, portfolio) are unchanged; the only additions to them are **optional** fields.

| `src/api` function | Guessed endpoint | Guessed shape | Mock behaviour |
|---|---|---|---|
| `getOrderQuote(symbol, side, qty, leverage?)` | `POST /trading/orders/quote` | `OrderQuote {symbol, side, qty, leverage, fillable_qty, best_price\|null, mid\|null, est_avg_price\|null, notional, spread_cost, slippage, fee, total, margin_required, cash_short, makers_short}` | Runs the same 10-share chunk walk as a real fill on a copy of the makers, so the estimate equals the fill if no tick lands in between. `spread_cost` = \|best − mid\| × qty, `slippage` = \|avg − best\| × qty, `fee` = 0.10% half-up per chunk |
| `placeOpenOrder({symbol, side, qty, type, price})` | `POST /trading/orders/open` | `OpenOrder {order_id, symbol, side:'buy'\|'sell', type:'limit'\|'stop', qty, filled_qty, price, status:'open'\|'filled'\|'cancelled'\|'rejected', created_t, updated_t, reason\|null}` | Checked on every tick: limit buy fills when ask ≤ limit, limit sell when bid ≥ limit, stop sell fires when bid ≤ stop and then sells at market. Stops are sell-only. 422 if a stop is at or above the bid, 400 if cash or shares are short |
| `getOpenOrders()` | `GET /trading/orders/open` | `OpenOrder[]` (status `open` only) | |
| `cancelOrder(id)` | `DELETE /trading/orders/{id}` | the cancelled `OpenOrder` | 404 if it already filled or was cancelled |
| `getTrades()` | `GET /trading/trades` | `Trade[]` newest first: `{trade_id, order_id, symbol, side, qty, price, fee, t, reason:'market'\|'limit'\|'stop'\|'liquidation', realised_pnl\|null, receipt}` | **One row per order execution**, with its 10-share chunks averaged, not one row per chunk |
| receipts on `Trade.receipt` | `GET /trading/orders/{id}/receipt` + socket | `Receipt {status:'settling'\|'confirmed', explorer_url, confirm_ms\|null}` | Confirms about 600 ms after the fill. The Explorer URL is a fake devnet placeholder (`.../tx/MOCK-NOT-A-REAL-TX-...`) |
| `signup(username, password)` | `POST /trading/signup` | `SessionOut` | 422 for a bad username (3–16 letters, numbers, underscores) or password (< 6 chars), 409 if taken. Users live in `sessionStorage` |
| `login(username, password)` | `POST /trading/login` | `SessionOut` | 401 "wrong username or password" |
| `guestSession()` | existing `POST /trading/session` | `SessionOut` | same as `createSession` |
| `logout()` | `POST /trading/logout` | none | clears the stored token |
| `getLeaderboard()` | `GET /trading/leaderboard` | `LeaderboardRow[] {rank, username, equity, return_pct, verified, is_me}` | 20 bots whose equity drifts with market time, plus you. `verified` for you = at least one confirmed receipt |
| `placeMarginOrder({symbol, side, qty, leverage?})` | `POST /trading/orders` with `side: buy\|sell\|short\|cover` and `leverage: 1\|3` | `OrderOut` (its `side` type is widened to include `short`/`cover`) | see margin rules below |
| `getEquityHistory()` | `GET /trading/equity/history` | `EquityPoint[] {t, equity}` oldest first | sampled once per market minute |
| `PortfolioOut.margin` (optional) | on `GET /trading/portfolio` | `MarginStatus {gross_exposure, margin_exposure, margin_used, margin_equity, maintenance, level\|null, state:'safe'\|'warning'\|'margin_call'}` | see margin rules below |
| `PositionOut.side`, `.leverage`, `.margin` (optional) | on `GET /trading/portfolio` | `'long'\|'short'`, number, number | short positions have negative `qty` and negative `market_value` |

### Socket messages (PLANNED, assumed to arrive on `/trading/ws`)

| Message | Shape | Used for |
|---|---|---|
| `order_update` | `{type, order: OpenOrder, result: OrderOut\|null}` | open orders updating live, "limit filled" / "stop-loss fired" toasts |
| `receipt` | `{type, trade: Trade}` — sent once as `settling`, again as `confirmed` | receipt toast, History tab |
| `margin_call` | `{type, t, symbol, side:'sell'\|'cover', qty, price, realised_pnl, detail}` | margin-call banner |
| `market_reset` | `{type, t}` | mock only: the director rewound the clock |

Subscribe with `subscribeOrderUpdates`, `subscribeReceipts`, `subscribeMarginCalls` from `src/api`.

### Mock margin rules (all PLANNED, nothing here is agreed)

- A position locks `margin = entry notional / leverage` in cash. 1x long is a normal buy. A short locks its notional (or a third at 3x).
- `margin_used` = Σ exposure / leverage. `maintenance` = 30% of leveraged-or-short exposure.
- `state`: `warning` when `margin_equity < 1.5 × maintenance`, `margin_call` when `margin_equity < maintenance`. On a margin call the mock closes the largest leveraged or short position at market and emits `margin_call`.
- **Deviation from the brief, on purpose:** the test uses `margin_equity` (locked margin + unrealised P&L of the leveraged and short positions only), not whole-account equity. With 450 shares per stock a fresh 100,000 HOOP account can never get its total equity under 30% of one position, so the demo beat "3x position margin-called" could not happen. With margin equity, a 3x long is liquidated after roughly a 5% fall and a 1x short after roughly a 54% rise. A fresh 3x position therefore sits in `warning` from the start. Person 2 to confirm the real rule.
- Margin is marked at the bid/ask midpoint and a breach must last two ticks, so bid/ask bounce alone does not liquidate.
- One position per stock: you cannot be long and short the same player, and a stop-loss cannot protect a short.

---

## Switching from mock to real

Set `VITE_USE_MOCKS=false` in `frontend/.env.local`. REST calls will hit `/trading/*` on `VITE_API_TARGET` (default `http://localhost:8000`) and the WebSocket will connect to `MARKET_WS_PATH`. With no backend running, connections will fail gracefully — the app must not crash.

For Person 4's learning WebSocket, set `VITE_LEARNING_TARGET` (default `http://localhost:8001`).
