"""Loads player-facing copy from content/*.json."""

from __future__ import annotations

import json
from functools import lru_cache

from .scenario import REPO_ROOT

CONTENT_DIR = REPO_ROOT / "content"


@lru_cache(maxsize=None)
def _load(name: str) -> dict:
    return json.loads((CONTENT_DIR / name).read_text(encoding="utf-8"))


def missions() -> list[dict]:
    return _load("graded-missions.json")["missions"]


def mission_entry(mission_id: str) -> dict | None:
    return next((m for m in missions() if m["id"] == mission_id), None)


def glossary() -> list[dict]:
    return _load("glossary.json")["terms"]
