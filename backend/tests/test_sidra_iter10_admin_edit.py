"""Iteration-10: admin trip editing (details, manifest) + offline mark-paid."""
import io
import os
from datetime import date, timedelta

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL, ADMIN_PASS = "joshua@flysidra.com", "Sidra3535fb!Jet"
TEAM_EMAIL, TEAM_PASS = "team.test@sidra.example", "SidraTest2026"
MEMBER_EMAIL, MEMBER_PASS = "member.test@sidra.example", "SidraTest2026"

D1 = (date.today() + timedelta(days=40)).isoformat()
D2 = (date.today() + timedelta(days=45)).isoformat()
EXP = (date.today() + timedelta(days=2000)).isoformat()

CREATED_QUOTES: list[str] = []
OUR_PASSPORTS = {"TEST1001", "TEST1002", "TEST1003", "TEST2001", "TEST2002"} | {f"TESTX{i:03d}" for i in range(7)}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _guest(name, pp):
    return {"full_name": name, "nationality": "British", "date_of_birth": "1980-05-05",
            "passport_number": pp, "passport_expiry": EXP}


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def team():
    return _login(TEAM_EMAIL, TEAM_PASS)["access_token"]


@pytest.fixture(scope="module")
def member():
    return _login(MEMBER_EMAIL, MEMBER_PASS)["access_token"]


def _create_quote(member):
    body = {"from_code": "DXB", "to_code": "LTN", "jet_id": "challenger-650", "trip_type": "one_way",
            "depart_date": D1, "depart_window": "Morning", "pax": 4, "name": "TEST_Admin Edit",
            "email": MEMBER_EMAIL, "notes": "TEST_ iter10", "lead_passenger": _guest("TEST_Lead One", "TEST1001")}
    r = requests.post(f"{API}/quotes", json=body, headers=_h(member), timeout=30)
    assert r.status_code in (200, 201), r.text
    CREATED_QUOTES.append(r.json()["id"])
    return r.json()


@pytest.fixture(scope="module", autouse=True)
def cleanup(member):
    yield
    # delete only quotes we created (by id) + TEST travellers saved to member
    try:
        env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
        cli = MongoClient(env["MONGO_URL"].strip('"'))
        db = cli[env["DB_NAME"].strip('"')]
        db.quotes.delete_many({"_id": {"$in": [ObjectId(i) for i in CREATED_QUOTES]}})
    except Exception as e:  # pragma: no cover
        print("cleanup failed", e)
    tr = requests.get(f"{API}/travellers", headers=_h(member), timeout=15).json()
    for t in tr:
        if t["passport_number"] in OUR_PASSPORTS:
            requests.delete(f"{API}/travellers/{t['id']}", headers=_h(member), timeout=15)


@pytest.fixture(scope="module")
def quote(member):
    return _create_quote(member)


# --- admin identity
class TestAdminAccess:
    def test_joshua_is_admin(self, admin):
        assert admin["user"]["is_admin"] is True
        r = requests.get(f"{API}/auth/me", headers=_h(admin["access_token"]), timeout=15)
        assert r.json()["is_admin"] is True

    def test_member_forbidden(self, member, quote):
        qid = quote["id"]
        for m, p, b in [("post", f"/admin/quotes/{qid}/details", {}), ("put", f"/admin/quotes/{qid}/guests", {"guests": []}),
                        ("post", f"/admin/quotes/{qid}/mark-paid", {"method": "Cash"})]:
            r = getattr(requests, m)(f"{API}{p}", json=b, headers=_h(member), timeout=15)
            assert r.status_code == 403, (p, r.status_code, r.text)


# --- details edit
class TestDetails:
    def _body(self, **kw):
        b = {"from_code": "DXB", "to_code": "LBG", "jet_id": "g650er", "trip_type": "return",
             "depart_date": D1, "return_date": D2, "depart_window": "Evening", "pax": 6}
        b.update(kw)
        return b

    def test_edit_details_recalculates(self, admin, quote):
        tok = admin["access_token"]
        est = requests.post(f"{API}/quotes/estimate", json={"from_code": "DXB", "to_code": "LBG", "jet_id": "g650er", "trip_type": "return"}, timeout=15).json()
        r = requests.post(f"{API}/admin/quotes/{quote['id']}/details", json=self._body(), headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert (d["to_code"], d["jet_id"], d["jet_name"], d["trip_type"], d["return_date"], d["depart_window"], d["pax"]) == \
               ("LBG", "g650er", "Gulfstream G650ER", "return", D2, "Evening", 6)
        assert d["estimated_price_usd"] == est["estimated_price_usd"]
        assert d["distance_nm"] == est["distance_nm"]
        g = requests.get(f"{API}/admin/quotes/{quote['id']}", headers=_h(tok), timeout=15).json()
        assert g["to_code"] == "LBG" and g["pax"] == 6

    def test_one_way_clears_return(self, admin, quote):
        r = requests.post(f"{API}/admin/quotes/{quote['id']}/details", json=self._body(trip_type="one_way", return_date=D2), headers=_h(admin["access_token"]), timeout=15)
        assert r.status_code == 200 and r.json()["return_date"] is None

    @pytest.mark.parametrize("kw,frag", [
        ({"jet_id": "challenger-650", "pax": 14}, "seats up to 12"),
        ({"return_date": (date.today() + timedelta(days=30)).isoformat()}, "on or after"),
        ({"return_date": None}, "Return date required"),
        ({"to_code": "DXB"}, "must differ"),
        ({"jet_id": "nope"}, "Unknown aircraft"),
    ])
    def test_validation(self, admin, quote, kw, frag):
        r = requests.post(f"{API}/admin/quotes/{quote['id']}/details", json=self._body(**kw), headers=_h(admin["access_token"]), timeout=15)
        assert r.status_code == 400 and frag in r.json()["detail"], r.text

    def test_pax_below_manifest(self, admin, quote):
        tok = admin["access_token"]
        g = [_guest("TEST_Lead One", "TEST1001"), _guest("TEST_Guest Two", "TEST1002")]
        assert requests.put(f"{API}/admin/quotes/{quote['id']}/guests", json={"guests": g}, headers=_h(tok), timeout=15).status_code == 200
        r = requests.post(f"{API}/admin/quotes/{quote['id']}/details", json=self._body(pax=1), headers=_h(tok), timeout=15)
        assert r.status_code == 400 and "already lists 2" in r.json()["detail"]

    def test_bad_date_422(self, admin, quote):
        r = requests.post(f"{API}/admin/quotes/{quote['id']}/details", json=self._body(depart_date="2026/1/1"), headers=_h(admin["access_token"]), timeout=15)
        assert r.status_code == 422


# --- admin manifest
class TestManifest:
    def test_admin_save_guests_visible_to_member(self, admin, member, quote):
        g = [_guest("TEST_Lead One", "test1001"), _guest("TEST_Guest Two", "TEST1002"), _guest("TEST_Guest Three", "TEST1003")]
        r = requests.put(f"{API}/admin/quotes/{quote['id']}/guests", json={"guests": g}, headers=_h(admin["access_token"]), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["guests"][0]["passport_number"] == "TEST1001"
        m = requests.get(f"{API}/quotes/{quote['id']}", headers=_h(member), timeout=15).json()
        assert [x["full_name"] for x in m["guests"]] == ["TEST_Lead One", "TEST_Guest Two", "TEST_Guest Three"]

    def test_guests_validation(self, admin, quote):
        tok = admin["access_token"]
        too_many = [_guest(f"TEST_G{i}", f"TESTX{i:03d}") for i in range(7)]
        r = requests.put(f"{API}/admin/quotes/{quote['id']}/guests", json={"guests": too_many}, headers=_h(tok), timeout=15)
        assert r.status_code == 400 and "guests" in r.json()["detail"]
        bad = _guest("TEST_Exp", "TEST2001"); bad["passport_expiry"] = D1
        r = requests.put(f"{API}/admin/quotes/{quote['id']}/guests", json={"guests": [bad]}, headers=_h(tok), timeout=15)
        assert r.status_code == 400 and "expires" in r.json()["detail"]
        bad = _guest("TEST_Dob", "TEST2002"); bad["date_of_birth"] = (date.today() + timedelta(days=1)).isoformat()
        r = requests.put(f"{API}/admin/quotes/{quote['id']}/guests", json={"guests": [bad]}, headers=_h(tok), timeout=15)
        assert r.status_code == 400 and "past" in r.json()["detail"]


# --- mark paid
class TestMarkPaid:
    def test_requires_confirmed(self, admin, quote):
        tok = admin["access_token"]
        r = requests.post(f"{API}/admin/quotes/{quote['id']}", json={"status": "Requested"}, headers=_h(tok), timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "Requested"
        r = requests.post(f"{API}/admin/quotes/{quote['id']}/mark-paid", json={"method": "Bank transfer"}, headers=_h(tok), timeout=30)
        assert r.status_code == 400 and "final price" in r.json()["detail"]

    def test_invalid_method_422(self, admin, quote):
        r = requests.post(f"{API}/admin/quotes/{quote['id']}/mark-paid", json={"method": "Crypto"}, headers=_h(admin["access_token"]), timeout=15)
        assert r.status_code == 422

    def test_confirm_price_then_mark_paid(self, admin, member, quote):
        tok = admin["access_token"]
        r = requests.post(f"{API}/admin/quotes/{quote['id']}", json={"status": "Confirmed", "final_price_usd": 77700, "team_message": "TEST_ ok"}, headers=_h(tok), timeout=30)
        assert r.status_code == 200 and r.json()["final_price_usd"] == 77700 and r.json()["status"] == "Confirmed"
        r = requests.post(f"{API}/admin/quotes/{quote['id']}/mark-paid", json={"method": "Bank transfer", "reference": " TEST_REF1 "}, headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["payment_status"] == "paid" and d["payment_method"] == "Bank transfer" and d["payment_reference"] == "TEST_REF1"
        assert d["invoice_number"] == f"SID-{date.today().year}-{quote['id'][-6:].upper()}"
        assert d["paid_at"]
        print("email_status:", d.get("email_status"))
        r2 = requests.post(f"{API}/admin/quotes/{quote['id']}/mark-paid", json={"method": "Cash"}, headers=_h(tok), timeout=30)
        assert r2.status_code == 409
        # member view + invoice
        m = requests.get(f"{API}/quotes/{quote['id']}", headers=_h(member), timeout=15).json()
        assert m["payment_status"] == "paid"
        link = requests.post(f"{API}/quotes/{quote['id']}/invoice-link", headers=_h(member), timeout=15)
        assert link.status_code == 200, link.text
        pdf = requests.get(link.json()["url"], timeout=30)
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
        from pypdf import PdfReader
        text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf.content)).pages)
        assert "Amount paid by bank transfer" in text, text[:800]
        assert "77,700" in text

    def test_paid_price_locked_details_still_editable(self, admin, quote):
        tok = admin["access_token"]
        r = requests.post(f"{API}/admin/quotes/{quote['id']}", json={"status": "Confirmed", "final_price_usd": 1000}, headers=_h(tok), timeout=15)
        assert r.status_code == 400
        r = requests.post(f"{API}/admin/quotes/{quote['id']}/details", json={"from_code": "DXB", "to_code": "LBG", "jet_id": "g650er", "trip_type": "one_way", "depart_date": D2, "depart_window": "Afternoon", "pax": 5}, headers=_h(tok), timeout=15)
        assert r.status_code == 200 and r.json()["final_price_usd"] == 77700 and r.json()["payment_status"] == "paid"

    def test_team_test_admin_can_also_edit(self, team, quote):
        r = requests.get(f"{API}/admin/quotes/{quote['id']}", headers=_h(team), timeout=15)
        assert r.status_code == 200


# --- cancelled trips are locked
class TestCancelled:
    def test_cancelled_blocks_all(self, admin, member):
        q = _create_quote(member)
        assert requests.post(f"{API}/quotes/{q['id']}/cancel", headers=_h(member), timeout=15).status_code == 200
        tok = admin["access_token"]
        b = {"from_code": "DXB", "to_code": "LBG", "jet_id": "g650er", "trip_type": "one_way", "depart_date": D1, "pax": 2}
        assert requests.post(f"{API}/admin/quotes/{q['id']}/details", json=b, headers=_h(tok), timeout=15).status_code == 400
        assert requests.put(f"{API}/admin/quotes/{q['id']}/guests", json={"guests": []}, headers=_h(tok), timeout=15).status_code == 400
        assert requests.post(f"{API}/admin/quotes/{q['id']}/mark-paid", json={"method": "Cash"}, headers=_h(tok), timeout=15).status_code == 400

    def test_not_found(self, admin):
        r = requests.post(f"{API}/admin/quotes/aaaaaaaaaaaaaaaaaaaaaaaa/mark-paid", json={"method": "Cash"}, headers=_h(admin["access_token"]), timeout=15)
        assert r.status_code == 404
