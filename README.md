# HoopStreet — DurHack 2026

NBA player-share game with historical 2024–25 data, finite bot/maker trading,
and a FastAPI account and order backend. All dollars are virtual.

The combined local backend is now wired to the historical player engine.
See [backend setup and integration](docs/backend-integration.md) for installation,
API examples, supported features and prototype limitations.

- [Historical data and offline replay](docs/market-simulation.md)
- [Integrated valuation and dividend model](docs/dividend-model.md)
- [Historical market-model decisions](docs/market-model-decisions.md)
- [Project status](STATUS.md)

The new live backend serves on port 8000. The existing graph on port 8765 is
an offline CSV replay, not the live human-trading market.
