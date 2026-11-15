"""Adapter registry. The host app (dev_app.py now, backend/main.py at merge)
calls configure() once at startup with real or mock adapters, and
`await shutdown()` on exit."""

from __future__ import annotations

from fastapi import HTTPException

from .adapters.base import MarketAdapter, TradesAdapter
from .clock import Clock
from .missions import MissionManager

_market: MarketAdapter | None = None
_trades: TradesAdapter | None = None
_missions: MissionManager | None = None


def configure(
    market: MarketAdapter,
    trades: TradesAdapter,
    clock: Clock | None = None,
    autorun: bool = True,
) -> MissionManager:
    global _market, _trades, _missions
    _market, _trades = market, trades
    _missions = MissionManager(market, trades, clock=clock, autorun=autorun)
    return _missions


async def shutdown() -> None:
    if _missions is not None:
        await _missions.shutdown()


def reset() -> None:
    global _market, _trades, _missions
    _market = _trades = _missions = None


def get_market() -> MarketAdapter:
    if _market is None:
        raise HTTPException(503, "learning layer: market adapter not configured")
    return _market


def get_trades() -> TradesAdapter:
    if _trades is None:
        raise HTTPException(503, "learning layer: trades adapter not configured")
    return _trades


def get_missions() -> MissionManager:
    if _missions is None:
        raise HTTPException(503, "learning layer: not configured")
    return _missions


def adapters_configured() -> dict[str, bool]:
    return {"market": _market is not None, "trades": _trades is not None}
