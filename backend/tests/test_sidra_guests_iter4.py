"""Iteration-4: Guest manifest API tests for SIDRA.

Covers PUT /api/quotes/{id}/guests + GET /api/admin/quotes/{id} (guests present).
Uses pre-seeded member quote 6af848ce144d965544a37958 (LAS->MAN, pax 2, depart 2026-08-10)
to avoid spamming team inbox with new quote emails.
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MEMBER_TOKEN = "test_session_member"
ADMIN_TOKEN = "test_session_team"
QUOTE_ID = "6af848ce144d965544a37958"   # LAS->MAN pax 2, depart 2026-08-10, member quote
DEPART = "2026-08-10"


def _hdr(tok=None):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    return h


def _valid_guest(name="TEST_Alpha Guest", passport="ab123456"):
    return {
        "full_name": name,
        "nationality": "British",
        "date_of_birth": "1985-04-12",
        "passport_number": passport,
        "passport_expiry": "2031-09-30",
    }


@pytest.fixture(scope="module", autouse=True)
def _restore_guests():
    """Snapshot the quote's guests before tests, restore after."""
    r = requests.get(f"{BASE_URL}/api/quotes/{QUOTE_ID}", headers=_hdr(MEMBER_TOKEN))
    assert r.status_code == 200, f"seed quote unreachable: {r.status_code} {r.text}"
    original = r.json().get("guests", [])
    yield
    requests.put(
        f"{BASE_URL}/api/quotes/{QUOTE_ID}/guests",
        headers=_hdr(MEMBER_TOKEN),
        json={"guests": original},
    )


# ------------------------------------------------------------ PUT /guests
class TestGuestsSuccess:
    def test_save_two_valid_guests_persists_and_uppercases_passport(self):
        payload = {"guests": [
            _valid_guest("TEST_Alpha Guest", "ab123456"),
            _valid_guest("TEST_Bravo Guest", "cd789012"),
        ]}
        r = requests.put(f"{BASE_URL}/api/quotes/{QUOTE_ID}/guests",
                         headers=_hdr(MEMBER_TOKEN), json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["guests"]) == 2
        assert body["guests"][0]["passport_number"] == "AB123456"
        assert body["guests"][1]["passport_number"] == "CD789012"
        # Create -> GET verification
        g = requests.get(f"{BASE_URL}/api/quotes/{QUOTE_ID}", headers=_hdr(MEMBER_TOKEN))
        assert g.status_code == 200
        guests = g.json()["guests"]
        assert len(guests) == 2
        assert {gg["full_name"] for gg in guests} == {"TEST_Alpha Guest", "TEST_Bravo Guest"}
        assert all(gg["passport_number"].isupper() for gg in guests)


# ------------------------------------------------------------ Validation
class TestGuestsValidation:
    def test_more_guests_than_pax_returns_400(self):
        payload = {"guests": [_valid_guest(f"TEST_G{i}", f"zz0000{i}") for i in range(3)]}
        r = requests.put(f"{BASE_URL}/api/quotes/{QUOTE_ID}/guests",
                         headers=_hdr(MEMBER_TOKEN), json=payload)
        assert r.status_code == 400
        assert "2 guests" in r.json()["detail"]

    def test_passport_expiry_on_or_before_trip_end_returns_400(self):
        g = _valid_guest("TEST_Expiring", "ex111111")
        g["passport_expiry"] = DEPART    # same day as departure = <= last_day
        r = requests.put(f"{BASE_URL}/api/quotes/{QUOTE_ID}/guests",
                         headers=_hdr(MEMBER_TOKEN), json={"guests": [g]})
        assert r.status_code == 400
        assert "expires before" in r.json()["detail"]

    def test_dob_in_future_returns_400(self):
        g = _valid_guest("TEST_Future", "fu222222")
        g["date_of_birth"] = "2099-01-01"
        r = requests.put(f"{BASE_URL}/api/quotes/{QUOTE_ID}/guests",
                         headers=_hdr(MEMBER_TOKEN), json={"guests": [g]})
        assert r.status_code == 400
        assert "past" in r.json()["detail"]

    def test_bad_date_format_returns_422(self):
        g = _valid_guest("TEST_BadDate", "bd333333")
        g["date_of_birth"] = "12-04-1985"
        r = requests.put(f"{BASE_URL}/api/quotes/{QUOTE_ID}/guests",
                         headers=_hdr(MEMBER_TOKEN), json={"guests": [g]})
        assert r.status_code == 422


# ------------------------------------------------------------ Auth / scope
class TestGuestsAuth:
    def test_no_token_returns_401(self):
        r = requests.put(f"{BASE_URL}/api/quotes/{QUOTE_ID}/guests",
                         headers=_hdr(), json={"guests": [_valid_guest()]})
        assert r.status_code == 401

    def test_non_owner_admin_token_on_member_route_returns_404(self):
        """Admin hitting /api/quotes/{id}/guests (member path) must 404 because owner mismatch."""
        r = requests.put(f"{BASE_URL}/api/quotes/{QUOTE_ID}/guests",
                         headers=_hdr(ADMIN_TOKEN), json={"guests": [_valid_guest()]})
        assert r.status_code == 404


# ------------------------------------------------------------ Cancelled quote
class TestCancelledBlocked:
    """Create a dedicated TEST quote, cancel it, verify guests PUT is blocked, then cleanup."""

    @pytest.fixture(scope="class")
    def cancelled_quote_id(self):
        body = {
            "from_code": "DXB", "to_code": "DOH", "jet_id": "g700",
            "trip_type": "one_way", "depart_date": "2027-02-14",
            "depart_window": "Flexible", "pax": 1,
            "name": "TEST_Cancelled Member",
            "email": "delivered@resend.dev",
            "notes": "TEST iter4 cancelled-quote path",
        }
        r = requests.post(f"{BASE_URL}/api/quotes",
                          headers=_hdr(MEMBER_TOKEN), json=body)
        assert r.status_code == 200, r.text
        qid = r.json()["id"]
        c = requests.post(f"{BASE_URL}/api/quotes/{qid}/cancel",
                          headers=_hdr(MEMBER_TOKEN))
        assert c.status_code == 200
        assert c.json()["status"] == "Cancelled"
        yield qid
        # No delete endpoint - leave as Cancelled (safe, not visible in active lists)

    def test_cancelled_quote_blocks_guests_put_400(self, cancelled_quote_id):
        r = requests.put(f"{BASE_URL}/api/quotes/{cancelled_quote_id}/guests",
                         headers=_hdr(MEMBER_TOKEN), json={"guests": [_valid_guest()]})
        assert r.status_code == 400
        assert "cancelled" in r.json()["detail"].lower()


# ------------------------------------------------------------ Admin GET includes guests
class TestAdminIncludesGuests:
    def test_admin_quote_detail_includes_saved_guests(self):
        # Ensure 2 guests saved (matches success test state)
        requests.put(f"{BASE_URL}/api/quotes/{QUOTE_ID}/guests",
                     headers=_hdr(MEMBER_TOKEN),
                     json={"guests": [
                         _valid_guest("TEST_Alpha Guest", "ab123456"),
                         _valid_guest("TEST_Bravo Guest", "cd789012"),
                     ]})
        r = requests.get(f"{BASE_URL}/api/admin/quotes/{QUOTE_ID}",
                         headers=_hdr(ADMIN_TOKEN))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "guests" in body
        assert len(body["guests"]) == 2
        g0 = body["guests"][0]
        for k in ("full_name", "nationality", "date_of_birth",
                  "passport_number", "passport_expiry"):
            assert k in g0 and g0[k], f"missing {k} in admin response: {g0}"


# ------------------------------------------------------------ Regression
class TestRegression:
    def test_estimate_still_works(self):
        r = requests.post(f"{BASE_URL}/api/quotes/estimate", headers=_hdr(),
                          json={"from_code": "LAS", "to_code": "MAN",
                                "jet_id": "g700", "trip_type": "one_way"})
        assert r.status_code == 200
        assert r.json()["estimated_price_usd"] > 0

    def test_member_quotes_list_contains_seed_quote(self):
        r = requests.get(f"{BASE_URL}/api/quotes", headers=_hdr(MEMBER_TOKEN))
        assert r.status_code == 200
        ids = [q["id"] for q in r.json()]
        assert QUOTE_ID in ids
