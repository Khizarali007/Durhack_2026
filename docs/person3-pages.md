# HoopStreet frontend: page plan (Person 3)

Every screen I need to build, with each one's contents by gate, and a coverage matrix at the end proving the full set covers every Person 3 requirement in the plan.

Gates: **[G1]** by H+4 · **[G2]** by H+8 · **[G3]** by H+14 · **[S]** stretch.

Routes in total: 7 shipped pages, 1 dev-only page, 1 proposed. Plus the app shell and 8 global overlays, which are not pages but must exist.

---

## P0. App shell [G1]

Not a page, but everything else hangs off it, so build it first.

- Header: HoopStreet wordmark, market clock ("Day 2 · 14:32 market time"), cash and equity always visible, user menu
- Navigation: desktop left rail or top bar; mobile bottom nav with Home / Market / Portfolio / Learn
- Slots for the global overlays listed at the bottom of this doc
- Dark theme by default, light theme toggle, projector mode toggle **[G3]**
- Connection status: a small indicator plus a friendly "reconnecting" state when the WebSocket drops

**Prompt:** `Build the app shell: header with wordmark, market clock, cash and equity; desktop nav rail and mobile bottom nav (Home, Market, Portfolio, Learn); routing for all pages in docs/person3-pages.md with placeholder page components; global overlay slots; and a WebSocket connection indicator. Match the design foundation. No page content yet.`

**Done when:** every route loads an empty page, nav works on desktop and a 375px phone, and killing the backend shows the reconnecting state instead of a blank screen.

---

## P1. Home — Top Movers · `/` [G1 basic, G2 full]

The first thing a judge sees. The plan makes "Top movers" the default screen specifically so 300 stocks don't clutter the UI.

**[G1]**
- Account strip: cash, equity, P&L in money and %
- Top 5 gainers and top 5 losers as cards: initials badge in team colours, name, price, % change
- One line of plain-English framing so a stranger knows what this is

**[G2]**
- Headline ticker along the top
- Mission prompt card (Person 4 mount): "Mission 1: Buy low, sell high"

**[G3]**
- Storm Radar summary widget: "2 stormy · 7 cloudy", tapping through to those players

**Prompt:** `Build the Home / Top Movers page: account strip (cash, equity, P&L), top 5 gainers and top 5 losers as cards with initials badges in team colours, price and % change, updating live from the tick stream. Add a one-line explanation of what HoopStreet is for first-time visitors. Leave a marked mount point for Person 4's mission prompt card.`

**Done when:** a stranger landing here understands the app within about five seconds and reaches a chart in one tap.

---

## P2. Market · `/market` [G1]

The full list of 300. This is the page the plan's risk table worries about, so search and filter are not optional.

- All 300 rows: initials badge in team colours, name, team, price, % change (green up, red down)
- Search box, matching on player name and team
- Team filter across all 30 teams
- Sort by % change, price or name
- Radar weather icon per row **[G3]**
- Row click opens P3

**Performance note:** 300 rows updating twice a second will tank a naive implementation. Virtualise the list and make each row subscribe only to its own symbol.

**Prompt:** `Build the Market page: a virtualised list of all 300 stocks with initials badge in team colours, name, team, price and % change, updating live at 2 Hz. Add a search box (fuzzy on name and team), a team filter for all 30 teams, and sorting by % change, price and name. Rows must not re-render the whole list on every tick. Clicking a row navigates to the stock page.`

**Done when:** scrolling is smooth with all 300 live, searching "luk" finds Luka, and filtering to one team shows its 10 players.

---

## P3. Stock / trade terminal · `/stock/:symbol` [G1 → G3]

The main page, and where most of the demo happens. Build it in gate layers rather than all at once.

**Layout:** desktop is three columns (market list left, chart and card centre, order ticket right). Mobile is a single column with sticky Buy and Sell buttons opening a bottom-sheet ticket. Selecting a player updates the card, chart and ticket together.

**[G1]**
- Player card: initials and team colours (no NBA logos or headshots), name, team, position
- "Price 42 · Fair value 35 · +20% hype", coloured by whether price sits above or below fair value, with the price flashing on each tick
- "Why did it move?" chip showing the reason from the tick data
- Chart: month-1 history plus the live candle updating incrementally, timeframe buttons (1m / 5m / 1h / 1d), last history candle labelled "now"
- Order ticket: market buy/sell, quantity, best bid, best ask, all 3 market-maker quotes, estimated cost, a clear message when cash is short

**[G2]**
- Ticket tabs: Market / Limit / Stop-loss, with the extra fields each needs
- Cost breakdown before confirm (spread, slippage, fee), then the actuals shown next to the estimate after the fill
- Event markers on the chart for injuries, hot streaks, rest days and trade rumours; clicking one shows its headline
- Final-whistle lines for this player ("SGA 38 pts, 7 ast")
- Your position in this stock, and your open orders on it

**[G3]**
- Short and Cover tabs, 1x/3x leverage selector, a visible warning panel and the margin requirement before confirm
- Storm Radar icon on the card plus an early-warning banner when this player goes cloudy
- Trading halt state after a 20% move **[S]**

**Prompts (one per gate, not one for the page):**
1. `Build the stock page [G1] layout and player card: three-column desktop, single-column mobile with sticky buy/sell. Card shows initials in team colours, name, team, position, "Price X · Fair value Y · +Z% hype" coloured by the gap, a price that flashes on tick, and a "Why did it move?" chip.`
2. `Add the lightweight-charts candlestick chart: month-1 history plus a live candle updated with series.update(), timeframe buttons, and the last history candle labelled "now". Switching players must clean up properly with no duplicate candles or leaks.`
3. `Add the market order ticket: buy/sell toggle, quantity, best bid, best ask, the 3 market-maker quotes, estimated cost, validation, and a disabled state with a clear message when cash is short. On mobile it opens as a bottom sheet.`
4. `[G2] Add Limit and Stop-loss tabs to the ticket, and a cost breakdown (spread, slippage, fee) before confirm, with actuals shown after the fill.`
5. `[G2] Add event markers on the chart and a final-whistle line display for this player.`
6. `[G3] Add Short and Cover tabs and a 1x/3x leverage selector, with a warning panel and the margin requirement shown before confirm.`

**Done when:** the full loop works on a phone with no explanation — browse, open, buy, see it in the portfolio, sell.

---

## P4. Portfolio · `/portfolio` [G1 → G3]

**[G1]**
- Cash, total equity, P&L in money and %
- Holdings table: quantity, average cost, current price, P&L per holding, updating live
- A friendly empty state that nudges a first trade

**[G2]**
- Composition panel (Person 4 mount): % by team and by player, grade A–F
- Tabs: Holdings / Open orders / History
- Open orders with cancel, handling an order that fills while you're looking at it
- History rows showing the Solana receipt status and an Explorer link

**[G3]**
- Equity-over-time chart
- Margin bar with safe / warning / danger states
- Short positions shown distinctly from long ones
- Entry point to the report card (Person 4)

**Prompt [G1]:** `Build the Portfolio page: cash, total equity, P&L in money and percent, and a holdings table with quantity, average cost, current price and P&L per holding, all updating live from ticks. Add a friendly empty state. Leave a marked mount point for Person 4's Composition panel.`

**Done when:** at G2, a portfolio that is 60% Spurs shows a D in the Composition panel. That's the demo beat at 0:50.

---

## P5. Leaderboard · `/leaderboard` [G3]

- Rank, username, equity, return %
- A "verified on chain" badge on rows whose data came from the chain
- The current user's row highlighted
- Falls back to the off-chain list if the chain read fails, rather than showing an error

**Prompt:** `Build the Leaderboard page: rank, username, equity and return %, with a chain-verified badge where the data came from Solana and the current user's row highlighted. If the chain read fails, fall back to the off-chain leaderboard silently.`

---

## P6. Learn / Missions · `/learn` [G1 shell, G3 full]

Person 4 owns the content. I own the route, the layout, the mount points and the mobile tab, so their components have somewhere to land from the start.

- Mission list of all 6, with locked / unlocked / passed state
- Active mission panel: goal, hint, debrief
- Report card: Composition, Storm handling, Hype discipline, Return
- Coach Hoops button
- Entry point to the glossary drawer

**Prompt [G1]:** `Build the Learn page shell: a layout with clearly marked mount points for Person 4's mission list, active mission panel, report card and Coach Hoops button. Render a placeholder in each. Add it to the mobile bottom nav.`

**Done when:** Mission 1 renders inside my shell at G1, and all six plus the report card by G3.

---

## P7. Join / auth · `/login`, `/signup`, guest [G2]

A judge scanning a QR code lands here, so guest has to be the loudest thing on the screen.

- One landing gate: a large "Play as guest" button, with login and sign up smaller beneath
- Sign-up: username and password, validation, clear errors
- Guest: one tap, straight in with 100,000 HOOP, no form
- Session stored, username shown in the header, log out in the user menu

**Prompt:** `Build the join screen: a prominent "Play as guest" button with smaller login and sign-up options, plus sign-up and login forms with validation and clear errors. Store the session, show the username in the header, and add log out. Guest must be a single tap into a funded account.`

**Done when:** scanning the QR to placing a first trade takes under 10 seconds on a phone.

---

## P8. Styleguide · `/styleguide` [G1, dev only]

Tokens and base components in both themes. Keep it out of the nav. This is where the Trading 212 look gets fixed once, so every later page inherits it.

---

## P9. Director / demo control · `/director` [PROPOSED — confirm with Person 1]

Someone has to trigger the Wembanyama storm live on stage. The plan gives the scenario director to Person 1, but doesn't say who gives it a button.

- Start the replay on a chosen day, pause and resume
- Fire a scripted event on demand
- Reset the market for a re-run

**Confirm with Person 1 before building.** If they expose the director as an API, this is roughly 30 minutes of my time and removes the biggest demo risk. If they're driving it from a terminal, skip it.

---

## Global overlays (not pages, but required)

| Overlay | Gate | Where it lives | Owner |
|---|---|---|---|
| Trade receipt toast: "settling" → "confirmed on Solana in 0.6 s" + Explorer link | G2 | Global | Me |
| Headline ticker | G2 | App shell | Me |
| Final-whistle ticker (real box-score lines) | G2 | App shell | Me |
| Early warning / storm alert banner | G3 | Global | Me |
| Margin call and liquidation banner | G3 | Global | Me |
| Glossary drawer | G3 | Global, opened from "?" | Person 4 |
| "?" tooltips on every jargon term | G3 | Everywhere | Person 4 content, my mounting |
| Projector mode toggle: big fonts, high contrast | G3 | App shell | Me |
| Siren and storm visual effects | S | Global | Person 4 audio, my visuals |
| Connection lost / backend down state | G1 | App shell | Me |

---

## Coverage matrix

Every Person 3 feature line from the work-split doc, and where it gets built. If every page above is finished, this list is complete.

| # | Requirement | Gate | Lives in |
|---|---|---|---|
| 1 | Market list of 300 with price and % change, search, team filter | G1 | P2 |
| 2 | Chart: month-1 history + live candle, timeframe buttons, last candle "now" | G1 | P3 |
| 3 | Player card: price vs fair value + hype, initials and team colours | G1 | P3 (compact form in P1, P2) |
| 4 | "Why did it move?" chip | G1 | P3 |
| 5 | Order ticket: market buy/sell, best bid/ask, 3 market-maker quotes | G1 | P3 |
| 6 | Portfolio screen: cash, equity, P&L, holdings | G1 | P4 |
| 7 | Ticket additions: limit, stop-loss, spread/slippage/fee before confirm | G2 | P3 |
| 8 | Open orders with cancel | G2 | P4 (also on P3 for the current stock) |
| 9 | Sign-up, login, "Play as guest" screens | G2 | P7 |
| 10 | Trade receipt state: settling → confirmed, Explorer link | G2 | Receipt toast + P4 history |
| 11 | Headline ticker, final-whistle ticker, event markers on chart | G2 | App shell + P3 |
| 12 | "Top movers" as the default screen | G2 | P1 |
| 13 | Short/cover and 3x leverage on the ticket | G3 | P3 |
| 14 | Margin bar, margin-call and liquidation state | G3 | Banner + P4 |
| 15 | Storm Radar: weather icon per player, radar widget | G3 | P1 widget, P2 icons, P3 card |
| 16 | Leaderboard screen | G3 | P5 |
| 17 | Mobile layout and projector mode | G3 | Cross-cutting: every page + shell |
| 18 | Mount Person 4's learning components | G1→G3 | P6, P4, global |
| 19 | Production build served from one URL | — | Build config |

### Demo script check

| Time | Beat | Covered by |
|---|---|---|
| 0:00 | Hook, 100k HOOP, 300 players, a month of history | P1, P3 chart |
| 0:20 | Judge joins by QR or guest, buys, sees the Solana receipt | P7, P3 ticket, receipt toast |
| 0:50 | Portfolio is 60% Spurs, Composition panel shows a D | P4 |
| 1:10 | Early warning, radar cloudy, final whistle, siren, price gaps down, stop-loss survives, 3x margin-called, short profits | P3, storm banner, margin banner, P4 |
| 1:50 | Final whistle lands real box scores, ticker shows real lines | Final-whistle ticker, P3 |
| 2:20 | Mission debrief, report card, Coach Hoops | P6 |

---

## Build order

| Order | What | Gate | Rough time |
|---|---|---|---|
| 1 | Design foundation + P8 styleguide | G1 | 45 min |
| 2 | Mock data layer | G1 | 30 min |
| 3 | P0 app shell with all routes stubbed | G1 | 45 min |
| 4 | P2 Market | G1 | 45 min |
| 5 | P3 card + chart | G1 | 60 min |
| 6 | P3 market ticket | G1 | 45 min |
| 7 | P4 Portfolio | G1 | 40 min |
| 8 | P1 Home (basic) + P6 Learn shell | G1 | 30 min |
| — | **Gate 1 check, then merge Person 4's first components** | | |
| 9 | Swap mocks for the real backend | — | 30 min |
| 10 | P7 Join / auth | G2 | 40 min |
| 11 | P3 order types + cost breakdown | G2 | 50 min |
| 12 | Receipt toast + P4 open orders and history | G2 | 40 min |
| 13 | Tickers + chart event markers | G2 | 40 min |
| 14 | P1 full Top Movers | G2 | 25 min |
| — | **Gate 2 check, merge Person 4 again** | | |
| 15 | P3 short, cover and leverage | G3 | 45 min |
| 16 | Margin bar and banners | G3 | 35 min |
| 17 | Storm Radar across P1, P2, P3 | G3 | 35 min |
| 18 | P5 Leaderboard | G3 | 30 min |
| 19 | Mobile pass + projector mode | G3 | 60 min |
| 20 | P6 full learning layer with Person 4 | G3 | shared |

If I'm running behind, the cut order is the reverse of this list. Everything from item 15 down is droppable without breaking the demo, except the mobile pass, which the judges will see on their own phones.

---

## Open questions

1. **Who builds the director controls (P9)?** Ask Person 1. Somebody has to fire the Wembanyama storm on stage.
2. **Do mission scenarios need to drive navigation?** If Mission 3 says "rebalance before the storm", Person 4's component may need to push the user to a specific stock page. Agree the interface early.
3. **Does the leaderboard need live updates, or is on-open enough?** On-open is far cheaper and probably fine.
4. **Where exactly do Person 4's components mount?** Confirmed mount points: P1 mission prompt, P4 Composition panel, P6 everything, global glossary and tooltips.
