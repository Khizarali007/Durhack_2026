"""Level 0 receipts: one Solana Memo transaction per human order.

The memo is a short JSON note saying who traded what, how much and at what
price:

    {"app":"hoopstreet","v":1,"kind":"trade","order":"ord_…","wallet":"<player's address>",
     "sym":"SGA","side":"buy","qty":20,"avg":150.98,"fee":3.02,"fills":2,
     "h":"<first 16 hex of sha256 of the fill list>","t":1729555206.0}

- The backend's fee payer signs and pays.
- The player's server-held wallet co-signs, so the Explorer shows whose trade it was.
- ``h`` lets anyone check the receipt against the full fill list in our database
  without putting every fill on-chain.

Sending and confirming are separate steps:
- ``send()`` submits and returns the signature.
- ``statuses()`` checks many signatures in one request.

So a receipt is never sent twice just because a status check failed. Every RPC
call goes through one rate limiter, because the free public devnet server
allows only a handful of calls per second.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal, Protocol

from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from solana.rpc.models import TxOpts
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import Transaction
from solders.transaction_status import TransactionConfirmationStatus

from . import config
from .keys import load_or_create_keypair

MEMO_PROGRAM_ID = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")
BLOCKHASH_MAX_AGE_S = 20.0
MIN_RPC_SPACING_S = 0.2     # at most 5 devnet calls a second, shared by everything
RATE_LIMIT_PAUSE_S = 3.0    # extra wait after devnet says 429 Too Many Requests

Status = Literal["confirmed", "failed"] | None   # None = not seen yet


@dataclass(frozen=True)
class FillLine:
    qty: int
    price_cents: int
    fee_cents: int


def fills_hash(fills: list[FillLine]) -> str:
    canonical = ",".join(f"{f.qty}@{f.price_cents}" for f in fills)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def build_trade_memo(*, order_id: str, wallet: str, symbol: str, side: str,
                     fills: list[FillLine], t: float) -> bytes:
    qty = sum(f.qty for f in fills)
    notional = sum(f.qty * f.price_cents for f in fills)
    avg = (Decimal(notional) / qty / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    memo = {
        "app": "hoopstreet", "v": 1, "kind": "trade",
        "order": order_id, "wallet": wallet, "sym": symbol, "side": side,
        "qty": qty, "avg": float(avg), "fee": sum(f.fee_cents for f in fills) / 100,
        "fills": len(fills), "h": fills_hash(fills), "t": t,
    }
    return json.dumps(memo, separators=(",", ":")).encode()


@dataclass(frozen=True)
class BotTradeLine:
    bot_id: str
    symbol: str
    side: str
    qty: int
    price_cents: int
    t: float


def bot_trades_hash(trades: list[BotTradeLine]) -> str:
    """Full sha256 hex of the canonical trade list: one "bot_id,symbol,side,qty,price_cents,t" line per trade."""
    canonical = "\n".join(f"{b.bot_id},{b.symbol},{b.side},{b.qty},{b.price_cents},{b.t!r}" for b in trades)
    return hashlib.sha256(canonical.encode()).hexdigest()


def build_bot_bundle_memo(*, bundle_id: str, minute_t: float, count: int, volume: int, trades_hash: str) -> bytes:
    """P2-10: one receipt per market minute of bot trades (fee payer signs alone)."""
    memo = {"app": "hoopstreet", "v": 1, "kind": "bots", "bundle": bundle_id, "minute": minute_t,
            "count": count, "vol": volume, "h": trades_hash}
    return json.dumps(memo, separators=(",", ":")).encode()


class ReceiptSender(Protocol):
    async def send(self, memo: bytes, cosigner: Keypair | None) -> str:
        """Submit the memo transaction; return its signature without waiting for confirmation."""
        ...

    async def statuses(self, signatures: list[str]) -> dict[str, Status]:
        """Confirmation status of many signatures in one request."""
        ...

    async def close(self) -> None: ...


class _RateLimiter:
    def __init__(self, spacing_s: float) -> None:
        self._spacing = spacing_s
        self._lock = asyncio.Lock()
        self._next = 0.0

    async def wait(self) -> None:
        async with self._lock:
            delay = self._next - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self._next = time.monotonic() + self._spacing

    def pause(self, seconds: float) -> None:
        self._next = max(self._next, time.monotonic() + seconds)


def _is_rate_limited(exc: Exception) -> bool:
    text = f"{exc!r} {getattr(exc, '__cause__', '')!r}"
    return "429" in text or "Too Many Requests" in text or "HTTPStatusError" in text


class DevnetSender:
    """Talks to Solana devnet: sends memo transactions and checks their status."""

    def __init__(self, rpc_url: str = config.RPC_URL) -> None:
        self._client = AsyncClient(rpc_url)
        self._payer, _ = load_or_create_keypair(config.FEE_PAYER_PATH)
        self._limiter = _RateLimiter(MIN_RPC_SPACING_S)
        self._blockhash: Hash | None = None
        self._blockhash_at = 0.0

    async def _call(self, make_request):
        await self._limiter.wait()
        try:
            return await make_request()
        except Exception as exc:
            if _is_rate_limited(exc):
                self._limiter.pause(RATE_LIMIT_PAUSE_S)
            raise

    async def _recent_blockhash(self) -> Hash:
        if self._blockhash is None or time.monotonic() - self._blockhash_at > BLOCKHASH_MAX_AGE_S:
            response = await self._call(self._client.get_latest_blockhash)
            self._blockhash, self._blockhash_at = response.value.blockhash, time.monotonic()
        return self._blockhash

    async def send(self, memo: bytes, cosigner: Keypair | None) -> str:
        accounts = [AccountMeta(cosigner.pubkey(), is_signer=True, is_writable=False)] if cosigner else []
        instruction = Instruction(MEMO_PROGRAM_ID, memo, accounts)
        blockhash = await self._recent_blockhash()
        signers = [self._payer, cosigner] if cosigner else [self._payer]
        tx = Transaction(signers, Message.new_with_blockhash([instruction], self._payer.pubkey(), blockhash),
                         blockhash)
        try:
            response = await self._call(lambda: self._client.send_raw_transaction(
                bytes(tx), opts=TxOpts(preflight_commitment=Confirmed)))
        except Exception:
            self._blockhash = None  # a stale blockhash is a common cause; fetch a fresh one next time
            raise
        return str(response.value)

    async def statuses(self, signatures: list[str]) -> dict[str, Status]:
        result: dict[str, Status] = {}
        for start in range(0, len(signatures), 256):  # RPC limit per request
            batch = signatures[start:start + 256]
            response = await self._call(lambda b=batch: self._client.get_signature_statuses(
                [Signature.from_string(s) for s in b]))
            for signature, status in zip(batch, response.value):
                if status is None:
                    result[signature] = None
                elif status.err is not None:
                    result[signature] = "failed"
                elif status.confirmation_status in (TransactionConfirmationStatus.Confirmed,
                                                    TransactionConfirmationStatus.Finalized):
                    result[signature] = "confirmed"
                else:
                    result[signature] = None  # processed, not yet confirmed
        return result

    async def close(self) -> None:
        await self._client.close()
