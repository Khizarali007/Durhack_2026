"""Backend text money must read exactly like the UI (frontend/tests/currency-cases.json, made by formatHOOP)."""

import json
from pathlib import Path

import pytest

from learning.currency import hoop, pnl, price

CASES = json.loads((Path(__file__).resolve().parents[3] / "frontend" / "tests" / "currency-cases.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=[str(c["units"]) for c in CASES])
def test_backend_formatter_matches_the_ui(case):
    assert hoop(case["units"]) == case["hoop"]
    assert price(case["units"]) == case["price"]
    assert pnl(case["units"]) == case["pnl"]


def test_a_player_starts_with_h100():
    assert hoop(100_000) == "H$100.00"
