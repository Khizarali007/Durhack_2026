# Person 2 tickets: accounts, trading and Solana

These tickets come from the 4-person work split and `hoopstreet-final-plan.md`. They were updated after Person 1's prototype (`person-1-tasks`) and Person 4's interfaces (`person4-learning`) landed. Work them roughly in order.

**Gates:**
- **G1** = H+4
- **G2** = H+8
- **G3** = H+14
- **Stretch** = only if there's time

**Status:** ✅ done · 🟡 partly done · ⬜ not started

## How to run

From the repo root:

```bash
source .venv/bin/activate
pip install -r backend/requirements-trading.txt
python -m pytest backend/trading                     # all Person 2 tests
uvicorn main:app --app-dir backend --reload          # then open http://127.0.0.1:8000/docs
```

## Layout
Matches Person 4's: each person owns a package inside `backend/`, imported by its own name (`trading`, `learning`). There is **no `backend/__init__.py`**.

- `backend/main.py`: the shared app (Person 2's starting version; merge with Person 1's)
- `backend/trading/`: everything Person 2 owns
  - `router.py`: routes under `/trading`
  - `db.py`: SQLite tables
  - `market_contract.py`: the interface to Person 1's engine
  - `fake_market.py`: stand-in for Person 1's engine
  - `market_provider.py`: `get_market()`, the one place that switches fake → real
  - `tests/`: pytest tests
- Later packages: `trading/accounts.py`, `trading/chain/` (Solana), etc.
- `backend/requirements-trading.txt`: your dependencies

## Team conventions to follow
These come from Person 1's prototype and Person 4's interfaces.
- **Market time** `t` = epoch seconds (float), running at 12× real time.
- **Money:** store **integer cents** in the database, like Person 1. Send **floats in HOOP** to Person 4 and the frontend. Users start with 100,000 HOOP.
- **Players:** addressed by `symbol` (str) in your code and API. Person 1 keys by ESPN `player_id` (int), and the engine adapter maps between them.
- **Trade sides:** `buy | sell | short | cover`. Fill reasons: `market | limit | stop | liquidation` (Person 4's `Trade`).
- **Fee:** 0.10% of notional, unless the team changes it. Person 4's mission copy mentions this.
- **Secrets** (the fee-payer keypair, `.env`) are never committed. `.gitignore` covers them, plus the local `*.sqlite` files.

---

## 🟡 P2-00 · Agree the contracts with the team
- **Gate:** before G1, but it doesn't block you
- **Done:**
  - Person 1's direction is reflected in `market_contract.py` and the fake (see `docs/person1-contract-guesses.md` for confirmed vs guessed).
  - Person 4's `TradesAdapter` needs are captured in P2-21.
- **Still to ask Person 1** (the guesses doc lists these):
  1. Tickers per player: Person 4 and the frontend use symbols like `SGA`.
  2. The call a human order goes through. Today their `Market.trade()` needs a bot-style `Trader` with cash and holdings.
  3. Whether a human can sell shares they don't hold (shorting).
  4. Makers hold only 150 shares each (450 per player), so one big buyer can empty a player. Is that intended for the demo?
  5. When the live clock and tick feed (0.5 s, 12×) arrive, plus the per-minute bot summary.
  6. **Performance payouts** (see P2-22): when they happen, how they're calculated, and how the engine tells you.
- **Still to agree:**
  - **With Person 3:** your REST endpoints and WebSocket messages (fills, receipt status, margin status).
  - **With Person 4:** how `apply_start_state` avoids wiping a real account (a mission sub-account?), and that the fee is 0.10%.
- **Done when:** these answers are in `market_contract.py` and the docs.

## ✅ P2-01 · Backend skeleton for your area
- **Gate:** G1
- **What was built:**
  - `backend/main.py`: FastAPI app. It opens the database and starts the market ticking on startup, and stops both on shutdown. There are comments marking where Person 4's `configure_learning` and the frontend's static files plug in.
  - `backend/trading/router.py`:
    - `GET /trading/health` returns market time, player count and tables.
    - `GET /trading/debug/quote/{symbol}`.
  - `backend/trading/db.py`:
    - `users`, `positions`, `trades` tables, with money in integer cents.
    - The `trades` columns match Person 4's `Trade`, plus Solana receipt fields.
    - `TRADING_DB_PATH=:memory:` for tests. The default file is `data/trading.sqlite`.
  - `.venv` with FastAPI, uvicorn, pydantic, pytest and httpx (same versions as Person 4).
  - `tests/test_app.py`: the app starts, routes are in `/docs`, the market ticks, and bad trades are rejected by the database.
- **Checked:** uvicorn started on a real port, `/docs` loaded, and market time advanced 12× real time.

## ✅ P2-02 · Fake market (unblocks you from Person 1)
- **Gate:** G1
- **What was built:** `fake_market.py`, rebuilt to copy Person 1's prototype:
  - 3 makers per player, each with 100k HOOP and 150 shares
  - Quotes centred on fair value, skewed by inventory, with spreads of 2.0, 2.5 and 3.0% (about 1.1% overall)
  - Price = last trade
  - Value, momentum, casual and contrarian bots
  - Integer cents inside
  - Person 4's clock (epoch `t`, 12×) and symbols (`SGA`, `JOKIC`, `TATUM`, `WEMBY`, `ANT`…)
  - Big orders walk through the makers (slippage), and come back `partially_filled` if every maker runs out
  - 19 tests in `tests/test_fake_market.py`
- **Not copied yet:** real box scores and injury reports moving fair value (the fake drifts randomly), finite bot accounts, real ESPN ids.

## ✅ P2-03 · Sessions and starting balance
- **Gate:** G1
- **What was built:**
  - `POST /trading/session` (201) creates a temporary account, stored as a guest, with **100,000 HOOP** (`10_000_000` cents). It returns `{token, user_id, cash}`.
  - `GET /trading/me` returns `{user_id, username, is_guest, cash}` for the token's owner.
  - **Auth:** send `Authorization: Bearer <token>`. A missing, malformed or unknown token gets `401`.
    - The check lives in one dependency, `current_user` in `trading/deps.py`. Every later endpoint uses it with `user: User = Depends(current_user)`.
    - `/docs` has an **Authorize** button for pasting a token.
  - `sessions` table in `db.py`. **Only a SHA-256 hash of each token is stored**, so a leaked database file can't be used to log in.
  - `trading/accounts.py`: `create_guest_user`, `create_session`, `user_for_token`, `get_user`.
  - `trading/money.py`: `to_hoop(cents)` and `to_cents(hoop)` (exact, rounds half up), ready for orders.
- **Tests:** `test_sessions.py` (two sessions have separate balances, bad tokens get 401, tokens are stored hashed) and `test_money.py`. 40 tests pass in total.
- **Checked on a live server:** two `curl` sessions got different users with 100,000 HOOP each, `/me` worked with a token, and no token or a bad token gave 401.
- **For Person 3:** call `POST /trading/session` once when the app opens, keep the token, and send it on every request. P2-07 later adds `signup`, `login` and `guest`, which return the same `{token, user_id, cash}` shape.

## ✅ P2-04 · Market buy/sell
- **Gate:** G1
- **What was built:** `POST /trading/orders {symbol, side: buy|sell, qty}` (needs the session token), with the logic in `trading/orders.py`.
  - **Buys go to the engine in 10-share chunks.** Before each chunk, your remaining cash is checked against the current ask plus a 2% buffer and the fee. An order can never overspend. If cash or the makers' shares run out, it stops and returns `partially_filled` with a `reason` (`not enough cash` / `market makers ran out of shares`).
  - **Sells** are checked against your holdings, then sent in one go.
  - **Fee:** 0.10% of each fill's notional, rounded to the cent.
  - **Ledger:** each fill becomes a `trades` row (`reason=market`, `receipt_status=pending`). Cash and the position (qty, cost basis without fees) update in **one database transaction**. Selling everything deletes the position. Cash can never go negative.
  - **Response:** `order_id, status, symbol, side, requested_qty, filled_qty, average_price, total_fee, cash, position_qty, fills[{trade_id, qty, price, fee, t, counterparty}], reason`.
  - **Errors:**
    - `400`: not enough cash, or not enough shares
    - `404`: unknown symbol
    - `409`: the makers couldn't fill any of it
    - `422`: bad input (qty ≤ 0, not whole, over 10,000, or side not buy/sell; short and cover come in P2-14)
    - `401`: no token
  - The route is `async` on purpose: engine calls run on the same thread that ticks the market, so they never race with it. **Keep this rule for any route that calls the engine.**
  - Tests get a fresh `FakeMarket` each time (`market_provider.use_market`).
- **Tests:** 20 in `test_orders.py`. 60 pass in total, 5 runs in a row.
- **Checked on a live server:**
  - Bought 20 SGA (average 150.98 vs ask 150.26).
  - Sold 5.
  - Overselling was refused.
  - Buying 600 FOX filled 450 (every maker's shares) at an average 103.14 vs a 95 start: 8.6% slippage, which is a good demo moment.
  - Buying FOX again then said the makers were out of shares.

## ✅ P2-05 · Portfolio
- **Gate:** G1
- **What was built:** `GET /trading/portfolio` (needs the session token), with the logic in `trading/portfolio.py`.
  - **Totals:** `cash`, `positions_value`, `equity` (= cash + positions value), `starting_cash`, `total_pnl` and `total_pnl_pct`, `unrealised_pnl`, `realised_pnl`, `fees_paid`.
  - **`positions`**, largest first: `symbol, name, team, qty, avg_cost, last_price, market_value, unrealised_pnl, unrealised_pnl_pct, weight_pct`. `weight_pct` is the share of equity, which Person 4's Composition panel can use directly.
  - Shares are valued at the **last trade price** (the displayed price).
  - `avg_cost` doesn't include fees. Fees are reported separately.
  - **Realised profit** is rebuilt from the trades, using the same average-cost rule as orders, so it always matches the stored positions.
  - Everything is computed in cents, so `equity − starting cash = realised + unrealised − fees` holds **exactly**. A test checks this after 25 random trades.
  - `build_portfolio()` returns cents and covers what Person 4's `Portfolio` needs (`cash`, `equity`, `positions[symbol, qty, avg_cost]`), ready for P2-21.
- **Not yet:** payouts received (P2-22), and shorts (P2-14). `total_pnl` assumes everyone starts with 100,000, so P2-21's `apply_start_state` will need its own starting value.
- **Tests:** 9 in `test_portfolio.py`. 69 pass in total, 3 runs in a row.
- **Checked on a live server:** after buying 30 WEMBY, buying 10 SGA and selling 4 SGA, the portfolio showed both positions with values and weights. Its totals added up: 28.90 = −5.96 realised + 40.16 unrealised − 5.30 fees. No token gave 401.

## 🟡 P2-06 · Trade record
- **Gate:** G1
- **Depends on:** P2-04 ✅
- **Done in P2-04:** every fill is already saved as a row in `trades`.
- **What's left:**
  - `GET /trading/trades` returns the user's fills oldest first, shaped like Person 4's `Trade`: `trade_id, user_id, symbol, side, qty, price, fee, t, reason`, plus `receipt_status`.
- **Done when:** every order shows up in order with the right prices and fees.

---

## ⬜ P2-07 · Accounts: sign-up, login, guest
- **Gate:** G2
- **Depends on:** P2-03
- **What:**
  - `POST /trading/signup` and `POST /trading/login` (username and password, **hashed** with bcrypt or argon2)
  - `POST /trading/guest` (one tap)
  - All return a session token.
- **Done when:**
  - A wrong password is rejected.
  - Passwords are never stored as plain text.
  - Guests can trade.

## ⬜ P2-08 · Solana setup: fee payer and per-account keypairs
- **Gate:** G2
- **Depends on:** P2-07
- **What:**
  - Add `solana` and `solders` to `requirements-trading.txt`.
  - Create the backend fee-payer keypair. Load it from `.env` or a `*keypair*.json` file, never committed.
  - **Claim devnet SOL early**, because the faucet limits how much you can claim.
  - Create a devnet keypair per account and store it server-side.
- **Done when:** the fee payer has devnet SOL and every account has a public key.

## ⬜ P2-09 · Level 0 receipts for human trades
- **Gate:** G2
- **Depends on:** P2-06, P2-08
- **What:**
  - After each human fill, queue a Memo transaction on a background asyncio queue. The memo is short JSON: who, symbol, side, qty, price.
  - Send it, measure the confirmation time, and fill in `receipt_signature` and `receipt_confirm_ms`.
  - Retry failures with backoff.
  - **Trades never wait for Solana.** `receipt_status` goes `pending` → `confirmed`, or `failed` after retries.
- **Done when:**
  - A trade fills instantly.
  - It flips to confirmed within seconds.
  - The Explorer link opens the real devnet transaction.

## ⬜ P2-10 · Bundled bot-trade receipts
- **Gate:** G2
- **Depends on:** P2-09, and `BotTradeSummary` from `subscribe()` (the fake sends one per market minute)
- **What:**
  - One memo per market minute with the **count, total volume and a sha256 hash of the trade list**.
  - Store the full list in the database so the hash can be checked against it.
- **Done when:** about 12 bundle receipts a minute land without hitting devnet rate limits.

## ⬜ P2-11 · Limit and stop-loss orders, cancel, open orders
- **Gate:** G2
- **Depends on:** P2-04, and the `MarketTick` feed (in the fake)
- **What:** Person 1's engine has **no resting order book**, so **both limit and stop orders live in your layer**:
  - Store open orders in the database.
  - On every `MarketTick`:
    - A buy limit fires when `ask ≤ limit`.
    - A sell limit fires when `bid ≥ limit`.
    - A stop-loss fires when `last ≤ trigger`.
  - When an order fires, send a market order with `reason` set to `limit` or `stop`.
  - Reserve the user's cash or shares while an order is open.
  - `DELETE /trading/orders/{id}` cancels an order. `GET /trading/orders/open` lists open orders.
- **Note:** a fired limit order can fill slightly worse than its limit if the price slips. Decide whether to cap the quantity to stay within the limit.
- **Done when:** a stop-loss fires during a price drop, and cancelled orders never fire.

## ⬜ P2-12 · Fees, spread and slippage
- **Gate:** G2
- **Depends on:** P2-04
- **What:**
  - `POST /trading/orders/quote` estimates before confirm: best price, spread, estimated slippage for this quantity, and the fee (0.10%).
  - Store the actuals on each fill.
- **Note:** to estimate slippage without trading, ask Person 1 for a "preview" call, or work it out from the makers' quotes and share counts in `Quote.makers`.
- **Done when:** the ticket shows the estimate and the actual, and big orders show more slippage.

## ⬜ P2-13 · Messages pushed to each user
- **Gate:** G2
- **Depends on:** P2-09
- **What:** each user gets their own fills, order fires and receipt status changes over a WebSocket. Agree the endpoint and message shapes with Persons 1 and 3. Person 4 uses `/learning/ws`, so `/trading/ws` fits the pattern.
- **Done when:** the frontend sees ⏳ settling, then ✓ confirmed, without refreshing.

## ⬜ P2-21 · TradesAdapter for Person 4 (new)
- **Gate:** G2 (Person 4 builds on a mock until then)
- **Depends on:** P2-05, P2-06
- **What:** implement Person 4's `TradesAdapter` (`backend/learning/adapters/base.py` on `person4-learning`):
  - `trades_for_user(user_id, since_t=None)`: fills oldest first, `t >= since_t`, with actual `price` and `fee`
  - `portfolio(user_id)`: `cash`, `equity`, `positions` (see P2-05)
  - `apply_start_state(user_id, cash, positions)`: reset to an exact start state when a mission starts. **Agree with Person 4 first** whether this uses a separate mission sub-account, so a mission never wipes a real portfolio.
- **Wiring:** `backend/main.py` calls `configure_learning(market_adapter, trades_adapter)` at startup and `await shutdown_learning()` on exit.
- **Done when:** Person 4's tests pass with your adapter in place of `MockTrades`.

## ⬜ P2-22 · Performance payouts to holders (new)
- **Gate:** G2 if Person 1 has defined payouts by then, otherwise G3. Person 1 calls them part of the core loop ("player performances pay holders").
- **Depends on:** P2-05, P2-06, and Person 1 answering question 9 in the guesses doc
- **Why:** a share is worth something because holding it earns HOOP from that player's future performances. Players can hold for payouts or sell when the price is good.
- **What:**
  - Listen for a payout event from the engine. The guessed shape is `PerformancePayout(t, symbol, hoop_per_share, game_score, reason)` in `market_contract.py`, sent when a player's real box score is revealed.
  - Credit every holder `qty × hoop_per_share` (in cents) in one database transaction.
  - Add a `payouts` table to `db.py`: `user_id, symbol, qty_held, cents_per_share, amount_cents, t, reason`. Players can then see exactly why their balance changed.
  - Show payouts in the portfolio (total and recent) and as a message over the WebSocket (P2-13).
  - Add `payouts_for_user` for Person 4 if the report card wants it.
  - **Shorts:** someone short a player **pays** the payout, like dividends on a real stock. Debit `abs(qty) × hoop_per_share`. Do this with P2-14.
  - Add payout events to the fake market, e.g. at each simulated final whistle, so you can build before Person 1's version exists.
- **Done when:** holding a player through a big game increases cash by the right amount, a short position pays it, and each payout appears in the portfolio and payout history.

---

## ⬜ P2-14 · Short selling and cover
- **Gate:** G3
- **Depends on:** P2-04, and Person 1 confirming that the engine accepts sells from humans with no holdings (P2-00 question 3). The fake accepts them.
- **What:**
  - `short` and `cover` sides, negative positions, and a collateral check.
  - Profit/loss is reversed for shorts.
  - A short sale is a `sell` to the engine (makers need cash to buy it), and a cover is a `buy`.
  - Shorts pay performance payouts while they're open (see P2-22).
- **Done when:** shorting before a price drop makes money, and the loss keeps growing if the price keeps rising.

## ⬜ P2-15 · 3x leverage and margin calls
- **Gate:** G3
- **Depends on:** P2-05, P2-14, `MarketTick`
- **What:**
  - Margin ratio per user.
  - Warning, then margin call, then automatic liquidation (`reason="liquidation"`).
  - Status messages pushed over the WebSocket.
- **Done when:** a 3x position sends a margin call, then liquidates, during the demo storm.

## ⬜ P2-16 · Equity history
- **Gate:** G3
- **Depends on:** P2-05
- **What:** save each user's equity every market minute (`t`, equity). Expose it for the report card.
- **Done when:** Person 4 can work out max drawdown from it.

## ⬜ P2-17 · Off-chain leaderboard
- **Gate:** G3
- **Depends on:** P2-05
- **What:** `GET /trading/leaderboard` ranks users by equity. It always works, even if Solana is down.
- **Done when:** it updates live during a session.

## ⬜ P2-18 · Level 1: on-chain portfolios
- **Gate:** G3
- **Depends on:** P2-09
- **What:**
  - A small Anchor (Rust) program written in Solana Playground.
  - A per-user Portfolio account holding cash, holdings and trade count.
  - The backend signs and pays.
  - A leaderboard read from the chain.
  - **Ask Claude for the Rust when you get here. If it's blocking by H+12, stay on Level 0.**
- **Done when:** the leaderboard reads correctly from devnet accounts.

## ⬜ P2-19 · Level 2: a mini-market per player on-chain
- **Gate:** Stretch, only if P2-18 is done by H+12
- **Depends on:** P2-18
- **What:** a per-player market on-chain that prices with a formula (x·y=k).

---

## ⬜ P2-20 · Swap the fake market for Person 1's real engine
- **Gate:** as soon as Person 1 exposes a live engine on `backend`, ideally before G2
- **Depends on:** P2-00's answers, and Person 1's live engine
- **What:**
  1. Write a small adapter around Person 1's engine that matches `MarketEngine`: map `player_id` ↔ `symbol`, cents ↔ HOOP, and their events ↔ `MarketTick` / `BotTradeSummary`.
  2. Point `get_market()` in `market_provider.py` at it.
  3. Run `python -m pytest backend/trading`. Point the fake-market checks at the real engine and fix any differences together.
  4. Keep `fake_market.py` for your own tests, since it's deterministic.
- **Done when:** your trading flow works end-to-end on the real engine, and the tests still pass on the fake.
