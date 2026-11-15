# UI progress (Person 3)

Running log of the eight UI phases. Newest phase at the bottom. Mock mode is the default (`VITE_USE_MOCKS` unset), so everything below can be checked with `npm run dev` and no backend.

## Questions for the team

**Person 1 (market)**
1. Which endpoint streams all quotes, and what is the candle-history endpoint? The UI assumes `ws /trading/ws` with `{type:"market_tick", t, quotes}` and `GET /trading/candles/{symbol}?timeframe=1m|5m|1h|1d` returning `{time, open, high, low, close}` with `time` = bucket start in UTC seconds.
2. Is there an endpoint for **past events**? The UI only knows events seen on the stream since the page loaded, so chart markers and the ticker are empty after a refresh.
3. Will `Player` carry a `position`? The UI shows it when present and hides it when not.
4. Will radar state (calm / cloudy / storm) be sent, or should the UI keep deriving it from events (injury = storm for 30 market minutes, early warning / hot streak / rumour = cloudy for 10)?
5. Is there going to be a director API (pause, resume, reset, play scenario)? `/director` is mock-only until there is.

**Person 2 (trading)**
1. Please confirm or correct every shape in `docs/api-assumptions.md` Section 3 (order quote, open orders, trades, receipts, auth, leaderboard, short/cover, leverage, margin, equity history, and the `order_update` / `receipt` / `margin_call` socket messages).
2. **Margin rule.** The brief said "margin call when equity < maintenance (30% of leveraged-or-short exposure)". With 450 shares per stock, whole-account equity can never fall below that from a fresh 100,000 HOOP, so the mock compares **margin equity** (locked margin + unrealised P&L on the leveraged and short positions) instead. What is the real rule?
3. Is a trade one row per order or one row per 10-share chunk? The mock uses one row (and one receipt) per order execution.
4. Do open limit buys reserve cash on your side? The UI shows "tied up in pending orders" as remaining qty × limit price × 1.001.

## Phase 1: API and mock extensions — done

No UI changed in this phase.

**What was added**
- `getOrderQuote`, `placeOpenOrder` / `getOpenOrders` / `cancelOrder`, `getTrades`, `signup` / `login` / `guestSession` / `logout`, `getLeaderboard`, `placeMarginOrder` (short, cover, 1x/3x), `getEquityHistory`. All marked PLANNED in `src/api/rest.ts`, all mocked, all listed in `docs/api-assumptions.md`.
- Stream subscriptions: `subscribeOrderUpdates`, `subscribeReceipts`, `subscribeMarginCalls`, `subscribeMarketReset`.
- Hooks: `useMoveReason`, `useEventLog`, `useSymbolEvents`, `useLatestWhistle`, `useWhistleLine`, `useRadarSummary`, `usePlayers`, `useOpenOrders`, `useTrades`, `useReservedCash`, `useEquityHistory`, `useLeaderboard`. `usePortfolio` now reads one shared store that refreshes every second and after every trade (before, the header loaded cash once and never updated).
- Director: `pauseMarket`, `resumeMarket`, `resetMarket`, `playScenario('wemby_storm')`, `dropConnection`. Mock only.
- `Player.position` (optional), filled in the mock roster.
- Session is now a single store, with `joinAsGuest`, `loginUser`, `signupUser`, `logoutUser`.

**Mock changes worth knowing**
- The mock chart now has a real month of history at every timeframe (it only had candles since page load for 1m/5m/1h), and live candles sit on whole-minute buckets.
- Event impacts are no longer multiplied by `storm` (random "ruled out" events were crashing stocks 40–70%; now 10–18%).
- Mock headlines were reworded to stay mild: availability only, no medical wording, speculative ones end "(simulated)".
- A mock session now needs to exist before `getMe` works (it returns 401 otherwise), which is what the join page in Phase 5 relies on.
- Pre-existing lint errors fixed (context files, MarketPage sort, unused param), so `npm run lint` is clean.

**Files touched**
`src/api/`: `types.ts`, `rest.ts`, `config.ts`, `index.ts`, `useMarketStream.ts`, `useQuote.ts`, `useRadar.ts`, `useSession.ts`, new `accountStore.ts`, `accountSignal.ts`, `orderMath.ts`, `eventLog.ts`, `useMoveReason.ts`, `usePlayers.ts`, `director.ts`; removed `usePortfolio.ts` (moved into `accountStore.ts`).
`src/mocks/`: `mockMarket.ts`, `mockSession.ts`, `mockEvents.ts`, `mockWebSocket.ts`, `mockRest.ts`, `players.ts`, `index.ts`, new `mockBus.ts`, `mockDirector.ts`, `mockLeaderboard.ts`.
Also `src/context/*`, `src/hooks/useTheme.ts`, `src/pages/MarketPage.tsx`, `src/components/layout/AppShell.tsx`, `Header.tsx` (lint fixes and the session store).

**Stubbed / assumed**
- Everything in Section 3 of `docs/api-assumptions.md`.
- The margin rule deviation described above.

**Check in the browser**
- `/market` still lists 300 players and ticks.
- `/debug` still bootstraps a guest and "Buy 10 SGA" works.
- Header cash and equity now change right after a trade on `/debug`.

## Phase 2: Stock page `/stock/:symbol` [G1] — done

**What was built**
- Three columns: compact watchlist (left), player card + candlestick chart (centre), market order ticket (right). Clicking a watchlist row changes the URL param only: card, chart and ticket switch together with no page reload.
- Player card: initials on team colour, name, team, position, radar icon with its word, live price that flashes, "today" change pill, "Price X · Fair value Y · +Z% hype" (amber for hype, blue for discount, each with an arrow and a word), and the "Why did it move?" chip from `useMoveReason`.
- Chart: lightweight-charts v5 (`addSeries(CandlestickSeries)`, `createSeriesMarkers`). 1m / 5m / 1h / 1d from `getCandles`; the live candle is bucketed by the active timeframe and updated with `series.update()`; it carries a "now" marker. Sized by a ResizeObserver, colours read from the CSS tokens and re-applied on theme change. One effect per stock + timeframe loads history and subscribes; its cleanup unsubscribes, so there are no duplicate candles or leaked subscriptions.
- Ticket (market only): buy/sell toggle, quantity with stepper and 10 / 50 / 100 presets (plus Max when selling), estimated cost from `getOrderQuote`, best bid / best ask, the three makers (a sold-out maker is greyed, struck through and labelled), cash free and shares held, a plain-words reason whenever confirm is disabled, and a result panel (fills list, average price, fee, partial-fill reason or the error detail). Keys: B and S switch side, Enter in the quantity box confirms.
- The nav became a slim 76px icon rail. It was 300px wide, which left no room for three columns on a 1280px laptop.
- Only the price cell flashes on a tick now (Market rows used to flash the whole row).

**Files touched**
New: `src/pages/StockPage.module.css`, `src/components/stock/` (`Watchlist`, `PlayerCard`, `PriceChart`, `OrderTicket` + `ticket/QuoteBox`, `QtyInput`, `OrderResult`, `qty.ts`, `types.ts`), `src/components/ui/VirtualList.tsx`, `src/components/market/radarInfo.ts`, `src/hooks/usePriceFlash.ts`, `src/utils/chartTheme.ts`, `src/api/useOrderQuote.ts`.
Changed: `src/pages/StockPage.tsx`, `src/components/market/MarketRow.tsx` (+ compact variant), `RadarBadge.tsx`, `src/components/layout/LeftNav.*`, `src/styles/tokens.css` (warning, overlay and rail tokens), `src/index.css`, `src/utils/format.ts`, `src/mocks/players.ts`.

**Stubbed / assumed**
- The estimate uses the PLANNED `POST /trading/orders/quote`. If that endpoint is missing, the ticket falls back to best price × quantity and says "rough: slippage not counted".
- Mock roster fix: placeholder players ("WAS Player 9", "WAS Player 10") used to share one symbol, which broke React keys. They are now `WAS9`, `WAS10` and so on.
- The TradingView logo is switched off; the licence is met by the small "Charts: TradingView Lightweight Charts™" link on the chart instead.

**Check in the browser**
- `/stock/WEMBY`: the chart shows about 90 one-minute candles ending in a "now" arrow that grows every half second; 5m, 1h and 1d each redraw with no gap between history and the live candle.
- Type 100, press Enter: "Bought 100 WEMBY" with 10 fills; cash in the header drops; "You hold 100 WEMBY".
- Press S, type 500: confirm is disabled with "You hold 100 WEMBY: you can't sell 500."
- Press B, type 9000: "Only ~350 shares are for sale right now…" and the order comes back partly filled.
- Click another player in the left list: all three columns change, the address bar changes, the page does not reload.
- Toggle the theme (sun/moon): the chart recolours.

## Reduced-scope run (14 Nov, late): items 1–5

Scope was cut to: get the build green, stock page, portfolio, home, director. Limit/stop, short/margin, auth, leaderboard and learn are **not** being built in this run. The limit and stop-loss tabs, open-orders table and final-whistle strip that were already finished in the "WIP: partial UI build" commit were kept, because they build and work. Nothing further was added there.

- **Build:** `npm run build` and `npm run lint` pass.
- **Stock page:** checked in the browser (buy, sell validation, symbol switch, no console errors). No code changes, so no new commit.
- **Portfolio `/portfolio`:** `AccountStrip` (equity, cash + cash tied up in pending orders, shares worth, P&L money and %), live holdings table (each row priced off its own quote), empty state linking to Home, Person 4 Composition mount point. Files: `src/pages/PortfolioPage.*`, `src/components/account/`.
- **Home `/`:** the same account strip, a plain-English line on what HoopStreet is, top 5 gainers and fallers as cards (one click opens the chart), Person 4 mission-card mount point. Movers are ranked on the bid/ask midpoint against the opening price and re-ranked once a second. The last trade bounces between bid and ask, so ranking on it reshuffled the list every tick. `/market` is unchanged. Home was added to the nav. Files: `src/pages/HomePage.*`, `src/components/home/`, `src/App.tsx`, `LeftNav.tsx`.
- **Director `/director`:** not in the nav. "Play Wembanyama storm", "Reset market" and "Reset market and my account". Mock only. Against the real backend the buttons are disabled and the page says so. Files: `src/pages/DirectorPage.*`, `src/App.tsx`.

**Demo caveat:** the mock market runs inside the browser tab. Typing a URL or refreshing restarts it. Use the in-app links and the browser Back button to move between `/director` and the WEMBY chart.
