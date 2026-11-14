"""Person 2's HTTP routes, all under /trading."""

from __future__ import annotations

from dataclasses import asdict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from .accounts import User, create_guest_user, create_session
from .db import Database
from .deps import current_user, get_db
from .market_provider import get_market
from .money import to_hoop
from .orders import OrderError, place_market_order
from .portfolio import build_portfolio
from .trades import trades_for_user

router = APIRouter(prefix="/trading", tags=["trading"])


class SessionOut(BaseModel):
    token: str
    user_id: str
    cash: float


class MeOut(BaseModel):
    user_id: str
    username: str | None
    is_guest: bool
    cash: float


class OrderIn(BaseModel):
    symbol: str = Field(examples=["SGA"])
    side: Literal["buy", "sell"]
    qty: int = Field(gt=0, le=10_000, description="Whole shares")


class FillOut(BaseModel):
    trade_id: str
    qty: int
    price: float
    fee: float
    t: float = Field(description="Market time of the fill, epoch seconds")
    counterparty: str


class OrderOut(BaseModel):
    order_id: str
    status: Literal["filled", "partially_filled"]
    symbol: str
    side: Literal["buy", "sell"]
    requested_qty: int
    filled_qty: int
    average_price: float
    total_fee: float
    cash: float = Field(description="Your cash after the order")
    position_qty: int = Field(description="Shares of this player you hold after the order")
    fills: list[FillOut]
    reason: str | None = Field(None, description="Why the order was only partly filled")


class PositionOut(BaseModel):
    symbol: str
    name: str | None
    team: str | None
    qty: int
    avg_cost: float = Field(description="Average price paid per share, fees not included")
    last_price: float = Field(description="Last traded price: what each share is worth now")
    market_value: float
    unrealised_pnl: float
    unrealised_pnl_pct: float
    weight_pct: float = Field(description="Share of your total equity in this player")


class PortfolioOut(BaseModel):
    user_id: str
    cash: float
    positions_value: float
    equity: float = Field(description="cash + positions_value")
    starting_cash: float
    total_pnl: float = Field(description="equity - starting_cash (= realised + unrealised - fees)")
    total_pnl_pct: float
    unrealised_pnl: float
    realised_pnl: float
    fees_paid: float
    positions: list[PositionOut] = Field(description="Largest holding first")


class TradeOut(BaseModel):
    """One fill. The first nine fields match Person 4's Trade model."""

    trade_id: str
    user_id: str
    symbol: str
    side: Literal["buy", "sell", "short", "cover"]
    qty: int
    price: float = Field(description="Fill price per share, HOOP")
    fee: float = Field(description="Fee charged on this fill, HOOP")
    t: float = Field(description="Market time of the fill, epoch seconds")
    reason: Literal["market", "limit", "stop", "liquidation"]
    order_id: str
    counterparty: str | None
    receipt_status: Literal["pending", "confirmed", "failed"] = Field(
        description="Solana receipt: pending until P2-09 writes it on-chain")
    receipt_signature: str | None
    receipt_confirm_ms: int | None


def _pct(part: int, whole: int) -> float:
    return round(100 * part / whole, 2) if whole else 0.0


@router.get("/health")
def health(db: Database = Depends(get_db)) -> dict:
    market = get_market()
    return {
        "status": "ok",
        "component": "trading",
        "market_time": market.market_time(),
        "players": len(market.players()),
        "tables": db.tables(),
    }


@router.post("/session", status_code=status.HTTP_201_CREATED)
def new_session(db: Database = Depends(get_db)) -> SessionOut:
    """Start playing: creates a temporary account with 100,000 HOOP and returns its token.

    Send the token on every later request as `Authorization: Bearer <token>`.
    """
    user = create_guest_user(db)
    token = create_session(db, user.user_id)
    return SessionOut(token=token, user_id=user.user_id, cash=to_hoop(user.cash_cents))


@router.get("/me")
def me(user: User = Depends(current_user)) -> MeOut:
    """Who the token belongs to, and their cash."""
    return MeOut(user_id=user.user_id, username=user.username, is_guest=user.is_guest,
                 cash=to_hoop(user.cash_cents))


@router.post("/orders")
async def place_order(order: OrderIn, user: User = Depends(current_user),
                      db: Database = Depends(get_db)) -> OrderOut:
    """Buy or sell at the market's best price.

    Errors: `400` not enough cash or shares, `404` unknown symbol, `409` the
    market makers couldn't fill any of it. A big order can come back
    `partially_filled` with a `reason`.
    """
    # async on purpose: engine calls run on the same thread that ticks the market.
    try:
        outcome = place_market_order(db, get_market(), user.user_id, order.symbol, order.side, order.qty)
    except OrderError as error:
        raise HTTPException(error.status_code, error.message) from error
    return OrderOut(
        order_id=outcome.order_id,
        status=outcome.status,
        symbol=outcome.symbol,
        side=outcome.side,
        requested_qty=outcome.requested_qty,
        filled_qty=outcome.filled_qty,
        average_price=round(outcome.average_price_cents / 100, 4),
        total_fee=to_hoop(outcome.total_fee_cents),
        cash=to_hoop(outcome.cash_cents_after),
        position_qty=outcome.position_qty_after,
        fills=[FillOut(trade_id=f.trade_id, qty=f.qty, price=to_hoop(f.price_cents), fee=to_hoop(f.fee_cents),
                       t=f.t, counterparty=f.counterparty) for f in outcome.fills],
        reason=outcome.reason,
    )


@router.get("/portfolio")
async def portfolio(user: User = Depends(current_user), db: Database = Depends(get_db)) -> PortfolioOut:
    """Your cash, holdings marked at the last trade price, and profit/loss."""
    view = build_portfolio(db, get_market(), user.user_id)
    equity = view.equity_cents
    return PortfolioOut(
        user_id=view.user_id,
        cash=to_hoop(view.cash_cents),
        positions_value=to_hoop(view.positions_value_cents),
        equity=to_hoop(equity),
        starting_cash=to_hoop(view.starting_cash_cents),
        total_pnl=to_hoop(view.total_pnl_cents),
        total_pnl_pct=_pct(view.total_pnl_cents, view.starting_cash_cents),
        unrealised_pnl=to_hoop(view.unrealised_cents),
        realised_pnl=to_hoop(view.realised_cents),
        fees_paid=to_hoop(view.fees_cents),
        positions=[
            PositionOut(
                symbol=p.symbol, name=p.name, team=p.team, qty=p.qty,
                avg_cost=round(p.avg_cost_cents / 100, 4),
                last_price=to_hoop(p.last_price_cents),
                market_value=to_hoop(p.market_value_cents),
                unrealised_pnl=to_hoop(p.unrealised_cents),
                unrealised_pnl_pct=_pct(p.unrealised_cents, p.cost_basis_cents),
                weight_pct=_pct(p.market_value_cents, equity),
            )
            for p in view.positions
        ],
    )


@router.get("/trades")
def trades(
    user: User = Depends(current_user),
    db: Database = Depends(get_db),
    since_t: float | None = Query(None, description="Only fills at or after this market time"),
    symbol: str | None = Query(None, description="Only this player"),
    limit: int = Query(500, ge=1, le=5000, description="Only the most recent N (still oldest first)"),
) -> list[TradeOut]:
    """Your fills, oldest first."""
    return [
        TradeOut(trade_id=r.trade_id, user_id=r.user_id, symbol=r.symbol, side=r.side, qty=r.qty,
                 price=to_hoop(r.price_cents), fee=to_hoop(r.fee_cents), t=r.t, reason=r.reason,
                 order_id=r.order_id, counterparty=r.counterparty, receipt_status=r.receipt_status,
                 receipt_signature=r.receipt_signature, receipt_confirm_ms=r.receipt_confirm_ms)
        for r in trades_for_user(db, user.user_id, since_t=since_t, symbol=symbol, limit=limit)
    ]


@router.get("/debug/quote/{symbol}")
def debug_quote(symbol: str) -> dict:
    """Current quote straight from the market engine (fake for now). For checking the wiring."""
    market = get_market()
    if symbol not in {p.symbol for p in market.players()}:
        raise HTTPException(404, f"unknown symbol {symbol!r}")
    return asdict(market.quote(symbol))
