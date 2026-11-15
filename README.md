# HoopStreet: DurHack 2026

> Cloudy with a chance of margin calls.

An NBA player stock exchange that teaches investing with play money. Every NBA
player is a stock priced in **HOOP** (virtual currency, shown as `H$`). The game is a
replay of the real 2024–25 regular season presented as live: real box scores pay
performance dividends and official injury reports move expectations. All money is
virtual; owning a share confers no rights in a real player.

## What you can do

- **Log in, sign up or play as guest.** Accounts survive backend restarts and season rewinds; a guest can "Save your progress" from the header menu.
- **Trade the season.** Buy and sell any of 580 players (market, limit, stop-loss), press **Next day** to replay games, and collect performance payouts.
- **Read the market.** Daily price chart with the analyst estimate, compare up to three players, 1M/3M/Season ranges, and early-warning / storm markers from the official injury report. Storm Radar and "Why did it move?" on every player.
- **Composition.** Portfolio page: % by team and player and an A–F grade with a reason.
- **Your season review** (Activity): return, payouts, fees, best/worst trade, max drawdown, review cards (concentration, buying into a storm, panic selling, missed payouts, overpaying, churning, holding an Out player, plus praise) with the H$ impact and the lesson that teaches it, and a plain-English timeline. Optional **Coach Hoops** (Gemini) rewords it in three bullets.
- **Friends.** Five simulated practice rivals (Maya, Theo, Priya, Sam, Jordan) built from the real market bots: ranked against you, with an Insights panel on what each did differently. They also fill the leaderboard.
- **Learn.** Six guided tutorials over the real screens, a glossary and a knowledge check.
- **Demo helpers.** `/director` jumps to the Wembanyama storm (19–21 Feb 2025); projector mode in the header menu.

## Quickstart (fresh clone)

Needs Python 3.11+ and Node.js 20+. macOS or Linux shell.

```sh
scripts/setup     # venv, backend deps, frontend deps, data check (one time)
scripts/demo      # builds the frontend; ONE process on http://127.0.0.1:8000
```

Open http://127.0.0.1:8000, buy your first shares, then press **Next day** or
**Play** to replay the season. Stop with Ctrl+C.

For development with hot reload (backend :8000 + Vite :5173, proxied):

```sh
scripts/dev       # open http://127.0.0.1:5173
```

Frontend-only development without the backend: `cd frontend && VITE_USE_MOCKS=true npm run dev`.

Settings live in `.env` (copy `.env.example`; never commit `.env`). Optional: `GEMINI_API_KEY` turns on Gemini wording for Coach Hoops (without it, Coach Hoops uses template text from the same insights). Accounts are stored in `data/accounts.sqlite` (git-ignored). The game data
the replay needs is committed in `data/runtime/` (about 5 MB), so nothing is
downloaded at the venue. `scripts/setup_data --rebuild` regenerates it from source.

## Tests

```sh
cd backend && ../.venv/bin/python -m pytest -q        # market, trading, learning
PYTHONPATH=backend:scripts .venv/bin/python -m pytest -q tests
cd frontend && npm run build && npm run lint && npm run test:learning
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
