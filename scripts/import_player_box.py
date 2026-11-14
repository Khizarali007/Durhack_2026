"""Build the local 2024-25 regular-season box-score dataset for HoopStreet."""

from __future__ import annotations

import argparse
import csv
import sqlite3
import urllib.request
from pathlib import Path


SOURCE_URL = (
    "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
    "espn_nba_player_boxscores/player_box_2025.csv"
)
HISTORY_START = "2025-01-19"
HISTORY_END = "2025-02-18"
REPLAY_START = "2025-02-19"
REPLAY_END = "2025-03-20"

SCHEMA = """
CREATE TABLE player_games (
    game_id INTEGER NOT NULL,
    game_date TEXT NOT NULL,
    game_date_time TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    team_abbreviation TEXT NOT NULL,
    opponent_team_id INTEGER NOT NULL,
    opponent_team_abbreviation TEXT NOT NULL,
    minutes REAL,
    points INTEGER,
    rebounds INTEGER,
    assists INTEGER,
    steals INTEGER,
    blocks INTEGER,
    turnovers INTEGER,
    field_goals_made INTEGER,
    field_goals_attempted INTEGER,
    free_throws_made INTEGER,
    free_throws_attempted INTEGER,
    fouls INTEGER,
    did_not_play INTEGER NOT NULL,
    dnp_reason TEXT,
    phase TEXT NOT NULL CHECK (phase IN ('history', 'replay')),
    PRIMARY KEY (game_id, player_id)
);
CREATE INDEX player_games_by_date ON player_games (game_date);
CREATE INDEX player_games_by_player_date ON player_games (player_id, game_date);
CREATE TABLE dataset_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

FIELDS = (
    "game_id", "game_date", "game_date_time", "player_id", "player_name",
    "team_id", "team_name", "team_abbreviation", "opponent_team_id",
    "opponent_team_abbreviation", "minutes", "points", "rebounds", "assists",
    "steals", "blocks", "turnovers", "field_goals_made",
    "field_goals_attempted", "free_throws_made", "free_throws_attempted", "fouls",
    "did_not_play", "dnp_reason", "phase",
)


def integer(value: str) -> int | None:
    return int(value) if value else None


def record(row: dict[str, str]) -> tuple:
    phase = "history" if row["game_date"] <= HISTORY_END else "replay"
    return (
        int(row["game_id"]), row["game_date"], row["game_date_time"],
        int(row["athlete_id"]), row["athlete_display_name"], int(row["team_id"]),
        row["team_display_name"], row["team_abbreviation"],
        int(row["opponent_team_id"]), row["opponent_team_abbreviation"],
        float(row["minutes"]) if row["minutes"] else None,
        *(integer(row[field]) for field in (
            "points", "rebounds", "assists", "steals", "blocks", "turnovers",
            "field_goals_made", "field_goals_attempted", "free_throws_made",
            "free_throws_attempted", "fouls",
        )),
        int(row["did_not_play"].lower() == "true"), row["reason"], phase,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Existing hoopR CSV; downloads if omitted")
    parser.add_argument("--output", type=Path, default=Path("data/player_games_2024_25.sqlite"))
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        args.output.unlink()
    source = args.source
    if source is None:
        source = args.output.parent / "player_box_2025.csv"
        if not source.exists():
            urllib.request.urlretrieve(SOURCE_URL, source)

    with sqlite3.connect(args.output) as db, source.open(newline="", encoding="utf-8") as csv_file:
        db.executescript(SCHEMA)
        insert = f"INSERT INTO player_games ({', '.join(FIELDS)}) VALUES ({', '.join('?' for _ in FIELDS)})"
        rows = (
            record(row)
            for row in csv.DictReader(csv_file)
            if row["season_type"] == "2"
            and REPLAY_END >= row["game_date"] >= HISTORY_START
            and 1 <= int(row["team_id"]) <= 30
        )
        db.executemany(insert, rows)
        db.executemany("INSERT INTO dataset_metadata VALUES (?, ?)", (
            ("source", SOURCE_URL), ("season", "2024-25"),
            ("history_start", HISTORY_START), ("history_end", HISTORY_END),
            ("replay_start", REPLAY_START), ("replay_end", REPLAY_END),
        ))
        counts = db.execute(
            "SELECT COUNT(*), COUNT(DISTINCT game_id), COUNT(DISTINCT player_id), "
            "COUNT(DISTINCT team_id) FROM player_games"
        ).fetchone()
        if counts[3] != 30 or counts[0] < 1000:
            raise RuntimeError(f"Unexpected import coverage: {counts}")
        print(f"Imported {counts[0]} player-game rows, {counts[1]} games, "
              f"{counts[2]} players, {counts[3]} teams to {args.output}")


if __name__ == "__main__":
    main()
