# Minimal market demo

Open http://127.0.0.1:8000/demo/ . The page uses the original replay graph styling,
with the live backend and a compact buy/sell box. No frontend build is needed.

```sh
SOLANA_RECEIPTS=off MARKET_START_PAUSED=1 MARKET_DAY_SECONDS=60 .venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Search a player, compare up to four, and switch between dollars and percentage
change since opening. Solid lines are executed trade prices; the dashed line is
the main player's formula value. Ability, form and expected next payout appear
below the chart. Prices may remain flat until a trade executes.

Click **Start with $100,000**, enter a whole number of shares, then **Buy** or
**Sell**. The result shows executed quantity, average price and fees. Cash,
portfolio equity, selected-player holdings, paid dividends and pending rights
refresh automatically. Buy/sell actions use actual market orders against the
local simulation, not frontend-generated balances.

Drag the market-day slider to move the actual simulation. Forward jumps preserve
accounts and process intervening trades and payouts. Backward jumps rebuild the
market from the original seed and reset **all** accounts, orders and balances.
Every jump lands paused; press Play to continue. Choose 1×, 5×, 20× or 50× speed.
Long jumps take time because all intervening ticks are processed; progress is shown.
Trading is blocked during a jump. Controls are local-only and seeks require
Solana writes to be disabled.

Daily chart history comes from the backend and survives page reloads within the
same session; recent live observations add detail. The baseline speed is one day
per 60 seconds. Noon records payout rights; day close settles them. All money is
virtual. Rewinding also reconnects the chart to the new session.

The previous detailed tabs were removed at the user's request. Limit/stop orders,
leaderboard, bot audit and other backend features remain available through `/docs`.
The separate offline full-season graph on port 8765 is unchanged.

Files: `web/demo/index.html`, `web/demo/style.css`, `web/demo/app.js`.
Verified the simplified page in-browser: guest creation, buy ten/sell two shares,
holdings and cash updates, player switching, percentage scale and formula overlay.
Backend code was unchanged by the simplification; its previous regression run
passed 340 tests with three optional devnet tests skipped.

Timeline validation: 336 backend tests passed (three optional devnet tests skipped);
five model tests passed. Targeted integration checks also verify payout settlement,
limit-order execution during a seek, invalid targets, reset authentication and
pause/resume. Browser checks confirmed forward seeking with shares/payouts,
rewinding with account reset, restored daily history and 20× playback.

## First purchase, wallet and faster replay

New accounts begin on a first-purchase screen: choose any player and quantity,
review the approximate cost, and buy with $100,000 virtual starting cash. A
successful fill opens the market. A zero-fill or invalid purchase stays on the
first screen. The wallet separates available cash, share value, total wealth
and paid dividends; pending and reserved money are explained separately.
Purchase/sale confirmations show cash movement including fees. Payout increases
show a prominent banner and automatically expand a scrollable payment ledger
with player, time, shares, per-share rate and amount. Polling is every three
seconds, so fast playback can group multiple payments into one banner; individual
payments remain itemized. Rewind clears this UI and returns to the first purchase.

Replay supports up to 500× target speed, subject to CPU limits. Unchanged quotes
are cached by their economic inputs. Full conservation checks run every 120 ticks,
at payout settlement, and after seeks rather than scanning every player every
tick. Browser market updates are capped at five per second; internal orders still
receive every tick. The bot cadence, price model and payout rules are unchanged.
A same-seed five-day benchmark took 3.16s before and 0.66s after (4.79× faster),
with identical final quotes and institutional cash.
