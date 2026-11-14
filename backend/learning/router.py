"""Learning-layer HTTP API, mounted under /learning.

At merge, backend/main.py does:
    from learning import router as learning_router, configure
    configure(real_market_adapter, real_trades_adapter)
    app.include_router(learning_router)
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException

from . import deps
from .scenario import REPO_ROOT, SCENARIOS_DIR, Scenario, load_scenario

CONTENT_DIR = REPO_ROOT / "content"

router = APIRouter(prefix="/learning", tags=["learning"])


@lru_cache(maxsize=None)
def _content(name: str) -> dict:
    return json.loads((CONTENT_DIR / name).read_text(encoding="utf-8"))


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "component": "learning", "adapters": deps.adapters_configured()}


@router.get("/missions")
async def missions() -> list[dict]:
    return _content("missions.json")["missions"]


@router.get("/glossary")
async def glossary() -> list[dict]:
    return _content("glossary.json")["terms"]


@router.get("/scenarios/{scenario_id}", response_model=Scenario)
async def scenario(scenario_id: str) -> Scenario:
    path: Path = SCENARIOS_DIR / f"{scenario_id}.json"
    if not scenario_id.replace("_", "").isalnum() or not path.is_file():
        raise HTTPException(404, f"no scenario {scenario_id!r}")
    return load_scenario(scenario_id)
