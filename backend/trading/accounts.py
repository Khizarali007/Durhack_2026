"""Users and login sessions.

P2-03: temporary users (stored as guests) with a starting balance, plus
session tokens. P2-07 adds username/password sign-up and login on top.
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from dataclasses import dataclass

from .db import STARTING_CASH_CENTS, Database


@dataclass(frozen=True)
class User:
    user_id: str
    username: str | None
    is_guest: bool
    cash_cents: int


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _row_to_user(row: sqlite3.Row) -> User:
    return User(row["user_id"], row["username"], bool(row["is_guest"]), row["cash_cents"])


def create_guest_user(db: Database, cash_cents: int = STARTING_CASH_CENTS) -> User:
    user_id = f"u_{secrets.token_hex(8)}"
    with db.lock, db.conn:
        db.conn.execute(
            "INSERT INTO users (user_id, is_guest, cash_cents, created_at) VALUES (?, 1, ?, ?)",
            (user_id, cash_cents, time.time()),
        )
    return User(user_id, None, True, cash_cents)


def create_session(db: Database, user_id: str) -> str:
    """Return a new random token. Only its hash is stored."""
    token = secrets.token_urlsafe(32)
    with db.lock, db.conn:
        db.conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)",
            (_hash_token(token), user_id, time.time()),
        )
    return token


def user_for_token(db: Database, token: str) -> User | None:
    with db.lock:
        row = db.conn.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.user_id = s.user_id WHERE s.token_hash = ?",
            (_hash_token(token),),
        ).fetchone()
    return _row_to_user(row) if row else None


def get_user(db: Database, user_id: str) -> User | None:
    with db.lock:
        row = db.conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    return _row_to_user(row) if row else None
