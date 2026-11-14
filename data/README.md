# Historical NBA box scores

`player_games_2024_25.sqlite` contains NBA regular-season player box scores from
19 January through 20 March 2025. `phase=history` ends on 18 February;
`phase=replay` begins on 19 February. Dates come from ESPN's game-date field.
Because of the All-Star break, the latest regular-season game in the history
slice is 13 February.

Source: [SportsDataverse ESPN NBA player box scores](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_player_boxscores).
The database can be rebuilt with `python3 scripts/import_player_box.py`. The
script requires only Python's standard library. Pass `--source path/to/player_box_2025.csv`
to use a previously downloaded source file.

This is historical basketball data, not player-stock prices. The application
must generate market quotes and trades separately. The source also contains
All-Star exhibition teams, which the importer excludes. Player rows with
`did_not_play=1` are retained; a missing row does not prove why a player was absent.

`player_games` contains typed fields used by the game, including calculated
shooting percentages, Game Score and game plus/minus. Percentages are stored as
fractions (for example, 0.500 = 50%) and are NULL when their denominators are
zero. True-shooting percentage can exceed 1 in unusual box scores.
`player_games_raw` preserves every
column in the source CSV as text so no source field is lost. Game plus/minus is
the scoreboard change while a player was on court; it is not the season-long
advanced metric Box Plus/Minus (BPM).

Game Score uses the published [Basketball-Reference formula](https://www.basketball-reference.com/about/glossary.html).
Effective field-goal percentage and true-shooting percentage are calculated
from made shots, attempts and points. These derived measures are NULL for DNPs
or where the required source data is unavailable.
