"""P2-15: margin calls and liquidation.

**Margin ratio = equity / gross exposure** (every position's value, long or
short, at the last price). A fresh 3x position starts at 33%. Unleveraged
long-only accounts sit at 100% or more and are never margin-called.

On every market tick the monitor checks each account with positions:

| Margin ratio | Status | What happens |
|---|---|---|
| 30% or more | ``ok`` | nothing |
| under 30% | ``warning`` | a heads-up |
| under 25% | ``margin_call`` | sell or cover within 3 market minutes (15 real seconds) |
| under 20%, or the margin call runs out | liquidation | positions are sold for you |

**Liquidation** cancels the account's open orders, then closes positions,
biggest first, at the market (trades recorded with ``reason="liquidation"``)
until the ratio is back to 35%, or everything is closed. If equity is zero or
less, everything is closed. Liquidation trades get Solana receipts like any
other.

**Getting better** needs a point of headroom (e.g. 31% to leave ``warning``),
so a ratio wobbling around a line doesn't flood the player with messages.

Every status change is pushed to the player over the WebSocket as
``{"type": "margin", ...}`` (see ``margin_message``). The status and the margin
call's deadline are stored on the user, so the portfolio can show them.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import math
import time
from collections.abc import Callable
from dataclasses import dataclass

from .db import Database
from .live import fill_message
from .market_contract import MarketEngine, MarketTick
from .money import to_cents, to_hoop
from .orders import MAX_LEVERAGE, Exposure, OrderError, OrderOutcome, buying_power, exposure, place_market_order

log = logging.getLogger("trading.margin")

WARNING_RATIO = 0.30
MAINTENANCE_RATIO = 0.25          # below this: margin call
LIQUIDATION_RATIO = 0.20          # below this: liquidated straight away
LIQUIDATION_TARGET = 0.35         # liquidation sells until the ratio is back here
MARGIN_CALL_GRACE_S = 180.0       # market seconds (3 market minutes = 15 real seconds)
RECOVERY_HEADROOM = 0.01          # improving a status needs this much above the line
MAX_LIQUIDATION_ORDERS = 12       # per account per tick

STATUSES = ("ok", "warning", "margin_call")


def raw_status(ratio: float | None) -> str:
    """The status for a margin ratio, ignoring history. Below LIQUIDATION_RATIO is ``liquidate``."""
    if ratio is None or ratio >= WARNING_RATIO:
        return "ok"
    if ratio >= MAINTENANCE_RATIO:
        return "warning"
    if ratio >= LIQUIDATION_RATIO:
        return "margin_call"
    return "liquidate"


def next_status(ratio: float | None, previous: str) -> str:
    """Like ``raw_status``, but moving to a better status needs RECOVERY_HEADROOM."""
    status = raw_status(ratio)
    if status == "liquidate" or previous not in STATUSES:
        return status
    if STATUSES.index(status) < STATUSES.index(previous) and ratio is not None:
        if raw_status(ratio - RECOVERY_HEADROOM) != status:
            return previous  # not clearly better yet
    return status


@dataclass(frozen=True)
class MarginView:
    status: str                    # ok | warning | margin_call
    exposure: Exposure
    deadline_t: float | None       # market time a margin call liquidates at
    buying_power_cents: int        # at 1x
    buying_power_max_cents: int    # at MAX_LEVERAGE

    @property
    def leverage(self) -> float | None:
        e = self.exposure
        if not e.gross_cents:
            return 0.0
        return e.gross_cents / e.equity_cents if e.equity_cents > 0 else None


def margin_view(db: Database, market: MarketEngine, user_id: str) -> MarginView:
    """The account's margin as the monitor last judged it, with live numbers."""
    with db.lock:
        row = db.conn.execute("SELECT margin_status, margin_call_t FROM users WHERE user_id = ?",
                              (user_id,)).fetchone()
    status = row["margin_status"] if row else "ok"
    deadline = row["margin_call_t"] + MARGIN_CALL_GRACE_S if row and row["margin_call_t"] is not None else None
    return MarginView(status, exposure(db, market, user_id), deadline,
                      buying_power(db, market, user_id, 1), buying_power(db, market, user_id, MAX_LEVERAGE))


def _pct(ratio: float | None) -> float | None:
    return None if ratio is None else round(100 * ratio, 2)


def margin_message(event: str, status: str, e: Exposure, deadline_t: float | None = None,
                   liquidated: list[OrderOutcome] | None = None) -> dict:
    """Live update. ``event``: warning, margin_call, liquidated or ok."""
    pct = _pct(e.margin_ratio)
    texts = {
        "warning": f"Margin warning: your margin is {pct}%. Below {MAINTENANCE_RATIO:.0%} you get a margin call.",
        "margin_call": (f"MARGIN CALL: your margin is {pct}%. Sell or cover to get back above "
                        f"{MAINTENANCE_RATIO:.0%} within {MARGIN_CALL_GRACE_S / 12:.0f} seconds, "
                        "or your positions will be sold for you."),
        "liquidated": "Liquidated: positions were sold for you to bring your margin back up.",
        "ok": "Your margin is back to normal.",
    }
    return {
        "type": "margin", "event": event, "status": status, "message": texts[event],
        "margin_ratio_pct": pct, "equity": to_hoop(e.equity_cents), "gross_exposure": to_hoop(e.gross_cents),
        "cash": to_hoop(e.cash_cents), "deadline_t": deadline_t,
        "warning_pct": 100 * WARNING_RATIO, "maintenance_pct": 100 * MAINTENANCE_RATIO,
        "liquidation_pct": 100 * LIQUIDATION_RATIO,
        "liquidated": [{"order_id": o.order_id, "symbol": o.symbol, "side": o.side, "qty": o.filled_qty,
                        "average_price": round(o.average_price_cents / 100, 4)} for o in liquidated or ()],
    }


def liquidate(db: Database, market: MarketEngine, user_id: str,
              target: float = LIQUIDATION_TARGET) -> list[OrderOutcome]:
    """Cancel open orders, then close positions biggest first until the margin ratio
    reaches ``target`` (or everything is closed). Returns the market orders made."""
    with db.lock, db.conn:
        db.conn.execute(
            "UPDATE open_orders SET status = 'cancelled', reserved_cash_cents = 0, reason = 'liquidation',"
            " updated_at = ? WHERE user_id = ? AND status = 'open'", (time.time(), user_id))
    orders: list[OrderOutcome] = []
    for _ in range(MAX_LIQUIDATION_ORDERS):
        e = exposure(db, market, user_id)
        if not e.gross_cents or (e.margin_ratio is not None and e.margin_ratio >= target):
            break
        with db.lock:
            rows = db.conn.execute("SELECT symbol, qty FROM positions WHERE user_id = ?", (user_id,)).fetchall()
        symbol, qty = max(rows, key=lambda r: abs(r[1]) * to_cents(market.last_price(r[0])))
        price = to_cents(market.last_price(symbol))
        if e.equity_cents <= 0:
            take = abs(qty)
        else:  # shares to close so that equity / (gross - closed) >= target, plus 10% for slippage
            needed = (e.gross_cents - e.equity_cents / target) / price
            take = min(abs(qty), max(1, math.ceil(needed * 1.1)))
        try:
            outcome = place_market_order(db, market, user_id, symbol, "sell" if qty > 0 else "cover", take,
                                         reason="liquidation")
        except OrderError as error:
            log.warning("liquidating %s %s for %s failed: %s", take, symbol, user_id, error.message)
            break  # no liquidity right now: try again next tick
        orders.append(outcome)
    return orders


class MarginMonitor:
    """Checks every account's margin on each market tick (P2-15)."""

    def __init__(self, db: Database, market: MarketEngine,
                 on_fill: Callable[[str], None] | None = None,
                 notify_user: Callable[[str, dict], None] | None = None) -> None:
        self.db = db
        self.market = market
        self.on_fill = on_fill            # each liquidation order id (for Solana receipts)
        self.notify_user = notify_user    # notify_user(user_id, message), the WebSocket hub
        self._queue = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._queue = self.market.subscribe()
        self._task = asyncio.create_task(self._run(), name="margin-monitor")

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
                    self.check(event.t)
                except Exception:
                    log.exception("checking margins failed")

    def check(self, t: float) -> dict[str, str]:
        """Judge every account with positions (or a non-ok status). Returns {user_id: event} for changes."""
        with self.db.lock:
            rows = self.db.conn.execute(
                "SELECT user_id, margin_status, margin_call_t FROM users WHERE margin_status != 'ok'"
                " OR user_id IN (SELECT DISTINCT user_id FROM positions)").fetchall()
        events = {}
        for user_id, previous, call_t in rows:
            event = self._check_user(user_id, previous, call_t, t)
            if event:
                events[user_id] = event
        return events

    def _check_user(self, user_id: str, previous: str, call_t: float | None, t: float) -> str | None:
        e = exposure(self.db, self.market, user_id)
        status = next_status(e.margin_ratio, previous)
        expired = status == "margin_call" and call_t is not None and t - call_t >= MARGIN_CALL_GRACE_S
        if status == "liquidate" or expired:
            orders = liquidate(self.db, self.market, user_id)
            e = exposure(self.db, self.market, user_id)
            status = next_status(e.margin_ratio, "ok") if orders else "margin_call"
            if status == "liquidate":
                status = "margin_call"  # couldn't get it all done this tick: try again on the next
            self._save(user_id, status, None if status != "margin_call" else (call_t or t))
            for outcome in orders:
                if self.on_fill:
                    self.on_fill(outcome.order_id)
                self._tell(user_id, fill_message(outcome, "liquidation"))
            if orders:
                self._tell(user_id, margin_message("liquidated", status, e, liquidated=orders))
                return "liquidated"
            if previous != "margin_call":  # nothing could be sold yet: at least tell them
                self._tell(user_id, margin_message("margin_call", status, e, (call_t or t) + MARGIN_CALL_GRACE_S))
                return "margin_call"
            return None
        if status == previous:
            return None
        new_call_t = (call_t or t) if status == "margin_call" else None
        self._save(user_id, status, new_call_t)
        deadline = new_call_t + MARGIN_CALL_GRACE_S if new_call_t is not None else None
        self._tell(user_id, margin_message(status, status, e, deadline))
        return status

    def _save(self, user_id: str, status: str, call_t: float | None) -> None:
        with self.db.lock, self.db.conn:
            self.db.conn.execute("UPDATE users SET margin_status = ?, margin_call_t = ? WHERE user_id = ?",
                                 (status, call_t, user_id))

    def _tell(self, user_id: str, message: dict) -> None:
        if self.notify_user:
            self.notify_user(user_id, message)
