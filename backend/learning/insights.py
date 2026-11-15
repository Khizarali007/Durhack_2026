"""Season review: a deterministic, explainable insights engine.

Input is one trader's season so far (orders, payouts, equity, the official
injury alerts and daily prices); output is a summary, review cards and a
plain-English timeline. Every rule below is a fixed threshold with a sentence
that explains it, so a card can always say exactly why it appeared. No
randomness, no model: the same season always gives the same review.

Used for the player (Activity → "Your season review") and for the practice
rivals (Friends), so both are judged by the same rules.

Rules (H$ = HOOP):
  concentration      one player or one team > 40% of invested money
  bought_into_storm  a buy within 3 days after an early warning or storm on that player
  panic_sell         a sell at a loss, then the price recovered >= 8% within 10 days
  sold_before_payout a sell before the noon cutoff on a day that player had a game
  overpaid           spread + slippage + fees > 1% of an order worth >= H$500
  churning           >= 3 round trips with a net loss after fees
  held_out_player    still holding 5+ days after the player was ruled out
  diversified        grade A or B with 5+ holdings (praise)
  held_through_noise held a position that dipped >= 5% below cost and came back above it (praise)
  hot_stretch_buy    the price rose >= 10% within 10 days of a buy (praise)
  sold_on_warning    sold within 2 days of an early warning, before a fall of >= 5% (praise)
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from .composition import Holding, compose

DAY = 86400.0
NOON = 43200.0


# ---- inputs ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Fill:
    order_id: str
    symbol: str
    side: str            # buy | sell
    qty: float
    price: float         # H$ per share
    fee: float           # H$
    t: float             # market time
    quoted_price: float | None = None   # best price when the order was placed


@dataclass(frozen=True)
class Payment:
    symbol: str
    qty_held: float
    amount: float
    t: float


@dataclass(frozen=True)
class Alert:
    """An official injury-report change: early_warning (questionable/doubtful) or injury (out)."""
    symbol: str
    kind: str
    t: float             # day close when it was revealed
    headline: str


@dataclass
class SeasonData:
    name: str
    starting_cash: float
    cash: float
    now: float
    fills: list[Fill]
    payments: list[Payment] = field(default_factory=list)
    equity: list[tuple[float, float]] = field(default_factory=list)   # (t, H$), oldest first
    alerts: list[Alert] = field(default_factory=list)
    names: dict[str, str] = field(default_factory=dict)
    teams: dict[str, str] = field(default_factory=dict)
    prices: dict[str, float] = field(default_factory=dict)            # current price per symbol
    # Daily (t, price) for a symbol, oldest first.
    daily: Callable[[str], list[tuple[float, float]]] = lambda symbol: []
    # H$ per share that a game on this ISO date paid, or 0.0 / None when no game.
    game_payout: Callable[[str, str], float | None] = lambda symbol, day: None


# ---- outputs ------------------------------------------------------------------------------

@dataclass
class Learn:
    kind: str            # tutorial | glossary
    id: str
    label: str


@dataclass
class Insight:
    id: str              # rule id
    tone: str            # warning | praise
    title: str
    what: str            # what happened
    why: str             # why it mattered, in H$
    next_time: str
    impact: float        # H$, negative = cost, positive = gain
    learn: Learn
    symbol: str | None = None
    t: float | None = None


@dataclass
class TimelineItem:
    t: float
    kind: str            # buy | sell | payout | alert | grade
    text: str
    symbol: str | None = None
    amount: float | None = None


@dataclass
class TradeResult:
    symbol: str
    qty: float
    pnl: float
    t: float


@dataclass
class Summary:
    equity: float
    return_pct: float
    payouts: float
    fees: float
    trades: int
    best_trade: TradeResult | None
    worst_trade: TradeResult | None
    max_drawdown_pct: float
    grade: str | None
    grade_reason: str
    biggest_lesson: str


@dataclass
class Review:
    name: str
    summary: Summary
    insights: list[Insight]
    timeline: list[TimelineItem]

    def to_dict(self) -> dict:
        return asdict(self)


# ---- helpers ------------------------------------------------------------------------------

@dataclass
class Order:
    order_id: str
    symbol: str
    side: str
    qty: float
    avg_price: float
    fee: float
    t: float
    quoted_price: float | None
    realised: float | None = None     # sells: P&L after all fees, against average cost


def group_orders(fills: list[Fill]) -> list[Order]:
    """The season engine fills one share at a time; an order is what the player clicked."""
    groups: dict[str, list[Fill]] = defaultdict(list)
    for f in fills:
        groups[f.order_id].append(f)
    orders = []
    for order_id, fs in groups.items():
        qty = sum(f.qty for f in fs)
        if qty <= 0:
            continue
        orders.append(Order(order_id, fs[0].symbol, fs[0].side, qty,
                            sum(f.qty * f.price for f in fs) / qty, sum(f.fee for f in fs),
                            min(f.t for f in fs), fs[0].quoted_price))
    orders.sort(key=lambda o: o.t)
    _realise(orders)
    return orders


def _realise(orders: list[Order]) -> None:
    """Average-cost accounting with fees in the cost basis; fills in Order.realised for sells."""
    held: dict[str, float] = defaultdict(float)
    basis: dict[str, float] = defaultdict(float)
    for o in orders:
        if o.side == "buy":
            held[o.symbol] += o.qty
            basis[o.symbol] += o.qty * o.avg_price + o.fee
        elif o.side == "sell" and held[o.symbol] > 0:
            qty = min(o.qty, held[o.symbol])
            cost = basis[o.symbol] * qty / held[o.symbol]
            o.realised = qty * o.avg_price - o.fee - cost
            basis[o.symbol] -= cost
            held[o.symbol] -= qty


def positions_at(orders: list[Order], t: float) -> dict[str, float]:
    held: dict[str, float] = defaultdict(float)
    for o in orders:
        if o.t > t:
            break
        held[o.symbol] += o.qty if o.side == "buy" else -o.qty
    return {s: q for s, q in held.items() if q > 0}


def iso_day(t: float) -> str:
    return datetime.fromtimestamp(t, tz=timezone.utc).date().isoformat()


def nice_day(t: float) -> str:
    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%-d %b")


def money(x: float) -> str:
    sign = "-" if x < 0 else ""
    return f"{sign}H${abs(x):,.2f}"


def surname(name: str) -> str:
    parts = [p for p in name.split() if p.rstrip(".").upper() not in {"JR", "SR", "II", "III", "IV"}]
    return parts[-1] if parts else name


def alert_status(alert: Alert) -> str:
    text = alert.headline.lower()
    for status in ("listed questionable", "listed doubtful", "ruled out"):
        if status in text:
            return status
    return "ruled out" if alert.kind == "injury" else "on the injury report"


def report_day(alert: Alert) -> float:
    """Alerts carry the day-close time; the report belongs to the day before that boundary."""
    return alert.t - DAY


def window(daily: list[tuple[float, float]], start: float, days: float) -> list[float]:
    return [p for t, p in daily if start < t <= start + days * DAY]


def learn_tutorial(tid: str, label: str) -> Learn:
    return Learn("tutorial", tid, label)


def learn_term(term: str) -> Learn:
    return Learn("glossary", term.lower().replace(" ", "-").replace("/", "-"), term)


# ---- the rules ----------------------------------------------------------------------------------

def _concentration(data: SeasonData, holdings: list[Holding]) -> list[Insight]:
    comp = compose(holdings, data.cash)
    if comp.grade is None or comp.holdings == 0:
        return []
    out = []
    top = comp.by_player[0]
    if comp.top_player_pct > 40 and comp.holdings > 0:
        shock = 0.2 * top.value
        out.append(Insight(
            "concentration", "warning", f"{comp.top_player_pct:.0f}% on one player",
            f"{top.label} is {comp.top_player_pct:.0f}% of your invested money.",
            f"If {surname(top.label)} drops 20% after one bad report, that alone costs you {money(shock)}.",
            "Cap any one player at about a fifth of what you invest, and spread across teams.",
            -round(shock, 2), learn_term("Diversification"), top.key))
    elif comp.top_team_pct > 40 and comp.teams > 0:
        team = comp.by_team[0]
        shock = 0.15 * team.value
        out.append(Insight(
            "concentration", "warning", f"{comp.top_team_pct:.0f}% on one team",
            f"{comp.top_team_pct:.0f}% of your invested money is on {team.label} players.",
            f"Teammates share a schedule and the same storms: a 15% team slump costs {money(shock)}.",
            "Mix in players from other teams so one bad week can't hit everything.",
            -round(shock, 2), learn_term("Diversification")))
    return out


def _bought_into_storm(data: SeasonData, orders: list[Order]) -> list[Insight]:
    out = []
    for o in orders:
        if o.side != "buy":
            continue
        active = [a for a in data.alerts if a.symbol == o.symbol and 0 <= o.t - report_day(a) <= 3 * DAY]
        if not active:
            continue
        a = active[-1]
        later = window(data.daily(o.symbol), o.t, 7)
        low = min(later) if later else o.avg_price
        cost = min(0.0, (low - o.avg_price) * o.qty)
        name = surname(data.names.get(o.symbol, o.symbol))
        out.append(Insight(
            "bought_into_storm", "warning", f"Bought {o.symbol} under a storm warning",
            f"You bought {o.qty:g} {o.symbol} at {money(o.avg_price)} on {nice_day(o.t)}, while {name} was {alert_status(a)}.",
            f"Within a week it traded as low as {money(low)}: a paper hit of {money(cost)}." if cost < 0
            else "It worked out this time, but the risk was on the official report for everyone to see.",
            "Check the Storm Radar before buying. A cloud or storm means wait for the next report.",
            round(cost, 2), learn_tutorial("survive-the-storm", "Survive the storm"), o.symbol, o.t))
    return out


def _panic_sell(data: SeasonData, orders: list[Order]) -> list[Insight]:
    out = []
    for o in orders:
        if o.side != "sell" or o.realised is None or o.realised >= 0:
            continue
        later = window(data.daily(o.symbol), o.t, 10)
        high = max(later) if later else 0.0
        if high < o.avg_price * 1.08:
            continue
        missed = (high - o.avg_price) * o.qty
        out.append(Insight(
            "panic_sell", "warning", f"Sold {o.symbol} at a loss, just before it bounced",
            f"You sold {o.qty:g} {o.symbol} at {money(o.avg_price)} on {nice_day(o.t)} for a loss of {money(o.realised)}.",
            f"Within 10 days it was back up to {money(high)}: holding would have been worth {money(missed)} more.",
            "Before selling into a dip, ask whether anything changed (an injury report?) or it's just noise.",
            -round(missed, 2), learn_term("Volatility"), o.symbol, o.t))
    return out


def _sold_before_payout(data: SeasonData, orders: list[Order]) -> list[Insight]:
    out = []
    for o in orders:
        if o.side != "sell" or (o.t % DAY) >= NOON:
            continue
        per_share = data.game_payout(o.symbol, iso_day(o.t)) or 0.0
        if per_share <= 0:
            continue
        missed = per_share * o.qty
        out.append(Insight(
            "sold_before_payout", "warning", f"Sold {o.symbol} hours before a payout",
            f"You sold {o.qty:g} {o.symbol} on the morning of {nice_day(o.t)}; {surname(data.names.get(o.symbol, o.symbol))} played that night.",
            f"Holding through the noon cutoff would have paid {money(per_share)} a share: {money(missed)}.",
            "Check the schedule: if a player has a game today, sell after the noon cutoff to keep the payout.",
            -round(missed, 2), learn_tutorial("performance-payouts", "Earn a performance payout"), o.symbol, o.t))
    return out


def _overpaid(orders: list[Order]) -> list[Insight]:
    out = []
    for o in orders:
        notional = o.avg_price * o.qty
        if notional < 500:
            continue
        slip = 0.0
        if o.quoted_price:
            slip = max(0.0, (o.avg_price - o.quoted_price) * o.qty if o.side == "buy"
                       else (o.quoted_price - o.avg_price) * o.qty)
        cost = slip + o.fee
        if cost / notional <= 0.01:
            continue
        out.append(Insight(
            "overpaid", "warning", f"Paid {cost / notional:.1%} to trade {o.symbol}",
            f"Your {o.side} of {o.qty:g} {o.symbol} filled at {money(o.avg_price)} on average"
            + (f" against a quoted {money(o.quoted_price)}" if o.quoted_price else "") + ".",
            f"Slippage {money(slip)} plus fees {money(o.fee)} cost {money(cost)} on a {money(notional)} order.",
            "Split big orders, or use a limit order so you never pay more than you chose.",
            -round(cost, 2), learn_tutorial("read-the-spread", "Read the spread"), o.symbol, o.t))
    return out


def _churning(orders: list[Order]) -> list[Insight]:
    sells = [o for o in orders if o.side == "sell" and o.realised is not None]
    if len(sells) < 3:
        return []
    net = sum(o.realised for o in sells)
    fees = sum(o.fee for o in orders)
    if net >= 0:
        return []
    return [Insight(
        "churning", "warning", f"{len(sells)} round trips, net {money(net)}",
        f"You sold {len(sells)} times this season and paid {money(fees)} in fees overall.",
        f"After fees those trades lost {money(net)}. Every trip pays the spread and a fee before it can profit.",
        "Trade less. Hold a reason (a payout, a mispricing) rather than reacting to every tick.",
        round(net, 2), learn_term("Fee"))]


def _held_out_player(data: SeasonData, orders: list[Order]) -> list[Insight]:
    out = []
    for a in data.alerts:
        if a.kind != "injury":
            continue
        held = positions_at(orders, a.t).get(a.symbol, 0)
        later_held = positions_at(orders, a.t + 5 * DAY).get(a.symbol, 0)
        if held <= 0 or later_held <= 0 or data.now < a.t + 5 * DAY:
            continue
        daily = data.daily(a.symbol)
        before = [p for t, p in daily if t <= a.t]
        after = window(daily, a.t, 5)
        if not before or not after:
            continue
        change = (after[-1] - before[-1]) * min(held, later_held)
        out.append(Insight(
            "held_out_player", "warning", f"Held {a.symbol} through a long absence",
            f"{surname(data.names.get(a.symbol, a.symbol))} was ruled out on {nice_day(report_day(a))} and you still held {later_held:g} shares five days later.",
            f"An Out player pays nothing while he sits; the position moved {money(change)} over those days." if change < 0
            else "An Out player pays nothing while he sits, so that money earned no payouts.",
            "When a player is ruled out, decide: sell, or set a stop-loss so a longer absence can't keep costing you.",
            round(min(change, 0.0), 2), learn_term("Stop-loss"), a.symbol, a.t))
    return out


def _praise(data: SeasonData, orders: list[Order], holdings: list[Holding]) -> list[Insight]:
    out = []
    comp = compose(holdings, data.cash)
    if comp.grade in ("A", "B") and comp.holdings >= 5:
        out.append(Insight(
            "diversified", "praise", f"Well spread: grade {comp.grade}",
            f"{comp.holdings} players across {comp.teams} teams; the biggest is {comp.top_player_pct:.0f}%.",
            "One bad report can't sink you, and payouts arrive from many games instead of one.",
            "Keep it up as you add positions.", 0.0, learn_term("Diversification")))

    for o in orders:
        if o.side != "buy":
            continue
        later = window(data.daily(o.symbol), o.t, 10)
        if later and max(later) >= o.avg_price * 1.10:
            gain = (max(later) - o.avg_price) * o.qty
            out.append(Insight(
                "hot_stretch_buy", "praise", f"Bought {o.symbol} before a hot stretch",
                f"You bought {o.qty:g} {o.symbol} at {money(o.avg_price)} on {nice_day(o.t)}; within 10 days it reached {money(max(later))}.",
                f"That was worth up to {money(gain)} on paper.",
                "Note what you saw (form, schedule, a discount to the estimate) so you can spot it again.",
                round(gain, 2), learn_term("Hot streak"), o.symbol, o.t))

    for s in {o.symbol for o in orders}:
        buys = [o for o in orders if o.symbol == s and o.side == "buy"]
        if not buys:
            continue
        cost = sum(o.avg_price * o.qty for o in buys) / sum(o.qty for o in buys)
        first = buys[0].t
        sold = [o for o in orders if o.symbol == s and o.side == "sell"]
        end_t = sold[-1].t if sold else data.now
        if end_t - first < 10 * DAY:
            continue
        held = [p for t, p in data.daily(s) if first < t <= end_t]
        end_price = sold[-1].avg_price if sold else data.prices.get(s, held[-1] if held else cost)
        if held and min(held) <= cost * 0.95 and end_price >= cost:
            out.append(Insight(
                "held_through_noise", "praise", f"Held {s} through a dip",
                f"{s} fell to {money(min(held))} (below your {money(cost)} average) and you didn't panic.",
                f"It came back to {money(end_price)}.",
                "Price noise without news is not a reason to sell.",
                round((end_price - min(held)) * sum(o.qty for o in buys), 2), learn_term("Volatility"), s, first))

    for o in orders:
        if o.side != "sell":
            continue
        warned = [a for a in data.alerts if a.symbol == o.symbol and a.kind == "early_warning"
                  and 0 <= o.t - report_day(a) <= 2 * DAY]
        later = window(data.daily(o.symbol), o.t, 7)
        if warned and later and min(later) <= o.avg_price * 0.95:
            saved = (o.avg_price - min(later)) * o.qty
            out.append(Insight(
                "sold_on_warning", "praise", f"Sold {o.symbol} on the early warning",
                f"{surname(data.names.get(o.symbol, o.symbol))} was {alert_status(warned[-1])}; you sold {o.qty:g} at {money(o.avg_price)} on {nice_day(o.t)}.",
                f"It then fell to {money(min(later))}: you avoided {money(saved)} of losses.",
                "Early warnings are the cheapest time to act.", round(saved, 2),
                learn_tutorial("survive-the-storm", "Survive the storm"), o.symbol, o.t))
    return out


# ---- review ------------------------------------------------------------------------------------

def _holdings_now(data: SeasonData, orders: list[Order]) -> list[Holding]:
    held = positions_at(orders, float("inf"))
    return [Holding(s, data.names.get(s, s), data.teams.get(s, "?"), q * data.prices.get(s, 0.0))
            for s, q in held.items()]


def _max_drawdown_pct(points: list[tuple[float, float]]) -> float:
    peak, worst = None, 0.0
    for _, equity in points:
        if peak is None or equity > peak:
            peak = equity
        elif peak > 0:
            worst = min(worst, (equity - peak) / peak)
    return round(100 * worst, 2)


def _pick(insights: list[Insight], per_rule: int = 2, limit: int = 8) -> list[Insight]:
    """Biggest H$ first, at most `per_rule` cards from the same rule, warnings before praise."""
    by_rule: dict[str, int] = defaultdict(int)
    chosen = []
    for ins in sorted(insights, key=lambda i: (i.tone != "warning", -abs(i.impact))):
        if by_rule[ins.id] >= per_rule:
            continue
        by_rule[ins.id] += 1
        chosen.append(ins)
    return chosen[:limit]


def _timeline(data: SeasonData, orders: list[Order]) -> list[TimelineItem]:
    items: list[TimelineItem] = []
    for o in orders:
        name = surname(data.names.get(o.symbol, o.symbol))
        verb = "bought" if o.side == "buy" else "sold"
        text = f"You {verb} {o.qty:g} {o.symbol} at {money(o.avg_price)}"
        upcoming = [a for a in data.alerts if a.symbol == o.symbol and 0 <= report_day(a) - o.t // DAY * DAY <= 3 * DAY]
        recent = [a for a in data.alerts if a.symbol == o.symbol and 0 < o.t - report_day(a) <= 3 * DAY]
        if upcoming:
            a = upcoming[0]
            gap = round((report_day(a) - o.t // DAY * DAY) / DAY)
            when = "the same day" if gap == 0 else "the day before" if gap == 1 else f"{gap} days before"
            text += f", {when} {name} was {alert_status(a)}"
        elif recent:
            text += f", while {name} was {alert_status(recent[-1])}"
        if o.realised is not None:
            text += f" ({'profit' if o.realised >= 0 else 'loss'} {money(o.realised)} after fees)"
        items.append(TimelineItem(o.t, o.side, text + ".", o.symbol, round(o.avg_price * o.qty, 2)))

    by_day: dict[tuple[str, str], float] = defaultdict(float)
    for p in data.payments:
        by_day[(iso_day(p.t - 1), p.symbol)] += p.amount
    for (day, symbol), amount in by_day.items():
        t = datetime.fromisoformat(day).replace(tzinfo=timezone.utc).timestamp() + DAY
        items.append(TimelineItem(t, "payout", f"{symbol} paid you {money(amount)} for the {nice_day(t - DAY)} game.",
                                   symbol, round(amount, 2)))

    held_symbols = {o.symbol for o in orders}
    for a in data.alerts:
        if a.symbol not in held_symbols or positions_at(orders, a.t).get(a.symbol, 0) <= 0:
            continue
        word = "Storm" if a.kind == "injury" else "Early warning"
        items.append(TimelineItem(a.t, "alert", f"{word} on a player you held: {a.headline.split(': ', 1)[-1]}", a.symbol))

    # Composition grade after each order (valued at each order's own price for simplicity).
    last_price: dict[str, float] = {}
    previous = None
    for o in orders:
        last_price[o.symbol] = o.avg_price
        held = positions_at(orders, o.t)
        holdings = [Holding(s, s, data.teams.get(s, "?"), q * last_price.get(s, 0)) for s, q in held.items()]
        grade = compose(holdings, 0.0).grade
        if grade != previous and grade is not None:
            items.append(TimelineItem(o.t + 0.001, "grade", f"Your Composition grade became {grade}."))
        previous = grade

    items.sort(key=lambda i: i.t, reverse=True)
    return items[:200]


def review(data: SeasonData) -> Review:
    orders = group_orders(data.fills)
    holdings = _holdings_now(data, orders)
    comp = compose(holdings, data.cash)
    raw = (_concentration(data, holdings) + _bought_into_storm(data, orders) + _panic_sell(data, orders)
           + _sold_before_payout(data, orders) + _overpaid(orders) + _churning(orders)
           + _held_out_player(data, orders) + _praise(data, orders, holdings))
    insights = _pick(raw)

    equity = data.cash + sum(h.value for h in holdings)
    sells = [o for o in orders if o.realised is not None]
    best = max(sells, key=lambda o: o.realised, default=None)
    worst = min(sells, key=lambda o: o.realised, default=None)
    warnings = [i for i in insights if i.tone == "warning"]
    if warnings:
        lesson = f"{warnings[0].title}: {warnings[0].next_time}"
    elif insights:
        lesson = f"{insights[0].title}. {insights[0].next_time}"
    elif not orders:
        lesson = "Make your first trade: the review fills in as you play."
    else:
        lesson = "No mistakes spotted yet. Keep spreading your money and watch the Storm Radar."

    summary = Summary(
        equity=round(equity, 2),
        return_pct=round(100 * (equity - data.starting_cash) / data.starting_cash, 2) if data.starting_cash else 0.0,
        payouts=round(sum(p.amount for p in data.payments), 2),
        fees=round(sum(o.fee for o in orders), 2),
        trades=len(orders),
        best_trade=TradeResult(best.symbol, best.qty, round(best.realised, 2), best.t) if best else None,
        worst_trade=TradeResult(worst.symbol, worst.qty, round(worst.realised, 2), worst.t) if worst and worst is not best else None,
        max_drawdown_pct=_max_drawdown_pct(data.equity),
        grade=comp.grade,
        grade_reason=comp.reason,
        biggest_lesson=lesson,
    )
    return Review(data.name, summary, insights, _timeline(data, orders))
