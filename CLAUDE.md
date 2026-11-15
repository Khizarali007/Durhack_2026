# HoopStreet frontend (Person 3: trading terminal)

HoopStreet is an NBA player stock-exchange game built for DurHack 2026. Every NBA player is a "stock" priced in fake HOOP currency. It is a *simulator for investing*: no real money, every price is explained, and players are graded on how they invest, not just what they made. Tagline: "Cloudy with a chance of margin calls."

This file covers the **frontend only**. I own it on the `frontend` branch. Person 4 adds learning-layer components into this same React app, so keep the structure modular.

## Stack
- React + Vite (JavaScript or TypeScript: follow whatever the repo already uses)
- TradingView `lightweight-charts` for candlestick charts
- WebSocket client (price ticks at 2 Hz) + REST calls
- Plain CSS or CSS modules. No heavy UI framework unless I ask
- Must build to a static bundle (`npm run build`) that the Python backend serves from a single URL

## Backend (built in parallel by others, not in my scope)
- Person 1: market engine and data (FastAPI, SQLite). Provides players, candles, events (REST) and ticks, live candles, best bid/ask, the 3 market-maker quotes, radar states, final-whistle lines (WebSocket)
- Person 2: accounts, trading, Solana receipts. Provides signup, login, guest, place/cancel order, portfolio, leaderboard, and receipt status
- **Until the real API exists, build against mocks** in `src/mocks/` that match the agreed API contract. All network code goes through `src/api/` (REST client and WebSocket hook) so switching mock to real is a one-file change. Never scatter `fetch` calls through components
- Never invent backend behaviour. If a field or endpoint is missing from the contract, list it as a question for Person 1 or 2 instead of guessing silently

## Game facts the UI must reflect
- 300 stocks: 30 teams x top 10 players. Start with 100,000 HOOP
- Month 1 is shown as price history. Month 2 replays as if live. The last history candle is labelled "now"
- Clock: 1 market minute = 5 real seconds. UI updates every 0.5 s. A new 1-minute candle forms every 5 s
- Price = last trade, from an order book with 3 market makers. Each player card shows **Price vs Fair value** and a hype %, e.g. "Price 42 · Fair value 35 · +20% hype"
- Every price move has a "Why did it move?" chip (latest final whistle, event, or buying pressure)
- Trade receipts show "settling" then "confirmed on Solana in 0.6 s" with an Explorer link. Trades never wait for Solana
- Storm Radar: a weather icon per player (calm / cloudy / storm)

## Priorities
- **[G1] by H+4:** market list (300 stocks, search, team filter), chart (history + live candle, timeframe buttons), player card, "Why did it move?" chip, market buy/sell ticket showing best bid/ask and the 3 market-maker quotes, portfolio screen
- **[G2] by H+8:** limit and stop-loss on the ticket, spread/slippage/fee shown before confirm, open orders with cancel, sign-up/login/"Play as guest", Solana receipt state, headline ticker + final-whistle ticker + event markers on the chart, "Top movers" as the default screen
- **[G3] by H+14:** short/cover and 3x leverage on the ticket, margin bar and margin-call/liquidation state, Storm Radar widget, leaderboard, mobile layout and projector mode
- **Do not start [G2] until every [G1] item works end to end. Do not start [G3] until [G2] is done.**
- Out of scope for everyone: Phantom wallets, real money, live 2026-27 data

## Content and design rules
- **No NBA team logos.** Per the user’s 15 November request, use ESPN player headshots keyed by ESPN athlete ID, with equal dimensions and initials/team-colour fallback.
- Tone is silly and weather-forecast flavoured (sirens, a shouting trader, "chance of margin calls"), but UI labels must stay clear
- Every jargon term (bid, ask, spread, slippage, limit, stop-loss, margin, leverage, short, fair value) gets a "?" tooltip. Person 4 supplies the glossary drawer and tooltip content, so use their component once it exists
- Headlines about real players stay mild. Never show off-court, legal or medical detail
- Must work on a phone with no explanation, on a laptop, and on a projector (large fonts, high contrast mode)
- A stranger should understand the screen within a few seconds. Default screen should not be a wall of 300 rows

## Code conventions
- Small, single-purpose components in `src/components/`. Shared state in one place (context or a small store), not prop-drilled through five levels
- Backend facts live in docs/backend-contracts.md
- Person 4's components live in `src/learning/` (Mission panel, Composition panel, report card, glossary, tooltips). Do not edit that folder unless I say so. Leave clean mount points for them in the layout
- Keep the app shell and layout files (`App`, routing, layout) minimal and stable, since two people depend on them
- WebSocket handling: reconnect automatically, ignore malformed messages, and never let one bad tick crash the UI
- Charts: update the live candle incrementally with `series.update()`. Do not reset all data on every tick
- Format money and percentages through one helper so they look consistent everywhere
- No secrets or API keys in the frontend, ever

## Workflow
- Work on the `frontend` branch. Commit after each working feature with a clear message. Do not push to `main` directly
- Run `npm run dev` to test. Before telling me something is done, run `npm run build` and fix any errors or warnings
- After each feature, give me a 2-3 line summary of what changed and which files, so I can explain it in the demo
- When a task is ambiguous or needs a backend field that may not exist, ask me instead of assuming

## Commands
- `npm install`: install dependencies
- `npm run dev`: local dev server
- `npm run build`: production bundle (must succeed before every merge)

## Visual design direction

Target: a modern retail broker terminal (clean, spacious, beginner-friendly), in the spirit of Trading 212's web platform. Copy the layout patterns and the feel, never brand assets. Our brand is HoopStreet: our own name, colours and wordmark. Never another company's logo, name or colours.

**This app is built for a laptop screen only.** Optimise for 1280-1920px wide. Do not build mobile layouts, bottom navigation, bottom sheets or touch-first patterns. A narrow window may look cramped, and that is acceptable. Still include a projector mode (larger fonts, higher contrast) for the demo.

### Layout

Three columns on every trading screen, full viewport height, no page scrolling of the whole app. Each panel scrolls internally.

- **Header**, 56px tall, fixed: HoopStreet wordmark left; market clock centre ("Day 2 · 14:32"); cash, equity and today's P&L right; user menu far right.
- **Left column**, 280-320px fixed: the market list / watchlist. Scrolls internally.
- **Centre column**, flexible, takes the remaining width: player card on top (about 120px), chart filling the rest, with a tab strip beneath it for Positions / Open orders / History.
- **Right column**, 320-360px fixed: the order ticket, pinned, always visible, never a modal.
- Selecting a player in the left column updates the centre and right columns together. No page navigation.
- Portfolio, Leaderboard and Learn are full-width pages without the three-column split.

### Market list rows

One row, 44-48px tall: a 32px rounded square with the player's initials in their team colour, then name (medium weight) with team beneath in small muted text, then price right-aligned, then % change right-aligned in a small coloured pill. Hover gives a subtle background change. The selected row gets a left accent border plus a raised background.

### Order ticket

- Buy / Sell as a two-button segmented control at the top, filling the width. Buy is green, sell is red, only the active one is filled.
- Order type as a quiet tab row underneath: Market / Limit / Stop-loss (and later Short / Cover).
- Quantity input, large, with a stepper. Below it, estimated cost in large type.
- A bordered box showing best bid and best ask side by side, with the three market-maker quotes beneath in small muted rows.
- A cost breakdown (spread, slippage, fee), collapsed by default, each line with a "?" tooltip.
- One large confirm button at the bottom, full width, 44px tall.

### Colours and tokens

Define everything as CSS variables in one file so the whole look can be re-themed in one place.

- Dark theme by default, light theme toggle.
- Dark: page background near-black but not pure black (around #0D1117), panels one step lighter (around #161B22), borders subtle (around #30363D).
- Up is green, down is red, and both need a muted "pill" variant for backgrounds as well as a solid text variant.
- One accent colour for primary actions and the active state. Pick something that is not green or red, so it never reads as a price move.
- Muted text for labels, bright text for numbers.

### Typography

- One sans-serif family throughout (Inter or the system stack).
- **All prices, percentages and quantities use tabular numerals** (`font-variant-numeric: tabular-nums`), so digits don't jitter as prices tick.
- Prices are the largest text on any panel. Labels are small, muted and uppercase with slight letter-spacing.

### Motion

- Price changes flash the background green or red for about 200ms, then fade. Never animate layout, because things that move while you read them are hostile in a trading UI.
- No loading spinners on live data. Show the last value and a subtle stale indicator instead.

### Rules that don't bend

- Player identity uses full names and ESPN headshots (15 November user override); use initials and team colours when unavailable. Do not copy image binaries into the repo.
- Always visible on screen: current price, cash, and cash tied up in pending orders.
- Progressive disclosure: the ticket defaults to a simple market order. Limit, stop-loss, short and leverage live behind tabs, never all on screen at once.
- Every jargon term gets a "?" tooltip.
- Silly copy is welcome in headlines, tickers and debriefs. UI labels and numbers stay plain and clear.
