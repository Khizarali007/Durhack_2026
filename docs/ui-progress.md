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
