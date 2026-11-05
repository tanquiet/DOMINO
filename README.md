# DOMINO

**See what fails next, before it happens.**

DOMINO is a live map of how Bengaluru's power, water, hospitals and telecom depend on each other. When something breaks (a power cut, a flooded area, a pumping station that stops), DOMINO plays out hour by hour what fails next, alerts the people responsible before their facility fails, and shows how much damage acting early avoids.

- **Team:** POV
- **Event:** TechXcellence 2026, AIEMS Bengaluru, Smart Cities track (T1)
- **Problem statement:** #6, Urban Infrastructure Dependency Mapping and Cascading Failure Simulation (also covers #24 Water-Energy Nexus and #22 grid cascading failures)

---

## Contents

1. [What it does](#what-it-does)
2. [Run it (Windows, VS Code)](#run-it-windows-vs-code)
3. [Two-minute demo](#two-minute-demo)
4. [Keyboard shortcuts](#keyboard-shortcuts)
5. [Reading the map](#reading-the-map)
6. [Report an incident](#report-an-incident)
7. [Alerts and response](#alerts-and-response)
8. [Weak links, Fix it and the Resilience Index](#weak-links-fix-it-and-the-resilience-index)
9. [How it works](#how-it-works)
10. [Use the real Bengaluru data](#use-the-real-bengaluru-data)
11. [Put it online](#put-it-online)
12. [Project structure](#project-structure)
13. [Where the numbers come from](#where-the-numbers-come-from)
14. [Limits](#limits)

---

## What it does

| Feature | What you see |
|---|---|
| **Live city map** | Street map (or dark map / satellite) with Google-style pins for every substation, water facility, hospital and telecom site |
| **Dependency links** | Lines between places, coloured **weak / medium / strong** by how many supply lines and how much backup each place has |
| **Report an incident** | Anyone reports a power cut, flooding or no water at a spot; DOMINO runs the cascade at once |
| **Cascade replay** | A 72-hour timeline: pins turn amber (on backup) and red (down) as the failure spreads |
| **Alerts** | Alerts for BESCOM, BWSSB, each hospital and telecom operators, with a deadline ("fails in 7 h") and a recommended action |
| **Response replay** | Send tankers, generators or repair crews, then replay to see hospitals saved and damage avoided |
| **Weak links** | Fails every facility one at a time and ranks which ones hurt hospitals most |
| **Fix it** | Recommends the 3 changes (generator, water storage, second supply line) that protect the most hospitals |
| **Place cards** | Tap any pin: status, backup hours, what it depends on, what it affects, satellite photo, Street View and Google Maps buttons |

Everything runs in the browser. No server, no login, no API keys.

---

## Run it (Windows, VS Code)

You need **Python 3** (only to serve the files) and **Chrome**. No packages to install.

1. Unzip `DOMINO-full-app.zip` into `C:\HACKATHON WIN`. You get a folder called `domino`.
2. In VS Code: **File → Open Folder → `C:\HACKATHON WIN\domino`**.
3. Open a terminal (**Ctrl + `**) and paste, one line at a time:

```powershell
cd "C:\HACKATHON WIN\domino\web\dist"
Start-Process "http://127.0.0.1:8000"
python -m http.server 8000 --bind 127.0.0.1
```

4. Chrome opens DOMINO at **http://127.0.0.1:8000** (same as http://localhost:8000). Press **Ctrl+Shift+R** once to load the newest version.

Keep the terminal open while presenting. **Ctrl+C** stops the app.

**Mac / Linux:**
```bash
cd domino/web/dist
python3 -m http.server 8000 --bind 127.0.0.1
# open http://127.0.0.1:8000
```

**If something goes wrong**

| Problem | Fix |
|---|---|
| `python` is not recognised | Use the full path, e.g. `& "C:\Users\<you>\AppData\Local\Programs\Python\Python311\python.exe" -m http.server 8000 --bind 127.0.0.1` |
| "Address already in use" | Use port 8001 instead (in both the command and the link) |
| A list of files instead of the app | The server is not running inside `web\dist` |
| Old version showing | **Ctrl+Shift+R** in Chrome |
| Plain road lines instead of a street map | The map tiles need internet. The app keeps working on its own road lines |
| Link does nothing when clicked | `localhost` only works on the laptop that runs the server, while the terminal is open |

**Optional bundled server:** `pip install -r requirements.txt`, then `python -m uvicorn api.main:app --port 8000` (or double-click `run.bat` / run `./run.sh`). It serves the same app.

---

## Two-minute demo

1. **Start screen.** Point at the red lines: "Every red line is a weak link: one supply line and little or no backup."
2. **Report.** Click **Report an incident** → **Power cut** → tap a blue substation pin → **4 h** → **BESCOM staff** → **Send report**.
3. **Watch.** The timeline plays. Reservoirs and hospitals turn amber, then red. Alert pop-ups go to BESCOM, BWSSB and hospitals.
4. **Act.** In the Alerts panel, click **Respond to all** (within 1 h), then **Replay with responses**.
5. **Result.** "Damage avoided" shows hospitals that fail, hospital-hours lost and the Resilience Index, before and after. Press **G** to flip between the two.
6. **Optional.** Press **1** for the heavy-rain demo, **3** for the city's weakest links, **4** for the best three fixes.

---

## Keyboard shortcuts

| Key | What it does |
|---|---|
| **I** | Report an incident |
| **1** | Heavy rain night: flooded Outer Ring Road zone + rain-damaged power line to TK Halli (illustrative) |
| **2** | Draw a flood: click points on the map, then **Run flood** (or Enter) |
| **3** | Weak links: every facility fails alone, ranked by hospital-hours lost |
| **4** | Fix it: best 3 fixes for the current scenario |
| **F** | Replay the current scenario with the fixes applied |
| **5** | 20-minute power trip at TK Halli (the ~4 h ripple BWSSB describes) |
| **6** | Power line to TK Halli damaged (like Oct 2024) |
| **7** | Illustrative flood zone on the Outer Ring Road |
| **G** | After *Replay with responses*: switch between with and without responses |
| **/** | Search a hospital, substation or reservoir |
| **M** | Switch map: street map → dark street map → satellite → offline road lines |
| **Space** | Play / pause |
| **R** | Reset |
| **Esc** | Close the card / cancel |

Demos 5, 6 and 7 sit under **More** in the side panel.

---

## Reading the map

**Pins**

| Colour | Meaning |
|---|---|
| Blue | Substation (darker blue: 220 kV+ transmission substation) |
| Teal | Water reservoir / tank |
| Green | Hospital |
| Purple | Telecom site (shown when zoomed in) |
| **Amber** | Running on backup (diesel, tank, battery) |
| **Red** | Down: no power or water |

**Links** (the lines show who depends on whom)

| Colour | Meaning |
|---|---|
| **Green: strong** | Two or more supply lines; losing one changes nothing |
| **Yellow: medium** | One supply line, but 6 h or more of its own backup |
| **Red: weak** | One supply line and little or no backup: a single point of failure |

Thicker lines carry more hospitals. Hover a line for details; click it to open the place it feeds. The legend counts the links and shows the share that are weak. Click a legend item to hide that layer.

**Place card** (tap any pin): live status, backup hours, the chain it depends on with the strength of each link, how many hospitals / water facilities / telecom sites it can affect, a satellite close-up of the spot, real photos from Wikimedia Commons when they exist, and **Street View** / **Photos on Google Maps** buttons. Substations have **Simulate power cut** (1-24 h); reservoirs have **Simulate failure**. Every card has a **Report ... here** button.

---

## Report an incident

1. **What happened?** Power cut, Flooding or No water.
2. **Where?** Tap the map. DOMINO snaps to the nearest substation (power cut) or reservoir (no water). For flooding, tap the spot and choose 500 m, 1 km or 2 km wide.
3. **For how long?** 1, 2, 4, 12 or 24 h, or *Not sure* (12 h is assumed).
4. **Who is reporting?** Citizen, BESCOM staff, BWSSB staff or Hospital. Citizen reports are marked *unverified* until BESCOM or BWSSB confirms.
5. **Send report.** The cascade runs immediately and the alerts start.

Reports stay on screen; nothing is sent to anyone yet.

---

## Alerts and response

As a scenario plays, DOMINO raises alerts for the people responsible:

| Who | Alert example | Recommended action |
|---|---|---|
| BESCOM | "Substation X is down. 17 hospitals depend on it." | Prioritise repair |
| BWSSB | "Reservoir Y will run dry at hour 1." | Link to another supply line |
| Hospital | "City water stops at hour 1; your tank lasts until hour 9." | Send water tanker |
| Hospital | "On diesel from hour 0; diesel lasts until hour 12." | Send mobile generator |
| Telecom | "Battery runs out at hour 4." | Send generator |

Each alert has a severity (critical / high / watch) and a countdown. Pop-ups appear on the map; the Alerts panel has a tab per agency. Notifications are simulated (no real SMS or WhatsApp yet).

- **Act** on one alert, or **Respond to all** within 30 min, 1 h, 2 h or 4 h of each alert.
- **Replay with responses** re-runs the city with those actions and shows the damage avoided.
- An action only helps if it lands **before** the facility fails; late actions are marked "too late".

**Response assumptions** (in `web/src/alerts.js`): a tanker service starts 2 h after the request and keeps supplying until city water returns; a mobile generator arrives in 3 h and runs with refuelling; switching a reservoir to another line takes 1 h; a prioritised repair finishes 4 h after dispatch. Enough tankers and generators are assumed.

---

## Weak links, Fix it and the Resilience Index

- **Weak links (3):** fails every facility alone for the default repair time and ranks them by hospital-hours lost. Click a row to simulate that failure.
- **Fix it (4):** for the current scenario, tries a generator (+24 h power), extra hospital water storage (+12 h) or a link to a reservoir on another supply line at every facility that failed; picks the best, applies it and repeats 3 times. **F** replays with the fixes.
- **Resilience Index** = 100 × (1 − hospital-hours lost ÷ (hospitals × 72 h)). 100 means no hospital lost power or water at any point.

---

## How it works

```
OpenStreetMap ──► data_pipeline/fetch_osm.py ──► data/*.geojson
                                                     │
sim/params.json (timings, sources) ─► sim/build_graph.py (dependency graph)
                                                     │
                         api/export_static.py ──► web/dist/data/domino.json
                                                     │
                  browser: web/src/engine.js (simulation, in a Web Worker)
                           web/src/App.jsx  (map, alerts, reports)
```

**Data:** substations, water facilities, hospitals, telecom sites and major roads from OpenStreetMap; the Cauvery pumping chain (TK Halli → Harohalli → Tataguni).

**Graph:** utilities don't publish feeder maps, so links are **inferred from location**:
- substations below 220 kV draw power from the nearest 220 kV+ substation;
- Cauvery water runs in parallel stages I-V through the three pumping stations, each station on its own dedicated power line;
- each city water facility is fed by one stage and takes power from its nearest substation;
- hospitals take water from the nearest water facility and power from the nearest substation (two substations if 200+ beds);
- telecom sites take power from the nearest substation.

**Engine:** a discrete-event simulation. Each facility is **UP**, on **BACKUP** (with a countdown: diesel, tank, battery) or **DOWN**. A facility needs every resource it depends on, from any one of its suppliers. Failures pass along links with real delays: pump restart after a power trip, reservoir refill, repairs. When supply returns at the same moment a backup runs out, supply wins.

The engine exists twice: `sim/engine.py` (Python, tested) and `web/src/engine.js` (browser). `node tools/parity_check.mjs` checks they give identical results.

**Tech stack**

| Part | Built with |
|---|---|
| Web app | React 18, Vite 5 |
| Map | deck.gl 9 (pins, links, tiles), Esri basemaps (keyless) |
| Charts | Recharts |
| Simulation | JavaScript discrete-event engine in a Web Worker |
| Offline | PWA: manifest + service worker (app and viewed map tiles cached) |
| Data pipeline | Python, OSMnx 2, GeoPandas, Shapely |
| Optional server | FastAPI + Uvicorn |

---

## Use the real Bengaluru data

Until you do this, the app runs on a **sample dataset** (yellow SAMPLE badge; place photos show random spots). Needs internet, once:

```powershell
cd "C:\HACKATHON WIN\domino"
pip install -r requirements.txt
python data_pipeline\fetch_osm.py
python api\export_static.py
```

`fetch_osm.py` takes 2-10 minutes and writes `data/facilities.geojson`, `roads.geojson`, `cauvery_chain.csv` and `manifest.json`. `export_static.py` packs everything into `web/dist/data/domino.json`. Refresh the browser; the SAMPLE badge disappears.

Optional: in `data/cauvery_chain.csv`, replace the three pumping-station locations (village centres) with the exact plant locations from Google Maps.

**After the hospital call**, edit `sim/params.json`:
- `hospital_diesel_h`: their diesel backup hours
- `hospital_water_h`: their water storage hours

Change `"source"` to where each number came from (e.g. "Facility manager, <hospital>, 5 Nov 2026"), then run `python api\export_static.py` again and refresh.

The four main assumptions can also be changed live with the sliders under **Assumptions** in the side panel.

---

## Put it online

`web/dist` is a complete static website.

- **Netlify Drop:** go to app.netlify.com/drop, log in, drag the `web\dist` folder onto the page. You get a `.netlify.app` link that works on any phone or laptop (use it for a QR code). If it asks for a password, make the site public in its settings.
- **GitHub Pages / Cloudflare Pages / Vercel:** publish the `web/dist` folder.

On a normal host the street map, satellite view, photos, offline cache and "Add to Home Screen" all work. The claude.ai preview link shows plain road lines and no photos, because claude.ai blocks images from other websites.

---

## Project structure

```
domino/
├── README.md
├── requirements.txt          Python packages (data pull + optional server)
├── run.bat / run.sh          start the optional FastAPI server
├── data_pipeline/
│   └── fetch_osm.py          pull Bengaluru facilities and roads from OpenStreetMap
├── data/
│   └── sample/               clearly labelled sample data (used until the real pull)
├── sim/
│   ├── params.json           every timing and buffer, with label, assumption flag and source
│   ├── build_graph.py        builds the dependency graph from the data
│   ├── engine.py             discrete-event cascade engine + recommender
│   ├── test_engine.py        engine tests (incl. BWSSB 20-min → ~4 h check)
│   └── sample_data.py        generates the sample data
├── api/
│   ├── export_static.py      packs graph + roads into web/dist/data/domino.json
│   ├── main.py               optional FastAPI server
│   └── export_demo.py        saved-results demo mode
├── tools/
│   ├── parity_expected.py    Python reference results
│   └── parity_check.mjs      checks the browser engine matches Python
└── web/
    ├── dist/                 the built app: serve this folder
    ├── public/               manifest, service worker, icons, data/domino.json
    └── src/
        ├── App.jsx           map, side panel, scenarios, playback
        ├── engine.js         browser copy of the engine
        ├── core.js / worker.js / api.js   run the engine in a Web Worker
        ├── alerts.js         alerts and the response model
        ├── AlertsPanel.jsx   alerts panel
        ├── ReportCard.jsx    report-an-incident form
        ├── PlaceUI.jsx       search, place card, photos, map controls
        ├── mapkit.js         pins, link strength, photo helpers
        └── styles.css
```

**Edit the app** (needs Node 18+):
```
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # rebuilds web/dist
```

**Run the tests:**
```
python sim/test_engine.py
python tools/parity_expected.py
node tools/parity_check.mjs
```

---

## Where the numbers come from

All values live in `sim/params.json`, each with its source.

| Parameter | Value | Source |
|---|---|---|
| Pump restart after a power trip | 1 h | BWSSB officials, via Deccan Herald |
| Reservoir refill after supply returns | 3 h | BWSSB officials, via Deccan Herald |
| Reservoir storage without inflow | 1 h | Calibrated so a 20-minute trip gives ~4.3 h of disruption, matching BWSSB's description |
| TK Halli flood repair (Sept 2022) | 36 h | Deccan Herald |
| Cauvery supply stages | I-V | BWSSB scheme, via Deccan Herald |
| Hospital diesel backup | 12 h | **Placeholder until the hospital call** |
| Hospital water storage | 8 h | **Placeholder until the hospital call** |
| Telecom battery | 4 h | Assumption |
| Dual power feed from | 200+ beds | Assumption |
| Default repair time | 12 h | Assumption |
| Response times (tanker, generator, link, repair) | 2 h, 3 h, 1 h, 4 h | Assumptions, shown on screen |

---

## Limits

- **Locations are real** (OpenStreetMap). **Links between facilities are estimated** from location, because BESCOM and BWSSB don't publish feeder or pipe maps. With their data, the same tool becomes exact.
- Hospital backup hours are placeholders until confirmed with a hospital; the sliders show how results change.
- Alerts, reports and responses are simulated; nothing is sent to real people.
- Similar tools exist abroad (One Concern, InfraRisk). DOMINO is built for an Indian city, on Indian public data, around hospitals.
- A map of a city's weak points is sensitive. A real deployment would restrict access to authorised officials.

---

Map data © OpenStreetMap contributors (ODbL). Basemap and imagery: Esri and its data providers (credited on screen). Photos: Wikimedia Commons (author and licence on each file page).
