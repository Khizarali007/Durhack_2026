"""Adapter registry. The host app (dev_app.py now, backend/main.py at merge)
calls configure() once at startup with real or mock adapters."""

from __future__ import annotations

from fastapi import HTTPException

from .adapters.base import MarketAdapter, TradesAdapter

_market: MarketAdapter | None = None
_trades: TradesAdapter | None = None


def configure(market: MarketAdapter, trades: TradesAdapter) -> None:
    global _market, _trades
    _market, _trades = market, trades


def reset() -> None:
    global _market, _trades
    _market = _trades = None


def get_market() -> MarketAdapter:
    if _market is None:
        raise HTTPException(503, "learning layer: market adapter not configured")
    return _market


def get_trades() -> TradesAdapter:
    if _trades is None:
        raise HTTPException(503, "learning layer: trades adapter not configured")
    return _trades


def adapters_configured() -> dict[str, bool]:
    return {"market": _market is not None, "trades": _trades is not None}
