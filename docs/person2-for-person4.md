# Person 2 → Person 4: your TradesAdapter is ready

From: Person 2 (accounts, trading, Solana). Branch: `person2branch`.

**Short version:** `backend/trading/adapters.py` has a real `TradesAdapter` behind your Protocol. At merge, replace `MockTrades` with it:

```python
# backend/main.py (already creates it at startup)
configure_learning(market_adapter, app.state.trades_adapter)
```

## What you get

| Your method | What it returns |
|---|---|
| `trades_for_user(user_id, since_t=None)` | The player's real fills, oldest first, `t >= since_t` (inclusive). Fields exactly match your `Trade`: `trade_id, user_id, symbol, side, qty, price, fee, t, reason`. `reason` is `market`, `limit` or `stop` today, `liquidation` later |
| `portfolio(user_id)` | `Portfolio(cash, equity, positions)`, each position `Position(symbol, qty, avg_cost)`. Equity marks shares at the last trade price |
| `apply_start_state(user_id, cash, positions)` | Resets that player's account to exactly this cash and these positions (your `Position` models work as-is) |

- They're plain dataclasses with your field names, so attribute access and `Trade.model_validate(asdict(t))` both work.
- Money is in HOOP floats and `t` is market time in epoch seconds, as you asked.
- I test against your real code from `person4-learning`: your `TradesAdapter` Protocol, your `Trade`/`Portfolio` models, and your `round_trip` evaluator all accept my adapter.

## The sub-account question (your item 4)

I went with **resetting the player's own account**, like your mock does. The player trades through my normal API with their normal token during a mission, so a separate sub-account would need a second token in the frontend. To keep real portfolios safe:

- **The first reset saves the player's real account** (cash, positions, profit, fees). Replaying a mission doesn't overwrite that save.
- Their open limit and stop orders are cancelled, so nothing stays reserved.
- Trades are kept, and you read only the mission window. The portfolio's profit/loss restarts from the mission's start state.
- **To give the real account back,** call `app.state.trades_adapter.restore_start_state(user_id)`, or have the frontend call `POST /trading/account/restore` with the player's token. It puts back cash, positions, profit and fees exactly. A sensible place for it is when the player leaves the mission screen, or after the report card.

## Things to know

- **Fees:** 0.10% of each fill's notional, as in your mock and mission copy.
- **Fill prices:** market buys fill at the best ask and sells at the best bid, but my market has 3 makers with limited stock. **Big orders slip**: 300 SGA averages about 5% over the ask. Use small quantities (1 to 100) in mission copy, or mention slippage. `POST /trading/orders/quote` shows the expected average before confirming.
- **Short selling is live** (P2-14): `POST /trading/orders` takes `side: short | cover`, as in your mock (no shorting while long, no buying while short). Shorts hold back 200% of their value from cash as collateral.
- **Short start states work:** pass a negative `qty` with `avg_cost` = the price it was sold at, e.g. `Position(symbol="WEMBY", qty=-40, avg_cost=105.0)` for the danger-zone mission. `portfolio()` returns shorts the same way (negative `qty`, positive `avg_cost`). Fractional shares and unknown symbols are rejected.
- **Leverage and margin calls are live** (P2-15), for the danger-zone mission: orders take `leverage: 1–3`. Under 25% margin (equity ÷ exposure) the player gets a margin call, and 15 s later (or straight away under 20%) positions are sold for them. Those fills come through `trades_for_user` with `reason="liquidation"`. My WebSocket pushes `{"type": "margin", "event": "warning"|"margin_call"|"liquidated"|"ok", ...}` the moment it happens, ready for the siren. `GET /trading/margin` has the numbers for a margin bar. A mission reset clears any margin call.
- **Equity history for the report card** (P2-16): `app.state.trades_adapter.equity_history(user_id, since_t=mission_start)` returns `EquityPoint(t, equity)` once per market minute (every 5 real seconds), oldest first. A mission reset saves a point straight away, so the first point is the mission's start. For max drawdown you can use `trading.equity.max_drawdown([(t, cents), ...])` or your own peak-to-low loop: a test checks they agree. The frontend gets the same series, with drawdown worked out, from `GET /trading/equity-history`.
- **Your `round_trip` evaluator** only counts `buy`/`sell`, so mission 6 will need short/cover handling: realised = (sold for − bought back for) per share, with fees separate.
- **Symbols:** my fake market uses your placeholders (`SGA`, `JOKIC`, `TATUM`, `WEMBY`, `ANT`, …). Real tickers depend on Person 1.
- **Live updates:** my WebSocket at `/trading/ws?token=` pushes `fill`, `open_order` and `receipt` messages, so your mission UI can react to the player's trades instantly instead of polling.
