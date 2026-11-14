"""
Iteration-8 backend tests for SIDRA:
- Saved travellers (auto-save on manifest / quote create, GET, DELETE, auth, isolation)
- Client access codes (admin CRUD, duplicate, member forbidden, register with client code, deactivate)
- Payments (checkout 503 known-key, refresh returns quote)

Member quote 6af848ce144d965544a37958 (pax=2) is used for manifest tests -- no new quotes created.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://sidra-air--2uijgch0.preview.emergentagent.com").rstrip("/")
MEMBER_EMAIL = "member.test@sidra.example"
MEMBER_PASSWORD = "SidraTest2026"
TEAM_EMAIL = "team.test@sidra.example"
TEAM_PASSWORD = "SidraTest2026"
INVITE_CODE = "2893159"
MEMBER_QUOTE_ID = "6af848ce144d965544a37958"  # pax 2


# ---------------------------------------------------------------- helpers

def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def member_token() -> str:
    return _login(MEMBER_EMAIL, MEMBER_PASSWORD)


@pytest.fixture(scope="module")
def team_token() -> str:
    return _login(TEAM_EMAIL, TEAM_PASSWORD)


def _mh(t: str) -> dict:
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _mk_guest(suffix: str) -> dict:
    return {
        "full_name": f"TEST_IT8_{suffix}",
        "nationality": "British",
        "date_of_birth": "1985-06-15",
        "passport_number": f"QA8{suffix}".upper()[:10],
        "passport_expiry": "2032-12-31",
    }


# ---------------------------------------------------------------- 1. Travellers auth

class TestTravellersAuth:
    def test_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/travellers", timeout=30)
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/travellers/none", timeout=30)
        assert r.status_code == 401


# ---------------------------------------------------------------- 2. Travellers auto-save on manifest

class TestTravellersManifestAutoSave:
    """Save 2 TEST_ guests on the existing member quote -> travellers upserted."""

    @classmethod
    def setup_class(cls):
        cls.suffix_a = uuid.uuid4().hex[:5]
        cls.suffix_b = uuid.uuid4().hex[:5]
        cls.saved_ids: list[str] = []

    def test_put_guests_200_and_autosaves_travellers(self, member_token):
        guest_a = _mk_guest(self.suffix_a)
        guest_b = _mk_guest(self.suffix_b)
        r = requests.put(
            f"{BASE_URL}/api/quotes/{MEMBER_QUOTE_ID}/guests",
            headers=_mh(member_token),
            json={"guests": [guest_a, guest_b]},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        q = r.json()
        assert len(q.get("guests") or []) == 2

        # Travellers list now contains both passport numbers
        r2 = requests.get(f"{BASE_URL}/api/travellers", headers=_mh(member_token), timeout=30)
        assert r2.status_code == 200
        travellers = r2.json()
        passports = {t["passport_number"] for t in travellers}
        assert guest_a["passport_number"].upper() in passports
        assert guest_b["passport_number"].upper() in passports
        for t in travellers:
            if t["passport_number"] in (guest_a["passport_number"].upper(), guest_b["passport_number"].upper()):
                assert t["full_name"].startswith("TEST_IT8_")
                assert t.get("id")
                self.saved_ids.append(t["id"])

    def test_upsert_no_duplicate_on_resave(self, member_token):
        """Saving same manifest again must not duplicate travellers."""
        guest_a = _mk_guest(self.suffix_a)
        guest_b = _mk_guest(self.suffix_b)
        r = requests.put(
            f"{BASE_URL}/api/quotes/{MEMBER_QUOTE_ID}/guests",
            headers=_mh(member_token),
            json={"guests": [guest_a, guest_b]},
            timeout=30,
        )
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/travellers", headers=_mh(member_token), timeout=30)
        passports = [t["passport_number"] for t in r2.json()]
        # each appears exactly once
        for p in (guest_a["passport_number"].upper(), guest_b["passport_number"].upper()):
            assert passports.count(p) == 1

    def test_delete_travellers_cleanup(self, member_token):
        r = requests.get(f"{BASE_URL}/api/travellers", headers=_mh(member_token), timeout=30)
        assert r.status_code == 200
        for t in r.json():
            if t["full_name"].startswith("TEST_IT8_"):
                d = requests.delete(f"{BASE_URL}/api/travellers/{t['id']}", headers=_mh(member_token), timeout=30)
                assert d.status_code == 200, d.text
        # second delete of same id returns 404
        if r.json():
            any_id = next((t["id"] for t in r.json() if t["full_name"].startswith("TEST_IT8_")), None)
            if any_id:
                d2 = requests.delete(f"{BASE_URL}/api/travellers/{any_id}", headers=_mh(member_token), timeout=30)
                assert d2.status_code == 404

    def test_delete_unknown_id_404(self, member_token):
        d = requests.delete(f"{BASE_URL}/api/travellers/does_not_exist_xyz", headers=_mh(member_token), timeout=30)
        assert d.status_code == 404


# ---------------------------------------------------------------- 3. Travellers user isolation

class TestTravellersIsolation:
    def test_team_cannot_see_member_passports(self, member_token, team_token):
        # Member creates a quick traveller via manifest save
        suffix = uuid.uuid4().hex[:5]
        g = _mk_guest(suffix)
        g2 = _mk_guest(uuid.uuid4().hex[:5])
        r = requests.put(
            f"{BASE_URL}/api/quotes/{MEMBER_QUOTE_ID}/guests",
            headers=_mh(member_token),
            json={"guests": [g, g2]},
            timeout=30,
        )
        assert r.status_code == 200
        # Team list must not contain member's passport
        team = requests.get(f"{BASE_URL}/api/travellers", headers=_mh(team_token), timeout=30)
        assert team.status_code == 200
        team_passports = {t["passport_number"] for t in team.json()}
        assert g["passport_number"].upper() not in team_passports

        # cleanup: member deletes the two just-created travellers
        m = requests.get(f"{BASE_URL}/api/travellers", headers=_mh(member_token), timeout=30)
        for t in m.json():
            if t["full_name"].startswith("TEST_IT8_"):
                requests.delete(f"{BASE_URL}/api/travellers/{t['id']}", headers=_mh(member_token), timeout=30)


# ---------------------------------------------------------------- 4. Access codes

class TestAccessCodes:
    created_codes: list[str] = []

    def test_member_cannot_list_codes(self, member_token):
        r = requests.get(f"{BASE_URL}/api/admin/codes", headers=_mh(member_token), timeout=30)
        assert r.status_code == 403

    def test_member_cannot_create_code(self, member_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/codes",
            headers=_mh(member_token),
            json={"client_name": "TEST_IT8 member attempt"},
            timeout=30,
        )
        assert r.status_code == 403

    def test_team_list_includes_default_and_rank(self, team_token):
        r = requests.get(f"{BASE_URL}/api/admin/codes", headers=_mh(team_token), timeout=30)
        assert r.status_code == 200
        codes = r.json()
        assert any(c["code"] == INVITE_CODE and c["is_default"] for c in codes)
        for c in codes:
            for k in ("members", "charters", "confirmed", "paid_revenue_usd", "active"):
                assert k in c

    def test_team_creates_auto_generated_code(self, team_token):
        name = f"TEST_IT8 Client {uuid.uuid4().hex[:4]}"
        r = requests.post(
            f"{BASE_URL}/api/admin/codes",
            headers=_mh(team_token),
            json={"client_name": name},
            timeout=30,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["client_name"] == name
        assert body["active"] is True
        assert len(body["code"]) == 7 and body["code"].isdigit()
        TestAccessCodes.created_codes.append(body["code"])

    def test_team_creates_custom_code(self, team_token):
        custom = "TESTIT8" + uuid.uuid4().hex[:4].upper()
        r = requests.post(
            f"{BASE_URL}/api/admin/codes",
            headers=_mh(team_token),
            json={"client_name": "TEST_IT8 Custom", "code": custom},
            timeout=30,
        )
        assert r.status_code == 201, r.text
        assert r.json()["code"] == custom.upper()
        TestAccessCodes.created_codes.append(custom.upper())

    def test_duplicate_code_409(self, team_token):
        if not TestAccessCodes.created_codes:
            pytest.skip("no custom code to duplicate")
        existing = TestAccessCodes.created_codes[-1]
        r = requests.post(
            f"{BASE_URL}/api/admin/codes",
            headers=_mh(team_token),
            json={"client_name": "TEST_IT8 dupe", "code": existing},
            timeout=30,
        )
        assert r.status_code == 409

    def test_invalid_code_shape_422(self, team_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/codes",
            headers=_mh(team_token),
            json={"client_name": "TEST_IT8 bad", "code": "has-dash!"},
            timeout=30,
        )
        assert r.status_code == 422

    def test_register_with_active_client_code_and_increments_members(self, team_token):
        if not TestAccessCodes.created_codes:
            pytest.skip("no code available")
        code = TestAccessCodes.created_codes[0]
        # count members before
        before = requests.get(f"{BASE_URL}/api/admin/codes", headers=_mh(team_token), timeout=30).json()
        before_members = next(c["members"] for c in before if c["code"] == code)

        reg = {
            "invite_code": code,
            "name": "TEST_IT8 Signup",
            "email": f"test_it8+{uuid.uuid4().hex[:8]}@sidra.example",
            "password": "SidraTest2026",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", json=reg, timeout=30)
        assert r.status_code == 201, r.text
        assert "access_token" in r.json()

        # count members after
        after = requests.get(f"{BASE_URL}/api/admin/codes", headers=_mh(team_token), timeout=30).json()
        after_members = next(c["members"] for c in after if c["code"] == code)
        assert after_members == before_members + 1

    def test_toggle_deactivates_and_rejects_register(self, team_token):
        if not TestAccessCodes.created_codes:
            pytest.skip("no code available")
        code = TestAccessCodes.created_codes[-1]
        t = requests.post(f"{BASE_URL}/api/admin/codes/{code}/toggle", headers=_mh(team_token), timeout=30)
        assert t.status_code == 200
        assert t.json()["active"] is False

        reg = {
            "invite_code": code,
            "name": "TEST_IT8 Blocked",
            "email": f"test_it8_blk+{uuid.uuid4().hex[:8]}@sidra.example",
            "password": "SidraTest2026",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", json=reg, timeout=30)
        assert r.status_code == 400
        assert "not recognised" in r.json().get("detail", "").lower()

        # reactivate -> register accepted
        t2 = requests.post(f"{BASE_URL}/api/admin/codes/{code}/toggle", headers=_mh(team_token), timeout=30)
        assert t2.status_code == 200
        assert t2.json()["active"] is True

        reg["email"] = f"test_it8_react+{uuid.uuid4().hex[:8]}@sidra.example"
        r2 = requests.post(f"{BASE_URL}/api/auth/register", json=reg, timeout=30)
        assert r2.status_code == 201

    def test_toggle_unknown_code_404(self, team_token):
        r = requests.post(f"{BASE_URL}/api/admin/codes/DOESNOTEXIST9/toggle", headers=_mh(team_token), timeout=30)
        assert r.status_code == 404


# ---------------------------------------------------------------- 5. Payments

class TestPayments:
    def test_checkout_503_publishable_key(self, member_token):
        # Find a Confirmed quote belonging to member
        q = requests.get(f"{BASE_URL}/api/quotes", headers=_mh(member_token), timeout=30).json()
        confirmed = next((x for x in q if x.get("status") == "Confirmed" and x.get("final_price_usd")), None)
        if not confirmed:
            pytest.skip("no confirmed quote for member")
        r = requests.post(
            f"{BASE_URL}/api/payments/checkout",
            headers=_mh(member_token),
            json={"quote_id": confirmed["id"]},
            timeout=30,
        )
        assert r.status_code == 503, r.text
        assert "temporarily unavailable" in r.json().get("detail", "").lower()

    def test_refresh_returns_quote(self, member_token):
        q = requests.get(f"{BASE_URL}/api/quotes", headers=_mh(member_token), timeout=30).json()
        if not q:
            pytest.skip("no quote")
        qid = q[0]["id"]
        r = requests.post(f"{BASE_URL}/api/payments/refresh/{qid}", headers=_mh(member_token), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == qid

    def test_refresh_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/payments/refresh/x", timeout=30)
        assert r.status_code == 401
