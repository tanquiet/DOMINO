"""
Turn the OpenStreetMap facilities into a DOMINO dependency graph.

Every link below is INFERRED (utilities do not publish feeder maps). The rules:
  - Substations >= 220 kV are transmission; other substations draw power from the nearest one.
  - Cauvery chain: dedicated feeder -> TK Halli -> Harohalli -> Tataguni (water flows in that order).
    BWSSB laid separate power lines for these stations, so each gets its own feeder node.
  - Every city water facility (reservoir, tank, tower, water works) is fed by the end of the chain
    and needs power from its nearest substation for distribution pumping.
  - Hospitals need water from the nearest water facility and power from the nearest substation
    (two nearest if the hospital is large).
  - Telecom towers need power from the nearest substation.
"""
from __future__ import annotations

import csv
import json
import math
from pathlib import Path

from engine import Dep, Graph, Node

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CHAIN_ORDER = ["cauvery_tk_halli", "cauvery_harohalli", "cauvery_tataguni"]
CHAIN_NAMES = {"cauvery_tk_halli": "TK Halli pumping station",
               "cauvery_harohalli": "Harohalli pumping station",
               "cauvery_tataguni": "Tataguni pumping station"}


def load_params(overrides: dict | None = None) -> dict:
    meta = json.loads((HERE / "params.json").read_text(encoding="utf-8"))
    values = {k: v["value"] for k, v in meta.items()}
    for k, v in (overrides or {}).items():
        if k in values and v is not None:
            values[k] = float(v)
    return values


def params_meta() -> dict:
    return json.loads((HERE / "params.json").read_text(encoding="utf-8"))


def data_dir() -> Path:
    real = ROOT / "data"
    if (real / "facilities.geojson").exists():
        return real
    return ROOT / "data" / "sample"


def _dist_km(a, b):
    lat1, lon1 = a
    lat2, lon2 = b
    x = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    y = math.radians(lat2 - lat1)
    return 6371.0 * math.hypot(x, y)


def _nearest(point, candidates, k=1):
    """candidates: list of (id, (lat, lon)). Returns the k nearest ids."""
    scored = sorted(candidates, key=lambda c: _dist_km(point, c[1]))
    return [c[0] for c in scored[:k]]


def _label(props, fallback):
    return props.get("name") or fallback


STAGES = ["I", "II", "III", "IV", "V"]


def _assign_stages(water, stages):
    """INFERRED: which Cauvery stage feeds which reservoir is not public.
    Outermost ~20% -> last stage (Stage V serves the newer outskirts); the rest split into
    equal angular sectors around the centre for the remaining stages."""
    if not water:
        return {}
    clat = sum(w[1] for w in water) / len(water)
    clon = sum(w[2] for w in water) / len(water)
    out = {}
    pts = [(pr["id"], lat, lon, _dist_km((clat, clon), (lat, lon)),
            math.atan2(lat - clat, lon - clon)) for pr, lat, lon in water]
    inner_stages = stages[:-1] if len(stages) > 1 else stages
    if len(stages) > 1:
        cutoff = sorted(p[3] for p in pts)[int(0.8 * (len(pts) - 1))] if len(pts) > 4 else float("inf")
    else:
        cutoff = float("inf")
    for nid, lat, lon, d, ang in pts:
        if len(stages) > 1 and d > cutoff:
            out[nid] = stages[-1]
        else:
            sector = int(((ang + math.pi) / (2 * math.pi)) * len(inner_stages)) % len(inner_stages)
            out[nid] = inner_stages[sector]
    return out


def build(params: dict | None = None, ddir: Path | None = None):
    p = params or load_params()
    ddir = ddir or data_dir()
    fc = json.loads((ddir / "facilities.geojson").read_text(encoding="utf-8"))

    nodes: dict[str, Node] = {}
    deps: dict[str, list] = {}

    subs_tx, subs_dist, water, hospitals, telecom = [], [], [], [], []
    for f in fc["features"]:
        pr = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        layer = pr.get("layer")
        if layer == "substation":
            kv = pr.get("voltage_kv")
            (subs_tx if kv is not None and kv >= 220 else subs_dist).append((pr, lat, lon))
        elif layer == "water":
            water.append((pr, lat, lon))
        elif layer == "hospital":
            hospitals.append((pr, lat, lon))
        elif layer == "telecom":
            telecom.append((pr, lat, lon))

    # --- power
    for pr, lat, lon in subs_tx:
        nodes[pr["id"]] = Node(pr["id"], "substation_tx", _label(pr, f"{int(pr['voltage_kv'])} kV substation"),
                               lat, lon, provides="power", restart_h={"repair": 0.0},
                               meta={"voltage_kv": pr.get("voltage_kv"), "osm": pr.get("osm")})
    tx_pts = [(pr["id"], (lat, lon)) for pr, lat, lon in subs_tx]
    for pr, lat, lon in subs_dist:
        kv = pr.get("voltage_kv")
        nodes[pr["id"]] = Node(pr["id"], "substation", _label(pr, f"{int(kv)} kV substation" if kv else "Substation"),
                               lat, lon, provides="power", restart_h={"repair": 0.0, "power": 0.0},
                               meta={"voltage_kv": kv, "osm": pr.get("osm")})
        if tx_pts:
            deps[pr["id"]] = [Dep("power", _nearest((lat, lon), tx_pts, 1))]

    all_subs = [(pr["id"], (lat, lon)) for pr, lat, lon in subs_dist] or tx_pts
    if not all_subs:
        raise RuntimeError("No substations in the data - re-run the data pull.")

    # --- Cauvery supply: parallel stages (I-V), each a line through the three stations.
    # Shown in the side panel, not on the city map (the stations are ~100 km away).
    chain_rows = {}
    chain_csv = ddir / "cauvery_chain.csv"
    if chain_csv.exists():
        with open(chain_csv, encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                chain_rows[row["id"]] = row
    stages = STAGES[: max(1, min(len(STAGES), int(p.get("cauvery_stages", 5))))]
    for cid in CHAIN_ORDER:
        row = chain_rows.get(cid, {})
        lat = float(row["lat"]) if row.get("lat") else 0.0
        lon = float(row["lon"]) if row.get("lon") else 0.0
        station = CHAIN_NAMES[cid].split(" pumping")[0]
        feeder_id = f"feeder_{cid}"
        nodes[feeder_id] = Node(feeder_id, "feeder", f"Dedicated power line to {station}", lat, lon,
                                provides="power", meta={"on_map": False, "station": cid})
        for st in stages:
            uid = f"{cid}_{st.lower()}"
            nodes[uid] = Node(uid, "pump", f"{station} - Stage {st}", lat, lon, provides="water",
                              restart_h={"power": p["pump_restart_h"], "repair": p["pump_restart_h"], "water": 0.0},
                              meta={"on_map": False, "station": cid, "stage": st,
                                    "location_quality": row.get("location_quality", "unknown")})
            groups = [Dep("power", [feeder_id])]
            idx = CHAIN_ORDER.index(cid)
            if idx > 0:
                groups.append(Dep("water", [f"{CHAIN_ORDER[idx - 1]}_{st.lower()}"]))
            deps[uid] = groups

    # --- city water facilities
    if not water:   # OSM coverage gap: one virtual distribution node so the chain still reaches hospitals
        lat = sum(h[1] for h in hospitals) / max(len(hospitals), 1)
        lon = sum(h[2] for h in hospitals) / max(len(hospitals), 1)
        water = [({"id": "water_virtual_city", "name": "City water distribution (virtual)",
                   "subtype": "virtual"}, lat, lon)]
    stage_of = _assign_stages(water, stages)
    for pr, lat, lon in water:
        nid = pr["id"]
        st = stage_of[nid]
        nodes[nid] = Node(nid, "reservoir", _label(pr, (pr.get("subtype") or "water").replace("_", " ").title()),
                          lat, lon, provides="water",
                          buffers={"water": p["reservoir_storage_h"], "power": p["reservoir_power_backup_h"]},
                          restart_h={"water": p["reservoir_refill_h"], "power": p["pump_restart_h"],
                                     "repair": p["pump_restart_h"]},
                          meta={"subtype": pr.get("subtype"), "osm": pr.get("osm"), "supply_line": st})
        deps[nid] = [Dep("water", [f"{CHAIN_ORDER[-1]}_{st.lower()}"]),
                     Dep("power", _nearest((lat, lon), all_subs, 1))]
    water_pts = [(pr["id"], (lat, lon)) for pr, lat, lon in water]

    # --- hospitals
    for pr, lat, lon in hospitals:
        nid = pr["id"]
        beds = pr.get("beds")
        dual = beds is not None and beds >= p["hospital_dual_feed_min_beds"]
        nodes[nid] = Node(nid, "hospital", _label(pr, "Hospital (unnamed)"), lat, lon,
                          buffers={"power": p["hospital_diesel_h"], "water": p["hospital_water_h"]},
                          weight=1.0, meta={"beds": beds, "dual_feed": dual, "osm": pr.get("osm")})
        deps[nid] = [Dep("water", _nearest((lat, lon), water_pts, 1)),
                     Dep("power", _nearest((lat, lon), all_subs, 2 if dual else 1))]

    # --- telecom
    for pr, lat, lon in telecom:
        nid = pr["id"]
        nodes[nid] = Node(nid, "telecom", _label(pr, "Telecom site"), lat, lon, provides="comms",
                          buffers={"power": p["telecom_battery_h"]}, meta={"osm": pr.get("osm")})
        deps[nid] = [Dep("power", _nearest((lat, lon), all_subs, 1))]

    g = Graph(nodes, deps)
    info = {
        "data_dir": str(ddir),
        "is_sample": ddir.name == "sample",
        "counts": {k: sum(1 for n in nodes.values() if n.kind == k)
                   for k in ("substation_tx", "substation", "feeder", "pump", "reservoir", "hospital", "telecom")},
        "chain": CHAIN_ORDER,
        "stages": stages,
        "virtual_water": any(n.id == "water_virtual_city" for n in nodes.values()),
    }
    return g, info


def nodes_in_polygon(graph: Graph, polygon, kinds=("substation_tx", "substation", "reservoir", "telecom")):
    """polygon: [[lon, lat], ...]. Ray casting."""
    def inside(lon, lat):
        hit = False
        n = len(polygon)
        for i in range(n):
            x1, y1 = polygon[i]
            x2, y2 = polygon[(i + 1) % n]
            if (y1 > lat) != (y2 > lat):
                xin = (x2 - x1) * (lat - y1) / (y2 - y1) + x1
                if lon < xin:
                    hit = not hit
        return hit
    return [n.id for n in graph.nodes.values()
            if n.kind in kinds and n.meta.get("on_map", True) and inside(n.lon, n.lat)]
