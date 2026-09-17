"""Test fixtures.

Every test runs against a throwaway SQLite file with the real schema, the real
seed routine and the real HTTP stack - no mocking of the database or the API.
"""
import os
import tempfile
from pathlib import Path

# Configure the environment BEFORE any app module is imported, because the
# engine and settings are built at import time.
_TMP = Path(tempfile.mkdtemp(prefix="gymtest-"))
os.environ.update(
    APP_ENV="test",
    DATABASE_URL=f"sqlite:///{(_TMP / 'test.db').as_posix()}",
    JWT_SECRET="test-secret-key-for-tests-only",
    OWNER_EMAIL="owner@test.local",
    OWNER_PASSWORD="OwnerPass123!",
    OWNER_NAME="Test Owner",
    GYM_NAME="Iron Fitness Gym",
    GYM_TIMEZONE="Asia/Kolkata",
    STORAGE_BACKEND="local",
    STORAGE_LOCAL_DIR=str(_TMP / "uploads"),
    BCRYPT_ROUNDS="4",          # keeps the suite fast; production uses 12
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.seed import seed  # noqa: E402

OWNER_EMAIL = "owner@test.local"
OWNER_PASSWORD = "OwnerPass123!"


@pytest.fixture(autouse=True)
def fresh_database():
    """A clean database for every test - no shared state, no ordering traps."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    # The lifespan seed is skipped; `fresh_database` has already done it.
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def token(client) -> str:
    response = client.post("/api/auth/login", json={
        "identifier": OWNER_EMAIL, "password": OWNER_PASSWORD,
    })
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
def auth(token) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def plans(client, auth) -> list[dict]:
    return client.get("/api/plans", headers=auth).json()


@pytest.fixture
def plan_3m(plans) -> dict:
    return next(p for p in plans if p["name"] == "3 Months")


def make_member(client, auth, **overrides) -> dict:
    """Create a member and return the full creation response."""
    payload = {
        "full_name": "Rahul Kumar",
        "phone": "9876543210",
        **overrides,
    }
    response = client.post("/api/members", json=payload, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()
