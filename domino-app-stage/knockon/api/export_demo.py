"""
Save every preset scenario's results into web/public/demo/bundle.json (and web/dist/demo if built),
so the page still plays the demo if the backend crashes.

Run AFTER the real data pull, from the knockon folder:   python api/export_demo.py
Then rebuild the frontend (cd web && npm run build) so the bundle is included.
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from api.main import SCENARIOS, app  # noqa: E402


def main():
    c = TestClient(app)
    bundle = {
        "meta": c.get("/api/meta").json(),
        "graph": c.get("/api/graph").json(),
        "roads": c.get("/api/roads").json(),
        "criticality": c.post("/api/criticality", json={}).json(),
        "results": {}, "results_with_plan": {}, "recommend": {},
    }
    for key in SCENARIOS:
        r = c.post("/api/simulate", json={"scenario": key})
        if r.status_code != 200:
            print(f"  skip {key}: {r.json().get('detail')}")
            continue
        bundle["results"][key] = r.json()
        rec = c.post("/api/recommend", json={"scenario": key, "budget": 3}).json()
        bundle["recommend"][key] = rec
        if rec.get("interventions"):
            bundle["results_with_plan"][key] = c.post(
                "/api/simulate", json={"scenario": key, "interventions": rec["interventions"]}).json()
        print(f"  {key}: impact {bundle['results'][key]['impact_hospital_hours']} -> "
              f"{rec.get('plan_result', {}).get('impact_hospital_hours')}")

    out = ROOT / "web" / "public" / "demo"
    out.mkdir(parents=True, exist_ok=True)
    (out / "bundle.json").write_text(json.dumps(bundle), encoding="utf-8")
    dist = ROOT / "web" / "dist" / "demo"
    if (ROOT / "web" / "dist").exists():
        dist.mkdir(parents=True, exist_ok=True)
        shutil.copy(out / "bundle.json", dist / "bundle.json")
    size = (out / "bundle.json").stat().st_size / 1e6
    print(f"Demo bundle written ({size:.1f} MB). Data: {'SAMPLE' if bundle['meta']['info']['is_sample'] else 'real OSM'}")


if __name__ == "__main__":
    main()
