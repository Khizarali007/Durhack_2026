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
