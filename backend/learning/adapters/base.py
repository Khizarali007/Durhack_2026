"""Adapter interfaces the learning layer depends on.

The learning code only ever talks to these Protocols, never to teammates'
modules directly. At merge time we write a thin adapter around the real
engine / trading code (or teammates implement these methods directly).

- MarketAdapter: implemented for real by Person 1 (market engine + director).
- TradesAdapter: implemented for real by Person 2 (accounts + trading).
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from .models import MarketEvent, Portfolio, Position, Tick, Trade


@runtime_checkable
class MarketAdapter(Protocol):
    def symbols(self) -> list[str]:
        """All tradable symbols."""
        ...

    def market_time(self) -> float:
        """Current market time, epoch seconds."""
        ...

    def get_tick(self, symbol: str) -> Tick | None:
        """Latest tick for a symbol, or None if the symbol is unknown."""
        ...

    def recent_ticks(self, symbol: str, limit: int = 120) -> list[Tick]:
        """Most recent ticks for a symbol, oldest first, at most `limit`."""
        ...

    def inject_event(self, event: MarketEvent) -> None:
        """Fire a scripted event. If event.t is in the future, schedule it."""
        ...

    def set_fair_value_shift(self, symbol: str, shift: float, ramp_s: float = 0.0) -> None:
        """Set a manual fractional fair-value shift (e.g. 0.10 = +10%),
        reached linearly over `ramp_s` real seconds. 0.0 clears it."""
        ...

    def recent_events(self, since_t: float | None = None) -> list[MarketEvent]:
        """Events that have fired, oldest first (optionally only t >= since_t)."""
        ...


@runtime_checkable
class TradesAdapter(Protocol):
    def trades_for_user(self, user_id: str, since_t: float | None = None) -> list[Trade]:
        """A user's fills, oldest first. If since_t is given, only t >= since_t."""
        ...

    def portfolio(self, user_id: str) -> Portfolio:
        """Current cash, equity and positions for a user."""
        ...

    def apply_start_state(self, user_id: str, cash: float, positions: list[Position]) -> None:
        """Reset the user's (mission) account to this cash and these positions.
        Called by the mission runner when a mission starts. Past trades may be
        kept; the runner only reads trades inside the mission window."""
        ...
