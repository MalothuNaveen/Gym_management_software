"""Member creation, IDs, search, update and archiving."""
from datetime import date, timedelta

from tests.conftest import make_member


class TestMemberCreation:
    def test_a_member_can_be_added_with_just_a_name_and_phone(self, client, auth):
        body = make_member(client, auth)
        member = body["member"]
        assert member["full_name"] == "Rahul Kumar"
        assert member["phone"] == "9876543210"
        assert member["status"] == "no_membership"

    def test_member_ids_are_generated_in_sequence(self, client, auth):
        first = make_member(client, auth, full_name="Member One")["member"]
        second = make_member(client, auth, full_name="Member Two",
                             phone="9876543211")["member"]
        third = make_member(client, auth, full_name="Member Three",
                            phone="9876543212")["member"]
        assert first["member_code"] == "GYM-0001"
        assert second["member_code"] == "GYM-0002"
        assert third["member_code"] == "GYM-0003"

    def test_member_ids_are_never_reused(self, client, auth):
        first = make_member(client, auth, full_name="Gone Soon")["member"]
        client.delete(f"/api/members/{first['id']}", headers=auth)
        second = make_member(client, auth, full_name="New Person",
                             phone="9000000001")["member"]
        assert second["member_code"] == "GYM-0002"

    def test_phone_numbers_are_normalised(self, client, auth):
        member = make_member(client, auth, phone="+91 98765 43210")["member"]
        assert member["phone"] == "9876543210"

    def test_a_member_can_be_created_with_membership_and_payment_at_once(
            self, client, auth, plan_3m):
        today = date.today()
        body = client.post("/api/members", headers=auth, json={
            "full_name": "Suresh Babu",
            "phone": "9812345678",
            "membership": {
                "plan_id": plan_3m["id"],
                "start_date": today.isoformat(),
                "fee": "3000",
                "discount": "200",
            },
            "payment": {"amount": "2800", "method": "upi"},
        }).json()

        member = body["member"]
        assert member["status"] == "active"
        assert member["current_membership"]["final_amount"] == "2800.00"
        assert member["financials"]["balance"] == "0.00"
        # The receipt is generated automatically, ready to share.
        assert body["receipt_no"] is not None
        assert body["receipt_no"].startswith("REC-")

    def test_a_missing_name_is_rejected_with_a_readable_message(self, client, auth):
        response = client.post("/api/members", headers=auth,
                               json={"phone": "9876543210"})
        assert response.status_code == 422
        assert "Full name" in response.json()["message"]

    def test_an_invalid_phone_is_rejected(self, client, auth):
        response = client.post("/api/members", headers=auth,
                               json={"full_name": "Bad Phone", "phone": "123"})
        assert response.status_code == 422
        assert "phone" in response.json()["message"].lower()

    def test_an_invalid_email_is_rejected(self, client, auth):
        response = client.post("/api/members", headers=auth, json={
            "full_name": "Bad Email", "phone": "9876543210",
            "email": "not-an-email",
        })
        assert response.status_code == 422

    def test_a_future_date_of_birth_is_rejected(self, client, auth):
        response = client.post("/api/members", headers=auth, json={
            "full_name": "Time Traveller", "phone": "9876543210",
            "date_of_birth": (date.today() + timedelta(days=1)).isoformat(),
        })
        assert response.status_code == 422


class TestSearch:
    def _seed(self, client, auth, plan_3m):
        make_member(client, auth, full_name="Rahul Kumar", phone="9876543210")
        make_member(client, auth, full_name="Suresh Babu", phone="9812345678",
                    email="suresh@example.com")
        make_member(client, auth, full_name="Kiran Rao", phone="9700000001")

    def test_search_by_name(self, client, auth, plan_3m):
        self._seed(client, auth, plan_3m)
        body = client.get("/api/members?q=suresh", headers=auth).json()
        assert body["total"] == 1
        assert body["items"][0]["full_name"] == "Suresh Babu"

    def test_search_is_case_insensitive(self, client, auth, plan_3m):
        self._seed(client, auth, plan_3m)
        assert client.get("/api/members?q=RAHUL", headers=auth).json()["total"] == 1

    def test_search_by_phone(self, client, auth, plan_3m):
        self._seed(client, auth, plan_3m)
        body = client.get("/api/members?q=9812345678", headers=auth).json()
        assert body["items"][0]["full_name"] == "Suresh Babu"

    def test_search_by_member_id(self, client, auth, plan_3m):
        self._seed(client, auth, plan_3m)
        body = client.get("/api/members?q=GYM-0003", headers=auth).json()
        assert body["items"][0]["full_name"] == "Kiran Rao"

    def test_search_by_email(self, client, auth, plan_3m):
        self._seed(client, auth, plan_3m)
        body = client.get("/api/members?q=suresh@example.com", headers=auth).json()
        assert body["total"] == 1

    def test_pagination(self, client, auth):
        for i in range(7):
            make_member(client, auth, full_name=f"Member {i:02d}",
                        phone=f"98000000{i:02d}")
        body = client.get("/api/members?page=1&page_size=3", headers=auth).json()
        assert body["total"] == 7
        assert len(body["items"]) == 3
        assert body["pages"] == 3


class TestStatusFilters:
    def _member_with_term(self, client, auth, plan_3m, name, phone, start, end):
        return client.post("/api/members", headers=auth, json={
            "full_name": name, "phone": phone,
            "membership": {
                "plan_id": plan_3m["id"], "start_date": start.isoformat(),
                "end_date": end.isoformat(), "fee": "2500",
            },
        }).json()["member"]

    def test_active_expired_and_expiring_are_classified_correctly(
            self, client, auth, plan_3m):
        today = date.today()
        self._member_with_term(client, auth, plan_3m, "Active Person",
                               "9000000001", today, today + timedelta(days=60))
        self._member_with_term(client, auth, plan_3m, "Expiring Person",
                               "9000000002", today - timedelta(days=80),
                               today + timedelta(days=3))
        self._member_with_term(client, auth, plan_3m, "Expired Person",
                               "9000000003", today - timedelta(days=120),
                               today - timedelta(days=5))

        def names(status):
            body = client.get(f"/api/members?status={status}", headers=auth).json()
            return {i["full_name"] for i in body["items"]}

        assert names("active") == {"Active Person", "Expiring Person"}
        assert names("expiring_soon") == {"Expiring Person"}
        assert names("expired") == {"Expired Person"}
        assert len(names("all")) == 3

    def test_days_remaining_is_reported(self, client, auth, plan_3m):
        today = date.today()
        member = self._member_with_term(
            client, auth, plan_3m, "Counter", "9000000004",
            today, today + timedelta(days=30),
        )
        detail = client.get(f"/api/members/{member['id']}", headers=auth).json()
        assert detail["days_remaining"] == 30


class TestUpdateAndArchive:
    def test_a_member_can_be_edited(self, client, auth):
        member = make_member(client, auth)["member"]
        response = client.put(f"/api/members/{member['id']}", headers=auth, json={
            "full_name": "Rahul K Kumar", "address": "12 MG Road",
        })
        assert response.status_code == 200
        assert response.json()["full_name"] == "Rahul K Kumar"
        assert response.json()["address"] == "12 MG Road"

    def test_archiving_hides_a_member_without_deleting_them(self, client, auth):
        member = make_member(client, auth)["member"]
        client.delete(f"/api/members/{member['id']}", headers=auth)

        listed = client.get("/api/members", headers=auth).json()
        assert listed["total"] == 0

        # The record itself is still there.
        detail = client.get(f"/api/members/{member['id']}", headers=auth).json()
        assert detail["is_active"] is False
        assert detail["status"] == "archived"

    def test_an_archived_member_can_be_restored(self, client, auth):
        member = make_member(client, auth)["member"]
        client.delete(f"/api/members/{member['id']}", headers=auth)
        client.post(f"/api/members/{member['id']}/restore", headers=auth)
        assert client.get("/api/members", headers=auth).json()["total"] == 1

    def test_a_missing_member_gives_a_friendly_404(self, client, auth):
        response = client.get("/api/members/99999", headers=auth)
        assert response.status_code == 404
        assert "could not be found" in response.json()["message"]
