#!/usr/bin/env python3
"""
DOMINO - pull Bengaluru infrastructure from OpenStreetMap.

Run this ONCE on a laptop that has internet. After that, everything runs offline.

Writes into knockon/data/:
  facilities.geojson   substations, water facilities, hospitals, telecom (as points)
  roads.geojson        major roads, used as the offline base map
  cauvery_chain.csv    TK Halli -> Harohalli -> Tataguni pumping chain (CHECK BY HAND)
  manifest.json        counts and timestamp

Usage (from the knockon folder):
  pip install -r requirements.txt
  python data_pipeline/fetch_osm.py

Takes roughly 2-10 minutes depending on the connection. Safe to re-run: results are cached.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import osmnx as ox
import pandas as pd
from shapely.geometry import box, mapping

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PLACE = "Bengaluru, Karnataka, India"
# Rough box around Bengaluru (west, south, east, north). Used only if the place lookup fails.
FALLBACK_BBOX = (77.40, 12.80, 77.85, 13.20)
UTM = "EPSG:32643"  # UTM zone 43N (metres) - accurate centroids for Bengaluru

# What to pull. Within one dict, keys are OR-ed (any match counts).
LAYERS = {
    "substation": {"power": "substation"},
    "water": {"man_made": ["water_works", "pumping_station", "water_tower",
                           "reservoir_covered", "storage_tank"]},
    "hospital": {"amenity": "hospital", "healthcare": "hospital"},
    "telecom": {"telecom": ["exchange", "data_center"],
                "tower:type": "communication",
                "communication:mobile_phone": "yes"},
}
ROAD_TYPES = ["motorway", "trunk", "primary", "secondary",
              "motorway_link", "trunk_link", "primary_link"]

# The Cauvery supply chain sits ~100 km outside the city, so it is added separately.
# Order = direction of water flow as we understand it (TK Halli is at the river). VERIFY.
CAUVERY_CHAIN = [
    ("cauvery_tk_halli", "TK Halli pumping station",
     ["Torekadanahalli, Mandya, Karnataka, India", "Torekadanahalli, Karnataka, India"]),
    ("cauvery_harohalli", "Harohalli pumping station",
     ["Harohalli, Ramanagara, Karnataka, India", "Harohalli, Karnataka, India"]),
    ("cauvery_tataguni", "Tataguni pumping station",
     ["Tataguni, Bengaluru, Karnataka, India", "Tataguni, Karnataka, India"]),
]


def configure_osmnx() -> None:
    ox.settings.use_cache = True
    ox.settings.log_console = False
    if hasattr(ox.settings, "requests_timeout"):
        ox.settings.requests_timeout = 300


def city_polygon():
    try:
        gdf = ox.geocode_to_gdf(PLACE)
        poly = gdf.geometry.iloc[0]
        if poly.geom_type in ("Polygon", "MultiPolygon"):
            print(f"Area: official boundary of '{PLACE}'")
            return poly
        print(f"  Place lookup returned a {poly.geom_type}, using fallback box")
    except Exception as exc:  # noqa: BLE001
        print(f"  Place lookup failed ({exc}); using fallback box")
    return box(*FALLBACK_BBOX)


def fetch(poly, tags: dict, label: str, tries: int = 3):
    """Query Overpass with retries. Returns a GeoDataFrame, an empty one, or None on failure."""
    for attempt in range(1, tries + 1):
        try:
            print(f"  fetching {label} (attempt {attempt}) ...", flush=True)
            return ox.features_from_polygon(poly, tags)
        except Exception as exc:  # noqa: BLE001
            if type(exc).__name__ == "InsufficientResponseError" or "No matching features" in str(exc):
                print(f"  {label}: no features found")
                return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")
            print(f"  {label}: failed: {exc}")
            if attempt < tries:
                time.sleep(15 * attempt)
    print(f"  {label}: GAVE UP after {tries} attempts")
    return None


def _get(row, key):
    if key in row.index:
        val = row[key]
        if val is not None and not (isinstance(val, float) and pd.isna(val)):
            s = str(val).strip()
            return s or None
    return None


def _max_kv(voltage: str | None) -> float | None:
    """'220000;66000;11000' -> 220.0 (kV)."""
    if not voltage:
        return None
    nums = []
    for part in re.split(r"[;,/ ]+", voltage):
        part = part.strip().lower().replace("kv", "000").replace("v", "")
        try:
            nums.append(float(part))
        except ValueError:
            continue
    if not nums:
        return None
    best = max(nums)
    return round(best / 1000.0, 1) if best >= 1000 else best


def _int_or_none(val: str | None) -> int | None:
    if not val:
        return None
    m = re.search(r"\d+", val)
    return int(m.group()) if m else None


def to_points(gdf, layer: str) -> list[dict]:
    """Turn OSM features (points, ways, polygons) into GeoJSON point features."""
    if gdf is None or gdf.empty:
        return []
    gdf = gdf.reset_index()
    idcol = "id" if "id" in gdf.columns else ("osmid" if "osmid" in gdf.columns else None)
    elcol = "element" if "element" in gdf.columns else (
        "element_type" if "element_type" in gdf.columns else None)
    gdf = gdf[gdf.geometry.notna()].copy()
    if gdf.empty:
        return []
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    cent = gdf.to_crs(UTM).geometry.centroid.to_crs("EPSG:4326")

    feats, seen = [], set()
    for (_, row), pt in zip(gdf.iterrows(), cent):
        osm_id = f"{row[elcol] if elcol else 'x'}/{row[idcol] if idcol else len(feats)}"
        if osm_id in seen:
            continue
        seen.add(osm_id)

        subtype = None
        props = {}
        if layer == "substation":
            subtype = _get(row, "substation") or "unknown"
            props["voltage_kv"] = _max_kv(_get(row, "voltage"))
        elif layer == "water":
            subtype = _get(row, "man_made")
            if subtype == "storage_tank" and (_get(row, "content") or "").lower() != "water":
                continue  # skip fuel/gas tanks
        elif layer == "hospital":
            subtype = "hospital"
            props["beds"] = _int_or_none(_get(row, "beds"))
            props["emergency"] = _get(row, "emergency")
        elif layer == "telecom":
            subtype = _get(row, "telecom") or "tower"

        props.update({
            "id": f"{layer}_{osm_id.replace('/', '_')}",
            "layer": layer,
            "subtype": subtype,
            "name": _get(row, "name") or _get(row, "name:en"),
            "operator": _get(row, "operator"),
            "osm": osm_id,
            "source": "openstreetmap",
        })
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point",
                         "coordinates": [round(pt.x, 6), round(pt.y, 6)]},
            "properties": props,
        })
    return feats


def roads_geojson(gdf) -> dict:
    if gdf is None or gdf.empty:
        return {"type": "FeatureCollection", "features": []}
    gdf = gdf.reset_index()
    gdf = gdf[gdf.geometry.geom_type.isin(["LineString", "MultiLineString"])].copy()
    keep = [c for c in ("highway", "name") if c in gdf.columns]
    gdf = gdf[keep + ["geometry"]]
    # Simplify to ~15 m to keep the file small for the browser.
    gdf = gdf.to_crs(UTM)
    gdf["geometry"] = gdf.geometry.simplify(15)
    gdf = gdf.to_crs("EPSG:4326")
    feats = []
    for _, row in gdf.iterrows():
        props = {k: (None if pd.isna(row[k]) else str(row[k])) for k in keep}
        feats.append({"type": "Feature", "geometry": mapping(row.geometry), "properties": props})
    return {"type": "FeatureCollection", "features": feats}


def geocode_chain() -> list[dict]:
    rows = []
    for order, (cid, name, queries) in enumerate(CAUVERY_CHAIN, start=1):
        lat = lon = None
        used = ""
        for q in queries:
            try:
                lat, lon = ox.geocode(q)
                used = q
                break
            except Exception:  # noqa: BLE001
                continue
        rows.append({
            "id": cid, "name": name, "stage_order": order,
            "lat": round(lat, 6) if lat is not None else "",
            "lon": round(lon, 6) if lon is not None else "",
            "location_quality": ("village centre from geocoding - replace with exact plant "
                                 "location from Google Maps if you can") if lat is not None
                                else "MISSING - fill lat/lon from Google Maps",
            "geocode_query": used,
        })
        status = f"{lat:.4f}, {lon:.4f}" if lat is not None else "NOT FOUND"
        print(f"  {name}: {status}")
    return rows


def main() -> int:
    configure_osmnx()
    DATA.mkdir(parents=True, exist_ok=True)
    poly = city_polygon()

    all_feats: list[dict] = []
    counts: dict[str, int] = {}
    failed: list[str] = []
    for layer, tags in LAYERS.items():
        gdf = fetch(poly, tags, layer)
        if gdf is None:
            failed.append(layer)
            counts[layer] = 0
            continue
        feats = to_points(gdf, layer)
        counts[layer] = len(feats)
        all_feats.extend(feats)
        print(f"  -> {layer}: {len(feats)}")

    (DATA / "facilities.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": all_feats}), encoding="utf-8")

    roads = fetch(poly, {"highway": ROAD_TYPES}, "roads")
    if roads is None:
        failed.append("roads")
    rj = roads_geojson(roads)
    counts["roads"] = len(rj["features"])
    (DATA / "roads.geojson").write_text(json.dumps(rj), encoding="utf-8")
    print(f"  -> roads: {counts['roads']}")

    print("Geocoding the Cauvery pumping chain ...")
    chain = geocode_chain()
    with open(DATA / "cauvery_chain.csv", "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(chain[0].keys()))
        writer.writeheader()
        writer.writerows(chain)

    manifest = {
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "area": PLACE,
        "counts": counts,
        "failed_layers": failed,
        "osmnx_version": ox.__version__,
        "attribution": "Data (c) OpenStreetMap contributors, ODbL",
    }
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("\nDone. Files are in", DATA)
    for k, v in counts.items():
        print(f"  {k:<11}{v}")
    if failed:
        print("\nSome layers FAILED:", ", ".join(failed), "- re-run the script (it resumes from cache).")
        return 1
    missing = [r["name"] for r in chain if r["lat"] == ""]
    if missing:
        print("\nFill these by hand in data/cauvery_chain.csv (lat/lon from Google Maps):",
              ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
