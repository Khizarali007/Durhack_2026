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

---

## Section 2: Proposed / guessed — needs confirmation before wiring

| Item | Assumed behaviour | Owner |
|------|------------------|-------|
| Market tick WebSocket endpoint | `MARKET_WS_PATH = ws(s)://<same-origin>/trading/ws` (PROPOSAL) — no such endpoint confirmed from any branch | Person 1 |
| Candle history endpoint | `GET /trading/candles/{symbol}?timeframe=1m\|5m\|1h\|1d` (PROPOSAL) — not in router.py | Person 1 |
| Player universe (300 symbols) | 12 confirmed from `fake_market.py`; 288 generated from 2024-25 rosters | Person 1 |
| `GET /trading/players` | Assumed endpoint returning `Player[]` — not in router.py | Person 1 |
| Leaderboard endpoint | `GET /trading/leaderboard` — not found until P2-17 (G3) | Person 2 |
| Order quote estimate | `POST /trading/orders/quote` — P2-12 (G2), not yet built | Person 2 |
| Short / cover, leverage | No backend shapes anywhere yet — P2-14, P2-15 (G3) | Person 2 |

---

## Switching from mock to real

Set `VITE_USE_MOCKS=false` in `frontend/.env.local`. REST calls will hit `/trading/*` on `VITE_API_TARGET` (default `http://localhost:8000`) and the WebSocket will connect to `MARKET_WS_PATH`. With no backend running, connections will fail gracefully — the app must not crash.

For Person 4's learning WebSocket, set `VITE_LEARNING_TARGET` (default `http://localhost:8001`).
