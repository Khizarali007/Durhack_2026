# HoopStreet: DurHack 2026

> Cloudy with a chance of margin calls.

An NBA player stock exchange that teaches investing with play money. Every NBA
player is a stock priced in **HOOP** (virtual currency, shown as `H$`). The game is a
replay of the real 2024–25 regular season presented as live: real box scores pay
performance dividends and official injury reports move expectations. All money is
virtual; owning a share confers no rights in a real player.

## Quickstart (fresh clone)

Needs Python 3.11+ and Node.js 20+. macOS or Linux shell.

```sh
scripts/setup     # venv, backend deps, frontend deps, data check (one time)
scripts/demo      # builds the frontend; ONE process on http://127.0.0.1:8000
```

Open http://127.0.0.1:8000 with **H$100**. Search the roster, filter by NBA team,
and buy shares in at least three players across two teams,
then press **Start season**. The market runs continuously and weekly reports
appear in **Updates**. Stop the server with Ctrl+C.

For development with hot reload (backend :8000 + Vite :5173, proxied):

```sh
scripts/dev       # open http://127.0.0.1:5173
```

Frontend-only development without the backend: `cd frontend && VITE_USE_MOCKS=true npm run dev`.

Settings live in `.env` (copy `.env.example`; never commit `.env`). The game data
the replay needs is committed in `data/runtime/` (about 5 MB), so nothing is
downloaded at the venue. `scripts/setup_data --rebuild` regenerates it from source.

## Currency units

Displayed amounts are scaled down 1,000×: a former 150-unit share is H$0.15.
Cash, prices, dividends, fees and reports use the same denomination; quantities
and percentage returns do not change. The API, integer ledger and signed receipts
retain their existing accounting units (1,000 API units = H$1). Display and price
input conversion lives in `frontend/src/utils/currency.ts`; do not rescale API
responses a second time. One ledger cent represents H$0.00001.

The live market now makes each share a 10× larger claim: prices, expected
payments and actual game payments all increase together. A former H$0.15 share
is now approximately H$1.50. The human starting budget remains H$100; bots and
dealers receive proportionate funding to preserve their trading capacity.
Each eligible share pays H$0.0002 per positive Game Score point. These economics
apply to a new market session; old running processes must be restarted.

## Tests

```sh
cd backend && ../.venv/bin/python -m pytest -q        # market, trading, learning
PYTHONPATH=backend:scripts .venv/bin/python -m pytest -q tests
cd frontend && npm run build && npm run lint && npm run test:learning && npm run test:currency
cd frontend && npm run test:e2e                       # Playwright smoke (needs scripts/demo running)
```

## What's where

| Area | Owner | Code |
|---|---|---|
| Market engine, NBA data, valuation, bots, injury reports | Person 1 (Jonathan) | `backend/market/`, `scripts/`, `data/` |
| Accounts, orders, payouts, leaderboards, Solana devnet receipts | Person 2 (Riccardo) | `backend/trading/` |
| React trading terminal | Person 3 (Eshan) | `frontend/` (design rules in `CLAUDE.md`) |
| Learning layer: tutorials, glossary, missions, integration | Person 4 (Khizar) | `backend/learning/`, `frontend/src/learning/`, `content/`, `scenarios/` |

One FastAPI process (`backend/main.py`) serves `/market`, `/trading`, `/learning`,
their WebSockets and, in demo mode, the built React app.

## Docs

- [Integration report](docs/INTEGRATION_REPORT.md) and [decisions log](docs/INTEGRATION_DECISIONS.md)
- [Season gameplay and scoring](docs/season-integration.md)
- [Backend API and features](docs/backend-integration.md)
- [Historical data and replay](docs/market-simulation.md), [valuation and dividends](docs/dividend-model.md)
- [Product plan](docs/hoopstreet-final-plan.md)
- Older status notes: [docs/archive/](docs/archive/)

Data: [SportsDataverse](https://github.com/sportsdataverse/sportsdataverse-data) ESPN
box scores and the NBA's official injury report archive. No NBA logos or headshots are used.
