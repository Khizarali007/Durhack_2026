"""Account-specific weekly snapshots, retained for this in-memory replay session.

Capture on the simulation clock, not a browser poll: fast-forward and closed
tabs must not skip weeks. Reading these reports never pauses or trades.
"""
from .scoring import season_score

WEEK = 7 * 86400


class WeeklyReports:
    def __init__(self, db, market):
        self.db, self.market = db, market
        self.baselines = {}
        self.reports = {}
        self.next_t = min(market.start_t + WEEK, market.end.timestamp())

    def ensure(self, user_id):
        if user_id not in self.baselines:
            self.baselines[user_id] = season_score(self.db, self.market, user_id)
            self.reports[user_id] = []

    def before_step(self):
        with self.db.lock:
            users = self.db.conn.execute('SELECT user_id FROM users').fetchall()
        for user in users:
            self.ensure(user['user_id'])

    def after_step(self):
        if self.market.market_time() < self.next_t:
            return
        for uid, before in list(self.baselines.items()):
            after = season_score(self.db, self.market, uid)
            if after['t'] > before['t']:
                self.reports[uid].append({'before': before, 'after': after})
            self.baselines[uid] = after
        self.next_t = min(self.next_t + WEEK, self.market.end.timestamp())

    def for_user(self, user_id):
        self.ensure(user_id)
        return {'session_id': self.market.session_id,
                'reports': self.reports[user_id],
                'next_t': None if self.market.finished else self.next_t}
