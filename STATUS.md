# HoopStreet status

Last updated: 14 November 2026. Working location: `person-1-tasks` branch of
`/Users/jonathanlyria/Documents/Projects/Durhack_2026`.

Current milestone: Full 2024–25 season valuation and market replay.

Completed: imported the full 2024–25 regular season and built pre-season
opening values from five preceding seasons and age. Added a ranked table of
all players, a bot market with three makers per player and 20 shared-account
bots, a season-wide official injury-report feed and browser, and a slower
local graph comparing up to four players.

Next: agree the player universe and the shared quote/trade contract with
Persons 2–4. Then expose market state and trades through the backend API.

Blockers: none for the prototype. The team's final choice between a full order
book and dealer quoting affects integration with human trades.

Verification: the game tables contain 32,610 player-game rows, 1,231 games,
580 players and 30 NBA teams. Opening values cover all 580 players with age
known for all of them. The market run checks cash/share conservation and
generates 174 daily closes per player. Generated data remains local and ignored
by Git.
Checked the browser graph with three players, the 580-row ranking and its
filter. The official Wembanyama report moved the 20 February close by −23.68%.
