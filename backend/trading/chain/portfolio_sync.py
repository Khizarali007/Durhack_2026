"""P2-18: keeping every player's on-chain portfolio in step with our database.

Every few seconds the syncer works out each active player's real account
(cash, holdings, trade count) and compares it with what it last sent. For a
player whose account changed, it sends one transaction to the portfolio
program: ``create_portfolio`` first if their account doesn't exist yet, then
``update_portfolio``. The backend's fee payer signs and pays. Trades never wait
for any of this, just like receipts.

That catches every kind of change without hooking each one: orders,
limit/stop fills, payouts, liquidations, mission restores.

- **At most one update per player every 3 s**, and a few per round, so devnet's
  rate limit isn't hit. It shares the receipt sender's client and rate limiter.
- **Players in a mission aren't synced.** Their on-chain portfolio keeps
  showing their real account, which comes back when they restore.
- **Confirmation:** sent updates are checked in one batched status call per
  round. If one fails or never lands within 60 s, it's sent again with a
  higher sequence number. The program rejects anything older than what it
  stores, so a late duplicate can't roll a portfolio back.
- **Holdings:** the 16 biggest by value (the program's limit).

Status per player is kept in ``chain_portfolios`` (``GET /trading/chain/portfolio``).
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Protocol

from solders.instruction import Instruction
from solders.pubkey import Pubkey

from ..db import Database
from ..market_contract import MarketEngine
from ..money import to_cents
from .portfolio_program import (
    ACCOUNT_SIZE,
    MAX_HOLDINGS,
    SYMBOL_LEN,
    OnChainPortfolio,
    PortfolioState,
    create_instruction,
    decode_portfolio,
    portfolio_address,
    update_instruction,
)
from .wallets import ensure_wallet

log = logging.getLogger("trading.portfolios")

SYNC_INTERVAL_S = 3.0          # override with SOLANA_PORTFOLIO_SYNC_S
MIN_GAP_S = 3.0                # per player
MAX_SENDS_PER_ROUND = 3
LANDING_TIMEOUT_S = 60.0
READ_CACHE_S = 2.0             # leaderboard reads of the chain are cached this long


class PortfolioChain(Protocol):
    """What the syncer needs from devnet (``DevnetSender`` provides it)."""

    payer_pubkey: Pubkey

    async def send_instructions(self, instructions: list[Instruction]) -> str: ...

    async def account_exists(self, address: Pubkey) -> bool: ...

    async def program_accounts(self, program_id: Pubkey, data_size: int, owner_field_offset: int,
                               owner_field: Pubkey) -> list[tuple[str, bytes]]: ...

    async def statuses(self, signatures: list[str]) -> dict: ...


@dataclass(frozen=True)
class Desired:
    user_id: str
    owner: Pubkey
    state: PortfolioState          # seq filled in when sent
    fingerprint: str


def fingerprint(cash_cents: int, holdings: tuple[tuple[str, int], ...], trade_count: int) -> str:
    return hashlib.sha256(json.dumps([cash_cents, sorted(holdings), trade_count]).encode()).hexdigest()


class PortfolioSyncer:
    def __init__(self, db: Database, market: MarketEngine, chain: PortfolioChain, program_id: Pubkey, *,
                 interval_s: float | None = None, min_gap_s: float = MIN_GAP_S,
                 max_sends_per_round: int = MAX_SENDS_PER_ROUND, landing_timeout_s: float = LANDING_TIMEOUT_S,
                 read_cache_s: float = READ_CACHE_S) -> None:
        self.db = db
        self.market = market
        self.chain = chain
        self.program_id = program_id
        self.authority = chain.payer_pubkey
        self.interval_s = interval_s if interval_s is not None else float(
            os.environ.get("SOLANA_PORTFOLIO_SYNC_S", SYNC_INTERVAL_S))
        self.min_gap_s = min_gap_s
        self.max_sends_per_round = max_sends_per_round
        self.landing_timeout_s = landing_timeout_s
        self.read_cache_s = read_cache_s
        self._read_cache: tuple[float, list[OnChainPortfolio]] | None = None
        self._task: asyncio.Task | None = None

    # --- Lifecycle -----------------------------------------------------------------------

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="portfolio-syncer")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _run(self) -> None:
        while True:
            try:
                await self.run_once()
            except Exception:
                log.exception("portfolio sync round failed")
            await asyncio.sleep(self.interval_s)

    async def run_once(self) -> list[str]:
        """Check sent updates, then send what changed. Returns the user ids sent this round."""
        await self.check_sent()
        return await self.push_changed()

    def address_for(self, owner: Pubkey) -> Pubkey:
        return portfolio_address(self.program_id, self.authority, owner)

    # --- What each portfolio should hold -------------------------------------------------------

    def desired(self) -> dict[str, Desired]:
        """Every active player's real account (not players in a mission)."""
        with self.db.lock:
            users = self.db.conn.execute(
                "SELECT user_id, cash_cents FROM users WHERE user_id IN"
                " (SELECT user_id FROM positions UNION SELECT user_id FROM trades)"
                " AND user_id NOT IN (SELECT user_id FROM account_snapshots)").fetchall()
            positions = self.db.conn.execute("SELECT user_id, symbol, qty FROM positions").fetchall()
            counts = dict(self.db.conn.execute(
                "SELECT user_id, count(DISTINCT order_id) FROM trades GROUP BY user_id").fetchall())
        held: dict[str, list[tuple[str, int, int]]] = defaultdict(list)
        for user_id, symbol, qty in positions:
            if len(symbol.encode()) > SYMBOL_LEN:
                log.warning("symbol %s is too long for the on-chain portfolio; left out", symbol)
                continue
            held[user_id].append((symbol, qty, qty * to_cents(self.market.last_price(symbol))))
        out = {}
        for user_id, cash in users:
            mine = sorted(held.get(user_id, []), key=lambda h: -abs(h[2]))[:MAX_HOLDINGS]
            holdings = tuple((symbol, qty) for symbol, qty, _ in mine)
            trades = counts.get(user_id, 0)
            state = PortfolioState(cash, cash + sum(v for *_, v in mine), trades, int(self.market.market_time()), 0,
                                   holdings)
            owner = Pubkey.from_string(ensure_wallet(self.db, user_id))
            out[user_id] = Desired(user_id, owner, state, fingerprint(cash, holdings, trades))
        return out

    # --- Sending ---------------------------------------------------------------------------------

    def _row(self, user_id: str):
        with self.db.lock:
            return self.db.conn.execute("SELECT * FROM chain_portfolios WHERE user_id = ?", (user_id,)).fetchone()

    def _save(self, user_id: str, **fields) -> None:
        fields["updated_at"] = time.time()
        columns = ", ".join(fields)
        updates = ", ".join(f"{k} = excluded.{k}" for k in fields)
        with self.db.lock, self.db.conn:
            self.db.conn.execute(
                f"INSERT INTO chain_portfolios (user_id, {columns}) VALUES (?{', ?' * len(fields)})"
                f" ON CONFLICT (user_id) DO UPDATE SET {updates}", (user_id, *fields.values()))

    async def push_changed(self) -> list[str]:
        now = time.time()
        sent = []
        for user_id, want in self.desired().items():
            if len(sent) >= self.max_sends_per_round:
                break
            row = self._row(user_id)
            if row is not None:
                if row["synced_hash"] == want.fingerprint or row["status"] == "sent":
                    continue  # up to date, or an update is still in flight
                if row["sent_at"] and now - row["sent_at"] < self.min_gap_s:
                    continue
            if await self._send(user_id, want, row, now):
                sent.append(user_id)
        return sent

    async def _send(self, user_id: str, want: Desired, row, now: float) -> bool:
        address = self.address_for(want.owner)
        created = bool(row and row["created"])
        seq = (row["seq"] if row else 0) + 1
        try:
            if not created:
                created = await self.chain.account_exists(address)
            state = PortfolioState(want.state.cash_cents, want.state.equity_cents, want.state.trade_count,
                                   want.state.updated_t, seq, want.state.holdings)
            instructions = [] if created else [create_instruction(self.program_id, self.authority, want.owner)]
            instructions.append(update_instruction(self.program_id, self.authority, want.owner, state))
            signature = await self.chain.send_instructions(instructions)
        except Exception as exc:
            log.warning("portfolio update for %s not sent: %r", user_id, exc)
            self._save(user_id, address=str(address), seq=seq, status="failed", sent_at=now,
                       error=f"{type(exc).__name__}: {exc}"[:300])
            return False
        self._save(user_id, address=str(address), owner=str(want.owner), created=int(created), seq=seq,
                   synced_hash=want.fingerprint, status="sent", signature=signature, sent_at=now, error=None)
        return True

    # --- Confirming --------------------------------------------------------------------------------

    async def check_sent(self) -> None:
        with self.db.lock:
            rows = self.db.conn.execute(
                "SELECT user_id, signature, sent_at FROM chain_portfolios WHERE status = 'sent'").fetchall()
        if not rows:
            return
        try:
            statuses = await self.chain.statuses([r["signature"] for r in rows])
        except Exception as exc:
            log.warning("portfolio status check failed: %r", exc)
            return
        now = time.time()
        for r in rows:
            status = statuses.get(r["signature"])
            if status == "confirmed":
                self._save(r["user_id"], status="confirmed", created=1, confirmed_at=now,
                           confirm_ms=int(1000 * (now - r["sent_at"])))
            elif status == "failed" or now - r["sent_at"] > self.landing_timeout_s:
                # Send it again (with a higher seq); re-check whether the account exists first.
                self._save(r["user_id"], status="failed", synced_hash=None, created=0,
                           error="rejected by the chain" if status == "failed" else "never landed")

    # --- Reading the chain back (the leaderboard) ------------------------------------------------------

    async def read_accounts(self) -> list[OnChainPortfolio]:
        """Every portfolio this backend has written, straight from devnet (cached for a moment)."""
        if self._read_cache and time.monotonic() - self._read_cache[0] < self.read_cache_s:
            return self._read_cache[1]
        raw = await self.chain.program_accounts(self.program_id, ACCOUNT_SIZE, 8, self.authority)
        accounts = []
        for address, data in raw:
            try:
                accounts.append(decode_portfolio(address, data))
            except ValueError:
                continue
        self._read_cache = (time.monotonic(), accounts)
        return accounts
