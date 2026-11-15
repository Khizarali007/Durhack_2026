"""Accounts that survive a backend restart or a season rewind.

The season engine keeps market state (maker inventory, who owns which shares) in
memory, so the trading database is in memory too and restarts with the market.
Identity is different: usernames, password hashes, session-token hashes and
devnet wallets are mirrored into a small SQLite file (data/accounts.sqlite,
git-ignored). When a fresh trading database starts, everyone is restored into it
with the starting cash, and flagged so the UI can say "the season was reset; your
account is safe".

Only hashes are stored, exactly as in the trading database (never a password or
a raw token).
"""

from __future__ import annotations

import os
import sqlite3
import threading
import time
from pathlib import Path

from .db import REPO_ROOT, STARTING_CASH_CENTS, Database

DEFAULT_PATH = REPO_ROOT / "data" / "accounts.sqlite"
PATH_ENV = "ACCOUNTS_DB_PATH"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id       TEXT PRIMARY KEY,
    username      TEXT UNIQUE,
    password_hash TEXT,
    is_guest      INTEGER NOT NULL,
    created_at    REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash    TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    created_at    REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS wallets (
    user_id       TEXT PRIMARY KEY,
    address       TEXT NOT NULL,
    secret        TEXT NOT NULL,
    created_at    REAL NOT NULL
);
"""


def default_path() -> str:
    """data/accounts.sqlite, or memory under pytest so tests never touch the real file."""
    if os.environ.get(PATH_ENV):
        return os.environ[PATH_ENV]
    return ":memory:" if "PYTEST_CURRENT_TEST" in os.environ else str(DEFAULT_PATH)


class IdentityStore:
    def __init__(self, path: str | Path | None = None) -> None:
        path = str(path or default_path())
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        with self.lock, self.conn:
            self.conn.executescript(SCHEMA)

    def remember_user(self, db: Database, user_id: str) -> None:
        """Copy one user's identity and wallet out of the trading database."""
        with db.lock:
            user = db.conn.execute(
                "SELECT user_id, username, password_hash, is_guest, created_at FROM users WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            wallet = db.conn.execute(
                "SELECT user_id, address, secret, created_at FROM wallets WHERE user_id = ?", (user_id,)
            ).fetchone()
        if user is None:
            return
        with self.lock, self.conn:
            self.conn.execute("INSERT OR REPLACE INTO users VALUES (?, ?, ?, ?, ?)", tuple(user))
            if wallet is not None:
                self.conn.execute("INSERT OR REPLACE INTO wallets VALUES (?, ?, ?, ?)", tuple(wallet))

    def remember_session(self, token_hash: str, user_id: str) -> None:
        with self.lock, self.conn:
            self.conn.execute("INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)", (token_hash, user_id, time.time()))

    def forget_session(self, token_hash: str) -> None:
        with self.lock, self.conn:
            self.conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def restore_into(self, db: Database) -> set[str]:
        """Put every saved account into a fresh trading database with the starting cash.
        Returns the restored user ids (their portfolios restarted)."""
        with self.lock:
            users = self.conn.execute("SELECT * FROM users").fetchall()
            sessions = self.conn.execute("SELECT * FROM sessions").fetchall()
            wallets = self.conn.execute("SELECT * FROM wallets").fetchall()
        with db.lock, db.conn:
            db.conn.executemany(
                "INSERT OR IGNORE INTO users (user_id, username, password_hash, is_guest, cash_cents, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                [(u["user_id"], u["username"], u["password_hash"], u["is_guest"], STARTING_CASH_CENTS,
                  u["created_at"]) for u in users],
            )
            db.conn.executemany("INSERT OR IGNORE INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)",
                                [tuple(s) for s in sessions])
            db.conn.executemany("INSERT OR IGNORE INTO wallets (user_id, address, secret, created_at)"
                                " VALUES (?, ?, ?, ?)", [tuple(w) for w in wallets])
        return {u["user_id"] for u in users}

    def close(self) -> None:
        self.conn.close()


# The running app's store. None means accounts live only in the trading database
# (tests and the non-season FakeMarket setup).
_store: IdentityStore | None = None


def use_store(store: IdentityStore | None) -> None:
    global _store
    _store = store


def store() -> IdentityStore | None:
    return _store
