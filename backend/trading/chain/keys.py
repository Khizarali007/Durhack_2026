"""Creating, saving and loading Solana keypairs.

Keypair files use the Solana CLI format (a JSON list of 64 numbers), so the
same file works with the `solana` command-line tool and Solana Playground.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from solders.keypair import Keypair


def load_or_create_keypair(path: Path) -> tuple[Keypair, bool]:
    """Load the keypair at ``path``, creating it first if it's missing. Returns (keypair, created)."""
    if path.exists():
        return Keypair.from_bytes(bytes(json.loads(path.read_text()))), False
    keypair = Keypair()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Owner-only permissions (0600) from the moment the file exists.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as file:
        json.dump(list(bytes(keypair)), file)
    return keypair, True


def secret_to_text(keypair: Keypair) -> str:
    """Base58 secret key, for storing user wallets in the database."""
    return str(keypair)


def keypair_from_text(secret: str) -> Keypair:
    return Keypair.from_base58_string(secret)
