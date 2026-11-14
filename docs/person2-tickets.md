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
    - `422`: bad input (qty ≤ 0, not whole, over 10,000, or side not buy/sell/short/cover)
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
- **Since added:** payouts received (P2-22) and shorts (P2-14). `total_pnl` assumes everyone starts with 100,000, so P2-21's `apply_start_state` will need its own starting value.
- **Tests:** 9 in `test_portfolio.py`. 69 pass in total, 3 runs in a row.
- **Checked on a live server:** after buying 30 WEMBY, buying 10 SGA and selling 4 SGA, the portfolio showed both positions with values and weights. Its totals added up: 28.90 = −5.96 realised + 40.16 unrealised − 5.30 fees. No token gave 401.

## ✅ P2-06 · Trade record
- **Gate:** G1
- **What was built:**
  - Every fill is saved as a `trades` row (done in P2-04).
  - `GET /trading/trades` (needs the token) returns your fills **oldest first**.
    - **Fields:** `trade_id, user_id, symbol, side, qty, price, fee, t, reason`, which match Person 4's `Trade`, plus `order_id, counterparty, receipt_status, receipt_signature, receipt_confirm_ms` for the Solana tickets.
    - **Optional filters:**
      - `since_t`: inclusive, as Person 4 expects
      - `symbol`
      - `limit`: the most recent N, still oldest first. Default 500, max 5000.
  - `trading/trades.py`: `trades_for_user()` returns cents, ready for P2-21's TradesAdapter.
- **Tests:** 12 in `test_trades.py` (order and values match the order responses, Person 4's fields, inclusive `since_t`, filters, privacy, 401). 81 pass in total, 3 runs in a row.
- **Checked on a live server:** bought 15 LUKA (two fills from different makers) and sold 5, and the history listed all three fills in order with prices, fees, market times and `pending` receipts. `limit=1` returned the sale, and no token gave 401.

---

## ✅ P2-07 · Accounts: sign-up, login, guest
- **Gate:** G2
- **What was built:**
  - **`POST /trading/signup {username, password}`** (201) creates an account with 100,000 HOOP and logs in.
    - Usernames: 3–20 letters, digits, `_` or `-`, **unique ignoring case**. A taken name gets `409`.
    - Passwords: 6–128 characters. Bad input gets `422`.
  - **`POST /trading/login {username, password}`** returns a new token, and the username's letter case doesn't matter.
    - A wrong password and an unknown user get the **same** `401 "wrong username or password"`.
    - A dummy hash check runs for unknown users, so response timing doesn't reveal which usernames exist.
    - Your portfolio is exactly as you left it.
  - **`POST /trading/guest`** (201) is one tap, no form. `POST /trading/session` still works and does the same.
  - **`POST /trading/logout`** (204) ends that session only. Other sessions keep working.
  - All of these return `{token, user_id, username, is_guest, cash}`. `/me` shows `username` and `is_guest`.
  - **Passwords** are hashed with **scrypt** from Python's standard library (`trading/passwords.py`).
    - It's a slow, memory-hard hash in the same class as bcrypt and argon2, and needs no extra install.
    - Each password gets a random salt, and the comparison takes the same time whether or not it matches.
    - Stored as `scrypt$16384$8$1$<salt>$<hash>`.
- **Not done:** turning a guest into a full account (keeping the guest's portfolio), and limiting repeated login attempts. Neither matters for the demo.
- **Tests:** 22 in `test_accounts.py`. 103 pass in total, 3 runs in a row.
- **Checked on a live server:**
  - Signed up, and the same name in capitals was refused with 409.
  - A wrong password gave 401. Logging in worked, and logging out made the token return 401.
  - Guest worked.
  - The stored password starts `scrypt$16384$8$1$…`.

## ✅ P2-08 · Solana setup: fee payer and per-account keypairs
- **Gate:** G2
- **What was built** (`backend/trading/chain/`):
  - `solana` 0.42 and `solders` 0.29 installed and added to `requirements-trading.txt`.
  - **Fee-payer wallet:** `.solana/fee-payer-keypair.json`.
    - Solana CLI format, owner-only (0600), ignored by git (`.solana/` and `*keypair*.json`).
    - Created on first use. Override the path with `SOLANA_FEE_PAYER_KEYPAIR` and the RPC with `SOLANA_RPC_URL`.
    - **Address: `F5Y97rpM1a2YyHd7c5zqRKLZHgzZ1urmbncm5SrGhs3u`**
  - **One devnet wallet per user**, created at sign-up or guest (`wallets` table), or the first time an older account is used.
    - `/me` and every login response include `wallet_address`, and `/me` adds an Explorer link.
    - The secret key stays server-side and is never sent to clients. Storing it is only acceptable because devnet coins are worthless.
  - **`GET /trading/chain/status`**: fee-payer address, SOL balance, whether devnet answered (5 s timeout), and `ready` (balance ≥ 0.05 SOL, about 10,000 receipts).
  - **Setup script:** `python backend/trading/chain/setup_wallet.py` prints the address, balance and next step. `--airdrop` also asks devnet for 1 SOL directly, which is often rate-limited.
- **Tests:** 13 in `test_chain_setup.py`, none touching the network. `HOOP_DEVNET_TESTS=1` adds a real devnet check, which passed. 115 pass in total.
- **Checked:** the live server's `/chain/status` reached devnet (balance 0.0, `ready: false`), and a new guest got its own wallet.
- **Funded:** claimed 5 SOL from faucet.solana.com, and the setup script reports `Ready`. That pays for about a million receipts.

## ✅ P2-09 · Level 0 receipts for human trades
- **Gate:** G2
- **What was built** (`trading/chain/receipts.py`, `trading/chain/worker.py`):
  - **One Memo transaction per human order** (not per fill), covering every fill of that order.
    - The memo is short JSON: `app, v, kind, order, wallet, sym, side, qty, avg, fee, fills, h, t`.
    - `h` is a sha256 of the fill list, so anyone can check the receipt against our database.
    - It stays under 400 bytes even for a 45-fill order.
  - **Signatures:** the fee payer signs and pays, and **the player's wallet co-signs**, so the Explorer shows whose trade it was. Cost: 10,000 lamports (0.00001 SOL) per receipt.
  - **Trades never wait for Solana.** The order returns in about 30 ms with `receipt_status: "pending"`.
    - Two sender tasks submit receipts, and the signature is saved straight away.
    - **One checker** asks devnet about every in-flight receipt in **one batched request** every 0.4 s.
    - When it sees a receipt confirmed, every fill of the order becomes `confirmed`, with the signature and the measured send-to-confirm time.
  - **Never sent twice.** A receipt is only re-sent if the send failed (backoff 1/2/4/8 s), the chain rejected it, or it never landed within 60 s (by then its blockhash has expired, so a duplicate can't land). After 5 attempts it's `failed`, and the trade itself still stands.
  - **Rate limiting:** all devnet calls go through one limiter (5 per second, pausing 3 s after a 429). The free public devnet server rejects bursts of more than about 10 status calls.
  - **Restarts:** pending receipts are picked up on startup. Ones that already have a signature are checked, not re-sent.
  - **API:**
    - `GET /trading/orders/{order_id}/receipt` returns `{status, signature, explorer_url, confirm_ms}` (your own orders only, otherwise 404). The frontend can poll it until P2-13's WebSocket.
    - `GET /trading/trades` adds `receipt_explorer_url`.
  - `SOLANA_RECEIPTS=off` runs without Solana.
- **Tests:** 21 in `test_receipts.py` with a fake sender: retries, chain rejection, never landing, rate-limited checks without re-sending, restart without re-sending, batching, trades not waiting. `HOOP_DEVNET_TESTS=1` adds a real devnet send and confirm, which passed. 133 pass in total, 3 runs in a row.
- **Checked on a live server against real devnet:**
  - 3 orders filled in about 30 ms each.
  - Their receipts confirmed in 1054, 689 and 804 ms.
  - The 6 old pending receipts in the local database also confirmed, with no errors.
  - Reading one back from devnet showed both signers and the memo.
  - Example: https://explorer.solana.com/tx/37j1Z8S1U3dGAWri7Dz4QWDtNpEf3pM9z7XTSw2EQGBxzUKdN6JmG3mM7pza9bSbuvRfcdvCkAtL8egEVKS6Mj7u?cluster=devnet
- **Lesson learned:** the first version checked each receipt every 0.25 s from 3 workers and hit devnet's rate limit (429). The batched checker fixed it. If devnet is still a problem during the demo, set `SOLANA_RPC_URL` to a free dedicated RPC (e.g. Helius) instead of the public one.

## ✅ P2-10 · Bundled bot-trade receipts
- **Gate:** G2
- **What was built:**
  - **`trading/chain/bot_bundles.py`:** a recorder listens to the market's events.
    - Each `BotTradeSummary` (once per market minute, every 5 real seconds) becomes one bundle.
    - `bot_trades` holds the full trade list, and `bot_bundles` holds the count, volume and **sha256 of the list**. Both are saved in one transaction.
    - Minutes with no bot trades are skipped.
  - **Memo:** `{"app":"hoopstreet","v":1,"kind":"bots","bundle","minute","count","vol","h"}`, signed by the fee payer alone (5,000 lamports each). The hash is over one `bot_id,symbol,side,qty,price_cents,t` line per trade.
  - **The receipt worker now handles two job kinds**, `order` and `bundle`. They share the same senders, batched checker, rate limiter, retries and restart pick-up, so devnet still sees one well-behaved client.
  - **Public API:**
    - `GET /trading/bot-bundles?limit=` lists recent bundles, newest first, with receipt status and Explorer link.
    - `GET /trading/bot-bundles/{bundle_id}` returns the full trade list, plus `recomputed_hash` and **`hash_matches`**: a fresh check that the stored trades match what's on-chain. Editing a stored trade makes it `false`.
- **Tests:** 15 in `test_bot_bundles.py`, including one where the full app runs until a real market minute passes. The receipt tests now count only order receipts, since bundles arrive every 5 s. 146 pass in total, 3 runs in a row.
- **Checked on a live server against real devnet (about 22 s):**
  - 4 bundles of 14–21 trades each confirmed in 1.0–1.5 s, alongside a human order's receipt, with no rate-limit errors.
  - `hash_matches: true` on a 21-trade bundle.
  - Example: https://explorer.solana.com/tx/4zdYxvjg4shMGe9TZ1JuHn8QeUq7YDtnM2vfDJErLq6w3N7wgGQqbgEXLGs9DdbxmSZXjcWtggzHrBu32ZFx25WM?cluster=devnet
- **Cost:** 12 bundles a minute × 0.000005 SOL = 0.0036 SOL an hour. The 5 SOL lasts well over a month of nonstop running.
- **For Person 3:** a live "Day 14: 37 trades settled on Solana ✓" feed can poll `GET /trading/bot-bundles?limit=5` now. P2-13 will push it instead.

## ✅ P2-11 · Limit and stop-loss orders, cancel, open orders
- **Gate:** G2
- **What was built** (`trading/open_orders.py`, plus changes to `trading/orders.py`):
  - **`POST /trading/orders/open {symbol, side, order_type: limit|stop, qty, price}`** (201) places an order that waits for its price.
    - **Buy limit:** fires when the ask ≤ the limit.
    - **Sell limit** (take-profit): fires when the bid ≥ the limit.
    - **Stop-loss** (sell only): fires when the last price ≤ the trigger. It must be placed below the current price.
  - **`GET /trading/orders/open`** (`?include_closed=true` for history) and **`DELETE /trading/orders/{order_id}`** to cancel. Cancelling a filled order gives `409`, and someone else's order gives `404`.
  - **Reservations:** while open, a buy limit holds back `qty × limit × (1 + fee)` plus a cent a share for rounding, and sell limits and stops hold back their shares.
    - Market orders can't spend reserved cash or sell reserved shares (`"you hold 10 JOKIC (10 reserved for open orders)…"`).
    - The portfolio now shows `reserved_cash` and `available_cash`.
  - **Watcher:** subscribes to market ticks and fires triggered orders as market orders (`reason` = `limit` / `stop`). Their trades get Solana receipts like any order.
  - **Limits never fill past their price.** A buy limit buys in chunks while the ask stays ≤ the limit, and a sell limit sells while the bid stays ≥ it. Whatever doesn't fill stays open and tries again on later ticks.
  - A stop-loss sells at the market once triggered. Its job is getting out, not getting a price.
  - If an order can't fill because of liquidity or the price slipping back, it stays open. Any other error marks it `failed` with a reason.
- **Not done:** buy stops, and one-cancels-the-other pairs (a stop-loss plus take-profit on the same shares). Reservations mean the same shares can't back both. Fine for the demo.
- **Tests:** 23 in `test_open_orders.py`, covering:
  - The watcher stepped by hand: buy, sell and stop fire correctly, limits never fill past their price, and partial fills stay open.
  - Reservations, cancelling, and bad input.
  - The API with the market running, including a stop-loss fired by a real sell-off from another trader.

  169 pass in total, 3 runs in a row.
- **Checked on a live server against real devnet:**
  - A JOKIC buy limit 2 above the ask filled within 1.5 s, and its receipt confirmed.
  - A far-off limit held back 250.30, shown in the portfolio.
  - Selling shares reserved for a stop was refused, and cancelling worked.
  - The stop-loss fired when the price drifted down to its trigger, with its trade receipt queued.

## ✅ P2-12 · Fees, spread and slippage
- **Gate:** G2
- **What was built** (`trading/estimates.py`):
  - **`POST /trading/orders/quote {symbol, side, qty}`** (needs the token, trades nothing) returns:
    - best bid/ask, spread and spread %
    - best price
    - estimated fillable qty, average price, slippage (HOOP and %), notional, fee (0.10%), and total (buy: incl. fee; sell: after fee)
    - available cash, `can_afford_qty` (buys) or `sellable_qty` (sells)
    - `ok`, the 3 makers' quotes, and **plain-English `warnings`**: makers can't fill it all, a big order slips over 1% ("a limit order caps the price you pay"), wide spread, not enough cash, or shares reserved
  - **How it estimates:** the engine's optional `preview_order` (the fake has it, and it's exact). Otherwise it walks the makers' quotes, which is approximate. Person 1 has been asked for `preview_order`.
  - **Actuals after the fill:**
    - Orders return `quoted_best_price` (ask or bid at order time), `slippage` and `slippage_pct`.
    - Each trade stores `quoted_price_cents`, and `GET /trading/trades` shows `quoted_price` and `slippage` per fill.
  - **Database migrations:** `db.py` now adds missing columns to an existing database on startup (`MIGRATIONS`), so schema changes no longer mean deleting `data/trading.sqlite`.
- **Tests:** 16 in `test_estimates.py`, covering:
  - The preview doesn't trade, and **the estimate equals the real order** when no tick falls in between.
  - Bigger orders slip more, plus the warnings and the fallback estimate.
  - The API, actual slippage on orders and trades, and the migration on an old database.

  185 pass in total, 3 runs in a row.
- **Checked on a live server:**
  - Quoting 5 SGA showed no slippage, a 1.65 spread (1.1%) and a 0.75 fee.
  - Quoting 300 SGA showed an average of 158.4743 (5.47% slippage) with a warning.
  - Quoting 700 SGA said only 450 could fill.
  - **The real 300-share buy then filled at exactly 158.4743 / 5.47% / 47.53 fee.**
  - The local database gained the new column on startup.

## ✅ P2-13 · Messages pushed to each user
- **Gate:** G2
- **What was built** (`trading/live.py`, `/trading/ws` in `router.py`):
  - **Connecting:**
    - `ws://<host>/trading/ws?token=<session token>`. Browsers can't set headers on a WebSocket, so the token goes in the URL.
    - **Without a token** you get the public feed only, which suits a projector or spectator screen.
    - A bad token is refused with close code **4401**.
    - Send `ping` or `{"type":"ping"}` to get `{"type":"pong"}`.
  - **Messages** (flat JSON with a `type`, like Person 4's `/learning/ws`):
    - `hello` on connect: `{user_id, public_only, market_time}`
    - `fill`: your order filled. `{order_id, reason: market|limit|stop, status, symbol, side, filled_qty, average_price, total_fee, cash, position_qty, slippage, receipt_status: "pending"}`
    - `open_order`: `{event: placed|fired|filled|cancelled|failed, order_id, symbol, side, order_type, price, qty, filled_qty, remaining_qty, status, reason, last_fill_order_id}`
    - `receipt`: your order's Solana receipt. `{order_id, status: confirmed|failed, signature, explorer_url, confirm_ms}`
    - `bot_bundle` (**public**): a minute of bot trades settled on Solana. `{bundle_id, trade_count, total_volume, minute_t, status, signature, explorer_url, confirm_ms}`
  - **Hub:** one queue per connection. Private messages go only to that player's connections, and public ones go to everyone. Messages from worker threads are handed to the event loop safely, and a stuck client misses messages rather than slowing others down.
  - **Producers:**
    - The order route sends `fill`.
    - Placing or cancelling an open order sends `open_order`.
    - The open-order watcher sends `fill` and `open_order` (fired/filled/failed).
    - The receipt worker sends `receipt` and `bot_bundle` when a receipt confirms or fails.
- **Fixed along the way (receipts, P2-09):** devnet allows only about **10 `getSignatureStatuses` calls per 10 s** (`x-ratelimit-method-limit: 10`). Polling every 0.4 s meant that once anything was in flight, every check got 429 and **nothing confirmed**, which is why the spectator feed was silent on the first live run.
  - The checker now polls every **2 s** and backs off on errors (2 → 4 → 8 → 16 s).
  - Set `SOLANA_STATUS_INTERVAL_S` lower with a dedicated RPC.
  - The cost: displayed `confirm_ms` is now about 2–3 s, because it's measured when we see the confirmation, not when Solana confirmed (under 1 s). **For the demo:** a free dedicated RPC (e.g. Helius) in `SOLANA_RPC_URL` plus `SOLANA_STATUS_INTERVAL_S=0.5` brings it back down.
- **Tests:** 12 in `test_live.py`, covering:
  - The hub: privacy, public broadcast, delivery from another thread, unsubscribe.
  - Connecting with, without, or with a bad token, and ping/pong.
  - Fill then receipt, and placed → filled → receipt for a limit order.
  - Cancel, players seeing only their own updates, and a spectator receiving a real bot bundle.

  The tests use a timeout helper so a missing message fails instead of hanging. 197 pass in total, 3 runs in a row.
- **Checked on a live server against real devnet** with a real WebSocket client (player and spectator, 20 s):
  - fill 0.57 s → open_order placed 0.58 s → fill (limit) and open_order filled 0.71 s → both receipts confirmed 3.8 s
  - bot bundles of 21, 17 and 18 trades reached **both** the spectator and the player
  - no errors
- **For Person 3:** connect once after login and keep the socket open. Show "⏳ settling" on `fill`, flip to "✓ confirmed on Solana" with the Explorer link on the matching `receipt`, and drive a "trades settled on Solana" ticker from `bot_bundle`. Reconnect automatically if the socket drops.

## ✅ P2-21 · TradesAdapter for Person 4
- **Gate:** G2
- **What was built:**
  - **`trading/adapters.py`: `TradesAdapter(db)`**, implementing Person 4's Protocol:
    - `trades_for_user(user_id, since_t=None)`: all fills, oldest first, `t >= since_t`. Fields exactly match their `Trade`.
    - `portfolio(user_id)`: `Portfolio(cash, equity, positions[Position(symbol, qty, avg_cost)])`.
    - `apply_start_state(user_id, cash, positions)`: accepts their `Position` models, or anything with `symbol`/`qty`/`avg_cost`.

    Results are plain dataclasses with their field names, in HOOP floats with `t` in market epoch seconds. Their code needs nothing of ours.
  - **The sub-account question, decided:** missions reset the player's own account, as Person 4's mock does, because the player trades through the normal API with their normal token. To protect real portfolios:
    - **The first reset saves the real account** in `account_snapshots` (cash, positions, profit, fees). Replaying a mission doesn't overwrite it.
    - Open limit/stop orders are cancelled, so nothing stays reserved.
    - Trades are kept (Person 4 reads only the mission window), but **profit/loss restarts from the mission's start**. New `users` columns hold the baseline, the first trade after it, the starting positions, and any carried-over profit/fees, added by migration.
    - **`POST /trading/account/restore`** (and `adapter.restore_start_state(user_id)`) puts the real account back exactly: cash, positions, profit, fees. It returns `404` if no mission reset the account.
  - Short start states (negative `qty`) work since P2-14. Fractional shares and unknown symbols are rejected.
  - `main.py` creates `app.state.trades_adapter`. At merge: `configure_learning(market_adapter, app.state.trades_adapter)`.
- **Tests:** 12 in `test_adapters.py`, covering:
  - Fields, inclusive `since_t`, and the portfolio matching the API.
  - Exact reset, cancelled orders, profit/loss adding up after a reset (including selling shares the mission gave).
  - Restoring after a replayed mission brings back identical cash, positions, profit and fees.
  - Validation, and the restore endpoint.
  - **Against Person 4's real code, pulled from `person4-learning`:** their runtime-checkable `TradesAdapter` Protocol accepts ours, their pydantic `Trade`/`Portfolio` validate our objects, and **their `round_trip` evaluator scores our trades** with a realised profit equal to ours (they put buy fees in cost, we keep fees separate: same money). This skips automatically if that branch hasn't been fetched.

  209 pass in total, 3 runs in a row.
- **Checked on a live server:** the local database gained the new columns and table on startup, and restore with no mission gave the expected 404.
- **Note for Person 4:** see `docs/person2-for-person4.md`.

## ✅ P2-22 · Performance payouts to holders
- **Gate:** G2 (done to finish Gate 2, built on guesses while Person 1's answers are pending)
- **Why:** a share is worth something because holding it earns HOOP from that player's future performances. Players can hold for payouts or sell when the price is good.
- **What was built** (`trading/payouts.py`):
  - **`PayoutProcessor`** listens for the engine's `PerformancePayout(t, symbol, hoop_per_share, game_score, reason)`.
    - It pays **every human holder `qty × hoop_per_share`**, rounded half up to the cent per holder, all in one database transaction.
    - Each payment is a `payouts` row: `payout_id, user_id, symbol, qty_held, hoop_per_share, amount_cents, game_score, reason, t`.
    - Short sellers (negative qty) are charged the same amount (live since P2-14).
  - **Fake market (guessed design):** at each **final whistle** (every 12 market minutes = 1 real minute):
    - About 60% of players "play", scoring around fair value / 5.
    - Each pays **0.02 HOOP per Game Score point per share**. A 30-point game pays 0.60 per share, about 0.4% of a 150 price. Bad games pay 0.
    - `market.final_whistle({"SGA": 31.5})` triggers one exactly, for tests or a demo.
  - **Portfolio:** new `payouts_received`. The exact identity is now **`total_pnl = realised + unrealised − fees + payouts`**. Payouts follow the same "since the latest start" rules as profit, so mission resets start at 0 and restores bring the real account's payouts back (migration columns added).
  - **`GET /trading/payouts`** (`?symbol=`, `?limit=`) lists your payouts, newest first.
  - **Live updates:**
    - Private `payout` to each holder: `{symbol, qty_held, hoop_per_share, amount, cash, game_score, reason}`.
    - Public `payout_announced` to everyone, for a ticker: `{symbol, hoop_per_share, game_score, reason}`.
- **Fixed along the way:** the WebSocket endpoint left an uncollected "client left" error when a client disconnected mid-send, which printed a traceback in the log. Now it's collected, and a send to a just-closed socket counts as a normal disconnect. Checked with 15 rapid connect/trade/disconnect cycles: clean log, server fine.
- **Waiting on Person 1** (question 6 in `docs/person2-for-person1.md`): the real timing, rate, whether bad games cost money, and whether fair value drops after a payout. Only the fake market's constants would change, plus the event if their shape differs.
- **Tests:** 11 in `test_payouts.py`, covering the fake market's payouts and timing, paying the right holders the right amounts, rounding, recording, the profit identity, survival through mission reset and restore, notifications, and the API plus WebSocket end to end. 220 pass in total, 3 runs in a row.
- **Checked on a live server:** holding SGA 20, JOKIC 10, WEMBY 30 and CURRY 15, the first final whistle (59.5 s) paid SGA +10.64 (26.6 GS) and CURRY +7.26 (24.2 GS). JOKIC and WEMBY didn't play. There were 8 public announcements, and the portfolio identity held exactly (−22.25 = 0 − 30.75 − 9.40 + 17.90).

---

## ✅ P2-14 · Short selling and cover
- **Gate:** G3
- **What was built** (`trading/orders.py`, plus `portfolio.py`, `estimates.py`, `open_orders.py`, `resets.py`):
  - **`POST /trading/orders` takes `side: short | cover`.**
    - A short sells shares you don't own. To the engine it's a plain `sell`: a maker buys them with its cash.
    - Your position goes negative, and the proceeds (minus the 0.10% fee) go into your cash.
    - A cover buys them back. To the engine it's a `buy`.
    - Trades are recorded as `short` / `cover`, and their Solana receipts say so (`"side":"short"`).
  - **Long and short don't mix in one player**, as in Person 4's mock. Each of these gets a `400` with a plain message:
    - shorting a player you hold ("sell them before shorting")
    - buying or selling one you're short ("use cover")
    - covering more than you're short
  - **Collateral: 200% of each short's current value is held back from cash.** That's the proceeds plus the same again of your own money.
    - With no leverage, your gross exposure (long + short) can't go over your equity. A test checks this.
    - The hold-back follows the last price, so a rising price ties up more cash.
    - Buys, new shorts and buy-limit reservations can only use **free cash** = cash − open-order reservations − short collateral.
    - Shorts go to the engine in 10-share chunks with a collateral check before each, like buys. If free cash runs out, the order comes back `partially_filled` ("not enough free cash to back this short").
    - **Covering is always allowed**, so you can always get out, even when the price has run away and free cash is negative. (Since P2-15 it borrows if cash runs short.)
  - **Profit/loss is reversed for shorts.** A short's cost basis is what the shares sold for (always positive), and `avg_cost` is the price you sold at.
    - Unrealised = sold for − cost to buy back now. Covering realises it.
    - Market value is negative (you owe the shares), so equity = cash + positions value still holds.
    - The exact identity **`total_pnl = realised + unrealised − fees + payouts`** still holds. A test checks it after 60 random buy/sell/short/cover trades with price shocks.
  - **Portfolio:** positions gain `side: long | short`, and they're sorted by size of exposure. The totals gain `short_collateral`, and `available_cash` now subtracts it (never below 0). `weight_pct` is negative for shorts.
  - **Order ticket estimate** (`POST /orders/quote`): short is priced at the bid and cover at the ask. It shows `position_qty`, `can_afford_qty` for short/cover, wrong-side warnings, and always "if the price rises, your loss keeps growing…" on a short.
  - **Open orders:** no buy limits while short, and no sell limits or stops on a short. Buy limits can't reserve cash that's backing a short.
  - **Payouts:** shorts pay them (negative `payouts` rows), as planned in P2-22.
  - **Missions:** `apply_start_state` accepts shorts (negative `qty`, `avg_cost` = price sold at). The starting equity marks them at that price, and restore works.
- **Not done:** cover-stops (a buy stop that closes a short: the "stop-loss" for shorts) and borrow fees. Margin calls arrived in P2-15.
- **Still to confirm with Person 1** (question 4): that their engine accepts sells from humans with no holdings. The fake does.
- **Tests:** 25 in `test_shorts.py`, covering:
  - Shorting before a drop makes money. The loss keeps growing while the price rises, past what the short sold for.
  - Partial covers, collateral (twice the value, follows the price, caps shorts, blocks buys), gross exposure ≤ equity, and covering when under-collateralised.
  - Wrong-side refusals with no trades made, open-order rules, payouts charged to shorts, the estimate equalling the real short, missions with a short start state, and the API plus the receipt's side end to end.

  245 pass in total, 3 runs in a row.
- **Checked on a live server** (receipts off):
  - Shorted 40 WEMBY: estimated 103.2125, filled at exactly 103.2125. Cash rose to 104,124.37 and 8,204 was held back as collateral.
  - The position showed `short`, −40, market value −4,102.
  - Buy, sell and over-cover were refused with clear messages.
  - Covered 40 after the market moved. `total_pnl` −26.17 = −17.90 realised − 8.27 fees, exactly.

## ✅ P2-15 · 3x leverage and margin calls
- **Gate:** G3
- **What was built** (`trading/margin.py`, plus `orders.py`, `estimates.py`, `router.py`, `main.py`):
  - **Leverage:** `POST /trading/orders` and `/orders/quote` take `leverage: 1–3` (default 1) for buys and shorts. Sells and covers only reduce exposure, so it doesn't apply to them.
    - **Buying power = leverage × equity − gross exposure − cash reserved for buy limits.** Gross exposure is every position's value, long or short, at the last price.
    - At 1x that's exactly P2-14's free cash (cash − reservations − 200% of shorts), so unleveraged players see no change.
    - At 3x, exposure can reach three times equity. A leveraged buy **borrows**: cash goes negative (a margin loan). The portfolio shows it as `margin.borrowed`.
    - Over the limit you can't add (`400 "not enough buying power, even with leverage"`), but selling and covering always work.
  - **Margin ratio = equity ÷ gross exposure.** A fresh 3x position is about 33%. Unleveraged long-only accounts sit at 100% or more and are never margin-called.

    | Margin ratio | Status | What happens |
    |---|---|---|
    | 30% or more | `ok` | nothing |
    | under 30% | `warning` | heads-up message |
    | under 25% | `margin_call` | sell or cover within 3 market minutes (15 real seconds) |
    | under 20%, or the call runs out | liquidation | positions sold for you |

  - **`MarginMonitor`** checks every account with positions on each market tick (like the open-order watcher).
    - Improving a status needs a point of headroom (31% to leave `warning`), so a ratio wobbling on a line doesn't flood the player with messages.
    - Status and the margin call's start are stored on the user (migration columns), and mission resets/restores clear them.
  - **Liquidation:** cancels the player's open orders, then closes positions biggest first at the market until the ratio is back to 35%.
    - Trades are recorded with `reason="liquidation"` and get Solana receipts.
    - If equity is zero or less, everything is closed. Cash can stay negative: the player owes the loss.
    - Shorts are covered the same way, so a short squeeze liquidates too.
  - **API:**
    - `GET /trading/margin` returns `status, margin_ratio_pct, leverage, gross_exposure, borrowed, buying_power, buying_power_max, max_leverage, warning_pct, maintenance_pct, liquidation_pct, margin_call_deadline_t`. That's everything a margin bar needs.
    - The portfolio includes the same block as `margin`.
    - Orders return `leverage`. Leveraged estimates warn "every 1% the price moves against you costs 3% of what you put in…".
  - **WebSocket:** private `margin` messages on each change: `{event: warning|margin_call|liquidated|ok, status, message, margin_ratio_pct, equity, gross_exposure, cash, deadline_t, warning_pct, maintenance_pct, liquidation_pct, liquidated[{order_id, symbol, side, qty, average_price}]}`. Each liquidation order also sends a normal `fill` with `reason: "liquidation"`.
- **Not done:** interest on margin loans, and a way to top up a margin call other than selling (there's no deposit in the game).
- **Tests:** 25 in `test_margin.py`, covering:
  - The status bands and headroom, and buying power (1x and 3x).
  - A 3x buy borrowing, 3x shorts, no adding while over-leveraged but always reducing.
  - **The storm, 1% at a time: warning → margin call (with deadline) → still time at 179 s → liquidated at 180 s**, with receipts queued and `fill`/`margin` messages.
  - Fixing it in time cancels the call. A gap under 20% liquidates at once, selling only what's needed. Wiped-out equity closes everything, and a short squeeze covers.
  - Open orders cancelled, unleveraged accounts never called, mission reset clearing the status, and the API plus a live WebSocket liquidation.

  270 pass in total, 3 runs in a row.
- **Checked against the live, ticking app** (receipts off), with a player at 3x on WEMBY (5,000 HOOP equity, 138 shares, 2.87x, 9,924 borrowed):
  - **Injury gap:** fair value −25% and a panic seller dumping 150 took the price from 108 to 82. The player was liquidated on the next tick (99 shares) and margin went back to 36%.
  - **Slower slide:** a margin call at 22%, then 15 s later 54 shares were liquidated, margin went back to 36.7%, and the status returned to `ok`. An even slower run showed the 28.7% warning first.

## ✅ P2-16 · Equity history
- **Gate:** G3
- **What was built** (`trading/equity.py`):
  - **`EquityRecorder`** listens to market ticks and, on the first tick of each market minute (every 5 real seconds), saves one `equity_snapshots` row per active account: `t, equity, cash, positions_value, baseline`.
    - Shares are marked at the last price, exactly like the portfolio, so shorts count negative and borrowed cash shows as negative cash.
    - "Active" = has traded or holds a position. Untouched guests sit flat at 100,000, so they're skipped.
    - One query per table per minute, so it stays cheap with many players.
  - **Mission reset and restore save a point straight away**, so a mission's window starts with its true starting equity. `POST /account/restore` is now `async`, since it reads prices.
  - **`max_drawdown(points)`**: the biggest fall from a running peak to a later low, in HOOP and as % of that peak, with the peak and trough times. The API, the report card and Person 4 all use the same rule.
  - **`GET /trading/equity-history`** (`?since_t=` inclusive, `?limit=` most recent N) returns:
    - `points[{t, equity, cash, positions_value, total_pnl}]`, oldest first
    - `current_equity` (live), `start_equity`, `return_pct`, `peak_equity`
    - `max_drawdown`, `max_drawdown_pct`, `max_drawdown_peak_t`, `max_drawdown_trough_t`

    The drawdown includes equity right now, so a fall in progress counts.
  - **For Person 4:** `TradesAdapter.equity_history(user_id, since_t=None)` returns `EquityPoint(t, equity)` in HOOP floats. It's not in their Protocol, like `restore_start_state`.
- **Tests:** 13 in `test_equity.py`, covering:
  - Max drawdown: the biggest fall, a deeper later fall winning, and no fall at all.
  - Exactly one point per market minute, matching the portfolio to the cent. Idle guests skipped, closed-out accounts still recorded, `since_t` and `limit`.
  - Reset and restore points.
  - **The 'done when': a mission storm, then Person 4's float maths on `adapter.equity_history` gives the same max drawdown as ours.**
  - The API, and the live app recording on the minute.

  283 pass in total, 3 runs in a row.
- **Checked on a live server** (receipts off): a guest bought 120 WEMBY at 3x and shorted 40 JOKIC.
  - About 21 s later the history had 4 points exactly 60 market seconds apart.
  - It showed equity 100,057.58 → 100,136.78 (peak) → 99,996.78 → 99,975.18, a max drawdown of 161.60 (0.16%) from the right peak to the right trough.
  - `since_t` filtered correctly, only the one active account was recorded, and the log was clean.

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
