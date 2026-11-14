"""P2-18: talking to the HoopStreet portfolio program (``program/lib.rs``) from Python.

No Anchor client library is needed: Anchor's wire format is simple.
- Each instruction starts with ``sha256("global:<name>")[:8]``, then its
  arguments in Borsh (little-endian, fixed arrays with no length prefix).
- Each account starts with ``sha256("account:Portfolio")[:8]``, then its fields.

The layout here must match ``lib.rs`` field for field. Tests check the sizes
and a full encode/decode round trip.
"""

from __future__ import annotations

import hashlib
import struct
from dataclasses import dataclass, field

from solders.instruction import AccountMeta, Instruction
from solders.pubkey import Pubkey

MAX_HOLDINGS = 16
SYMBOL_LEN = 8
SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")
SEED = b"portfolio"


def _discriminator(kind: str, name: str) -> bytes:
    return hashlib.sha256(f"{kind}:{name}".encode()).digest()[:8]


CREATE_IX = _discriminator("global", "create_portfolio")
UPDATE_IX = _discriminator("global", "update_portfolio")
ACCOUNT_DISCRIMINATOR = _discriminator("account", "Portfolio")

_HEADER = struct.Struct("<qqIqQB")        # cash, equity, trade_count, updated_t, seq, holding_count
_HOLDING = struct.Struct(f"<{SYMBOL_LEN}sq")
UPDATE_ARGS_SIZE = _HEADER.size + MAX_HOLDINGS * _HOLDING.size                   # 293
ACCOUNT_SIZE = 8 + 32 + 32 + _HEADER.size + MAX_HOLDINGS * _HOLDING.size + 1    # 366, = Portfolio::SPACE


@dataclass(frozen=True)
class PortfolioState:
    cash_cents: int
    equity_cents: int
    trade_count: int
    updated_t: int                       # market time, whole seconds
    seq: int
    holdings: tuple[tuple[str, int], ...] = field(default_factory=tuple)   # (symbol, qty), at most 16


@dataclass(frozen=True)
class OnChainPortfolio:
    address: str                         # the portfolio account
    authority: str
    owner: str                           # the player's wallet
    state: PortfolioState
    bump: int


def portfolio_address(program_id: Pubkey, authority: Pubkey, owner: Pubkey) -> Pubkey:
    address, _ = Pubkey.find_program_address([SEED, bytes(authority), bytes(owner)], program_id)
    return address


def encode_symbol(symbol: str) -> bytes:
    raw = symbol.encode()
    if len(raw) > SYMBOL_LEN:
        raise ValueError(f"symbol {symbol!r} is longer than {SYMBOL_LEN} bytes")
    return raw.ljust(SYMBOL_LEN, b"\0")


def encode_update_args(state: PortfolioState) -> bytes:
    if len(state.holdings) > MAX_HOLDINGS:
        raise ValueError(f"at most {MAX_HOLDINGS} holdings")
    out = bytearray(_HEADER.pack(state.cash_cents, state.equity_cents, state.trade_count, state.updated_t,
                                 state.seq, len(state.holdings)))
    for i in range(MAX_HOLDINGS):
        symbol, qty = state.holdings[i] if i < len(state.holdings) else ("", 0)
        out += _HOLDING.pack(encode_symbol(symbol), qty)
    return bytes(out)


def create_instruction(program_id: Pubkey, authority: Pubkey, owner: Pubkey) -> Instruction:
    return Instruction(program_id, CREATE_IX, [
        AccountMeta(portfolio_address(program_id, authority, owner), is_signer=False, is_writable=True),
        AccountMeta(authority, is_signer=True, is_writable=True),
        AccountMeta(owner, is_signer=False, is_writable=False),
        AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
    ])


def update_instruction(program_id: Pubkey, authority: Pubkey, owner: Pubkey, state: PortfolioState) -> Instruction:
    return Instruction(program_id, UPDATE_IX + encode_update_args(state), [
        AccountMeta(portfolio_address(program_id, authority, owner), is_signer=False, is_writable=True),
        AccountMeta(authority, is_signer=True, is_writable=False),
    ])


def decode_portfolio(address: str, data: bytes) -> OnChainPortfolio:
    """Decode a Portfolio account. Raises ValueError if it isn't one."""
    if len(data) != ACCOUNT_SIZE or data[:8] != ACCOUNT_DISCRIMINATOR:
        raise ValueError("not a HoopStreet portfolio account")
    authority, owner = Pubkey.from_bytes(data[8:40]), Pubkey.from_bytes(data[40:72])
    cash, equity, trades, updated_t, seq, count = _HEADER.unpack_from(data, 72)
    offset = 72 + _HEADER.size
    holdings = []
    for i in range(min(count, MAX_HOLDINGS)):
        symbol, qty = _HOLDING.unpack_from(data, offset + i * _HOLDING.size)
        holdings.append((symbol.rstrip(b"\0").decode(), qty))
    bump = data[ACCOUNT_SIZE - 1]
    return OnChainPortfolio(address, str(authority), str(owner),
                            PortfolioState(cash, equity, trades, updated_t, seq, tuple(holdings)), bump)


def encode_account(authority: Pubkey, owner: Pubkey, state: PortfolioState, bump: int = 255) -> bytes:
    """The bytes the program stores (used by tests and the fake chain)."""
    args = encode_update_args(state)
    return ACCOUNT_DISCRIMINATOR + bytes(authority) + bytes(owner) + args + bytes([bump])
