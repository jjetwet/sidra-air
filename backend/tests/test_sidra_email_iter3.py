"""Iteration 3 - Branded member emails (Resend) and email_status field.

Covered:
- POST /api/quotes -> background Resend sends 'Quote request received' -> email_status 'Request email sent'
- POST /api/admin/quotes/{id} Confirmed -> email_status 'Confirmation email sent'
- Unavailable status does NOT set email_status to any Confirmation value
- Regression: admin 403 with member token, 401 without token
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MEMBER_TOKEN = "test_session_member"
ADMIN_TOKEN = "test_session_team"
# Resend test address: deliverable (counts as sent) but doesn't actually email anyone.
RESEND_TEST_EMAIL = "delivered@resend.dev"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    c = MongoClient(url)
    try:
        yield c[db_name]
    finally:
        c.close()


@pytest.fixture
def created_quote_ids():
    ids: list[str] = []
    yield ids
    # teardown: clean up TEST_ quotes we created
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    c = MongoClient(url)
    try:
        for qid in ids:
            if ObjectId.is_valid(qid):
                c[db_name].quotes.delete_one({"_id": ObjectId(qid)})
    finally:
        c.close()


def _member_hdr():
    return {"Authorization": f"Bearer {MEMBER_TOKEN}"}


def _admin_hdr():
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}


def _quote_body(name="TEST_ Request Email"):
    return {
        "from_code": "LAS",
        "to_code": "LPL",
        "jet_id": "global-7500",
        "trip_type": "one_way",
        "depart_date": "2026-06-15",
        "depart_window": "Morning",
        "pax": 4,
        "name": name,
        "email": RESEND_TEST_EMAIL,
        "notes": "TEST_ iteration-3 branded email flow",
    }


# ---------- tests ----------
class TestEmailStatusFlow:
    def test_regression_no_token_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/quotes", json=_quote_body())
        assert r.status_code == 401, r.text

    def test_regression_member_cannot_hit_admin(self, api):
        r = api.get(f"{BASE_URL}/api/admin/quotes", headers=_member_hdr())
        assert r.status_code == 403, r.text

    def test_create_quote_sends_request_email(self, api, created_quote_ids):
        r = api.post(f"{BASE_URL}/api/quotes", json=_quote_body(), headers=_member_hdr())
        assert r.status_code == 200, r.text
        q = r.json()
        qid = q["id"]
        created_quote_ids.append(qid)
        assert q["email"] == RESEND_TEST_EMAIL
        assert q["status"] == "Requested"
        # initial create response may or may not include email_status (background job)
        assert q.get("email_status") in (None, "Request email sent", "Request email failed")

        # poll admin GET for up to ~12s for background task to finish
        final_status = None
        for _ in range(12):
            time.sleep(1)
            g = api.get(f"{BASE_URL}/api/admin/quotes/{qid}", headers=_admin_hdr())
            assert g.status_code == 200, g.text
            final_status = g.json().get("email_status")
            if final_status in ("Request email sent", "Request email failed"):
                break
        assert final_status == "Request email sent", f"email_status={final_status!r}"

    def test_confirm_sends_confirmation_email(self, api, created_quote_ids):
        # create a fresh quote for confirm flow
        r = api.post(f"{BASE_URL}/api/quotes", json=_quote_body("TEST_ Confirm Email"), headers=_member_hdr())
        assert r.status_code == 200
        qid = r.json()["id"]
        created_quote_ids.append(qid)
        time.sleep(6)  # let request email settle first

        # confirm with final price
        body = {"status": "Confirmed", "final_price_usd": 125000, "team_message": "TEST_ tail A6-SDR secured"}
        c = api.post(f"{BASE_URL}/api/admin/quotes/{qid}", json=body, headers=_admin_hdr())
        assert c.status_code == 200, c.text
        data = c.json()
        assert data["status"] == "Confirmed"
        assert data["final_price_usd"] == 125000
        # confirmation email is awaited (not background), so status should be set on response
        assert data.get("email_status") == "Confirmation email sent", f"got {data.get('email_status')!r}"

    def test_unavailable_does_not_overwrite_to_confirmation(self, api, created_quote_ids):
        r = api.post(f"{BASE_URL}/api/quotes", json=_quote_body("TEST_ Unavailable"), headers=_member_hdr())
        assert r.status_code == 200
        qid = r.json()["id"]
        created_quote_ids.append(qid)
        time.sleep(6)

        # mark unavailable
        body = {"status": "Unavailable", "team_message": "TEST_ No tail available"}
        c = api.post(f"{BASE_URL}/api/admin/quotes/{qid}", json=body, headers=_admin_hdr())
        assert c.status_code == 200, c.text
        data = c.json()
        assert data["status"] == "Unavailable"
        # must NOT be a confirmation status. Prior status may stay as "Request email sent"
        assert data.get("email_status") != "Confirmation email sent"
        assert data.get("email_status") != "Confirmation email failed"

    def test_confirm_requires_final_price(self, api, created_quote_ids):
        r = api.post(f"{BASE_URL}/api/quotes", json=_quote_body("TEST_ Confirm No Price"), headers=_member_hdr())
        assert r.status_code == 200
        qid = r.json()["id"]
        created_quote_ids.append(qid)
        body = {"status": "Confirmed", "team_message": ""}
        c = api.post(f"{BASE_URL}/api/admin/quotes/{qid}", json=body, headers=_admin_hdr())
        assert c.status_code == 400, c.text
