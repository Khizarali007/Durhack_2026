"""P2-18: Level 1, every player's portfolio as a Solana account.

A FakeChain stands in for devnet and runs the same rules as the Rust program
(program/lib.rs): only the authority writes, create once, sequence numbers
must go up. Set HOOP_DEVNET_TESTS=1 and SOLANA_PORTFOLIO_PROGRAM_ID to check
against the real deployed program.
"""

import asyncio
import os
import re
import struct
from pathlib import Path

import pytest
from solders.keypair import Keypair
from solders.pubkey import Pubkey

from trading.accounts import create_account, create_guest_user
from trading.adapters import TradesAdapter
from trading.chain.portfolio_program import (
    ACCOUNT_DISCRIMINATOR,
    ACCOUNT_SIZE,
    CREATE_IX,
    MAX_HOLDINGS,
    UPDATE_ARGS_SIZE,
    UPDATE_IX,
    PortfolioState,
    decode_portfolio,
    encode_account,
    encode_update_args,
    portfolio_address,
)
from trading.chain.portfolio_sync import PortfolioSyncer
from trading.chain.wallets import ensure_wallet
from trading.db import Database
from trading.fake_market import FakeMarket
from trading.leaderboard import chain_standings, standings
from trading.orders import place_market_order
from trading.payouts import apply_payout
from trading.market_contract import PerformancePayout
from trading.portfolio import build_portfolio
from trading.tests.conftest import auth

LIB_RS = Path(__file__).resolve().parents[1] / "chain" / "program" / "lib.rs"
PROGRAM_ID = Keypair().pubkey()  # stands in for the deployed program id


class FakeChain:
    """Devnet, as far as the syncer can tell, enforcing the program's rules."""

    def __init__(self):
        self.payer_pubkey = Keypair().pubkey()
        self.accounts: dict[str, bytes] = {}
        self.pending: dict[str, list] = {}       # signature -> instructions, applied when confirmed
        self.results: dict[str, str] = {}
        self.sent = 0
        self.fail_sends = 0
        self.drop_next = False                    # the next transaction never lands
        self.down = False

    async def account_exists(self, address):
        if self.down:
            raise ConnectionError("devnet is down")
        return str(address) in self.accounts

    async def send_instructions(self, instructions):
        if self.down or self.fail_sends:
            self.fail_sends = max(0, self.fail_sends - 1)
            raise ConnectionError("devnet is down")
        self.sent += 1
        signature = f"sig{self.sent}"
        if self.drop_next:
            self.drop_next = False
            return signature
        self.results[signature] = self._apply(instructions)
        return signature

    def _apply(self, instructions):
        staged = dict(self.accounts)
        for ix in instructions:
            assert ix.program_id == PROGRAM_ID
            address = str(ix.accounts[0].pubkey)
            authority = ix.accounts[1].pubkey
            assert ix.accounts[1].is_signer and authority == self.payer_pubkey
            if ix.data[:8] == CREATE_IX:
                owner = ix.accounts[2].pubkey
                assert address == str(portfolio_address(PROGRAM_ID, authority, owner))
                if address in staged:
                    return "failed"  # already in use
                staged[address] = encode_account(authority, owner, PortfolioState(0, 0, 0, 0, 0))
            elif ix.data[:8] == UPDATE_IX:
                if address not in staged:
                    return "failed"
                current = decode_portfolio(address, staged[address])
                assert current.authority == str(authority)
                args = ix.data[8:]
                seq = struct.unpack_from("<qqIqQB", args)[4]
                if seq <= current.state.seq:
                    return "failed"  # StaleUpdate
                staged[address] = (ACCOUNT_DISCRIMINATOR + bytes(authority) + Pubkey.from_string(current.owner).__bytes__()
                                   + args + bytes([current.bump]))
        self.accounts = staged  # all or nothing, like a transaction
        return "confirmed"

    async def statuses(self, signatures):
        if self.down:
            raise ConnectionError("devnet is down")
        return {s: self.results.get(s) for s in signatures}

    async def program_accounts(self, program_id, data_size, offset, owner_field):
        if self.down:
            raise ConnectionError("devnet is down")
        return [(a, d) for a, d in self.accounts.items()
                if len(d) == data_size and d[offset:offset + 32] == bytes(owner_field)]


@pytest.fixture
def setup():
    db = Database(":memory:")
    market = FakeMarket(seed=18)
    chain = FakeChain()
    syncer = PortfolioSyncer(db, market, chain, PROGRAM_ID, min_gap_s=0, max_sends_per_round=50,
                             read_cache_s=0)
    return db, market, chain, syncer


def run(coro):
    return asyncio.run(coro)


def on_chain(chain, syncer, db, user_id):
    owner = Pubkey.from_string(ensure_wallet(db, user_id))
    data = chain.accounts.get(str(syncer.address_for(owner)))
    return decode_portfolio(str(syncer.address_for(owner)), data) if data else None


def sync(syncer):
    """One full round: send, then confirm what was sent."""
    sent = run(syncer.run_once())
    run(syncer.check_sent())
    return sent


# --- The program's wire format --------------------------------------------------------------

def test_layout_matches_the_rust_program():
    rust = LIB_RS.read_text()
    assert re.search(r"pub const MAX_HOLDINGS: usize = 16;", rust) and MAX_HOLDINGS == 16
    assert "8 + 32 + 32 + 8 + 8 + 4 + 8 + 8 + 1 + MAX_HOLDINGS * (SYMBOL_LEN + 8) + 1" in rust
    assert ACCOUNT_SIZE == 8 + 32 + 32 + 8 + 8 + 4 + 8 + 8 + 1 + 16 * 16 + 1 == 366
    assert UPDATE_ARGS_SIZE == 293
    # Field order in Portfolio and PortfolioUpdate, as the Python encoder writes them:
    fields = re.findall(r"pub (\w+): ", rust.split("pub struct Portfolio {")[1].split("}")[0])
    assert fields == ["authority", "owner", "cash_cents", "equity_cents", "trade_count", "updated_t", "seq",
                      "holding_count", "holdings", "bump"]
    update = re.findall(r"pub (\w+): ", rust.split("pub struct PortfolioUpdate {")[1].split("}")[0])
    assert update == fields[2:-1]


def test_encode_and_decode_round_trip():
    authority, owner = Keypair().pubkey(), Keypair().pubkey()
    state = PortfolioState(-123_456, 9_876_543, 7, 1_729_555_206, 42, (("SGA", 20), ("WEMBY", -40), ("GIANNIS", 3)))
    data = encode_account(authority, owner, state, bump=254)
    assert len(data) == ACCOUNT_SIZE
    back = decode_portfolio("addr", data)
    assert (back.authority, back.owner, back.state, back.bump) == (str(authority), str(owner), state, 254)
    assert len(encode_update_args(state)) == UPDATE_ARGS_SIZE
    with pytest.raises(ValueError):
        decode_portfolio("addr", b"\0" * ACCOUNT_SIZE)
    with pytest.raises(ValueError):
        encode_update_args(PortfolioState(0, 0, 0, 0, 1, tuple((f"P{i}", 1) for i in range(17))))


def test_discriminators_are_anchors():
    import hashlib
    assert CREATE_IX == hashlib.sha256(b"global:create_portfolio").digest()[:8]
    assert ACCOUNT_DISCRIMINATOR == hashlib.sha256(b"account:Portfolio").digest()[:8]


# --- Syncing ---------------------------------------------------------------------------------

def test_a_trade_creates_and_fills_the_portfolio_account(setup):
    db, market, chain, syncer = setup
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 20)
    place_market_order(db, market, user_id, "WEMBY", "short", 10)

    assert sync(syncer) == [user_id]
    p = on_chain(chain, syncer, db, user_id)
    view = build_portfolio(db, market, user_id)
    assert p.state.cash_cents == view.cash_cents
    assert dict(p.state.holdings) == {"SGA": 20, "WEMBY": -10}
    assert (p.state.trade_count, p.state.seq) == (2, 1)
    assert p.authority == str(chain.payer_pubkey) and p.owner == ensure_wallet(db, user_id)
    row = db.conn.execute("SELECT status, created FROM chain_portfolios WHERE user_id = ?", (user_id,)).fetchone()
    assert tuple(row) == ("confirmed", 1)


def test_only_changes_are_sent(setup):
    db, market, chain, syncer = setup
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 5)
    sync(syncer)
    market.step()  # prices move, but cash and holdings didn't
    assert sync(syncer) == [] and chain.sent == 1
    place_market_order(db, market, user_id, "SGA", "sell", 2)
    assert sync(syncer) == [user_id]
    p = on_chain(chain, syncer, db, user_id)
    assert dict(p.state.holdings) == {"SGA": 3} and p.state.seq == 2 and chain.sent == 2  # no second create


def test_payouts_and_liquidations_are_picked_up_too(setup):
    db, market, chain, syncer = setup
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 10)
    sync(syncer)
    apply_payout(db, PerformancePayout(market.market_time(), "SGA", 0.6, 30.0, "SGA: 30"))
    sync(syncer)
    assert on_chain(chain, syncer, db, user_id).state.cash_cents == build_portfolio(db, market, user_id).cash_cents


def test_players_in_a_mission_keep_their_real_account_on_chain(setup):
    db, market, chain, syncer = setup
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 10)
    sync(syncer)
    real = on_chain(chain, syncer, db, user_id).state
    adapter = TradesAdapter(db, lambda: market)
    adapter.apply_start_state(user_id, 900_000.0, [])
    sync(syncer)
    assert on_chain(chain, syncer, db, user_id).state == real  # the sandbox never reaches the chain
    adapter.restore_start_state(user_id)
    sync(syncer)
    assert on_chain(chain, syncer, db, user_id).state.cash_cents == real.cash_cents


def test_failed_sends_retry_and_lost_transactions_resend_with_a_higher_seq(setup):
    db, market, chain, syncer = setup
    syncer.landing_timeout_s = 0
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 4)

    chain.fail_sends = 1
    assert run(syncer.run_once()) == []           # devnet down: nothing recorded as sent
    chain.drop_next = True
    assert run(syncer.run_once()) == [user_id]    # sent, but it never lands
    run(syncer.check_sent())                      # timed out: will be sent again
    assert on_chain(chain, syncer, db, user_id) is None
    sync(syncer)
    p = on_chain(chain, syncer, db, user_id)
    assert p is not None and p.state.seq == 3 and dict(p.state.holdings) == {"SGA": 4}


def test_an_existing_account_is_updated_not_recreated(setup):
    db, market, chain, syncer = setup
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 4)
    sync(syncer)
    with db.lock, db.conn:  # the database forgot it made the account (e.g. a restore from backup)
        db.conn.execute("UPDATE chain_portfolios SET created = 0, synced_hash = NULL WHERE user_id = ?", (user_id,))
    sync(syncer)
    row = db.conn.execute("SELECT status, seq FROM chain_portfolios WHERE user_id = ?", (user_id,)).fetchone()
    assert tuple(row) == ("confirmed", 2)


def test_only_the_16_biggest_holdings_fit(setup):
    db, market, chain, syncer = setup
    user_id = create_guest_user(db).user_id
    with db.lock, db.conn:
        db.conn.executemany("INSERT INTO positions (user_id, symbol, qty, cost_basis_cents) VALUES (?, ?, ?, ?)",
                            [(user_id, p.symbol, 1 + i, 100) for i, p in enumerate(market.players())])
    sync(syncer)
    assert len(on_chain(chain, syncer, db, user_id).state.holdings) == min(16, len(market.players()))


# --- The leaderboard read from the chain ------------------------------------------------------

def test_leaderboard_read_from_the_chain_matches_the_database(setup):
    """The ticket's 'done when': the leaderboard reads correctly from the (fake) devnet accounts."""
    db, market, chain, syncer = setup
    alice = create_account(db, "alice", "secret1").user_id
    bob, carol = create_guest_user(db).user_id, create_guest_user(db).user_id
    place_market_order(db, market, alice, "SGA", "buy", 60)
    place_market_order(db, market, bob, "JOKIC", "short", 30)
    place_market_order(db, market, carol, "FOX", "buy", 10)
    sync(syncer)
    market.step()

    from_chain = chain_standings(db, market, run(syncer.read_accounts()))
    from_db = standings(db, market)
    assert [(s.user_id, s.equity_cents) for s in from_chain] == [(s.user_id, s.equity_cents) for s in from_db]
    assert all(s.chain_verified and s.portfolio_address for s in from_chain)
    assert next(s for s in from_chain if s.user_id == alice).name == "alice"


def test_chain_leaderboard_lags_until_the_next_sync(setup):
    db, market, chain, syncer = setup
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 10)
    sync(syncer)
    place_market_order(db, market, user_id, "SGA", "sell", 10)   # not synced yet
    [row] = chain_standings(db, market, run(syncer.read_accounts()))
    assert row.equity_cents != build_portfolio(db, market, user_id).equity_cents
    sync(syncer)
    [row] = chain_standings(db, market, run(syncer.read_accounts()))
    assert row.equity_cents == build_portfolio(db, market, user_id).equity_cents


def test_portfolios_from_other_databases_are_left_off(setup):
    """Found live: the devnet test leaves a portfolio whose wallet this server has never seen."""
    db, market, chain, syncer = setup
    stranger = Keypair().pubkey()
    address = str(portfolio_address(PROGRAM_ID, chain.payer_pubkey, stranger))
    chain.accounts[address] = encode_account(chain.payer_pubkey, stranger,
                                             PortfolioState(50_000_000, 50_000_000, 1, 0, 1, (("SGA", 1),)))
    user_id = create_guest_user(db).user_id
    place_market_order(db, market, user_id, "SGA", "buy", 3)
    sync(syncer)
    assert len(run(syncer.read_accounts())) == 2
    assert [s.user_id for s in chain_standings(db, market, run(syncer.read_accounts()))] == [user_id]


# --- Over the API -------------------------------------------------------------------------------

def test_leaderboard_api_uses_the_chain_and_falls_back_quietly(client, db):
    chain = FakeChain()
    market = client.app.state.trades_adapter._market()
    syncer = PortfolioSyncer(db, market, chain, PROGRAM_ID, min_gap_s=0, read_cache_s=0)
    client.app.state.portfolios = syncer
    p = client.post("/trading/session").json()
    client.post("/trading/orders", headers=auth(p["token"]), json={"symbol": "SGA", "side": "buy", "qty": 7})

    empty = client.get("/trading/leaderboard").json()
    assert empty["source"] == "off-chain" and empty["chain_error"] == "no portfolios on-chain yet"

    client.portal.call(syncer.run_once)
    client.portal.call(syncer.check_sent)
    board = client.get("/trading/leaderboard", headers=auth(p["token"])).json()
    assert board["source"] == "chain" and board["chain_error"] is None
    [row] = board["entries"]
    assert row["chain_verified"] and row["user_id"] == p["user_id"] and row["portfolio_explorer_url"]
    assert board["you"]["user_id"] == p["user_id"]

    status = client.get("/trading/chain/portfolio", headers=auth(p["token"])).json()
    assert status["enabled"] and status["status"] == "confirmed" and status["in_sync"]
    assert status["address"] == row["portfolio_address"]

    chain.down = True  # devnet goes down: the page still works
    fallback = client.get("/trading/leaderboard").json()
    assert fallback["source"] == "off-chain" and "couldn't read Solana" in fallback["chain_error"]
    assert fallback["entries"][0]["user_id"] == p["user_id"]
    assert client.get("/trading/leaderboard", params={"source": "chain"}).status_code == 503
    assert client.get("/trading/leaderboard", params={"source": "off-chain"}).json()["chain_error"] is None


def test_level_1_off_by_default(client):
    assert client.app.state.portfolios is None
    board = client.get("/trading/leaderboard").json()
    assert board["source"] == "off-chain" and "isn't switched on" in board["chain_error"]
    assert client.get("/trading/leaderboard", params={"source": "chain"}).status_code == 503
    p = client.post("/trading/session").json()
    assert client.get("/trading/chain/portfolio", headers=auth(p["token"])).json()["enabled"] is False


# --- Real devnet (opt-in) -------------------------------------------------------------------------

@pytest.mark.skipif(not (os.environ.get("HOOP_DEVNET_TESTS") and os.environ.get("SOLANA_PORTFOLIO_PROGRAM_ID")),
                    reason="set HOOP_DEVNET_TESTS=1 and SOLANA_PORTFOLIO_PROGRAM_ID to use the deployed program")
def test_against_the_deployed_program_on_devnet(monkeypatch):
    from trading.chain import config
    from trading.chain.receipts import DevnetSender
    monkeypatch.setattr(config, "FEE_PAYER_PATH", config.REPO_ROOT / ".solana" / "fee-payer-keypair.json")

    async def scenario():
        db = Database(":memory:")
        market = FakeMarket(seed=181)
        chain = DevnetSender()
        syncer = PortfolioSyncer(db, market, chain, Pubkey.from_string(os.environ["SOLANA_PORTFOLIO_PROGRAM_ID"]),
                                 min_gap_s=0, read_cache_s=0)
        user_id = create_guest_user(db).user_id
        place_market_order(db, market, user_id, "SGA", "buy", 12)
        place_market_order(db, market, user_id, "WEMBY", "short", 5)
        assert await syncer.run_once() == [user_id]
        for _ in range(30):
            await asyncio.sleep(1)
            await syncer.check_sent()
            if db.conn.execute("SELECT status FROM chain_portfolios").fetchone()[0] != "sent":
                break
        assert db.conn.execute("SELECT status FROM chain_portfolios").fetchone()[0] == "confirmed"
        mine = [a for a in await syncer.read_accounts() if a.owner == ensure_wallet(db, user_id)]
        assert mine and dict(mine[0].state.holdings) == {"SGA": 12, "WEMBY": -5}
        await chain.close()

    asyncio.run(scenario())


@pytest.mark.parametrize('symbols', [['NBA1234567'], [f'P{i}' for i in range(17)]])
def test_unsupported_portfolio_is_not_partially_synced(setup, symbols):
    from trading.chain.portfolio_sync import portfolio_encoding_errors
    db, market, chain, syncer = setup
    uid = create_guest_user(db).user_id
    with db.conn:
        db.conn.executemany('INSERT INTO positions (user_id, symbol, qty, cost_basis_cents) VALUES (?, ?, 1, 100)',
                            [(uid, symbol) for symbol in symbols])
    assert uid in portfolio_encoding_errors(db)
    assert uid not in syncer.desired()
    assert run(syncer.run_once()) == []
    assert chain.sent == 0


def test_chain_leaderboard_falls_back_for_unrepresentable_holdings(client, db):
    from types import SimpleNamespace
    from trading.tests.conftest import auth
    market = FakeMarket()
    uid = create_guest_user(db).user_id
    # Use 17 supported symbols in a custom fake market, so local standings can price all positions.
    from trading.market_contract import Player
    from trading.market_provider import use_market
    market = FakeMarket(players=tuple(Player(i, f'P{i}', f'Player {i}', 'NBA', 100) for i in range(17)))
    use_market(market)
    with db.conn:
        db.conn.executemany('INSERT INTO positions (user_id, symbol, qty, cost_basis_cents) VALUES (?, ?, 1, 10000)',
                            [(uid, p.symbol) for p in market.players()])
    client.app.state.portfolios = SimpleNamespace()  # must fall back before trying any chain read
    board = client.get('/trading/leaderboard').json()
    assert board['source'] == 'off-chain' and 'format' in board['chain_error']
    assert board['entries'][0]['equity'] == 101700
    assert client.get('/trading/leaderboard?source=chain').status_code == 503
    client.app.state.portfolios = None
