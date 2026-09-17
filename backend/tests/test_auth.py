"""Authentication and authorization."""
from tests.conftest import OWNER_EMAIL, OWNER_PASSWORD


class TestLogin:
    def test_owner_can_sign_in_with_email(self, client):
        response = client.post("/api/auth/login", json={
            "identifier": OWNER_EMAIL, "password": OWNER_PASSWORD,
        })
        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert body["access_token"]
        assert body["expires_in"] > 0

    def test_email_is_case_insensitive(self, client):
        response = client.post("/api/auth/login", json={
            "identifier": OWNER_EMAIL.upper(), "password": OWNER_PASSWORD,
        })
        assert response.status_code == 200

    def test_wrong_password_is_rejected(self, client):
        response = client.post("/api/auth/login", json={
            "identifier": OWNER_EMAIL, "password": "wrong-password",
        })
        assert response.status_code == 401
        assert "Incorrect login details" in response.json()["message"]

    def test_unknown_account_gives_the_same_message(self, client):
        """Never reveal whether an account exists."""
        response = client.post("/api/auth/login", json={
            "identifier": "nobody@nowhere.local", "password": "whatever",
        })
        assert response.status_code == 401
        assert "Incorrect login details" in response.json()["message"]

    def test_an_identifier_with_no_digits_does_not_match_a_phoneless_account(
            self, client):
        """Regression: a non-numeric identifier must not be treated as a phone
        lookup, or it matches any account whose phone column is NULL."""
        response = client.post("/api/auth/login", json={
            "identifier": "someone-else@test.local", "password": OWNER_PASSWORD,
        })
        assert response.status_code == 401

    def test_password_is_not_stored_in_plain_text(self, db):
        from app.models import User
        user = db.query(User).first()
        assert user.password_hash != OWNER_PASSWORD
        assert user.password_hash.startswith("$2")   # bcrypt


class TestProtectedRoutes:
    def test_requests_without_a_token_are_refused(self, client):
        response = client.get("/api/members")
        assert response.status_code == 401
        assert "sign in" in response.json()["message"].lower()

    def test_a_forged_token_is_refused(self, client):
        response = client.get("/api/members",
                              headers={"Authorization": "Bearer not.a.real.token"})
        assert response.status_code == 401

    def test_a_valid_token_is_accepted(self, client, auth):
        assert client.get("/api/members", headers=auth).status_code == 200

    def test_me_returns_the_signed_in_user(self, client, auth):
        body = client.get("/api/auth/me", headers=auth).json()
        assert body["email"] == OWNER_EMAIL
        assert body["role"] == "owner"
        assert "password_hash" not in body


class TestStaffAccounts:
    def test_owner_can_add_a_staff_login(self, client, auth):
        response = client.post("/api/auth/users", headers=auth, json={
            "full_name": "Front Desk", "email": "desk@test.local",
            "password": "DeskPass123!", "role": "staff",
        })
        assert response.status_code == 201
        assert response.json()["role"] == "staff"

    def test_duplicate_emails_are_rejected(self, client, auth):
        payload = {"full_name": "Desk Two", "email": "desk@test.local",
                   "password": "DeskPass123!", "role": "staff"}
        client.post("/api/auth/users", headers=auth, json=payload)
        response = client.post("/api/auth/users", headers=auth, json=payload)
        assert response.status_code == 400
        assert "already exists" in response.json()["message"]

    def test_staff_cannot_change_gym_settings(self, client, auth):
        client.post("/api/auth/users", headers=auth, json={
            "full_name": "Front Desk", "email": "desk2@test.local",
            "password": "DeskPass123!", "role": "staff",
        })
        staff_token = client.post("/api/auth/login", json={
            "identifier": "desk2@test.local", "password": "DeskPass123!",
        }).json()["access_token"]
        staff_auth = {"Authorization": f"Bearer {staff_token}"}

        # Staff may read settings...
        assert client.get("/api/settings", headers=staff_auth).status_code == 200
        # ...but not change them.
        response = client.put("/api/settings", headers=staff_auth,
                              json={"name": "Hijacked Gym"})
        assert response.status_code == 403

    def test_a_deactivated_account_cannot_sign_in(self, client, auth):
        created = client.post("/api/auth/users", headers=auth, json={
            "full_name": "Ex Staff", "email": "ex@test.local",
            "password": "ExPass123456!", "role": "staff",
        }).json()
        client.patch(f"/api/auth/users/{created['id']}/status?is_active=false",
                     headers=auth)
        response = client.post("/api/auth/login", json={
            "identifier": "ex@test.local", "password": "ExPass123456!",
        })
        assert response.status_code == 403


class TestPasswordChange:
    def test_owner_can_change_their_password(self, client, auth):
        response = client.post("/api/auth/change-password", headers=auth, json={
            "current_password": OWNER_PASSWORD, "new_password": "BrandNewPass1!",
        })
        assert response.status_code == 200
        assert client.post("/api/auth/login", json={
            "identifier": OWNER_EMAIL, "password": "BrandNewPass1!",
        }).status_code == 200

    def test_the_current_password_must_be_correct(self, client, auth):
        response = client.post("/api/auth/change-password", headers=auth, json={
            "current_password": "not-it", "new_password": "BrandNewPass1!",
        })
        assert response.status_code == 400

    def test_short_passwords_are_rejected(self, client, auth):
        response = client.post("/api/auth/change-password", headers=auth, json={
            "current_password": OWNER_PASSWORD, "new_password": "short",
        })
        assert response.status_code == 422
