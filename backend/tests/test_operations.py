"""Attendance, staff salary, expenses, dashboard, reports and export."""
from datetime import date, timedelta

import pytest

from tests.conftest import make_member


# ==========================================================================
# Attendance
# ==========================================================================
class TestAttendance:
    @pytest.fixture
    def member(self, client, auth):
        return make_member(client, auth)["member"]

    def test_a_member_can_be_checked_in(self, client, auth, member):
        response = client.post("/api/attendance/check-in", headers=auth,
                               json={"member_id": member["id"]})
        assert response.status_code == 201
        body = response.json()
        assert body["member_name"] == "Rahul Kumar"
        assert body["attend_date"] == date.today().isoformat()
        assert body["check_in_at"]

    def test_the_same_member_cannot_be_checked_in_twice_in_a_day(
            self, client, auth, member):
        client.post("/api/attendance/check-in", headers=auth,
                    json={"member_id": member["id"]})
        response = client.post("/api/attendance/check-in", headers=auth,
                               json={"member_id": member["id"]})
        assert response.status_code == 409
        assert "already marked present" in response.json()["message"]

    def test_the_same_member_can_be_checked_in_on_different_days(
            self, client, auth, member):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        assert client.post("/api/attendance/check-in", headers=auth, json={
            "member_id": member["id"]}).status_code == 201
        assert client.post("/api/attendance/check-in", headers=auth, json={
            "member_id": member["id"], "attend_date": yesterday,
        }).status_code == 201

    def test_attendance_cannot_be_marked_for_a_future_date(self, client, auth,
                                                           member):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        response = client.post("/api/attendance/check-in", headers=auth, json={
            "member_id": member["id"], "attend_date": tomorrow,
        })
        assert response.status_code == 400

    def test_an_archived_member_cannot_be_checked_in(self, client, auth, member):
        client.delete(f"/api/members/{member['id']}", headers=auth)
        response = client.post("/api/attendance/check-in", headers=auth,
                               json={"member_id": member["id"]})
        assert response.status_code == 400
        assert "archived" in response.json()["message"]

    def test_a_check_in_can_be_undone(self, client, auth, member):
        record = client.post("/api/attendance/check-in", headers=auth,
                             json={"member_id": member["id"]}).json()
        assert client.delete(f"/api/attendance/{record['id']}",
                             headers=auth).status_code == 200
        assert client.get("/api/attendance", headers=auth).json() == []

    def test_the_roster_shows_present_and_absent_members(self, client, auth):
        present = make_member(client, auth, full_name="Came Today",
                              phone="9000000001")["member"]
        make_member(client, auth, full_name="Stayed Home", phone="9000000002")
        client.post("/api/attendance/check-in", headers=auth,
                    json={"member_id": present["id"]})

        roster = client.get("/api/attendance/roster", headers=auth).json()
        by_name = {r["full_name"]: r for r in roster}
        assert by_name["Came Today"]["present"] is True
        assert by_name["Stayed Home"]["present"] is False
        # Checked-in members are listed first.
        assert roster[0]["full_name"] == "Came Today"

    def test_the_roster_can_be_searched(self, client, auth):
        make_member(client, auth, full_name="Rahul Kumar", phone="9000000001")
        make_member(client, auth, full_name="Suresh Babu", phone="9000000002")
        roster = client.get("/api/attendance/roster?q=suresh", headers=auth).json()
        assert len(roster) == 1

    def test_attendance_can_be_filtered_by_period(self, client, auth, member):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        client.post("/api/attendance/check-in", headers=auth,
                    json={"member_id": member["id"]})
        client.post("/api/attendance/check-in", headers=auth, json={
            "member_id": member["id"], "attend_date": yesterday})

        assert len(client.get("/api/attendance?period=today",
                              headers=auth).json()) == 1
        assert len(client.get("/api/attendance?period=yesterday",
                              headers=auth).json()) == 1
        assert len(client.get("/api/attendance?period=month",
                              headers=auth).json()) >= 1

    def test_a_members_visit_counts_appear_on_their_profile(self, client, auth,
                                                            member):
        client.post("/api/attendance/check-in", headers=auth,
                    json={"member_id": member["id"]})
        detail = client.get(f"/api/members/{member['id']}", headers=auth).json()
        assert detail["attendance"]["total_visits"] == 1
        assert detail["attendance"]["this_month"] == 1


# ==========================================================================
# Staff and salary
# ==========================================================================
class TestStaffSalary:
    @pytest.fixture
    def staff_member(self, client, auth):
        response = client.post("/api/staff", headers=auth, json={
            "full_name": "Rahul", "phone": "9811111111", "role": "admin",
            "monthly_salary": "15000",
        })
        assert response.status_code == 201, response.text
        return response.json()

    def test_the_spec_worked_example(self, client, auth, staff_member):
        """Salary 15,000 - paid 10,000 - advance 2,000 = 3,000 remaining."""
        staff_id = staff_member["id"]
        client.post("/api/staff/salary", headers=auth, json={
            "staff_id": staff_id, "amount": "2000", "kind": "advance",
        })
        client.post("/api/staff/salary", headers=auth, json={
            "staff_id": staff_id, "amount": "10000", "kind": "salary",
        })

        summary = client.get(f"/api/staff/{staff_id}/salary", headers=auth).json()
        assert summary["monthly_salary"] == "15000.00"
        assert summary["paid"] == "10000.00"
        assert summary["advance"] == "2000.00"
        assert summary["remaining"] == "3000.00"
        assert summary["total_disbursed"] == "12000.00"

    def test_a_fully_paid_month_leaves_nothing_remaining(self, client, auth,
                                                         staff_member):
        client.post("/api/staff/salary", headers=auth, json={
            "staff_id": staff_member["id"], "amount": "15000", "kind": "salary",
        })
        summary = client.get(f"/api/staff/{staff_member['id']}/salary",
                             headers=auth).json()
        assert summary["remaining"] == "0.00"

    def test_each_month_is_tracked_separately(self, client, auth, staff_member):
        staff_id = staff_member["id"]
        this_month = date.today().replace(day=1)
        last_month = (this_month - timedelta(days=1)).replace(day=1)

        client.post("/api/staff/salary", headers=auth, json={
            "staff_id": staff_id, "amount": "15000", "kind": "salary",
            "period_month": last_month.isoformat(),
            "paid_on": last_month.isoformat(),
        })

        current = client.get(f"/api/staff/{staff_id}/salary", headers=auth).json()
        assert current["remaining"] == "15000.00"     # this month untouched

        previous = client.get(
            f"/api/staff/{staff_id}/salary?month={last_month.isoformat()}",
            headers=auth,
        ).json()
        assert previous["remaining"] == "0.00"

    def test_any_date_in_a_month_maps_to_that_month(self, client, auth,
                                                    staff_member):
        record = client.post("/api/staff/salary", headers=auth, json={
            "staff_id": staff_member["id"], "amount": "5000", "kind": "salary",
            "period_month": date.today().replace(day=15).isoformat(),
        }).json()
        assert record["period_month"] == date.today().replace(day=1).isoformat()

    def test_salary_history_is_kept(self, client, auth, staff_member):
        for amount, kind in (("2000", "advance"), ("5000", "salary"),
                             ("5000", "salary")):
            client.post("/api/staff/salary", headers=auth, json={
                "staff_id": staff_member["id"], "amount": amount, "kind": kind,
            })
        history = client.get(f"/api/staff/{staff_member['id']}/salary/history",
                             headers=auth).json()
        assert len(history) == 3

    def test_a_negative_salary_payment_is_refused(self, client, auth,
                                                  staff_member):
        response = client.post("/api/staff/salary", headers=auth, json={
            "staff_id": staff_member["id"], "amount": "-500", "kind": "salary",
        })
        assert response.status_code == 422

    def test_staff_are_deactivated_not_deleted(self, client, auth, staff_member):
        client.delete(f"/api/staff/{staff_member['id']}", headers=auth)
        detail = client.get(f"/api/staff/{staff_member['id']}",
                            headers=auth).json()
        assert detail["status"] == "inactive"

    def test_staff_can_be_searched_by_name_and_phone(self, client, auth,
                                                     staff_member):
        assert len(client.get("/api/staff?q=rahul", headers=auth).json()) == 1
        assert len(client.get("/api/staff?q=9811111111", headers=auth).json()) == 1


# ==========================================================================
# Expenses
# ==========================================================================
class TestExpenses:
    def test_an_expense_can_be_recorded(self, client, auth):
        response = client.post("/api/expenses", headers=auth, json={
            "expense_date": date.today().isoformat(), "category": "rent",
            "amount": "18000", "description": "September rent",
            "method": "bank_transfer",
        })
        assert response.status_code == 201
        assert response.json()["amount"] == "18000.00"

    def test_an_invalid_category_is_refused(self, client, auth):
        response = client.post("/api/expenses", headers=auth, json={
            "expense_date": date.today().isoformat(), "category": "yacht",
            "amount": "100000",
        })
        assert response.status_code == 422

    def test_a_negative_expense_is_refused(self, client, auth):
        response = client.post("/api/expenses", headers=auth, json={
            "expense_date": date.today().isoformat(), "category": "rent",
            "amount": "-500",
        })
        assert response.status_code == 422

    def test_the_summary_totals_by_category(self, client, auth):
        for category, amount in (("rent", "18000"), ("electricity", "3200"),
                                 ("cleaning", "1500"), ("rent", "2000")):
            client.post("/api/expenses", headers=auth, json={
                "expense_date": date.today().isoformat(), "category": category,
                "amount": amount,
            })
        summary = client.get("/api/expenses/summary", headers=auth).json()
        assert summary["total"] == "24700.00"
        by_category = {r["category"]: r["amount"] for r in summary["by_category"]}
        assert by_category["rent"] == "20000.00"


# ==========================================================================
# Dashboard
# ==========================================================================
class TestDashboard:
    def test_an_empty_gym_reports_zeroes(self, client, auth):
        body = client.get("/api/dashboard", headers=auth).json()
        assert body["members"]["total"] == 0
        assert body["money"]["today_collection"] == "0.00"
        assert body["expiring"] == []

    def test_the_headline_numbers_are_correct(self, client, auth, plan_3m):
        today = date.today()

        def add(name, phone, end_offset, fee, paid):
            return client.post("/api/members", headers=auth, json={
                "full_name": name, "phone": phone,
                "membership": {
                    "plan_id": plan_3m["id"],
                    "start_date": (today - timedelta(days=60)).isoformat(),
                    "end_date": (today + timedelta(days=end_offset)).isoformat(),
                    "fee": fee,
                },
                "payment": {"amount": paid, "method": "cash"},
            }).json()["member"]

        active = add("Active One", "9000000001", 60, "2500", "2500")
        add("Expiring One", "9000000002", 3, "2500", "2000")   # owes 500
        add("Expired One", "9000000003", -10, "2500", "2500")
        client.post("/api/attendance/check-in", headers=auth,
                    json={"member_id": active["id"]})

        body = client.get("/api/dashboard", headers=auth).json()
        assert body["members"]["total"] == 3
        assert body["members"]["active"] == 2          # includes expiring
        assert body["members"]["expiring_soon"] == 1
        assert body["members"]["expired"] == 1
        assert body["money"]["today_collection"] == "7000.00"
        assert body["money"]["month_collection"] == "7000.00"
        assert body["money"]["pending_payments"] == "500.00"
        assert body["attendance"]["today_count"] == 1
        assert body["attendance"]["active_members"] == 2

        # The renewals list covers everyone who needs chasing: those about to
        # lapse and those who lapsed recently.
        needs_renewal = {m["full_name"]: m["days_remaining"]
                         for m in body["expiring"]}
        assert needs_renewal == {"Expiring One": 3, "Expired One": -10}

    def test_expenses_are_netted_against_income(self, client, auth):
        client.post("/api/expenses", headers=auth, json={
            "expense_date": date.today().isoformat(), "category": "rent",
            "amount": "5000",
        })
        body = client.get("/api/dashboard", headers=auth).json()
        assert body["money"]["month_expenses"] == "5000.00"
        assert body["money"]["month_net"] == "-5000.00"


# ==========================================================================
# Reports and export
# ==========================================================================
class TestReports:
    @pytest.fixture
    def populated(self, client, auth, plan_3m):
        today = date.today()
        member = client.post("/api/members", headers=auth, json={
            "full_name": "Rahul Kumar", "phone": "9876543210",
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": today.isoformat(), "fee": "3000",
                           "discount": "200"},
            "payment": {"amount": "2000", "method": "upi"},
        }).json()["member"]
        client.post("/api/attendance/check-in", headers=auth,
                    json={"member_id": member["id"]})
        client.post("/api/expenses", headers=auth, json={
            "expense_date": today.isoformat(), "category": "rent",
            "amount": "18000",
        })
        staff = client.post("/api/staff", headers=auth, json={
            "full_name": "Desk Staff", "phone": "9811111111",
            "monthly_salary": "15000",
        }).json()
        client.post("/api/staff/salary", headers=auth, json={
            "staff_id": staff["id"], "amount": "10000", "kind": "salary",
        })
        return member

    def test_the_monthly_summary_adds_up(self, client, auth, populated):
        body = client.get("/api/reports/monthly-summary", headers=auth).json()
        assert body["total_members"] == 1
        assert body["new_members"] == 1
        assert body["renewals"] == 0
        assert body["total_revenue"] == "2000.00"
        assert body["total_expenses"] == "18000.00"
        assert body["staff_salary_paid"] == "10000.00"
        assert body["pending_payments"] == "800.00"
        assert body["attendance_count"] == 1
        assert body["net_amount"] == "-16000.00"

    def test_renewals_are_counted_separately_from_new_members(
            self, client, auth, populated, plan_3m):
        defaults = client.get(f"/api/members/{populated['id']}/renewal-defaults",
                              headers=auth).json()
        client.post(f"/api/members/{populated['id']}/renew", headers=auth, json={
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": date.today().isoformat(), "fee": "2500"},
        })
        body = client.get("/api/reports/monthly-summary", headers=auth).json()
        assert body["new_members"] == 1
        assert body["renewals"] == 1

    def test_collections_break_down_by_payment_method(self, client, auth,
                                                      populated):
        client.post("/api/payments", headers=auth, json={
            "member_id": populated["id"], "amount": "500", "method": "cash",
        })
        body = client.get("/api/reports/collections", headers=auth).json()
        by_method = {r["method"]: r["amount"] for r in body["by_method"]}
        assert by_method["upi"] == "2000.00"
        assert by_method["cash"] == "500.00"
        assert body["total"] == "2500.00"

    def test_the_attendance_report_summarises_visits(self, client, auth,
                                                     populated):
        body = client.get("/api/reports/attendance-summary", headers=auth).json()
        assert body["total_visits"] == 1
        assert body["top_members"][0]["visits"] == 1

    @pytest.mark.parametrize("dataset", [
        "members", "payments", "attendance", "expenses", "staff", "salary",
        "memberships", "expiring", "dues",
    ])
    def test_every_report_exports_as_csv(self, client, auth, populated, dataset):
        response = client.get(f"/api/reports/export/{dataset}.csv", headers=auth)
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "attachment" in response.headers["content-disposition"]
        assert len(response.content) > 10

    def test_the_members_csv_contains_the_real_data(self, client, auth,
                                                    populated):
        text = client.get("/api/reports/export/members.csv",
                          headers=auth).content.decode("utf-8-sig")
        assert "Member ID,Name,Phone" in text
        assert "GYM-0001" in text
        assert "Rahul Kumar" in text
        assert "800.00" in text          # the outstanding balance

    def test_an_unknown_report_is_refused(self, client, auth):
        assert client.get("/api/reports/export/secrets.csv",
                          headers=auth).status_code == 404

    def test_the_full_backup_downloads_as_a_zip(self, client, auth, populated):
        import io
        import zipfile

        response = client.get("/api/reports/backup.zip", headers=auth)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

        archive = zipfile.ZipFile(io.BytesIO(response.content))
        names = set(archive.namelist())
        assert {"members.csv", "payments.csv", "attendance.csv", "expenses.csv",
                "staff.csv", "staff_salary.csv", "README.txt"} <= names
        assert b"Rahul Kumar" in archive.read("members.csv")

    def test_reports_require_authentication(self, client):
        assert client.get("/api/reports/backup.zip").status_code == 401


# ==========================================================================
# Plans and settings
# ==========================================================================
class TestPlans:
    def test_the_starter_plans_are_created(self, client, auth):
        plans = client.get("/api/plans", headers=auth).json()
        names = {p["name"] for p in plans}
        assert names == {"Monthly", "3 Months", "6 Months", "12 Months"}
        monthly = next(p for p in plans if p["name"] == "Monthly")
        assert monthly["price"] == "1000.00"
        assert monthly["duration_days"] == 30

    def test_a_plan_can_be_added(self, client, auth):
        response = client.post("/api/plans", headers=auth, json={
            "name": "Quarterly Student", "price": "1800", "duration_days": 90,
        })
        assert response.status_code == 201

    def test_duplicate_plan_names_are_refused(self, client, auth):
        response = client.post("/api/plans", headers=auth, json={
            "name": "Monthly", "price": "1200", "duration_days": 30,
        })
        assert response.status_code == 409

    def test_a_plan_in_use_is_deactivated_not_deleted(self, client, auth,
                                                      plan_3m):
        client.post("/api/members", headers=auth, json={
            "full_name": "Plan User", "phone": "9000000001",
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": date.today().isoformat(), "fee": "2500"},
        })
        response = client.delete(f"/api/plans/{plan_3m['id']}", headers=auth)
        assert response.status_code == 200
        assert "no longer offered" in response.json()["message"]

        plans = {p["id"]: p for p in client.get("/api/plans", headers=auth).json()}
        assert plans[plan_3m["id"]]["is_active"] is False

    def test_an_unused_plan_can_be_removed(self, client, auth):
        plan = client.post("/api/plans", headers=auth, json={
            "name": "Never Used", "price": "500", "duration_days": 15,
        }).json()
        client.delete(f"/api/plans/{plan['id']}", headers=auth)
        ids = {p["id"] for p in client.get("/api/plans", headers=auth).json()}
        assert plan["id"] not in ids

    def test_renaming_a_plan_does_not_rewrite_history(self, client, auth,
                                                      plan_3m):
        member = client.post("/api/members", headers=auth, json={
            "full_name": "History Keeper", "phone": "9000000001",
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": date.today().isoformat(), "fee": "2500"},
        }).json()["member"]

        client.put(f"/api/plans/{plan_3m['id']}", headers=auth,
                   json={"name": "90 Day Pass", "price": "2900"})

        detail = client.get(f"/api/members/{member['id']}", headers=auth).json()
        assert detail["current_membership"]["plan_name"] == "3 Months"
        assert detail["current_membership"]["fee"] == "2500.00"


class TestSettings:
    def test_settings_are_seeded_with_sensible_defaults(self, client, auth):
        body = client.get("/api/settings", headers=auth).json()
        assert body["name"] == "Iron Fitness Gym"
        assert body["currency"] == "INR"
        assert body["timezone"] == "Asia/Kolkata"
        assert body["expiring_soon_days"] == 7
        assert body["member_code_prefix"] == "GYM"

    def test_the_owner_can_update_them(self, client, auth):
        response = client.put("/api/settings", headers=auth, json={
            "name": "Peak Fitness", "address": "12 MG Road, Bengaluru",
            "phone": "9800000000", "receipt_footer": "See you tomorrow!",
            "expiring_soon_days": 14,
        })
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Peak Fitness"
        assert body["expiring_soon_days"] == 14

    def test_the_expiring_window_setting_changes_the_dashboard(
            self, client, auth, plan_3m):
        today = date.today()
        client.post("/api/members", headers=auth, json={
            "full_name": "In 10 Days", "phone": "9000000001",
            "membership": {
                "plan_id": plan_3m["id"],
                "start_date": (today - timedelta(days=80)).isoformat(),
                "end_date": (today + timedelta(days=10)).isoformat(),
                "fee": "2500",
            },
        })
        assert client.get("/api/dashboard",
                          headers=auth).json()["members"]["expiring_soon"] == 0

        client.put("/api/settings", headers=auth, json={"expiring_soon_days": 14})
        assert client.get("/api/dashboard",
                          headers=auth).json()["members"]["expiring_soon"] == 1

    def test_an_invalid_timezone_is_refused(self, client, auth):
        response = client.put("/api/settings", headers=auth,
                              json={"timezone": "Mars/Olympus_Mons"})
        assert response.status_code == 422

    def test_the_gym_name_reaches_the_receipt(self, client, auth, plan_3m):
        client.put("/api/settings", headers=auth, json={"name": "Peak Fitness"})
        body = client.post("/api/members", headers=auth, json={
            "full_name": "Receipt Test", "phone": "9000000001",
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": date.today().isoformat(), "fee": "2500"},
            "payment": {"amount": "2500", "method": "cash"},
        }).json()
        snapshot = client.get(f"/api/receipts/{body['receipt_id']}",
                              headers=auth).json()["snapshot"]
        assert snapshot["gym"]["name"] == "Peak Fitness"
