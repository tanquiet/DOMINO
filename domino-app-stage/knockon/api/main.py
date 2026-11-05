"""
DOMINO API.   Run from the knockon folder:   python -m uvicorn api.main:app --port 8000
Then open http://localhost:8000  (serves the built frontend too).
"""
from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sim"))

from build_graph import build, data_dir, load_params, nodes_in_polygon, params_meta  # noqa: E402
from engine import Failure, criticality, recommend, simulate_with  # noqa: E402

app = FastAPI(title="DOMINO")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Illustrative flood zone around the Outer Ring Road (Bellandur - Marathahalli).
# NOT the mapped 2022 flood extent - say so if you show it.
ORR_FLOOD_POLYGON = [[77.660, 12.912], [77.718, 12.912], [77.722, 12.962],
                     [77.690, 12.972], [77.660, 12.958]]

SCENARIOS = {
    "tk_halli_2022": {
        "label": "Replay: TK Halli flood, Sept 2022",
        "note": "Stage III and IV units at TK Halli submerged (as reported); restored in 36 h.",
    },
    "tk_halli_trip": {
        "label": "20-minute power trip at TK Halli",
        "note": "BWSSB says a short trip costs ~1 h pump restart + ~3 h reservoir refill.",
    },
    "tk_halli_feeder": {
        "label": "Power line to TK Halli damaged (like Oct 2024)",
        "note": "Rain and lightning damaged transformers feeding TK Halli and Harohalli in Oct 2024.",
    },
    "orr_flood": {
        "label": "Flood on the Outer Ring Road (illustrative zone)",
        "note": "Illustrative zone around Bellandur-Marathahalli, not the mapped 2022 extent.",
    },
}


class SimRequest(BaseModel):
    scenario: str | None = None
    failures: list[dict] | None = None        # [{"id", "at_h", "repair_h"}]
    polygon: list[list[float]] | None = None  # [[lon, lat], ...]
    polygon_repair_h: float | None = None
    params: dict | None = None
    interventions: list[dict] | None = None
    horizon_h: float | None = None
    budget: int | None = 3


def _key(params: dict | None):
    return tuple(sorted((k, float(v)) for k, v in (params or {}).items() if v is not None))


@lru_cache(maxsize=32)
def _graph(key):
    p = load_params(dict(key))
    g, info = build(p)
    return g, info, p


def graph_for(params):
    return _graph(_key(params))


def failures_for(req: SimRequest, g, p) -> list[Failure]:
    out = []
    sc = req.scenario
    if sc == "tk_halli_2022":
        for st in ("iii", "iv"):
            out.append(Failure(f"cauvery_tk_halli_{st}", 0.0, p["tk_halli_flood_repair_h"], "flooded (Sept 2022)"))
    elif sc == "tk_halli_trip":
        out.append(Failure("feeder_cauvery_tk_halli", 0.0, 20 / 60, "20-minute power trip"))
    elif sc == "tk_halli_feeder":
        out.append(Failure("feeder_cauvery_tk_halli", 0.0, p["default_repair_h"], "transformer damaged"))
    elif sc == "orr_flood":
        for nid in nodes_in_polygon(g, ORR_FLOOD_POLYGON):
            out.append(Failure(nid, 0.0, p["default_repair_h"], "flooded"))
    elif sc:
        raise HTTPException(400, f"unknown scenario {sc}")

    for f in req.failures or []:
        if f.get("id") not in g.nodes:
            raise HTTPException(400, f"unknown node {f.get('id')}")
        out.append(Failure(f["id"], float(f.get("at_h", 0.0)),
                           None if f.get("repair_h") is None else float(f["repair_h"]),
                           f.get("reason", "failed")))
    if req.polygon:
        rep = req.polygon_repair_h if req.polygon_repair_h is not None else p["default_repair_h"]
        for nid in nodes_in_polygon(g, req.polygon):
            out.append(Failure(nid, 0.0, rep, "flooded"))
    return out


def node_json(n):
    return {"id": n.id, "kind": n.kind, "name": n.name, "lat": n.lat, "lon": n.lon,
            "on_map": n.meta.get("on_map", True), "buffers": n.buffers,
            "meta": {k: v for k, v in n.meta.items() if k != "on_map"}}


@app.get("/api/meta")
def meta():
    g, info, p = graph_for(None)
    return {"info": info, "params": params_meta(), "scenarios": SCENARIOS,
            "orr_flood_polygon": ORR_FLOOD_POLYGON,
            "attribution": "Map data (c) OpenStreetMap contributors. Dependencies between facilities are inferred."}


@app.get("/api/graph")
def graph(params: str | None = None):
    g, info, p = graph_for(None)
    return {"nodes": [node_json(n) for n in g.nodes.values()], "edges": list(g.edges())}


@app.get("/api/roads")
def roads():
    path = data_dir() / "roads.geojson"
    if not path.exists():
        return {"type": "FeatureCollection", "features": []}
    return FileResponse(path, media_type="application/geo+json")


@app.post("/api/simulate")
def api_simulate(req: SimRequest):
    g, info, p = graph_for(req.params)
    fails = failures_for(req, g, p)
    if not fails:
        raise HTTPException(400, "nothing failed - pick a scenario, a node or a flood area")
    r = simulate_with(g, fails, req.horizon_h or p["horizon_h"], req.interventions)
    r["failures"] = [{"id": f.node_id, "at_h": f.at_h, "repair_h": f.repair_h, "reason": f.reason}
                     for f in fails]
    return r


@lru_cache(maxsize=16)
def _criticality(key):
    """Rank weak links. The three stations on one Cauvery stage behave identically, and so do the
    three dedicated power lines, so those are collapsed into one row each to keep the list readable."""
    g, info, p = _graph(key)
    rows = criticality(g, repair_h=p["default_repair_h"], horizon_h=48.0, top=None)
    out, seen = [], set()
    for r in rows:
        node = g.nodes[r["id"]]
        if node.kind == "pump":
            gkey = ("stage", node.meta.get("stage"))
            name = f"Cauvery Stage {node.meta.get('stage')} pumps (TK Halli, Harohalli or Tataguni)"
        elif node.kind == "feeder":
            gkey = ("feeder", r["impact_hospital_hours"])
            name = "Power line to any one Cauvery pumping station"
        else:
            gkey, name = ("node", r["id"]), r["name"]
        if gkey in seen:
            continue
        seen.add(gkey)
        out.append({**r, "name": name})
        if len(out) >= 12:
            break
    return out


@app.post("/api/criticality")
def api_criticality(req: SimRequest | None = None):
    return {"ranking": _criticality(_key(req.params if req else None)),
            "method": "Each facility fails alone for the default repair time; score = hospital-hours lost in 48 h."}


@app.post("/api/recommend")
def api_recommend(req: SimRequest):
    g, info, p = graph_for(req.params)
    fails = failures_for(req, g, p)
    if not fails:
        raise HTTPException(400, "nothing failed - pick a scenario, a node or a flood area")
    return recommend(g, fails, req.horizon_h or p["horizon_h"], generator_h=p["generator_h"],
                     storage_h=p["storage_h"], budget=max(1, min(req.budget or 3, 5)))


# ---- frontend (built files) -------------------------------------------------
DIST = ROOT / "web" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
else:
    @app.get("/")
    def no_frontend():
        return JSONResponse({"message": "API is running. Build the frontend: cd web && npm install && npm run build"})
