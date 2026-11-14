# What the learning layer needs from you

From: Person 4 (missions, report card, glossary, Coach Hoops).
To: Person 1 (market engine) and Person 2 (accounts and trading).

I'm building against mocks of your code. This page lists the shapes and
methods I assume you will provide. **You don't have to use my classes.** If
your objects have the same fields, I write a thin adapter at merge. If
something here doesn't fit your design, tell me early and I'll change my
side.

Code: `backend/learning/adapters/models.py` (shapes) and
`backend/learning/adapters/base.py` (methods). Mocks live in
`backend/learning/adapters/mock_*.py`.

## Shared conventions

- **Time.** Every `t` is **market time in epoch seconds** (float). The clock
  runs 12x real time (1 market minute = 5 real seconds).
- **Money.** Prices and cash are floats in HOOP. Users start with 100,000.
- **Fractions.** `impact` is a fraction: `+0.18` means fair value +18%.

## Data shapes

### Tick (from Person 1)

| field | type | meaning |
|---|---|---|
| `t` | float | market time, epoch seconds |
| `symbol` | str | e.g. `"SGA"` |
| `price` | float | last traded price |
| `fair_value` | float | engine's fair value |
| `best_bid` | float | top of book, bid |
| `best_ask` | float | top of book, ask |

### MarketEvent (from Person 1; scenarios also create them)

| field | type | meaning |
|---|---|---|
| `t` | float | market time the event fires |
| `symbol` | str | |
| `kind` | `early_warning` \| `injury` \| `hot_streak` \| `rest_day` \| `trade_rumour` | |
| `headline` | str | shown in the news feed |
| `impact` | float | fractional fair-value shift at full effect |
| `storm` | float | volatility multiplier at the moment of the event (1.0 = normal) |

### Trade (from Person 2)

| field | type | meaning |
|---|---|---|
| `trade_id` | str | unique |
| `user_id` | str | |
| `symbol` | str | |
| `side` | `buy` \| `sell` \| `short` \| `cover` | |
| `qty` | float | always positive; `side` gives direction (ints are fine) |
| `price` | float | fill price per share |
| `fee` | float | HOOP charged on this fill |
| `t` | float | market time of the fill |
| `reason` | `market` \| `limit` \| `stop` \| `liquidation` | why it filled |

### Position and Portfolio (from Person 2)

`Position`: `symbol`, `qty` (negative = short), `avg_cost`.

`Portfolio`: `cash`, `equity` (= cash + sum of qty × current price), `positions` (list of Position).

## Person 1: MarketAdapter

```python
class MarketAdapter(Protocol):
    def symbols(self) -> list[str]: ...
    def market_time(self) -> float: ...
    def get_tick(self, symbol: str) -> Tick | None: ...
    def recent_ticks(self, symbol: str, limit: int = 120) -> list[Tick]: ...   # oldest first
    def inject_event(self, event: MarketEvent) -> None: ...                     # future t = schedule it
    def set_fair_value_shift(self, symbol: str, shift: float, ramp_s: float = 0.0) -> None: ...
    def recent_events(self, since_t: float | None = None) -> list[MarketEvent]: ...
```

**What I need from you:**

1. **Read access** to the latest tick and a short history (about 1 minute of
   real time) per symbol. I use it for grading ("did you sell near the
   peak?"), the report card, and Coach Hoops context.
2. **`inject_event`**: missions fire scripted events through your scenario
   director. I'll send events shaped like `MarketEvent`. If `t` is in the
   future, please schedule it.
3. **`set_fair_value_shift`**: a low-level way to nudge fair value by a
   fraction, reached linearly over `ramp_s` real seconds (`0.0` clears it).
   This is a fallback for missions that need exact control. If it's awkward
   for you, tell me.
4. **`recent_events`**: the events that actually fired, with the real fire time.
5. **Event dynamics.** How each `kind` plays out is your call. Missions are
   tuned against these mock defaults, so please keep roughly the same feel:

   | kind | ramp to full impact | long-term share of impact | fade time constant | storm decay |
   |---|---|---|---|---|
   | `hot_streak` | ~14 s | 50% | 30 s | 20 s |
   | `early_warning` | 2 s | 100% | n/a | 25 s |
   | `injury` | 2 s | 85% | 60 s | 30 s |
   | `rest_day` | 3 s | 0% | 25 s | 10 s |
   | `trade_rumour` | 4 s | 0% | 20 s | 20 s |

   (These are real seconds.) Mission 1 relies on the hot streak peaking
   about 15-20 s after the event and then cooling a little.
6. **Scenario format.** Missions live in `scenarios/*.json`. The format is in
   `scenarios/SCHEMA.md`. Market steps map 1:1 onto `MarketEvent`. Can your
   director load these files, or should I convert them to your format at
   merge? (See "Mission runner and the scenario director" below.)
7. **Symbols.** My mocks use `SGA`, `JOKIC`, `TATUM`, `WEMBY` and `ANT` as
   placeholders. Please tell me your real ticker for Shai Gilgeous-Alexander
   (Mission 1 uses it) once the player universe is fixed.

### Mission runner and the scenario director

The mission runner (`backend/learning/missions.py`) is what plays a mission's
timeline. Right now it plays the timeline itself and pushes market steps into
the engine with `inject_event`. So for missions, it **is** the director for
that user. Exactly what it needs from your engine:

| when | call | expectation |
|---|---|---|
| mission start | `market_time()` | stored as the mission window start (`start_market_t`) |
| every 0.1 s while running | `recent_ticks(symbol, 240)` per mission symbol | ticks with `t >= start_market_t` are recorded (keyed by `t`) as the mission price path. Ticks must have increasing `t` |
| a market step is due (real `t` reached) | `inject_event(MarketEvent(t=market_time(), ...))` | fires **now**. `impact`, `storm` and `headline` come from the step. Your engine applies its per-kind dynamics |
| mission end / stop | `market_time()` | stored as the window end (`end_market_t`) |

The runner never schedules future events in your engine. It waits and fires
each step on time, so stopping a mission early cancels its remaining steps.
Already-fired events stay in the market.

What I need from your director:

1. **Don't fire mission events twice.** If your director also auto-plays
   scripted events, it must not replay `scenarios/m*.json` on its own while
   my runner does. Either my runner keeps driving missions (simplest), or the
   director exposes `play(scenario, start_market_t)` and `cancel()` and I call
   those instead of `inject_event`.
2. **Open question: the market is shared.** An event fired for one user's
   mission moves the price for everyone. That's fine for a single-player demo.
   For many players we'd need per-user sandbox markets or "mission
   symbols". Let's decide at merge.
3. **The real clock keeps running.** The runner measures mission time on a
   real-time clock (`time.monotonic`) and expects market time to advance at
   12x. If your engine pauses or changes speed, tell me.

## Person 2: TradesAdapter

```python
class TradesAdapter(Protocol):
    def trades_for_user(self, user_id: str, since_t: float | None = None) -> list[Trade]: ...  # oldest first, t >= since_t
    def portfolio(self, user_id: str) -> Portfolio: ...
    def apply_start_state(self, user_id: str, cash: float, positions: list[Position]) -> None: ...
```

**What I need from you:**

1. **Read access to trades and portfolios.** I never place orders. Users
   trade through your API and I read the results. The one write is
   `apply_start_state` (item 4).
2. **`trades_for_user` with `since_t`**: all fills for a user since mission
   start, oldest first, inclusive of `t == since_t`. I compute realised P&L
   from these, so `price` and `fee` must be the actual fill values.
3. **`portfolio`**: cash, equity, positions. Composition panel and grade use it.
4. **`apply_start_state(user_id, cash, positions)`**: called once when a
   mission starts. Reset that user's account (or a mission sub-account) to
   exactly this cash and these positions (Mission 1: 100,000 cash, no
   positions). You can keep old trades; I only read trades inside the
   mission window `[start_market_t, end_market_t]`. If a reset would wipe a
   real account, we should use a separate mission sub-account. Let's agree how.
5. **Fees.** My mock charges 0.10% of notional and fills market orders at the
   best ask (buys) / best bid (sells). Tell me if yours differ, because the
   mission copy mentions the fee.

## Person 3: what the mission API sends to the frontend

Base URL in dev: `http://localhost:8001` (CORS allows `http://localhost:5174`).
After the merge it's the main backend. All JSON.

### REST

| method + path | body / query | returns |
|---|---|---|
| `GET /learning/missions` | none | list of mission entries from `content/missions.json`, each with `available: bool` |
| `POST /learning/missions/start` | `{"user_id", "mission_id"}` | status (below). `404` unknown or not available, `409` already running |
| `POST /learning/missions/stop` | `{"user_id"}` | status. `409` if nothing is running |
| `GET /learning/missions/status?user_id=` | none | status |
| `GET /learning/missions/result?user_id=` | none | result (below). `404` never played, `409` still running |
| `GET /learning/glossary` | none | `[{"term", "short"}]` |
| `GET /learning/scenarios/{id}` | none | the scenario JSON |

**Status:**

```json
{
  "user_id": "u_test", "state": "running", "mission_id": "m1_buy_low_sell_high",
  "title": "Buy low, sell high", "goal": "Buy SGA, then sell it for a profit before the bell.",
  "symbols": ["SGA"], "duration_s": 45, "elapsed": 12.3, "seconds_left": 32.7,
  "hints": ["Watch the ticker - a player is heating up."],
  "messages": [{"seq": 4, "t": 10.0, "kind": "event", "text": "SGA heating up: ...", "symbol": "SGA", "event_kind": "hot_streak"}],
  "result_ready": false
}
```

`state` is one of `idle`, `running`, `completed` (ended, passed), `failed`
(ended, not passed) or `stopped` (user stopped early). `messages` holds the
latest 10.

**Result:**

```json
{
  "mission_id": "m1_buy_low_sell_high", "mission_number": 1, "user_id": "u_test",
  "state": "completed", "passed": true, "outcome": "passed_great", "score": 93,
  "realised_pnl": 776.6, "return_pct": 16.15,
  "qty_bought": 100, "qty_sold": 100, "qty_held_at_end": 0,
  "entry_price": 48.05, "exit_price": 55.92, "best_entry_price": 47.67, "best_exit_price": 56.16,
  "final_equity": 100776.6, "start_t": 1737313200.0, "end_t": 1737313740.0,
  "debrief": "Huge! You caught the heater ...", "lesson": "You only make money when ..."
}
```

`outcome` is one of `never_bought`, `sold_at_loss`, `still_holding`,
`passed_ok` or `passed_great`. `score` runs from 0 to 100: how much of the
available move the player captured.

### WebSocket `ws://localhost:8001/learning/ws?user_id=<id>[&symbols=A,B]`

Server → client only. Three message shapes:

1. **On connect, once:**
   `{"type": "mission", "kind": "snapshot", "state": "idle|running|...", "text": <goal or null>, "status": {...status...}}`
2. **Mission messages, as they happen:**
   `{"type": "mission", "state": "running", "mission_id": "...", "seq": 5, "t": 10.0, "kind": "hint|message|event|state|result", "text": "...", "symbol": "SGA"|null, "event_kind": "hot_streak"|null}`
   - `hint` / `message`: coach and announcer copy from the scenario
   - `event`: a news headline (`symbol` and `event_kind` set)
   - `state`: mission started or ended ("Closing bell! Mission complete.")
   - `result`: the debrief text. Then fetch `/learning/missions/result` for the full breakdown
3. **Ticks, 2 Hz,** for the current mission's symbols (or `?symbols=` when no mission is loaded):
   `{"type": "tick", "t", "symbol", "price", "fair_value", "best_bid", "best_ask"}`

### Mock-only (dev app; **remove at merge**)

`POST /learning/mock/order {"user_id", "symbol", "side", "qty"}` and
`GET /learning/mock/portfolio?user_id=` stand in for Person 2's trading API.
They also have `/learning/mock/tick`, `/ticks`, `/event`, `/events` and `/trades`.

## How we merge

`backend/main.py` (yours) adds:

```python
from learning import router as learning_router, configure as configure_learning, shutdown as shutdown_learning

configure_learning(market_adapter, trades_adapter)   # at startup; objects meeting the Protocols above
app.include_router(learning_router)
await shutdown_learning()                            # in the shutdown/lifespan exit
```

The mission loop starts itself the first time a mission starts, so no other
startup hook is needed.

I don't touch `backend/main.py`, `frontend/`, or a top-level
`requirements.txt`. My deps are in `backend/requirements-learning.txt`.
