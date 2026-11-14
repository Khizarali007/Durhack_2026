"""Person 2's HTTP routes, all under /trading."""

from __future__ import annotations

from dataclasses import asdict
from typing import Literal

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from .accounts import (
    User,
    UsernameTaken,
    authenticate,
    create_account,
    create_guest_user,
    create_session,
    delete_session,
    user_for_token,
)
from .live import fill_message, open_order_message
from .margin import LIQUIDATION_RATIO, MAINTENANCE_RATIO, WARNING_RATIO, MarginView, margin_view
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
from .equity import INTERVAL_S, equity_history, max_drawdown
from .estimates import estimate_order
from .orders import FEE_RATE, MAX_LEVERAGE, OrderError, place_market_order, reserved_cash, short_collateral
from .portfolio import build_portfolio
from .resets import restore_account
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
    side: Literal["buy", "sell", "short", "cover"] = Field(
        description="buy / sell shares you hold, or short (sell shares you don't own) / cover (buy them back)")
    qty: int = Field(gt=0, le=10_000, description="Whole shares")
    leverage: int = Field(1, ge=1, le=MAX_LEVERAGE, description=(
        "Buys and shorts: up to 3x. Your exposure can reach this many times your equity; a leveraged "
        "buy borrows, so cash can go negative. Ignored for sell and cover"))


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
    side: Literal["buy", "sell", "short", "cover"]
    requested_qty: int
    filled_qty: int
    average_price: float
    total_fee: float
    cash: float = Field(description="Your cash after the order")
    position_qty: int = Field(description="Shares of this player you hold after the order (negative = short)")
    fills: list[FillOut]
    reason: str | None = Field(None, description="Why the order was only partly filled")
    receipt_status: Literal["pending", "confirmed", "failed"] = Field(
        description="Solana receipt. Always pending here: poll GET /trading/orders/{order_id}/receipt")
    quoted_best_price: float | None = Field(
        description="Best price when you placed the order: the ask to buy or cover, the bid to sell or short")
    slippage: float | None = Field(description="Per share: how much worse your average was than the best price")
    slippage_pct: float | None
    leverage: int = Field(1, description="The leverage this order used (buys and shorts)")


class MakerQuoteOut(BaseModel):
    maker_id: str
    bid: float | None
    ask: float | None
    shares: int = Field(description="Shares this maker can sell you right now")


class EstimateOut(BaseModel):
    """What an order would cost right now. Nothing is traded."""

    symbol: str
    side: Literal["buy", "sell", "short", "cover"]
    qty: int
    method: str = Field(description="'engine preview' (exact) or 'maker quotes (approximate)'")
    best_bid: float | None
    best_ask: float | None
    spread: float | None = Field(description="best_ask - best_bid")
    spread_pct: float | None = Field(description="Spread as a % of the mid price")
    best_price: float | None = Field(description="The ask to buy or cover, the bid to sell or short")
    estimated_fillable_qty: int
    estimated_avg_price: float | None
    estimated_slippage: float = Field(description="Per share, how much worse the average is than the best price")
    estimated_slippage_pct: float
    estimated_notional: float
    estimated_fee: float
    fee_rate_pct: float
    estimated_total: float = Field(
        description="Buy/cover: what you'd pay incl. fee. Sell/short: what you'd receive after the fee")
    available_cash: float = Field(
        description="Buy/short: buying power at this leverage (leverage x equity - exposure - reservations). "
                    "Sell/cover: your cash")
    can_afford_qty: int | None = Field(
        description="Buy/short/cover: how many shares your available cash covers (a short holds back 200% of its value)")
    sellable_qty: int | None = Field(description="Sells: shares you hold that aren't reserved for open orders")
    position_qty: int = Field(description="Shares of this player you hold now (negative = short)")
    leverage: int = Field(description="Leverage the estimate assumed (buys and shorts)")
    ok: bool = Field(description="True if the whole order would go through as asked")
    warnings: list[str] = Field(description="Plain-English heads-ups for the order ticket")
    makers: list[MakerQuoteOut]


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
    side: Literal["long", "short"] = Field(description="long: you own the shares. short: you sold shares you owe")
    qty: int = Field(description="Negative = short")
    avg_cost: float = Field(description="Average price per share, fees not included: paid (long) or sold at (short)")
    last_price: float = Field(description="Last traded price: what each share is worth now")
    market_value: float = Field(description="qty x last price. Negative for a short: what buying back would cost")
    unrealised_pnl: float = Field(description="For a short, this grows as the price falls")
    unrealised_pnl_pct: float
    weight_pct: float = Field(description="Share of your total equity in this player (negative for a short)")


class MarginOut(BaseModel):
    """P2-15: how close the account is to a margin call. Drives the margin bar."""

    status: Literal["ok", "warning", "margin_call"]
    margin_ratio_pct: float | None = Field(
        description="equity / gross exposure. None with no positions. A fresh 3x position is about 33%")
    leverage: float | None = Field(description="gross exposure / equity (None if equity is 0 or less)")
    gross_exposure: float = Field(description="Every position's value, long or short")
    borrowed: float = Field(description="Cash borrowed for leveraged buys (when cash is below 0)")
    buying_power: float = Field(description="What a new 1x buy or short can use")
    buying_power_max: float = Field(description="What a new buy or short can use at 3x")
    max_leverage: int
    warning_pct: float
    maintenance_pct: float = Field(description="Below this: margin call")
    liquidation_pct: float = Field(description="Below this: positions are sold for you straight away")
    margin_call_deadline_t: float | None = Field(
        description="During a margin call: market time your positions get sold if you haven't fixed it")


def _margin_out(m: MarginView) -> MarginOut:
    e = m.exposure
    ratio = e.margin_ratio
    return MarginOut(status=m.status, margin_ratio_pct=None if ratio is None else round(100 * ratio, 2),
                     leverage=None if m.leverage is None else round(m.leverage, 2),
                     gross_exposure=to_hoop(e.gross_cents), borrowed=to_hoop(max(-e.cash_cents, 0)),
                     buying_power=to_hoop(max(m.buying_power_cents, 0)),
                     buying_power_max=to_hoop(max(m.buying_power_max_cents, 0)), max_leverage=MAX_LEVERAGE,
                     warning_pct=100 * WARNING_RATIO, maintenance_pct=100 * MAINTENANCE_RATIO,
                     liquidation_pct=100 * LIQUIDATION_RATIO, margin_call_deadline_t=m.deadline_t)


class PortfolioOut(BaseModel):
    user_id: str
    cash: float = Field(description="Negative if you've borrowed for leveraged buys")
    reserved_cash: float = Field(description="Part of cash held back for open buy limits")
    short_collateral: float = Field(
        description="Part of cash held back for open shorts: 200% of their value at the last price")
    available_cash: float = Field(
        description="cash - reserved_cash - short_collateral (never below 0): what you can spend or short now")
    positions_value: float
    equity: float = Field(description="cash + positions_value")
    starting_cash: float
    total_pnl: float = Field(description="equity - starting_cash (= realised + unrealised - fees + payouts)")
    total_pnl_pct: float
    unrealised_pnl: float
    realised_pnl: float
    fees_paid: float
    payouts_received: float = Field(description="HOOP earned from player performances while holding their shares")
    positions: list[PositionOut] = Field(description="Largest holding first")
    margin: MarginOut


class EquityPointOut(BaseModel):
    t: float = Field(description="Market time, epoch seconds")
    equity: float = Field(description="cash + positions at the last price")
    cash: float
    positions_value: float
    total_pnl: float = Field(description="equity - the starting point profit/loss is measured from")


class EquityHistoryOut(BaseModel):
    """P2-16: equity once per market minute, plus the report card's headline numbers."""

    user_id: str
    interval_s: float = Field(description="Market seconds between recorded points")
    points: list[EquityPointOut] = Field(description="Oldest first")
    current_equity: float = Field(description="Equity right now (live, not a recorded point)")
    start_equity: float | None = Field(description="The first point in the window")
    return_pct: float | None = Field(description="current_equity vs start_equity, %")
    peak_equity: float | None = Field(description="Highest equity in the window, including now")
    max_drawdown: float = Field(description="Biggest fall from a peak to a later low, HOOP (0 = never fell)")
    max_drawdown_pct: float = Field(description="That fall as a % of the peak")
    max_drawdown_peak_t: float | None
    max_drawdown_trough_t: float | None


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
    quoted_price: float | None = Field(description="Best price when the order was placed")
    slippage: float | None = Field(description="Per share vs quoted_price, positive = worse")


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
    """Buy or sell at the market's best price, or short and cover.

    - `short` sells shares you don't own: the proceeds go into your cash and
      your position goes negative. While it's open, 200% of its value is held
      back from your cash as collateral. You profit if the price falls; if it
      rises, the loss keeps growing.
    - `cover` buys them back.
    - You can't short a player you hold (sell first) or buy one you're short (cover first).
    - `leverage` (buys and shorts, up to 3): exposure can reach that many times
      your equity. If your margin (equity / exposure) falls under 25% you get a
      margin call, and under 20% (or 15 s after the call) positions are sold for you.

    Errors: `400` not enough cash, shares or collateral, or the wrong side for
    your position; `404` unknown symbol; `409` the market makers couldn't fill
    any of it. A big order can come back
    `partially_filled` with a `reason`. The Solana receipt is written in the
    background: the order never waits for it.
    """
    # async on purpose: engine calls run on the same thread that ticks the market.
    try:
        outcome = place_market_order(db, get_market(), user.user_id, order.symbol, order.side, order.qty,
                                     leverage=order.leverage)
    except OrderError as error:
        raise HTTPException(error.status_code, error.message) from error
    if request.app.state.receipts:
        request.app.state.receipts.enqueue(outcome.order_id)
    _live(request).publish_user(user.user_id, fill_message(outcome))
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
        quoted_best_price=to_hoop(outcome.quoted_best_cents) if outcome.quoted_best_cents is not None else None,
        slippage=round(outcome.slippage_cents / 100, 4) if outcome.slippage_cents is not None else None,
        slippage_pct=(round(100 * outcome.slippage_cents / outcome.quoted_best_cents, 2)
                      if outcome.slippage_cents is not None and outcome.quoted_best_cents else None),
        leverage=outcome.leverage,
    )


@router.post("/orders/quote")
async def quote_order(order: OrderIn, user: User = Depends(current_user),
                      db: Database = Depends(get_db)) -> EstimateOut:
    """Before you confirm: spread, expected slippage for this size, the fee and the total. Trades nothing."""
    try:
        e = estimate_order(db, get_market(), user.user_id, order.symbol, order.side, order.qty, order.leverage)
    except OrderError as error:
        raise HTTPException(error.status_code, error.message) from error
    best = e.best_price_cents
    return EstimateOut(
        symbol=e.symbol, side=e.side, qty=e.qty, method=e.method,
        best_bid=to_hoop(e.best_bid_cents) if e.best_bid_cents is not None else None,
        best_ask=to_hoop(e.best_ask_cents) if e.best_ask_cents is not None else None,
        spread=to_hoop(e.spread_cents) if e.spread_cents is not None else None,
        spread_pct=round(100 * e.spread_cents / e.mid_cents, 2) if e.spread_cents is not None else None,
        best_price=to_hoop(best) if best is not None else None,
        estimated_fillable_qty=e.fillable_qty,
        estimated_avg_price=round(e.avg_price_cents / 100, 4) if e.avg_price_cents else None,
        estimated_slippage=round(e.slippage_cents / 100, 4),
        estimated_slippage_pct=round(100 * e.slippage_cents / best, 2) if best else 0.0,
        estimated_notional=to_hoop(e.notional_cents),
        estimated_fee=to_hoop(e.fee_cents),
        fee_rate_pct=float(FEE_RATE * 100),
        estimated_total=to_hoop(e.total_cents),
        available_cash=to_hoop(e.available_cash_cents),
        can_afford_qty=e.affordable_qty if e.side != "sell" else None,
        sellable_qty=e.sellable_qty if e.side == "sell" else None,
        position_qty=e.position_qty,
        leverage=e.leverage,
        ok=e.ok,
        warnings=e.warnings,
        makers=[MakerQuoteOut(maker_id=m.maker_id, bid=m.bid, ask=m.ask, shares=m.shares) for m in e.makers],
    )


@router.post("/orders/open", status_code=status.HTTP_201_CREATED)
async def place_open_order(order: OpenOrderIn, request: Request, user: User = Depends(current_user),
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
    _live(request).publish_user(user.user_id, open_order_message(created, "placed"))
    return _open_order_out(created)


@router.get("/orders/open")
def open_orders(user: User = Depends(current_user), db: Database = Depends(get_db),
                include_closed: bool = Query(False, description="Also show filled, cancelled and failed orders")
                ) -> list[OpenOrderOut]:
    """Your limit and stop-loss orders, newest first."""
    return [_open_order_out(o) for o in list_open_orders(db, user.user_id, include_closed)]


@router.delete("/orders/{order_id}")
def cancel_order(order_id: str, request: Request, user: User = Depends(current_user),
                 db: Database = Depends(get_db)) -> OpenOrderOut:
    """Cancel an open limit or stop-loss order and release what it held back. `409` if it already filled."""
    try:
        cancelled = cancel_open_order(db, user.user_id, order_id)
    except OrderError as error:
        raise HTTPException(error.status_code, error.message) from error
    _live(request).publish_user(user.user_id, open_order_message(cancelled, "cancelled"))
    return _open_order_out(cancelled)


def _live(request: Request):
    """The live-update hub (a do-nothing stand-in if the app didn't start one)."""
    return getattr(request.app.state, "live", None) or _NoHub()


class _NoHub:
    def publish_user(self, user_id, message):
        pass

    def publish_public(self, message):
        pass


@router.websocket("/ws")
async def live_updates(websocket: WebSocket, token: str | None = None) -> None:
    """Live updates. Connect to `/trading/ws?token=<session token>`.

    Browsers can't set headers on a WebSocket, so the token goes in the URL.
    Without a token you get the public feed only (bot bundles settling on
    Solana), which suits a projector screen. A bad token is refused with close
    code 4401. Send `ping` (or `{"type":"ping"}`) to get a `pong`.
    """
    hub = websocket.app.state.live
    user = user_for_token(websocket.app.state.trading_db, token) if token else None
    if token and user is None:
        await websocket.close(code=4401, reason="missing or invalid session token")
        return
    await websocket.accept()
    user_id = user.user_id if user else None
    queue = hub.subscribe(user_id)
    receiver = getter = None
    try:
        await websocket.send_json({"type": "hello", "user_id": user_id, "public_only": user is None,
                                   "market_time": get_market().market_time()})
        receiver = asyncio.create_task(websocket.receive_text())
        getter = asyncio.create_task(queue.get())
        while True:
            done, _ = await asyncio.wait({receiver, getter}, return_when=asyncio.FIRST_COMPLETED)
            if getter in done:
                await websocket.send_json(getter.result())
                getter = asyncio.create_task(queue.get())
            if receiver in done:
                text = receiver.result()  # raises WebSocketDisconnect when the client leaves
                if text.strip().lower() in ("ping", '{"type":"ping"}', '{"type": "ping"}'):
                    await websocket.send_json({"type": "pong"})
                receiver = asyncio.create_task(websocket.receive_text())
    except (WebSocketDisconnect, RuntimeError):  # RuntimeError: sending to a socket that just closed
        pass
    finally:
        hub.unsubscribe(user_id, queue)
        for task in (receiver, getter):
            if task is None:
                continue
            if not task.done():
                task.cancel()
            elif not task.cancelled():
                task.exception()  # collect "client left" so asyncio doesn't warn it was never retrieved


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
    market = get_market()
    view = build_portfolio(db, market, user.user_id)
    equity = view.equity_cents
    reserved = reserved_cash(db, user.user_id)
    collateral = short_collateral(db, market, user.user_id)
    return PortfolioOut(
        user_id=view.user_id,
        cash=to_hoop(view.cash_cents),
        reserved_cash=to_hoop(reserved),
        short_collateral=to_hoop(collateral),
        available_cash=to_hoop(max(view.cash_cents - reserved - collateral, 0)),
        positions_value=to_hoop(view.positions_value_cents),
        equity=to_hoop(equity),
        starting_cash=to_hoop(view.starting_cash_cents),
        total_pnl=to_hoop(view.total_pnl_cents),
        total_pnl_pct=_pct(view.total_pnl_cents, view.starting_cash_cents),
        unrealised_pnl=to_hoop(view.unrealised_cents),
        realised_pnl=to_hoop(view.realised_cents),
        fees_paid=to_hoop(view.fees_cents),
        payouts_received=to_hoop(view.payouts_cents),
        positions=[
            PositionOut(
                symbol=p.symbol, name=p.name, team=p.team, side="short" if p.is_short else "long", qty=p.qty,
                avg_cost=round(p.avg_cost_cents / 100, 4),
                last_price=to_hoop(p.last_price_cents),
                market_value=to_hoop(p.market_value_cents),
                unrealised_pnl=to_hoop(p.unrealised_cents),
                unrealised_pnl_pct=_pct(p.unrealised_cents, p.cost_basis_cents),
                weight_pct=_pct(p.market_value_cents, equity),
            )
            for p in view.positions
        ],
        margin=_margin_out(margin_view(db, market, user.user_id)),
    )


@router.get("/margin")
async def margin(user: User = Depends(current_user), db: Database = Depends(get_db)) -> MarginOut:
    """Just the margin bar: status, margin ratio, leverage, buying power and any margin-call deadline."""
    return _margin_out(margin_view(db, get_market(), user.user_id))


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
                 receipt_explorer_url=explorer_url("tx", r.receipt_signature) if r.receipt_signature else None,
                 quoted_price=to_hoop(r.quoted_price_cents) if r.quoted_price_cents is not None else None,
                 slippage=(to_hoop((r.price_cents - r.quoted_price_cents) * (1 if r.side in ("buy", "cover") else -1))
                           if r.quoted_price_cents is not None else None))
        for r in trades_for_user(db, user.user_id, since_t=since_t, symbol=symbol, limit=limit)
    ]


@router.get("/equity-history")
async def equity_history_route(
    user: User = Depends(current_user),
    db: Database = Depends(get_db),
    since_t: float | None = Query(None, description="Only points at or after this market time (e.g. a mission's start)"),
    limit: int = Query(2000, ge=1, le=20_000, description="Only the most recent N points (still oldest first)"),
) -> EquityHistoryOut:
    """Your equity once per market minute, with return and max drawdown worked out.
    Drawdown includes your equity right now, so a fall in progress counts."""
    view = build_portfolio(db, get_market(), user.user_id)
    points = equity_history(db, user.user_id, since_t=since_t, limit=limit)
    now = get_market().market_time()
    series = [(p.t, p.equity_cents) for p in points] + [(now, view.equity_cents)]
    dd = max_drawdown(series)
    start = points[0].equity_cents if points else None
    return EquityHistoryOut(
        user_id=user.user_id, interval_s=INTERVAL_S,
        points=[EquityPointOut(t=p.t, equity=to_hoop(p.equity_cents), cash=to_hoop(p.cash_cents),
                               positions_value=to_hoop(p.positions_value_cents),
                               total_pnl=to_hoop(p.total_pnl_cents)) for p in points],
        current_equity=to_hoop(view.equity_cents),
        start_equity=to_hoop(start) if start is not None else None,
        return_pct=_pct(view.equity_cents - start, start) if start and start > 0 else None,
        peak_equity=to_hoop(dd.peak_cents) if dd.peak_cents is not None else None,
        max_drawdown=to_hoop(dd.amount_cents), max_drawdown_pct=dd.pct,
        max_drawdown_peak_t=dd.peak_t, max_drawdown_trough_t=dd.trough_t,
    )


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


class PayoutOut(BaseModel):
    payout_id: str
    symbol: str
    qty_held: int = Field(description="Shares you held when it paid out (negative = short)")
    hoop_per_share: float
    amount: float = Field(description="HOOP added to your cash (negative if you were short)")
    game_score: float | None
    reason: str
    t: float = Field(description="Market time, epoch seconds")


@router.get("/payouts")
def payouts(user: User = Depends(current_user), db: Database = Depends(get_db),
            symbol: str | None = Query(None), limit: int = Query(100, ge=1, le=1000)) -> list[PayoutOut]:
    """Your performance payouts, newest first: why your cash went up while you held."""
    sql, params = "SELECT * FROM payouts WHERE user_id = ?", [user.user_id]
    if symbol:
        sql += " AND symbol = ?"
        params.append(symbol)
    with db.lock:
        rows = db.conn.execute(sql + " ORDER BY rowid DESC LIMIT ?", (*params, limit)).fetchall()
    return [PayoutOut(payout_id=r["payout_id"], symbol=r["symbol"], qty_held=r["qty_held"],
                      hoop_per_share=r["hoop_per_share"], amount=to_hoop(r["amount_cents"]),
                      game_score=r["game_score"], reason=r["reason"], t=r["t"]) for r in rows]


@router.post("/account/restore")
async def restore_after_mission(user: User = Depends(current_user), db: Database = Depends(get_db)) -> dict:
    """Put back your real account (cash, positions, profit) as it was before a mission reset it.
    `404` if there's nothing to restore."""
    if not restore_account(db, user.user_id, get_market()):
        raise HTTPException(404, "nothing to restore: no mission has reset this account")
    return {"restored": True}


@router.get("/debug/quote/{symbol}")
def debug_quote(symbol: str) -> dict:
    """Current quote straight from the market engine (fake for now). For checking the wiring."""
    market = get_market()
    if symbol not in {p.symbol for p in market.players()}:
        raise HTTPException(404, f"unknown symbol {symbol!r}")
    return asdict(market.quote(symbol))
