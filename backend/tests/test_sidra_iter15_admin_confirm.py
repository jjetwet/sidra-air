"""Iteration 15: auto-confirm removed. New quotes stay Requested until an admin confirms.

Creates ONE TEST_ quote as the member, then cancels it on teardown.
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MEMBER = ("member.test@sidra.example", "SidraTest2026")
ADMIN = ("joshua@flysidra.com", "Sidra3535fb!Jet")


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text}")
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def member():
    return _login(*MEMBER)


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def quote(member):
    body = {
        "from_code": "DXB", "to_code": "DOH", "jet_id": "g700", "trip_type": "one_way",
        "depart_date": "2027-03-15", "depart_window": "Flexible", "pax": 1,
        "name": "TEST_Iter15 Member", "email": "delivered@resend.dev", "notes": "TEST iter15 manual confirm",
        "lead_passenger": {"full_name": "TEST_Lead Iter15", "nationality": "British",
                           "date_of_birth": "1985-04-12", "passport_number": "ab123456",
                           "passport_expiry": "2031-06-30"},
    }
    r = requests.post(f"{BASE_URL}/api/quotes", headers=member, json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    yield data
    requests.post(f"{BASE_URL}/api/quotes/{data['id']}/cancel", headers=member)


# Quote creation: no auto-confirm
class TestNoAutoConfirm:
    def test_status_requested_no_final_price(self, quote):
        assert quote["status"] == "Requested"
        assert quote["final_price_usd"] is None
        assert not (quote.get("team_message") or "").startswith("Auto-confirmed")
        assert quote["estimated_price_usd"] > 0

    def test_get_persists_requested(self, quote, member):
        r = requests.get(f"{BASE_URL}/api/quotes/{quote['id']}", headers=member)
        assert r.status_code == 200
        assert r.json()["status"] == "Requested"
        assert r.json()["final_price_usd"] is None

    def test_checkout_refused_409_before_confirm(self, quote, member):
        r = requests.post(f"{BASE_URL}/api/payments/checkout", headers=member, json={"quote_id": quote["id"]})
        assert r.status_code == 409, r.text
        assert "confirms" in r.json()["detail"]

    def test_admin_list_shows_requested(self, quote, admin):
        r = requests.get(f"{BASE_URL}/api/admin/quotes?status=Requested", headers=admin)
        assert r.status_code == 200
        assert any(q["id"] == quote["id"] for q in r.json())


# Admin confirm flow
class TestAdminConfirm:
    def test_member_cannot_use_admin_endpoint(self, quote, member):
        r = requests.post(f"{BASE_URL}/api/admin/quotes/{quote['id']}", headers=member,
                          json={"status": "Confirmed", "final_price_usd": 50000})
        assert r.status_code in (401, 403)

    def test_confirm_without_price_400(self, quote, admin):
        r = requests.post(f"{BASE_URL}/api/admin/quotes/{quote['id']}", headers=admin, json={"status": "Confirmed"})
        assert r.status_code == 400
        assert "final price" in r.json()["detail"]

    def test_admin_confirms(self, quote, admin):
        r = requests.post(f"{BASE_URL}/api/admin/quotes/{quote['id']}", headers=admin,
                          json={"status": "Confirmed", "final_price_usd": 43210, "team_message": "TEST confirmed"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Confirmed"
        assert r.json()["final_price_usd"] == 43210

    def test_member_sees_confirmed(self, quote, member):
        r = requests.get(f"{BASE_URL}/api/quotes/{quote['id']}", headers=member)
        assert r.json()["status"] == "Confirmed"
        assert r.json()["final_price_usd"] == 43210

    def test_checkout_not_409_after_confirm(self, quote, member):
        r = requests.post(f"{BASE_URL}/api/payments/checkout", headers=member, json={"quote_id": quote["id"]})
        print("checkout after confirm:", r.status_code, r.text[:200])
        assert r.status_code != 409, r.text
        # 200 with checkout_url if a Stripe secret key is configured; 503 while only a publishable key (pk_) is set
        if r.status_code == 200:
            assert "checkout_url" in r.json()
