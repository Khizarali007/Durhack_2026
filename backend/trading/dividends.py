"""Idempotent, transactional settlement for LiveMarket's detached payout rights.

The journal lives in the same SQLite database as accounts. LiveMarket currently
uses a fresh in-memory DB per session; it is not persistence across restarts.
"""
import json
import time
from collections import defaultdict
from contextlib import contextmanager
from .payouts import payout_cents




def pending_by_user(db):
    with db.lock:
        return dict(db.conn.execute("SELECT e.user_id, sum(e.expected_cents) FROM dividend_entitlements e JOIN dividend_events d ON d.event_id=e.event_id WHERE d.status='pending' GROUP BY e.user_id").fetchall())


class DividendSettlement:
    def __init__(self, db, notify_user=None, notify_public=None):
        self.db = db
        self.notify_user, self.notify_public = notify_user, notify_public

    @contextmanager
    def transaction(self):
        with self.db.lock, self.db.conn:
            yield

    def snapshot(self, session, day, records, cutoff_t):
        with self.transaction():
            for pid, r in records.items():
                eid = f'{session}:{day}:{pid}'
                if self.db.conn.execute('SELECT 1 FROM dividend_events WHERE event_id=?',(eid,)).fetchone():
                    continue
                self.db.conn.execute('INSERT INTO dividend_events(event_id,session_id,day,player_id,symbol,cutoff_t,institutional_snapshot) VALUES(?,?,?,?,?,?,?)',
                                     (eid,session,day,pid,r['symbol'],cutoff_t,json.dumps({'makers':r['makers'],'bots':r['bots']})))
                self.db.conn.executemany('INSERT INTO dividend_entitlements(event_id,user_id,qty,expected_cents) VALUES(?,?,?,?)',
                                        [(eid,uid,qty,payout_cents(qty,r['expected'])) for uid,qty in r['humans'].items() if qty])

    def apply(self, session, day, records, scores, when, institutional_totals):
        """Caller holds transaction, including the in-memory market credit operation."""
        notifications=[]
        for pid,r in records.items():
            eid=f'{session}:{day}:{pid}'
            event=self.db.conn.execute('SELECT status FROM dividend_events WHERE event_id=?',(eid,)).fetchone()
            if event is None:
                raise RuntimeError('Missing payout entitlement snapshot')
            if event['status']=='settled':
                continue
            score,rate=scores.get(pid,(0.,0.))
            human_total=0
            for row in self.db.conn.execute('SELECT user_id,qty FROM dividend_entitlements WHERE event_id=?',(eid,)).fetchall():
                uid,qty=row
                amount=payout_cents(qty,rate)
                human_total+=amount
                self.db.conn.execute('UPDATE dividend_entitlements SET paid_cents=? WHERE event_id=? AND user_id=?',(amount,eid,uid))
                if amount:
                    payout_id=f'div:{eid}:{uid}'
                    reason=f"{r['symbol']}: {score:g} Game Score; held at daily cutoff"
                    self.db.conn.execute('INSERT INTO payouts(payout_id,user_id,symbol,qty_held,hoop_per_share,amount_cents,game_score,reason,t,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
                                         (payout_id,uid,r['symbol'],qty,rate,amount,score,reason,when,time.time()))
                    self.db.conn.execute('UPDATE users SET cash_cents=cash_cents+? WHERE user_id=?',(amount,uid))
                    cash=self.db.conn.execute('SELECT cash_cents FROM users WHERE user_id=?',(uid,)).fetchone()[0]
                    notifications.append((uid,{'type':'payout','payout_id':payout_id,'event_id':eid,'symbol':r['symbol'],
                        'qty_held':qty,'hoop_per_share':rate,'dollars_per_share':rate,'amount':amount/100,
                        'cash':cash/100,'game_score':score,'reason':reason,'t':when}))
            self.db.conn.execute("UPDATE dividend_events SET status='settled',settled_t=?,game_score=?,per_share=?,human_paid_cents=?,institutional_paid_cents=? WHERE event_id=?",
                                 (when,score,rate,human_total,institutional_totals[pid],eid))
        return notifications

    def notify(self, notifications):
        for uid,message in notifications:
            if self.notify_user:
                self.notify_user(uid,message)
