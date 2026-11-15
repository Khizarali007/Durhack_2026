"""Repeatable CPU/liquidity and optional strategy smoke test; no network or UI state."""
import argparse
import json
import random
import resource
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from market.engine import LiveMarket
from trading.accounts import create_guest_user
from trading.db import Database
from trading.orders import place_market_order, OrderError
from trading.scoring import season_score


def run(count, funding, days, strategies=False, seed=2026):
    start = time.perf_counter()
    m = LiveMarket(bot_count=count, bot_funding=funding, seed=seed)
    db = Database(':memory:')
    m.bind_settlement(db)
    users = {}
    if strategies:
        roster = [p for p in m.players() if m.markets[p.player_id].prior_games >= 20]
        random_players = random.Random(197).sample(roster, 20)
        choices = {'cash': [], 'established': sorted(roster, key=lambda p:p.start_price, reverse=True)[:10],
                   'diversified': random.Random(910).sample(roster, 50), 'random_hold':random_players,
                   'frequent_trader':random_players}
        for name, stocks in choices.items():
            uid = create_guest_user(db).user_id
            users[name] = uid
            for p in stocks:
                qty = max(1,int((95000/len(stocks))/(m.quote(p.symbol).ask*1.02)))
                place_market_order(db,m,uid,p.symbol,'buy',min(10000,qty))
    initialized = time.perf_counter()
    daniels = next(p for p in m.players() if p.name == 'Dyson Daniels')
    observations = []
    stop = min(m.end.timestamp(),m.start_t + days*86400)
    last_day = m.day
    while m.market_time() < stop:
        m.step(target_t=stop)
        if m.day != last_day:
            last_day = m.day
            q=m.quote(daniels.symbol)
            observations.append((q.last,q.quoted_price,q.fair_value))
            if strategies and not m.finished:
                uid=users['frequent_trader']
                symbol,qty = db.conn.execute('SELECT symbol,qty FROM positions WHERE user_id=? ORDER BY symbol LIMIT 1',(uid,)).fetchone() or (None,0)
                if symbol and qty:
                    try:
                        place_market_order(db,m,uid,symbol,'sell',qty)
                        place_market_order(db,m,uid,symbol,'buy',qty)
                    except OrderError:
                        pass
    ended=time.perf_counter()
    m.check_ledger()
    bots=next(iter(m.markets.values())).bots
    scores={name:season_score(db,m,uid) for name,uid in users.items()}
    style={s:{'orders':sum(b.orders_total for b in bots if b.style==s),
              'cash':sum(b.cash for b in bots if b.style==s)/100} for s in {b.style for b in bots}}
    result={'bots':count,'funding':funding,'seed':seed,'days':len(observations),
            'initialization_seconds':round(initialized-start,3),'replay_seconds':round(ended-initialized,3),
            'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            'orders':sum(b.orders_total for b in bots),'styles':style,
            'daniels':{'last_trade_changes':sum(a[0]!=b[0] for a,b in zip(observations,observations[1:])),
                       'last_trade':observations[-1][0],'quoted_price':observations[-1][1],'estimate':observations[-1][2]},
            'two_sided_markets':sum(m.quote(p.symbol).bid is not None and m.quote(p.symbol).ask is not None for p in m.players()),
            'scores':scores,'conservation':'passed'}
    db.close()
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bots',type=int,default=300)
    p.add_argument('--funding',choices=['fixed','per_bot'],default='fixed')
    p.add_argument('--days',type=int,default=174)
    p.add_argument('--seed',type=int,default=2026)
    p.add_argument('--strategies',action='store_true')
    a=p.parse_args()
    print(json.dumps(run(a.bots,a.funding,a.days,a.strategies,a.seed),indent=2))
