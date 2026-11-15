# Learn mode: changes to Person 3's files

Branch `learn-mode` = `origin/frontend` + `origin/person4-learning` + Learn mode.
Every change to a file Person 3 owns is listed here. **74 lines added, 40 changed,
across 17 files.** Nothing else of yours was touched: no CSS, no config, no
`package.json`, no `tsconfig`, no logic. Check with:

```bash
git diff origin/frontend learn-mode -- frontend/src ':!frontend/src/learning' ':!frontend/src/api/learning.ts' ':!frontend/src/api/tutorialDirector.ts'
```

## Mounts (3 files)

| File | Change | Why |
|---|---|---|
| `src/App.tsx` | +1 import, +1 line: `<TourOverlay />` inside `<BrowserRouter>`, after `<Routes>` | The coach overlay, mounted once. It renders nothing unless a tutorial is running. |
| `src/pages/LearnPage.tsx` | Placeholder replaced: it now renders `<LearnMode />` from `src/learning` | Your plan gives Person 4 the Learn page content (P6). The route and file stay yours. |
| `src/pages/HomePage.tsx` | +1 import. Inside your existing `#mission-card-mount` section, the placeholder text is replaced by `<TourPromptCard />` ("New here? Take the 2-minute tour"). Also `data-tour="home-movers"` on the movers columns. | It fills the mount point you left for the mission card. Your dashed `.mount` style is unchanged. |

## API and mocks (2 files, additive)

| File | Change | Why |
|---|---|---|
| `src/api/index.ts` | Two new export blocks at the end: the learning REST client and models (`createLearningApi`, `LEARNING_API_BASE`, `Mission*` types, ...) and `playTutorialMoment` / `TUTORIAL_MOMENTS_AVAILABLE` | Your rule: components reach data only through `src/api`. My code lives in the new files `src/api/learning.ts` and `src/api/tutorialDirector.ts`. |
| `src/mocks/mockEvents.ts` | Two new entries in `SCENARIOS`: `tutorial_sga_heat` (two hot-streak headlines on SGA) and `tutorial_jokic_buzz` (one rumour on JOKIC) | "Market moments" for the tutorials, played through `mockDirector.playScenario`, as `/director` does. `wemby_storm` and everything else is unchanged. The storm tutorial reuses `wemby_storm`. |

## `data-tour` attributes only (12 files)

These are attributes on existing elements. No markup, class, logic or style changed.

| File | Attributes |
|---|---|
| `components/layout/Header.tsx` | `header-clock`, `header-search`, `header-cash`, `header-equity` |
| `components/layout/LeftNav.tsx` | `nav` on `<nav>`; `nav-home`, `nav-market`, `nav-portfolio`, `nav-leaders`, `nav-learn`, `nav-activity` (one line in the `NavLink` map) |
| `pages/MarketPage.tsx` | `market-search`, `market-team`, `market-table`, ``market-row-${symbol}`` on each virtual row wrapper |
| `pages/PortfolioPage.tsx` | `portfolio-holdings` |
| `components/stock/PlayerCard.tsx` | `stock-identity`, `stock-price`, `stock-value-line`, `stock-hype`, `stock-why-moved` |
| `components/stock/PriceChart.tsx` | `stock-chart` |
| `components/stock/StockActivity.tsx` | `stock-activity`; ``stock-tab-${value}`` on each tab |
| `components/stock/OrderTicket.tsx` | `ticket`, `ticket-order-type`, ``ticket-tab-${mode}`` on each tab, `ticket-price`, `ticket-estimate`, `ticket-account` |
| `components/stock/ticket/QtyInput.tsx` | `ticket-qty` |
| `components/stock/ticket/QuoteBox.tsx` | `ticket-quote`, `ticket-best`, `ticket-makers` |
| `components/stock/ticket/CostBreakdown.tsx` | `ticket-breakdown` |
| `components/stock/ticket/OrderResult.tsx` | `ticket-result` on each of the three result roots |

**Two targets found by position**, because `ui/SegmentedControl` and `ui/Button`
don't pass extra attributes through (see `src/learning/tour/tutorials/selectors.ts`):
- Buy/Sell control: `[data-tour="ticket"] > :nth-child(2)`.
- Confirm button: `[data-tour="ticket"] > button`.

If you reorder the ticket's top-level children, tell me. Or let `Button` and
`SegmentedControl` pass through `data-*` props, and I'll switch to attributes.

## Removed

`src/learning/.gitkeep` and `src/components/learning/.gitkeep` (empty
placeholders). My code now lives in `src/learning/`, as your CLAUDE.md says, so
the old `src/components/learning/` folder is gone.

## Merge notes

- `styles/tokens.css`, `index.css`, `hooks/useTheme.ts`, `components/ui/*`,
  `utils/colorContrast.ts`: **your version kept** byte for byte. Mine were older
  copies of yours.
- No other conflicts. The root `.gitignore` comes from my branch; yours had
  none at the root.

## Where `GlossaryTerm` could go (your call; I haven't placed any)

`<GlossaryTerm term="Spread" />` renders a "?" in your Tooltip style. Hover or
focus shows the definition from `content/glossary.json`, and clicking opens
`/learn#glossary-spread`. Unknown terms render nothing. Import it from
`src/learning`.

| Where | How |
|---|---|
| `QuoteBox` | It already has `bidHelp` / `askHelp` / `makersHelp` props. In `OrderTicket`: `bidHelp={<GlossaryTerm term="Bid" />}`, `askHelp={<GlossaryTerm term="Ask" />}`, `makersHelp={<GlossaryTerm term="Market maker" />}` |
| `CostBreakdown` lines | `BreakdownLine.help` already exists: Spread, Slippage, Fee in `OrderTicket` |
| Ticket tabs / `MODE_HINT` | "Market order", "Limit order", "Stop-loss" |
| `PlayerCard` value line | "Fair value", "Hype" |
| `Header` / `AccountStrip` | "Cash", "Equity" |
| `RadarBadge` label | "Storm Radar" |
| `PriceChart` toolbar | "Candlestick" |
