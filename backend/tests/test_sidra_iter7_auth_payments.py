"""SIDRA iter-7: JWT auth, invite code, payments gating, admin RBAC."""
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
INVITE = "2893159"
MEMBER = ("member.test@sidra.example", "SidraTest2026")
TEAM = ("team.test@sidra.example", "SidraTest2026")


@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(s, email, password):
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    assert tok and isinstance(tok, str)
    return tok, r.json()["user"]


# --- auth/verify-code ---
class TestInviteCode:
    def test_correct_code(self, s):
        r = s.post(f"{BASE}/api/auth/verify-code", json={"invite_code": INVITE}, timeout=15)
        assert r.status_code == 200 and r.json().get("ok") is True

    def test_wrong_code(self, s):
        r = s.post(f"{BASE}/api/auth/verify-code", json={"invite_code": "0000000"}, timeout=15)
        assert r.status_code == 400
        assert "not recognised" in r.json()["detail"].lower()

    def test_empty_code(self, s):
        r = s.post(f"{BASE}/api/auth/verify-code", json={"invite_code": ""}, timeout=15)
        assert r.status_code == 422  # min_length validation


# --- login + me ---
class TestLogin:
    def test_login_member_ok(self, s):
        tok, u = _login(s, *MEMBER)
        assert u["email"] == MEMBER[0] and u["is_admin"] is False
        me = s.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert me.status_code == 200
        assert me.json()["user_id"] == u["user_id"]

    def test_login_team_admin(self, s):
        tok, u = _login(s, *TEAM)
        assert u["is_admin"] is True
        me = s.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert me.status_code == 200 and me.json()["is_admin"] is True

    def test_login_wrong_password(self, s):
        r = s.post(f"{BASE}/api/auth/login", json={"email": MEMBER[0], "password": "wrong-password-xxxx"}, timeout=15)
        assert r.status_code == 401
        assert "incorrect" in r.json()["detail"].lower()

    def test_login_unknown_email(self, s):
        r = s.post(f"{BASE}/api/auth/login", json={"email": "nope-xxx@sidra.example", "password": "whatever12"}, timeout=15)
        assert r.status_code == 401


# --- protected endpoints ---
class TestProtected:
    def test_me_no_token(self, s):
        r = s.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_garbage_token(self, s):
        r = s.get(f"{BASE}/api/auth/me", headers={"Authorization": "Bearer garbage.not.a.jwt"}, timeout=15)
        assert r.status_code == 401

    def test_quotes_requires_auth(self, s):
        r = s.get(f"{BASE}/api/quotes", timeout=15)
        assert r.status_code == 401


# --- admin RBAC ---
class TestAdminRBAC:
    def test_member_forbidden(self, s):
        tok, _ = _login(s, *MEMBER)
        r = s.get(f"{BASE}/api/admin/quotes", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 403

    def test_team_allowed(self, s):
        tok, _ = _login(s, *TEAM)
        r = s.get(f"{BASE}/api/admin/quotes", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_team_stats(self, s):
        tok, _ = _login(s, *TEAM)
        r = s.get(f"{BASE}/api/admin/stats", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ["Requested", "Confirmed", "Unavailable", "Cancelled"]:
            assert k in data


# --- registration ---
class TestRegister:
    def test_register_with_wrong_code_rejected(self, s):
        email = f"qa+{uuid.uuid4().hex[:8]}@sidra.example"
        r = s.post(f"{BASE}/api/auth/register",
                   json={"invite_code": "9999999", "name": "QA", "email": email, "password": "Password123"},
                   timeout=20)
        assert r.status_code == 400

    def test_register_short_password_rejected(self, s):
        email = f"qa+{uuid.uuid4().hex[:8]}@sidra.example"
        r = s.post(f"{BASE}/api/auth/register",
                   json={"invite_code": INVITE, "name": "QA", "email": email, "password": "short1"},
                   timeout=20)
        assert r.status_code == 422

    def test_register_and_duplicate_and_login(self, s):
        email = f"qa+{uuid.uuid4().hex[:8]}@sidra.example"
        pw = "Password123"
        r = s.post(f"{BASE}/api/auth/register",
                   json={"invite_code": INVITE, "name": "TEST_QA", "email": email, "password": pw}, timeout=20)
        assert r.status_code == 201, r.text
        data = r.json()
        assert "access_token" in data and data["user"]["email"] == email
        assert data["user"]["is_admin"] is False
        # duplicate
        r2 = s.post(f"{BASE}/api/auth/register",
                    json={"invite_code": INVITE, "name": "TEST_QA", "email": email, "password": pw}, timeout=20)
        assert r2.status_code == 409
        # login works
        tok, _ = _login(s, email, pw)
        me = s.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert me.status_code == 200


# --- payments gating ---
class TestPayments:
    def test_checkout_unknown_quote_404(self, s):
        tok, _ = _login(s, *MEMBER)
        # valid-looking ObjectId but not present
        r = s.post(f"{BASE}/api/payments/checkout",
                   headers={"Authorization": f"Bearer {tok}"},
                   json={"quote_id": "0123456789abcdef01234567"}, timeout=15)
        assert r.status_code == 404

    def test_checkout_invalid_id_404(self, s):
        tok, _ = _login(s, *MEMBER)
        r = s.post(f"{BASE}/api/payments/checkout",
                   headers={"Authorization": f"Bearer {tok}"},
                   json={"quote_id": "not-an-oid"}, timeout=15)
        assert r.status_code == 404

    def test_checkout_requires_auth(self, s):
        r = s.post(f"{BASE}/api/payments/checkout",
                   json={"quote_id": "0123456789abcdef01234567"}, timeout=15)
        assert r.status_code == 401

    def test_checkout_on_confirmed_quote_errors_appropriately(self, s):
        """Find a Confirmed quote for the member and attempt checkout.
        With current STRIPE_API_KEY being a publishable key, backend returns 502.
        With no key, returns 503. If no Confirmed quote yet, returns 409 (not found scenario covered above).
        """
        tok, _ = _login(s, *MEMBER)
        qs = s.get(f"{BASE}/api/quotes", headers={"Authorization": f"Bearer {tok}"}, timeout=15).json()
        confirmed = [q for q in qs if q.get("status") == "Confirmed" and q.get("final_price_usd")]
        if not confirmed:
            pytest.skip("No Confirmed quote exists for member; skipping Stripe error path")
        qid = confirmed[0]["id"]
        r = s.post(f"{BASE}/api/payments/checkout",
                   headers={"Authorization": f"Bearer {tok}"},
                   json={"quote_id": qid}, timeout=20)
        assert r.status_code in (502, 503), f"expected 502/503 for stripe-not-ready, got {r.status_code}: {r.text}"

    def test_refresh_payment_returns_quote_or_404(self, s):
        tok, _ = _login(s, *MEMBER)
        qs = s.get(f"{BASE}/api/quotes", headers={"Authorization": f"Bearer {tok}"}, timeout=15).json()
        if not qs:
            pytest.skip("No quotes for member")
        qid = qs[0]["id"]
        r = s.post(f"{BASE}/api/payments/refresh/{qid}", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == qid


# --- cross-user isolation for payments/quotes ---
class TestIsolation:
    def test_member_cannot_see_other_quote(self, s):
        # fetch any admin-visible quote not belonging to member; attempt member GET -> 404
        tok_m, mu = _login(s, *MEMBER)
        tok_t, _ = _login(s, *TEAM)
        allq = s.get(f"{BASE}/api/admin/quotes", headers={"Authorization": f"Bearer {tok_t}"}, timeout=15).json()
        other = next((q for q in allq if q.get("user_id") and q["user_id"] != mu["user_id"]), None)
        if not other:
            pytest.skip("No cross-user quote available")
        r = s.get(f"{BASE}/api/quotes/{other['id']}", headers={"Authorization": f"Bearer {tok_m}"}, timeout=15)
        assert r.status_code == 404
        # payment attempt also 404
        r2 = s.post(f"{BASE}/api/payments/checkout",
                    headers={"Authorization": f"Bearer {tok_m}"},
                    json={"quote_id": other["id"]}, timeout=15)
        assert r2.status_code == 404
