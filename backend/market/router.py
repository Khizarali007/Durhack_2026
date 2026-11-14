"""Read-only endpoints for the shared live market."""
import asyncio
import contextlib
from dataclasses import asdict
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from trading.market_contract import MarketTick
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
async def status():
    m = get_market()
    return {'engine': type(m).__name__, 't': m.market_time(), 'players': len(m.players()),
            'currency': 'virtual USD', 'real_seconds_per_historical_day': getattr(m, 'day_seconds', None),
            'finished': getattr(m, 'finished', False),
            'payouts_enabled': getattr(m, 'supports_payouts', True),
            'advanced_trading_enabled': getattr(m, 'supports_advanced_trading', True),
            'fresh_session_on_restart': getattr(m, 'requires_fresh_session', False),
            'valuation_model': 'existing prior/form model; dividend valuation not yet implemented',
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
    try:
        await websocket.send_json({'type': 'market_tick', 't': m.market_time(),
                                   'quotes': {s: asdict(m.quote(s)) for s in symbols}})
        while True:
            getter = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait({receiver, getter}, return_when=asyncio.FIRST_COMPLETED)
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
