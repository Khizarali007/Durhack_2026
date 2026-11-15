"""Replay NBA box scores through a simple bot-driven player-share market.

The displayed market price is the last executed trade. Basketball results move
the traders' reference values; they never directly overwrite trade prices.
"""

from __future__ import annotations

import argparse
import csv
import random
import sqlite3
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from market.valuation import (CONFIG, OPENING_T, YEAR_SECONDS, day_end, dividend_value, expected_fixture_payout, update_expectations, projected_score, payout_per_share, payout_cents)


START_CASH_CENTS = 10_000_000  # 100,000 HOOP per network bot
MAKER_CASH_CENTS = 100_000_000  # 1,000,000 HOOP per maker per player
MAKER_STARTING_SHARES = 1_500
BOT_COUNT = 30
INITIAL_BOT_SHARES = 20  # institutional-style inventory for news selling
BOT_MAX_ORDERS_PER_DAY = 45
BOT_MAX_POSITION_CENTS = 500_000  # at most 5,000 HOOP in one player
MIN_PRICE_CENTS = 1  # minimum executable tick; economic PV is not floored at $10


@dataclass
class Trader:
    cash: int
    shares: int = 0
    style: str = "maker"
    bias: float = 0.0
    holdings: dict[int, int] = field(default_factory=dict)
    orders_today: int = 0
    orders_total: int = 0
    bot_id: str = ""
    position_limit_cents: int = BOT_MAX_POSITION_CENTS


@dataclass
class Market:
    player_id: int
    player_name: str
    team: str
    mean_score: float
    prior_score: float
    form_score: float
    games_observed: int
    fair_cents: int
    last_cents: int
    makers: list[Trader]
    bots: list[Trader]
    rng: random.Random
    initial_shares: int
    prior_close: int
    price_history: list[int] = field(default_factory=list)
    injury_factor: float = 1.0
    availability_probability: float = 1.0
    injury_status: str = ""
    injury_reason: str = ""
    injury_level: str = ""
    injury_signal: float = 0.0
    game_signal: float = 0.0
    trades_today: list[int] = field(default_factory=list)
    volume_today: int = 0
    bot_trades_today: dict[str, int] = field(default_factory=dict)

    prior_games: int = 0
    last_game_score: float | None = None
    last_game_day: str | None = None
    last_trade_t: float | None = None
    trade_observer: object = None
    age: float = 27.
    schedule: tuple = ()
    valuation_time: float = OPENING_T
    detached_days: set = field(default_factory=set)
    ability_score: float = 0.
    cumulative_payout: float = 0.
    valuation_cache: dict = field(default_factory=dict)

    def forecast_value(self, weight=None, required_return=None):
        key = (weight, required_return)
        if key in self.valuation_cache:
            return self.valuation_cache[key]
        result = dividend_value(self.ability_score, self.form_score, age=self.age + max(0., self.valuation_time-OPENING_T)/YEAR_SECONDS,
                              as_of=self.valuation_time, schedule=self.schedule, excluded=self.detached_days,
                              status=self.injury_status, level=self.injury_level, weight=weight, required_return=required_return)
        self.valuation_cache[key] = result
        return result

    def expected_payout(self):
        return expected_fixture_payout(self.ability_score, self.form_score, self.injury_status, self.injury_level)

    def detach(self, day):
        self.detached_days.add(day)
        self.update_fair()

    def quote(self, maker_index: int) -> tuple[int | None, int | None]:
        maker = self.makers[maker_index]
        # Dealers shade both sides when inventory is scarce; competing dealers
        # offer slightly different prices, so large orders walk the quotes.
        target = MAKER_STARTING_SHARES - BOT_COUNT * INITIAL_BOT_SHARES / 3
        total_target = 3 * target
        inventory_skew = 0.12 * (total_target - sum(m.shares for m in self.makers)) / total_target
        local_skew = max(-0.002, min(0.002, 0.02 * (target - maker.shares) / target))
        maker_offset = (-0.003, 0.0, 0.003)[maker_index]
        midpoint = self.fair_cents * max(0.5, 1 + inventory_skew + local_skew + maker_offset)
        spread = (0.016, 0.019, 0.022)[maker_index]
        if self.injury_status in ("Questionable", "Doubtful"):
            spread += 0.012  # uncertain availability increases dealer risk
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
            bot.holdings[self.player_id] = bot.holdings.get(self.player_id, 0) + quantity
            maker.cash += price * quantity
            maker.shares -= quantity
        else:
            quantity = min(quantity, bot.holdings.get(self.player_id, 0), maker.cash // price)
            if not quantity:
                return None
            bot.cash += price * quantity
            bot.holdings[self.player_id] = bot.holdings.get(self.player_id, 0) - quantity
            maker.cash -= price * quantity
            maker.shares += quantity
        self.last_cents = price
        self.trades_today.append(price)
        self.volume_today += quantity
        if bot.style != "maker":
            bot.orders_today += 1
            bot.orders_total += 1
            self.bot_trades_today[bot.style] = self.bot_trades_today.get(bot.style, 0) + 1
        if self.trade_observer is not None:
            self.trade_observer(bot.bot_id, self.player_id, side, quantity, price)
        return price, quantity

    def bot_round(self, has_game: bool = False) -> None:
        # Bound work per round while drawing from the complete speculative population.
        order = self.rng.sample(self.bots, min(120, len(self.bots)))
        for bot in order:
            if bot.orders_today >= BOT_MAX_ORDERS_PER_DAY:
                continue
            signal = self.game_signal if has_game else self.injury_signal
            if bot.style == "news" and abs(signal) < 0.01:
                continue
            # Limited attention creates more activity around games and new
            # reports, without making every bot trade every player daily.
            attention = 0.055 + (0.12 if has_game else 0) + (0.45 if abs(signal) >= 0.01 else 0)
            attention *= max(0.5, min(1.6, (self.fair_cents / 10_000) ** 0.5))
            if self.rng.random() > min(1.0, attention):
                continue
            bid = self.best_quote("sell")
            ask = self.best_quote("buy")
            if not bid and not ask:
                continue
            noise = self.rng.gauss(0, 0.010)
            old_price = self.price_history[-3] if len(self.price_history) >= 3 else self.prior_close
            momentum = max(-0.12, min(0.12, self.prior_close / old_price - 1))
            belief_adjustment = bot.bias + noise
            if bot.style == "momentum":
                belief_adjustment += 0.7 * momentum
            elif bot.style == "risk_averse" and self.injury_status in ("Out", "Doubtful"):
                belief_adjustment -= 0.06
            elif bot.style == "contrarian":
                belief_adjustment -= 0.3 * momentum
            elif bot.style == "news":
                belief_adjustment += 0.1 * signal
            # Personalities disagree about form persistence/risk, in addition to attention.
            weight = {"value": .10, "momentum": .50, "contrarian": .10, "news": .35, "risk_averse": .20}[bot.style]
            required = .28 if bot.style == "risk_averse" else CONFIG.annual_required_return
            perceived = 100 * self.forecast_value(weight, required) * max(0.5, 1 + belief_adjustment)
            side = None
            if bot.style == "risk_averse" and signal < -0.04:
                side = "sell"
            elif ask and ask[0] < perceived * 0.985:
                side = "buy"
            elif bid and bid[0] > perceived * 1.015:
                side = "sell"
            if side:
                size = self.rng.randint(3, 12) if bot.style in ("news", "risk_averse") and signal else self.rng.randint(1, 8)
                if side == "buy" and ask:
                    capacity = max(0, bot.position_limit_cents - bot.holdings.get(self.player_id, 0) * ask[0])
                    size = min(size, capacity // ask[0])
                self.trade(bot, side, size)

    def set_injury(self, report: dict) -> bool:
        before = self.fair_cents
        changed = (self.injury_status, self.injury_level) != (report['status'], report['impact_level'])
        self.injury_status, self.injury_level = report['status'], report['impact_level']
        # Player-facing text stays mild: the status only, never the medical reason.
        self.injury_reason = f"Listed {report['status'].lower()} on the official NBA injury report"
        self.update_fair()
        healthy = dividend_value(self.ability_score,self.form_score,age=self.age+max(0.,self.valuation_time-OPENING_T)/YEAR_SECONDS,
                                 as_of=self.valuation_time,schedule=self.schedule,excluded=self.detached_days)
        self.injury_factor = self.forecast_value()/healthy if healthy else 1.
        from market.valuation import availability
        self.availability_probability = availability(self.injury_status,self.injury_level)[0]
        self.injury_signal = self.fair_cents/before-1 if changed and before else 0.
        return changed

    def reveal(self, scores: list[float]) -> None:
        old_fair = self.fair_cents
        for score in scores:
            self.ability_score, self.form_score = update_expectations(self.ability_score, self.form_score, score)
            self.games_observed += 1
        self.mean_score = projected_score(self.ability_score, self.form_score)
        self.update_fair()
        self.game_signal = self.fair_cents / old_fair - 1 if scores and old_fair else 0.

    def update_fair(self) -> None:
        self.valuation_cache.clear()
        self.fair_cents = max(1, round(100 * self.forecast_value()))

    def check_ledger(self) -> None:
        assert all(trader.cash >= 0 and trader.shares >= 0 for trader in self.makers)
        assert all(bot.cash >= 0 and bot.holdings.get(self.player_id, 0) >= 0 for bot in self.bots)
        assert sum(trader.shares for trader in self.makers) + sum(bot.holdings.get(self.player_id, 0) for bot in self.bots) == self.initial_shares


def load_data(path: Path, values_path: Path) -> tuple[dict[int, dict], dict[str, dict[int, list[float]]]]:
    players: dict[int, dict] = {}
    results: dict[str, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
    with values_path.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            players[int(row["player_id"])] = {
                "name": row["player_name"], "team": row["team"],
                "expected_score": float(row["expected_game_score"]),
                "starting_price": float(row["starting_price"]),
                "prior_games": int(row.get("prior_games") or 0),
                "age": float(row.get("age") or 27),
                "age_factor": float(row.get("age_factor") or 1),
            }
    with sqlite3.connect(path) as db:
        schedules = defaultdict(set)
        for team, day in db.execute("SELECT DISTINCT team_abbreviation, game_date FROM player_games"):
            schedules[team].add(day)
        for player in players.values():
            player['schedule'] = tuple(sorted(schedules[player['team']]))
        rows = db.execute("""
            SELECT player_id, player_name, team_abbreviation, game_date,
                   game_score, did_not_play
            FROM player_games ORDER BY game_date, game_id
        """)
        for player_id, name, team, game_date, score, dnp in rows:
            if player_id not in players:
                raise ValueError(f"Starting value missing for {name} ({player_id})")
            if not dnp and score is not None:
                results[game_date][player_id].append(score)
    if not players or not results:
        raise ValueError("Database has no players or replay results; run the importer first")
    return players, results


def make_markets(players: dict[int, dict], seed: int, bot_count: int = BOT_COUNT, bot_funding: str = "fixed") -> dict[int, Market]:
    if not 1 <= bot_count <= 10_000 or bot_funding not in ("fixed", "per_bot"):
        raise ValueError("Choose 1–10,000 bots and fixed/per_bot funding")
    markets = {}
    network_rng = random.Random(seed)
    styles = ("value", "momentum", "risk_averse", "news", "contrarian")
    total_cash = START_CASH_CENTS * (BOT_COUNT if bot_funding == "fixed" else bot_count)
    cash_each, extra_cash = divmod(total_cash, bot_count)
    bots = [Trader(cash_each + int(i < extra_cash), position_limit_cents=BOT_MAX_POSITION_CENTS, style=styles[i % len(styles)],
                   bias=network_rng.gauss(0, 0.025),
                   bot_id=f"{styles[i % len(styles)]}-{i // len(styles) + 1:02d}")
            for i in range(bot_count)]
    for player_id, player in sorted(players.items()):
        # Keep the age-adjusted opening estimate as the first fair value.
        mean = max(0., player["expected_score"] * player.get("age_factor", 1))
        fair = max(MIN_PRICE_CENTS, round(player["starting_price"] * 100))
        rng = random.Random(seed + player_id)
        makers = [Trader(MAKER_CASH_CENTS, MAKER_STARTING_SHARES) for _ in range(3)]
        each, remainder = divmod(BOT_COUNT * INITIAL_BOT_SHARES, bot_count)
        for bot in bots if each else ():
            bot.holdings[player_id] = each
        for bot in network_rng.sample(bots, remainder):
            bot.holdings[player_id] = each + 1
        for index in range(BOT_COUNT * INITIAL_BOT_SHARES):
            makers[index % 3].shares -= 1
        markets[player_id] = Market(
            player_id, player["name"], player["team"], mean, mean, mean, 0,
            fair, fair, makers, bots, rng, 3 * MAKER_STARTING_SHARES, fair,
        )
        market = markets[player_id]
        market.ability_score = mean
        market.age = player.get('age', 27.)
        market.prior_games = player.get('prior_games',0)
        market.schedule = player.get('schedule', ())
        market.update_fair()
        market.last_cents = market.prior_close = market.fair_cents
    return markets


def dates_between(first: str, last: str):
    day = date.fromisoformat(first)
    end = date.fromisoformat(last)
    while day <= end:
        yield day.isoformat()
        day += timedelta(days=1)


def load_injuries(path: Path | None) -> dict[str, dict[int, dict]]:
    if path is None:
        return {}
    by_date: dict[str, dict[int, dict]] = defaultdict(dict)
    with path.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            if not row["player_id"]:
                continue  # Keep the full report list, even for players outside the market.
            player_id = int(row["player_id"])
            old = by_date[row["report_date"]].get(player_id)
            if old is None or row["report_datetime"] > old["report_datetime"]:
                by_date[row["report_date"]][player_id] = row
    return by_date


def simulate(database: Path, values: Path, output: Path, seed: int, rounds: int,
             names: list[str], injuries_path: Path | None = None,
             bot_report: Path | None = None) -> tuple[int, int]:
    players, results = load_data(database, values)
    markets = make_markets(players, seed)
    network_rng = random.Random(seed + 9_999_991)
    injuries = load_injuries(injuries_path)
    initial_cash = sum(m.cash for market in markets.values() for m in market.makers) + sum(b.cash for b in next(iter(markets.values())).bots)
    issued_dividends = 0
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
                         "trades", "games_revealed", "game_score", "news", "best_bid", "best_ask",
                         "injury_status", "injury_reason", "injury_level", "injury_factor", "injury_update",
                         "availability_probability",
                         "prior_game_score", "recent_form_score", "projected_game_score", "games_observed",
                         "underlying_ability", "payout_per_share", "cumulative_payout_per_share",
                         "value_bot_trades", "momentum_bot_trades", "risk_averse_bot_trades",
                         "news_bot_trades", "contrarian_bot_trades"))
        for day in dates_between(min(results), max(results)):
            day_results = results.get(day, {})
            day_reports = injuries.get(day, {})
            for bot in next(iter(markets.values())).bots:
                bot.orders_today = 0
            day_markets = list(markets.values())
            network_rng.shuffle(day_markets)
            for market in day_markets:
                market.prior_close = market.last_cents
                market.trades_today.clear()
                market.volume_today = 0
                market.bot_trades_today.clear()
                market.valuation_time = day_end(day)-86400
                market.update_fair()
                for _ in range(rounds):
                    market.bot_round()
                # Daily cutoff snapshot: later buyers do not acquire this entitlement.
                snapshot = [(mm, mm.shares) for mm in market.makers] + [(bot,bot.holdings.get(market.player_id, 0)) for bot in market.bots]
                market.valuation_time = day_end(day)-43200
                market.detach(day)
                scores = day_results.get(market.player_id, [])
                rate = round(sum(payout_per_share(score) for score in scores),8)
                for owner,qty in snapshot:
                    amount = payout_cents(qty,rate)
                    owner.cash += amount
                    issued_dividends += amount
                market.cumulative_payout += rate
                market.valuation_time = day_end(day)
                report = day_reports.get(market.player_id)
                changed = market.set_injury(report) if report else False
                if not report:
                    market.injury_signal = 0.0
                market.reveal(scores)
                if scores and market.injury_factor < 1.0:
                    market.injury_factor = 1.0
                    market.availability_probability = CONFIG.healthy_availability
                    market.injury_status = "Available"
                    market.injury_reason = "Played in official box score"
                    market.update_fair()
                for _ in range(rounds):
                    market.bot_round(bool(scores))
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
                    f"Official injury report: {report['status']} — {report['reason']}" if report else "",
                    bid[0] / 100 if bid else "", ask[0] / 100 if ask else "",
                    market.injury_status, market.injury_reason, market.injury_level,
                    market.injury_factor, int(changed),
                    market.availability_probability,
                    round(market.prior_score, 3), round(market.form_score, 3),
                    round(market.mean_score, 3), market.games_observed,
                    round(market.ability_score,3), rate, round(market.cumulative_payout,8),
                    *(market.bot_trades_today.get(style, 0) for style in
                      ("value", "momentum", "risk_averse", "news", "contrarian")),
                ))
                market.price_history.append(market.last_cents)
                if market.player_id in selected_ids:
                    change = 100 * (market.last_cents / market.prior_close - 1)
                    if report and changed:
                        print(f"{day}  INJURY: {market.player_name} {report['status']} — {report['reason']}")
                    print(f"{day}  {market.player_name:<25} "
                          f"close {market.last_cents / 100:>7.2f}  "
                          f"{change:+6.2f}%  volume {market.volume_today:>3}")
            assert sum(m.cash for market in markets.values() for m in market.makers) + sum(b.cash for b in next(iter(markets.values())).bots) == initial_cash + issued_dividends
    if bot_report is not None:
        bot_report.parent.mkdir(parents=True, exist_ok=True)
        initial_holdings_value = sum(INITIAL_BOT_SHARES * max(MIN_PRICE_CENTS, round(player["starting_price"] * 100)) for player in players.values())
        holding_value = sum(INITIAL_BOT_SHARES * market.last_cents for market in markets.values())
        starting_equity = START_CASH_CENTS + initial_holdings_value
        hold_equity = START_CASH_CENTS + holding_value + sum(payout_cents(INITIAL_BOT_SHARES, m.cumulative_payout) for m in markets.values())
        with bot_report.open("w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow(("bot_id", "style", "orders", "cash_hoop", "ending_equity_hoop",
                             "profit_hoop", "buy_hold_profit_hoop", "excess_vs_hold_hoop"))
            for bot in next(iter(markets.values())).bots:
                equity = bot.cash + sum(qty * markets[player_id].last_cents for player_id, qty in bot.holdings.items())
                writer.writerow((bot.bot_id, bot.style, bot.orders_total, bot.cash / 100,
                                 round(equity / 100, 2), round((equity - starting_equity) / 100, 2),
                                 round((hold_equity - starting_equity) / 100, 2),
                                 round((equity - hold_equity) / 100, 2)))
    return len(markets), sum(1 for _ in dates_between(min(results), max(results)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path("data/player_games_2024_25.sqlite"))
    parser.add_argument("--values", type=Path, default=Path("data/starting_values_2024_25.csv"))
    parser.add_argument("--output", type=Path, default=Path("data/market_daily_prices.csv"))
    parser.add_argument("--bot-report", type=Path, default=Path("data/bot_performance.csv"))
    parser.add_argument("--injuries", type=Path, default=Path("data/injury_reports_2024_25.csv"))
    parser.add_argument("--no-injuries", action="store_true", help="Run using box scores alone")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--rounds", type=int, default=1,
                        help="Bot rounds before and after each day's box scores are revealed")
    parser.add_argument("--player", action="append", default=[],
                        help="Show a player in the terminal (case-insensitive name fragment)")
    args = parser.parse_args()
    if args.rounds < 1:
        parser.error("--rounds must be at least 1")
    count, days = simulate(args.database, args.values, args.output, args.seed, args.rounds, args.player,
                           None if args.no_injuries else args.injuries, args.bot_report)
    print(f"Saved {days} daily closes for {count} players to {args.output}")


if __name__ == "__main__":
    main()
