"""Copy the compact data the game needs at runtime into data/runtime/ (committed).

Run after the three importers (see scripts/setup_data.sh). The runtime bundle keeps
only the seven box-score columns the market engine reads, so a fresh clone can
play without downloading anything. Full source files stay git-ignored in data/.
"""

from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "runtime"
COLUMNS = "player_id, player_name, team_abbreviation, game_date, game_score, did_not_play, game_id"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = DATA / "player_games_2024_25.sqlite"
    target = OUT / "player_games_2024_25.sqlite"
    for path in (source, DATA / "starting_values_2024_25.csv", DATA / "injury_reports_2024_25.csv"):
        if not path.exists():
            raise SystemExit(f"Missing {path.relative_to(ROOT)}: run scripts/setup_data.sh --rebuild first")
    target.unlink(missing_ok=True)
    with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
        dst.executescript(
            "CREATE TABLE player_games (player_id INTEGER, player_name TEXT, team_abbreviation TEXT,"
            " game_date TEXT, game_score REAL, did_not_play INTEGER, game_id INTEGER);"
            "CREATE TABLE dataset_metadata (key TEXT, value TEXT);"
            "CREATE INDEX player_games_by_date ON player_games (game_date);"
        )
        dst.executemany("INSERT INTO player_games VALUES (?,?,?,?,?,?,?)",
                        src.execute(f"SELECT {COLUMNS} FROM player_games"))
        dst.executemany("INSERT INTO dataset_metadata VALUES (?,?)", src.execute("SELECT * FROM dataset_metadata"))
        dst.execute("INSERT INTO dataset_metadata VALUES ('note', 'Compact runtime subset built by scripts/build_runtime_bundle.py')")
    with sqlite3.connect(target) as dst:
        dst.execute("VACUUM")
    for name in ("starting_values_2024_25.csv", "injury_reports_2024_25.csv"):
        shutil.copyfile(DATA / name, OUT / name)
    for path in sorted(OUT.iterdir()):
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
