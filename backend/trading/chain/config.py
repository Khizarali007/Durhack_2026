"""Solana settings. Override with environment variables (e.g. in a .env you never commit)."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

CLUSTER = "devnet"  # free test network; the coins are worthless
RPC_URL = os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")

# The backend's fee-payer keypair. It signs and pays for every receipt.
# Git ignores the .solana/ folder and every *keypair*.json file.
FEE_PAYER_PATH = Path(os.environ.get("SOLANA_FEE_PAYER_KEYPAIR",
                                     REPO_ROOT / ".solana" / "fee-payer-keypair.json"))

# P2-18: the deployed HoopStreet portfolio program (backend/trading/chain/program/lib.rs).
# Unset = Level 1 is off: no portfolio syncing, and the leaderboard stays off-chain.
# Deployed on devnet: 9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp (see program/README.md).
PORTFOLIO_PROGRAM_ID = os.environ.get("SOLANA_PORTFOLIO_PROGRAM_ID") or None

FAUCET_URL = "https://faucet.solana.com"
LAMPORTS_PER_SOL = 1_000_000_000


def explorer_url(kind: str, value: str) -> str:
    """kind is "address" or "tx"."""
    return f"https://explorer.solana.com/{kind}/{value}?cluster={CLUSTER}"
