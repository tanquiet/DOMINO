# DOMINO

**See what fails next, before it happens.**

DOMINO shows how one power or flood failure in Bengaluru spreads to water supply and hospitals, hour by hour, and recommends where a backup would protect the most hospitals.

Smart Cities track, problem statement #6 (also covers #24 Water-Energy Nexus and #22 grid cascading failures).

---

## Run it

**Easiest (no Python packages needed):** the app runs entirely in the browser.
```
cd knockon/web/dist
python -m http.server 8000
```
Open **http://localhost:8000**. Any static file server works.

Or use the bundled server, which serves the same app: `pip install -r requirements.txt`, then `python -m uvicorn api.main:app --port 8000` (or double-click `run.bat` / run `./run.sh`).

Until you pull real data, it runs on a **clearly labelled sample dataset** (yellow badge on screen).

## Get the real Bengaluru data (needs internet, once)

```
pip install -r requirements.txt
python data_pipeline/fetch_osm.py      # 2-10 min, writes data/facilities.geojson etc.
python api/export_static.py            # packs graph + roads into web/dist/data/knockon.json
```

Refresh the browser: the yellow SAMPLE badge disappears. Optionally, in `data/cauvery_chain.csv`, replace the three pumping-station lat/lon values (village centres) with the exact plant locations from Google Maps; they appear in the side panel and place cards.

## After the hospital call

Edit `sim/params.json`:
- `hospital_diesel_h` → their diesel backup hours
- `hospital_water_h` → their water storage hours

Change `"source"` to where the number came from (e.g. "Facility manager, <hospital>, 5 Nov 2026"), then run `python api/export_static.py` again and refresh.

## Put it online (for the QR code)

`web/dist` is a complete static website. Upload that folder to any static host:
- **Netlify:** log in (free) and drag the `web/dist` folder onto the deploy page.
- **GitHub Pages / Cloudflare Pages / Vercel:** publish the `web/dist` folder.

On a normal host the dark street map, satellite view, offline cache and "Add to Home Screen" all work. (The claude.ai link shows the offline road-line map instead, because claude.ai blocks outside map images.)

## Demo keys

| Key | What it does |
|---|---|
| **1** | Replay the TK Halli flood (Sept 2022): Stage III and IV units fail for 36 h |
| **2** | Draw a flood: click points on the map, then **Run flood** (or Enter). **Esc** cancels |
| **3** | Weak links: every facility fails alone, ranked by hospital-hours lost |
| **4** | Fix it: best 3 fixes for the current scenario, with before/after Resilience Index |
| **F** | Replay the current scenario with the fixes applied |
| **5** | 20-minute power trip at TK Halli (the ~4 h ripple; no hospital fails) |
| **6** | Power line to TK Halli damaged (like Oct 2024) |
| **7** | Illustrative flood zone on the Outer Ring Road |
| **/** | Search a hospital, substation or reservoir |
| **8** | Heavy rain night: flooded Outer Ring Road zone + rain-damaged power line to TK Halli (illustrative) |
| **G** | After *Replay with responses*: switch between with and without responses |
| **M** | Switch map: dark street map → satellite → offline road lines |
| **Space** | Play / pause · **R** reset · **Esc** close the place card |

**Tap any facility** to open its place card: live status, backup hours, what it depends on (drawn on the map), and what it can affect. Substations and reservoirs have a **Simulate failure** button. The sliders under *Assumptions* re-run the scenario live. Click a legend item to hide or show that layer.

## Alerts & response

As a scenario plays, DOMINO raises **alerts for the people responsible**: BESCOM (substations and power lines), BWSSB (pumping stations and reservoirs), each hospital, and telecom operators. Each alert has a severity, a deadline ("fails in 7 h") and a recommended action. Pop-ups appear on the map; the Alerts panel has a tab per agency. Notifications are simulated (no real SMS or WhatsApp yet).

- **Act** on any alert: send a water tanker, send a mobile generator, link a reservoir to another supply line, or prioritise a repair. Actions are stamped with the current hour.
- **Respond to all** within 30 min, 1 h, 2 h or 4 h of each alert.
- **Replay with responses** re-runs the city with those actions and shows the damage avoided: hospitals that fail, hospital-hours lost and the Resilience Index, before and after.

Response assumptions (in `web/src/alerts.js`, shown on screen): a tanker service starts 2 h after the request and keeps supplying until city water returns; a mobile generator arrives in 3 h and runs with refuelling; switching a reservoir takes 1 h; a prioritised repair finishes 4 h after dispatch. Enough tankers and generators are assumed. An action only helps if it lands before the failure.

**Planned power cuts:** open a substation's card, pick the length (1-24 h) and press **Simulate power cut**.

**Resilience Index** = share of all hospital-hours (every hospital × 72 h) that keep power and water in the scenario.

## The map

The background is a real street map (Esri dark streets, or satellite with **M**), so Bengaluru looks like Bengaluru. These map tiles need internet. If they can't load, the app switches to the OpenStreetMap road lines from your own data automatically, and the legend says "Map offline". The demo keeps working either way.

Tip: open the app once on the presenting laptop with internet (a phone hotspot is fine) and pan around the city, so the browser caches the tiles.

## How it works

- **Data** (`data_pipeline/fetch_osm.py`): substations, water facilities, hospitals, telecom sites and major roads from OpenStreetMap, as GeoJSON.
- **Graph** (`sim/build_graph.py`): links are **inferred** (utilities do not publish feeder maps):
  - substations below 220 kV draw power from the nearest 220 kV+ substation;
  - Cauvery water runs in parallel stages I-V through TK Halli → Harohalli → Tataguni, each station on its own dedicated power line;
  - each city water facility is fed by one stage and needs power from its nearest substation;
  - hospitals need water from the nearest water facility and power from the nearest substation (two if 200+ beds);
  - telecom sites need power from the nearest substation.
- **Engine** (`sim/engine.py`, and the identical browser version `web/src/engine.js`; `node tools/parity_check.mjs` checks they match): discrete-event simulation. Each facility is UP, on BACKUP (with a countdown) or DOWN; failures pass along links with real delays.
- **Impact** = total hospital-hours without power or water.
- **Recommender**: tries a generator, extra hospital water storage, or linking a reservoir to another supply line at every facility that failed; picks the best, applies it, repeats 3 times.

### Where the numbers come from (`sim/params.json`)

| Parameter | Value | Source |
|---|---|---|
| Pump restart after a power trip | 1 h | BWSSB officials, Deccan Herald |
| Reservoir refill | 3 h | BWSSB officials, Deccan Herald |
| TK Halli flood repair | 36 h | Deccan Herald, Sept 2022 |
| Reservoir storage without inflow | 1 h | Calibrated so a 20-min trip gives ~4 h disruption, as BWSSB describes |
| Hospital diesel / water | 12 h / 8 h | **Placeholders until the hospital call** |
| Others | see file | Marked as assumptions |

Run the engine tests: `python sim/test_engine.py` (includes the BWSSB 20-minute → ~4 h check).

## Say this before judges ask

- Locations are real (OpenStreetMap). The links between facilities are estimated, because utilities don't publish them. With BESCOM or BWSSB data, the same tool becomes exact.
- Similar tools exist abroad (One Concern, InfraRisk). None is built for Indian cities, on Indian public data, focused on hospitals.
- A map of weak points is sensitive, so a real deployment would restrict access to authorised officials.

## Edit the frontend (optional, needs Node 18+)

```
cd web
npm install          # needs internet - do it early
npm run dev          # http://localhost:5173, talks to the API on :8000
npm run build        # rebuilds web/dist, which the API serves
```

Map data © OpenStreetMap contributors (ODbL). Basemap tiles: Esri and its data providers (credited on screen).
