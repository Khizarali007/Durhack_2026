"""Mission runner: plays a scenario timeline for one user in real time.

Talks only to MarketAdapter and TradesAdapter, so it works unchanged when the
real engine / trading code replaces the mocks.

Time handling: the runner is tick-driven. tick() looks at clock.now(), fires
every timeline step that is due, records prices and ends the mission at
duration_s. In the app a background task calls tick() every 0.1 s; tests use
a ManualClock and call tick() themselves.
"""

from __future__ import annotations

import asyncio
import contextlib
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from . import content
from .adapters.base import MarketAdapter, TradesAdapter
from .adapters.models import Position, Tick
from .clock import Clock, RealClock
from .evaluators import EvalInput, FiredEvent, MissionResult, evaluate, has_evaluator
from .scenario import MARKET_KINDS, SCENARIOS_DIR, Scenario, Step, load_scenario

LOOP_INTERVAL_S = 0.1
LATEST_MESSAGES = 10


class MissionState(str, Enum):
    idle = "idle"
    running = "running"
    completed = "completed"  # ended naturally, goal met
    failed = "failed"  # ended naturally, goal not met
    stopped = "stopped"  # user stopped it early


MessageKind = Literal["hint", "message", "event", "state", "result"]


class MissionMessage(BaseModel):
    seq: int
    t: float  # real seconds since mission start
    kind: MessageKind
    text: str
    symbol: str | None = None
    event_kind: str | None = None


class MissionError(Exception):
    status_code = 400


class MissionNotFound(MissionError):
    status_code = 404


class MissionConflict(MissionError):
    status_code = 409


@dataclass
class MissionRun:
    user_id: str
    mission_id: str
    scenario: Scenario
    entry: dict
    started_at: float  # clock time
    start_market_t: float
    state: MissionState = MissionState.running
    next_step: int = 0
    messages: list[MissionMessage] = field(default_factory=list)
    fired: list[FiredEvent] = field(default_factory=list)
    path: dict[str, dict[float, Tick]] = field(default_factory=dict)
    ended_at: float | None = None
    end_market_t: float | None = None
    result: MissionResult | None = None

    def elapsed(self, now: float) -> float:
        end = self.ended_at if self.ended_at is not None else now
        return max(0.0, end - self.started_at)

    def seconds_left(self, now: float) -> float:
        return max(0.0, self.scenario.duration_s - self.elapsed(now))

    def price_path(self) -> dict[str, list[Tick]]:
        return {s: [ticks[t] for t in sorted(ticks)] for s, ticks in self.path.items()}


class MissionManager:
    def __init__(
        self,
        market: MarketAdapter,
        trades: TradesAdapter,
        clock: Clock | None = None,
        scenarios_dir: Path = SCENARIOS_DIR,
        autorun: bool = True,
    ) -> None:
        self.market = market
        self.trades = trades
        self.clock = clock or RealClock()
        self.scenarios_dir = scenarios_dir
        self.autorun = autorun
        self._runs: dict[str, MissionRun] = {}
        self._subs: dict[str, set[asyncio.Queue]] = {}
        self._task: asyncio.Task | None = None
        self._seq = 0

    # ---- catalogue ------------------------------------------------------
    def is_available(self, entry: dict) -> bool:
        sid = entry.get("scenario_id")
        return bool(
            entry.get("status") == "ready"
            and sid
            and (self.scenarios_dir / f"{sid}.json").is_file()
            and has_evaluator(entry.get("number"))
        )

    def catalogue(self) -> list[dict]:
        return [{**m, "available": self.is_available(m)} for m in content.missions()]

    # ---- lifecycle --------------------------------------------------------
    def get(self, user_id: str) -> MissionRun | None:
        return self._runs.get(user_id)

    def start(self, user_id: str, mission_id: str) -> MissionRun:
        current = self._runs.get(user_id)
        if current and current.state == MissionState.running:
            raise MissionConflict(f"{user_id} already has {current.mission_id} running")
        entry = content.mission_entry(mission_id)
        if entry is None:
            raise MissionNotFound(f"no mission {mission_id!r}")
        if not self.is_available(entry):
            raise MissionNotFound(f"mission {mission_id!r} is not available yet")
        sc = load_scenario(entry["scenario_id"], self.scenarios_dir)

        self.trades.apply_start_state(
            user_id,
            sc.start_state.cash,
            [Position(symbol=p.symbol, qty=p.qty, avg_cost=p.avg_cost) for p in sc.start_state.positions],
        )
        run = MissionRun(
            user_id=user_id,
            mission_id=mission_id,
            scenario=sc,
            entry=entry,
            started_at=self.clock.now(),
            start_market_t=self.market.market_time(),
            path={s: {} for s in sc.symbols},
        )
        self._runs[user_id] = run
        self._emit(run, "state", f"Mission {sc.mission_number}: {sc.title}. Goal: {sc.goal.text}")
        self._advance(run)
        self._ensure_loop()
        return run

    def stop(self, user_id: str) -> MissionRun:
        run = self._runs.get(user_id)
        if run is None or run.state != MissionState.running:
            raise MissionConflict(f"{user_id} has no running mission")
        self._finish(run, stopped=True)
        return run

    def tick(self) -> None:
        for run in list(self._runs.values()):
            if run.state == MissionState.running:
                self._advance(run)

    # ---- status -----------------------------------------------------------
    def status(self, user_id: str) -> dict:
        run = self._runs.get(user_id)
        if run is None:
            return {
                "user_id": user_id, "state": MissionState.idle.value, "mission_id": None,
                "title": None, "goal": None, "symbols": [], "duration_s": None,
                "elapsed": 0.0, "seconds_left": None, "hints": [], "messages": [],
                "result_ready": False,
            }
        now = self.clock.now()
        return {
            "user_id": user_id,
            "state": run.state.value,
            "mission_id": run.mission_id,
            "title": run.scenario.title,
            "goal": run.scenario.goal.text,
            "symbols": run.scenario.symbols,
            "duration_s": run.scenario.duration_s,
            "elapsed": round(run.elapsed(now), 2),
            "seconds_left": round(run.seconds_left(now), 2),
            "hints": [m.text for m in run.messages if m.kind == "hint"],
            "messages": [m.model_dump() for m in run.messages[-LATEST_MESSAGES:]],
            "result_ready": run.result is not None,
        }

    def result(self, user_id: str) -> MissionResult:
        run = self._runs.get(user_id)
        if run is None:
            raise MissionNotFound(f"{user_id} has not played a mission")
        if run.result is None:
            raise MissionConflict("mission still running")
        return run.result

    # ---- internals --------------------------------------------------------
    def _advance(self, run: MissionRun) -> None:
        el = self.clock.now() - run.started_at
        self._record(run)
        steps = run.scenario.timeline
        while run.next_step < len(steps) and steps[run.next_step].t <= el:
            self._fire(run, steps[run.next_step])
            run.next_step += 1
        if el >= run.scenario.duration_s:
            self._finish(run, stopped=False)

    def _fire(self, run: MissionRun, step: Step) -> None:
        if step.kind in MARKET_KINDS:
            now_t = self.market.market_time()
            ev = step.to_market_event(run.start_market_t).model_copy(update={"t": now_t})
            self.market.inject_event(ev)
            run.fired.append(FiredEvent(step.kind, step.symbol, step.t, now_t))
            self._emit(run, "event", step.headline or "", symbol=step.symbol, event_kind=step.kind)
        else:
            self._emit(run, step.kind, step.text or "")  # type: ignore[arg-type]

    def _record(self, run: MissionRun) -> None:
        # Re-reading the recent window (keyed by t) survives loop jitter and
        # engines that tick at a different rate than the runner.
        for sym, ticks in run.path.items():
            for tk in self.market.recent_ticks(sym, 240):
                if tk.t >= run.start_market_t:
                    ticks[tk.t] = tk
            if not ticks:  # nothing since start yet: anchor on the latest tick
                tk = self.market.get_tick(sym)
                if tk is not None:
                    ticks[tk.t] = tk

    def _finish(self, run: MissionRun, stopped: bool) -> None:
        self._record(run)
        run.ended_at = min(self.clock.now(), run.started_at + run.scenario.duration_s)
        run.end_market_t = self.market.market_time()
        trades = [
            tr for tr in self.trades.trades_for_user(run.user_id, since_t=run.start_market_t)
            if tr.t <= run.end_market_t
        ]
        result = evaluate(
            EvalInput(
                scenario=run.scenario,
                mission=run.entry,
                trades=trades,
                portfolio=self.trades.portfolio(run.user_id),
                price_path=run.price_path(),
                start_t=run.start_market_t,
                end_t=run.end_market_t,
                fired=list(run.fired),
            )
        )
        if stopped:
            run.state = MissionState.stopped
        else:
            run.state = MissionState.completed if result.passed else MissionState.failed
        run.result = result.model_copy(update={"user_id": run.user_id, "state": run.state.value})
        label = {
            MissionState.stopped: "Mission stopped.",
            MissionState.completed: "Closing bell! Mission complete.",
            MissionState.failed: "Closing bell! Mission not passed this time.",
        }[run.state]
        self._emit(run, "state", label)
        self._emit(run, "result", run.result.debrief)

    def _emit(self, run: MissionRun, kind: MessageKind, text: str, **extra) -> None:
        self._seq += 1
        msg = MissionMessage(
            seq=self._seq, t=round(run.elapsed(self.clock.now()), 2), kind=kind, text=text, **extra
        )
        run.messages.append(msg)
        payload = {"type": "mission", "state": run.state.value, "mission_id": run.mission_id, **msg.model_dump()}
        for q in self._subs.get(run.user_id, ()):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(payload)

    # ---- websocket fan-out ---------------------------------------------------
    def subscribe(self, user_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._subs.setdefault(user_id, set()).add(q)
        return q

    def unsubscribe(self, user_id: str, q: asyncio.Queue) -> None:
        self._subs.get(user_id, set()).discard(q)

    def snapshot(self, user_id: str) -> dict:
        st = self.status(user_id)
        return {"type": "mission", "kind": "snapshot", "state": st["state"], "text": st["goal"], "status": st}

    def watched_symbols(self, user_id: str) -> list[str]:
        run = self._runs.get(user_id)
        return list(run.scenario.symbols) if run else []

    # ---- background loop -----------------------------------------------------
    def _ensure_loop(self) -> None:
        if not self.autorun or (self._task and not self._task.done()):
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._task = loop.create_task(self._loop())

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(LOOP_INTERVAL_S)
            self.tick()

    async def shutdown(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
