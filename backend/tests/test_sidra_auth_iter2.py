"""SIDRA iter-2 backend tests: auth, airports (145), admin dashboard, concierge."""
import json
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MEMBER_TOKEN = "test_session_member"
ADMIN_TOKEN = "test_session_team"


def hdrs(token: str | None = None) -> dict:
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---------- Auth
class TestAuth:
    def test_me_requires_bearer(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_member(self, s):
        r = s.get(f"{API}/auth/me", headers=hdrs(MEMBER_TOKEN))
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["user_id"] == "user_testmember1"
        assert u["email"] == "member.test@sidra.example"
        assert u["is_admin"] is False

    def test_me_admin(self, s):
        r = s.get(f"{API}/auth/me", headers=hdrs(ADMIN_TOKEN))
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["user_id"] == "user_testteam01"
        assert u["is_admin"] is True

    def test_me_invalid_token(self, s):
        r = s.get(f"{API}/auth/me", headers=hdrs("not_a_real_token_xyz"))
        assert r.status_code == 401

    def test_session_bogus_session_id(self, s):
        r = s.post(f"{API}/auth/session", json={"session_id": "TEST_bogus_session_zzz"}, headers=hdrs())
        assert r.status_code == 401

    def test_claim_device_requires_auth(self, s):
        r = s.post(f"{API}/me/claim", json={"device_id": "TEST_devclaim01"}, headers=hdrs())
        assert r.status_code == 401

    def test_claim_device_ok(self, s):
        r = s.post(f"{API}/me/claim", json={"device_id": "TEST_devclaim01"}, headers=hdrs(MEMBER_TOKEN))
        assert r.status_code == 200
        body = r.json()
        assert "quotes" in body and "messages" in body
        assert isinstance(body["quotes"], int)


# ---------- Airports
class TestAirports:
    def test_airports_145_and_new_codes(self, s):
        r = s.get(f"{API}/airports")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 145, f"expected 145 airports, got {len(data)}"
        codes = {a["code"] for a in data}
        for c in ["LAS", "LPL", "MAN", "LIN", "DXB", "FAB", "TEB"]:
            assert c in codes, f"missing {c}"

    def test_estimate_las_lpl(self, s):
        r = s.post(f"{API}/quotes/estimate", json={"from_code": "LAS", "to_code": "LPL", "jet_id": "global-7500", "trip_type": "one_way"})
        assert r.status_code == 200, r.text
        d = r.json()
        # LAS -> LPL is ~4500 nm great-circle
        assert 3800 < d["distance_nm"] < 5200
        assert d["estimated_price_usd"] > 0


# ---------- Quotes auth-gated
class TestQuotesAuth:
    def test_list_quotes_requires_auth(self, s):
        r = s.get(f"{API}/quotes")
        assert r.status_code == 401

    def test_create_quote_requires_auth(self, s):
        r = s.post(f"{API}/quotes", json={
            "from_code": "DXB", "to_code": "LPL", "jet_id": "global-7500",
            "trip_type": "one_way", "depart_date": "2026-02-10", "depart_window": "Morning",
            "pax": 4, "name": "TEST_User", "email": "t@example.com", "notes": "TEST",
        })
        assert r.status_code == 401

    def test_concierge_history_requires_auth(self, s):
        r = s.get(f"{API}/concierge/history")
        assert r.status_code == 401

    def test_concierge_stream_requires_auth(self, s):
        r = s.post(f"{API}/concierge/stream", json={"message": "hi"})
        assert r.status_code == 401


# ---------- Full admin flow
_created = {"id": None}


class TestAdminFlow:
    def test_member_creates_quote(self, s):
        body = {
            "from_code": "LAS", "to_code": "LPL", "jet_id": "global-7500",
            "trip_type": "one_way", "depart_date": "2026-02-10", "depart_window": "Morning",
            "pax": 4, "name": "TEST_Member", "email": "member.test@sidra.example", "notes": "TEST iter2",
        }
        r = s.post(f"{API}/quotes", json=body, headers=hdrs(MEMBER_TOKEN))
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["user_id"] == "user_testmember1"
        assert q["status"] == "Requested"
        assert q["final_price_usd"] is None
        _created["id"] = q["id"]

    def test_member_forbidden_on_admin_stats(self, s):
        r = s.get(f"{API}/admin/stats", headers=hdrs(MEMBER_TOKEN))
        assert r.status_code == 403

    def test_member_forbidden_on_admin_quotes(self, s):
        r = s.get(f"{API}/admin/quotes", headers=hdrs(MEMBER_TOKEN))
        assert r.status_code == 403

    def test_admin_stats(self, s):
        r = s.get(f"{API}/admin/stats", headers=hdrs(ADMIN_TOKEN))
        assert r.status_code == 200
        d = r.json()
        for k in ["Requested", "Confirmed", "Unavailable", "Cancelled"]:
            assert k in d
        assert d["Requested"] >= 1

    def test_admin_list_quotes_filtered(self, s):
        r = s.get(f"{API}/admin/quotes", params={"status": "Requested"}, headers=hdrs(ADMIN_TOKEN))
        assert r.status_code == 200
        lst = r.json()
        assert any(q["id"] == _created["id"] for q in lst)

    def test_admin_get_quote(self, s):
        r = s.get(f"{API}/admin/quotes/{_created['id']}", headers=hdrs(ADMIN_TOKEN))
        assert r.status_code == 200
        assert r.json()["id"] == _created["id"]

    def test_admin_confirm_without_price_400(self, s):
        r = s.post(f"{API}/admin/quotes/{_created['id']}",
                   json={"status": "Confirmed", "team_message": "no price"},
                   headers=hdrs(ADMIN_TOKEN))
        assert r.status_code == 400
        assert "price" in r.json().get("detail", "").lower()

    def test_admin_confirm_with_price(self, s):
        r = s.post(f"{API}/admin/quotes/{_created['id']}",
                   json={"status": "Confirmed", "final_price_usd": 123456, "team_message": "TEST team msg"},
                   headers=hdrs(ADMIN_TOKEN))
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["status"] == "Confirmed"
        assert q["final_price_usd"] == 123456
        assert q["team_message"] == "TEST team msg"

    def test_member_sees_final_price_and_message(self, s):
        r = s.get(f"{API}/quotes/{_created['id']}", headers=hdrs(MEMBER_TOKEN))
        assert r.status_code == 200
        q = r.json()
        assert q["final_price_usd"] == 123456
        assert q["team_message"] == "TEST team msg"
        assert q["status"] == "Confirmed"

    def test_admin_update_cancelled_quote_400(self, s):
        # Member cancels then admin cannot edit
        r = s.post(f"{API}/quotes/{_created['id']}/cancel", headers=hdrs(MEMBER_TOKEN))
        assert r.status_code == 200
        assert r.json()["status"] == "Cancelled"
        r2 = s.post(f"{API}/admin/quotes/{_created['id']}",
                    json={"status": "Confirmed", "final_price_usd": 5000, "team_message": "retry"},
                    headers=hdrs(ADMIN_TOKEN))
        assert r2.status_code == 400

    @classmethod
    def teardown_class(cls):
        try:
            from pymongo import MongoClient
            from bson import ObjectId
            mc = MongoClient(os.environ["MONGO_URL"])
            dbn = os.environ["DB_NAME"]
            if _created["id"]:
                mc[dbn]["quotes"].delete_one({"_id": ObjectId(_created["id"])})
            # purge any TEST_ noise from this run
            mc[dbn]["quotes"].delete_many({"name": {"$regex": "^TEST_"}, "user_id": "user_testmember1"})
            mc[dbn]["concierge_messages"].delete_many({"user_id": "user_testmember1", "content": {"$regex": "TEST_iter2"}})
            mc.close()
        except Exception:
            pass


# ---------- Concierge for signed-in user
class TestConciergeAuth:
    def test_stream_authenticated(self, s):
        r = s.post(f"{API}/concierge/stream",
                   json={"message": "TEST_iter2 Reply with the single word SIDRA."},
                   headers=hdrs(MEMBER_TOKEN), stream=True, timeout=60)
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")
        done = False
        deltas = []
        for raw in r.iter_lines(decode_unicode=True):
            if not raw or not raw.startswith("data:"):
                continue
            try:
                obj = json.loads(raw[5:].strip())
            except Exception:
                continue
            if "delta" in obj:
                deltas.append(obj["delta"])
            if obj.get("done"):
                done = True
                break
            if "error" in obj:
                pytest.fail(obj["error"])
        assert done
        assert len("".join(deltas).strip()) > 0

    def test_history_has_user_and_assistant(self, s):
        r = s.get(f"{API}/concierge/history", headers=hdrs(MEMBER_TOKEN))
        assert r.status_code == 200
        hist = r.json()
        roles = {m["role"] for m in hist}
        assert "user" in roles
        assert "assistant" in roles

    def test_clear_history(self, s):
        r = s.delete(f"{API}/concierge/history", headers=hdrs(MEMBER_TOKEN))
        assert r.status_code == 200
        r2 = s.get(f"{API}/concierge/history", headers=hdrs(MEMBER_TOKEN))
        assert r2.json() == []
