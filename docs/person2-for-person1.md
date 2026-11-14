# Person 2 → Person 1: what my backend does, and what I need from the market engine

From: Person 2 (accounts, trading, Solana). Branch: `person2branch`.

**Short version:** I've built the whole player side (accounts, orders, portfolio, limit and stop orders, Solana receipts) against a **fake market** that copies your prototype. To switch to your real engine I need a **live engine object** with a few methods and a stream of events (section 3). You don't have to match my names exactly: if your shapes are close, I'll write a thin adapter. Section 4 lists the decisions I need from you.

---

## 1. What I'll have by the end of my tickets

✅ = built and tested (169 tests, checked on a live server against real Solana devnet). ⬜ = planned.

| Area | Endpoints (all under `/trading`) | Status |
|---|---|---|
| Accounts | `POST /signup`, `/login`, `/guest`, `/logout`, `GET /me`. Passwords hashed (scrypt), token auth, 100,000 HOOP start | ✅ |
| Market orders | `POST /orders` buy/sell at the best price, 0.10% fee. Buys go in 10-share chunks with a cash check before each, so they never overspend. Returns `partially_filled` if makers run out | ✅ |
| Portfolio | `GET /portfolio`: cash, reserved and available cash, equity, realised and unrealised profit, fees, positions with weight %. Exact to the cent | ✅ |
| Trade history | `GET /trades` (filters `since_t`, `symbol`, `limit`). Shaped like Person 4's `Trade` | ✅ |
| Limit and stop-loss | `POST /orders/open`, `GET /orders/open`, `DELETE /orders/{id}`. They wait for their price, then fire as market orders. While open, they hold back cash or shares | ✅ |
| Solana receipts | Every human order gets a devnet Memo receipt within about 1 s, co-signed by the player's wallet (`GET /orders/{id}/receipt`). Trades never wait for Solana | ✅ |
| Bot receipts | One devnet receipt per market minute of bot trades, holding a sha256 of the list (`GET /bot-bundles`, `GET /bot-bundles/{id}` re-checks the hash) | ✅ |
| Wallets | One server-held devnet wallet per player, plus a funded fee-payer wallet. `GET /chain/status` | ✅ |
| Live updates | WebSocket with each player's fills, order fires and receipt status | ⬜ P2-13 |
| Person 4 adapter | `trades_for_user`, `portfolio`, `apply_start_state` for missions | ⬜ P2-21 |
| Performance payouts | Pays human holders on each `PerformancePayout`, records it, adds it to profit, pushes it live. Built on guessed rates (question 6) | ✅ P2-22 |
| Short selling, 3x leverage, margin calls | | ⬜ P2-14, P2-15 |
| Equity history, leaderboard, on-chain portfolios | | ⬜ P2-16 to P2-18 |

**Code layout** (matches Person 4's): one package per person inside `backend/`, imported by its own name, and **no `backend/__init__.py`**. Mine is `backend/trading/`. The shared app is `backend/main.py`, which I started; please merge your startup into it rather than replacing it. Run it with `uvicorn main:app --app-dir backend`.

---

## 2. How my code talks to the market today

Everything goes through one function, `get_market()` in `backend/trading/market_provider.py`. Today it returns `FakeMarket` (`backend/trading/fake_market.py`). That fake copies your `simulate_market.py`:
- 3 makers per player, each with 100k HOOP and 150 shares
- your inventory skew, offsets (−0.7 / 0 / +0.7%) and spreads (2.0 / 2.5 / 3.0%)
- price = last executed trade
- value, momentum, casual and contrarian bots
- integer cents inside

**Swapping in your engine is one line in that file**, plus an adapter if the shapes differ. The interface is in `backend/trading/market_contract.py`.

---

## 3. What I need from your engine (the asks)

### 3a. A live engine object, not just the daily batch replay
Your prototype writes daily closes to a CSV. The game needs the market **running while people trade**:
- **One tick every 0.5 real seconds.** Market time `t` is epoch seconds, running at **12× real time** (1 market minute = 5 real seconds). Person 4 uses the same clock.
- Started from FastAPI as `asyncio.create_task(engine.run())`. My `main.py` already does this for the fake.
- **Everything on the asyncio event loop thread, no threads.** My order route is `async` so its calls to your engine never collide with your ticks. Please keep your methods synchronous and quick (no `await` inside an order).

### 3b. Read access

```python
engine.players() -> list[Player]      # Player(player_id: int, symbol: str, name: str, team: str, start_price: float)
engine.market_time() -> float         # epoch seconds
engine.quote(symbol) -> Quote         # see below
engine.last_price(symbol) -> float    # = quote(symbol).last
```

`Quote`:
- `symbol`
- `bid`, `ask` (floats, or `None` if no maker can trade that side)
- `last` (the last trade, i.e. the displayed price)
- `fair_value`
- `makers`: 3 × `MakerQuote(maker_id, bid, ask, shares)`

Prices cross between us as **floats in HOOP (2 dp)**. Keep cents inside, as you do now.

**I need a `symbol` per player** (e.g. `SGA`, `WEMBY`). Person 4 and the frontend key everything by symbol, and I keep your ESPN `player_id` alongside it.

### 3c. Human orders

```python
engine.submit_order(account_id: str, symbol: str, side: "buy" | "sell", qty: int) -> OrderResult
```

- `OrderResult(order_id, status: "filled" | "partially_filled" | "rejected", fills, remaining_qty, reason)`
- Each `Fill(order_id, symbol, side, qty, price, counterparty: maker_id, t)`.

What I rely on:
1. **Synchronous, fills straight away**, against the best maker, then the next.
2. **No cash or holdings check on your side.** I track the human's cash and shares. Your `Market.trade()` currently needs a bot-style `Trader`, so please add a human path that skips that.
3. **Sells from someone with no shares are accepted** (a short sale). To you it's just a sale to a maker.
4. If makers run out of shares or cash, return what filled as `partially_filled` with a `reason`.
5. Big orders: I already send buys in 10-share chunks. If you also re-quote within an order, great, but I don't depend on it.

**Limit and stop orders are my job.** Your engine has no resting book, which is fine: I watch ticks and send market orders.

**Nice to have:** `engine.preview_order(symbol, side, qty) -> OrderResult`, meaning what `submit_order` would do right now, **without trading or changing anything**. My order ticket uses it to show the exact average price, slippage and fee before the player confirms (`POST /trading/orders/quote`). My fake does it by trading against a throwaway copy of that player's makers. Without it, I estimate from the makers' current quotes, which underestimates slippage on big orders.

### 3d. An event stream

```python
queue = engine.subscribe()   # -> asyncio.Queue
engine.unsubscribe(queue)
```

Events I listen for:

| Event | When | I use it for |
|---|---|---|
| `MarketTick(t, quotes: dict[symbol, Quote])` | every tick (0.5 s), all symbols | firing limit and stop orders; later margin calls |
| `BotTradeSummary(minute_t, count, total_volume, trades)` | once per market minute | the bundled Solana receipt. `trades` = list of `BotTrade(bot_id, symbol, side, qty, price, t)` |
| `PerformancePayout(t, symbol, hoop_per_share, game_score, reason)` | when a box score is revealed (your payout design) | crediting human holders (P2-22) |

Use `put_nowait` and drop the event if a queue is full, so one slow listener never stalls your market. My fake does this.

---

## 4. Decisions I need from you

1. **Tickers:** can you add `symbol` per player? (3b)
2. **Human order path:** does `submit_order` as described in 3c work, without a `Trader` object?
3. **Shorting:** OK to accept sells from humans with no holdings?
4. **Maker stock:** 3 × 150 = 450 shares per player. **One judge buying 500 shares empties a player's asks** (I tested it: buying 600 FOX filled 450 at +8.6% slippage, then nothing). Is that intended, or should makers restock?
5. **Your bots' starting shares:** your bots start with 1 share each, so they can barely sell back to the makers after a big human buy. My fake gives bots unlimited stock to keep prices moving. What do you want in the real thing?
6. **Payouts:** I've built my side (paying human holders, recording, portfolio, live messages) on these **guesses**. Please confirm or correct them:
   - **When:** at each game day's final whistle, with one `PerformancePayout` per player who played.
   - **How much:** 0.02 HOOP per Game Score point per share, so a 30-point game pays 0.60 per share (about 0.4% of a 150 price). **Bad games pay 0** rather than costing money.
   - **Short sellers pay the payout**, like dividends on a real stock.
   - Still open: does fair value drop by the payout afterwards, like real dividends? My fake doesn't do this.
   - Your engine pays its own bots and makers. I only pay humans.
7. **Live clock:** when will the 12-market-minute sessions and final whistle exist? Can the replay start on a chosen day (the demo starts the day before the Wembanyama news)?
8. **Resets:** when the market restarts or jumps to a day, should players' portfolios reset too? I'd add an admin reset on my side if so.
9. **Person 4:** they also need a `MarketAdapter` from you (`get_tick`, `recent_ticks`, `inject_event`, `set_fair_value_shift`, `recent_events`). See `docs/person4-interfaces.md` on `person4-learning`. Their tick shape `{t, symbol, price, fair_value, best_bid, best_ask}` is a subset of my `Quote`, so one engine can serve both of us.

10. **Preview:** can you add `preview_order` (see the end of 3c)? It's not required, but it makes the order ticket's estimate exact.

---

## 5. How we plug together

1. You put your engine in its own package, e.g. `backend/market/`, with a class that has the methods in section 3 (or close to them).
2. I point `get_market()` at it, writing an adapter where names or units differ.
3. I run my 169 tests, plus the fake market's behaviour tests, against your engine, and we fix any differences together.
4. `backend/main.py` starts the engine once. My order watcher and bot-bundle recorder subscribe to its events, and Person 4's mission runner reads its ticks.

Where to look on `person2branch`:
- `backend/trading/market_contract.py`: the exact interface
- `backend/trading/fake_market.py`: a working reference implementation
- `docs/person2-tickets.md`: my full ticket list
