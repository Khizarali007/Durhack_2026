import pytest

from trading.money import to_cents, to_hoop


@pytest.mark.parametrize("hoop, cents", [
    (100_000, 10_000_000),
    (105.99, 10_599),
    (0.01, 1),
    (123.455, 12_346),   # half rounds up
    (0.1 + 0.2, 30),     # float noise doesn't leak into cents
])
def test_to_cents(hoop, cents):
    assert to_cents(hoop) == cents


def test_round_trip():
    for cents in (1, 99, 10_599, 10_000_000):
        assert to_cents(to_hoop(cents)) == cents
