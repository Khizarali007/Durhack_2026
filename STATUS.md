# HoopStreet status

Last updated: 14 November 2026. Working location: `integration/person1-person2` branch of
`/Users/jonathanlyria/Documents/Projects/Durhack_2026`.

Current milestone: Combined historical market and human-trading backend running locally.

Completed: imported the full 2024–25 regular season and built pre-season
opening values from five preceding seasons and age. Added a ranked table of
all players, a bot market with three makers per player and 30 shared-account
bots, a season-wide official injury-report feed and browser, and a slower
local graph comparing up to four players.

Next: implement durable payout events and ownership snapshots, then the proposed
slow-ability/fast-form valuation. Reconcile persistence and mission resets before
retaining portfolios across restarts or enabling shorts/leverage.

Blockers: none for the current ordinary buy/sell prototype. The live backend uses
fresh in-memory account and market state together; restarts reset the session.
Payouts, shorts and leverage are intentionally disabled. Solana is off by default.

Verification: the game tables contain 32,610 player-game rows, 1,231 games,
580 players and 30 NBA teams. Opening values cover all 580 players with age
known for all of them. The market run checks cash/share conservation and
generates 174 daily closes per player. Generated data remains local and ignored
by Git.
Checked the browser graph with three players, the 580-row ranking and its
filter. The refined replay executes 90,161 trades; the official Wembanyama report
moves the 20 February close by −25.33%. Quotes are uncrossed across all
100,920 rows. Model checks cover prior strength, outlier resistance, repeated
injury reports, recovery, inventory impact and quote competition.

New model: prior/form shrinkage, explicit assumed availability, finite bot
attention and position limits, deeper maker liquidity, and per-bot performance
against buy-and-hold. Decisions and limitations are in
`docs/market-model-decisions.md`. No payouts or human-order interface added.

The graph now includes a searchable full-season table for all 580 players,
percentage leaders and fallers, dollar-change sorting, and links to each price
history. Returns consistently use pre-season opening valuations. Verified
all 580 summary calculations and confirmed the table renders in the browser.

Currency display: graph and opening-value table now show virtual dollars ($),
with identical numeric prices. Internal data contracts are unchanged.

Combined backend milestone (14 November 2026):
- Merged origin/person2branch at bf2d8fd on a separate local integration branch;
  retained all three previously unpushed Person 1 commits. No push performed.
- Shared market core now serves both the original CLI replay and LiveMarket.
- 580 real player IDs/tickers, finite bot/maker balances, 0.5-second live ticks,
  daily result/injury reveal, human execution, previews, REST and WebSocket quotes.
- Person 2 accounts, portfolios, trade history and limit/stop orders connected.
- Fixed limit orders crossing maker prices and added execution rollback on
  account-write failure. Added explicit disabled receipt status on order responses.
- 286 tests passed; 2 live-devnet tests skipped. Real HTTP smoke test verified
  guest account, preview, buying/selling 10 WEMBY, portfolios, trade history,
  580 unique tickers and exact cash/fee reconciliation.
- Run instructions and boundaries: docs/backend-integration.md. Backend available
  on port 8000 while the current process runs. Port 8765 is still the offline graph.
- The proposed dividend valuation/coefficient refinements remain unimplemented;
  the integration deliberately preserves the existing economic model.

Latest Person 2 merge: origin/person2branch at 5541fb0 (14 November 2026).
Added equity snapshots/max drawdown, local leaderboard/live updates and optional
Solana portfolio synchronization/chain-read standings. Existing live-market,
transaction rollback, limit enforcement and disabled advanced-trading gates remain.
Added an integration guard: portfolios exceeding 16 holdings or 8-byte symbols
are not partially synchronized; leaderboard auto-selection falls back to complete
local standings. Run guide adapted to actual LiveMarket defaults.
Verification: 328 tests passed, 3 optional live-devnet tests skipped. HTTP smoke
against all 580 players confirmed buy/sell, equity snapshots, account leaderboard
ranking and disabled chain status. Server restarted locally on port 8000 (fresh
demo session). No deployment, live-chain verification or push performed.
