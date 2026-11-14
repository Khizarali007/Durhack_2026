"""Build a dated 2024-25 injury feed from the NBA's official report archive."""

from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import unicodedata
from collections import Counter
from pathlib import Path

import requests

SOURCE_URL = (
    "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
    "nba_stats_injury_report/injury_report_2025.csv"
)
START = "2024-10-22"
END = "2025-04-13"
ALIASES = {
    "carltoncarrington": "bubcarrington",
    "alexandresarr": "alexsarr",
    "cuiyongxi": "yongxicui",
}
SEVERE = (
    "tear", "rupture", "fracture", "surgery", "surgical", "repair",
    "acl", "achilles", "deep vein thrombosis", "blood clot", "meniscus",
)
MODERATE = (
    "sprain", "strain", "concussion", "dislocation", "tendinitis",
    "tendonitis", "inflammation", "bone bruise", "stress reaction",
)
# Assumed chance of near-term availability, not an NBA or medical estimate.
# A severe Out report implies a longer likely absence than a minor Out report.
AVAILABILITY = {
    "minor": {"Available": 1.00, "Probable": .97, "Questionable": .91, "Doubtful": .83, "Out": .71},
    "moderate": {"Available": 1.00, "Probable": .94, "Questionable": .80, "Doubtful": .63, "Out": .49},
    "severe": {"Available": 1.00, "Probable": .86, "Questionable": .57, "Doubtful": .34, "Out": .14},
}
NEAR_TERM_VALUE_WEIGHT = .35


def normalized_name(name: str) -> str:
    if "," in name:
        family, given = name.split(",", 1)
        name = given + " " + family
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    return re.sub(r"[^a-z]", "", name)


def impact_level(reason: str) -> str:
    text = reason.lower()
    if any(word in text for word in SEVERE):
        return "severe"
    if any(word in text for word in MODERATE):
        return "moderate"
    return "minor"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("data/source/injury_report_2025.csv"))
    parser.add_argument("--database", type=Path, default=Path("data/player_games_2024_25.sqlite"))
    parser.add_argument("--output", type=Path, default=Path("data/injury_reports_2024_25.csv"))
    args = parser.parse_args()
    args.source.parent.mkdir(parents=True, exist_ok=True)
    if not args.source.exists():
        response = requests.get(SOURCE_URL, timeout=90)
        response.raise_for_status()
        args.source.write_bytes(response.content)
    with sqlite3.connect(args.database) as db:
        names = {int(player_id): name for player_id, name in db.execute(
            "SELECT player_id, MAX(player_name) FROM player_games GROUP BY player_id"
        )}
    ids_by_name = {normalized_name(name): player_id for player_id, name in names.items()}
    daily = {}
    with args.source.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            report_day = row["report_datetime"][:10]
            if not "2024-10-21" <= report_day <= END or not row["report_player_name"]:
                continue
            if not START <= row["game_date"] <= END:
                continue
            if not (row["reason"].startswith("Injury/Illness") or
                    row["reason"].startswith("Concussion Protocol")):
                continue
            if row["current_status"] not in AVAILABILITY["minor"]:
                continue
            # The NBA posts multiple PDF versions each day. Keep the last
            # published state for that player and game on each report day.
            key = (report_day, row["report_player_name"], row["game_date"])
            if key not in daily or row["report_datetime"] > daily[key]["report_datetime"]:
                daily[key] = row
    records = []
    for (report_day, _, game_day), row in sorted(daily.items()):
        norm = normalized_name(row["report_player_name"])
        player_id = ids_by_name.get(ALIASES.get(norm, norm))
        level = impact_level(row["reason"])
        availability = AVAILABILITY[level][row["current_status"]]
        records.append({
            "report_date": max(START, report_day),
            "report_datetime": row["report_datetime"],
            "game_date": game_day,
            "player_id": player_id if player_id is not None else "",
            "report_player_name": row["report_player_name"],
            "player_name": names.get(player_id, ""),
            "team": row["team"],
            "status": row["current_status"],
            "reason": row["reason"],
            "impact_level": level,
            "availability_probability": availability,
            "target_factor": round(1 - NEAR_TERM_VALUE_WEIGHT * (1 - availability), 3),
        })
    fields = list(records[0])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)
    unmapped = sorted({r["report_player_name"] for r in records if r["player_id"] == ""})
    print(f"Saved {len(records)} daily official injury listings; {len(records) - sum(r['player_id'] == '' for r in records)} matched to market players; {len(unmapped)} names unmatched")
    if unmapped:
        print("Unmatched (outside market or name mismatch): " + ", ".join(unmapped))
    print("Statuses: " + str(dict(Counter(r["status"] for r in records))))


if __name__ == "__main__":
    main()
