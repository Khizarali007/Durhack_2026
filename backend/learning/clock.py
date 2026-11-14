"""Injectable real-time clock for the mission runner.

The runner only ever asks `clock.now()` (real seconds, monotonic). Tests use
ManualClock to run a 45 s mission in milliseconds.
"""

from __future__ import annotations

import time
from typing import Protocol


class Clock(Protocol):
    def now(self) -> float: ...


class RealClock:
    def now(self) -> float:
        return time.monotonic()


class ManualClock:
    def __init__(self, start: float = 0.0) -> None:
        self._t = start

    def now(self) -> float:
        return self._t

    def advance(self, seconds: float) -> None:
        self._t += seconds
