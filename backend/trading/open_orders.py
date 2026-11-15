"""P2-11: limit and stop-loss orders.

Person 1's engine has no resting order book, so orders that wait for a price
live here.

**While open**, they hold back what they'll need, so the player can't spend it
twice:
- A buy limit reserves enough cash to buy at its limit price, including the fee.
- A sell limit or stop-loss reserves the shares.

**On every market tick**, the watcher fires an order as a market order once its
price is reached:
- **Buy limit:** fires when the ask ≤ the limit. It fills only while the ask
  stays at or under the limit.
- **Sell limit** (take-profit): fires when the bid ≥ the limit. It fills only
  while the bid stays at or over the limit.
- **Stop-loss** (sell only): fires when the last price ≤ the trigger, then
  sells at the market. A stop-loss is about getting out, not getting a price.

**Partial fills:** if an order only partly fills (the price slipped back, or
the makers ran out), the rest stays open and tries again on later ticks.
Trades it makes are recorded with ``reason`` ``limit`` or ``stop`` and get
Solana receipts like any order.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import math
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass

from .db import Database
from .live import fill_message, open_order_message
from .market_contract import MarketEngine, MarketTick
from .money import to_cents
from .orders import (
    FEE_RATE,
    PRICE_MOVED,
    OrderError,
    _balance,
    check_direction,
    free_cash,
    place_market_order,
    reserved_shares,
)

log = logging.getLogger("trading.open_orders")


@dataclass(frozen=True)
class OpenOrder:
    order_id: str
    user_id: str
    symbol: str
    side: str
    order_type: str
    price_cents: int
    qty: int
    filled_qty: int
    reserved_cash_cents: int
    status: str
    reason: str | None
    last_fill_order_id: str | None
    created_t: float

    @property
    def remaining_qty(self) -> int:
        return self.qty - self.filled_qty


def buy_reservation(qty: int, price_cents: int) -> int:
    """Cash a buy limit holds back: qty at the limit price plus the fee, plus a cent a share for rounding."""
    return math.ceil(qty * (price_cents * (1 + float(FEE_RATE)) + 1))


def _row(row) -> OpenOrder:
    return OpenOrder(row["order_id"], row["user_id"], row["symbol"], row["side"], row["order_type"],
                     row["price_cents"], row["qty"], row["filled_qty"], row["reserved_cash_cents"],
                     row["status"], row["reason"], row["last_fill_order_id"], row["created_t"])


def get_open_order(db: Database, order_id: str) -> OpenOrder | None:
    with db.lock:
        row = db.conn.execute("SELECT * FROM open_orders WHERE order_id = ?", (order_id,)).fetchone()
    return _row(row) if row else None


def list_open_orders(db: Database, user_id: str, include_closed: bool = False) -> list[OpenOrder]:
    sql = "SELECT * FROM open_orders WHERE user_id = ?" + ("" if include_closed else " AND status = 'open'")
    with db.lock:
        rows = db.conn.execute(sql + " ORDER BY rowid DESC", (user_id,)).fetchall()
    return [_row(r) for r in rows]


def create_open_order(db: Database, market: MarketEngine, user_id: str, *, symbol: str, side: str,
                      order_type: str, qty: int, price_cents: int) -> OpenOrder:
    if symbol not in {p.symbol for p in market.players()}:
        raise OrderError(404, f"unknown symbol {symbol!r}")
    if order_type == "stop" and side != "sell":
        raise OrderError(400, "a stop-loss sells shares you hold; use a limit order to buy")
    last = to_cents(market.last_price(symbol))
    if order_type == "stop" and price_cents >= last:
        raise OrderError(400, "a stop-loss must be below the current price")

    _, held, _ = _balance(db, user_id, symbol)
    check_direction(side, symbol, held, qty)  # no buy limits while short, no sells of a short (P2-14)
    reserve = 0
    if side == "buy":
        reserve = buy_reservation(qty, price_cents)
        if reserve > free_cash(db, market, user_id):
            raise OrderError(400, "not enough cash to reserve this order and its fees")
    else:
        already = reserved_shares(db, user_id, symbol)
        if qty > held - already:
            note = f" ({already} already reserved for open orders)" if already else ""
            raise OrderError(400, f"you hold {held} {symbol}{note}, so you can't sell {qty}")

    order_id = f"oo_{secrets.token_hex(6)}"
    with db.lock, db.conn:
        db.conn.execute(
            "INSERT INTO open_orders (order_id, user_id, symbol, side, order_type, price_cents, qty,"
            " reserved_cash_cents, created_t, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (order_id, user_id, symbol, side, order_type, price_cents, qty, reserve, market.market_time(),
             time.time()),
        )
    return get_open_order(db, order_id)


def cancel_open_order(db: Database, user_id: str, order_id: str) -> OpenOrder:
    order = get_open_order(db, order_id)
    if order is None or order.user_id != user_id:
        raise OrderError(404, "no such open order")
    if order.status != "open":
        raise OrderError(409, f"this order is already {order.status}")
    with db.lock, db.conn:
        db.conn.execute(
            "UPDATE open_orders SET status = 'cancelled', reserved_cash_cents = 0, updated_at = ?"
            " WHERE order_id = ? AND status = 'open'", (time.time(), order_id))
    return get_open_order(db, order_id)


def is_triggered(order: OpenOrder, bid: float | None, ask: float | None, last: float) -> bool:
    if order.order_type == "stop":
        return to_cents(last) <= order.price_cents
    if order.side == "buy":
        return ask is not None and to_cents(ask) <= order.price_cents
    return bid is not None and to_cents(bid) >= order.price_cents


class OrderWatcher:
    """Checks open orders against every market tick and fires the ones whose price is reached."""

    def __init__(self, db: Database, market: MarketEngine,
                 on_fill: Callable[[str], None] | None = None,
                 notify_user: Callable[[str, dict], None] | None = None) -> None:
        self.db = db
        self.market = market
        self.on_fill = on_fill           # called with each market order id it creates (for receipts)
        self.notify_user = notify_user   # notify_user(user_id, message) for live updates (P2-13)
        self._queue = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._queue = self.market.subscribe()
        self._task = asyncio.create_task(self._run(), name="open-order-watcher")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        if self._queue is not None:
            self.market.unsubscribe(self._queue)

    async def _run(self) -> None:
        while True:
            event = await self._queue.get()
            if isinstance(event, MarketTick):
                try:
                    self.check(event)
                except Exception:
                    log.exception("checking open orders failed")

    def check(self, tick: MarketTick) -> list[str]:
        """Fire every open order whose price this tick reaches. Returns the market order ids created."""
        with self.db.lock:
            rows = self.db.conn.execute("SELECT * FROM open_orders WHERE status = 'open' ORDER BY rowid").fetchall()
        fired = []
        for order in map(_row, rows):
            quote = tick.quotes.get(order.symbol)
            if quote and is_triggered(order, quote.bid, quote.ask, quote.last):
                market_order_id = self._fire(order)
                if market_order_id:
                    fired.append(market_order_id)
        return fired

    def _fire(self, order: OpenOrder) -> str | None:
        try:
            outcome = place_market_order(
                self.db, self.market, order.user_id, order.symbol, order.side, order.remaining_qty,
                reason=order.order_type,
                limit_price_cents=order.price_cents if order.order_type == "limit" else None,
                own_open_order=order.order_id,
            )
        except OrderError as error:
            if error.status_code == 409 or error.message == PRICE_MOVED:
                return None  # price slipped back or no liquidity: try again next tick
            self._update(order.order_id, status="failed", reason=error.message, reserved=0)
            self._tell(order.user_id, "failed", order.order_id)
            return None

        filled = order.filled_qty + outcome.filled_qty
        done = filled >= order.qty
        reserved = 0 if done or order.side == "sell" else buy_reservation(order.qty - filled, order.price_cents)
        self._update(order.order_id, status="filled" if done else "open", filled=filled, reserved=reserved,
                     last_fill=outcome.order_id)
        if self.on_fill:
            self.on_fill(outcome.order_id)
        if self.notify_user:
            self.notify_user(order.user_id, fill_message(outcome, order.order_type))
        self._tell(order.user_id, "filled" if done else "fired", order.order_id)
        return outcome.order_id

    def _tell(self, user_id: str, event: str, order_id: str) -> None:
        if self.notify_user:
            self.notify_user(user_id, open_order_message(get_open_order(self.db, order_id), event))

    def _update(self, order_id: str, *, status: str, reserved: int, reason: str | None = None,
                filled: int | None = None, last_fill: str | None = None) -> None:
        with self.db.lock, self.db.conn:
            self.db.conn.execute(
                "UPDATE open_orders SET status = ?, reserved_cash_cents = ?, reason = coalesce(?, reason),"
                " filled_qty = coalesce(?, filled_qty), last_fill_order_id = coalesce(?, last_fill_order_id),"
                " updated_at = ? WHERE order_id = ?",
                (status, reserved, reason, filled, last_fill, time.time(), order_id),
            )
