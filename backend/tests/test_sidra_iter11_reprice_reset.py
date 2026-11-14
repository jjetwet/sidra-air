"""Iteration-11: admin details edit resets Confirmed (unpaid) trips when route/jet/trip_type change."""
import os
from datetime import date, timedelta

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL, ADMIN_PASS = "joshua@flysidra.com", "Sidra3535fb!Jet"
MEMBER_EMAIL, MEMBER_PASS = "member.test@sidra.example", "SidraTest2026"

D1 = (date.today() + timedelta(days=40)).isoformat()
D1b = (date.today() + timedelta(days=42)).isoformat()
D2 = (date.today() + timedelta(days=45)).isoformat()
EXP = (date.today() + timedelta(days=2000)).isoformat()
CREATED: list[str] = []


def _db():
    env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
    return MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def member():
    return _login(MEMBER_EMAIL, MEMBER_PASS)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    try:
        _db().quotes.delete_many({"_id": {"$in": [ObjectId(i) for i in CREATED]}})
    except Exception as e:  # pragma: no cover
        print("cleanup failed", e)


BASE = {"from_code": "DXB", "to_code": "LTN", "jet_id": "challenger-650", "trip_type": "one_way",
        "depart_date": D1, "return_date": None, "depart_window": "Morning", "pax": 4}


def _confirmed(member, admin, price=55500):
    body = {**{k: v for k, v in BASE.items() if k != "return_date"}, "name": "TEST_Reprice", "email": MEMBER_EMAIL,
            "notes": "TEST_ iter11",
            "lead_passenger": {"full_name": "TEST_Lead Iter11", "nationality": "British", "date_of_birth": "1980-05-05",
                               "passport_number": "TEST1101", "passport_expiry": EXP}}
    r = requests.post(f"{API}/quotes", json=body, headers=_h(member), timeout=30)
    assert r.status_code in (200, 201), r.text
    qid = r.json()["id"]
    CREATED.append(qid)
    r = requests.post(f"{API}/admin/quotes/{qid}", json={"status": "Confirmed", "final_price_usd": price, "team_message": "TEST_"},
                      headers=_h(admin), timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "Confirmed" and r.json()["final_price_usd"] == price, r.text
    return qid


def _edit(admin, qid, **kw):
    return requests.post(f"{API}/admin/quotes/{qid}/details", json={**BASE, **kw}, headers=_h(admin), timeout=20)


# Route / jet / trip type changes on Confirmed unpaid -> Requested + price cleared
class TestResetOnPriceChange:
    @pytest.mark.parametrize("kw", [
        {"to_code": "LBG"},
        {"from_code": "LTN", "to_code": "DXB"},
        {"jet_id": "g650er"},
        {"trip_type": "return", "return_date": D2},
    ])
    def test_reset(self, admin, member, kw):
        qid = _confirmed(member, admin)
        r = _edit(admin, qid, **kw)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Requested" and d["final_price_usd"] is None, d
        g = requests.get(f"{API}/quotes/{qid}", headers=_h(member), timeout=15).json()
        assert g["status"] == "Requested" and g["final_price_usd"] is None
        # member cannot pay a stale price, admin cannot mark paid
        mp = requests.post(f"{API}/admin/quotes/{qid}/mark-paid", json={"method": "Bank transfer"}, headers=_h(admin), timeout=20)
        assert mp.status_code == 400


# Dates / window / pax only -> keeps Confirmed + price
class TestKeepOnNonPriceChange:
    def test_keep(self, admin, member):
        qid = _confirmed(member, admin, 61000)
        r = _edit(admin, qid, depart_date=D1b, depart_window="Evening", pax=6)
        assert r.status_code == 200, r.text
        d = r.json()
        assert (d["status"], d["final_price_usd"], d["depart_date"], d["depart_window"], d["pax"]) == \
               ("Confirmed", 61000, D1b, "Evening", 6)

    def test_identical_resubmit_keeps(self, admin, member):
        qid = _confirmed(member, admin, 62000)
        r = _edit(admin, qid)
        assert r.status_code == 200 and r.json()["status"] == "Confirmed" and r.json()["final_price_usd"] == 62000


# Paid trips keep paid status + price even if route changes
class TestPaidKeeps:
    def test_paid(self, admin, member):
        qid = _confirmed(member, admin, 63000)
        mp = requests.post(f"{API}/admin/quotes/{qid}/mark-paid", json={"method": "Bank transfer", "reference": "TEST_R11"},
                           headers=_h(admin), timeout=30)
        assert mp.status_code == 200, mp.text
        r = _edit(admin, qid, to_code="LBG", jet_id="g650er")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Confirmed" and d["final_price_usd"] == 63000 and d["payment_status"] == "paid"
        assert d["to_code"] == "LBG"


# depart_date change clears manifest_reminder_sent_at
class TestReminderReset:
    def test_reminder(self, admin, member):
        qid = _confirmed(member, admin)
        db = _db()
        db.quotes.update_one({"_id": ObjectId(qid)}, {"$set": {"manifest_reminder_sent_at": "2026-01-01T00:00:00+00:00"}})
        # same date -> untouched
        assert _edit(admin, qid, pax=5).status_code == 200
        assert db.quotes.find_one({"_id": ObjectId(qid)})["manifest_reminder_sent_at"] == "2026-01-01T00:00:00+00:00"
        # date moved -> cleared
        assert _edit(admin, qid, depart_date=D1b).status_code == 200
        assert db.quotes.find_one({"_id": ObjectId(qid)})["manifest_reminder_sent_at"] is None
