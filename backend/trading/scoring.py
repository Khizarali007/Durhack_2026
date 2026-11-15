"""Independent liquidation estimates, never actual sales or new cash credits.

Each account is valued against the same current dealer book. Unsellable shares
contribute zero realizable cash and are reported, never silently marked at fair
value. Open sell reservations are ignored because all open orders would cancel
on exit. Performance payments already received are already in account cash.
"""
from .money import to_cents
from .orders import fee_cents


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
    return {'score': score / 100, 'cash': view.cash_cents / 100,
            'net_sale_proceeds': proceeds / 100,
            'pending_payouts': view.pending_payouts_cents / 100,
            'payouts_received': view.payouts_cents / 100,
            'starting_cash': view.starting_cash_cents / 100,
            'return_pct': 100 * (score / view.starting_cash_cents - 1),
            'quoted_equity': view.equity_cents / 100,
            'unsold_shares': {s: q for s, _, q in exits if q},
            'finished': getattr(market, 'finished', False),
            'method': 'cash + net liquidation proceeds + pending payout rights'}
