# UI audit

Playwright screenshots of every page in dark and light (1440×900), the browser
console and network churn, on `main` at e5ad6f7. Most severe first.
Status is updated as fixes land on `feature/login-activity-friends`.

| # | Defect | Where | Status |
|---|---|---|---|
| 1 | Blocking first-purchase screen: unstyled (native select, white number input), hides the whole app until you buy; a silent guest is created behind it | `Onboarding.tsx`, `AppShell.tsx` | open |
| 2 | The stock chart re-downloads and re-sets the full history every second (6 history requests in 6 s), resetting zoom/pan | `PriceChart.tsx` | open |
| 3 | Chart mostly empty: a compare player shares the price scale so the main series is a flat line; tight y-range artefacts; it doesn't fill the centre column; native "Fit history" button and compare `<select>`; plain-text compare chip | `PriceChart.tsx` | open |
| 4 | 568 of 580 players have raw-ID tickers (`NBA4684286`; Kyle Lowry shows as `NBA3012`) in the list, card, chart labels and tables | `market/engine.py` ALIASES | open |
| 5 | Season controls bar uses native unstyled controls, hardcoded colours (`#52617b`, `#45d6a5`), a black slider track in light theme, and 13px text | `SeasonControls.tsx`, `season.css` | open |
| 6 | Leaderboard is a bare unstyled HTML table with only the player in it | `LeaderboardPage.tsx` | open |
| 7 | Activity: page headings in unstyled muted grey; every share is its own row (a 10-share order shows 10 rows), no order grouping, no context | `ActivityPage.tsx`, `TradesTable` | open |
| 8 | `/login` and `/friends` don't exist (console: "No routes matched") | `App.tsx` | open |
| 9 | No way to log in, sign up or log out, though the backend and `src/api` support it | header, `useSession` | open |
| 10 | Accounts are lost on every backend restart (trading DB is `:memory:` in season mode) | `backend/main.py` | open |
| 11 | Player forecast block uses inline styles and a raw "No report" | `PlayerForecast.tsx` | open |
| 12 | Price blocks read `H$121.66 HOOP` (redundant unit) | `PlayerCard`, `OrderTicket` | open |
| 13 | Minified one-line components (Onboarding, SeasonControls, PlayerForecast, DirectorPage parts, LeaderboardPage, ActivityPage) | several | reformatted where touched |

Checked and fine: Learn page and tutorial cards, Home movers, Market list layout, order ticket,
Portfolio with Composition, light theme tokens on the design-system components, no console errors
other than #8.
