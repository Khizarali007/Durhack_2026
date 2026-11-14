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
    quoted_price_cents  INTEGER,                 -- best price when the order was placed (P2-12)
    receipt_status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK (receipt_status IN ('pending', 'confirmed', 'failed')),
    receipt_signature   TEXT,                    -- Solana transaction signature
    receipt_confirm_ms  INTEGER                  -- measured confirmation time
);
CREATE INDEX IF NOT EXISTS trades_by_user_time ON trades (user_id, t);

-- P2-11: limit and stop-loss orders waiting for a price. Person 1's engine has
-- no resting order book, so these live here and fire as market orders.
-- While open, a buy limit reserves cash and a sell limit or stop reserves shares.
CREATE TABLE IF NOT EXISTS open_orders (
    order_id              TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL REFERENCES users (user_id),
    symbol                TEXT NOT NULL,
    side                  TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    order_type            TEXT NOT NULL CHECK (order_type IN ('limit', 'stop')),
    price_cents           INTEGER NOT NULL CHECK (price_cents > 0),  -- limit price, or stop trigger
    qty                   INTEGER NOT NULL CHECK (qty > 0),          -- as placed
    filled_qty            INTEGER NOT NULL DEFAULT 0,
    reserved_cash_cents   INTEGER NOT NULL DEFAULT 0,                -- buy limits only
    status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'filled', 'cancelled', 'failed')),
    reason                TEXT,                                      -- why it failed
    last_fill_order_id    TEXT,                                      -- the market order it fired
    created_t             REAL NOT NULL,                             -- market time
    updated_at            REAL NOT NULL                              -- real time
);
CREATE INDEX IF NOT EXISTS open_orders_by_status ON open_orders (status, symbol);

-- P2-21: a player's real account, saved when a mission first resets it, so it
-- can be restored afterwards. One snapshot per user; restoring deletes it.
CREATE TABLE IF NOT EXISTS account_snapshots (
    user_id          TEXT PRIMARY KEY REFERENCES users (user_id),
    cash_cents       INTEGER NOT NULL,
    positions_json   TEXT NOT NULL,      -- [[symbol, qty, cost_basis_cents], ...]
    baseline_cents   INTEGER NOT NULL,
    realised_cents   INTEGER NOT NULL,
    fees_cents       INTEGER NOT NULL,
    created_at       REAL NOT NULL
);

-- P2-10: every market minute's bot trades, bundled into one Solana receipt.
-- The receipt holds a sha256 of the bundle's trade list; bot_trades keeps the
-- full list so anyone can recompute the hash and check it matches.
CREATE TABLE IF NOT EXISTS bot_bundles (
    bundle_id           TEXT PRIMARY KEY,
    minute_t            REAL NOT NULL,           -- market time the minute started
    trade_count         INTEGER NOT NULL CHECK (trade_count > 0),
    total_volume        INTEGER NOT NULL,        -- shares
    trades_hash         TEXT NOT NULL,           -- sha256 hex of the canonical trade list
    receipt_status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK (receipt_status IN ('pending', 'confirmed', 'failed')),
    receipt_signature   TEXT,
    receipt_confirm_ms  INTEGER,
    created_at          REAL NOT NULL            -- real time, unix seconds
);
CREATE INDEX IF NOT EXISTS bot_bundles_by_time ON bot_bundles (created_at);

CREATE TABLE IF NOT EXISTS bot_trades (
    bundle_id     TEXT NOT NULL REFERENCES bot_bundles (bundle_id),
    seq           INTEGER NOT NULL,              -- order within the bundle
    bot_id        TEXT NOT NULL,
    symbol        TEXT NOT NULL,
    side          TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    qty           INTEGER NOT NULL CHECK (qty > 0),
    price_cents   INTEGER NOT NULL,
    t             REAL NOT NULL,
    PRIMARY KEY (bundle_id, seq)
);
"""

TABLES = ("users", "sessions", "wallets", "positions", "trades", "open_orders", "account_snapshots",
          "bot_bundles", "bot_trades")

# Columns added after a table first shipped. CREATE TABLE IF NOT EXISTS won't add
# them to an existing database file, so they're added on startup if missing.
MIGRATIONS = (
    ("trades", "quoted_price_cents", "INTEGER"),
    # P2-21: when a mission resets an account, profit/loss is measured from the
    # new start: baseline equity, the trades after it, the positions it began
    # with, and any profit/fees carried over from before.
    ("users", "baseline_cents", "INTEGER"),
    ("users", "start_trade_rowid", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "start_positions_json", "TEXT"),
    ("users", "carried_realised_cents", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "carried_fees_cents", "INTEGER NOT NULL DEFAULT 0"),
)


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
        self._migrate()

    def _migrate(self) -> None:
        for table, column, sql_type in MIGRATIONS:
            existing = {row["name"] for row in self.conn.execute(f"PRAGMA table_info({table})")}
            if column not in existing:
                self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")
        self.conn.commit()

    def tables(self) -> list[str]:
        with self.lock:
            rows = self.conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        return sorted(r["name"] for r in rows)

    def close(self) -> None:
        self.conn.close()
