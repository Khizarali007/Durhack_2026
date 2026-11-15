"""MarketAdapter over Person 1's season replay engine (market.engine.LiveMarket).

Reads live quotes and the revealed daily timeline. Design choice (see
docs/INTEGRATION_DECISIONS.md): the historical 2024-25 replay is shared by every
player and must not be rewritten to suit one lesson, so ``inject_event`` and
``set_fair_value_shift`` only record learning-side events (missions can still
show and grade them) and never move a real price. Mocks remain for tests.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .models import MarketEvent, Tick


def _positive(*values: float | None) -> float | None:
    for v in values:
        if v is not None and v > 0:
            return float(v)
    return None


class SeasonMarketAdapter:
    def __init__(self, market: Callable[[], Any]) -> None:
        # A callable, because a timeline rewind replaces the shared market object.
        self._market = market
        self._events: list[MarketEvent] = []
        self._shifts: dict[str, float] = {}

    # ---- reads ---------------------------------------------------------------
    def symbols(self) -> list[str]:
        return [p.symbol for p in self._market().players()]

    def market_time(self) -> float:
        return float(self._market().market_time())

    def get_tick(self, symbol: str) -> Tick | None:
        market = self._market()
        try:
            q = market.quote(symbol)
        except KeyError:
            return None
        return self._tick(market.market_time(), symbol, q.last, q.fair_value, q.bid, q.ask, q.quoted_price)

    def recent_ticks(self, symbol: str, limit: int = 120) -> list[Tick]:
        market = self._market()
        history = getattr(market, "timeline_history", {}).get(symbol)
        if history is None:
            return []
        ticks = [
            self._tick(pt["t"], symbol, pt.get("last"), pt.get("fair"), pt.get("bid"), pt.get("ask"), pt.get("mid"))
            for pt in history[-limit:]
        ]
        return [t for t in ticks if t is not None]

    @staticmethod
    def _tick(t, symbol, last, fair, bid, ask, mid) -> Tick | None:
        price = _positive(last, mid, fair)
        if price is None:
            return None
        fair_value = _positive(fair, price)
        best_bid = _positive(bid, mid, price)
        best_ask = _positive(ask, mid, price)
        return Tick(t=float(t), symbol=symbol, price=price, fair_value=fair_value,
                    best_bid=best_bid, best_ask=best_ask)

    # ---- learning-side events (never move the shared replay) -------------------
    def inject_event(self, event: MarketEvent) -> None:
        self._events.append(event)
        self._events.sort(key=lambda e: e.t)

    def set_fair_value_shift(self, symbol: str, shift: float, ramp_s: float = 0.0) -> None:
        if shift:
            self._shifts[symbol] = shift
        else:
            self._shifts.pop(symbol, None)

    def recent_events(self, since_t: float | None = None) -> list[MarketEvent]:
        now = self.market_time()
        return [e for e in self._events if e.t <= now and (since_t is None or e.t >= since_t)]

    def requested_shifts(self) -> dict[str, float]:
        """What missions asked for; recorded for the debrief, not applied to prices."""
        return dict(self._shifts)
