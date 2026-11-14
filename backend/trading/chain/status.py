"""Is the backend ready to write to Solana? Fee-payer address, balance, and whether devnet answers."""

from __future__ import annotations

import asyncio

from pydantic import BaseModel
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey

from . import config
from .keys import load_or_create_keypair

# Each receipt has two signatures (fee payer + player), so it costs 10,000 lamports
# (0.00001 SOL). 0.05 SOL covers about 5,000 receipts.
READY_BALANCE_SOL = 0.05


class ChainStatus(BaseModel):
    cluster: str
    rpc_url: str
    fee_payer_address: str
    fee_payer_explorer_url: str
    balance_sol: float | None   # None if devnet couldn't be reached
    reachable: bool
    ready: bool                 # reachable and funded enough to send receipts
    faucet_url: str
    error: str | None = None


def fee_payer_address() -> str:
    keypair, _ = load_or_create_keypair(config.FEE_PAYER_PATH)
    return str(keypair.pubkey())


async def get_balance_sol(address: str, timeout_s: float = 5.0) -> float:
    async with AsyncClient(config.RPC_URL) as client:
        response = await asyncio.wait_for(client.get_balance(Pubkey.from_string(address)), timeout_s)
    return response.value / config.LAMPORTS_PER_SOL


async def chain_status() -> ChainStatus:
    address = fee_payer_address()
    balance, error = None, None
    try:
        balance = await get_balance_sol(address)
    except Exception as exc:  # network down, devnet busy, timeout...
        error = f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
    return ChainStatus(
        cluster=config.CLUSTER,
        rpc_url=config.RPC_URL,
        fee_payer_address=address,
        fee_payer_explorer_url=config.explorer_url("address", address),
        balance_sol=balance,
        reachable=balance is not None,
        ready=balance is not None and balance >= READY_BALANCE_SOL,
        faucet_url=config.FAUCET_URL,
        error=error,
    )
