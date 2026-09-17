"""Unit tests for the money rules - the arithmetic everything else relies on."""
from decimal import Decimal

import pytest

from app.services.money import (
    MoneyError, compute_balance, compute_final_amount, format_inr, money,
)


class TestMoneyCoercion:
    @pytest.mark.parametrize("value,expected", [
        (1000, "1000.00"),
        ("1000", "1000.00"),
        (1000.5, "1000.50"),
        ("2500.456", "2500.46"),      # rounds half up
        ("2500.454", "2500.45"),
        (None, "0.00"),
        (Decimal("0.005"), "0.01"),
    ])
    def test_quantizes_to_two_places(self, value, expected):
        assert str(money(value)) == expected

    def test_rejects_negative_amounts(self):
        with pytest.raises(MoneyError, match="cannot be negative"):
            money(-100, field="payment amount")

    def test_rejects_garbage(self):
        with pytest.raises(MoneyError):
            money("abc")


class TestFinalAmount:
    def test_fee_minus_discount(self):
        """The worked example from the spec: 3000 - 200 = 2800."""
        assert compute_final_amount(3000, 200) == Decimal("2800.00")

    def test_zero_discount(self):
        assert compute_final_amount(2500, 0) == Decimal("2500.00")

    def test_full_discount_is_allowed(self):
        assert compute_final_amount(1000, 1000) == Decimal("0.00")

    def test_discount_cannot_exceed_fee(self):
        with pytest.raises(MoneyError, match="more than the membership fee"):
            compute_final_amount(1000, 1500)

    def test_negative_discount_rejected(self):
        with pytest.raises(MoneyError):
            compute_final_amount(1000, -100)


class TestBalance:
    def test_partial_payment_leaves_a_balance(self):
        assert compute_balance(Decimal("2800"), Decimal("2000")) == Decimal("800.00")

    def test_full_payment_clears_the_balance(self):
        assert compute_balance(Decimal("2800"), Decimal("2800")) == Decimal("0.00")

    def test_overpayment_is_negative_meaning_credit(self):
        assert compute_balance(Decimal("2800"), Decimal("5000")) == Decimal("-2200.00")


class TestIndianFormatting:
    @pytest.mark.parametrize("value,expected", [
        (1000, "₹1,000"),
        (15500, "₹15,500"),
        (125000, "₹1,25,000"),
        (4500, "₹4,500"),
        (100, "₹100"),
        (0, "₹0"),
        (10000000, "₹1,00,00,000"),
        (Decimal("2500.50"), "₹2,500.50"),
        (Decimal("-800"), "-₹800"),
    ])
    def test_lakh_crore_grouping(self, value, expected):
        assert format_inr(value) == expected
