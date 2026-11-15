"""MOCK ONLY - stand-in for Person 1's market engine.

Implements MarketAdapter so the learning layer can be built and demoed before
the real engine exists. Swap for the real adapter at merge. Do not ship this
as the production market.

Model (per symbol, every 0.5 real seconds):
- fair_value = base_fair_value * (1 + sum of event shifts + manual shift)
- price mean-reverts toward fair_value with small Gaussian noise
- events also raise volatility ("storm"), which decays back to 1.0
- best_bid / best_ask = price -/+ a half-spread that widens with volatility

The mock keeps its own simulated clock (`elapsed` real seconds since start),
so tests can call step() directly and get deterministic results with a seed.
"""

from __future__ import annotations

import asyncio
import contextlib
import math
import random
from collections import deque
from dataclasses import dataclass, field

from .models import (
    MARKET_SECONDS_PER_REAL_SECOND,
    TICK_INTERVAL_S,
    MarketEvent,
    Tick,
)

# Mock market opens at 2025-01-19 19:00:00 UTC (inside the 2024-25 data window).
MARKET_T0 = 1737313200.0

KAPPA = 0.35  # per real second: price closes half its gap to fair value in ~2 s
SIGMA = 0.004  # base noise, fraction of price per sqrt(real second)
HALF_SPREAD = 0.001  # 0.10% each side at normal volatility
HISTORY = 600  # ticks kept per symbol (5 real minutes)


@dataclass(frozen=True)
class EffectProfile:
    """How an event's impact plays out over real time."""

    ramp_s: float  # seconds to reach full impact (linear)
    retain: float  # fraction of the impact that sticks long-term (0-1)
    fade_tau_s: float  # time constant of the fade after the peak
    storm_tau_s: float  # time constant of the volatility decay


# Hot streak: ramps up over ~14 s, then half the hype fades slowly.
PROFILES: dict[str, EffectProfile] = {
    "hot_streak": EffectProfile(ramp_s=14.0, retain=0.5, fade_tau_s=30.0, storm_tau_s=20.0),
    "early_warning": EffectProfile(ramp_s=2.0, retain=1.0, fade_tau_s=1.0, storm_tau_s=25.0),
    "injury": EffectProfile(ramp_s=2.0, retain=0.85, fade_tau_s=60.0, storm_tau_s=30.0),
    "rest_day": EffectProfile(ramp_s=3.0, retain=0.0, fade_tau_s=25.0, storm_tau_s=10.0),
    "trade_rumour": EffectProfile(ramp_s=4.0, retain=0.0, fade_tau_s=20.0, storm_tau_s=20.0),
}


@dataclass
class _Effect:
    start: float
    impact: float
    storm: float
    profile: EffectProfile

    def shift(self, now: float) -> float:
        el = now - self.start
        if el <= 0:
            return 0.0
        p = self.profile
        if el < p.ramp_s:
            return self.impact * el / p.ramp_s
        faded = math.exp(-(el - p.ramp_s) / p.fade_tau_s)
        return self.impact * (p.retain + (1.0 - p.retain) * faded)

    def vol(self, now: float) -> float:
        el = now - self.start
        if el < 0:
            return 1.0
        return 1.0 + (self.storm - 1.0) * math.exp(-el / self.profile.storm_tau_s)

    def finished(self, now: float) -> bool:
        p = self.profile
        el = now - self.start
        return p.retain == 0.0 and el > p.ramp_s + 8 * max(p.fade_tau_s, p.storm_tau_s)


@dataclass
class _Symbol:
    symbol: str
    name: str
    team: str
    base_fv: float
    price: float
    effects: list[_Effect] = field(default_factory=list)
    manual_from: float = 0.0
    manual_to: float = 0.0
    manual_start: float = 0.0
    manual_ramp: float = 0.0
    ticks: deque[Tick] = field(default_factory=lambda: deque(maxlen=HISTORY))

    def manual_shift(self, now: float) -> float:
        if self.manual_ramp <= 0:
            return self.manual_to
        frac = min(1.0, max(0.0, (now - self.manual_start) / self.manual_ramp))
        return self.manual_from + (self.manual_to - self.manual_from) * frac

    def fair_value(self, now: float) -> float:
        shift = sum(e.shift(now) for e in self.effects) + self.manual_shift(now)
        return self.base_fv * max(0.05, 1.0 + shift)

    def vol(self, now: float) -> float:
        return max((e.vol(now) for e in self.effects), default=1.0)


# Placeholder universe. Person 1 owns the real 300-player list and tickers.
DEFAULT_SYMBOLS: list[tuple[str, str, str, float]] = [
    ("SGA", "Shai Gilgeous-Alexander", "OKC", 48.0),
    ("JOKIC", "Nikola Jokic", "DEN", 52.0),
    ("TATUM", "Jayson Tatum", "BOS", 41.0),
    ("WEMBY", "Victor Wembanyama", "SAS", 38.0),
    ("ANT", "Anthony Edwards", "MIN", 35.0),
]


class MockMarket:
    """MOCK MarketAdapter. Call start() inside a running event loop to tick
    every 0.5 s in the background, or call step() manually in tests."""

    def __init__(
        self,
        symbols: list[tuple[str, str, str, float]] | None = None,
        seed: int | None = None,
    ) -> None:
        self._rng = random.Random(seed)
        self._elapsed = 0.0
        self._task: asyncio.Task | None = None
        self._events: list[MarketEvent] = []
        self._pending: list[tuple[float, MarketEvent]] = []
        self._syms: dict[str, _Symbol] = {}
        for sym, name, team, fv in symbols or DEFAULT_SYMBOLS:
            s = _Symbol(symbol=sym, name=name, team=team, base_fv=fv, price=fv)
            self._syms[sym] = s
            s.ticks.append(self._make_tick(s, 1.0))

    # ---- clock -------------------------------------------------------
    @property
    def elapsed(self) -> float:
        """Real seconds simulated since the mock started."""
        return self._elapsed

    def market_time(self) -> float:
        return MARKET_T0 + self._elapsed * MARKET_SECONDS_PER_REAL_SECOND

    def _to_elapsed(self, market_t: float) -> float:
        return (market_t - MARKET_T0) / MARKET_SECONDS_PER_REAL_SECOND

    # ---- MarketAdapter -------------------------------------------------
    def symbols(self) -> list[str]:
        return list(self._syms)

    def info(self, symbol: str) -> dict | None:
        s = self._syms.get(symbol)
        if s is None:
            return None
        return {"symbol": s.symbol, "name": s.name, "team": s.team}

    def get_tick(self, symbol: str) -> Tick | None:
        s = self._syms.get(symbol)
        return s.ticks[-1] if s else None

    def recent_ticks(self, symbol: str, limit: int = 120) -> list[Tick]:
        s = self._syms.get(symbol)
        if s is None or limit <= 0:
            return []
        return list(s.ticks)[-limit:]

    def inject_event(self, event: MarketEvent) -> None:
        if event.symbol not in self._syms:
            raise KeyError(f"unknown symbol {event.symbol!r}")
        start = max(self._elapsed, self._to_elapsed(event.t))
        if start > self._elapsed:
            self._pending.append((start, event))
        else:
            self._activate(event, self._elapsed)

    def set_fair_value_shift(self, symbol: str, shift: float, ramp_s: float = 0.0) -> None:
        s = self._syms.get(symbol)
        if s is None:
            raise KeyError(f"unknown symbol {symbol!r}")
        s.manual_from = s.manual_shift(self._elapsed)
        s.manual_to = shift
        s.manual_start = self._elapsed
        s.manual_ramp = max(0.0, ramp_s)

    def recent_events(self, since_t: float | None = None) -> list[MarketEvent]:
        if since_t is None:
            return list(self._events)
        return [e for e in self._events if e.t >= since_t]

    # ---- simulation ----------------------------------------------------
    def _activate(self, event: MarketEvent, at: float) -> None:
        s = self._syms[event.symbol]
        s.effects.append(
            _Effect(start=at, impact=event.impact, storm=event.storm, profile=PROFILES[event.kind])
        )
        fired = event.model_copy(update={"t": MARKET_T0 + at * MARKET_SECONDS_PER_REAL_SECOND})
        self._events.append(fired)

    def _make_tick(self, s: _Symbol, vol: float) -> Tick:
        half = max(0.005, s.price * HALF_SPREAD * vol)
        bid = round(s.price - half, 2)
        ask = round(s.price + half, 2)
        if ask <= bid:
            ask = round(bid + 0.01, 2)
        return Tick(
            t=self.market_time(),
            symbol=s.symbol,
            price=round(s.price, 2),
            fair_value=round(s.fair_value(self._elapsed), 2),
            best_bid=max(0.01, bid),
            best_ask=ask,
        )

    def step(self, dt: float = TICK_INTERVAL_S) -> None:
        """Advance the simulated clock by dt real seconds and emit one tick per symbol."""
        self._elapsed += dt
        now = self._elapsed

        due = [p for p in self._pending if p[0] <= now]
        self._pending = [p for p in self._pending if p[0] > now]
        for start, ev in sorted(due, key=lambda p: p[0]):
            self._activate(ev, start)

        pull = 1.0 - math.exp(-KAPPA * dt)
        for s in self._syms.values():
            fv = s.fair_value(now)
            vol = s.vol(now)
            noise = s.price * SIGMA * vol * math.sqrt(dt) * self._rng.gauss(0.0, 1.0)
            s.price = max(0.01, s.price + pull * (fv - s.price) + noise)
            s.ticks.append(self._make_tick(s, vol))
            s.effects = [e for e in s.effects if not e.finished(now)]

    async def run(self, interval_s: float = TICK_INTERVAL_S) -> None:
        while True:
            await asyncio.sleep(interval_s)
            self.step(interval_s)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.get_running_loop().create_task(self.run())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
