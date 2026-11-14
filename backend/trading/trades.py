"""Reading a user's trade history (fills), oldest first.

Shaped for Person 4's ``Trade`` (trade_id, user_id, symbol, side, qty, price,
fee, t, reason) plus receipt fields for the Solana tickets. P2-21's
TradesAdapter will call ``trades_for_user`` directly.
"""

from __future__ import annotations

from dataclasses import dataclass

from .db import Database


@dataclass(frozen=True)
class TradeRecord:
    trade_id: str
    order_id: str
    user_id: str
    symbol: str
    side: str
    qty: int
    price_cents: int
    fee_cents: int
    t: float
    reason: str
    counterparty: str | None
    receipt_status: str
    receipt_signature: str | None
    receipt_confirm_ms: int | None


def trades_for_user(db: Database, user_id: str, *, since_t: float | None = None,
                    symbol: str | None = None, limit: int | None = None) -> list[TradeRecord]:
    """Fills oldest first. ``since_t`` is inclusive (t >= since_t), as Person 4 expects.
    ``limit`` keeps only the most recent N, still returned oldest first."""
    sql = "SELECT rowid, * FROM trades WHERE user_id = ?"
    params: list = [user_id]
    if since_t is not None:
        sql += " AND t >= ?"
        params.append(since_t)
    if symbol is not None:
        sql += " AND symbol = ?"
        params.append(symbol)
    sql += " ORDER BY rowid DESC"
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    with db.lock:
        rows = db.conn.execute(sql, params).fetchall()
    return [
        TradeRecord(r["trade_id"], r["order_id"], r["user_id"], r["symbol"], r["side"], r["qty"],
                    r["price_cents"], r["fee_cents"], r["t"], r["reason"], r["counterparty"],
                    r["receipt_status"], r["receipt_signature"], r["receipt_confirm_ms"])
        for r in reversed(rows)
    ]
