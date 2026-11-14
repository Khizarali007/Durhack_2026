# HoopStreet status

Last updated: 14 November 2026. Working location: `person-1-tasks` branch of
`/Users/jonathanlyria/Documents/Projects/Durhack_2026`.

Current milestone: Person 1 market simulation prototype.

Completed: selected the 2024-25 season and the 19 January–20 March 2025 window;
created a reproducible local box-score import. The database retains all 57
source columns, a typed game table, and derived shooting percentages and Game Score.
Added a Python bot market with three makers per player and dated news-event input.

Next: agree the player universe and the shared quote/trade contract with
Persons 2–4. Then expose market state and trades through the backend API.

Blockers: none for the prototype. The team's final choice between a full order
book and dealer quoting affects integration with human trades.

Verification: both tables contain 11,226 player-game rows, 425 games, 549
distinct players, and exactly 30 NBA teams. Checked a sample line and confirmed
DNPs do not receive Game Score. The market run checks cash/share conservation.
Generated database and price CSV are local and ignored by Git.
