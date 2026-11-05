"""Dump Python engine results so tools/parity_check.mjs can compare the JS engine."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "sim"))
from api.main import SCENARIOS, SimRequest, api_criticality, api_recommend, api_simulate
out = {"sim": {}, "rec": {}, "crit": api_criticality()["ranking"], "sliders": {}}
for k in SCENARIOS:
    out["sim"][k] = api_simulate(SimRequest(scenario=k))
    out["rec"][k] = api_recommend(SimRequest(scenario=k, budget=3))
P = {"hospital_diesel_h": 3, "hospital_water_h": 20, "reservoir_storage_h": 2.5, "telecom_battery_h": 1}
out["sliders"] = api_simulate(SimRequest(scenario="tk_halli_2022", params=P))
out["sliders_params"] = P
poly = [[77.5, 12.9], [77.7, 12.9], [77.7, 13.05], [77.5, 13.05]]
out["poly"] = api_simulate(SimRequest(polygon=poly)); out["poly_in"] = poly
(ROOT / "tools" / "parity_expected.json").write_text(json.dumps(out))
print("expected written")
