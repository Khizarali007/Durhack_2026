"""Builds insights.SeasonData from Person 1's season engine and Person 2's trading DB.

The market-side readers (daily prices, game payouts, official alerts, names,
teams, prices) are shared by the player's review and the practice rivals.
"""

from __future__ import annotations

from typing import Any

from market.valuation import payout_per_share
from trading.db import Database
from trading.equity import equity_history
from trading.money import to_hoop
from trading.portfolio import build_portfolio

from .insights import Alert, Fill, Payment, SeasonData


class MarketView:
    """Read-only helpers over the live season engine."""

    def __init__(self, market: Any) -> None:
        self.market = market
        players = market.players()
        self.names = {p.symbol: p.name for p in players}
        self.teams = {p.symbol: p.team for p in players}

    def price(self, symbol: str) -> float:
        try:
            return float(self.market.mark_price(symbol))
        except (KeyError, AttributeError):
            return 0.0

    def prices(self, symbols) -> dict[str, float]:
        return {s: self.price(s) for s in symbols}

    def daily(self, symbol: str) -> list[tuple[float, float]]:
        points = getattr(self.market, "timeline_history", {}).get(symbol, [])
        out = []
        for p in points:
            value = p.get("mid") if p.get("mid") is not None else p.get("last")
            if value is not None:
                out.append((float(p["t"]), float(value)))
        return out

    def game_payout(self, symbol: str, day: str) -> float | None:
        pid = getattr(self.market, "ids", {}).get(symbol)
        scores = getattr(self.market, "results", {}).get(day, {}).get(pid) if pid is not None else None
        if not scores:
            return None
        return round(sum(payout_per_share(s) for s in scores), 8)

    def alerts(self) -> list[Alert]:
        return [Alert(e["symbol"], e["kind"], float(e["t"]), e["headline"])
                for e in getattr(self.market, "news", []) if e.get("kind") in ("early_warning", "injury")]

    def now(self) -> float:
        return float(self.market.market_time())


def user_season(db: Database, market: Any, user_id: str, name: str = "You") -> SeasonData:
    """The signed-in player's season so far, from the trading database."""
    view = MarketView(market)
    with db.lock:
        rows = db.conn.execute(
            "SELECT order_id, symbol, side, qty, price_cents, fee_cents, t, quoted_price_cents FROM trades"
            " WHERE user_id = ? AND side IN ('buy', 'sell') ORDER BY t, rowid", (user_id,)).fetchall()
        pays = db.conn.execute("SELECT symbol, qty_held, amount_cents, t FROM payouts WHERE user_id = ? ORDER BY t",
                               (user_id,)).fetchall()
    fills = [Fill(r["order_id"], r["symbol"], r["side"], float(r["qty"]), to_hoop(r["price_cents"]),
                  to_hoop(r["fee_cents"]), float(r["t"]),
                  to_hoop(r["quoted_price_cents"]) if r["quoted_price_cents"] else None) for r in rows]
    payments = [Payment(p["symbol"], float(p["qty_held"]), to_hoop(p["amount_cents"]), float(p["t"])) for p in pays]
    portfolio = build_portfolio(db, market, user_id)
    equity = [(p.t, to_hoop(p.equity_cents)) for p in equity_history(db, user_id)]
    symbols = {f.symbol for f in fills}
    return SeasonData(
        name=name, starting_cash=to_hoop(portfolio.starting_cash_cents), cash=to_hoop(portfolio.cash_cents),
        now=view.now(), fills=fills, payments=payments, equity=equity, alerts=view.alerts(),
        names=view.names, teams=view.teams, prices=view.prices(symbols), daily=view.daily,
        game_payout=view.game_payout)
