# UI audit

Playwright screenshots of every page (`/login`, `/`, `/market`, `/stock/JOKIC`,
`/stock/WEMBY` with a compare player, `/portfolio`, `/leaderboard`, `/learn`,
`/activity`, `/director`, `/friends`, `/friends/theo`) in dark and light at
1440×900, after five "Next day" presses, plus projector mode. Browser console
and network churn were captured. First pass on `main` at e5ad6f7; re-checked on
`feature/login-activity-friends` after Parts 1–4. Most severe first.

| # | Defect (first pass) | Where | Status |
|---|---|---|---|
| 1 | Blocking, unstyled first-purchase screen (native select, white number input) hid the whole app; a silent guest was created behind it | `Onboarding.tsx`, `AppShell.tsx` | **Fixed**: `/login` page (guest, log in, sign up); optional, dismissible welcome card on Home with a styled quick buy; `Onboarding.tsx` deleted |
| 2 | Stock chart re-downloaded and re-set the full history every second (6 history requests in 6 s), resetting zoom/pan | `PriceChart.tsx` | **Fixed**: 1 history request per selection/session; live quotes update today's point with `series.update()` |
| 3 | Chart mostly empty: compare players squashed the main line on one price scale; it didn't fill the column; native Fit button and compare select; plain-text compare chip | `PriceChart.tsx` | **Fixed**: fills the centre column, % scale when comparing, token legend with remove buttons, 1M/3M/Season/Fit, warning/storm markers, loading and empty states |
| 4 | 568 of 580 players had raw-ID tickers (`NBA4684286`; Kyle Lowry = `NBA3012`) | `market/engine.py` | **Fixed**: readable, stable, unique tickers (LOWRY, SCURRY, LMILLER) |
| 5 | Season bar: native unstyled controls, hardcoded colours, black slider track in light theme, 13px text | `SeasonControls.tsx`, `season.css` | **Fixed**: design-system buttons, token colours, accent slider, `season.css` deleted |
| 6 | Leaderboard was a bare unstyled table containing only the player | `LeaderboardPage.tsx` | **Fixed**: styled table, ranked by return, rivals mixed in and flagged "Simulated", "You" and "On-chain" pills |
| 7 | Activity: unstyled grey headings; one row per share (a 10-share order showed 10 rows); no context | `ActivityPage.tsx` | **Fixed**: "Your season review" (summary strip, review cards, Coach Hoops, timeline grouped by order with context); raw fills and Solana receipts kept in a collapsible section |
| 8 | `/login` and `/friends` missing (console "No routes matched") | `App.tsx` | **Fixed** |
| 9 | No way to log in, sign up or log out | header, `useSession` | **Fixed**: header user menu (Save your progress, projector mode, Log out) |
| 10 | Accounts lost on every backend restart | `backend/main.py` | **Fixed**: identity in `data/accounts.sqlite`; calm "season was reset" notice |
| 11 | Player forecast used inline styles, polled every 1.5 s, showed raw "No report" | `PlayerForecast.tsx` | **Fixed**: CSS module, reloads once per market day, plain wording |
| 12 | Prices read `H$121.66 HOOP` | `PlayerCard`, `OrderTicket` | **Fixed**: unit labels removed |
| 13 | Payment notice used a hardcoded green and inline styles | `PaymentNotice.tsx` | **Fixed**: shared `Notice` component on tokens |
| 14 | Market-list sparklines were 30 seconds of tick noise, empty after every reload | `useSparkline.ts` | **Fixed**: 30 daily closes from `/market/sparklines`, fetched once per market day |
| 15 | Projector mode changed nothing outside the learning components | `tokens.css` | **Fixed**: larger type scale and stronger contrast in both themes; charts re-scale in place |
| 16 | Director page: inline styles, native button, washed-out heading | `DirectorPage.tsx` | **Fixed**: CSS module, ui `Button`/`Card`, demo steps |
| 17 | Minified one-line components | Onboarding, SeasonControls, PayoutLedger, PlayerForecast, Director, Leaderboard, Activity, PaymentNotice | **Fixed** for every one touched (all listed) |

## Still open (minor)

- One `409 Conflict` in the console when a trading poll lands while a day is being processed. The backend's timeline guard rejects it by design; the next poll succeeds.
- Projector mode at 1440 px truncates long names in the market list (acceptable for a projector).
- `PortfolioPage`, `MarketPage`, `HomePage` and the ticket were already on the design system and were not reformatted.

Final pass: no page errors, no console errors other than the 409 above, in either theme.
