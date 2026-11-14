"""A user's portfolio: cash, positions marked at the last trade price, and profit/loss.

Every figure is in integer cents, so this always holds exactly:

    equity - starting cash == realised + unrealised - fees paid

- **Unrealised:** for shares still held, `qty x last price - cost basis`.
- **Realised:** for shares already sold, sale proceeds minus the cost basis
  removed. Rebuilt from the user's trades with the same average-cost rule that
  ``orders.py`` uses.
- **Fees** are reported separately and are not in the cost basis.

``build_portfolio`` is also what P2-21's TradesAdapter will hand to Person 4
(cash, equity, positions[symbol, qty, avg_cost]).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from .db import STARTING_CASH_CENTS, Database
from .market_contract import MarketEngine
from .money import to_cents


@dataclass(frozen=True)
class PositionView:
    symbol: str
    name: str | None
    team: str | None
    qty: int
    cost_basis_cents: int
    last_price_cents: int

    @property
    def avg_cost_cents(self) -> float:
        return self.cost_basis_cents / self.qty

    @property
    def market_value_cents(self) -> int:
        return self.qty * self.last_price_cents

    @property
    def unrealised_cents(self) -> int:
        return self.market_value_cents - self.cost_basis_cents


@dataclass(frozen=True)
class PortfolioView:
    user_id: str
    cash_cents: int
    realised_cents: int
    fees_cents: int
    starting_cash_cents: int = STARTING_CASH_CENTS
    positions: list[PositionView] = field(default_factory=list)

    @property
    def positions_value_cents(self) -> int:
        return sum(p.market_value_cents for p in self.positions)

    @property
    def equity_cents(self) -> int:
        return self.cash_cents + self.positions_value_cents

    @property
    def unrealised_cents(self) -> int:
        return sum(p.unrealised_cents for p in self.positions)

    @property
    def total_pnl_cents(self) -> int:
        return self.equity_cents - self.starting_cash_cents


def build_portfolio(db: Database, market: MarketEngine, user_id: str) -> PortfolioView:
    players = {p.symbol: p for p in market.players()}
    with db.lock:
        cash = db.conn.execute("SELECT cash_cents FROM users WHERE user_id = ?", (user_id,)).fetchone()
        rows = db.conn.execute(
            "SELECT symbol, qty, cost_basis_cents FROM positions WHERE user_id = ?", (user_id,)
        ).fetchall()
        trades = db.conn.execute(
            "SELECT symbol, side, qty, price_cents, fee_cents FROM trades WHERE user_id = ? ORDER BY rowid",
            (user_id,),
        ).fetchall()
    if cash is None:
        raise KeyError(user_id)

    positions = []
    for symbol, qty, basis in rows:
        player = players.get(symbol)
        last = to_cents(market.last_price(symbol)) if player else round(basis / qty)
        positions.append(PositionView(symbol, player.name if player else None,
                                      player.team if player else None, qty, basis, last))
    positions.sort(key=lambda p: p.market_value_cents, reverse=True)

    realised, fees = _realised_and_fees(trades)
    return PortfolioView(user_id, cash[0], realised, fees, positions=positions)


def _realised_and_fees(trades) -> tuple[int, int]:
    """Replay fills with the average-cost rule from orders.py."""
    held: dict[str, int] = defaultdict(int)
    basis: dict[str, int] = defaultdict(int)
    realised = fees = 0
    for symbol, side, qty, price, fee in trades:
        fees += fee
        if side == "buy":
            held[symbol] += qty
            basis[symbol] += price * qty
        elif side == "sell":
            removed = round(basis[symbol] * qty / held[symbol])
            realised += price * qty - removed
            basis[symbol] -= removed
            held[symbol] -= qty
        # short / cover: P2-14
    return realised, fees
