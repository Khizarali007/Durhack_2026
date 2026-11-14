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
    offensive_rebounds INTEGER,
    defensive_rebounds INTEGER,
    rebounds INTEGER,
    assists INTEGER,
    steals INTEGER,
    blocks INTEGER,
    turnovers INTEGER,
    field_goals_made INTEGER,
    field_goals_attempted INTEGER,
    field_goal_pct REAL,
    effective_fg_pct REAL,
    three_point_field_goals_made INTEGER,
    three_point_field_goals_attempted INTEGER,
    three_point_pct REAL,
    free_throws_made INTEGER,
    free_throws_attempted INTEGER,
    free_throw_pct REAL,
    true_shooting_pct REAL,
    fouls INTEGER,
    plus_minus INTEGER,
    game_score REAL,
    starter INTEGER,
    ejected INTEGER,
    home_away TEXT,
    team_score INTEGER,
    opponent_team_score INTEGER,
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
    "opponent_team_abbreviation", "minutes", "points", "offensive_rebounds",
    "defensive_rebounds", "rebounds", "assists",
    "steals", "blocks", "turnovers", "field_goals_made",
    "field_goals_attempted", "field_goal_pct", "effective_fg_pct",
    "three_point_field_goals_made",
    "three_point_field_goals_attempted", "three_point_pct", "free_throws_made",
    "free_throws_attempted", "free_throw_pct", "true_shooting_pct",
    "fouls", "plus_minus", "game_score", "starter",
    "ejected", "home_away", "team_score", "opponent_team_score",
    "did_not_play", "dnp_reason", "phase",
)


def integer(value: str) -> int | None:
    return int(value) if value else None


def percentage(made: str, attempted: str) -> float | None:
    return int(made) / int(attempted) if made and attempted and int(attempted) else None


def effective_fg_pct(row: dict[str, str]) -> float | None:
    attempts = integer(row["field_goals_attempted"])
    if not attempts:
        return None
    made = integer(row["field_goals_made"])
    threes = integer(row["three_point_field_goals_made"])
    return (made + 0.5 * threes) / attempts if made is not None and threes is not None else None


def true_shooting_pct(row: dict[str, str]) -> float | None:
    points = integer(row["points"])
    attempts = integer(row["field_goals_attempted"])
    free_throws = integer(row["free_throws_attempted"])
    if None in (points, attempts, free_throws):
        return None
    denominator = 2 * (attempts + 0.44 * free_throws)
    return points / denominator if denominator else None


def game_score(row: dict[str, str]) -> float | None:
    if row["did_not_play"].lower() == "true":
        return None
    keys = ("points", "field_goals_made", "field_goals_attempted",
            "free_throws_attempted", "free_throws_made", "offensive_rebounds",
            "defensive_rebounds", "steals", "assists", "blocks", "fouls",
            "turnovers")
    values = {key: integer(row[key]) for key in keys}
    if any(value is None for value in values.values()):
        return None
    v = values
    return (v["points"] + 0.4 * v["field_goals_made"]
            - 0.7 * v["field_goals_attempted"]
            - 0.4 * (v["free_throws_attempted"] - v["free_throws_made"])
            + 0.7 * v["offensive_rebounds"] + 0.3 * v["defensive_rebounds"]
            + v["steals"] + 0.7 * v["assists"] + 0.7 * v["blocks"]
            - 0.4 * v["fouls"] - v["turnovers"])


def record(row: dict[str, str]) -> tuple:
    phase = "history" if row["game_date"] <= HISTORY_END else "replay"
    return (
        int(row["game_id"]), row["game_date"], row["game_date_time"],
        int(row["athlete_id"]), row["athlete_display_name"], int(row["team_id"]),
        row["team_display_name"], row["team_abbreviation"],
        int(row["opponent_team_id"]), row["opponent_team_abbreviation"],
        float(row["minutes"]) if row["minutes"] else None,
        *(integer(row[field]) for field in (
            "points", "offensive_rebounds", "defensive_rebounds", "rebounds",
            "assists", "steals", "blocks", "turnovers", "field_goals_made",
            "field_goals_attempted",
        )),
        percentage(row["field_goals_made"], row["field_goals_attempted"]),
        effective_fg_pct(row),
        integer(row["three_point_field_goals_made"]),
        integer(row["three_point_field_goals_attempted"]),
        percentage(row["three_point_field_goals_made"], row["three_point_field_goals_attempted"]),
        integer(row["free_throws_made"]), integer(row["free_throws_attempted"]),
        percentage(row["free_throws_made"], row["free_throws_attempted"]),
        true_shooting_pct(row), integer(row["fouls"]), integer(row["plus_minus"]),
        game_score(row),
        int(row["starter"].lower() == "true"), int(row["ejected"].lower() == "true"),
        row["home_away"], integer(row["team_score"]), integer(row["opponent_team_score"]),
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
        reader = csv.DictReader(csv_file)
        raw_fields = reader.fieldnames
        if raw_fields is None:
            raise ValueError("Source CSV has no header")
        quoted_fields = [f'"{field.replace(chr(34), chr(34) * 2)}"' for field in raw_fields]
        db.execute("CREATE TABLE player_games_raw (" + ", ".join(
            f"{field} TEXT" for field in quoted_fields
        ) + ")")
        rows = [row for row in reader
            if row["season_type"] == "2"
            and REPLAY_END >= row["game_date"] >= HISTORY_START
            and 1 <= int(row["team_id"]) <= 30
        ]
        db.executemany(insert, (record(row) for row in rows))
        raw_insert = ("INSERT INTO player_games_raw VALUES (" +
                      ", ".join("?" for _ in raw_fields) + ")")
        db.executemany(raw_insert, (tuple(row[field] for field in raw_fields) for row in rows))
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
