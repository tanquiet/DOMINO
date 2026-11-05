"""Dump Python engine results so tools/parity_check.mjs can compare the JS engine."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "sim"))
from fastapi.testclient import TestClient
from api.main import app, SCENARIOS
c = TestClient(app)
out = {"sim": {}, "rec": {}, "crit": c.post("/api/criticality", json={}).json()["ranking"], "sliders": {}}
for k in SCENARIOS:
    out["sim"][k] = c.post("/api/simulate", json={"scenario": k}).json()
    out["rec"][k] = c.post("/api/recommend", json={"scenario": k, "budget": 3}).json()
P = {"hospital_diesel_h": 3, "hospital_water_h": 20, "reservoir_storage_h": 2.5, "telecom_battery_h": 1}
out["sliders"] = c.post("/api/simulate", json={"scenario": "tk_halli_2022", "params": P}).json()
out["sliders_params"] = P
poly = [[77.5, 12.9], [77.7, 12.9], [77.7, 13.05], [77.5, 13.05]]
out["poly"] = c.post("/api/simulate", json={"polygon": poly}).json(); out["poly_in"] = poly
(ROOT / "tools" / "parity_expected.json").write_text(json.dumps(out))
print("expected written")
