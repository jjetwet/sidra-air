"""Iteration-6 SIDRA tests: Fleet (incl BBJ) and /routes/popular."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Fleet endpoints ---
class TestFleet:
    def test_fleet_list_has_10_jets_including_bbj(self, client):
        r = client.get(f"{BASE_URL}/api/fleet")
        assert r.status_code == 200
        jets = r.json()
        assert isinstance(jets, list)
        assert len(jets) == 10, f"expected 10 jets, got {len(jets)}"
        ids = [j["id"] for j in jets]
        assert "bbj" in ids, f"BBJ missing. ids={ids}"
        # schema spot check
        bbj = next(j for j in jets if j["id"] == "bbj")
        for k in ("maker", "family", "name", "pax", "range_nm", "speed_kts", "hourly_usd"):
            assert k in bbj
        assert bbj["maker"] == "Boeing"
        assert bbj["family"] == "Boeing"
        assert bbj["name"] == "Boeing Business Jet"
        assert bbj["pax"] >= 18  # test will hit >=18 filter from UI

    def test_get_bbj_by_id(self, client):
        r = client.get(f"{BASE_URL}/api/fleet/bbj")
        assert r.status_code == 200
        j = r.json()
        assert j["id"] == "bbj"
        assert j["name"] == "Boeing Business Jet"
        assert j["family"] == "Boeing"

    def test_get_unknown_jet_404(self, client):
        r = client.get(f"{BASE_URL}/api/fleet/not-a-real-jet")
        assert r.status_code == 404


# --- Popular routes ---
class TestPopularRoutes:
    def test_popular_routes_returns_8_items_full_schema(self, client):
        r = client.get(f"{BASE_URL}/api/routes/popular")
        assert r.status_code == 200
        routes = r.json()
        assert isinstance(routes, list)
        assert len(routes) == 8, f"expected 8 routes, got {len(routes)}"
        required = {"from_code", "to_code", "from_city", "to_city", "jet_id", "jet_name",
                    "flight_minutes", "estimated_price_usd"}
        for r_ in routes:
            missing = required - set(r_.keys())
            assert not missing, f"missing keys {missing} in {r_}"
            assert isinstance(r_["jet_id"], str) and r_["jet_id"]
            assert isinstance(r_["estimated_price_usd"], (int, float))
            assert r_["estimated_price_usd"] > 0
            assert isinstance(r_["flight_minutes"], (int, float))
            assert r_["flight_minutes"] > 0

    def test_popular_routes_contains_fab_nce_with_valid_jet(self, client):
        r = client.get(f"{BASE_URL}/api/routes/popular")
        assert r.status_code == 200
        routes = r.json()
        fab_nce = next((x for x in routes if x["from_code"] == "FAB" and x["to_code"] == "NCE"), None)
        assert fab_nce is not None, "FAB -> NCE route missing"
        # Verify the chosen jet exists in fleet
        jet_r = client.get(f"{BASE_URL}/api/fleet/{fab_nce['jet_id']}")
        assert jet_r.status_code == 200, f"jet_id {fab_nce['jet_id']} not found in fleet"

    def test_popular_route_estimate_matches_estimate_endpoint(self, client):
        """Cheapest-nonstop pick for FAB->NCE should match a direct call to /quotes/estimate."""
        pr = client.get(f"{BASE_URL}/api/routes/popular").json()
        fab_nce = next(x for x in pr if x["from_code"] == "FAB" and x["to_code"] == "NCE")
        est = client.post(f"{BASE_URL}/api/quotes/estimate", json={
            "from_code": "FAB", "to_code": "NCE", "jet_id": fab_nce["jet_id"], "trip_type": "one_way"
        }).json()
        assert est["estimated_price_usd"] == fab_nce["estimated_price_usd"]
        assert est["flight_minutes"] == fab_nce["flight_minutes"]
        assert est["fuel_stops"] == 0  # cheapest-nonstop guarantee
