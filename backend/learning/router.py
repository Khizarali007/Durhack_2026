"""Learning-layer HTTP + WebSocket API, mounted under /learning.

At merge, backend/main.py does:
    from learning import router as learning_router, configure, shutdown
    configure(real_market_adapter, real_trades_adapter)   # at startup
    app.include_router(learning_router)
    await shutdown()                                       # at shutdown
"""

from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from . import content, deps
from .evaluators import MissionResult
from .missions import MissionError
from .scenario import SCENARIOS_DIR, Scenario, load_scenario

TICK_PUSH_INTERVAL_S = 0.5  # 2 Hz

router = APIRouter(prefix="/learning", tags=["learning"])


def _http(exc: MissionError) -> HTTPException:
    return HTTPException(exc.status_code, str(exc))


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "component": "learning", "adapters": deps.adapters_configured()}


# ---- content -----------------------------------------------------------------
@router.get("/missions")
async def missions() -> list[dict]:
    return deps.get_missions().catalogue()


@router.get("/glossary")
async def glossary() -> list[dict]:
    return content.glossary()


@router.get("/scenarios/{scenario_id}", response_model=Scenario)
async def scenario(scenario_id: str) -> Scenario:
    if not scenario_id.replace("_", "").isalnum() or not (SCENARIOS_DIR / f"{scenario_id}.json").is_file():
        raise HTTPException(404, f"no scenario {scenario_id!r}")
    return load_scenario(scenario_id)


# ---- missions ----------------------------------------------------------------
class StartIn(BaseModel):
    user_id: str
    mission_id: str


class StopIn(BaseModel):
    user_id: str


@router.post("/missions/start")
async def start_mission(body: StartIn) -> dict:
    mgr = deps.get_missions()
    try:
        mgr.start(body.user_id, body.mission_id)
    except MissionError as exc:
        raise _http(exc) from exc
    return mgr.status(body.user_id)


@router.post("/missions/stop")
async def stop_mission(body: StopIn) -> dict:
    mgr = deps.get_missions()
    try:
        mgr.stop(body.user_id)
    except MissionError as exc:
        raise _http(exc) from exc
    return mgr.status(body.user_id)


@router.get("/missions/status")
async def mission_status(user_id: str = Query(...)) -> dict:
    return deps.get_missions().status(user_id)


@router.get("/missions/result", response_model=MissionResult)
async def mission_result(user_id: str = Query(...)) -> MissionResult:
    try:
        return deps.get_missions().result(user_id)
    except MissionError as exc:
        raise _http(exc) from exc


# ---- websocket ---------------------------------------------------------------
@router.websocket("/ws")
async def ws(websocket: WebSocket, user_id: str, symbols: str | None = None) -> None:
    """Pushes mission messages for user_id, plus 2 Hz ticks for the mission's
    symbols (or for ?symbols=A,B when no mission is loaded)."""
    await websocket.accept()
    try:
        mgr = deps.get_missions()
        market = deps.get_market()
    except HTTPException:
        await websocket.close(code=1011)
        return
    extra = [s for s in (symbols or "").split(",") if s]
    queue = mgr.subscribe(user_id)

    async def push_messages() -> None:
        while True:
            await websocket.send_json(await queue.get())

    async def push_ticks() -> None:
        while True:
            for sym in mgr.watched_symbols(user_id) or extra:
                tk = market.get_tick(sym)
                if tk is not None:
                    await websocket.send_json({"type": "tick", **tk.model_dump()})
            await asyncio.sleep(TICK_PUSH_INTERVAL_S)

    async def drain_client() -> None:
        while True:
            await websocket.receive_text()

    tasks: list[asyncio.Task] = []
    try:
        await websocket.send_json(mgr.snapshot(user_id))
        tasks = [asyncio.create_task(c()) for c in (push_messages, push_ticks, drain_client)]
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except WebSocketDisconnect:
        pass
    finally:
        for t in tasks:
            t.cancel()
        for t in tasks:
            with contextlib.suppress(asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
                await t
        mgr.unsubscribe(user_id, queue)
