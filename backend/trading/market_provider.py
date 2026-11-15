"""One shared historical LiveMarket for the combined backend.

Tests may inject FakeMarket with use_market. Production startup never falls
back to synthetic data when the local historical dataset is missing.
"""

from __future__ import annotations

import os
from .market_contract import MarketEngine

_market: MarketEngine | None = None


def get_market() -> MarketEngine:
    global _market
    if _market is None:
        from market.engine import LiveMarket
        _market = LiveMarket(day_seconds=float(os.environ.get("MARKET_DAY_SECONDS", "60")),
                             bot_count=int(os.environ.get("MARKET_BOT_COUNT", "30")),
                             bot_funding=os.environ.get("MARKET_BOT_FUNDING", "fixed"))
        _market.paused = os.environ.get("MARKET_START_PAUSED", "0") == "1"
    return _market


def use_market(market: MarketEngine | None) -> None:
    """Replace the shared market (tests use a fresh FakeMarket each time). None resets it."""
    global _market
    _market = market
