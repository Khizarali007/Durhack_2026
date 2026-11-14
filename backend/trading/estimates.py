"""P2-12: what an order would cost before you confirm it (spread, slippage, fee).

**How the estimate is made:**
- If the engine has ``preview_order`` (the fake does, and Person 1 has been
  asked for it), the estimate is exactly what ``submit_order`` would do right
  now, without trading.
- Otherwise it walks the makers' current quotes, using each maker's share
  count as its depth. That's approximate: it ignores the way makers re-quote as
  their stock runs down, so big orders will slip a bit more than it says.

**Terms, for the order ticket and tooltips:**
- **Spread:** best ask minus best bid. Buying and immediately selling costs about this much.
- **Slippage:** how much worse the average fill is than the best price, because
  a big order works through several makers' quotes.
- **Fee:** 0.10% of what's traded.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .db import Database
from .market_contract import MakerQuote, MarketEngine, Side
from .money import to_cents
from .orders import FEE_RATE, OrderError, _balance, fee_cents, reserved_cash, reserved_shares

SLIPPAGE_WARNING_PCT = 1.0
WIDE_SPREAD_PCT = 2.0


@dataclass
class Estimate:
    symbol: str
    side: Side
    qty: int
    method: str                       # "engine preview" or "maker quotes (approximate)"
    best_bid_cents: int | None
    best_ask_cents: int | None
    best_price_cents: int | None      # the ask when buying, the bid when selling
    fillable_qty: int
    notional_cents: int
    fee_cents: int
    available_cash_cents: int
    sellable_qty: int                 # shares held minus those reserved for open orders
    affordable_qty: int               # buys: how many of the fillable shares the cash covers
    makers: tuple[MakerQuote, ...]
    warnings: list[str] = field(default_factory=list)

    @property
    def spread_cents(self) -> int | None:
        if self.best_bid_cents is None or self.best_ask_cents is None:
            return None
        return self.best_ask_cents - self.best_bid_cents

    @property
    def mid_cents(self) -> float | None:
        if self.best_bid_cents is None or self.best_ask_cents is None:
            return None
        return (self.best_bid_cents + self.best_ask_cents) / 2

    @property
    def avg_price_cents(self) -> float | None:
        return self.notional_cents / self.fillable_qty if self.fillable_qty else None

    @property
    def slippage_cents(self) -> float:
        """Per share, positive = worse than the best price."""
        if not self.fillable_qty or self.best_price_cents is None:
            return 0.0
        diff = self.avg_price_cents - self.best_price_cents
        return diff if self.side == "buy" else -diff

    @property
    def total_cents(self) -> int:
        """Buys: what you'd pay, fee included. Sells: what you'd receive after the fee."""
        return self.notional_cents + self.fee_cents if self.side == "buy" else self.notional_cents - self.fee_cents


def estimate_order(db: Database, market: MarketEngine, user_id: str, symbol: str, side: Side,
                   qty: int) -> Estimate:
    if symbol not in {p.symbol for p in market.players()}:
        raise OrderError(404, f"unknown symbol {symbol!r}")
    quote = market.quote(symbol)
    bid = to_cents(quote.bid) if quote.bid is not None else None
    ask = to_cents(quote.ask) if quote.ask is not None else None
    best = ask if side == "buy" else bid

    preview = getattr(market, "preview_order", None)
    if preview is not None:
        result = preview(symbol=symbol, side=side, qty=qty)
        fills = [(f.qty, to_cents(f.price)) for f in result.fills]
        method = "engine preview"
    else:
        fills = _walk_quotes(quote.makers, side, qty)
        method = "maker quotes (approximate)"

    cash, held, _ = _balance(db, user_id, symbol)
    available = cash - reserved_cash(db, user_id)
    sellable = held - reserved_shares(db, user_id, symbol)
    fillable = sum(q for q, _ in fills)
    notional = sum(q * p for q, p in fills)
    fee = sum(fee_cents(q * p) for q, p in fills)

    affordable, spent = 0, 0
    for fill_qty, price in fills:  # how far the cash goes through the same fills
        per_share = price * (1 + float(FEE_RATE)) + 1
        take = min(fill_qty, int((available - spent) // per_share))
        affordable += take
        spent += take * per_share
        if take < fill_qty:
            break

    estimate = Estimate(symbol, side, qty, method, bid, ask, best, fillable, notional, fee, available,
                        max(sellable, 0), affordable, quote.makers)
    estimate.warnings = _warnings(estimate, held)
    return estimate


def _walk_quotes(makers: tuple[MakerQuote, ...], side: Side, qty: int) -> list[tuple[int, int]]:
    """Fallback: fill from the best maker quote down, each maker up to its share count."""
    if side == "buy":
        levels = sorted((to_cents(m.ask), m.shares) for m in makers if m.ask is not None)
    else:
        levels = sorted(((to_cents(m.bid), qty) for m in makers if m.bid is not None), reverse=True)
    fills, remaining = [], qty
    for price, depth in levels:
        take = min(remaining, depth)
        if take > 0:
            fills.append((take, price))
            remaining -= take
    return fills


def _warnings(e: Estimate, held: int) -> list[str]:
    notes = []
    if e.best_price_cents is None:
        notes.append("no market maker is quoting this side right now")
    elif e.fillable_qty < e.qty:
        notes.append(f"the market makers can only fill about {e.fillable_qty} of {e.qty} right now")
    if e.fillable_qty and e.best_price_cents:
        pct = 100 * e.slippage_cents / e.best_price_cents
        if pct >= SLIPPAGE_WARNING_PCT:
            notes.append(f"big order: about {pct:.1f}% worse than the best price on average. "
                         "A limit order caps the price you pay")
    if e.mid_cents and e.spread_cents is not None and 100 * e.spread_cents / e.mid_cents >= WIDE_SPREAD_PCT:
        notes.append("the spread is wide right now, so buying and selling straight back costs more than usual")
    if e.side == "buy" and e.affordable_qty < e.fillable_qty:
        notes.append(f"not enough cash for all of it: you can afford about {e.affordable_qty}")
    if e.side == "sell" and e.qty > e.sellable_qty:
        reserved = held - e.sellable_qty
        note = f", {reserved} reserved for open orders" if reserved else ""
        notes.append(f"you can sell {e.sellable_qty} (you hold {held}{note})")
    return notes
