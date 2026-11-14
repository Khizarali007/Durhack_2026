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
- **Short / cover (P2-14):** a short is priced like a sell (at the bid), a
  cover like a buy (at the ask).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .db import Database
from .market_contract import MakerQuote, MarketEngine, Side
from .money import to_cents
from .orders import (
    FEE_RATE,
    OrderError,
    OrderSide,
    _balance,
    buying_power,
    engine_side,
    fee_cents,
    reserved_shares,
)

SLIPPAGE_WARNING_PCT = 1.0
WIDE_SPREAD_PCT = 2.0


@dataclass
class Estimate:
    symbol: str
    side: OrderSide
    qty: int
    method: str                       # "engine preview" or "maker quotes (approximate)"
    best_bid_cents: int | None
    best_ask_cents: int | None
    best_price_cents: int | None      # the ask to buy/cover, the bid to sell/short
    fillable_qty: int
    notional_cents: int
    fee_cents: int
    available_cash_cents: int         # buy/short: buying power at this leverage. Cover/sell: cash
    sellable_qty: int                 # shares held minus those reserved for open orders
    affordable_qty: int               # buy/short/cover: how many of the fillable shares the cash covers
    makers: tuple[MakerQuote, ...]
    position_qty: int = 0             # held now, negative = short
    leverage: int = 1                 # P2-15: buys and shorts only
    warnings: list[str] = field(default_factory=list)

    @property
    def allowed_qty(self) -> int:
        """The most this account may trade on this side right now (ignoring liquidity)."""
        if self.side == "sell":
            return self.sellable_qty
        if (self.side == "buy" and self.position_qty < 0) or (self.side == "short" and self.position_qty > 0):
            return 0
        if self.side == "cover":
            return min(self.affordable_qty, max(-self.position_qty, 0))
        return self.affordable_qty

    @property
    def ok(self) -> bool:
        """True if the whole order would go through as asked."""
        return self.fillable_qty == self.qty and self.allowed_qty >= self.qty

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
        return diff if engine_side(self.side) == "buy" else -diff

    @property
    def total_cents(self) -> int:
        """Buy/cover: what you'd pay, fee included. Sell/short: what you'd receive after the fee."""
        if engine_side(self.side) == "buy":
            return self.notional_cents + self.fee_cents
        return self.notional_cents - self.fee_cents


def estimate_order(db: Database, market: MarketEngine, user_id: str, symbol: str, side: OrderSide,
                   qty: int, leverage: int = 1) -> Estimate:
    if getattr(market, "supports_advanced_trading", True) is False and (side not in ("buy", "sell") or leverage != 1):
        raise OrderError(400, "This prototype supports ordinary buys and sells at 1x leverage only")
    if symbol not in {p.symbol for p in market.players()}:
        raise OrderError(404, f"unknown symbol {symbol!r}")
    to_engine = engine_side(side)
    quote = market.quote(symbol)
    bid = to_cents(quote.bid) if quote.bid is not None else None
    ask = to_cents(quote.ask) if quote.ask is not None else None
    best = ask if to_engine == "buy" else bid

    preview = getattr(market, "preview_order", None)
    if preview is not None:
        result = preview(symbol=symbol, side=to_engine, qty=qty)
        fills = [(f.qty, to_cents(f.price)) for f in result.fills]
        method = "engine preview"
    else:
        fills = _walk_quotes(quote.makers, to_engine, qty)
        method = "maker quotes (approximate)"

    cash, held, _ = _balance(db, user_id, symbol)
    # Buying and shorting use buying power (leverage x equity - exposure - reservations).
    # Covering is always allowed, so nothing limits it but liquidity.
    leverage = leverage if side in ("buy", "short") else 1
    available = buying_power(db, market, user_id, leverage) if side in ("buy", "short") else cash
    sellable = held - reserved_shares(db, user_id, symbol)
    fillable = sum(q for q, _ in fills)
    notional = sum(q * p for q, p in fills)
    fee = sum(fee_cents(q * p) for q, p in fills)

    affordable, spent = (fillable, 0) if side == "cover" else (0, 0)
    for fill_qty, price in fills if side != "cover" else ():  # how far the cash goes through the same fills (a short uses it up the same way)
        per_share = price * (1 + float(FEE_RATE)) + 1
        take = min(fill_qty, int((available - spent) // per_share))
        affordable += take
        spent += take * per_share
        if take < fill_qty:
            break

    estimate = Estimate(symbol, side, qty, method, bid, ask, best, fillable, notional, fee, available,
                        max(sellable, 0), affordable, quote.makers, position_qty=held, leverage=leverage)
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
    if e.side == "buy" and held < 0:
        notes.append(f"you're short {-held} {e.symbol}: use cover to buy them back")
    elif e.side == "short" and held > 0:
        notes.append(f"you hold {held} {e.symbol}: sell them before shorting")
    elif e.side == "cover" and e.qty > -min(held, 0):
        notes.append(f"you're short {-min(held, 0)} {e.symbol}, so you can cover at most that")
    elif e.side in ("buy", "short") and e.leverage > 1 and e.affordable_qty < e.fillable_qty:
        notes.append(f"not enough buying power for all of it at {e.leverage}x: about {e.affordable_qty}")
    elif e.side == "buy" and e.affordable_qty < e.fillable_qty:
        notes.append(f"not enough cash for all of it: you can afford about {e.affordable_qty}")
    elif e.side == "short" and e.affordable_qty < e.fillable_qty:
        notes.append(f"not enough free cash to back all of it: you can short about {e.affordable_qty}"
                     " (a short holds back 200% of its value)")
    if e.side == "sell" and held < 0:
        notes.append(f"you're short {-held} {e.symbol}: use cover to buy them back")
    elif e.side == "sell" and e.qty > e.sellable_qty:
        reserved = held - e.sellable_qty
        note = f", {reserved} reserved for open orders" if reserved else ""
        notes.append(f"you can sell {e.sellable_qty} (you hold {held}{note})")
    if e.side == "short":
        notes.append("if the price rises, your loss keeps growing: there's no limit to how high it can go")
    if e.leverage > 1:
        notes.append(f"{e.leverage}x leverage: every 1% the price moves against you costs {e.leverage}% of what "
                     "you put in. Fall too far and you get a margin call, then your positions are sold for you")
    return notes
