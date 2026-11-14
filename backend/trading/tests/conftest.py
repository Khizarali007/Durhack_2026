"""Shared test setup: an app client backed by a fresh in-memory database."""

import pytest
from fastapi.testclient import TestClient

from trading import market_provider
from trading.db import DB_PATH_ENV
from trading.fake_market import FakeMarket


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
