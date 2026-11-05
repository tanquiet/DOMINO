"""
Export everything the browser app needs into ONE file: web/public/data/domino.json
(graph with inferred links, roads, parameters with sources, scenario definitions).

The web app then runs the whole simulation in the browser - no server needed.

run from the project folder after any data or params change:
    python api/export_static.py
then rebuild (cd web && npm run build) or copy the file into web/dist/data/.
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sim"))
sys.path.insert(0, str(ROOT))

from build_graph import build, data_dir, load_params, params_meta  # noqa: E402

from api.main import ORR_FLOOD_POLYGON, SCENARIOS  # noqa: E402


def main():
    p = load_params()
    g, info = build(p)
    nodes = []
    for n in g.nodes.values():
        nodes.append({
            "id": n.id, "kind": n.kind, "name": n.name, "lat": n.lat, "lon": n.lon,
            "on_map": n.meta.get("on_map", True), "provides": n.provides,
            "buffers": n.buffers, "restart_h": n.restart_h, "weight": n.weight,
            "meta": {k: v for k, v in n.meta.items() if k != "on_map"},
        })
    deps = {nid: [{"resource": d.resource, "providers": d.providers} for d in groups]
            for nid, groups in g.deps.items()}
    roads_path = data_dir() / "roads.geojson"
    roads = json.loads(roads_path.read_text(encoding="utf-8")) if roads_path.exists() else \
        {"type": "FeatureCollection", "features": []}
    out = {
        "version": 1,
        "meta": {"info": {k: v for k, v in info.items() if k != "data_dir"}, "params": params_meta(), "scenarios": SCENARIOS,
                 "orr_flood_polygon": ORR_FLOOD_POLYGON,
                 "attribution": "Map data (c) OpenStreetMap contributors. Dependencies between facilities are inferred."},
        "graph": {"nodes": nodes, "deps": deps},
        "roads": roads,
    }
    dest = ROOT / "web" / "public" / "data"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "domino.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    dist = ROOT / "web" / "dist"
    if dist.exists():
        (dist / "data").mkdir(exist_ok=True)
        shutil.copy(dest / "domino.json", dist / "data" / "domino.json")
    mb = (dest / "domino.json").stat().st_size / 1e6
    print(f"Wrote web/public/data/domino.json ({mb:.1f} MB) - "
          f"{'SAMPLE data' if info['is_sample'] else 'real OpenStreetMap data'}: {info['counts']}")


if __name__ == "__main__":
    main()
