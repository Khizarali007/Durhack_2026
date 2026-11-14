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
   merge?
7. **Symbols.** My mocks use `SGA`, `JOKIC`, `TATUM`, `WEMBY` and `ANT` as
   placeholders. Please tell me your real ticker for Shai Gilgeous-Alexander
   (Mission 1 uses it) once the player universe is fixed.

## Person 2: TradesAdapter

```python
class TradesAdapter(Protocol):
    def trades_for_user(self, user_id: str, since_t: float | None = None) -> list[Trade]: ...  # oldest first, t >= since_t
    def portfolio(self, user_id: str) -> Portfolio: ...
```

**What I need from you:**

1. **Read-only access.** I never place orders. Users trade through your API
   and I read the results.
2. **`trades_for_user` with `since_t`**: all fills for a user since mission
   start, oldest first, inclusive of `t == since_t`. I compute realised P&L
   from these, so `price` and `fee` must be the actual fill values.
3. **`portfolio`**: cash, equity, positions. Composition panel and grade use it.
4. **Mission start state.** Missions set a starting cash and positions
   (`start_state` in the scenario). I'll need a way to give the user a fresh
   mission account (or a sandbox sub-account) with that state. Let's agree how.
5. **Fees.** My mock charges 0.10% of notional and fills market orders at the
   best ask (buys) / best bid (sells). Tell me if yours differ, because the
   mission copy mentions the fee.

## Person 3: frontend (for later)

Everything I serve sits under `/learning/*` (missions, glossary, scenarios,
and later mission state, grades, coach). During development it runs on
`http://localhost:8001`. Debug endpoints under `/learning/mock/*` exist only
in my dev app.

## How we merge

`backend/main.py` (yours) adds:

```python
from learning import router as learning_router, configure as configure_learning

configure_learning(market_adapter, trades_adapter)   # objects meeting the Protocols above
app.include_router(learning_router)
```

I don't touch `backend/main.py`, `frontend/`, or a top-level
`requirements.txt`. My deps are in `backend/requirements-learning.txt`.
