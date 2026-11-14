"""P2-21: resetting an account to a mission's start state, and restoring it afterwards.

When one of Person 4's missions starts, it calls
``apply_start_state(user_id, cash, positions)``. That:

1. **Saves the player's real account first**, unless a snapshot already exists:
   cash, positions, profit-so-far and fees. A mission played twice doesn't
   overwrite the real account with the first mission's state.
2. Cancels their open limit/stop orders, so nothing reserved is left behind.
3. Sets their cash and positions to exactly the mission's start state.
4. Restarts profit/loss from there. Earlier trades stay in the history (Person 4
   reads only the mission window), but they don't count towards the new
   profit/loss.

``restore_account`` puts the saved real account back (cash, positions,
profit/loss) and deletes the snapshot. Trades made during the mission stay in
the history but no longer count.
"""

from __future__ import annotations

import json
import time

from .db import Database
from .market_contract import MarketEngine
from .portfolio import build_portfolio


def _max_trade_rowid(db: Database) -> int:
    return db.conn.execute("SELECT coalesce(max(rowid), 0) FROM trades").fetchone()[0]


def _max_payout_rowid(db: Database) -> int:
    return db.conn.execute("SELECT coalesce(max(rowid), 0) FROM payouts").fetchone()[0]


def _cancel_open_orders(db: Database, user_id: str) -> None:
    db.conn.execute(
        "UPDATE open_orders SET status = 'cancelled', reserved_cash_cents = 0, reason = 'account reset',"
        " updated_at = ? WHERE user_id = ? AND status = 'open'", (time.time(), user_id))


def _set_positions(db: Database, user_id: str, positions: list[list]) -> None:
    db.conn.execute("DELETE FROM positions WHERE user_id = ?", (user_id,))
    db.conn.executemany(
        "INSERT INTO positions (user_id, symbol, qty, cost_basis_cents) VALUES (?, ?, ?, ?)",
        [(user_id, symbol, qty, basis) for symbol, qty, basis in positions if qty],
    )


def reset_account(db: Database, market: MarketEngine, user_id: str, cash_cents: int,
                  positions: list[tuple[str, int, int]]) -> None:
    """positions: (symbol, qty, cost_basis_cents). Negative qty = short (P2-14), with a
    positive cost basis: what the shares were sold for."""
    known = {p.symbol for p in market.players()}
    for symbol, qty, basis in positions:
        if symbol not in known:
            raise ValueError(f"unknown symbol {symbol!r}")
        if basis < 0:
            raise ValueError("cost basis can't be negative (a short's is what the shares were sold for)")
    if cash_cents < 0:
        raise ValueError("cash can't be negative")

    view = build_portfolio(db, market, user_id)  # raises KeyError for an unknown user
    with db.lock, db.conn:
        has_snapshot = db.conn.execute(
            "SELECT 1 FROM account_snapshots WHERE user_id = ?", (user_id,)).fetchone()
        if not has_snapshot:
            current = db.conn.execute(
                "SELECT symbol, qty, cost_basis_cents FROM positions WHERE user_id = ?", (user_id,)).fetchall()
            db.conn.execute(
                "INSERT INTO account_snapshots (user_id, cash_cents, positions_json, baseline_cents,"
                " realised_cents, fees_cents, payouts_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, view.cash_cents, json.dumps([list(r) for r in current]), view.starting_cash_cents,
                 view.realised_cents, view.fees_cents, view.payouts_cents, time.time()),
            )
        _cancel_open_orders(db, user_id)
        start = [[symbol, int(qty), int(basis)] for symbol, qty, basis in positions if qty]
        _set_positions(db, user_id, start)
        db.conn.execute(
            "UPDATE users SET cash_cents = ?, baseline_cents = ?, start_trade_rowid = ?, start_positions_json = ?,"
            " carried_realised_cents = 0, carried_fees_cents = 0, start_payout_rowid = ?,"
            " carried_payouts_cents = 0, margin_status = 'ok', margin_call_t = NULL"
            " WHERE user_id = ?",
            # Starting equity marks each position at its entry price: + for longs, - for shorts.
            (cash_cents, cash_cents + sum(b if q > 0 else -b for _, q, b in start), _max_trade_rowid(db),
             json.dumps(start),
             _max_payout_rowid(db), user_id),
        )


def restore_account(db: Database, user_id: str) -> bool:
    """Put back the account saved before the first mission reset. False if there's nothing saved."""
    with db.lock, db.conn:
        snap = db.conn.execute("SELECT * FROM account_snapshots WHERE user_id = ?", (user_id,)).fetchone()
        if snap is None:
            return False
        positions = json.loads(snap["positions_json"])
        _cancel_open_orders(db, user_id)
        _set_positions(db, user_id, positions)
        db.conn.execute(
            "UPDATE users SET cash_cents = ?, baseline_cents = ?, start_trade_rowid = ?, start_positions_json = ?,"
            " carried_realised_cents = ?, carried_fees_cents = ?, start_payout_rowid = ?,"
            " carried_payouts_cents = ?, margin_status = 'ok', margin_call_t = NULL"
            " WHERE user_id = ?",
            (snap["cash_cents"], snap["baseline_cents"], _max_trade_rowid(db), json.dumps(positions),
             snap["realised_cents"], snap["fees_cents"], _max_payout_rowid(db), snap["payouts_cents"], user_id),
        )
        db.conn.execute("DELETE FROM account_snapshots WHERE user_id = ?", (user_id,))
    return True


def has_snapshot(db: Database, user_id: str) -> bool:
    with db.lock:
        return db.conn.execute("SELECT 1 FROM account_snapshots WHERE user_id = ?", (user_id,)).fetchone() is not None
