"""Session payout journal tables."""
SCHEMA = """
CREATE TABLE IF NOT EXISTS dividend_events (
 event_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, day TEXT NOT NULL,
 player_id INTEGER NOT NULL, symbol TEXT NOT NULL, cutoff_t REAL NOT NULL,
 settled_t REAL, game_score REAL, per_share REAL,
 institutional_snapshot TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 human_paid_cents INTEGER NOT NULL DEFAULT 0,
 institutional_paid_cents INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS dividend_entitlements (
 event_id TEXT NOT NULL REFERENCES dividend_events(event_id),
 user_id TEXT NOT NULL REFERENCES users(user_id), qty INTEGER NOT NULL,
 expected_cents INTEGER NOT NULL, paid_cents INTEGER,
 PRIMARY KEY(event_id,user_id)
);
CREATE INDEX IF NOT EXISTS entitlements_by_user ON dividend_entitlements(user_id);
"""
