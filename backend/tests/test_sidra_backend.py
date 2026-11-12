"""SIDRA backend tests - fleet, airports, quotes/estimate, quotes CRUD, concierge SSE."""
import json
import os
import re
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
DEVICE_ID = "TEST_devicetester_01"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s


# ---------- Fleet
class TestFleet:
    def test_get_fleet_returns_nine_jets(self, session):
        r = session.get(f"{API}/fleet")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 9
        ids = {j["id"] for j in data}
        for req in ["global-7500", "global-6500", "global-5500", "challenger-650", "challenger-3500", "g700", "g650er", "g500", "g280"]:
            assert req in ids
        # families balance
        fams = {j["family"] for j in data}
        assert fams == {"Global", "Challenger", "Gulfstream"}

    def test_get_fleet_by_id(self, session):
        r = session.get(f"{API}/fleet/global-7500")
        assert r.status_code == 200
        j = r.json()
        assert j["name"] == "Global 7500"
        assert j["pax"] == 19

    def test_get_fleet_by_id_not_found(self, session):
        r = session.get(f"{API}/fleet/unknown-jet")
        assert r.status_code == 404


# ---------- Airports
class TestAirports:
    def test_get_airports(self, session):
        r = session.get(f"{API}/airports")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 20
        codes = {a["code"] for a in data}
        for c in ["DXB", "FAB", "TEB", "VNY"]:
            assert c in codes


# ---------- Estimate
class TestEstimate:
    def test_estimate_valid(self, session):
        r = session.post(f"{API}/quotes/estimate", json={"from_code": "DXB", "to_code": "FAB", "jet_id": "global-7500", "trip_type": "one_way"})
        assert r.status_code == 200
        d = r.json()
        for k in ["distance_nm", "flight_minutes", "fuel_stops", "estimated_price_usd", "legs"]:
            assert k in d
        assert d["legs"] == 1
        assert d["distance_nm"] > 2500
        assert d["fuel_stops"] == 0
        assert d["estimated_price_usd"] > 0

    def test_estimate_return_doubles_legs(self, session):
        r = session.post(f"{API}/quotes/estimate", json={"from_code": "DXB", "to_code": "GVA", "jet_id": "challenger-650", "trip_type": "return"})
        assert r.status_code == 200
        assert r.json()["legs"] == 2

    def test_estimate_same_airport_400(self, session):
        r = session.post(f"{API}/quotes/estimate", json={"from_code": "DXB", "to_code": "DXB", "jet_id": "global-7500", "trip_type": "one_way"})
        assert r.status_code == 400

    def test_estimate_unknown_jet_400(self, session):
        r = session.post(f"{API}/quotes/estimate", json={"from_code": "DXB", "to_code": "FAB", "jet_id": "nope", "trip_type": "one_way"})
        assert r.status_code == 400

    def test_estimate_unknown_airport_400(self, session):
        r = session.post(f"{API}/quotes/estimate", json={"from_code": "ZZZ", "to_code": "FAB", "jet_id": "global-7500", "trip_type": "one_way"})
        assert r.status_code == 400


# ---------- Quotes CRUD
BASE_QUOTE = {
    "device_id": DEVICE_ID,
    "from_code": "DXB",
    "to_code": "GVA",
    "jet_id": "challenger-650",
    "trip_type": "one_way",
    "depart_date": "2026-02-10",
    "depart_window": "Morning",
    "pax": 4,
    "name": "TEST_User",
    "email": "test_user@example.com",
    "notes": "TEST request",
}


class TestQuotes:
    created_ids: list[str] = []

    def test_create_quote(self, session):
        r = session.post(f"{API}/quotes", json=BASE_QUOTE)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["jet_name"] == "Challenger 650"
        assert q["status"] == "Requested"
        assert q["distance_nm"] > 0
        assert q["estimated_price_usd"] > 0
        assert "id" in q and q["id"]
        assert "_id" not in q
        TestQuotes.created_ids.append(q["id"])

    def test_create_quote_invalid_email_422(self, session):
        body = dict(BASE_QUOTE, email="not-an-email")
        r = session.post(f"{API}/quotes", json=body)
        assert r.status_code == 422

    def test_create_quote_pax_over_seats_400(self, session):
        body = dict(BASE_QUOTE, jet_id="challenger-3500", pax=15)
        # pax field max is 19, so this passes validation but triggers business rule
        r = session.post(f"{API}/quotes", json=body)
        assert r.status_code == 400
        assert "seats" in r.json().get("detail", "").lower()

    def test_create_return_without_return_date_400(self, session):
        body = dict(BASE_QUOTE, trip_type="return")
        body.pop("return_date", None)
        r = session.post(f"{API}/quotes", json=body)
        assert r.status_code == 400
        assert "return" in r.json().get("detail", "").lower()

    def test_list_quotes_by_device(self, session):
        r = session.get(f"{API}/quotes", params={"device_id": DEVICE_ID})
        assert r.status_code == 200
        lst = r.json()
        assert isinstance(lst, list)
        assert any(q["id"] == TestQuotes.created_ids[0] for q in lst)

    def test_get_quote_by_id(self, session):
        qid = TestQuotes.created_ids[0]
        r = session.get(f"{API}/quotes/{qid}", params={"device_id": DEVICE_ID})
        assert r.status_code == 200
        assert r.json()["id"] == qid

    def test_get_quote_wrong_device_404(self, session):
        qid = TestQuotes.created_ids[0]
        r = session.get(f"{API}/quotes/{qid}", params={"device_id": "TEST_otherdevice99"})
        assert r.status_code == 404

    def test_get_quote_invalid_id_404(self, session):
        r = session.get(f"{API}/quotes/not-a-valid-oid", params={"device_id": DEVICE_ID})
        assert r.status_code == 404

    def test_cancel_quote(self, session):
        qid = TestQuotes.created_ids[0]
        r = session.post(f"{API}/quotes/{qid}/cancel", params={"device_id": DEVICE_ID})
        assert r.status_code == 200
        assert r.json()["status"] == "Cancelled"
        # verify via GET
        r2 = session.get(f"{API}/quotes/{qid}", params={"device_id": DEVICE_ID})
        assert r2.json()["status"] == "Cancelled"

    @classmethod
    def teardown_class(cls):
        # Clean created quotes directly in Mongo
        try:
            from pymongo import MongoClient
            from bson import ObjectId
            mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            dbn = os.environ.get("DB_NAME", "test_database")
            for qid in cls.created_ids:
                try:
                    mc[dbn]["quotes"].delete_one({"_id": ObjectId(qid)})
                except Exception:
                    pass
            mc.close()
        except Exception:
            pass


# ---------- Concierge
class TestConcierge:
    def test_history_empty_initially(self, session):
        # Clear first
        session.delete(f"{API}/concierge/history", params={"device_id": DEVICE_ID})
        r = session.get(f"{API}/concierge/history", params={"device_id": DEVICE_ID})
        assert r.status_code == 200
        assert r.json() == []

    def test_stream_message_sse(self, session):
        r = session.post(
            f"{API}/concierge/stream",
            json={"device_id": DEVICE_ID, "message": "Hello, say 'SIDRA' back in one short sentence."},
            stream=True,
            timeout=60,
        )
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")
        deltas = []
        done = False
        for raw in r.iter_lines(decode_unicode=True):
            if not raw:
                continue
            if raw.startswith("data:"):
                payload = raw[5:].strip()
                try:
                    obj = json.loads(payload)
                except Exception:
                    continue
                if "delta" in obj:
                    deltas.append(obj["delta"])
                if obj.get("done"):
                    done = True
                    break
                if "error" in obj:
                    pytest.fail(f"Concierge error: {obj['error']}")
        assert done, "SSE stream never signalled done"
        assert len(deltas) > 0, "No deltas received from concierge"
        combined = "".join(deltas)
        assert len(combined.strip()) > 0

    def test_history_persists_after_stream(self, session):
        r = session.get(f"{API}/concierge/history", params={"device_id": DEVICE_ID})
        assert r.status_code == 200
        hist = r.json()
        roles = [m["role"] for m in hist]
        assert "user" in roles
        assert "assistant" in roles

    def test_clear_history(self, session):
        r = session.delete(f"{API}/concierge/history", params={"device_id": DEVICE_ID})
        assert r.status_code == 200
        r2 = session.get(f"{API}/concierge/history", params={"device_id": DEVICE_ID})
        assert r2.json() == []
