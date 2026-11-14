"""MOCK ONLY - stand-in for Person 2's accounts and trading.

Implements TradesAdapter with an in-memory store. Market orders fill at the
best ask (buy, cover) or best bid (sell, short) with a 0.10% fee. Every user
starts with 100,000 HOOP. No margin, limits or liquidations. Swap for the real
adapter at merge.

place_market_order() is mock-only: in the real app the user trades through
Person 2's API, and the learning layer only reads trades and portfolios.
"""

from __future__ import annotations

import itertools

from .base import MarketAdapter
from .models import Portfolio, Position, Side, Trade

START_CASH = 100_000.0
FEE_RATE = 0.001


class MockOrderError(ValueError):
    pass


class _Account:
    def __init__(self) -> None:
        self.cash = START_CASH
        self.positions: dict[str, Position] = {}
        self.trades: list[Trade] = []


class MockTrades:
    """MOCK TradesAdapter (in-memory)."""

    def __init__(self, market: MarketAdapter) -> None:
        self._market = market
        self._accounts: dict[str, _Account] = {}
        self._ids = itertools.count(1)

    def _acct(self, user_id: str) -> _Account:
        return self._accounts.setdefault(user_id, _Account())

    # ---- mock-only write path -----------------------------------------
    def place_market_order(self, user_id: str, symbol: str, side: Side, qty: float) -> Trade:
        if qty <= 0:
            raise MockOrderError("qty must be positive")
        tick = self._market.get_tick(symbol)
        if tick is None:
            raise MockOrderError(f"unknown symbol {symbol!r}")

        acct = self._acct(user_id)
        pos = acct.positions.get(symbol)
        held = pos.qty if pos else 0.0
        price = tick.best_ask if side in ("buy", "cover") else tick.best_bid
        notional = price * qty
        fee = round(notional * FEE_RATE, 4)

        if side == "buy":
            if held < 0:
                raise MockOrderError("you are short; use cover to buy back")
            if notional + fee > acct.cash + 1e-9:
                raise MockOrderError("not enough cash")
            acct.cash -= notional + fee
            new_qty = held + qty
            avg = ((pos.avg_cost * held) if pos else 0.0) + price * qty
            acct.positions[symbol] = Position(symbol=symbol, qty=new_qty, avg_cost=avg / new_qty)
        elif side == "sell":
            if qty > held + 1e-9:
                raise MockOrderError("cannot sell more than you hold")
            acct.cash += notional - fee
            self._set_qty(acct, symbol, held - qty)
        elif side == "short":
            if held > 0:
                raise MockOrderError("you hold shares; sell them before shorting")
            acct.cash += notional - fee
            new_qty = held - qty
            avg = ((pos.avg_cost * -held) if pos else 0.0) + price * qty
            acct.positions[symbol] = Position(symbol=symbol, qty=new_qty, avg_cost=avg / -new_qty)
        elif side == "cover":
            if qty > -held + 1e-9:
                raise MockOrderError("cannot cover more than you are short")
            if notional + fee > acct.cash + 1e-9:
                raise MockOrderError("not enough cash")
            acct.cash -= notional + fee
            self._set_qty(acct, symbol, held + qty)
        else:  # pragma: no cover - Literal guards this
            raise MockOrderError(f"bad side {side!r}")

        trade = Trade(
            trade_id=f"mock-{next(self._ids)}",
            user_id=user_id,
            symbol=symbol,
            side=side,
            qty=qty,
            price=price,
            fee=fee,
            t=tick.t,
            reason="market",
        )
        acct.trades.append(trade)
        return trade

    @staticmethod
    def _set_qty(acct: _Account, symbol: str, qty: float) -> None:
        if abs(qty) < 1e-9:
            acct.positions.pop(symbol, None)
        else:
            acct.positions[symbol] = acct.positions[symbol].model_copy(update={"qty": qty})

    # ---- TradesAdapter -------------------------------------------------
    def trades_for_user(self, user_id: str, since_t: float | None = None) -> list[Trade]:
        trades = self._acct(user_id).trades
        if since_t is None:
            return list(trades)
        return [tr for tr in trades if tr.t >= since_t]

    def portfolio(self, user_id: str) -> Portfolio:
        acct = self._acct(user_id)
        equity = acct.cash
        for p in acct.positions.values():
            tick = self._market.get_tick(p.symbol)
            mark = tick.price if tick else p.avg_cost
            equity += p.qty * mark
        return Portfolio(
            cash=round(acct.cash, 4),
            equity=round(equity, 4),
            positions=list(acct.positions.values()),
        )
