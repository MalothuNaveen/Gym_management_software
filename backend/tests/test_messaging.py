"""Renewal reminders, message history, global search and the revenue series."""
from datetime import date, timedelta

import pytest

from app.services.messaging import (
    build_renewal_message, first_name, format_expiry, to_dialable,
)
from tests.conftest import make_member

TODAY = date.today()


# ==========================================================================
# Phone numbers
#
# The reminder feature is only as good as the numbers behind it. Every one of
# these is a number a gym owner could plausibly have typed into the app.
# ==========================================================================
class TestPhoneNumbers:
    def test_a_plain_ten_digit_mobile_gets_the_country_code(self):
        assert to_dialable("9876543210").dial == "919876543210"

    def test_a_number_already_carrying_91_is_not_doubled(self):
        assert to_dialable("919876543210").dial == "919876543210"

    def test_punctuation_and_spacing_are_ignored(self):
        assert to_dialable("+91 98765-43210").dial == "919876543210"

    def test_a_leading_zero_trunk_prefix_is_dropped(self):
        assert to_dialable("09876543210").dial == "919876543210"

    def test_a_missing_number_is_refused_with_a_reason(self):
        result = to_dialable(None)
        assert result.ok is False
        assert "No phone number" in result.reason

    def test_an_empty_string_is_refused(self):
        assert to_dialable("   ").ok is False

    def test_a_short_number_is_refused(self):
        result = to_dialable("98765")
        assert result.ok is False
        assert "10-digit" in result.reason

    def test_a_landline_cannot_receive_whatsapp_and_is_refused(self):
        # Indian mobiles start 6-9; 2xxxxxxxxx is a landline.
        result = to_dialable("2212345678")
        assert result.ok is False
        assert "WhatsApp" in result.reason

    def test_letters_alone_are_refused_rather_than_guessed_at(self):
        assert to_dialable("call me").ok is False


# ==========================================================================
# Message wording
# ==========================================================================
class TestMessageTemplate:
    def test_a_member_is_greeted_by_first_name(self):
        assert first_name("Anita Sharma") == "Anita"

    def test_a_blank_name_still_produces_a_greeting(self):
        assert first_name("") == "there"

    def test_the_expiry_date_is_unambiguous(self):
        assert format_expiry(date(2026, 9, 20)) == "20 Sep 2026"

    def test_an_upcoming_expiry_says_expiring(self):
        message = build_renewal_message(
            member_name="Anita Sharma", gym_name="Iron Fitness Gym",
            expiry_date=date(2026, 9, 20), days_remaining=3,
        )
        assert "Hi Anita" in message
        assert "is expiring on 20 Sep 2026" in message
        assert "Iron Fitness Gym" in message

    def test_a_lapsed_membership_says_expired_not_expiring(self):
        message = build_renewal_message(
            member_name="Anita Sharma", gym_name="Iron Fitness Gym",
            expiry_date=date(2026, 9, 8), days_remaining=-9,
        )
        assert "expired on 8 Sep 2026" in message
        assert "is expiring" not in message

    def test_an_outstanding_balance_is_mentioned(self):
        message = build_renewal_message(
            member_name="Ravi", gym_name="Gym", expiry_date=TODAY,
            days_remaining=2, balance="800.00",
        )
        assert "Pending balance" in message and "800.00" in message

    def test_a_settled_member_is_not_told_about_a_balance(self):
        message = build_renewal_message(
            member_name="Ravi", gym_name="Gym", expiry_date=TODAY,
            days_remaining=2, balance="0.00",
        )
        assert "Pending balance" not in message


# ==========================================================================
# Prepared reminders
# ==========================================================================
class TestRenewalReminders:
    @pytest.fixture
    def expiring_member(self, client, auth, plan_3m):
        return make_member(
            client, auth,
            full_name="Anita Sharma", phone="9812345678",
            membership={
                "plan_id": plan_3m["id"],
                "start_date": (TODAY - timedelta(days=87)).isoformat(),
                "end_date": (TODAY + timedelta(days=2)).isoformat(),
                "fee": "2500",
            },
            payment={"amount": "2500", "method": "cash"},
        )["member"]

    def test_an_expiring_member_gets_a_ready_to_send_reminder(
            self, client, auth, expiring_member):
        body = client.get("/api/messages/renewal-reminders", headers=auth).json()
        assert body["total"] == 1
        assert body["sendable"] == 1
        assert body["unreachable"] == 0
        reminder = body["reminders"][0]
        assert reminder["can_send"] is True
        assert reminder["dial"] == "919812345678"
        assert "Hi Anita" in reminder["message"]
        assert reminder["days_remaining"] == 2

    def test_the_gym_name_in_the_message_comes_from_the_database(
            self, client, auth, expiring_member):
        body = client.get("/api/messages/renewal-reminders", headers=auth).json()
        assert body["gym_name"] == "Iron Fitness Gym"
        assert "Iron Fitness Gym" in body["reminders"][0]["message"]

    def test_a_member_with_an_unusable_number_is_flagged_not_dropped(
            self, client, auth, plan_3m, db):
        """The owner must still see the member, with the reason, so they can
        fix the number - silently skipping them loses a renewal."""
        from app.models import Member
        make_member(
            client, auth, full_name="No Phone", phone="9700000001",
            membership={
                "plan_id": plan_3m["id"],
                "start_date": (TODAY - timedelta(days=87)).isoformat(),
                "end_date": (TODAY + timedelta(days=1)).isoformat(),
                "fee": "2500",
            },
        )
        # Force an unusable number past the input validation.
        member = db.query(Member).filter(Member.full_name == "No Phone").one()
        member.phone = "2212345678"      # a landline
        member.whatsapp = None
        db.commit()

        body = client.get("/api/messages/renewal-reminders", headers=auth).json()
        entry = next(r for r in body["reminders"] if r["full_name"] == "No Phone")
        assert entry["can_send"] is False
        assert entry["dial"] is None
        assert "WhatsApp" in entry["reason"]
        assert body["unreachable"] == 1

    def test_the_dedicated_whatsapp_number_wins_over_the_main_phone(
            self, client, auth, plan_3m):
        make_member(
            client, auth, full_name="Two Numbers", phone="9700000002",
            whatsapp="9888888888",
            membership={
                "plan_id": plan_3m["id"],
                "start_date": (TODAY - timedelta(days=87)).isoformat(),
                "end_date": (TODAY + timedelta(days=1)).isoformat(),
                "fee": "2500",
            },
        )
        body = client.get("/api/messages/renewal-reminders", headers=auth).json()
        entry = next(r for r in body["reminders"] if r["full_name"] == "Two Numbers")
        assert entry["dial"] == "919888888888"

    def test_a_comfortably_active_member_is_not_chased(
            self, client, auth, plan_3m):
        make_member(client, auth, full_name="Settled", phone="9700000003",
                    membership={"plan_id": plan_3m["id"],
                                "start_date": TODAY.isoformat(), "fee": "2500"})
        body = client.get("/api/messages/renewal-reminders", headers=auth).json()
        assert all(r["full_name"] != "Settled" for r in body["reminders"])

    def test_reminders_need_a_signed_in_owner(self, client):
        assert client.get("/api/messages/renewal-reminders").status_code == 401


# ==========================================================================
# Message history
# ==========================================================================
class TestMessageHistory:
    def _log(self, client, auth, **overrides):
        payload = {
            "member_name": "Anita Sharma", "phone": "9812345678",
            "channel": "whatsapp", "kind": "renewal_reminder",
            "status": "opened", "body": "Hi Anita",
            **overrides,
        }
        return client.post("/api/messages", json=payload, headers=auth)

    def test_a_reminder_is_recorded(self, client, auth):
        response = self._log(client, auth)
        assert response.status_code == 201
        body = response.json()
        assert body["member_name"] == "Anita Sharma"
        assert body["status"] == "opened"

    def test_an_opened_message_carries_a_timestamp(self, client, auth):
        assert self._log(client, auth, status="opened").json()["sent_at"]

    def test_a_merely_prepared_message_has_no_sent_time(self, client, auth):
        """Nothing left the building, so nothing may claim it did."""
        assert self._log(client, auth, status="prepared").json()["sent_at"] is None

    def test_a_failed_message_has_no_sent_time(self, client, auth):
        assert self._log(client, auth, status="failed",
                         detail="No phone number.").json()["sent_at"] is None

    def test_an_invented_status_is_rejected(self, client, auth):
        assert self._log(client, auth, status="delivered").status_code == 422

    def test_an_invented_channel_is_rejected(self, client, auth):
        assert self._log(client, auth, channel="telepathy").status_code == 422

    def test_a_whole_run_can_be_recorded_at_once(self, client, auth):
        response = client.post("/api/messages/batch", headers=auth, json={
            "messages": [
                {"member_name": "A", "body": "hi", "status": "opened"},
                {"member_name": "B", "body": "hi", "status": "failed",
                 "detail": "No phone number."},
            ],
        })
        assert response.status_code == 201
        assert len(response.json()) == 2

    def test_history_is_newest_first(self, client, auth):
        self._log(client, auth, member_name="First")
        self._log(client, auth, member_name="Second")
        items = client.get("/api/messages", headers=auth).json()["items"]
        assert items[0]["member_name"] == "Second"

    def test_history_can_be_filtered_by_status(self, client, auth):
        self._log(client, auth, status="opened")
        self._log(client, auth, status="failed", detail="No number.")
        body = client.get("/api/messages", params={"status": "failed"},
                          headers=auth).json()
        assert body["total"] == 1
        assert body["items"][0]["status"] == "failed"

    def test_stats_count_each_status(self, client, auth):
        self._log(client, auth, status="opened")
        self._log(client, auth, status="opened")
        self._log(client, auth, status="failed", detail="No number.")
        stats = client.get("/api/messages/stats", headers=auth).json()
        assert stats["total"] == 3
        assert stats["opened"] == 2
        assert stats["failed"] == 1

    def test_a_history_row_can_be_removed(self, client, auth):
        message_id = self._log(client, auth).json()["id"]
        assert client.delete(f"/api/messages/{message_id}",
                             headers=auth).status_code == 200
        assert client.get("/api/messages", headers=auth).json()["total"] == 0

    def test_history_needs_a_signed_in_owner(self, client):
        assert client.get("/api/messages").status_code == 401


# ==========================================================================
# Global search
# ==========================================================================
class TestSearch:
    @pytest.fixture
    def member(self, client, auth):
        return make_member(client, auth, full_name="Rahul Kumar",
                           phone="9876543210", email="rahul@example.com")["member"]

    def test_a_member_is_found_by_name(self, client, auth, member):
        body = client.get("/api/search", params={"q": "rahul"}, headers=auth).json()
        members = next(g for g in body["groups"] if g["label"] == "Members")
        assert members["hits"][0]["title"] == "Rahul Kumar"

    def test_a_hit_carries_the_route_it_belongs_to(self, client, auth, member):
        body = client.get("/api/search", params={"q": "rahul"}, headers=auth).json()
        hit = next(g for g in body["groups"] if g["label"] == "Members")["hits"][0]
        assert hit["to"] == f"/members/{member['id']}"

    def test_a_member_is_found_by_phone(self, client, auth, member):
        body = client.get("/api/search", params={"q": "9876543210"},
                          headers=auth).json()
        assert body["total"] >= 1

    def test_a_member_is_found_by_member_code(self, client, auth, member):
        body = client.get("/api/search", params={"q": member["member_code"]},
                          headers=auth).json()
        assert body["total"] >= 1

    def test_plans_are_searchable(self, client, auth):
        body = client.get("/api/search", params={"q": "month"}, headers=auth).json()
        assert any(g["label"] == "Membership Plans" for g in body["groups"])

    def test_a_single_character_returns_nothing_rather_than_everything(
            self, client, auth, member):
        body = client.get("/api/search", params={"q": "r"}, headers=auth).json()
        assert body["total"] == 0

    def test_nonsense_returns_no_groups_not_an_error(self, client, auth, member):
        body = client.get("/api/search", params={"q": "zzzzqqq"}, headers=auth).json()
        assert body["total"] == 0
        assert body["groups"] == []

    def test_search_needs_a_signed_in_owner(self, client):
        assert client.get("/api/search", params={"q": "rahul"}).status_code == 401


# ==========================================================================
# Revenue series
# ==========================================================================
class TestRevenueSeries:
    @pytest.fixture
    def with_money(self, client, auth, plan_3m):
        make_member(client, auth, membership={
            "plan_id": plan_3m["id"], "start_date": TODAY.isoformat(),
            "fee": "3000",
        }, payment={"amount": "2000", "method": "cash"})
        client.post("/api/expenses", headers=auth, json={
            "expense_date": TODAY.isoformat(), "category": "rent",
            "amount": "500",
        })

    def test_todays_payment_appears_in_the_daily_series(
            self, client, auth, with_money):
        body = client.get("/api/reports/revenue-series",
                          params={"period": "daily"}, headers=auth).json()
        assert body["total_income"] == "2000.00"
        assert body["total_expense"] == "500.00"
        assert body["total_net"] == "1500.00"

    def test_quiet_days_are_present_as_zero_not_missing(
            self, client, auth, with_money):
        """A gap in the series would draw a quiet day as if it never happened."""
        body = client.get("/api/reports/revenue-series",
                          params={"period": "daily"}, headers=auth).json()
        assert len(body["points"]) == 30
        assert any(p["income"] == "0.00" for p in body["points"])

    def test_the_last_point_is_today(self, client, auth, with_money):
        body = client.get("/api/reports/revenue-series",
                          params={"period": "daily"}, headers=auth).json()
        assert body["points"][-1]["date"] == TODAY.isoformat()

    @pytest.mark.parametrize("period,expected", [
        ("daily", 30), ("weekly", 12), ("monthly", 12),
    ])
    def test_each_period_returns_its_own_window(
            self, client, auth, with_money, period, expected):
        body = client.get("/api/reports/revenue-series",
                          params={"period": period}, headers=auth).json()
        assert len(body["points"]) == expected

    def test_every_period_reports_the_same_total(self, client, auth, with_money):
        """Different bucketing must never change how much money came in."""
        totals = {
            period: client.get("/api/reports/revenue-series",
                               params={"period": period},
                               headers=auth).json()["total_income"]
            for period in ("daily", "weekly", "monthly")
        }
        assert len(set(totals.values())) == 1, totals

    def test_an_unknown_period_is_rejected(self, client, auth):
        assert client.get("/api/reports/revenue-series",
                          params={"period": "hourly"},
                          headers=auth).status_code == 422

    def test_a_voided_payment_is_not_counted_as_revenue(
            self, client, auth, plan_3m, db):
        """The chart must agree with every other total in the app: a cancelled
        payment is money that never arrived.

        The payment is voided directly, because the API refuses to void one that
        already carries a receipt - that rule is covered by its own test.
        """
        from datetime import datetime, timezone

        from app.models import Payment
        created = make_member(client, auth, membership={
            "plan_id": plan_3m["id"], "start_date": TODAY.isoformat(),
            "fee": "3000",
        }, payment={"amount": "2000", "method": "cash"})

        payment = db.get(Payment, created["payment_id"])
        payment.voided_at = datetime.now(timezone.utc)
        payment.void_reason = "Entered twice by mistake"
        db.commit()

        body = client.get("/api/reports/revenue-series",
                          params={"period": "daily"}, headers=auth).json()
        assert body["total_income"] == "0.00"

    def test_the_api_refuses_to_void_a_payment_that_has_a_receipt(
            self, client, auth, plan_3m):
        """Existing rule, asserted here so the redesign cannot quietly relax it."""
        created = make_member(client, auth, membership={
            "plan_id": plan_3m["id"], "start_date": TODAY.isoformat(),
            "fee": "3000",
        }, payment={"amount": "2000", "method": "cash"})
        response = client.post(f"/api/payments/{created['payment_id']}/void",
                               headers=auth, json={"reason": "Entered twice"})
        assert response.status_code == 400
        assert "receipt has already been issued" in response.json()["message"]


# ==========================================================================
# The dashboard's new figures
# ==========================================================================
class TestDashboardAdditions:
    def test_the_attendance_percentage_never_exceeds_one_hundred(
            self, client, auth, plan_3m):
        """An expired member walking in must not push the bar past full."""
        active = make_member(client, auth, full_name="Active One",
                             phone="9700000010", membership={
                                 "plan_id": plan_3m["id"],
                                 "start_date": TODAY.isoformat(), "fee": "2500",
                             })["member"]
        lapsed = make_member(client, auth, full_name="Lapsed One",
                             phone="9700000011", membership={
                                 "plan_id": plan_3m["id"],
                                 "start_date": (TODAY - timedelta(days=100)).isoformat(),
                                 "end_date": (TODAY - timedelta(days=5)).isoformat(),
                                 "fee": "2500",
                             })["member"]
        client.post("/api/attendance/check-in", headers=auth,
                    json={"member_id": active["id"]})
        client.post("/api/attendance/check-in", headers=auth,
                    json={"member_id": lapsed["id"]})

        body = client.get("/api/dashboard", headers=auth).json()["attendance"]
        assert body["today_count"] == 2          # unchanged: everyone who came in
        assert body["active_members"] == 1
        assert body["percent"] == 100            # and never 200
        assert body["not_checked_in"] == 0

    def test_a_part_paid_active_member_counts_as_pending(
            self, client, auth, plan_3m):
        make_member(client, auth, membership={
            "plan_id": plan_3m["id"], "start_date": TODAY.isoformat(),
            "fee": "3000",
        }, payment={"amount": "2000", "method": "cash"})
        status = client.get("/api/dashboard", headers=auth).json()["payment_status"]
        assert status["pending_count"] == 1
        assert status["pending_amount"] == "1000.00"
        assert status["overdue_count"] == 0

    def test_a_part_paid_lapsed_member_counts_as_overdue(
            self, client, auth, plan_3m):
        """Owing after the term has ended is a different problem from owing
        part-way through one, and the owner chases it differently."""
        make_member(client, auth, membership={
            "plan_id": plan_3m["id"],
            "start_date": (TODAY - timedelta(days=100)).isoformat(),
            "end_date": (TODAY - timedelta(days=5)).isoformat(),
            "fee": "3000",
        }, payment={"amount": "2000", "method": "cash"})
        status = client.get("/api/dashboard", headers=auth).json()["payment_status"]
        assert status["overdue_count"] == 1
        assert status["overdue_amount"] == "1000.00"
        assert status["pending_count"] == 0

    def test_a_fully_paid_member_counts_as_paid(self, client, auth, plan_3m):
        make_member(client, auth, membership={
            "plan_id": plan_3m["id"], "start_date": TODAY.isoformat(),
            "fee": "3000",
        }, payment={"amount": "3000", "method": "cash"})
        status = client.get("/api/dashboard", headers=auth).json()["payment_status"]
        assert status["paid_count"] == 1
        assert status["pending_count"] == 0

    def test_recent_members_are_newest_first(self, client, auth):
        make_member(client, auth, full_name="Older", phone="9700000020")
        make_member(client, auth, full_name="Newer", phone="9700000021")
        recent = client.get("/api/dashboard", headers=auth).json()["recent_members"]
        assert recent[0]["full_name"] == "Newer"

    def test_a_recent_member_carries_the_status_the_list_page_shows(
            self, client, auth, plan_3m):
        make_member(client, auth, full_name="Lapsed", phone="9700000022",
                    membership={
                        "plan_id": plan_3m["id"],
                        "start_date": (TODAY - timedelta(days=100)).isoformat(),
                        "end_date": (TODAY - timedelta(days=5)).isoformat(),
                        "fee": "2500",
                    })
        recent = client.get("/api/dashboard", headers=auth).json()["recent_members"]
        assert recent[0]["status"] == "expired"

    def test_the_existing_dashboard_fields_are_untouched(self, client, auth):
        """The redesign added fields; it must not have moved any."""
        body = client.get("/api/dashboard", headers=auth).json()
        for key in ("gym_name", "today", "members", "money", "attendance",
                    "expiring"):
            assert key in body
        for key in ("total", "active", "expiring_soon", "expired",
                    "no_membership"):
            assert key in body["members"]
        for key in ("today_collection", "month_collection", "pending_payments",
                    "month_expenses", "month_net"):
            assert key in body["money"]
