# HoopStreet status

Last updated: 14 November 2026. Working location: `person-1-tasks` branch of
`/Users/jonathanlyria/Documents/Projects/Durhack_2026`.

Current milestone: Person 1 historical data foundation.

Completed: selected the 2024-25 season and the 19 January–20 March 2025 window;
created a reproducible local box-score import.

Next: define the player universe, starting values, quote/trade contract, and
replay API with Persons 2–4. Then implement the market engine.

Blockers: none for the historical dataset. The team's final choice between a
full order book and dealer quoting affects the engine design.

Verification: imported 11,226 player-game rows, 425 games, 549 distinct players,
and exactly 30 NBA teams. The generated database is local and ignored by Git.
