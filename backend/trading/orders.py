"""Market orders: check the user can afford it, trade with the engine, update the ledger.

How a buy works:
- It's sent to the engine in chunks of up to 10 shares.
- Before each chunk, the user's remaining cash is checked against the current
  ask, plus a small buffer and the fee.
- So an order can never spend cash the user doesn't have. If they run out,
  or the makers run out of shares, the order stops and comes back
  ``partially_filled``.

A sell is checked against the user's holdings and sent in one go. Short
selling arrives in P2-14.

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

from .db import Database
from .market_contract import Fill, MarketEngine, Side
from .money import to_cents

FEE_RATE = Decimal("0.001")      # 0.10% of notional (matches Person 4's mission copy)
BUY_CHUNK = 10                   # shares per engine call for buys
CHUNK_PRICE_BUFFER = 0.02        # allow 2% slippage within one chunk when checking cash


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
    side: Side
    requested_qty: int
    cash_cents_after: int
    position_qty_after: int
    fills: list[RecordedFill] = field(default_factory=list)
    reason: str | None = None    # why it was only partly filled

    @property
    def filled_qty(self) -> int:
        return sum(f.qty for f in self.fills)

    @property
    def total_fee_cents(self) -> int:
        return sum(f.fee_cents for f in self.fills)

    @property
    def average_price_cents(self) -> float:
        return sum(f.qty * f.price_cents for f in self.fills) / self.filled_qty


def fee_cents(notional_cents: int) -> int:
    return int((Decimal(notional_cents) * FEE_RATE).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def place_market_order(db: Database, market: MarketEngine, user_id: str,
                       symbol: str, side: Side, qty: int) -> OrderOutcome:
    if symbol not in {p.symbol for p in market.players()}:
        raise OrderError(404, f"unknown symbol {symbol!r}")
    cash, held, _ = _balance(db, user_id, symbol)
    order_id = f"ord_{secrets.token_hex(6)}"

    if side == "buy":
        engine_fills, reason = _buy_in_chunks(market, user_id, symbol, qty, cash)
    elif side == "sell":
        if qty > held:
            raise OrderError(400, f"you hold {held} {symbol}, so you can't sell {qty}")
        result = market.submit_order(account_id=user_id, symbol=symbol, side="sell", qty=qty)
        engine_fills = list(result.fills)
        reason = None if result.status == "filled" else result.reason
    else:
        raise OrderError(400, f"side must be 'buy' or 'sell', not {side!r}")

    if not engine_fills:
        raise OrderError(400 if reason == "not enough cash" else 409,
                         reason or "the order could not be filled")
    return _record(db, order_id, user_id, symbol, side, qty, engine_fills, reason)


def _buy_in_chunks(market: MarketEngine, user_id: str, symbol: str, qty: int,
                   cash: int) -> tuple[list[Fill], str | None]:
    fills: list[Fill] = []
    committed = 0
    remaining = qty
    while remaining > 0:
        ask = market.quote(symbol).ask
        if ask is None:
            return fills, "market makers ran out of shares"
        worst_cost_per_share = to_cents(ask) * (1 + CHUNK_PRICE_BUFFER) * (1 + float(FEE_RATE))
        affordable = math.floor((cash - committed) / worst_cost_per_share)
        chunk = min(remaining, BUY_CHUNK, affordable)
        if chunk <= 0:
            return fills, "not enough cash"
        result = market.submit_order(account_id=user_id, symbol=symbol, side="buy", qty=chunk)
        for fill in result.fills:
            notional = to_cents(fill.price) * fill.qty
            committed += notional + fee_cents(notional)
            fills.append(fill)
        remaining -= result.filled_qty
        if result.status != "filled":
            return fills, result.reason or "market makers ran out of shares"
    return fills, None


def _balance(db: Database, user_id: str, symbol: str) -> tuple[int, int, int]:
    """(cash_cents, position qty, position cost basis cents)."""
    with db.lock:
        cash = db.conn.execute("SELECT cash_cents FROM users WHERE user_id = ?", (user_id,)).fetchone()
        pos = db.conn.execute(
            "SELECT qty, cost_basis_cents FROM positions WHERE user_id = ? AND symbol = ?",
            (user_id, symbol),
        ).fetchone()
    if cash is None:
        raise OrderError(404, "unknown user")
    return cash[0], (pos[0] if pos else 0), (pos[1] if pos else 0)


def _record(db: Database, order_id: str, user_id: str, symbol: str, side: Side, qty: int,
            engine_fills: list[Fill], reason: str | None) -> OrderOutcome:
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
            else:
                cash += notional - fee
                basis -= round(basis * fill.qty / held)
                held -= fill.qty
            trade = RecordedFill(f"t_{secrets.token_hex(6)}", fill.qty, price, fee, fill.t, fill.counterparty)
            db.conn.execute(
                "INSERT INTO trades (trade_id, order_id, user_id, symbol, side, qty, price_cents,"
                " fee_cents, t, reason, counterparty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'market', ?)",
                (trade.trade_id, order_id, user_id, symbol, side, trade.qty, price, fee, trade.t,
                 trade.counterparty),
            )
            recorded.append(trade)
        if cash < 0:
            raise OrderError(500, "ledger check failed: cash would go negative")  # rolls back
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
                        qty, cash, held, recorded, None if filled == qty else reason)
