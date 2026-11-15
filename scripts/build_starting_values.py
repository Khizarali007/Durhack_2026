"""Estimate opening 2024-25 player values using only prior NBA seasons and age."""

from __future__ import annotations

import argparse
import csv
import sqlite3
import statistics
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

import requests
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from market.valuation import dividend_value

from import_player_box import game_score

SOURCE_ROOT = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
SEASONS = (2020, 2021, 2022, 2023, 2024)
SEASON_WEIGHTS = {2024: .45, 2023: .25, 2022: .15, 2021: .10, 2020: .05}
OPENING_DAY = date(2024, 10, 22)
SHRINK_GAMES = 10


def download(url: str, path: Path) -> None:
    if path.exists():
        return
    response = requests.get(url, timeout=90)
    response.raise_for_status()
    path.write_bytes(response.content)


def player_age(birthdate: str) -> int:
    born = date.fromisoformat(birthdate[:10])
    return OPENING_DAY.year - born.year - ((OPENING_DAY.month, OPENING_DAY.day) < (born.month, born.day))


def fetch_birthdate(player_id: int) -> tuple[int, str | None]:
    url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/{player_id}"
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        return player_id, response.json().get("dateOfBirth")
    except (requests.RequestException, ValueError):
        return player_id, None


def load_birthdates(source_dir: Path, player_ids: set[int]) -> dict[int, str]:
    roster = source_dir / "rosters_2025.csv"
    download(f"{SOURCE_ROOT}/espn_nba_rosters/rosters_2025.csv", roster)
    birthdates = {}
    with roster.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            if row["date_of_birth"]:
                birthdates[int(row["athlete_id"])] = row["date_of_birth"]
    cache = source_dir / "birthdates_2025.csv"
    if cache.exists():
        with cache.open(newline="", encoding="utf-8") as file:
            for row in csv.DictReader(file):
                if row["date_of_birth"]:
                    birthdates[int(row["athlete_id"])] = row["date_of_birth"]
    missing = sorted(player_ids - birthdates.keys())
    if missing:
        with ThreadPoolExecutor(max_workers=12) as executor:
            for future in as_completed([executor.submit(fetch_birthdate, player_id) for player_id in missing]):
                player_id, birthdate = future.result()
                if birthdate:
                    birthdates[player_id] = birthdate
        with cache.open("w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow(("athlete_id", "date_of_birth"))
            writer.writerows((player_id, birthdates[player_id]) for player_id in sorted(birthdates))
    return birthdates


def newcomer_prior(scores):
    """Equal-player prior from first-observed 2021–22 through 2023–24 NBA seasons.

    Two older seasons act as a wash-in window. This is a newcomer proxy, not
    verified draft status, and uses no 2024–25 results or later roster roles.
    Equal-player averaging prevents high-minute rookies dominating the prior.
    """
    means = []
    for seasons in scores.values():
        observed = [season for season, games in seasons.items() if games]
        if observed and 2022 <= min(observed) <= 2024:
            means.append(statistics.mean(seasons[min(observed)]))
    if not means:
        raise ValueError("No historical newcomer cohort available")
    return statistics.mean(means), len(means)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("data/source"))
    parser.add_argument("--database", type=Path, default=Path("data/player_games_2024_25.sqlite"))
    parser.add_argument("--output", type=Path, default=Path("data/starting_values_2024_25.csv"))
    parser.add_argument("--newcomer-prior", choices=("league", "conservative"), default="league",
                        help="Opening prior for players with no NBA history; conservative uses historical newcomers")
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(args.database) as db:
        players = {}
        for player_id, name, team in db.execute("""
            SELECT player_id, player_name, team_abbreviation
            FROM player_games ORDER BY game_date, game_id
        """):
            players.setdefault(int(player_id), {"name": name, "team": team})
        schedules = defaultdict(set)
        for team, day in db.execute("SELECT DISTINCT team_abbreviation, game_date FROM player_games"):
            schedules[team].add(day)
    if not players:
        raise ValueError("No 2024-25 players found; run the box-score importer first")

    scores = defaultdict(lambda: defaultdict(list))
    all_scores = []
    for season in SEASONS:
        path = args.source_dir / f"player_box_{season}.csv"
        download(f"{SOURCE_ROOT}/espn_nba_player_boxscores/player_box_{season}.csv", path)
        with path.open(newline="", encoding="utf-8") as file:
            for row in csv.DictReader(file):
                if row["season_type"] != "2" or row["did_not_play"].lower() == "true":
                    continue
                if not row["team_id"].isdigit() or not 1 <= int(row["team_id"]) <= 30:
                    continue
                value = game_score(row)
                if value is not None:
                    value = max(0., value)
                    all_scores.append(value)
                    player_id = int(row["athlete_id"])
                    scores[player_id][season].append(value)
    league_mean = sum(all_scores) / len(all_scores)
    rookie_mean, rookie_count = newcomer_prior(scores)
    birthdates = load_birthdates(args.source_dir, set(players))

    values = []
    for player_id, player in players.items():
        season_means = {}
        season_games = {}
        for season in SEASONS:
            games = scores[player_id][season]
            season_games[season] = len(games)
            season_means[season] = sum(games) / len(games) if games else None
        # Each observed season is shrunk toward the league mean when the sample
        # is small. Missing seasons receive no weight; available weights renormalize.
        available = [season for season in SEASONS if season_games[season]]
        if available:
            weight_total = sum(SEASON_WEIGHTS[season] for season in available)
            expected_score = sum(
                SEASON_WEIGHTS[season] *
                ((sum(scores[player_id][season]) + SHRINK_GAMES * league_mean) /
                 (season_games[season] + SHRINK_GAMES))
                for season in available
            ) / weight_total
        else:
            expected_score = rookie_mean if args.newcomer_prior == "conservative" else league_mean
        birthdate = birthdates.get(player_id)
        age = player_age(birthdate) if birthdate else None
        # A small, capped age adjustment avoids making age dominate observed quality.
        age_factor = max(.88, min(1.08, 1 + .008 * (27 - age))) if age is not None else 1.0
        age_adjusted = max(0., round(expected_score,3) * round(age_factor,3))
        price = max(.01, round(dividend_value(age_adjusted,age_adjusted,age=age if age is not None else 27,
                                                schedule=tuple(sorted(schedules[player["team"]]))),2))
        values.append({
            "player_id": player_id, "player_name": player["name"], "team": player["team"],
            "age": age if age is not None else "", "birthdate": birthdate[:10] if birthdate else "",
            "seasons_played": len(available), "prior_games": sum(season_games.values()),
            **{f"games_{season}": season_games[season] for season in reversed(SEASONS)},
            **{f"avg_game_score_{season}": round(season_means[season], 2) if season_means[season] is not None else "" for season in reversed(SEASONS)},
            "expected_game_score": round(expected_score, 3), "age_factor": round(age_factor, 3),
            "starting_price": price,
            "confidence": "rookie/no NBA history" if not available else "limited" if sum(season_games.values()) < 20 else "history",
        })
    values.sort(key=lambda row: (-row["starting_price"], row["player_name"]))
    for rank, value in enumerate(values, 1):
        value["rank"] = rank
    fields = ["rank", "player_id", "player_name", "team", "age", "birthdate", "seasons_played", "prior_games"]
    fields += [f"games_{season}" for season in reversed(SEASONS)]
    fields += [f"avg_game_score_{season}" for season in reversed(SEASONS)]
    fields += ["expected_game_score", "age_factor", "starting_price", "confidence"]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(values)
    print(f"No-history policy: {args.newcomer_prior}; newcomer prior {rookie_mean:.3f} from {rookie_count} prior players")
    print(f"Saved {len(values)} starting values to {args.output}; league prior-season Game Score {league_mean:.2f}; ages known for {sum(bool(v['age']) for v in values)}")


if __name__ == "__main__":
    main()
