"""Real adapter tests with small historical fixtures; no network or local dataset required."""
import asyncio
import csv
import sqlite3
from dataclasses import asdict

import pytest
from fastapi.testclient import TestClient
from market.engine import LiveMarket
from trading.accounts import create_guest_user
from trading.db import Database
from trading.market_provider import use_market
from trading.money import to_cents
from trading.orders import OrderError, place_market_order


@pytest.fixture
def engine(tmp_path):
    db = tmp_path / 'games.sqlite'
    with sqlite3.connect(db) as conn:
        conn.execute('CREATE TABLE player_games (player_id INTEGER, player_name TEXT, team_abbreviation TEXT, game_date TEXT, game_score REAL, did_not_play INTEGER, game_id INTEGER)')
        conn.executemany('INSERT INTO player_games VALUES (?,?,?,?,?,?,?)', [
            (1, 'Victor Wembanyama', 'SAS', '2024-10-22', 40, 0, 1),
            (2, 'Other Player', 'BOS', '2024-10-23', 10, 0, 2)])
    values = tmp_path / 'values.csv'
    with values.open('w') as f:
        w = csv.writer(f)
        w.writerow(['player_id','player_name','team','expected_game_score','starting_price','prior_games'])
        w.writerow([1,'Victor Wembanyama','SAS',20,100,100])
        w.writerow([2,'Other Player','BOS',10,50,100])
    injuries = tmp_path / 'injuries.csv'
    injuries.write_text('player_id,report_date,report_datetime\n')
    return LiveMarket(database=db, values=values, injuries=injuries)


@pytest.fixture
def account(engine):
    db = Database(':memory:')
    uid = create_guest_user(db).user_id
    yield db, uid
    db.close()


def state(engine):
    return (asdict(engine.quote('WEMBY')), dict(engine.human_shares), engine.human_cash_flow)


def test_preview_has_no_side_effects_and_matches_execution(engine):
    before = state(engine)
    preview = engine.preview_order(symbol='WEMBY', side='buy', qty=30)
    assert state(engine) == before
    actual = engine.submit_order(account_id='a', symbol='WEMBY', side='buy', qty=30)
    assert [(f.qty,f.price,f.counterparty) for f in actual.fills] == [(f.qty,f.price,f.counterparty) for f in preview.fills]
    engine.check_ledger()


def test_finite_inventory_partial_fill(engine):
    result = engine.submit_order(account_id='a', symbol='WEMBY', side='buy', qty=4000)
    assert result.status == 'partially_filled' and result.filled_qty == 3900
    assert engine.quote('WEMBY').ask is None
    engine.check_ledger()


def test_database_failure_rolls_back_market(engine, account, monkeypatch):
    import trading.orders as orders
    db, uid = account
    before = state(engine)
    def broken(*args, **kwargs):
        raise sqlite3.OperationalError('simulated failed account write')
    monkeypatch.setattr(orders, '_record', broken)
    with pytest.raises(sqlite3.OperationalError):
        place_market_order(db, engine, uid, 'WEMBY', 'buy', 10)
    assert state(engine) == before
    engine.check_ledger()


def test_limit_never_crosses_limit_between_makers(engine, account):
    db, uid = account
    m = engine.markets[1]
    for maker in m.makers:
        m.bots[0].holdings[1] += maker.shares - 1
        maker.shares = 1
    limit = to_cents(engine.quote('WEMBY').ask)
    order = place_market_order(db, engine, uid, 'WEMBY', 'buy', 3, limit_price_cents=limit)
    assert order.filled_qty == 1
    assert all(f.price_cents <= limit for f in order.fills)
    engine.check_ledger()


def test_cash_never_negative_and_bots_conserve_after_human_trades(engine, account):
    db, uid = account
    db.conn.execute('UPDATE users SET cash_cents=? WHERE user_id=?',(round(engine.quote('WEMBY').ask*105),uid))
    db.conn.commit()
    outcome = place_market_order(db, engine, uid, 'WEMBY', 'buy', 10)
    assert outcome.filled_qty == 1 and outcome.cash_cents_after >= 0
    for _ in range(125):
        engine.step()
    engine.check_ledger()


def test_daily_data_not_revealed_early_and_replay_stops(engine):
    initial = engine.markets[1].fair_cents
    for _ in range(119):
        engine.step()
    assert engine.markets[1].games_observed == 0
    assert engine.markets[1].ability_score == 20
    assert engine.markets[1].fair_cents < initial  # entitlement detached at noon
    engine.step()
    assert engine.markets[1].games_observed == 1
    assert engine.markets[1].fair_cents > initial
    for _ in range(120):
        engine.step()
    assert engine.finished
    t = engine.market_time()
    engine.step()
    assert engine.market_time() == t
    assert engine.submit_order(account_id='x',symbol='WEMBY',side='buy',qty=1).status == 'rejected'


def test_advanced_orders_disabled(engine, account):
    db, uid = account
    for side, leverage in [('short',1),('cover',1),('buy',3)]:
        with pytest.raises(OrderError):
            place_market_order(db, engine, uid, 'WEMBY', side, 1, leverage=leverage)


def test_http_guest_buy_sell_portfolio_and_fresh_restart(engine, monkeypatch):
    from main import app
    monkeypatch.setenv('SOLANA_RECEIPTS','off')
    async def paused():
        await asyncio.Event().wait()
    monkeypatch.setattr(engine, 'run', paused)
    use_market(engine)
    try:
        with TestClient(app) as c:
            assert c.get('/market/status').json()['engine'] == 'LiveMarket'
            assert len(c.get('/market/players').json()) == 2
            session = c.post('/trading/guest').json()
            headers = {'Authorization': 'Bearer '+session['token']}
            before = sum(q.shares for q in engine.quote('WEMBY').makers)
            buy = c.post('/trading/orders',headers=headers,json={'symbol':'WEMBY','side':'buy','qty':10})
            assert buy.status_code == 200, buy.text
            b = buy.json()
            assert b['position_qty']==10 and b['receipt_status']=='disabled'
            assert sum(q.shares for q in engine.quote('WEMBY').makers) == before-10
            assert c.get('/trading/portfolio',headers=headers).status_code == 200
            sell = c.post('/trading/orders',headers=headers,json={'symbol':'WEMBY','side':'sell','qty':10})
            assert sell.status_code==200, sell.text
            s=sell.json()
            assert s['position_qty']==0
            expected=100000-b['average_price']*10-b['total_fee']+s['average_price']*10-s['total_fee']
            assert s['cash']==pytest.approx(expected,abs=.001)
            assert len(c.get('/trading/trades',headers=headers).json()) > 0
            assert sum(q.shares for q in engine.quote('WEMBY').makers) == before
            assert c.post('/trading/orders',headers=headers,json={'symbol':'WEMBY','side':'short','qty':1}).status_code==400
            engine.check_ledger()
            assert app.state.trading_db.path==':memory:'
        import trading.market_provider as provider
        assert provider._market is None
    finally:
        use_market(None)


def test_actual_sqlite_failure_rolls_back_both_ledgers(engine, account):
    db, uid = account
    before = state(engine)
    db.conn.execute("CREATE TRIGGER reject_cash BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, 'test account failure'); END")
    with pytest.raises(sqlite3.IntegrityError):
        place_market_order(db, engine, uid, 'WEMBY', 'buy', 10)
    assert state(engine) == before
    assert db.conn.execute('SELECT count(*) FROM trades').fetchone()[0] == 0
    assert db.conn.execute('SELECT count(*) FROM positions').fetchone()[0] == 0
    assert db.conn.execute('SELECT cash_cents FROM users').fetchone()[0] == 10000000
    engine.check_ledger()


def test_market_websocket_initial_quote_and_disconnect(engine, monkeypatch):
    from main import app
    monkeypatch.setenv('SOLANA_RECEIPTS','off')
    use_market(engine)
    try:
        with TestClient(app) as c:
            baseline = len(engine._subscribers)
            with c.websocket_connect('/market/ws?symbols=WEMBY') as ws:
                event = ws.receive_json()
                assert event['type']=='market_tick'
                assert set(event['quotes'])=={'WEMBY'}
            # Exiting TestClient closes the market subscriptions cleanly too.
    finally:
        use_market(None)


def test_existing_fake_market_limit_regression():
    from trading.fake_market import FakeMarket
    m = FakeMarket()
    db = Database(':memory:')
    uid = create_guest_user(db).user_id
    for maker in m._markets['SGA'].makers:
        maker.shares = 1
    limit = to_cents(m.quote('SGA').ask)
    order = place_market_order(db, m, uid, 'SGA', 'buy', 3, limit_price_cents=limit)
    assert order.filled_qty == 1
    assert all(f.price_cents<=limit for f in order.fills)
    db.close()


def test_new_reporting_endpoints_with_real_engine(engine, monkeypatch):
    from main import app
    from trading.equity import snapshot_equity
    monkeypatch.setenv('SOLANA_RECEIPTS', 'off')
    use_market(engine)
    try:
        with TestClient(app) as c:
            guest = c.post('/trading/guest').json()
            headers = {'Authorization': 'Bearer ' + guest['token']}
            buy = c.post('/trading/orders', headers=headers,
                         json={'symbol': 'WEMBY', 'side': 'buy', 'qty': 10})
            assert buy.status_code == 200
            snapshot_equity(app.state.trading_db, engine, engine.market_time())
            history = c.get('/trading/equity-history', headers=headers).json()
            assert history['points'] and history['current_equity'] > 0
            board = c.get('/trading/leaderboard', headers=headers).json()
            assert board['source'] == 'off-chain'
            assert board['you']['user_id'] == guest['user_id']
            assert board['you']['equity'] == pytest.approx(history['current_equity'])
            chain = c.get('/trading/chain/portfolio', headers=headers).json()
            assert chain['enabled'] is False and chain['in_sync'] is False
    finally:
        use_market(None)


def prepare_payout(engine, account):
    db, uid = account
    engine.bind_settlement(db)
    place_market_order(db, engine, uid, 'WEMBY', 'buy', 10)
    engine._t = engine.day.timestamp()+43200
    engine._cutoff_day()
    return db,uid,engine.day.date().isoformat()


def test_cutoff_holder_is_paid_after_selling_and_late_buyer_is_not(engine, account):
    from trading.dividends import pending_by_user
    from trading.portfolio import build_portfolio
    db, uid, day = prepare_payout(engine, account)
    pending=pending_by_user(db)[uid]
    assert pending==360
    place_market_order(db, engine, uid, 'WEMBY', 'sell', 10)
    other=create_guest_user(db).user_id
    place_market_order(db, engine, other, 'WEMBY', 'buy', 10)
    before=dict(db.conn.execute('SELECT user_id,cash_cents FROM users'))
    assert build_portfolio(db,engine,uid).equity_cents==before[uid]+pending
    engine._close_day()
    after=dict(db.conn.execute('SELECT user_id,cash_cents FROM users'))
    assert after[uid]-before[uid]==800
    assert after[other]==before[other]
    assert not pending_by_user(db)
    assert engine.institutional_dividends+sum(engine.human_dividends.values())==360000
    assert db.conn.execute('SELECT qty_held,amount_cents FROM payouts WHERE user_id=?',(uid,)).fetchone()[:]==(10,800)
    engine._pay_day(day)
    assert dict(db.conn.execute('SELECT user_id,cash_cents FROM users'))==after
    assert db.conn.execute('SELECT count(*) FROM payouts').fetchone()[0]==1
    engine.check_ledger()


def test_settlement_failure_rolls_back_every_owner_and_can_retry(engine, account):
    db,uid,day=prepare_payout(engine,account)
    before=engine._market_cash()
    cash=db.conn.execute('SELECT cash_cents FROM users WHERE user_id=?',(uid,)).fetchone()[0]
    db.conn.execute("CREATE TRIGGER reject_dividend BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, 'test settlement failure'); END")
    with pytest.raises(sqlite3.IntegrityError):
        engine._pay_day(day)
    assert engine._market_cash()==before and engine.institutional_dividends==0
    assert db.conn.execute('SELECT count(*) FROM payouts').fetchone()[0]==0
    assert db.conn.execute("SELECT count(*) FROM dividend_events WHERE status='settled'").fetchone()[0]==0
    db.conn.execute('DROP TRIGGER reject_dividend')
    engine._pay_day(day)
    assert db.conn.execute('SELECT cash_cents FROM users WHERE user_id=?',(uid,)).fetchone()[0]==cash+800
    engine.check_ledger()


def test_full_event_queue_cannot_drop_money(engine, account):
    db,uid,day=prepare_payout(engine,account)
    q=engine.subscribe()
    for _ in range(q.maxsize):q.put_nowait(None)
    engine._pay_day(day)
    assert db.conn.execute('SELECT sum(amount_cents) FROM payouts').fetchone()[0]==800
    engine.unsubscribe(q)


def test_actual_payout_not_forecast_and_negative_game_pays_zero(engine, account):
    db,uid,day=prepare_payout(engine,account)
    engine.results[day][1]=[-5]
    engine._pay_day(day)
    assert engine.institutional_dividends==0
    assert db.conn.execute('SELECT count(*) FROM payouts').fetchone()[0]==0
    event=db.conn.execute('SELECT per_share,status FROM dividend_events WHERE player_id=1').fetchone()
    assert tuple(event)==(0,'settled')


def test_post_credit_error_rolls_back_market_and_sqlite(engine, account, monkeypatch):
    db,uid,day=prepare_payout(engine,account)
    before=engine._market_cash()
    original=engine.check_ledger
    def fail():
        raise RuntimeError('simulated failure after credits')
    monkeypatch.setattr(engine,'check_ledger',fail)
    with pytest.raises(RuntimeError):
        engine._pay_day(day)
    assert engine._market_cash()==before
    assert not engine.institutional_dividends
    assert db.conn.execute('SELECT count(*) FROM payouts').fetchone()[0]==0
    monkeypatch.setattr(engine,'check_ledger',original)
    engine._pay_day(day)
    original()
