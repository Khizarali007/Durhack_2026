"""Person 2's SQLite storage: users, positions and trades.

All of Person 2's database access goes through this module, so it can be
merged into Person 1's single DB module later without touching other code.

Money is stored as integer cents (like Person 1's engine) so the ledger never
drifts. Convert to float HOOP only at the API edge (Person 4 and the frontend
use floats).
"""

from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = REPO_ROOT / "data" / "trading.sqlite"
DB_PATH_ENV = "TRADING_DB_PATH"  # set to ":memory:" in tests

STARTING_CASH_CENTS = 10_000_000  # 100,000 HOOP

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id         TEXT PRIMARY KEY,
    username        TEXT UNIQUE,                 -- NULL for guests
    password_hash   TEXT,                        -- NULL for guests; never plain text
    is_guest        INTEGER NOT NULL DEFAULT 0,
    cash_cents      INTEGER NOT NULL,
    created_at      REAL NOT NULL                -- real time, unix seconds
);

-- Login sessions. Only a SHA-256 hash of each token is stored, so a leaked
-- database file can't be used to log in.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash      TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users (user_id),
    created_at      REAL NOT NULL                -- real time, unix seconds
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);

-- One server-held devnet wallet per user (P2-08). Devnet coins are worthless,
-- which is the only reason storing the secret here is acceptable.
CREATE TABLE IF NOT EXISTS wallets (
    user_id         TEXT PRIMARY KEY REFERENCES users (user_id),
    address         TEXT NOT NULL UNIQUE,        -- public key, base58
    secret          TEXT NOT NULL,               -- secret key, base58. Never sent to clients
    created_at      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
    user_id           TEXT NOT NULL REFERENCES users (user_id),
    symbol            TEXT NOT NULL,
    qty               INTEGER NOT NULL,          -- negative = short
    cost_basis_cents  INTEGER NOT NULL,          -- total entry cost; avg_cost = cost_basis / abs(qty)
    PRIMARY KEY (user_id, symbol)
);

-- One row per fill. Columns match Person 4's Trade model
-- (trade_id, user_id, symbol, side, qty, price, fee, t, reason) plus receipt fields.
CREATE TABLE IF NOT EXISTS trades (
    trade_id            TEXT PRIMARY KEY,
    order_id            TEXT NOT NULL,
    user_id             TEXT NOT NULL REFERENCES users (user_id),
    symbol              TEXT NOT NULL,
    side                TEXT NOT NULL CHECK (side IN ('buy', 'sell', 'short', 'cover')),
    qty                 INTEGER NOT NULL CHECK (qty > 0),
    price_cents         INTEGER NOT NULL CHECK (price_cents > 0),
    fee_cents           INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
    t                   REAL NOT NULL,           -- market time, epoch seconds
    reason              TEXT NOT NULL DEFAULT 'market'
                        CHECK (reason IN ('market', 'limit', 'stop', 'liquidation')),
    counterparty        TEXT,                    -- market maker id
    receipt_status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK (receipt_status IN ('pending', 'confirmed', 'failed')),
    receipt_signature   TEXT,                    -- Solana transaction signature
    receipt_confirm_ms  INTEGER                  -- measured confirmation time
);
CREATE INDEX IF NOT EXISTS trades_by_user_time ON trades (user_id, t);
"""

TABLES = ("users", "sessions", "wallets", "positions", "trades")


class Database:
    """One shared SQLite connection, safe to use from FastAPI's worker threads."""

    def __init__(self, path: str | Path | None = None) -> None:
        path = str(path or os.environ.get(DB_PATH_ENV) or DEFAULT_DB_PATH)
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        if path != ":memory:":
            self.conn.execute("PRAGMA journal_mode = WAL")
        self.lock = threading.RLock()
        self.conn.executescript(SCHEMA)

    def tables(self) -> list[str]:
        with self.lock:
            rows = self.conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        return sorted(r["name"] for r in rows)

    def close(self) -> None:
        self.conn.close()
