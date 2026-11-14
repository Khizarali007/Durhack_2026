"""A user's portfolio: cash, positions marked at the last trade price, and profit/loss.

Every figure is in integer cents, so this always holds exactly:

    equity - starting cash == realised + unrealised - fees paid + payouts received + pending rights

- **Unrealised:** for shares still held, `qty x last price - cost basis`.
  For a short (P2-14) it's reversed: `what they were sold for - what buying
  them back costs now`, so it grows as the price falls and shrinks (then goes
  negative, without limit) as it rises.
- **Realised:** for shares already sold, sale proceeds minus the cost basis
  removed. For covered shorts, what they were sold for minus what buying them
  back cost. Rebuilt from the user's trades with the same average-cost rule
  that ``orders.py`` uses.
- **Fees** are reported separately and are not in the cost basis.

A short's sale proceeds sit in cash and its market value is negative (you owe
the shares), so `equity = cash + positions value` still holds.

``build_portfolio`` is also what P2-21's TradesAdapter will hand to Person 4
(cash, equity, positions[symbol, qty, avg_cost]).
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field

from .db import STARTING_CASH_CENTS, Database
from .market_contract import MarketEngine
from .money import to_cents, market_mark
from .dividends import pending_by_user


@dataclass(frozen=True)
class PositionView:
    symbol: str
    name: str | None
    team: str | None
    qty: int                     # negative = short (P2-14)
    cost_basis_cents: int        # always positive: paid for a long, received for a short
    last_price_cents: int
    mark_price_cents: int | None = None

    @property
    def is_short(self) -> bool:
        return self.qty < 0

    @property
    def avg_cost_cents(self) -> float:
        """Average entry price per share: paid (long) or sold at (short)."""
        return self.cost_basis_cents / abs(self.qty)

    @property
    def market_value_cents(self) -> int:
        """Negative for a short: what you'd owe to buy the shares back."""
        return self.qty * (self.mark_price_cents if self.mark_price_cents is not None else self.last_price_cents)

    @property
    def unrealised_cents(self) -> int:
        signed_basis = -self.cost_basis_cents if self.is_short else self.cost_basis_cents
        return self.market_value_cents - signed_basis


@dataclass(frozen=True)
class PortfolioView:
    user_id: str
    cash_cents: int
    realised_cents: int
    fees_cents: int
    starting_cash_cents: int = STARTING_CASH_CENTS
    payouts_cents: int = 0          # performance payouts received since the latest start (P2-22)
    pending_payouts_cents: int = 0
    positions: list[PositionView] = field(default_factory=list)

    @property
    def positions_value_cents(self) -> int:
        return sum(p.market_value_cents for p in self.positions)

    @property
    def equity_cents(self) -> int:
        return self.cash_cents + self.positions_value_cents + self.pending_payouts_cents

    @property
    def unrealised_cents(self) -> int:
        return sum(p.unrealised_cents for p in self.positions)

    @property
    def total_pnl_cents(self) -> int:
        return self.equity_cents - self.starting_cash_cents


def build_portfolio(db: Database, market: MarketEngine, user_id: str) -> PortfolioView:
    """Profit/loss is measured from the account's latest start: sign-up, or a mission
    reset / restore (P2-21), which records the baseline, the positions it began with,
    and which trades come after it."""
    players = {p.symbol: p for p in market.players()}
    with db.lock:
        user = db.conn.execute(
            "SELECT cash_cents, baseline_cents, start_trade_rowid, start_positions_json,"
            " carried_realised_cents, carried_fees_cents, start_payout_rowid, carried_payouts_cents"
            " FROM users WHERE user_id = ?", (user_id,)
        ).fetchone()
        payouts = db.conn.execute(
            "SELECT coalesce(sum(amount_cents), 0) FROM payouts WHERE user_id = ? AND rowid > ?",
            (user_id, user["start_payout_rowid"] if user else 0),
        ).fetchone()[0]
        rows = db.conn.execute(
            "SELECT symbol, qty, cost_basis_cents FROM positions WHERE user_id = ?", (user_id,)
        ).fetchall()
        trades = db.conn.execute(
            "SELECT symbol, side, qty, price_cents, fee_cents FROM trades"
            " WHERE user_id = ? AND rowid > ? ORDER BY rowid",
            (user_id, user["start_trade_rowid"] if user else 0),
        ).fetchall()
    if user is None:
        raise KeyError(user_id)

    positions = []
    for symbol, qty, basis in rows:
        player = players.get(symbol)
        last = to_cents(market.last_price(symbol)) if player else round(basis / abs(qty))
        positions.append(PositionView(symbol, player.name if player else None,
                                      player.team if player else None, qty, basis,
                                      mark_price_cents=to_cents(market_mark(market,symbol)) if player else last, last_price_cents=last))
    positions.sort(key=lambda p: abs(p.market_value_cents), reverse=True)  # biggest exposure first

    seeds = json.loads(user["start_positions_json"]) if user["start_positions_json"] else []
    realised, fees = _realised_and_fees(trades, seeds)
    baseline = user["baseline_cents"] if user["baseline_cents"] is not None else STARTING_CASH_CENTS
    return PortfolioView(user_id, user["cash_cents"], realised + user["carried_realised_cents"],
                         fees + user["carried_fees_cents"], starting_cash_cents=baseline,
                         payouts_cents=payouts + user["carried_payouts_cents"], positions=positions,
                         pending_payouts_cents=pending_by_user(db).get(user_id,0))


def _realised_and_fees(trades, seeds=()) -> tuple[int, int]:
    """Replay fills with the average-cost rule from orders.py, starting from ``seeds``
    ([symbol, qty, cost_basis_cents], the positions the account started with)."""
    held: dict[str, int] = defaultdict(int)
    basis: dict[str, int] = defaultdict(int)
    for symbol, qty, cost in seeds:
        held[symbol], basis[symbol] = qty, cost
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
        elif side == "short":
            held[symbol] -= qty
            basis[symbol] += price * qty
        elif side == "cover":
            removed = round(basis[symbol] * qty / -held[symbol])
            realised += removed - price * qty
            basis[symbol] -= removed
            held[symbol] += qty
    return realised, fees
