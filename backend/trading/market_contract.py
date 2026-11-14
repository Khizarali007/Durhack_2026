"""Contract between Person 1's market engine and Person 2's trading code.

Person 2's code talks to the market only through these types and the
``MarketEngine`` interface. Partly confirmed by Person 1's prototype
(``scripts/simulate_market.py`` on ``person-1-tasks``), partly still guessed.
See docs/person1-contract-guesses.md for which is which.

Conventions shared with Person 4 (docs/person4-interfaces.md):
- ``t`` is market time in epoch seconds (float). Market time runs 12x real time.
- Prices here are floats in HOOP, 2 decimal places. Person 1 stores integer
  cents internally; Person 2's ledger does too. Convert at the edges.
- Players are addressed by ``symbol`` (str), the key Person 4 and the frontend
  use. Person 1 keys by ESPN ``player_id`` (int); ``Player`` carries both.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Literal, Protocol, Union

Side = Literal["buy", "sell"]          # what the engine sees; short/cover are Person 2's layer
OrderStatus = Literal["filled", "partially_filled", "rejected"]


@dataclass(frozen=True)
class Player:
    player_id: int       # ESPN athlete id (Person 1's key)
    symbol: str          # ticker, e.g. "SGA" (Person 4 / frontend key). GUESS: Person 1 will add these
    name: str
    team: str            # team abbreviation, e.g. "OKC"
    start_price: float   # opening price in HOOP


@dataclass(frozen=True)
class MakerQuote:
    """One of a player's 3 market makers. Makers have finite cash and shares,
    so a side is ``None`` when that maker can't trade it (Person 1's model)."""

    maker_id: str              # "MM1", "MM2", "MM3"
    bid: float | None
    ask: float | None
    shares: int                # maker's inventory: the most it can sell you right now


@dataclass(frozen=True)
class Quote:
    symbol: str
    bid: float | None          # best bid across makers (None if no maker can buy)
    ask: float | None          # best ask across makers (None if every maker is out of shares)
    last: float                # last executed trade: this IS "the price"
    fair_value: float          # projected Game Score x injury factor, in HOOP
    makers: tuple[MakerQuote, ...]


@dataclass(frozen=True)
class Fill:
    """Part of an order, executed against one maker at one price."""

    order_id: str
    symbol: str
    side: Side
    qty: int
    price: float
    counterparty: str          # maker id
    t: float                   # market time, epoch seconds


@dataclass(frozen=True)
class OrderResult:
    order_id: str
    status: OrderStatus
    fills: tuple[Fill, ...]
    remaining_qty: int         # unfilled shares: makers ran out of inventory or cash
    reason: str | None = None  # set when rejected, or why it was only partly filled

    @property
    def filled_qty(self) -> int:
        return sum(f.qty for f in self.fills)

    @property
    def average_price(self) -> float | None:
        qty = self.filled_qty
        if not qty:
            return None
        return round(sum(f.qty * f.price for f in self.fills) / qty, 4)


# --- Events pushed to subscribers -------------------------------------------

@dataclass(frozen=True)
class MarketTick:
    """Every tick (0.5 real s): all quotes. Use for stop-loss, limit and margin checks."""

    t: float
    quotes: dict[str, Quote]


@dataclass(frozen=True)
class BotTrade:
    bot_id: str                # e.g. "value-03", "momentum-01"
    symbol: str
    side: Side
    qty: int
    price: float
    t: float


@dataclass(frozen=True)
class BotTradeSummary:
    """Once per market minute: every bot trade in that minute (for the Solana receipt)."""

    minute_t: float            # market time the minute started
    count: int
    total_volume: int          # shares
    trades: tuple[BotTrade, ...]


@dataclass(frozen=True)
class PerformancePayout:
    """GUESS (Person 1's target design, not built yet): holders earn HOOP when a
    player performs. Person 2 credits every human holder ``qty x hoop_per_share``
    and debits shorts the same. Not sent by the fake market yet (ticket P2-22)."""

    t: float
    symbol: str
    hoop_per_share: float
    game_score: float | None
    reason: str                # e.g. "SGA 38 pts, 7 ast"


MarketEvent = Union[MarketTick, BotTradeSummary, PerformancePayout]


class MarketEngine(Protocol):
    """What Person 2 needs from Person 1's engine.

    - Orders are market orders only. Person 1's prototype has no resting order
      book, so limit and stop orders live in Person 2's layer (watch MarketTick).
    - GUESS: the engine doesn't check a human's cash or holdings (Person 2 does),
      so a sell from someone holding nothing is accepted. Shorting needs this.
    - Fills come from the best maker first, then the next, until the order is
      filled or makers run out of shares/cash, so big orders get slippage and
      can come back partly filled.
    """

    def players(self) -> list[Player]: ...

    def market_time(self) -> float: ...

    def quote(self, symbol: str) -> Quote: ...

    def last_price(self, symbol: str) -> float: ...

    def submit_order(self, *, account_id: str, symbol: str, side: Side, qty: int) -> OrderResult: ...

    # OPTIONAL (asked of Person 1): what submit_order would do right now, without
    # trading or changing anything. Used for the "before you confirm" estimate
    # (P2-12). Without it, Person 2 estimates from the makers' current quotes.
    # def preview_order(self, *, symbol: str, side: Side, qty: int) -> OrderResult: ...

    def subscribe(self) -> asyncio.Queue[MarketEvent]: ...

    def unsubscribe(self, queue: asyncio.Queue[MarketEvent]) -> None: ...

    async def run(self) -> None:
        """Run the market clock forever (start it as a background task)."""
        ...
