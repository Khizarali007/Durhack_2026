"""P2-21: Person 4's TradesAdapter, backed by the real trading database.

Person 4's mission runner (``backend/learning`` on ``person4-learning``) talks
to trading only through this interface:

    trades_for_user(user_id, since_t=None) -> list[Trade]   # oldest first, t >= since_t
    portfolio(user_id) -> Portfolio                         # cash, equity, positions
    apply_start_state(user_id, cash, positions) -> None     # reset when a mission starts

The returned objects have exactly the fields of Person 4's ``Trade``,
``Portfolio`` and ``Position`` models. They're plain dataclasses, so their code
(attribute access, or ``Model.model_validate(asdict(x))``) works without
importing anything of ours. Money is in HOOP floats and ``t`` is market time in
epoch seconds, as Person 4 expects.

Extra, not in their Protocol:
- ``restore_start_state(user_id)`` brings back the player's real account after
  a mission (see ``resets.py``).
- ``equity_history(user_id, since_t=None)`` gives the player's equity once per
  market minute, for the report card's max drawdown (P2-16, ``equity.py``).

Wiring, in ``backend/main.py`` at merge:
    configure_learning(market_adapter, TradesAdapter(app.state.trading_db))
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from .db import Database
from .equity import equity_history
from .market_contract import MarketEngine
from .market_provider import get_market
from .money import to_cents, to_hoop
from .portfolio import build_portfolio
from .resets import reset_account, restore_account
from .trades import trades_for_user


@dataclass(frozen=True)
class Trade:
    trade_id: str
    user_id: str
    symbol: str
    side: str          # buy | sell | short | cover
    qty: float         # always positive
    price: float       # fill price per share, HOOP
    fee: float         # HOOP
    t: float           # market time, epoch seconds
    reason: str        # market | limit | stop | liquidation


@dataclass(frozen=True)
class Position:
    symbol: str
    qty: float         # negative = short
    avg_cost: float    # HOOP per share


@dataclass(frozen=True)
class EquityPoint:
    t: float           # market time, epoch seconds
    equity: float      # HOOP: cash + positions at the last price


@dataclass(frozen=True)
class Portfolio:
    cash: float
    equity: float      # cash + sum(qty x current price)
    positions: list[Position] = field(default_factory=list)


class TradesAdapter:
    def __init__(self, db: Database, market: Callable[[], MarketEngine] = get_market) -> None:
        self.db = db
        self._market = market

    def trades_for_user(self, user_id: str, since_t: float | None = None) -> list[Trade]:
        return [
            Trade(r.trade_id, r.user_id, r.symbol, r.side, float(r.qty), to_hoop(r.price_cents),
                  to_hoop(r.fee_cents), r.t, r.reason)
            for r in trades_for_user(self.db, user_id, since_t=since_t)
        ]

    def portfolio(self, user_id: str) -> Portfolio:
        view = build_portfolio(self.db, self._market(), user_id)
        return Portfolio(
            cash=to_hoop(view.cash_cents),
            equity=to_hoop(view.equity_cents),
            positions=[Position(p.symbol, float(p.qty), round(p.avg_cost_cents / 100, 4)) for p in view.positions],
        )

    def apply_start_state(self, user_id: str, cash: float, positions: list) -> None:
        """``positions``: anything with ``symbol``, ``qty`` and ``avg_cost`` (Person 4's Position model).
        Negative ``qty`` is a short, with ``avg_cost`` the price it was sold at (P2-14)."""
        start = []
        for p in positions:
            qty = int(round(p.qty))
            if qty != p.qty:
                raise ValueError(f"positions must be whole shares, got {p.qty} {p.symbol}")
            start.append((p.symbol, qty, round(abs(qty) * to_cents(p.avg_cost))))  # short: qty < 0
        reset_account(self.db, self._market(), user_id, to_cents(cash), start)

    def restore_start_state(self, user_id: str) -> bool:
        """Not in Person 4's Protocol: put the player's pre-mission account back."""
        return restore_account(self.db, user_id, self._market())

    def equity_history(self, user_id: str, since_t: float | None = None) -> list[EquityPoint]:
        """Not in Person 4's Protocol: equity once per market minute, oldest first, ``t >= since_t``.
        Max drawdown = the biggest fall from a running peak (``trading.equity.max_drawdown``)."""
        return [EquityPoint(p.t, to_hoop(p.equity_cents)) for p in equity_history(self.db, user_id, since_t=since_t)]
