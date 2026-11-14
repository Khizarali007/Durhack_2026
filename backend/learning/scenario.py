"""Scenario file format (see scenarios/SCHEMA.md) and content-rule checks."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from .adapters.models import EVENT_KINDS, MARKET_SECONDS_PER_REAL_SECOND, MarketEvent

REPO_ROOT = Path(__file__).resolve().parents[2]
SCENARIOS_DIR = REPO_ROOT / "scenarios"

StepKind = Literal[
    "hint", "early_warning", "injury", "hot_streak", "rest_day", "trade_rumour", "message"
]
MARKET_KINDS = frozenset(EVENT_KINDS)
TEXT_KINDS = frozenset({"hint", "message"})

MISSION_MIN_S = 30.0
MISSION_MAX_S = 60.0
WARNING_MIN_LEAD_S = 20.0
WARNING_MAX_LEAD_S = 40.0

# Headlines must stay mild and on-court. Whole-word, case-insensitive matches.
BLOCKED_WORDS: tuple[str, ...] = (
    "arrest", "arrested", "arrests", "police", "cops", "legal", "lawsuit", "lawsuits",
    "lawyer", "lawyers", "sued", "court case", "jail", "prison", "crime", "criminal",
    "investigation", "investigated", "scandal", "scandals", "surgery",
    "surgical", "torn", "fracture", "fractured", "broken", "rupture", "ruptured",
    "ligament", "acl", "concussion", "hospital", "hospitalised", "hospitalized", "stretcher",
    "season-ending", "career-ending", "death", "dead", "died", "dies", "divorce",
    "girlfriend", "boyfriend", "wife", "husband", "drunk", "dui", "drug", "drugs",
    "gambling", "betting", "suspended", "suspension", "brawl", "off-court", "off court",
)
_BLOCK_RE = re.compile(
    r"(?<![\w-])(" + "|".join(re.escape(w) for w in BLOCKED_WORDS) + r")(?![\w-])",
    re.IGNORECASE,
)


class ScenarioPosition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symbol: str
    qty: float
    avg_cost: float = Field(ge=0)


class StartState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cash: float = Field(default=100_000.0, ge=0)
    positions: list[ScenarioPosition] = Field(default_factory=list)


class Step(BaseModel):
    model_config = ConfigDict(extra="forbid")

    t: float = Field(ge=0, description="Real seconds from mission start")
    kind: StepKind
    symbol: str | None = None
    impact: float | None = None
    storm: float | None = Field(default=None, gt=0)
    headline: str | None = None
    text: str | None = None

    @model_validator(mode="after")
    def _fields_for_kind(self) -> "Step":
        if self.kind in MARKET_KINDS:
            missing = [f for f in ("symbol", "impact", "headline") if getattr(self, f) is None]
            if missing:
                raise ValueError(f"{self.kind} step needs {', '.join(missing)}")
            if self.text is not None:
                raise ValueError(f"{self.kind} step uses headline, not text")
        else:
            if not self.text:
                raise ValueError(f"{self.kind} step needs text")
            extra = [f for f in ("impact", "storm", "headline") if getattr(self, f) is not None]
            if extra:
                raise ValueError(f"{self.kind} step must not set {', '.join(extra)}")
        return self

    def to_market_event(self, mission_start_market_t: float) -> MarketEvent:
        """Convert a market step to a MarketEvent, given the market time at mission start."""
        if self.kind not in MARKET_KINDS:
            raise ValueError(f"{self.kind} is not a market event")
        return MarketEvent(
            t=mission_start_market_t + self.t * MARKET_SECONDS_PER_REAL_SECOND,
            symbol=self.symbol,  # type: ignore[arg-type]
            kind=self.kind,  # type: ignore[arg-type]
            headline=self.headline,  # type: ignore[arg-type]
            impact=self.impact,  # type: ignore[arg-type]
            storm=self.storm if self.storm is not None else 1.0,
        )


class Goal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str = Field(description="Machine-readable goal id, e.g. round_trip_profit")
    symbol: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    text: str


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9_]+$")
    title: str
    mission_number: int | None = Field(default=None, ge=1, le=6)
    duration_s: float = Field(gt=0)
    symbols: list[str] = Field(min_length=1)
    start_state: StartState = Field(default_factory=StartState)
    timeline: list[Step]
    goal: Goal
    lesson: str

    @model_validator(mode="after")
    def _consistency(self) -> "Scenario":
        times = [s.t for s in self.timeline]
        if times != sorted(times):
            raise ValueError("timeline must be sorted by t")
        for s in self.timeline:
            if s.t > self.duration_s:
                raise ValueError(f"step at t={s.t} is after duration_s={self.duration_s}")
            if s.symbol is not None and s.symbol not in self.symbols:
                raise ValueError(f"step symbol {s.symbol!r} not in symbols")
        if self.goal.symbol is not None and self.goal.symbol not in self.symbols:
            raise ValueError(f"goal symbol {self.goal.symbol!r} not in symbols")
        for p in self.start_state.positions:
            if p.symbol not in self.symbols:
                raise ValueError(f"start position {p.symbol!r} not in symbols")
        return self

    def market_steps(self) -> list[Step]:
        return [s for s in self.timeline if s.kind in MARKET_KINDS]


def blocked_words(text: str) -> list[str]:
    return sorted({m.group(1).lower() for m in _BLOCK_RE.finditer(text)})


def content_problems(sc: Scenario) -> list[str]:
    """Our content rules, beyond the schema. Empty list means OK."""
    problems: list[str] = []

    if sc.mission_number is not None and not (MISSION_MIN_S <= sc.duration_s <= MISSION_MAX_S):
        problems.append(
            f"mission duration_s={sc.duration_s} must be {MISSION_MIN_S:g}-{MISSION_MAX_S:g} s"
        )

    for inj in (s for s in sc.timeline if s.kind == "injury"):
        ok = any(
            w.kind == "early_warning"
            and w.symbol == inj.symbol
            and WARNING_MIN_LEAD_S <= inj.t - w.t <= WARNING_MAX_LEAD_S
            for w in sc.timeline
        )
        if not ok:
            problems.append(
                f"injury for {inj.symbol} at t={inj.t:g} needs an early_warning for the same "
                f"symbol {WARNING_MIN_LEAD_S:g}-{WARNING_MAX_LEAD_S:g} s earlier"
            )

    copy = [("title", sc.title), ("lesson", sc.lesson), ("goal.text", sc.goal.text)]
    for i, s in enumerate(sc.timeline):
        for field_name in ("headline", "text"):
            value = getattr(s, field_name)
            if value:
                copy.append((f"timeline[{i}].{field_name}", value))
    for where, text in copy:
        bad = blocked_words(text)
        if bad:
            problems.append(f"{where}: blocked word(s) {', '.join(bad)} in {text!r}")

    return problems


def check_data(data: Any, expected_id: str | None = None) -> list[str]:
    """Validate raw scenario JSON data. Returns a list of problems."""
    try:
        sc = Scenario.model_validate(data)
    except ValidationError as exc:
        return [
            f"{'.'.join(str(p) for p in err['loc']) or '<root>'}: {err['msg']}"
            for err in exc.errors()
        ]
    problems = content_problems(sc)
    if expected_id is not None and sc.id != expected_id:
        problems.append(f"id {sc.id!r} must match file name {expected_id!r}")
    return problems


def check_file(path: Path) -> list[str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"cannot read JSON: {exc}"]
    return check_data(data, expected_id=path.stem)


def scenario_files(directory: Path = SCENARIOS_DIR) -> list[Path]:
    return sorted(directory.glob("*.json"))


def load_scenario(scenario_id: str, directory: Path = SCENARIOS_DIR) -> Scenario:
    path = directory / f"{scenario_id}.json"
    return Scenario.model_validate_json(path.read_text(encoding="utf-8"))
