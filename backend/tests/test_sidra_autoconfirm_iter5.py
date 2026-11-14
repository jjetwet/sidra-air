"""Iteration-5: Auto-confirm + required lead_passenger on POST /api/quotes.

AUTO_CONFIRM_TESTING=true -> every new quote should come back Confirmed with
final_price_usd == estimate, team_message = 'Auto-confirmed...', and the lead
passenger persisted as guests[0] (passport uppercased).

Also covers validation:
- missing lead_passenger -> 422
- passport expiring on/before trip end -> 400

Budget: create AT MOST 2 new quotes (one happy-path, reused across tests).
Member email: delivered@resend.dev (sandbox) so we don't spam the team inbox.
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MEMBER_TOKEN = "test_session_member"
ADMIN_TOKEN = "test_session_team"


def _hdr(tok=None):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    return h


def _lead(passport="ab987654", expiry="2031-12-01", dob="1988-03-14"):
    return {
        "full_name": "TEST_Lead Passenger",
        "nationality": "British",
        "date_of_birth": dob,
        "passport_number": passport,
        "passport_expiry": expiry,
    }


def _quote_body(lead=None, **over):
    body = {
        "from_code": "DXB",
        "to_code": "DOH",
        "jet_id": "g700",
        "trip_type": "one_way",
        "depart_date": "2027-03-15",
        "depart_window": "Flexible",
        "pax": 1,
        "name": "TEST_Auto Confirm",
        "email": "delivered@resend.dev",
        "notes": "TEST iter5 autoconfirm",
    }
    if lead is not None:
        body["lead_passenger"] = lead
    body.update(over)
    return body


# ---------------- shared happy-path quote (created ONCE) -----------------
@pytest.fixture(scope="module")
def auto_confirmed_quote():
    body = _quote_body(lead=_lead())
    r = requests.post(f"{BASE_URL}/api/quotes", headers=_hdr(MEMBER_TOKEN), json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    yield data
    # Best-effort cleanup: cancel to keep lists clean
    try:
        requests.post(f"{BASE_URL}/api/quotes/{data['id']}/cancel",
                      headers=_hdr(MEMBER_TOKEN))
    except Exception:
        pass


class TestAutoConfirm:
    def test_status_is_confirmed(self, auto_confirmed_quote):
        assert auto_confirmed_quote["status"] == "Confirmed"

    def test_final_price_equals_estimate(self, auto_confirmed_quote):
        q = auto_confirmed_quote
        assert q["final_price_usd"] is not None
        assert q["final_price_usd"] == q["estimated_price_usd"]
        assert q["final_price_usd"] > 0

    def test_team_message_set_to_autoconfirm_text(self, auto_confirmed_quote):
        assert auto_confirmed_quote.get("team_message") == \
            "Auto-confirmed while SIDRA is in testing."

    def test_guests0_populated_with_lead_and_passport_uppercased(self, auto_confirmed_quote):
        guests = auto_confirmed_quote.get("guests") or []
        assert len(guests) == 1
        g0 = guests[0]
        assert g0["full_name"] == "TEST_Lead Passenger"
        assert g0["nationality"] == "British"
        assert g0["date_of_birth"] == "1988-03-14"
        assert g0["passport_number"] == "AB987654"   # uppercased by backend
        assert g0["passport_expiry"] == "2031-12-01"

    def test_get_quote_persists_confirmed_state(self, auto_confirmed_quote):
        qid = auto_confirmed_quote["id"]
        r = requests.get(f"{BASE_URL}/api/quotes", headers=_hdr(MEMBER_TOKEN))
        assert r.status_code == 200
        match = next((q for q in r.json() if q["id"] == qid), None)
        assert match is not None
        assert match["status"] == "Confirmed"
        assert match["final_price_usd"] == auto_confirmed_quote["final_price_usd"]
        assert len(match["guests"]) == 1
        assert match["guests"][0]["passport_number"] == "AB987654"

    def test_admin_sees_confirmed_quote_with_lead(self, auto_confirmed_quote):
        qid = auto_confirmed_quote["id"]
        r = requests.get(f"{BASE_URL}/api/admin/quotes/{qid}", headers=_hdr(ADMIN_TOKEN))
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "Confirmed"
        assert body["team_message"] == "Auto-confirmed while SIDRA is in testing."
        assert body["guests"][0]["full_name"] == "TEST_Lead Passenger"


# ---------------- validation (no new quotes created) -----------------
class TestValidation:
    def test_missing_lead_passenger_returns_422(self):
        body = _quote_body()  # no lead_passenger
        r = requests.post(f"{BASE_URL}/api/quotes", headers=_hdr(MEMBER_TOKEN), json=body)
        assert r.status_code == 422, r.text
        # pydantic error mentions the missing field
        assert "lead_passenger" in r.text

    def test_lead_passport_expiring_before_trip_end_returns_400(self):
        # depart 2027-03-15, expiry same day -> rejected
        bad = _lead(expiry="2027-03-15")
        body = _quote_body(lead=bad)
        r = requests.post(f"{BASE_URL}/api/quotes", headers=_hdr(MEMBER_TOKEN), json=body)
        assert r.status_code == 400, r.text
        assert "expires before" in r.json()["detail"]

    def test_lead_dob_in_future_returns_400(self):
        bad = _lead(dob="2099-01-01")
        body = _quote_body(lead=bad)
        r = requests.post(f"{BASE_URL}/api/quotes", headers=_hdr(MEMBER_TOKEN), json=body)
        assert r.status_code == 400, r.text
        assert "past" in r.json()["detail"]

    def test_no_token_returns_401(self):
        body = _quote_body(lead=_lead())
        r = requests.post(f"{BASE_URL}/api/quotes", headers=_hdr(), json=body)
        assert r.status_code == 401


# ---------------- regression -----------------
class TestRegression:
    def test_estimate_still_works(self):
        r = requests.post(f"{BASE_URL}/api/quotes/estimate", headers=_hdr(),
                          json={"from_code": "DXB", "to_code": "DOH",
                                "jet_id": "g700", "trip_type": "one_way"})
        assert r.status_code == 200
        assert r.json()["estimated_price_usd"] > 0
