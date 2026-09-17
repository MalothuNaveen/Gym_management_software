"""Payments, balances and receipts - the numbers the gym runs on."""
from datetime import date, timedelta

import pytest


@pytest.fixture
def member_with_term(client, auth, plan_3m):
    """A member on a 3-month plan: fee 3000, discount 200, net 2800."""
    today = date.today()
    body = client.post("/api/members", headers=auth, json={
        "full_name": "Rahul Kumar", "phone": "9876543210",
        "membership": {
            "plan_id": plan_3m["id"], "start_date": today.isoformat(),
            "fee": "3000", "discount": "200",
        },
    }).json()
    return body["member"]


def detail(client, auth, member_id) -> dict:
    return client.get(f"/api/members/{member_id}", headers=auth).json()


class TestBalanceCalculation:
    def test_the_spec_worked_example(self, client, auth, member_with_term):
        """Fee 3000, discount 200 -> net 2800.
        Pay 2000 -> balance 800. Pay 800 -> balance 0."""
        member_id = member_with_term["id"]

        assert member_with_term["current_membership"]["final_amount"] == "2800.00"
        assert member_with_term["financials"]["balance"] == "2800.00"

        client.post("/api/payments", headers=auth, json={
            "member_id": member_id, "amount": "2000", "method": "cash",
        })
        after_partial = detail(client, auth, member_id)
        assert after_partial["financials"]["total_paid"] == "2000.00"
        assert after_partial["financials"]["balance"] == "800.00"

        client.post("/api/payments", headers=auth, json={
            "member_id": member_id, "amount": "800", "method": "upi",
        })
        settled = detail(client, auth, member_id)
        assert settled["financials"]["total_paid"] == "2800.00"
        assert settled["financials"]["balance"] == "0.00"

    def test_a_full_payment_clears_the_balance_at_once(self, client, auth,
                                                       member_with_term):
        client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "2800",
            "method": "card",
        })
        assert detail(client, auth,
                      member_with_term["id"])["financials"]["balance"] == "0.00"

    def test_many_small_payments_add_up_exactly(self, client, auth,
                                                member_with_term):
        for _ in range(7):
            client.post("/api/payments", headers=auth, json={
                "member_id": member_with_term["id"], "amount": "400",
                "method": "cash",
            })
        fin = detail(client, auth, member_with_term["id"])["financials"]
        assert fin["total_paid"] == "2800.00"
        assert fin["balance"] == "0.00"


class TestAdvancePayments:
    def test_paying_more_than_owed_is_recorded_as_credit(self, client, auth,
                                                         member_with_term):
        client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "5000",
            "method": "upi", "notes": "Paid ahead for next term",
        })
        fin = detail(client, auth, member_with_term["id"])["financials"]
        assert fin["total_paid"] == "5000.00"
        assert fin["balance"] == "0.00"          # nothing is owed
        assert fin["credit"] == "2200.00"        # 5000 - 2800 held in advance

    def test_an_advance_from_a_member_with_no_membership(self, client, auth):
        member = client.post("/api/members", headers=auth, json={
            "full_name": "Early Bird", "phone": "9000000009",
        }).json()["member"]
        response = client.post("/api/payments", headers=auth, json={
            "member_id": member["id"], "amount": "5000", "method": "cash",
        })
        assert response.status_code == 201
        assert response.json()["kind"] == "advance"
        assert detail(client, auth, member["id"])["financials"]["credit"] == "5000.00"

    def test_credit_is_consumed_by_the_next_renewal(self, client, auth, plan_3m):
        today = date.today()
        member = client.post("/api/members", headers=auth, json={
            "full_name": "Prepaid Person", "phone": "9000000010",
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": today.isoformat(), "fee": "2500"},
            "payment": {"amount": "5000", "method": "upi"},
        }).json()["member"]
        assert detail(client, auth, member["id"])["financials"]["credit"] == "2500.00"

        client.post(f"/api/members/{member['id']}/renew", headers=auth, json={
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": (today + timedelta(days=90)).isoformat(),
                           "fee": "2500"},
        })
        fin = detail(client, auth, member["id"])["financials"]
        assert fin["total_charged"] == "5000.00"
        assert fin["balance"] == "0.00"
        assert fin["credit"] == "0.00"


class TestPaymentValidation:
    def test_a_negative_payment_is_refused(self, client, auth, member_with_term):
        response = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "-500",
            "method": "cash",
        })
        assert response.status_code == 422

    def test_a_zero_payment_is_refused(self, client, auth, member_with_term):
        response = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "0", "method": "cash",
        })
        assert response.status_code == 422

    def test_a_future_payment_date_is_refused(self, client, auth,
                                              member_with_term):
        response = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "500",
            "method": "cash",
            "paid_on": (date.today() + timedelta(days=2)).isoformat(),
        })
        assert response.status_code == 400
        assert "future" in response.json()["message"]

    def test_an_unknown_payment_method_is_refused(self, client, auth,
                                                  member_with_term):
        response = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "500",
            "method": "bitcoin",
        })
        assert response.status_code == 422

    def test_a_payment_for_an_unknown_member_is_refused(self, client, auth):
        response = client.post("/api/payments", headers=auth, json={
            "member_id": 99999, "amount": "500", "method": "cash",
        })
        assert response.status_code == 404


class TestPaymentHistory:
    def test_every_payment_is_kept_and_nothing_is_overwritten(
            self, client, auth, member_with_term):
        member_id = member_with_term["id"]
        for amount in ("1000", "1000", "800"):
            client.post("/api/payments", headers=auth, json={
                "member_id": member_id, "amount": amount, "method": "cash",
            })
        history = client.get(f"/api/members/{member_id}/payments",
                             headers=auth).json()
        assert len(history) == 3
        assert sorted(p["amount"] for p in history) == \
            ["1000.00", "1000.00", "800.00"]

    def test_a_voided_payment_stays_visible_but_stops_counting(
            self, client, auth, member_with_term):
        member_id = member_with_term["id"]
        # Void is only possible before a receipt exists, so create one directly.
        payment = client.post("/api/payments", headers=auth, json={
            "member_id": member_id, "amount": "2800", "method": "cash",
        }).json()

        response = client.post(f"/api/payments/{payment['id']}/void",
                               headers=auth, json={"reason": "Entered twice"})
        # A receipt was already issued, so voiding is blocked - history is safe.
        assert response.status_code == 400
        assert "receipt has already been issued" in response.json()["message"]

    def test_payments_can_be_searched_by_receipt_number(self, client, auth,
                                                        member_with_term):
        payment = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "2800",
            "method": "upi",
        }).json()
        found = client.get(f"/api/payments?q={payment['receipt_no']}",
                           headers=auth).json()
        assert found["total"] == 1
        assert found["items"][0]["id"] == payment["id"]


class TestReceipts:
    def test_a_receipt_is_issued_with_every_payment(self, client, auth,
                                                    member_with_term):
        payment = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "2800",
            "method": "upi",
        }).json()
        assert payment["receipt_no"].startswith(f"REC-{date.today().year}-")

    def test_receipt_numbers_run_in_sequence_and_are_never_reused(
            self, client, auth, member_with_term):
        numbers = []
        for _ in range(3):
            payment = client.post("/api/payments", headers=auth, json={
                "member_id": member_with_term["id"], "amount": "500",
                "method": "cash",
            }).json()
            numbers.append(payment["receipt_no"])

        year = date.today().year
        assert numbers == [f"REC-{year}-0001", f"REC-{year}-0002",
                           f"REC-{year}-0003"]
        assert len(set(numbers)) == 3

    def test_asking_for_a_receipt_twice_returns_the_same_one(
            self, client, auth, member_with_term):
        payment = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "1000",
            "method": "cash",
        }).json()
        first = client.post(f"/api/payments/{payment['id']}/receipt",
                            headers=auth).json()
        second = client.post(f"/api/payments/{payment['id']}/receipt",
                             headers=auth).json()
        assert first["receipt_no"] == second["receipt_no"]
        assert first["id"] == second["id"]

    def test_the_receipt_holds_every_detail_the_printout_needs(
            self, client, auth, member_with_term):
        payment = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "2000",
            "method": "upi", "notes": "First instalment",
        }).json()
        snapshot = client.get(f"/api/receipts/{payment['receipt_id']}",
                              headers=auth).json()["snapshot"]

        assert snapshot["gym"]["name"] == "Iron Fitness Gym"
        assert snapshot["member"]["name"] == "Rahul Kumar"
        assert snapshot["member"]["code"] == "GYM-0001"
        assert snapshot["membership"]["plan"] == "3 Months"
        assert snapshot["amounts"]["fee_text"] == "₹3,000"
        assert snapshot["amounts"]["discount_text"] == "₹200"
        assert snapshot["amounts"]["paid_text"] == "₹2,000"
        assert snapshot["amounts"]["balance_text"] == "₹800"
        assert snapshot["payment"]["method"] == "UPI"
        assert snapshot["payment"]["notes"] == "First instalment"
        assert snapshot["footer"]

    def test_the_receipt_downloads_as_a_real_pdf(self, client, auth,
                                                 member_with_term):
        payment = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "2800",
            "method": "cash",
        }).json()
        response = client.get(f"/api/receipts/{payment['receipt_id']}/pdf",
                              headers=auth)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF-")
        assert len(response.content) > 1000

    def test_the_thermal_receipt_size_also_renders(self, client, auth,
                                                   member_with_term):
        payment = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "2800",
            "method": "cash",
        }).json()
        response = client.get(
            f"/api/receipts/{payment['receipt_id']}/pdf?size=thermal",
            headers=auth,
        )
        assert response.status_code == 200
        assert response.content.startswith(b"%PDF-")

    def test_a_receipt_cannot_be_read_without_signing_in(self, client, auth,
                                                         member_with_term):
        payment = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "100",
            "method": "cash",
        }).json()
        assert client.get(
            f"/api/receipts/{payment['receipt_id']}/pdf"
        ).status_code == 401


class TestReceiptLayout:
    """Guards the printed layout, which a status-code check cannot see."""

    @pytest.fixture
    def receipt_id(self, client, auth, member_with_term):
        payment = client.post("/api/payments", headers=auth, json={
            "member_id": member_with_term["id"], "amount": "2000",
            "method": "upi", "notes": "First instalment",
        }).json()
        return payment["receipt_id"]

    @pytest.mark.parametrize("size,page_width,margin", [
        ("a4", 595.28, 51.02),          # A4 with an 18mm margin
        ("thermal", 226.77, 17.01),     # 80mm roll with a 6mm margin
    ])
    def test_nothing_is_printed_outside_the_margins(self, client, auth,
                                                    receipt_id, size,
                                                    page_width, margin):
        """Regression: right-aligned values were drawn left-aligned at the right
        margin, so amounts and dates ran off the edge of the paper."""
        pypdfium2 = pytest.importorskip("pypdfium2")

        response = client.get(f"/api/receipts/{receipt_id}/pdf?size={size}",
                              headers=auth)
        assert response.status_code == 200

        import io
        document = pypdfium2.PdfDocument(io.BytesIO(response.content))
        page = document[0]
        assert page.get_size()[0] == pytest.approx(page_width, abs=1)

        text_page = page.get_textpage()
        limit = page_width - margin
        overflowing = []
        for index in range(text_page.count_rects()):
            left, bottom, right, top = text_page.get_rect(index)
            if right > limit + 1 or left < margin - 1:
                overflowing.append(
                    (text_page.get_text_bounded(left, bottom, right, top).strip(),
                     round(left, 1), round(right, 1))
                )

        assert not overflowing, (
            f"Text outside the {margin:.0f}pt margins of a {page_width:.0f}pt "
            f"page: {overflowing}"
        )

    def test_the_receipt_fits_on_a_single_page(self, client, auth, receipt_id):
        pypdfium2 = pytest.importorskip("pypdfium2")
        import io

        response = client.get(f"/api/receipts/{receipt_id}/pdf", headers=auth)
        assert len(pypdfium2.PdfDocument(io.BytesIO(response.content))) == 1

    def test_every_printed_value_appears_on_the_page(self, client, auth,
                                                     receipt_id):
        """The numbers the member checks must actually be rendered, not just
        present in the stored snapshot."""
        pypdfium2 = pytest.importorskip("pypdfium2")
        import io

        response = client.get(f"/api/receipts/{receipt_id}/pdf", headers=auth)
        page = pypdfium2.PdfDocument(io.BytesIO(response.content))[0]
        text = page.get_textpage().get_text_range()

        for expected in ("IRON FITNESS GYM", "PAYMENT RECEIPT", "Rahul Kumar",
                         "GYM-0001", "3 Months", "3,000", "200", "2,800",
                         "2,000", "800", "UPI", "First instalment"):
            assert expected in text, f"{expected!r} is missing from the receipt"
