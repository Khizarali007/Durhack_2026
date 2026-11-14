"""One devnet wallet per user, created and held by the server.

Players never see or handle keys. The public address goes in their receipts
(P2-09) and on-chain portfolio (P2-18). The secret key is stored in the
trading database so the server can sign for them later if Level 1 needs it.
That's acceptable only because devnet coins are worthless; it would not be
for real money.
"""

from __future__ import annotations

import time

from solders.keypair import Keypair

from ..db import Database
from .keys import keypair_from_text, secret_to_text


def ensure_wallet(db: Database, user_id: str) -> str:
    """The user's wallet address, creating the wallet first if they don't have one."""
    with db.lock, db.conn:
        row = db.conn.execute("SELECT address FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
        if row:
            return row[0]
        keypair = Keypair()
        address = str(keypair.pubkey())
        db.conn.execute(
            "INSERT INTO wallets (user_id, address, secret, created_at) VALUES (?, ?, ?, ?)",
            (user_id, address, secret_to_text(keypair), time.time()),
        )
    return address


def wallet_address(db: Database, user_id: str) -> str | None:
    with db.lock:
        row = db.conn.execute("SELECT address FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
    return row[0] if row else None


def wallet_keypair(db: Database, user_id: str) -> Keypair | None:
    with db.lock:
        row = db.conn.execute("SELECT secret FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
    return keypair_from_text(row[0]) if row else None
