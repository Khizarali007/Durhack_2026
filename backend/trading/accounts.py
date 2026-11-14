"""Users and login sessions.

- Guests (P2-03): an account with a starting balance and no username.
- Accounts (P2-07): username and password. Usernames are unique ignoring
  case. Passwords are stored only as scrypt hashes (see passwords.py).
- Sessions: random tokens. Only a SHA-256 hash of each token is stored.
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from dataclasses import dataclass

from .chain.wallets import ensure_wallet
from .db import STARTING_CASH_CENTS, Database
from .passwords import DUMMY_HASH, hash_password, verify_password


class UsernameTaken(Exception):
    pass


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
    ensure_wallet(db, user_id)
    return User(user_id, None, True, cash_cents)


def create_account(db: Database, username: str, password: str,
                   cash_cents: int = STARTING_CASH_CENTS) -> User:
    """A registered user. Raises UsernameTaken if the name exists in any letter case."""
    user_id = f"u_{secrets.token_hex(8)}"
    password_hash = hash_password(password)  # slow on purpose, so do it outside the lock
    with db.lock, db.conn:
        taken = db.conn.execute(
            "SELECT 1 FROM users WHERE lower(username) = lower(?)", (username,)
        ).fetchone()
        if taken:
            raise UsernameTaken(username)
        db.conn.execute(
            "INSERT INTO users (user_id, username, password_hash, is_guest, cash_cents, created_at)"
            " VALUES (?, ?, ?, 0, ?, ?)",
            (user_id, username, password_hash, cash_cents, time.time()),
        )
    ensure_wallet(db, user_id)
    return User(user_id, username, False, cash_cents)


def authenticate(db: Database, username: str, password: str) -> User | None:
    """The user if the username (any letter case) and password match, else None."""
    with db.lock:
        row = db.conn.execute(
            "SELECT * FROM users WHERE lower(username) = lower(?)", (username,)
        ).fetchone()
    if row is None:
        verify_password(password, DUMMY_HASH)  # same work as a real check
        return None
    if not verify_password(password, row["password_hash"] or ""):
        return None
    return _row_to_user(row)


def delete_session(db: Database, token: str) -> None:
    with db.lock, db.conn:
        db.conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))


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
