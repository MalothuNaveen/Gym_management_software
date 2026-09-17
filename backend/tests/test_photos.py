"""Photo upload, compression, validation and access control."""
import io

import pytest
from PIL import Image

from tests.conftest import make_member


def make_image(width=2400, height=1800, fmt="JPEG") -> bytes:
    """A large, realistic 'phone photo'."""
    img = Image.new("RGB", (width, height), (120, 140, 160))
    # Some detail so the JPEG does not compress to almost nothing.
    for x in range(0, width, 40):
        for y in range(0, height, 40):
            img.putpixel((x, y), ((x * 7) % 255, (y * 3) % 255, 90))
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def member(client, auth):
    return make_member(client, auth)["member"]


class TestPhotoUpload:
    def test_a_photo_can_be_uploaded_and_read_back(self, client, auth, member):
        response = client.post(
            f"/api/members/{member['id']}/photo",
            headers=auth,
            files={"file": ("photo.jpg", make_image(), "image/jpeg")},
        )
        assert response.status_code == 200

        detail = client.get(f"/api/members/{member['id']}", headers=auth).json()
        assert detail["has_photo"] is True

        fetched = client.get(f"/api/members/{member['id']}/photo", headers=auth)
        assert fetched.status_code == 200
        assert fetched.headers["content-type"] == "image/jpeg"
        assert fetched.content[:2] == b"\xff\xd8"      # JPEG magic bytes

    def test_large_photos_are_resized_and_shrunk(self, client, auth, member):
        original = make_image(2400, 1800)
        client.post(
            f"/api/members/{member['id']}/photo",
            headers=auth,
            files={"file": ("photo.jpg", original, "image/jpeg")},
        )
        stored = client.get(f"/api/members/{member['id']}/photo", headers=auth).content

        assert len(stored) < len(original)
        image = Image.open(io.BytesIO(stored))
        assert max(image.size) <= 800          # PHOTO_MAX_DIMENSION
        assert image.size[0] / image.size[1] == pytest.approx(2400 / 1800, rel=0.02)

    def test_a_png_is_accepted_and_converted_to_jpeg(self, client, auth, member):
        response = client.post(
            f"/api/members/{member['id']}/photo",
            headers=auth,
            files={"file": ("photo.png", make_image(600, 600, "PNG"), "image/png")},
        )
        assert response.status_code == 200
        stored = client.get(f"/api/members/{member['id']}/photo", headers=auth).content
        assert Image.open(io.BytesIO(stored)).format == "JPEG"

    def test_replacing_a_photo_works(self, client, auth, member):
        for _ in range(2):
            assert client.post(
                f"/api/members/{member['id']}/photo",
                headers=auth,
                files={"file": ("photo.jpg", make_image(800, 800), "image/jpeg")},
            ).status_code == 200

    def test_a_photo_can_be_removed(self, client, auth, member):
        client.post(
            f"/api/members/{member['id']}/photo",
            headers=auth,
            files={"file": ("photo.jpg", make_image(400, 400), "image/jpeg")},
        )
        assert client.delete(f"/api/members/{member['id']}/photo",
                             headers=auth).status_code == 200
        assert client.get(f"/api/members/{member['id']}",
                          headers=auth).json()["has_photo"] is False


class TestPhotoSecurity:
    def test_a_disguised_script_is_rejected(self, client, auth, member):
        """A .jpg that is really a shell script must never be stored."""
        response = client.post(
            f"/api/members/{member['id']}/photo",
            headers=auth,
            files={"file": ("evil.jpg", b"#!/bin/sh\nrm -rf /\n", "image/jpeg")},
        )
        assert response.status_code == 400
        assert "not a valid image" in response.json()["message"]

    def test_a_disallowed_content_type_is_rejected(self, client, auth, member):
        response = client.post(
            f"/api/members/{member['id']}/photo",
            headers=auth,
            files={"file": ("doc.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )
        assert response.status_code == 400
        assert "JPG, PNG or WEBP" in response.json()["message"]

    def test_an_oversized_file_is_rejected(self, client, auth, member):
        # 9 MB of noise, above the 8 MB limit.
        response = client.post(
            f"/api/members/{member['id']}/photo",
            headers=auth,
            files={"file": ("big.jpg", b"\xff\xd8" + b"\x00" * (9 * 1024 * 1024),
                            "image/jpeg")},
        )
        assert response.status_code == 400
        assert "too large" in response.json()["message"]

    def test_photos_cannot_be_read_without_signing_in(self, client, auth, member):
        client.post(
            f"/api/members/{member['id']}/photo",
            headers=auth,
            files={"file": ("photo.jpg", make_image(400, 400), "image/jpeg")},
        )
        assert client.get(f"/api/members/{member['id']}/photo").status_code == 401

    def test_stored_filenames_are_not_guessable(self, client, auth, member, db):
        """The object key must be a random id, never the member's name or id."""
        from app.models import Member

        client.post(
            f"/api/members/{member['id']}/photo",
            headers=auth,
            files={"file": ("rahul-kumar.jpg", make_image(400, 400), "image/jpeg")},
        )
        key = db.get(Member, member["id"]).photo_key
        assert "rahul" not in key.lower()
        assert key.endswith(".jpg")
        # 32 hex characters of randomness.
        assert len(key.rsplit("/", 1)[-1]) == 36


class TestLogo:
    def test_the_logo_can_be_uploaded_and_reaches_the_receipt_pdf(
            self, client, auth, plan_3m):
        from datetime import date

        assert client.post(
            "/api/settings/logo",
            headers=auth,
            files={"file": ("logo.png", make_image(400, 400, "PNG"), "image/png")},
        ).status_code == 200
        assert client.get("/api/settings", headers=auth).json()["has_logo"] is True

        body = client.post("/api/members", headers=auth, json={
            "full_name": "Logo Test", "phone": "9000000001",
            "membership": {"plan_id": plan_3m["id"],
                           "start_date": date.today().isoformat(), "fee": "2500"},
            "payment": {"amount": "2500", "method": "cash"},
        }).json()

        pdf = client.get(f"/api/receipts/{body['receipt_id']}/pdf", headers=auth)
        assert pdf.status_code == 200
        assert pdf.content.startswith(b"%PDF-")
        # A PDF carrying an embedded image is materially larger.
        assert len(pdf.content) > 5000
