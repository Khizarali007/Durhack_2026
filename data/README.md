# Historical NBA data

`player_games_2024_25.sqlite` contains all 2024–25 NBA regular-season player
box scores from 22 October 2024 through 13 April 2025: 32,610 player-game
rows, 1,231 games, 580 players and 30 NBA teams. Every row has `phase=replay`.
The game-date field comes from ESPN. Source data is the
[SportsDataverse ESPN player box-score release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_player_boxscores).

Rebuild with `python3 scripts/import_player_box.py`. The importer retains the
57 source columns as text in `player_games_raw` and typed game fields in
`player_games`, including calculated shooting percentages and Game Score.
DNPs retain their source rows but do not get a Game Score. Game plus/minus is
the scoreboard change while the player was on court, not Box Plus/Minus (BPM).

Run `python3 scripts/build_starting_values.py` after importing to create the
ranked opening-value CSV from five **earlier** NBA seasons and birth dates.
Then run `python3 scripts/simulate_market.py` for the season-long market CSV.
Downloaded source files, generated CSVs and SQLite data are ignored by Git.
