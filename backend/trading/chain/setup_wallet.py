"""Create (once) the backend's fee-payer wallet and show what to do next.

Run from the repo root with the venv active:
    python backend/trading/chain/setup_wallet.py
    python backend/trading/chain/setup_wallet.py --airdrop   # also ask devnet for 1 SOL directly

It prints the wallet address to paste into https://faucet.solana.com and the
current balance. Run it again after claiming to check the SOL arrived.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

if __package__ in (None, ""):  # allow `python backend/trading/chain/setup_wallet.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from solana.rpc.async_api import AsyncClient  # noqa: E402
from solders.pubkey import Pubkey  # noqa: E402

from trading.chain import config  # noqa: E402
from trading.chain.keys import load_or_create_keypair  # noqa: E402
from trading.chain.status import READY_BALANCE_SOL, get_balance_sol  # noqa: E402


async def airdrop(address: str) -> str:
    async with AsyncClient(config.RPC_URL) as client:
        response = await client.request_airdrop(Pubkey.from_string(address), config.LAMPORTS_PER_SOL)
        await client.confirm_transaction(response.value)
    return str(response.value)


async def main(do_airdrop: bool) -> None:
    keypair, created = load_or_create_keypair(config.FEE_PAYER_PATH)
    address = str(keypair.pubkey())
    print(("Created" if created else "Loaded") + f" fee-payer wallet: {config.FEE_PAYER_PATH}")
    print("  (ignored by git; keep it secret even though devnet coins are worthless)\n")
    print(f"Address:  {address}")
    print(f"Explorer: {config.explorer_url('address', address)}\n")

    if do_airdrop:
        try:
            signature = await airdrop(address)
            print(f"Airdrop of 1 SOL confirmed: {config.explorer_url('tx', signature)}\n")
        except Exception as exc:
            print(f"Airdrop failed ({type(exc).__name__}). Devnet often rate-limits this; use the faucet website.\n")

    try:
        balance = await get_balance_sol(address)
    except Exception as exc:
        print(f"Couldn't reach devnet to check the balance ({type(exc).__name__}). Check your internet.")
        return
    print(f"Balance:  {balance} SOL")
    if balance >= READY_BALANCE_SOL:
        print("Ready: enough SOL to pay for receipts.")
    else:
        print(f"Not funded yet. Open {config.FAUCET_URL}, paste the address above, choose Devnet,")
        print("and request SOL. Then run this script again to check it arrived.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--airdrop", action="store_true", help="also request 1 SOL from devnet directly")
    asyncio.run(main(parser.parse_args().airdrop))
