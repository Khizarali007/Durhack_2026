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
- **No NBA logos or headshots.** Use player initials and team colours only
- Tone is silly and weather-forecast flavoured (sirens, a shouting trader, "chance of margin calls"), but UI labels must stay clear
- Every jargon term (bid, ask, spread, slippage, limit, stop-loss, margin, leverage, short, fair value) gets a "?" tooltip. Person 4 supplies the glossary drawer and tooltip content, so use their component once it exists
- Headlines about real players stay mild. Never show off-court, legal or medical detail
- Must work on a phone with no explanation, on a laptop, and on a projector (large fonts, high contrast mode)
- A stranger should understand the screen within a few seconds. Default screen should not be a wall of 300 rows

## Code conventions
- Small, single-purpose components in `src/components/`. Shared state in one place (context or a small store), not prop-drilled through five levels
- Person 4's components live in `src/components/learning/` (Mission panel, Composition panel, report card, glossary, tooltips). Do not edit that folder unless I say so. Leave clean mount points for them in the layout
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
Look and feel: modelled on a modern retail broker app (clean, spacious, beginner-friendly), with reference screenshots in docs/design-refs/. Copy the layout patterns and feel, NOT any brand assets. Our brand is HoopStreet: own name, own colours, own wordmark, never another company's logo or name.
- Desktop: three columns. Left = market list/watchlist, centre = chart + player card, right = order ticket. Below the chart, tabs for Positions / Open orders / History. Selecting a player updates chart, card and ticket together.
- Mobile: bottom nav (Home / Market / Portfolio / Learn). Single-stock page = chart + stats, with sticky Buy and Sell buttons that open a bottom-sheet ticket.
- Progressive disclosure: the ticket defaults to a simple market order. Limit, stop-loss, short and leverage sit behind tabs, never all visible at once.
- Always visible: current price, cash, and cash tied up in pending orders.
- Dark theme by default, with a light theme toggle. Green = up, red = down.
- Use CSS variables for every colour, spacing and radius value (design tokens), so the whole look can be re-themed in one file.
- Generous whitespace, one accent colour, rounded cards, large readable numbers, tabular numerals for prices.