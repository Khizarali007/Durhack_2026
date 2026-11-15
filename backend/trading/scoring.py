"""Independent liquidation estimates, never actual sales or new cash credits.

Each account is valued against the same current dealer book. Unsellable shares
contribute zero realizable cash and are reported, never silently marked at fair
value. Open sell reservations are ignored because all open orders would cancel
on exit. Performance payments already received are already in account cash.
"""
from .money import to_cents
from .orders import fee_cents
from collections import defaultdict
import json


def position_exit(market, symbol, qty):
    if qty < 0:
        raise ValueError('Season challenge supports long positions only')
    if not qty:
        return 0, 0
    result = market.preview_order(symbol=symbol, side='sell', qty=qty)
    proceeds = sum(to_cents(f.price) * f.qty - fee_cents(to_cents(f.price) * f.qty)
                   for f in result.fills)
    return proceeds, qty - result.filled_qty


def season_score(db, market, user_id):
    from .portfolio import build_portfolio
    view = build_portfolio(db, market, user_id)
    exits = [(p.symbol, *position_exit(market, p.symbol, p.qty)) for p in view.positions]
    proceeds = sum(value for _, value, _ in exits)
    score = view.cash_cents + proceeds + view.pending_payouts_cents
    # Include sold positions too: a final report must not forget realised gains
    # or dividends earned before a holding was sold.
    from .portfolio import _realised_and_fees
    with db.lock:
        user = db.conn.execute('SELECT * FROM users WHERE user_id=?', (user_id,)).fetchone()
        trades = db.conn.execute('SELECT symbol,side,qty,price_cents,fee_cents FROM trades WHERE user_id=? AND rowid>? ORDER BY rowid', (user_id,user['start_trade_rowid'])).fetchall()
        payouts = dict(db.conn.execute('SELECT symbol,sum(amount_cents) FROM payouts WHERE user_id=? AND rowid>? GROUP BY symbol', (user_id,user['start_payout_rowid'])).fetchall())
        pending = dict(db.conn.execute("SELECT d.symbol,sum(e.expected_cents) FROM dividend_entitlements e JOIN dividend_events d ON d.event_id=e.event_id WHERE e.user_id=? AND d.status='pending' GROUP BY d.symbol", (user_id,)).fetchall())
    grouped = defaultdict(list)
    for trade in trades:
        grouped[trade['symbol']].append(trade)
    seeds = json.loads(user['start_positions_json'] or '[]')
    positions = {p.symbol:p for p in view.positions}
    net = {s:v for s,v,_ in exits}
    names = {p.symbol:p.name for p in market.players()}
    contributors = []
    for symbol in set(grouped) | set(positions) | set(payouts) | set(pending):
        realised, fees = _realised_and_fees(grouped[symbol], [s for s in seeds if s[0] == symbol])
        basis = positions[symbol].cost_basis_cents if symbol in positions else 0
        trading = realised + net.get(symbol,0) - basis - fees
        q = market.quote(symbol)
        contributors.append({'symbol':symbol, 'name':names.get(symbol,symbol),
            'contribution':(trading+payouts.get(symbol,0)+pending.get(symbol,0))/100,
            'investment_gain':trading/100, 'payouts':payouts.get(symbol,0)/100,
            'pending':pending.get(symbol,0)/100,
            'injury_status':getattr(q,'injury_status',None),
            'analyst_estimate':q.fair_value})
    contributors.sort(key=lambda p:p['contribution'], reverse=True)
    return {'score': score / 100, 'cash': view.cash_cents / 100,
            'contributors':contributors, 'fees_paid':view.fees_cents/100,
            't':market.market_time(), 'session_id':getattr(market,'session_id',''),
            'net_sale_proceeds': proceeds / 100,
            'pending_payouts': view.pending_payouts_cents / 100,
            'payouts_received': view.payouts_cents / 100,
            'starting_cash': view.starting_cash_cents / 100,
            'return_pct': 100 * (score / view.starting_cash_cents - 1),
            'quoted_equity': view.equity_cents / 100,
            'unsold_shares': {s: q for s, _, q in exits if q},
            'finished': getattr(market, 'finished', False),
            'method': 'cash + net liquidation proceeds + pending payout rights'}
