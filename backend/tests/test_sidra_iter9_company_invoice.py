"""Iteration-9: company accounts, charter invoices, admin paid-guard, change-password."""
import os
import random
import string

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MEMBER_EMAIL = "member.test@sidra.example"
MEMBER_PASS = "SidraTest2026"
NEW_PASS = "SidraTest2026NEW!"
TEAM_EMAIL = "team.test@sidra.example"
TEAM_PASS = "SidraTest2026"
INVITE_CODE = "2893159"
PAID_QUOTE = "6af84fb4ce36ea84dee70ff6"


def _rand(n=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


def _auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ----------------------------- fixtures
@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER_EMAIL, MEMBER_PASS)


@pytest.fixture(scope="module")
def team_token():
    return _login(TEAM_EMAIL, TEAM_PASS)


# ============================================================ Company accounts
class TestCompany:
    def test_get_company_member_is_owner_of_meridian(self, member_token):
        r = requests.get(f"{API}/company", headers=_auth(member_token), timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c is not None, "member.test should already own a company"
        assert c["name"] == "Meridian Capital"
        assert c["owner_user_id"] == "user_testmember1"
        assert isinstance(c["members"], list) and len(c["members"]) >= 1
        assert isinstance(c["pending_invites"], list)

    def test_create_company_conflicts_when_already_member(self, member_token):
        r = requests.post(
            f"{API}/company",
            headers=_auth(member_token),
            json={"name": "TEST_dup", "billing_address": "", "vat_number": ""},
            timeout=15,
        )
        assert r.status_code == 409, r.text

    def test_patch_company_owner_ok_booker_forbidden(self, member_token):
        # owner can patch (keep current values)
        g = requests.get(f"{API}/company", headers=_auth(member_token), timeout=15).json()
        r = requests.patch(
            f"{API}/company",
            headers=_auth(member_token),
            json={"name": g["name"], "billing_address": g["billing_address"], "vat_number": g["vat_number"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Booker 403 is tested in TestInviteExisting

    def test_invite_existing_user_registers_fresh_booker(self, member_token):
        """Register fresh qa.booker+<rand>@sidra.example, invite -> joins, sees owner's quotes."""
        booker_email = f"qa.booker+{_rand()}@sidra.example"
        booker_pass = "TEST_Booker2026!"

        reg = requests.post(
            f"{API}/auth/register",
            json={"invite_code": INVITE_CODE, "name": "TEST QA Booker", "email": booker_email, "password": booker_pass},
            timeout=20,
        )
        assert reg.status_code == 201, reg.text
        booker_tok = reg.json()["access_token"]

        # Before invite: booker has no company
        b_before = requests.get(f"{API}/company", headers=_auth(booker_tok), timeout=15)
        assert b_before.status_code == 200
        assert b_before.json() is None

        # Owner invites -> existing user joins directly as booker
        inv = requests.post(
            f"{API}/company/invite",
            headers=_auth(member_token),
            json={"email": booker_email},
            timeout=15,
        )
        assert inv.status_code == 200, inv.text
        company = inv.json()
        member_ids = [m["user_id"] for m in company["members"]]
        booker_entry = next(m for m in company["members"] if m["email"] == booker_email)
        assert booker_entry["company_role"] == "booker"

        # Booker's /api/company now returns Meridian Capital
        b_after = requests.get(f"{API}/company", headers=_auth(booker_tok), timeout=15)
        assert b_after.status_code == 200
        assert b_after.json()["name"] == "Meridian Capital"

        # Booker PATCH /company -> 403
        pf = requests.patch(
            f"{API}/company",
            headers=_auth(booker_tok),
            json={"name": "TEST_hack", "billing_address": "", "vat_number": ""},
            timeout=15,
        )
        assert pf.status_code == 403, pf.text

        # Booker sees owner's company quotes
        q_list = requests.get(f"{API}/quotes", headers=_auth(booker_tok), timeout=15)
        assert q_list.status_code == 200
        quote_ids = [q["id"] for q in q_list.json()]
        assert PAID_QUOTE in quote_ids, "booker should see owner's company quote"

        # Booker GET individual quote
        q_one = requests.get(f"{API}/quotes/{PAID_QUOTE}", headers=_auth(booker_tok), timeout=15)
        assert q_one.status_code == 200, q_one.text

        # Owner removes booker
        booker_user_id = booker_entry["user_id"]
        rm = requests.delete(
            f"{API}/company/members/{booker_user_id}",
            headers=_auth(member_token),
            timeout=15,
        )
        assert rm.status_code == 200, rm.text
        assert all(m["user_id"] != booker_user_id for m in rm.json()["members"])

        # Booker can no longer see owner's quotes
        q_after = requests.get(f"{API}/quotes", headers=_auth(booker_tok), timeout=15)
        assert q_after.status_code == 200
        assert PAID_QUOTE not in [q["id"] for q in q_after.json()]

    def test_invite_unknown_email_pending_then_autojoin_on_register(self, member_token):
        unknown_email = f"qa.unknown+{_rand()}@sidra.example"
        inv = requests.post(
            f"{API}/company/invite",
            headers=_auth(member_token),
            json={"email": unknown_email},
            timeout=15,
        )
        assert inv.status_code == 200, inv.text
        assert unknown_email.lower() in [e.lower() for e in inv.json()["pending_invites"]]

        # Now register with that email -> auto-joined
        reg = requests.post(
            f"{API}/auth/register",
            json={"invite_code": INVITE_CODE, "name": "TEST Unknown", "email": unknown_email, "password": "TEST_Unknown2026!"},
            timeout=20,
        )
        assert reg.status_code == 201, reg.text
        tok = reg.json()["access_token"]
        c = requests.get(f"{API}/company", headers=_auth(tok), timeout=15).json()
        assert c is not None and c["name"] == "Meridian Capital"

        # Cleanup: remove the test booker (pending_invite already consumed)
        new_user_id = reg.json()["user"]["user_id"] if "user" in reg.json() else None
        if not new_user_id:
            # fallback: look it up in members
            co = requests.get(f"{API}/company", headers=_auth(member_token), timeout=15).json()
            match = next((m for m in co["members"] if m["email"].lower() == unknown_email.lower()), None)
            if match:
                new_user_id = match["user_id"]
        if new_user_id:
            requests.delete(f"{API}/company/members/{new_user_id}", headers=_auth(member_token), timeout=15)

    def test_cancel_pending_invite(self, member_token):
        pending_email = f"qa.cancel+{_rand()}@sidra.example"
        requests.post(
            f"{API}/company/invite",
            headers=_auth(member_token),
            json={"email": pending_email},
            timeout=15,
        )
        r = requests.delete(
            f"{API}/company/invites/{pending_email}",
            headers=_auth(member_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert pending_email.lower() not in [e.lower() for e in r.json()["pending_invites"]]


# ============================================================ Invoices
class TestInvoice:
    def test_invoice_link_for_paid_quote(self, member_token):
        r = requests.post(
            f"{API}/quotes/{PAID_QUOTE}/invoice-link",
            headers=_auth(member_token),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert "/api/invoices/" in url and f"{PAID_QUOTE}.pdf" in url and "t=" in url

        # Fetch the signed PDF
        pdf = requests.get(url, timeout=30)
        assert pdf.status_code == 200, pdf.text[:300]
        assert pdf.headers.get("content-type", "").startswith("application/pdf")
        assert pdf.content[:4] == b"%PDF"

        # Tampered token -> 403
        if "t=" in url:
            base, tok = url.split("t=", 1)
            bad_tok = tok[:-4] + "zzzz"
            bad = requests.get(base + "t=" + bad_tok, timeout=15)
            assert bad.status_code == 403, bad.text

    def test_invoice_link_unpaid_quote_404(self, member_token):
        # pick any quote that is not paid
        qs = requests.get(f"{API}/quotes", headers=_auth(member_token), timeout=15).json()
        unpaid = next((q for q in qs if q.get("payment_status") != "paid" and q["id"] != PAID_QUOTE), None)
        if not unpaid:
            pytest.skip("no unpaid quote available on member")
        r = requests.post(
            f"{API}/quotes/{unpaid['id']}/invoice-link",
            headers=_auth(member_token),
            timeout=15,
        )
        assert r.status_code == 404, r.text


# ============================================================ Admin paid guard
class TestAdminPaidGuard:
    def test_admin_cannot_edit_paid_quote(self, team_token):
        r = requests.post(
            f"{API}/admin/quotes/{PAID_QUOTE}",
            headers=_auth(team_token),
            json={"status": "Confirmed", "team_message": "TEST_edit_attempt", "final_price_usd": 99999},
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "paid" in r.text.lower()


# ============================================================ Change password
class TestChangePassword:
    def test_wrong_current_rejected(self):
        tok = _login(MEMBER_EMAIL, MEMBER_PASS)
        r = requests.post(
            f"{API}/auth/change-password",
            headers=_auth(tok),
            json={"current_password": "wrong_password_XX", "new_password": "doesnt_matter_12345"},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_change_password_and_relogin_then_reset(self):
        tok = _login(MEMBER_EMAIL, MEMBER_PASS)
        try:
            r = requests.post(
                f"{API}/auth/change-password",
                headers=_auth(tok),
                json={"current_password": MEMBER_PASS, "new_password": NEW_PASS},
                timeout=15,
            )
            assert r.status_code == 200, r.text
            # Login with new password works
            new_tok = _login(MEMBER_EMAIL, NEW_PASS)
            assert new_tok
            # Old password must now fail
            old = requests.post(f"{API}/auth/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PASS}, timeout=15)
            assert old.status_code == 401
        finally:
            # ALWAYS reset back to SidraTest2026
            try:
                reset_tok = _login(MEMBER_EMAIL, NEW_PASS)
                rr = requests.post(
                    f"{API}/auth/change-password",
                    headers=_auth(reset_tok),
                    json={"current_password": NEW_PASS, "new_password": MEMBER_PASS},
                    timeout=15,
                )
                assert rr.status_code == 200, f"CRITICAL: failed to reset member password: {rr.text}"
            except Exception as e:
                pytest.fail(f"CRITICAL: could not reset member password: {e}")
            # Confirm original password works again
            final = _login(MEMBER_EMAIL, MEMBER_PASS)
            assert final
