"""Read-only endpoints for the shared live market."""
import time
import asyncio
import contextlib
from dataclasses import asdict
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from trading.market_contract import MarketTick
from market.valuation import model_parameters, projected_score, annual_exit, OPENING_T, YEAR_SECONDS
from trading.market_provider import get_market

router = APIRouter(prefix='/market', tags=['market'])


@router.get('/players')
async def players():
    return [asdict(p) for p in get_market().players()]


@router.get('/quotes')
async def quotes():
    m = get_market()
    return {'t': m.market_time(), 'quotes': {p.symbol: asdict(m.quote(p.symbol)) for p in m.players()}}


@router.get('/quote/{symbol}')
async def quote(symbol: str):
    try:
        return asdict(get_market().quote(symbol))
    except KeyError:
        raise HTTPException(404, 'Unknown player symbol')


@router.get('/status')
async def status(request: Request):
    m = get_market()
    return {'engine': type(m).__name__, 't': m.market_time(), 'players': len(m.players()),
            'currency': 'virtual USD',
            'receipts_enabled': getattr(request.app.state, 'receipts', None) is not None,
            'chain_portfolios_enabled': getattr(request.app.state, 'portfolios', None) is not None, 'real_seconds_per_historical_day': getattr(m, 'day_seconds', None),
            'finished': getattr(m, 'finished', False),
            'payouts_enabled': getattr(m, 'supports_payouts', True),
            'advanced_trading_enabled': getattr(m, 'supports_advanced_trading', True),
            'fresh_session_on_restart': getattr(m, 'requires_fresh_session', False),
            'valuation_model': 'discounted future dividends; slow ability and fading form',
            'payout_cutoff': 'synthetic 12:00 UTC; settlement at day close',
            'session_id': getattr(m, 'session_id', None),
            'last_error': getattr(m, 'last_error', None),
            'institutional_payouts': getattr(m, 'institutional_dividends',0)/100,
            'human_payouts': sum(getattr(m, 'human_dividends',{}).values())/100,
            'data_timing': 'daily results and final daily injury reports revealed at synthetic UTC day close'}


@router.websocket('/ws')
async def live_quotes(websocket: WebSocket):
    m = get_market()
    requested = websocket.query_params.get('symbols')
    symbols = requested.split(',') if requested else [p.symbol for p in m.players()]
    if any(s not in {p.symbol for p in m.players()} for s in symbols):
        await websocket.close(code=4404, reason='Unknown player symbol')
        return
    await websocket.accept()
    queue = m.subscribe()
    receiver = asyncio.create_task(websocket.receive_text())
    getter = None
    last_sent = 0.0
    try:
        await websocket.send_json({'type': 'market_tick', 't': m.market_time(),
                                   'quotes': {s: asdict(m.quote(s)) for s in symbols}})
        while True:
            getter = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait({receiver, getter}, timeout=1, return_when=asyncio.FIRST_COMPLETED)
            if get_market() is not m:
                await websocket.close(code=1001, reason="Replay restarted")
                return
            if receiver in done:
                receiver.result()
                receiver = asyncio.create_task(websocket.receive_text())
            if getter not in done:
                getter.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await getter
                continue
            event = getter.result()
            if isinstance(event, MarketTick):
                # Browser updates are display-only. Internal order consumers still
                # receive every tick; avoid serializing 580 quotes hundreds of times/s.
                if not m.finished and time.monotonic() - last_sent < 0.2:
                    continue
                last_sent = time.monotonic()
                await websocket.send_json({'type': 'market_tick', 't': event.t,
                                           'quotes': {s: asdict(event.quotes[s]) for s in symbols}})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        m.unsubscribe(queue)
        for task in (receiver, getter):
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, WebSocketDisconnect):
                    await task


@router.get('/model')
async def model():
    return model_parameters()


@router.get('/valuation/{symbol}')
async def valuation(symbol: str):
    engine = get_market()
    if symbol not in getattr(engine, 'ids', {}):
        raise HTTPException(404, 'Unknown live-market player')
    m = engine.markets[engine.ids[symbol]]
    return {'symbol':symbol, 'underlying_ability':m.ability_score, 'recent_form':m.form_score,
            'next_game_expected_score':projected_score(m.ability_score,m.form_score),
            'next_game_expected_payout':m.expected_payout(), 'fair_value':m.fair_cents/100,
            'last_trade':m.last_cents/100, 'portfolio_mark':engine.mark_price(symbol),
            'cumulative_actual_payout_per_share':m.cumulative_payout,
            'injury_status':m.injury_status, 'injury_level':m.injury_level,
            'annual_exit_probability':annual_exit(m.age+max(0,m.valuation_time-OPENING_T)/YEAR_SECONDS),
            'future_payouts': [{'opportunity':k+1,'conditional_score':projected_score(m.ability_score,m.form_score,k)} for k in (0,4,9,19)]}
