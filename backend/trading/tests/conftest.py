"""Shared test setup: an app client backed by a fresh in-memory database.

Tests never touch Solana devnet: receipts go to a FakeSender instead.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

from trading import market_provider
from trading.chain import config as chain_config
from trading.chain import worker as receipt_worker
from trading.db import DB_PATH_ENV
from trading.fake_market import FakeMarket


class FakeSender:
    """Stands in for DevnetSender. Knobs to simulate trouble:

    - fail_times / always_fail: send() raises (devnet down)
    - delay_s: send() is slow
    - reject_times: the chain reports that many sent transactions as failed
    - never_lands: statuses() never sees the transaction
    - status_errors: statuses() raises that many times (rate limited)
    """

    def __init__(self) -> None:
        self.sent: list[tuple[bytes, object]] = []
        self.attempts = 0
        self.fail_times = 0
        self.always_fail = False
        self.delay_s = 0.0
        self.reject_times = 0
        self.never_lands = False
        self.status_errors = 0
        self.status_calls = 0
        self._rejected: set[str] = set()
        self.closed = False

    async def send(self, memo, cosigner):
        self.attempts += 1
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.always_fail or self.fail_times > 0:
            self.fail_times -= 1
            raise ConnectionError("devnet is down")
        self.sent.append((memo, cosigner))
        signature = f"fakesig{len(self.sent)}"
        if self.reject_times > 0:
            self.reject_times -= 1
            self._rejected.add(signature)
        return signature

    async def statuses(self, signatures):
        self.status_calls += 1
        if self.status_errors > 0:
            self.status_errors -= 1
            raise ConnectionError("429 Too Many Requests")
        if self.never_lands:
            return {s: None for s in signatures}
        return {s: "failed" if s in self._rejected else "confirmed" for s in signatures}

    async def close(self):
        self.closed = True


@pytest.fixture(autouse=True)
def fake_sender(monkeypatch):
    sender = FakeSender()
    monkeypatch.setattr(receipt_worker, "sender_factory", lambda: sender)
    monkeypatch.setenv("SOLANA_RECEIPTS", "on")
    monkeypatch.setenv("SOLANA_RECEIPT_RETRY_BASE_S", "0.01")
    return sender


@pytest.fixture(autouse=True)
def temp_fee_payer(tmp_path, monkeypatch):
    """Never create or read the real fee-payer wallet in tests."""
    path = tmp_path / "fee-payer-keypair.json"
    monkeypatch.setattr(chain_config, "FEE_PAYER_PATH", path)
    return path


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv(DB_PATH_ENV, ":memory:")
    market_provider.use_market(FakeMarket(seed=99))  # fresh makers and prices for every test
    from main import app

    with TestClient(app) as c:  # runs the lifespan, so the market ticks in the background
        yield c
    market_provider.use_market(None)


@pytest.fixture
def db(client):
    return client.app.state.trading_db


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
