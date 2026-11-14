"""Local demo clock controls. Rewind starts a new in-memory market/account session."""
import asyncio
import math
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from trading.market_provider import get_market

router = APIRouter(prefix='/market', tags=['demo timeline'])


class TimelineControl(BaseModel):
    paused: bool | None = None
    rate: float | None = Field(None, ge=0.25, le=500)
    target_t: float | None = None


def snapshot(request):
    m = get_market()
    return {'t': m.market_time(), 'start_t': m.start_t, 'end_t': m.end.timestamp(),
            'paused': m.paused, 'rate': m.playback_rate,
            'busy': request.app.state.timeline_busy, 'error': request.app.state.timeline_error,
            'session_id': m.session_id}


@router.get('/timeline')
async def timeline(request: Request):
    return snapshot(request)


async def seek(request, target):
    app = request.app
    try:
        while app.state.active_account_requests:
            await asyncio.sleep(0.01)
        m = get_market()
        rate = m.playback_rate
        if target < m.market_time():
            await app.state.restart_market()
            m = get_market()
            m.paused = True
            m.playback_rate = rate
        while m.market_time() < target:
            m.step(target_t=target)
            # Let order watchers, equity recorders and bundle consumers process
            # each tick before advancing again. Existing orders still execute.
            await asyncio.sleep(0)
            await asyncio.sleep(0)
        m.check_ledger()
    except Exception as exc:
        app.state.timeline_error = f'Timeline stopped: {type(exc).__name__}: {exc}'
    finally:
        get_market().paused = True
        app.state.timeline_busy = False


@router.post('/timeline')
async def control(body: TimelineControl, request: Request):
    # Reset controls belong to the local demonstration, not a deployed market.
    if not request.client or request.client.host not in ('127.0.0.1', '::1', 'testclient'):
        raise HTTPException(403, 'Timeline controls are local-only')
    m = get_market()
    if not hasattr(m, 'start_t'):
        raise HTTPException(409, 'Historical market required')
    if request.app.state.timeline_busy:
        raise HTTPException(409, 'Timeline is already moving')
    target = body.target_t
    if target is not None and (not math.isfinite(target) or not m.start_t <= target <= m.end.timestamp()):
        raise HTTPException(422, 'Choose a time inside the replay season')
    if target is not None and (getattr(request.app.state, 'receipts', None) or getattr(request.app.state, 'portfolios', None)):
        raise HTTPException(409, 'Disable Solana writes before moving the demo timeline')
    if body.rate is not None:
        m.playback_rate = body.rate
    if body.paused is not None:
        m.paused = body.paused
    if target is not None:
        m.paused = True
        request.app.state.timeline_error = None
        request.app.state.timeline_busy = True
        request.app.state.timeline_task = asyncio.create_task(seek(request, target))
    return snapshot(request)


@router.get('/history')
async def history(symbols: str):
    m = get_market()
    selected = symbols.split(',')
    if len(selected) > 4 or any(s not in m.ids for s in selected):
        raise HTTPException(422, 'Choose up to four known players')
    return {'session_id': m.session_id, 'history': {s: m.timeline_history[s] for s in selected}}
