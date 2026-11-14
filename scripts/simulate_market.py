"""Replay NBA box scores through a simple bot-driven player-share market.

The displayed market price is the last executed trade. Basketball results move
the traders' reference values; they never directly overwrite trade prices.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sqlite3
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path


START_CASH_CENTS = 100_000  # 1,000 HOOP per bot, for each independent market
MAKER_CASH_CENTS = 10_000_000  # 100,000 HOOP per maker
MAKER_STARTING_SHARES = 150
BOT_COUNT = 20
INITIAL_BOT_SHARES = 1
HISTORY_PRIOR_GAMES = 3
GAME_SCORE_WEIGHT = 0.20
PRICE_PER_GAME_SCORE_CENTS = 500  # 5 HOOP per Game Score point
MIN_PRICE_CENTS = 1_000  # 10 HOOP


@dataclass
class Trader:
    cash: int
    shares: int
    style: str = "maker"
    bias: float = 0.0


@dataclass
class Market:
    player_id: int
    player_name: str
    team: str
    mean_score: float
    fair_cents: int
    last_cents: int
    makers: list[Trader]
    bots: list[Trader]
    rng: random.Random
    initial_cash: int
    initial_shares: int
    prior_close: int
    news_factor: float = 1.0
    trades_today: list[int] = field(default_factory=list)
    volume_today: int = 0

    def quote(self, maker_index: int) -> tuple[int | None, int | None]:
        maker = self.makers[maker_index]
        inventory_skew = 0.15 * (MAKER_STARTING_SHARES - maker.shares) / MAKER_STARTING_SHARES
        maker_offset = (-0.007, 0.0, 0.007)[maker_index]
        midpoint = self.fair_cents * max(0.5, 1 + inventory_skew + maker_offset)
        spread = (0.020, 0.025, 0.030)[maker_index]
        bid = max(1, round(midpoint * (1 - spread / 2)))
        ask = max(bid + 1, round(midpoint * (1 + spread / 2)))
        return (bid if maker.cash >= bid else None,
                ask if maker.shares > 0 else None)

    def best_quote(self, side: str) -> tuple[int, int] | None:
        options = []
        for index in range(len(self.makers)):
            bid, ask = self.quote(index)
            price = ask if side == "buy" else bid
            if price is not None:
                options.append((price, index))
        if not options:
            return None
        return min(options) if side == "buy" else max(options)

    def trade(self, bot: Trader, side: str, quantity: int) -> tuple[int, int] | None:
        best = self.best_quote(side)
        if best is None or quantity <= 0:
            return None
        price, maker_index = best
        maker = self.makers[maker_index]
        if side == "buy":
            quantity = min(quantity, maker.shares, bot.cash // price)
            if not quantity:
                return None
            bot.cash -= price * quantity
            bot.shares += quantity
            maker.cash += price * quantity
            maker.shares -= quantity
        else:
            quantity = min(quantity, bot.shares, maker.cash // price)
            if not quantity:
                return None
            bot.cash += price * quantity
            bot.shares -= quantity
            maker.cash -= price * quantity
            maker.shares += quantity
        self.last_cents = price
        self.trades_today.append(price)
        self.volume_today += quantity
        return price, quantity

    def bot_round(self) -> None:
        order = list(self.bots)
        self.rng.shuffle(order)
        for bot in order:
            bid = self.best_quote("sell")
            ask = self.best_quote("buy")
            noise = self.rng.gauss(0, 0.015)
            momentum = max(-0.15, min(0.15, self.last_cents / self.prior_close - 1))
            trend = 0.8 * momentum if bot.style == "momentum" else 0
            perceived = self.fair_cents * max(0.5, 1 + bot.bias + trend + noise)
            side = None
            if bot.style == "casual" and self.rng.random() < 0.20:
                side = self.rng.choice(("buy", "sell"))
            elif ask and ask[0] < perceived * 0.985:
                side = "buy"
            elif bid and bid[0] > perceived * 1.015:
                side = "sell"
            if side:
                self.trade(bot, side, self.rng.randint(1, 3))

    def reveal(self, scores: list[float]) -> None:
        # A rest day or DNP is not a zero-score game.
        for score in scores:
            self.mean_score = (1 - GAME_SCORE_WEIGHT) * self.mean_score + GAME_SCORE_WEIGHT * score
        self.update_fair()

    def update_fair(self) -> None:
        self.fair_cents = max(MIN_PRICE_CENTS,
                              round(PRICE_PER_GAME_SCORE_CENTS * self.mean_score * self.news_factor))

    def check_ledger(self) -> None:
        traders = self.makers + self.bots
        assert all(trader.cash >= 0 and trader.shares >= 0 for trader in traders)
        assert sum(trader.cash for trader in traders) == self.initial_cash
        assert sum(trader.shares for trader in traders) == self.initial_shares


def load_data(path: Path) -> tuple[dict[int, dict], dict[str, dict[int, list[float]]]]:
    players: dict[int, dict] = {}
    results: dict[str, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
    with sqlite3.connect(path) as db:
        rows = db.execute("""
            SELECT player_id, player_name, team_abbreviation, game_date, phase,
                   game_score, did_not_play
            FROM player_games ORDER BY game_date, game_id
        """)
        for player_id, name, team, game_date, phase, score, dnp in rows:
            player = players.setdefault(player_id, {"name": name, "team": team, "history": []})
            player["team"] = team
            if not dnp and score is not None:
                if phase == "history":
                    player["history"].append(score)
                else:
                    results[game_date][player_id].append(score)
    if not players or not results:
        raise ValueError("Database has no players or replay results; run the importer first")
    return players, results


def make_markets(players: dict[int, dict], seed: int) -> dict[int, Market]:
    history = [score for player in players.values() for score in player["history"]]
    league_mean = sum(history) / len(history)
    markets = {}
    for player_id, player in sorted(players.items()):
        scores = player["history"]
        mean = (sum(scores) + HISTORY_PRIOR_GAMES * league_mean) / (len(scores) + HISTORY_PRIOR_GAMES)
        fair = max(MIN_PRICE_CENTS, round(PRICE_PER_GAME_SCORE_CENTS * mean))
        rng = random.Random(seed + player_id)
        makers = [Trader(MAKER_CASH_CENTS, MAKER_STARTING_SHARES) for _ in range(3)]
        bots = []
        for index in range(BOT_COUNT):
            style = ("value", "momentum", "casual")[index % 3]
            bots.append(Trader(START_CASH_CENTS, INITIAL_BOT_SHARES,
                               style, rng.gauss(0, 0.07)))
        makers[0].shares -= BOT_COUNT * INITIAL_BOT_SHARES
        traders = makers + bots
        markets[player_id] = Market(
            player_id, player["name"], player["team"], mean, fair, fair,
            makers, bots, rng, sum(t.cash for t in traders),
            sum(t.shares for t in traders), fair,
        )
    return markets


def dates_between(first: str, last: str):
    day = date.fromisoformat(first)
    end = date.fromisoformat(last)
    while day <= end:
        yield day.isoformat()
        day += timedelta(days=1)


def load_events(path: Path | None, markets: dict[int, Market]) -> dict[str, list[tuple[int, dict]]]:
    if path is None:
        return {}
    by_name = {market.player_name.lower(): player_id for player_id, market in markets.items()}
    by_date: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for event in json.loads(path.read_text(encoding="utf-8")):
        player_id = by_name.get(event["player"].lower())
        if player_id is None:
            raise ValueError(f"Event player not found: {event['player']}")
        factor = event["value_factor"]
        if not 0 < factor <= 2:
            raise ValueError(f"Invalid event value factor: {factor}")
        by_date[event["date"]].append((player_id, event))
    return by_date


def simulate(database: Path, output: Path, seed: int, rounds: int,
             names: list[str], events_path: Path | None = None) -> tuple[int, int]:
    players, results = load_data(database)
    markets = make_markets(players, seed)
    events = load_events(events_path, markets)
    selected = [market for market in markets.values()
                if any(name.lower() in market.player_name.lower() for name in names)]
    if names and not selected:
        raise ValueError(f"No player matched {names!r}")
    if not names:
        selected = sorted(markets.values(), key=lambda m: m.fair_cents, reverse=True)[:5]
    selected_ids = {market.player_id for market in selected}
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(("date", "player_id", "player_name", "team", "fair_value",
                         "open", "high", "low", "close", "change_pct", "volume",
                         "trades", "games_revealed", "game_score", "news", "best_bid", "best_ask"))
        for day in dates_between(min(results), max(results)):
            day_results = results.get(day, {})
            day_events = {player_id: event for player_id, event in events.get(day, [])}
            for market in markets.values():
                market.prior_close = market.last_cents
                market.trades_today.clear()
                market.volume_today = 0
                for _ in range(rounds):
                    market.bot_round()
                scores = day_results.get(market.player_id, [])
                market.reveal(scores)
                event = day_events.get(market.player_id)
                if event:
                    market.news_factor *= event["value_factor"]
                    market.update_fair()
                for _ in range(rounds):
                    market.bot_round()
                market.check_ledger()
                prices = market.trades_today
                opening = prices[0] if prices else market.prior_close
                high = max(prices) if prices else market.prior_close
                low = min(prices) if prices else market.prior_close
                bid = market.best_quote("sell")
                ask = market.best_quote("buy")
                writer.writerow((
                    day, market.player_id, market.player_name, market.team,
                    market.fair_cents / 100, opening / 100, high / 100, low / 100,
                    market.last_cents / 100,
                    round(100 * (market.last_cents / market.prior_close - 1), 2),
                    market.volume_today, len(prices), len(scores),
                    round(sum(scores) / len(scores), 2) if scores else "",
                    event["headline"] if event else "",
                    bid[0] / 100 if bid else "", ask[0] / 100 if ask else "",
                ))
                if market.player_id in selected_ids:
                    change = 100 * (market.last_cents / market.prior_close - 1)
                    if event:
                        print(f"{day}  NEWS: {event['headline']}")
                    print(f"{day}  {market.player_name:<25} "
                          f"close {market.last_cents / 100:>7.2f}  "
                          f"{change:+6.2f}%  volume {market.volume_today:>3}")
    return len(markets), sum(1 for _ in dates_between(min(results), max(results)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path("data/player_games_2024_25.sqlite"))
    parser.add_argument("--output", type=Path, default=Path("data/market_daily_prices.csv"))
    parser.add_argument("--events", type=Path, default=Path("data/market_events.json"),
                        help="Dated public news events")
    parser.add_argument("--no-events", action="store_true",
                        help="Run the market using box scores alone")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--rounds", type=int, default=1,
                        help="Bot rounds before and after each day's box scores are revealed")
    parser.add_argument("--player", action="append", default=[],
                        help="Show a player in the terminal (case-insensitive name fragment)")
    args = parser.parse_args()
    if args.rounds < 1:
        parser.error("--rounds must be at least 1")
    count, days = simulate(args.database, args.output, args.seed, args.rounds, args.player,
                           None if args.no_events else args.events)
    print(f"Saved {days} daily closes for {count} players to {args.output}")


if __name__ == "__main__":
    main()
