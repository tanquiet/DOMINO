"""
Generate a SAMPLE dataset (synthetic, clearly labelled) so the app runs before the real
OpenStreetMap pull is done. Never present this as real Bengaluru data.

  python sim/sample_data.py   -> writes data/sample/
"""
import csv
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "sample"
CENTER = (12.9716, 77.5946)   # lat, lon (city centre)


def jitter(rng, r_km):
    ang = rng.uniform(0, 2 * math.pi)
    d = r_km * math.sqrt(rng.random())
    dlat = d / 111.0 * math.sin(ang)
    dlon = d / (111.0 * math.cos(math.radians(CENTER[0]))) * math.cos(ang)
    return round(CENTER[0] + dlat, 6), round(CENTER[1] + dlon, 6)


def feat(layer, i, lat, lon, **props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"id": f"{layer}_sample_{i}", "layer": layer, "source": "SAMPLE (synthetic)", **props}}


def main():
    rng = random.Random(42)
    OUT.mkdir(parents=True, exist_ok=True)
    feats = []
    for i in range(6):
        lat, lon = jitter(rng, 12)
        feats.append(feat("substation", i, lat, lon, subtype="transmission", voltage_kv=220.0,
                          name=f"Sample 220 kV Substation {i + 1}"))
    for i in range(40):
        lat, lon = jitter(rng, 14)
        feats.append(feat("substation", 100 + i, lat, lon, subtype="distribution", voltage_kv=66.0,
                          name=f"Sample 66 kV Substation {i + 1}"))
    for i in range(22):
        lat, lon = jitter(rng, 13)
        feats.append(feat("water", i, lat, lon, subtype="reservoir_covered", name=f"Sample Reservoir {i + 1}"))
    for i in range(70):
        lat, lon = jitter(rng, 13)
        beds = rng.choice([None, None, 50, 120, 250, 400])
        feats.append(feat("hospital", i, lat, lon, subtype="hospital", beds=beds, name=f"Sample Hospital {i + 1}"))
    for i in range(50):
        lat, lon = jitter(rng, 14)
        feats.append(feat("telecom", i, lat, lon, subtype="tower", name=f"Sample Tower {i + 1}"))
    (OUT / "facilities.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))

    # simple radial + ring roads
    roads = []
    for k in range(12):
        ang = 2 * math.pi * k / 12
        pts = []
        for d in range(0, 17, 2):
            pts.append([round(CENTER[1] + d / (111 * math.cos(math.radians(CENTER[0]))) * math.cos(ang), 6),
                        round(CENTER[0] + d / 111 * math.sin(ang), 6)])
        roads.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": pts},
                      "properties": {"highway": "primary", "name": None}})
    for r in (4, 9, 15):
        pts = []
        for k in range(0, 73):
            ang = 2 * math.pi * k / 72
            pts.append([round(CENTER[1] + r / (111 * math.cos(math.radians(CENTER[0]))) * math.cos(ang), 6),
                        round(CENTER[0] + r / 111 * math.sin(ang), 6)])
        roads.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": pts},
                      "properties": {"highway": "trunk", "name": None}})
    (OUT / "roads.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": roads}))

    with open(OUT / "cauvery_chain.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "name", "stage_order", "lat", "lon", "location_quality", "geocode_query"])
        for i, (cid, name) in enumerate([("cauvery_tk_halli", "TK Halli pumping station"),
                                         ("cauvery_harohalli", "Harohalli pumping station"),
                                         ("cauvery_tataguni", "Tataguni pumping station")], 1):
            w.writerow([cid, name, i, "", "", "sample - no location", ""])
    (OUT / "manifest.json").write_text(json.dumps({"sample": True, "note": "Synthetic data for testing only"}))
    print("Sample data written to", OUT)


if __name__ == "__main__":
    main()
