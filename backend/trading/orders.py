"""Market orders: check the user can afford it, trade with the engine, update the ledger.

How a buy works:
- It's sent to the engine in chunks of up to 10 shares.
- Before each chunk, the user's remaining cash is checked against the current
  ask, plus a small buffer and the fee.
- So an order can never spend cash the user doesn't have. If they run out,
  or the makers run out of shares, the order stops and comes back
  ``partially_filled``.

A sell is checked against the user's holdings and sent in one go.

**Short selling (P2-14):**
- ``short`` sells shares you don't own. To the engine it's a plain ``sell``
  (a maker buys them with its cash). Your position goes negative and the sale
  proceeds are added to your cash.
- ``cover`` buys them back. To the engine it's a ``buy``.
- You can't short while you hold shares of that player (sell first), and you
  can't buy while you're short (cover first), as in Person 4's mock.
- **Collateral:** while a short is open, 200% of its current value is held
  back from your cash: the sale proceeds plus the same again of your own
  money. So, with no leverage, your total exposure (long plus short) can't go
  over your equity. The hold-back follows the price, so a rising price ties up
  more cash. P2-15 adds 3x leverage and margin calls on top.
- Shorts are sent in chunks with a collateral check before each, like buys.
  Covering is always allowed, so you can always get out.

**Leverage (P2-15):** buys and shorts can use up to 3x.
- **Buying power = leverage x equity - gross exposure - cash reserved for
  open buy limits.** Gross exposure is every position's value, long or short,
  at the last price. Each share bought or shorted uses up its price (+ fee).
- At 1x that's exactly the free cash above: cash minus reservations minus
  200% short collateral. At 3x your exposure can reach three times your
  equity: a leveraged buy **borrows**, so cash goes negative (a margin loan).
- ``margin.py`` watches every account and margin-calls, then liquidates,
  when equity falls too far below exposure.

Every fill becomes a row in ``trades``. Cash and the position are updated in
the same database transaction.

Engine calls must run on the event loop thread, the same thread that ticks
the market, so the route that calls this is ``async``.
"""

from __future__ import annotations

import math
import secrets
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from typing import Literal

from .db import Database
from .market_contract import Fill, MarketEngine
from .money import to_cents

OrderSide = Literal["buy", "sell", "short", "cover"]   # the engine only sees buy / sell

FEE_RATE = Decimal("0.001")      # 0.10% of notional (matches Person 4's mission copy)
BUY_CHUNK = 10                   # shares per engine call for buys and shorts
CHUNK_PRICE_BUFFER = 0.02        # allow 2% slippage within one chunk when checking cash
SHORT_COLLATERAL_FACTOR = 2      # hold back 200% of a short's value: its proceeds + the same again (P2-14)
MAX_LEVERAGE = 3                 # P2-15: exposure can reach 3x equity

NOT_ENOUGH_CASH = "not enough cash"
NOT_ENOUGH_COLLATERAL = "not enough free cash to back this short (shorts hold back 200% of their value)"
NOT_ENOUGH_BUYING_POWER = "not enough buying power, even with leverage"


def engine_side(side: OrderSide) -> Literal["buy", "sell"]:
    """What the engine sees: a short is a sale, a cover is a purchase."""
    return "buy" if side in ("buy", "cover") else "sell"


class OrderError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@dataclass(frozen=True)
class RecordedFill:
    trade_id: str
    qty: int
    price_cents: int
    fee_cents: int
    t: float
    counterparty: str


@dataclass
class OrderOutcome:
    order_id: str
    status: str                  # "filled" | "partially_filled"
    symbol: str
    side: OrderSide
    requested_qty: int
    cash_cents_after: int
    position_qty_after: int
    fills: list[RecordedFill] = field(default_factory=list)
    reason: str | None = None    # why it was only partly filled
    quoted_best_cents: int | None = None  # best price when placed: ask to buy/cover, bid to sell/short
    leverage: int = 1

    @property
    def slippage_cents(self) -> float | None:
        """Per share, positive = the average fill was worse than the quoted best price."""
        if self.quoted_best_cents is None or not self.filled_qty:
            return None
        diff = self.average_price_cents - self.quoted_best_cents
        return diff if engine_side(self.side) == "buy" else -diff

    @property
    def filled_qty(self) -> int:
        return sum(f.qty for f in self.fills)

    @property
    def total_fee_cents(self) -> int:
        return sum(f.fee_cents for f in self.fills)

    @property
    def average_price_cents(self) -> float:
        return sum(f.qty * f.price_cents for f in self.fills) / self.filled_qty


PRICE_MOVED = "the price moved past your limit"


def fee_cents(notional_cents: int) -> int:
    return int((Decimal(notional_cents) * FEE_RATE).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def reserved_cash(db: Database, user_id: str, exclude: str | None = None) -> int:
    """Cash held back for the user's open buy limits (P2-11)."""
    with db.lock:
        row = db.conn.execute(
            "SELECT coalesce(sum(reserved_cash_cents), 0) FROM open_orders"
            " WHERE user_id = ? AND status = 'open' AND order_id IS NOT ?", (user_id, exclude)
        ).fetchone()
    return row[0]


def reserved_shares(db: Database, user_id: str, symbol: str, exclude: str | None = None) -> int:
    """Shares held back for the user's open sell limits and stop-losses (P2-11)."""
    with db.lock:
        row = db.conn.execute(
            "SELECT coalesce(sum(qty - filled_qty), 0) FROM open_orders WHERE user_id = ? AND symbol = ?"
            " AND side = 'sell' AND status = 'open' AND order_id IS NOT ?", (user_id, symbol, exclude)
        ).fetchone()
    return row[0]


def short_collateral(db: Database, market: MarketEngine, user_id: str) -> int:
    """Cash held back for the user's open shorts: 200% of their value at the last price (P2-14)."""
    with db.lock:
        rows = db.conn.execute(
            "SELECT symbol, qty FROM positions WHERE user_id = ? AND qty < 0", (user_id,)).fetchall()
    return sum(SHORT_COLLATERAL_FACTOR * -qty * to_cents(market.last_price(symbol)) for symbol, qty in rows)


@dataclass(frozen=True)
class Exposure:
    cash_cents: int              # negative = borrowed (a margin loan, P2-15)
    equity_cents: int            # cash + every position's value (shorts count negative)
    gross_cents: int             # every position's value, long or short, as a positive amount

    @property
    def margin_ratio(self) -> float | None:
        """Equity / gross exposure. None with no positions. 1/3 for a fresh 3x position."""
        return self.equity_cents / self.gross_cents if self.gross_cents else None


def exposure(db: Database, market: MarketEngine, user_id: str) -> Exposure:
    """Positions marked at the last price, like the portfolio."""
    with db.lock:
        user = db.conn.execute("SELECT cash_cents FROM users WHERE user_id = ?", (user_id,)).fetchone()
        rows = db.conn.execute("SELECT symbol, qty FROM positions WHERE user_id = ?", (user_id,)).fetchall()
    if user is None:
        raise OrderError(404, "unknown user")
    values = [qty * to_cents(market.last_price(symbol)) for symbol, qty in rows]
    return Exposure(user[0], user[0] + sum(values), sum(abs(v) for v in values))


def buying_power(db: Database, market: MarketEngine, user_id: str, leverage: int = 1,
                 exclude: str | None = None) -> int:
    """What a new buy or short may use: leverage x equity - gross exposure - cash
    reserved for open buy limits. Negative when the account is already over that leverage."""
    e = exposure(db, market, user_id)
    return leverage * e.equity_cents - e.gross_cents - reserved_cash(db, user_id, exclude)


def free_cash(db: Database, market: MarketEngine, user_id: str, exclude: str | None = None) -> int:
    """Buying power at 1x: cash minus what open buy limits and open shorts hold back
    (equity - gross = cash - 200% of shorts). Can be negative if a short's price has risen."""
    return buying_power(db, market, user_id, 1, exclude)


def check_direction(side: OrderSide, symbol: str, held: int, qty: int) -> None:
    """Long and short don't mix in one player (as in Person 4's mock). Raises a 400 OrderError."""
    if side == "buy" and held < 0:
        raise OrderError(400, f"you're short {-held} {symbol}: use cover to buy them back")
    if side == "sell" and held < 0:
        raise OrderError(400, f"you're short {-held} {symbol}: there's nothing to sell (use cover)")
    if side == "short" and held > 0:
        raise OrderError(400, f"you hold {held} {symbol}: sell them before shorting")
    if side == "cover" and qty > -min(held, 0):
        raise OrderError(400, f"you're short {-min(held, 0)} {symbol}, so you can't cover {qty}")


def place_market_order(db: Database, market: MarketEngine, user_id: str, symbol: str, side: OrderSide,
                       qty: int, *, reason: str = "market", limit_price_cents: int | None = None,
                       own_open_order: str | None = None, leverage: int = 1) -> OrderOutcome:
    """Trade now at the market's best price.

    - ``side``: ``buy`` / ``sell``, or ``short`` / ``cover`` (P2-14).
    - ``reason`` is recorded on the trades: ``market``, or ``limit`` / ``stop``
      when an open order fires.
    - ``limit_price_cents`` stops filling once the price is worse than the limit.
    - ``own_open_order`` is the open order that's firing, so its own reserved
      cash or shares can be used.
    - ``leverage`` (1-3) sets the buying power for buys and shorts (P2-15).
      Sells and covers only ever reduce exposure, so it doesn't apply to them.
    """
    if symbol not in {p.symbol for p in market.players()}:
        raise OrderError(404, f"unknown symbol {symbol!r}")
    if side not in ("buy", "sell", "short", "cover"):
        raise OrderError(400, f"side must be buy, sell, short or cover, not {side!r}")
    if not 1 <= leverage <= MAX_LEVERAGE:
        raise OrderError(400, f"leverage must be 1 to {MAX_LEVERAGE}")
    cash, held, _ = _balance(db, user_id, symbol)
    check_direction(side, symbol, held, qty)
    order_id = f"ord_{secrets.token_hex(6)}"
    quote = market.quote(symbol)
    quoted = quote.ask if engine_side(side) == "buy" else quote.bid
    quoted_cents = to_cents(quoted) if quoted is not None else None

    if side in ("buy", "short"):  # each share bought or shorted uses up its price (+ fee) of buying power
        available = buying_power(db, market, user_id, leverage, exclude=own_open_order)
        engine_fills, why = _in_chunks(market, user_id, symbol, engine_side(side), qty, available,
                                       limit_price_cents)
        if why in (NOT_ENOUGH_CASH, NOT_ENOUGH_COLLATERAL) and leverage > 1:
            why = NOT_ENOUGH_BUYING_POWER
    elif side == "cover":  # only lowers exposure, so always allowed (borrowing if cash runs short)
        engine_fills, why = _in_chunks(market, user_id, symbol, "buy", qty, None, limit_price_cents)
    else:
        reserved = reserved_shares(db, user_id, symbol, exclude=own_open_order)
        if qty > held - reserved:
            note = f" ({reserved} reserved for open orders)" if reserved else ""
            raise OrderError(400, f"you hold {held} {symbol}{note}, so you can't sell {qty}")
        engine_fills, why = _sell(market, user_id, symbol, qty, limit_price_cents)

    if not engine_fills:
        status = 400 if why in (NOT_ENOUGH_CASH, NOT_ENOUGH_COLLATERAL, NOT_ENOUGH_BUYING_POWER) else 409
        raise OrderError(status, why or "the order could not be filled")
    outcome = _record(db, order_id, user_id, symbol, side, qty, engine_fills, why, reason, quoted_cents)
    outcome.leverage = leverage if side in ("buy", "short") else 1
    return outcome


def _in_chunks(market: MarketEngine, user_id: str, symbol: str, side: Literal["buy", "sell"], qty: int,
               cash: int | None, limit_price_cents: int | None = None) -> tuple[list[Fill], str | None]:
    """Send ``qty`` to the engine in chunks, never committing more than ``cash``
    (``None``: no budget, for covers).

    Buying a share costs its price plus the fee. Shorting one ties up the same
    amount of free cash (the proceeds come in, 200% of the value is held back),
    so both use the same budget rule. The check uses the current best price plus
    a 2% buffer, and the real fills are counted after each chunk.
    """
    buying = side == "buy"
    fills: list[Fill] = []
    committed = 0
    remaining = qty
    while remaining > 0:
        quote = market.quote(symbol)
        best = quote.ask if buying else quote.bid
        if best is None:
            return fills, "market makers ran out of shares" if buying else "market makers ran out of cash"
        if limit_price_cents is not None and (to_cents(best) > limit_price_cents if buying
                                              else to_cents(best) < limit_price_cents):
            return fills, PRICE_MOVED
        worst_price = to_cents(best) * (1 + CHUNK_PRICE_BUFFER)
        if limit_price_cents is not None and buying:
            worst_price = min(worst_price, limit_price_cents)  # never pays over the limit
        # +1 cent a share covers per-fill fee rounding (matches open_orders.buy_reservation)
        worst_cost_per_share = worst_price * (1 + float(FEE_RATE)) + 1
        affordable = remaining if cash is None else math.floor((cash - committed) / worst_cost_per_share)
        chunk = min(remaining, BUY_CHUNK, affordable)
        if chunk <= 0:
            return fills, NOT_ENOUGH_CASH if buying else NOT_ENOUGH_COLLATERAL
        result = market.submit_order(account_id=user_id, symbol=symbol, side=side, qty=chunk)
        for fill in result.fills:
            notional = to_cents(fill.price) * fill.qty
            committed += notional + fee_cents(notional)
            fills.append(fill)
        remaining -= result.filled_qty
        if result.status != "filled":
            return fills, result.reason or ("market makers ran out of shares" if buying
                                            else "market makers ran out of cash")
    return fills, None


def _sell(market: MarketEngine, user_id: str, symbol: str, qty: int,
          limit_price_cents: int | None) -> tuple[list[Fill], str | None]:
    if limit_price_cents is None:  # plain market sell: one go
        result = market.submit_order(account_id=user_id, symbol=symbol, side="sell", qty=qty)
        return list(result.fills), None if result.status == "filled" else result.reason
    fills: list[Fill] = []
    remaining = qty
    while remaining > 0:  # limit sell: chunks, checking the bid before each
        bid = market.quote(symbol).bid
        if bid is None:
            return fills, "market makers ran out of cash"
        if to_cents(bid) < limit_price_cents:
            return fills, PRICE_MOVED
        result = market.submit_order(account_id=user_id, symbol=symbol, side="sell", qty=min(remaining, BUY_CHUNK))
        fills.extend(result.fills)
        remaining -= result.filled_qty
        if result.status != "filled":
            return fills, result.reason or "market makers ran out of cash"
    return fills, None


def _balance(db: Database, user_id: str, symbol: str | None) -> tuple[int, int, int]:
    """(cash_cents, position qty, position cost basis cents). Negative qty = short;
    the cost basis is always positive (for a short, what the shares were sold for)."""
    with db.lock:
        cash = db.conn.execute("SELECT cash_cents FROM users WHERE user_id = ?", (user_id,)).fetchone()
        pos = db.conn.execute(
            "SELECT qty, cost_basis_cents FROM positions WHERE user_id = ? AND symbol = ?",
            (user_id, symbol),
        ).fetchone()
    if cash is None:
        raise OrderError(404, "unknown user")
    return cash[0], (pos[0] if pos else 0), (pos[1] if pos else 0)


def _record(db: Database, order_id: str, user_id: str, symbol: str, side: OrderSide, qty: int,
            engine_fills: list[Fill], why: str | None, fill_reason: str = "market",
            quoted_cents: int | None = None) -> OrderOutcome:
    recorded: list[RecordedFill] = []
    with db.lock, db.conn:  # one transaction: all fills, cash and position, or nothing
        cash, held, basis = _balance(db, user_id, symbol)
        for fill in engine_fills:
            price = to_cents(fill.price)
            notional = price * fill.qty
            fee = fee_cents(notional)
            if side == "buy":
                cash -= notional + fee
                held += fill.qty
                basis += notional
            elif side == "sell":
                cash += notional - fee
                basis -= round(basis * fill.qty / held)
                held -= fill.qty
            elif side == "short":     # proceeds come in; basis = what the shares were sold for
                cash += notional - fee
                held -= fill.qty
                basis += notional
            else:                     # cover: pay to buy back; release that share of the basis
                cash -= notional + fee
                basis -= round(basis * fill.qty / -held)
                held += fill.qty
            trade = RecordedFill(f"t_{secrets.token_hex(6)}", fill.qty, price, fee, fill.t, fill.counterparty)
            db.conn.execute(
                "INSERT INTO trades (trade_id, order_id, user_id, symbol, side, qty, price_cents,"
                " fee_cents, t, reason, counterparty, quoted_price_cents)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (trade.trade_id, order_id, user_id, symbol, side, trade.qty, price, fee, trade.t,
                 fill_reason, trade.counterparty, quoted_cents),
            )
            recorded.append(trade)
        # Cash may now be negative: a margin loan from a leveraged buy (P2-15). Buying power
        # is checked before an order is sent, so only buys/shorts within it ever get here.
        db.conn.execute("UPDATE users SET cash_cents = ? WHERE user_id = ?", (cash, user_id))
        if held == 0:
            db.conn.execute("DELETE FROM positions WHERE user_id = ? AND symbol = ?", (user_id, symbol))
        else:
            db.conn.execute(
                "INSERT INTO positions (user_id, symbol, qty, cost_basis_cents) VALUES (?, ?, ?, ?)"
                " ON CONFLICT (user_id, symbol) DO UPDATE SET qty = excluded.qty,"
                " cost_basis_cents = excluded.cost_basis_cents",
                (user_id, symbol, held, basis),
            )
    filled = sum(f.qty for f in recorded)
    return OrderOutcome(order_id, "filled" if filled == qty else "partially_filled", symbol, side,
                        qty, cash, held, recorded, None if filled == qty else why,
                        quoted_best_cents=quoted_cents)
