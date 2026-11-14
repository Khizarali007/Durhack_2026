"""The one place that decides which market engine Person 2's code talks to.

Everything in Person 2's code gets the market through ``get_market()``. When
Person 1's real engine is ready, change the import and constructor below.
That should be the only change.
"""

from __future__ import annotations

from .fake_market import FakeMarket
from .market_contract import MarketEngine

_market: MarketEngine | None = None


def get_market() -> MarketEngine:
    global _market
    if _market is None:
        _market = FakeMarket()  # TODO: swap for Person 1's engine when it lands
    return _market


def use_market(market: MarketEngine | None) -> None:
    """Replace the shared market (tests use a fresh FakeMarket each time). None resets it."""
    global _market
    _market = market
