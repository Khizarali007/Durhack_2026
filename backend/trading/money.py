"""Converting between the ledger's integer cents and HOOP floats at the API edge."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal


def to_hoop(cents: int) -> float:
    """10_000_000 -> 100000.0"""
    return cents / 100


def to_cents(hoop: float) -> int:
    """123.455 -> 12346. Rounds half up, so a 2-decimal price converts exactly."""
    return int((Decimal(str(hoop)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def market_mark(market, symbol):
    """Live portfolios use current quote midpoint; fake/legacy engines retain last-trade marks."""
    method = getattr(market, 'mark_price', market.last_price)
    return method(symbol)
