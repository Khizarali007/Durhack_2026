# Scenario file format

One JSON file per scenario in `scenarios/`, named `<id>.json`. Missions use
`mN_<slug>.json`. The pydantic model lives in `backend/learning/scenario.py`
and the checker is `scenarios/check_scenarios.py`.

> **Merge note (Person 1):** the scenario director must accept this format,
> or we adapt it at merge. Market steps map 1:1 onto `MarketEvent`
> (see `docs/person4-interfaces.md`); `hint` and `message` steps are for the
> learning layer and the UI only and never touch the market.

## Top level

| field | type | required | notes |
|---|---|---|---|
| `id` | string `^[a-z0-9_]+$` | yes | must equal the file name without `.json` |
| `title` | string | yes | shown to the player |
| `mission_number` | int 1-6 or `null` | no | `null` = free-play scenario, not a mission |
| `duration_s` | number | yes | real seconds; **missions must be 30-60 s** |
| `symbols` | string[] (≥1) | yes | every symbol used anywhere in the file |
| `start_state` | object | no | defaults to 100,000 cash, no positions |
| `timeline` | step[] | yes | sorted by `t`, every `t` ≤ `duration_s` |
| `goal` | object | yes | see below |
| `lesson` | string | yes | one-line takeaway |

### `start_state`

```json
{ "cash": 100000, "positions": [{ "symbol": "SGA", "qty": 50, "avg_cost": 47.5 }] }
```

### `goal`

```json
{ "type": "round_trip_profit", "symbol": "SGA", "params": { "min_realised_pnl": 0 }, "text": "..." }
```

`type` is a machine-readable id the grader switches on; `params` are
type-specific; `text` is shown to the player. Goal types so far:

- `round_trip_profit`: realised P&L on `symbol` during the mission must be
  greater than `params.min_realised_pnl`.

## Timeline steps

Every step has `t` (real seconds from mission start, ≥ 0) and `kind`.

| kind | goes to | required | optional | forbidden |
|---|---|---|---|---|
| `hint` | learning layer / UI | `text` | | `impact`, `storm`, `headline` |
| `message` | learning layer / UI | `text` | | `impact`, `storm`, `headline` |
| `early_warning` | market | `symbol`, `impact`, `headline` | `storm` (default 1.0) | `text` |
| `injury` | market | `symbol`, `impact`, `headline` | `storm` | `text` |
| `hot_streak` | market | `symbol`, `impact`, `headline` | `storm` | `text` |
| `rest_day` | market | `symbol`, `impact`, `headline` | `storm` | `text` |
| `trade_rumour` | market | `symbol`, `impact`, `headline` | `storm` | `text` |

- `impact`: fractional fair-value shift, e.g. `0.18` = +18%, `-0.25` = -25%.
- `storm`: volatility multiplier at the moment of the event (1.0 = normal, 2.0 = twice as jumpy).
- How fast an impact ramps in and fades out is up to the engine per `kind`
  (the mock's defaults are listed in `docs/person4-interfaces.md`).

Converting to market time: a step at `t` fires at
`mission_start_market_t + t * 12` (1 market minute = 5 real seconds).

## Content rules (enforced by the checker)

1. **Early warning before every injury:** each `injury` step needs an
   `early_warning` step for the same symbol 20-40 s earlier.
2. **Mild headlines only:** all player-facing copy (title, lesson, goal text,
   headlines, hint/message text) is scanned against a block-list
   (arrest, police, legal, surgery, torn, fracture, scandal, ... and anything
   off-court). Keep it to basketball: hot nights, sore ankles, rest days, rumours.
3. **Mission length:** missions (`mission_number` set) run 30-60 s.

Run it:

```bash
python scenarios/check_scenarios.py
```
