"""Membership terms, expiry and renewal."""
from datetime import date, timedelta

import pytest

from app.services.membership import compute_end_date, next_start_date


class TestEndDateCalculation:
    def test_the_start_day_counts_as_day_one(self):
        """A 30-day plan starting 1 Jan runs through 30 Jan, not 31 Jan."""
        assert compute_end_date(date(2026, 1, 1), 30) == date(2026, 1, 30)

    @pytest.mark.parametrize("days,expected", [
        (30, date(2026, 10, 16)),
        (90, date(2026, 12, 15)),
        (180, date(2027, 3, 15)),
        (365, date(2027, 9, 16)),
    ])
    def test_standard_plan_lengths(self, days, expected):
        assert compute_end_date(date(2026, 9, 17), days) == expected

    def test_leap_years_are_handled(self):
        assert compute_end_date(date(2028, 2, 1), 30) == date(2028, 3, 1)


class TestRenewalStartDate:
    def test_a_running_term_is_extended_from_its_end(self):
        """The member does not lose the days they already paid for."""
        today = date(2026, 9, 17)
        assert next_start_date(date(2026, 9, 30), today) == date(2026, 10, 1)

    def test_a_lapsed_term_restarts_today(self):
        today = date(2026, 9, 17)
        assert next_start_date(date(2026, 8, 1), today) == today

    def test_a_member_with_no_history_starts_today(self):
        today = date(2026, 9, 17)
        assert next_start_date(None, today) == today


class TestMembershipCreation:
    def test_the_end_date_comes_from_the_plan_automatically(self, client, auth,
                                                            plan_3m):
        today = date.today()
        member = client.post("/api/members", headers=auth, json={
            "full_name": "Auto Dates", "phone": "9000000001",
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": today.isoformat(), "fee": "2500"},
        }).json()["member"]
        expected = (today + timedelta(days=89)).isoformat()
        assert member["current_membership"]["end_date"] == expected

    def test_the_owner_can_override_the_end_date(self, client, auth, plan_3m):
        today = date.today()
        custom_end = (today + timedelta(days=100)).isoformat()
        member = client.post("/api/members", headers=auth, json={
            "full_name": "Custom Term", "phone": "9000000002",
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": today.isoformat(),
                           "end_date": custom_end, "fee": "2500"},
        }).json()["member"]
        assert member["current_membership"]["end_date"] == custom_end

    def test_an_end_date_before_the_start_date_is_refused(self, client, auth,
                                                          plan_3m):
        today = date.today()
        response = client.post("/api/members", headers=auth, json={
            "full_name": "Backwards", "phone": "9000000003",
            "membership": {
                "plan_id": plan_3m["id"], "start_date": today.isoformat(),
                "end_date": (today - timedelta(days=5)).isoformat(),
                "fee": "2500",
            },
        })
        assert response.status_code == 422

    def test_a_discount_larger_than_the_fee_is_refused(self, client, auth,
                                                       plan_3m):
        response = client.post("/api/members", headers=auth, json={
            "full_name": "Over Discount", "phone": "9000000004",
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": date.today().isoformat(),
                           "fee": "2500", "discount": "3000"},
        })
        assert response.status_code == 400
        assert "discount cannot be more" in response.json()["message"]


class TestRenewal:
    @pytest.fixture
    def member(self, client, auth, plan_3m):
        today = date.today()
        return client.post("/api/members", headers=auth, json={
            "full_name": "Renewing Rahul", "phone": "9876543210",
            "membership": {
                "plan_id": plan_3m["id"],
                "start_date": (today - timedelta(days=88)).isoformat(),
                "fee": "2500",
            },
            "payment": {"amount": "2500", "method": "cash"},
        }).json()["member"]

    def test_renewal_defaults_pick_up_where_the_term_ends(self, client, auth,
                                                          member):
        defaults = client.get(f"/api/members/{member['id']}/renewal-defaults",
                              headers=auth).json()
        current_end = date.fromisoformat(member["current_membership"]["end_date"])
        assert defaults["start_date"] == (current_end + timedelta(days=1)).isoformat()
        assert defaults["plan_name"] == "3 Months"

    def test_renewing_creates_a_new_term_and_keeps_the_old_one(
            self, client, auth, member, plan_3m):
        current_end = date.fromisoformat(member["current_membership"]["end_date"])
        response = client.post(f"/api/members/{member['id']}/renew",
                               headers=auth, json={
            "membership": {
                "plan_id": plan_3m["id"],
                "start_date": (current_end + timedelta(days=1)).isoformat(),
                "fee": "2500",
            },
            "payment": {"amount": "2500", "method": "upi"},
        })
        assert response.status_code == 201

        detail = client.get(f"/api/members/{member['id']}", headers=auth).json()
        assert len(detail["memberships"]) == 2
        assert detail["status"] == "active"
        assert detail["financials"]["total_charged"] == "5000.00"
        assert detail["financials"]["total_paid"] == "5000.00"
        assert detail["financials"]["balance"] == "0.00"

    def test_renewal_history_survives_five_renewals(self, client, auth, member,
                                                    plan_3m):
        for _ in range(5):
            defaults = client.get(
                f"/api/members/{member['id']}/renewal-defaults", headers=auth
            ).json()
            client.post(f"/api/members/{member['id']}/renew", headers=auth, json={
                "membership": {"plan_id": plan_3m["id"],
                               "start_date": defaults["start_date"],
                               "fee": "2500"},
                "payment": {"amount": "2500", "method": "cash"},
            })

        detail = client.get(f"/api/members/{member['id']}", headers=auth).json()
        assert len(detail["memberships"]) == 6          # original + 5 renewals
        assert detail["financials"]["total_charged"] == "15000.00"
        assert detail["financials"]["balance"] == "0.00"

        payments = client.get(f"/api/members/{member['id']}/payments",
                              headers=auth).json()
        assert len(payments) == 6
        # Every renewal produced its own receipt, all distinct.
        receipt_numbers = [p["receipt_no"] for p in payments]
        assert len(set(receipt_numbers)) == 6

    def test_a_renewal_issues_its_own_receipt(self, client, auth, member,
                                              plan_3m):
        defaults = client.get(f"/api/members/{member['id']}/renewal-defaults",
                              headers=auth).json()
        body = client.post(f"/api/members/{member['id']}/renew", headers=auth,
                           json={
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": defaults["start_date"], "fee": "2500"},
            "payment": {"amount": "2500", "method": "upi"},
        }).json()
        assert body["receipt_no"] is not None

    def test_renewing_reactivates_an_archived_member(self, client, auth, member,
                                                     plan_3m):
        client.delete(f"/api/members/{member['id']}", headers=auth)
        client.post(f"/api/members/{member['id']}/renew", headers=auth, json={
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": date.today().isoformat(), "fee": "2500"},
        })
        detail = client.get(f"/api/members/{member['id']}", headers=auth).json()
        assert detail["is_active"] is True


class TestExpiringMembers:
    def _member(self, client, auth, plan_3m, name, phone, end_offset):
        today = date.today()
        return client.post("/api/members", headers=auth, json={
            "full_name": name, "phone": phone,
            "membership": {
                "plan_id": plan_3m["id"],
                "start_date": (today - timedelta(days=80)).isoformat(),
                "end_date": (today + timedelta(days=end_offset)).isoformat(),
                "fee": "2500",
            },
        }).json()["member"]

    def test_the_default_window_is_seven_days(self, client, auth, plan_3m):
        self._member(client, auth, plan_3m, "In 3 Days", "9000000001", 3)
        self._member(client, auth, plan_3m, "In 5 Days", "9000000002", 5)
        self._member(client, auth, plan_3m, "In 20 Days", "9000000003", 20)

        body = client.get("/api/members/expiring", headers=auth).json()
        names = [m["full_name"] for m in body]
        assert names == ["In 3 Days", "In 5 Days"]      # soonest first
        assert body[0]["days_remaining"] == 3

    def test_the_window_can_be_widened(self, client, auth, plan_3m):
        self._member(client, auth, plan_3m, "In 3 Days", "9000000001", 3)
        self._member(client, auth, plan_3m, "In 12 Days", "9000000002", 12)
        self._member(client, auth, plan_3m, "In 25 Days", "9000000003", 25)

        assert len(client.get("/api/members/expiring?days=15",
                              headers=auth).json()) == 2
        assert len(client.get("/api/members/expiring?days=30",
                              headers=auth).json()) == 3

    def test_recently_lapsed_members_are_included(self, client, auth, plan_3m):
        """Someone who expired two days ago is exactly who to call today."""
        self._member(client, auth, plan_3m, "Just Lapsed", "9000000004", -2)
        body = client.get("/api/members/expiring", headers=auth).json()
        assert [m["full_name"] for m in body] == ["Just Lapsed"]
        assert body[0]["days_remaining"] == -2
