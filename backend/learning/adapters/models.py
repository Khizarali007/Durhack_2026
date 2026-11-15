"""Data shapes the learning layer expects from teammates' code.

These are the contract documented in docs/person4-interfaces.md. Teammates do
not need to import these classes: anything with the same fields (a pydantic
model, a dataclass, or a dict validated into these models) is fine.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Clock: 1 market minute = 5 real seconds, so market time runs 12x real time.
MARKET_SECONDS_PER_REAL_SECOND = 12.0
# The UI (and the mock market) update every 0.5 real seconds.
TICK_INTERVAL_S = 0.5

EventKind = Literal["early_warning", "injury", "hot_streak", "rest_day", "trade_rumour"]
Side = Literal["buy", "sell", "short", "cover"]
FillReason = Literal["market", "limit", "stop", "liquidation"]

EVENT_KINDS: tuple[str, ...] = ("early_warning", "injury", "hot_streak", "rest_day", "trade_rumour")


class Tick(BaseModel):
    """One price update for one symbol. Provided by Person 1 (market engine)."""

    model_config = ConfigDict(frozen=True)

    t: float = Field(description="Market time, epoch seconds")
    symbol: str
    price: float = Field(gt=0, description="Last traded price, HOOP")
    fair_value: float = Field(gt=0, description="Engine's fair value, HOOP")
    best_bid: float = Field(gt=0)
    best_ask: float = Field(gt=0)


class MarketEvent(BaseModel):
    """A scripted news event that moves fair value and volatility."""

    t: float = Field(description="Market time the event fires, epoch seconds")
    symbol: str
    kind: EventKind
    headline: str
    impact: float = Field(
        default=0.0,
        description="Fractional fair-value shift, e.g. +0.18 means +18% at full effect",
    )
    storm: float = Field(
        default=1.0,
        gt=0,
        description="Volatility multiplier at the moment of the event (1.0 = normal)",
    )


class Trade(BaseModel):
    """One fill. Provided by Person 2 (trading)."""

    trade_id: str
    user_id: str
    symbol: str
    side: Side
    qty: float = Field(gt=0, description="Always positive; side gives direction")
    price: float = Field(gt=0, description="Fill price per share, HOOP")
    fee: float = Field(ge=0, description="Fee charged on this fill, HOOP")
    t: float = Field(description="Market time of the fill, epoch seconds")
    reason: FillReason = "market"


class Position(BaseModel):
    symbol: str
    qty: float = Field(description="Shares held; negative means short")
    avg_cost: float = Field(ge=0, description="Average entry price per share, HOOP")


class Portfolio(BaseModel):
    """A user's account snapshot. Provided by Person 2."""

    cash: float
    equity: float = Field(description="cash + sum(qty * current price)")
    positions: list[Position] = Field(default_factory=list)
