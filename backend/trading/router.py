"""Person 2's HTTP routes, all under /trading."""

from __future__ import annotations

from dataclasses import asdict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from .accounts import (
    User,
    UsernameTaken,
    authenticate,
    create_account,
    create_guest_user,
    create_session,
    delete_session,
)
from .chain.bot_bundles import bundle_lines
from .chain.config import explorer_url
from .chain.receipts import bot_trades_hash
from .chain.status import ChainStatus, chain_status
from .chain.wallets import ensure_wallet
from .db import Database
from .deps import current_token, current_user, get_db
from .market_provider import get_market
from .money import to_hoop
from .money import to_cents
from .open_orders import OpenOrder, cancel_open_order, create_open_order, list_open_orders
from .orders import OrderError, place_market_order, reserved_cash
from .portfolio import build_portfolio
from .trades import trades_for_user

router = APIRouter(prefix="/trading", tags=["trading"])


class SessionOut(BaseModel):
    token: str
    user_id: str
    username: str | None
    is_guest: bool
    cash: float
    wallet_address: str = Field(description="The user's server-held Solana devnet wallet")


class CredentialsIn(BaseModel):
    username: str = Field(min_length=3, max_length=20, pattern=r"^[A-Za-z0-9_-]+$",
                          description="3-20 letters, digits, _ or -. Unique ignoring case")
    password: str = Field(min_length=6, max_length=128)


def _session_for(db: Database, user: User) -> SessionOut:
    return SessionOut(token=create_session(db, user.user_id), user_id=user.user_id,
                      username=user.username, is_guest=user.is_guest, cash=to_hoop(user.cash_cents),
                      wallet_address=ensure_wallet(db, user.user_id))


class MeOut(BaseModel):
    user_id: str
    username: str | None
    is_guest: bool
    cash: float
    wallet_address: str
    wallet_explorer_url: str


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
    receipt_status: Literal["pending", "confirmed", "failed"] = Field(
        description="Solana receipt. Always pending here: poll GET /trading/orders/{order_id}/receipt")


class OpenOrderIn(BaseModel):
    symbol: str = Field(examples=["SGA"])
    side: Literal["buy", "sell"]
    order_type: Literal["limit", "stop"] = Field(
        description="limit: buy at or below / sell at or above `price`. stop: stop-loss, sell when the price falls to `price`")
    qty: int = Field(gt=0, le=10_000)
    price: float = Field(gt=0, le=100_000, description="Limit price, or the stop-loss trigger, in HOOP")


class OpenOrderOut(BaseModel):
    order_id: str
    symbol: str
    side: Literal["buy", "sell"]
    order_type: Literal["limit", "stop"]
    price: float
    qty: int
    filled_qty: int
    remaining_qty: int
    reserved_cash: float = Field(description="Cash held back for this order (buy limits)")
    status: Literal["open", "filled", "cancelled", "failed"]
    reason: str | None = Field(description="Why it failed, if it did")
    last_fill_order_id: str | None = Field(
        description="The market order it fired; its receipt is at /trading/orders/{id}/receipt")
    created_t: float


def _open_order_out(o: OpenOrder) -> OpenOrderOut:
    return OpenOrderOut(order_id=o.order_id, symbol=o.symbol, side=o.side, order_type=o.order_type,
                        price=to_hoop(o.price_cents), qty=o.qty, filled_qty=o.filled_qty,
                        remaining_qty=o.remaining_qty, reserved_cash=to_hoop(o.reserved_cash_cents),
                        status=o.status, reason=o.reason, last_fill_order_id=o.last_fill_order_id,
                        created_t=o.created_t)


class ReceiptOut(BaseModel):
    order_id: str
    status: Literal["pending", "confirmed", "failed"]
    signature: str | None
    explorer_url: str | None = Field(description="Public page showing the receipt on Solana devnet")
    confirm_ms: int | None = Field(description="How long Solana took to confirm it, in milliseconds")


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
    reserved_cash: float = Field(description="Part of cash held back for open buy limits")
    available_cash: float = Field(description="cash - reserved_cash: what you can spend now")
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
    receipt_explorer_url: str | None


class BotBundleOut(BaseModel):
    bundle_id: str
    minute_t: float = Field(description="Market time the minute started, epoch seconds")
    trade_count: int
    total_volume: int = Field(description="Shares traded by bots in that minute")
    trades_hash: str = Field(description="sha256 of the trade list, as written on-chain")
    receipt_status: Literal["pending", "confirmed", "failed"]
    receipt_signature: str | None
    receipt_explorer_url: str | None
    receipt_confirm_ms: int | None


class BotTradeOut(BaseModel):
    bot_id: str
    symbol: str
    side: Literal["buy", "sell"]
    qty: int
    price: float
    t: float


class BotBundleDetailOut(BotBundleOut):
    trades: list[BotTradeOut]
    recomputed_hash: str = Field(description="sha256 recomputed from the stored trades just now")
    hash_matches: bool = Field(description="True if the stored trades match the hash on-chain")


def _bundle_out(row) -> dict:
    signature = row["receipt_signature"]
    return dict(bundle_id=row["bundle_id"], minute_t=row["minute_t"], trade_count=row["trade_count"],
                total_volume=row["total_volume"], trades_hash=row["trades_hash"],
                receipt_status=row["receipt_status"], receipt_signature=signature,
                receipt_explorer_url=explorer_url("tx", signature) if signature else None,
                receipt_confirm_ms=row["receipt_confirm_ms"])


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


@router.post("/guest", status_code=status.HTTP_201_CREATED)
def guest(db: Database = Depends(get_db)) -> SessionOut:
    """Play as guest: one tap, no form. A new account with 100,000 HOOP.

    Send the token on every later request as `Authorization: Bearer <token>`.
    """
    return _session_for(db, create_guest_user(db))


@router.post("/session", status_code=status.HTTP_201_CREATED)
def new_session(db: Database = Depends(get_db)) -> SessionOut:
    """Same as `POST /trading/guest` (kept so P2-03 callers keep working)."""
    return _session_for(db, create_guest_user(db))


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(credentials: CredentialsIn, db: Database = Depends(get_db)) -> SessionOut:
    """Create an account with 100,000 HOOP and log in. `409` if the username is taken."""
    try:
        user = create_account(db, credentials.username, credentials.password)
    except UsernameTaken:
        raise HTTPException(status.HTTP_409_CONFLICT, "that username is taken") from None
    return _session_for(db, user)


@router.post("/login")
def login(credentials: CredentialsIn, db: Database = Depends(get_db)) -> SessionOut:
    """Log in and get a new token. Your portfolio is exactly as you left it."""
    user = authenticate(db, credentials.username, credentials.password)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong username or password")
    return _session_for(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token: str = Depends(current_token), db: Database = Depends(get_db)) -> None:
    """End this session. The token stops working; other sessions are unaffected."""
    delete_session(db, token)


@router.get("/me")
def me(user: User = Depends(current_user), db: Database = Depends(get_db)) -> MeOut:
    """Who the token belongs to, their cash and their devnet wallet."""
    address = ensure_wallet(db, user.user_id)
    return MeOut(user_id=user.user_id, username=user.username, is_guest=user.is_guest,
                 cash=to_hoop(user.cash_cents), wallet_address=address,
                 wallet_explorer_url=explorer_url("address", address))


@router.post("/orders")
async def place_order(order: OrderIn, request: Request, user: User = Depends(current_user),
                      db: Database = Depends(get_db)) -> OrderOut:
    """Buy or sell at the market's best price.

    Errors: `400` not enough cash or shares, `404` unknown symbol, `409` the
    market makers couldn't fill any of it. A big order can come back
    `partially_filled` with a `reason`. The Solana receipt is written in the
    background: the order never waits for it.
    """
    # async on purpose: engine calls run on the same thread that ticks the market.
    try:
        outcome = place_market_order(db, get_market(), user.user_id, order.symbol, order.side, order.qty)
    except OrderError as error:
        raise HTTPException(error.status_code, error.message) from error
    if request.app.state.receipts:
        request.app.state.receipts.enqueue(outcome.order_id)
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
        receipt_status="pending",
    )


@router.post("/orders/open", status_code=status.HTTP_201_CREATED)
async def place_open_order(order: OpenOrderIn, user: User = Depends(current_user),
                           db: Database = Depends(get_db)) -> OpenOrderOut:
    """Place a limit order or a stop-loss. It waits until the price is reached, then trades.

    While open, a buy limit holds back the cash it needs and a sell limit or
    stop-loss holds back the shares. Errors: `400` not enough cash or shares,
    or a stop-loss at or above the current price; `404` unknown symbol.
    """
    try:
        created = create_open_order(db, get_market(), user.user_id, symbol=order.symbol, side=order.side,
                                    order_type=order.order_type, qty=order.qty, price_cents=to_cents(order.price))
    except OrderError as error:
        raise HTTPException(error.status_code, error.message) from error
    return _open_order_out(created)


@router.get("/orders/open")
def open_orders(user: User = Depends(current_user), db: Database = Depends(get_db),
                include_closed: bool = Query(False, description="Also show filled, cancelled and failed orders")
                ) -> list[OpenOrderOut]:
    """Your limit and stop-loss orders, newest first."""
    return [_open_order_out(o) for o in list_open_orders(db, user.user_id, include_closed)]


@router.delete("/orders/{order_id}")
def cancel_order(order_id: str, user: User = Depends(current_user), db: Database = Depends(get_db)) -> OpenOrderOut:
    """Cancel an open limit or stop-loss order and release what it held back. `409` if it already filled."""
    try:
        return _open_order_out(cancel_open_order(db, user.user_id, order_id))
    except OrderError as error:
        raise HTTPException(error.status_code, error.message) from error


@router.get("/orders/{order_id}/receipt")
def order_receipt(order_id: str, user: User = Depends(current_user),
                  db: Database = Depends(get_db)) -> ReceiptOut:
    """The Solana receipt for one of your orders: pending, then confirmed with an Explorer link."""
    with db.lock:
        row = db.conn.execute(
            "SELECT receipt_status, receipt_signature, receipt_confirm_ms FROM trades"
            " WHERE order_id = ? AND user_id = ? LIMIT 1", (order_id, user.user_id)
        ).fetchone()
    if row is None:
        raise HTTPException(404, "no such order")
    signature = row["receipt_signature"]
    return ReceiptOut(order_id=order_id, status=row["receipt_status"], signature=signature,
                      explorer_url=explorer_url("tx", signature) if signature else None,
                      confirm_ms=row["receipt_confirm_ms"])


@router.get("/portfolio")
async def portfolio(user: User = Depends(current_user), db: Database = Depends(get_db)) -> PortfolioOut:
    """Your cash, holdings marked at the last trade price, and profit/loss."""
    view = build_portfolio(db, get_market(), user.user_id)
    equity = view.equity_cents
    reserved = reserved_cash(db, user.user_id)
    return PortfolioOut(
        user_id=view.user_id,
        cash=to_hoop(view.cash_cents),
        reserved_cash=to_hoop(reserved),
        available_cash=to_hoop(view.cash_cents - reserved),
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
                 receipt_signature=r.receipt_signature, receipt_confirm_ms=r.receipt_confirm_ms,
                 receipt_explorer_url=explorer_url("tx", r.receipt_signature) if r.receipt_signature else None)
        for r in trades_for_user(db, user.user_id, since_t=since_t, symbol=symbol, limit=limit)
    ]


@router.get("/bot-bundles")
def bot_bundles(db: Database = Depends(get_db),
                limit: int = Query(20, ge=1, le=200, description="Newest first")) -> list[BotBundleOut]:
    """Recent minutes of bot trading, each settled on Solana as one receipt. Public."""
    with db.lock:
        rows = db.conn.execute("SELECT * FROM bot_bundles ORDER BY rowid DESC LIMIT ?", (limit,)).fetchall()
    return [BotBundleOut(**_bundle_out(r)) for r in rows]


@router.get("/bot-bundles/{bundle_id}")
def bot_bundle(bundle_id: str, db: Database = Depends(get_db)) -> BotBundleDetailOut:
    """One bundle with its full trade list, and a fresh check that it matches the hash on-chain."""
    with db.lock:
        row = db.conn.execute("SELECT * FROM bot_bundles WHERE bundle_id = ?", (bundle_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "no such bundle")
    lines = bundle_lines(db, bundle_id)
    recomputed = bot_trades_hash(lines)
    return BotBundleDetailOut(
        **_bundle_out(row),
        trades=[BotTradeOut(bot_id=b.bot_id, symbol=b.symbol, side=b.side, qty=b.qty,
                            price=to_hoop(b.price_cents), t=b.t) for b in lines],
        recomputed_hash=recomputed,
        hash_matches=recomputed == row["trades_hash"],
    )


@router.get("/chain/status")
async def solana_status() -> ChainStatus:
    """Is the backend ready to write receipts to Solana devnet? Shows the fee-payer
    wallet, its SOL balance and whether devnet answered (5 s timeout)."""
    return await chain_status()


@router.get("/debug/quote/{symbol}")
def debug_quote(symbol: str) -> dict:
    """Current quote straight from the market engine (fake for now). For checking the wiring."""
    market = get_market()
    if symbol not in {p.symbol for p in market.players()}:
        raise HTTPException(404, f"unknown symbol {symbol!r}")
    return asdict(market.quote(symbol))
