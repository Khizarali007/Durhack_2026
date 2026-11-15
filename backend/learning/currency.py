"""Text money in the same denomination as the UI (frontend/src/utils/currency.ts + format.ts).

The API and the ledger keep legacy accounting units; 1,000 of them are H$1 (a
player starts with 100,000 units = H$100). Any amount the backend writes into a
sentence (review cards, rival comparisons, Coach Hoops) must go through these
helpers so it reads exactly like the number the UI shows next to it.
frontend/tests/currency-cases.json pins both implementations to the same output.
"""

from __future__ import annotations

ACCOUNTING_UNITS_PER_HOOP = 1000
DISPLAY_PRICE_DECIMALS = 5


def to_display(units: float) -> float:
    return units / ACCOUNTING_UNITS_PER_HOOP


def _grouped(amount: float, min_digits: int, max_digits: int) -> str:
    text = f"{amount:,.{max_digits}f}"
    whole, _, frac = text.partition(".")
    frac = frac.rstrip("0")
    if len(frac) < min_digits:
        frac = frac.ljust(min_digits, "0")
    return f"{whole}.{frac}" if frac else whole


def hoop(units: float, decimals: int | None = None) -> str:
    """Mirror of formatHOOP: H$ with 2-5 decimals by default, so tiny fees stay visible."""
    amount = abs(to_display(units))
    if decimals is None:
        body = _grouped(amount, 2, 5)
    else:
        digits = max(5, decimals) if 0 < amount < 0.01 else decimals
        body = _grouped(amount, digits, digits)
    return f"{'-' if units < 0 else ''}H${body}"


def price(units: float) -> str:
    """Mirror of formatPrice: always five decimals (the original price tick)."""
    return hoop(units, DISPLAY_PRICE_DECIMALS)


def pnl(units: float) -> str:
    """Mirror of formatPnl: an explicit + for gains."""
    return f"{'+' if units >= 0 else ''}{hoop(units)}"
