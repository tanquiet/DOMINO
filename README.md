# DOMINO

**See what fails next, before it happens.**

DOMINO is a live map of how Bengaluru's power, water, hospitals and telecom depend on each other. When something breaks (a power cut, a flooded area, a pumping station that stops), DOMINO plays out hour by hour what fails next, alerts the people responsible before their facility fails, and shows how much damage acting early avoids.

- **Team:** POV
- **Event:** TechXcellence 2026, AIEMS Bengaluru, Smart Cities track (T1)
- **Problem statement:** #6, Urban Infrastructure Dependency Mapping and Cascading Failure Simulation (also covers #24 Water-Energy Nexus and #22 grid cascading failures)

---

## Why DOMINO: every link has already failed in Bengaluru

Every link in DOMINO's failure chain has already broken in real life. Each example below comes from a published report (sources at the end of this section). Where a source is unclear, it says so.

### The five strongest numbers

1. **A 20-minute power cut becomes about 4 hours without water.** Pumps take nearly an hour to restart, then about 3 more hours to refill the city's reservoirs. By then at least 20% of Bengaluru's areas are affected, according to BWSSB officials. ([Deccan Herald](https://www.deccanherald.com/india/karnataka/bengaluru/bwssb-urges-electricity-authorities-for-uninterrupted-power-supply-to-pumping-stations-1213633.html))
2. **About 110 power disruptions hit BWSSB pumping stations in a single three-month summer stretch.** ([Deccan Herald](https://www.deccanherald.com/india/karnataka/bengaluru/bwssb-urges-electricity-authorities-for-uninterrupted-power-supply-to-pumping-stations-1213633.html))
3. **In September 2022, one flooded pumping station cut water to more than 50 areas for two days.** ([Reuters via Malay Mail](https://www.malaymail.com/news/world/2022/09/06/power-cuts-traffic-snarls-as-indias-tech-hub-endures-second-day-of-floods/26757))
4. **One substation fire blacked out nearly 90% of central Bengaluru localities, including Vidhana Soudha.** ([Deccan Herald](https://www.deccanherald.com/india/karnataka/fire-in-220kv-substation-bengaluru-s-power-centres-feel-the-heat-805711.html))
5. **During the 2024 water crisis, Apollo Bannerghatta was buying 40–50 water tankers a day** after its borewells dried up. ([The News Minute](https://www.thenewsminute.com/karnataka/bengaluru-crippling-water-shortage-leaves-hospitals-high-and-dry))

### The failure chains, link by link

**Flood → water pumping (September 2022)**
- Bengaluru's Cauvery water travels about 100 km through three pumping stages: TK Halli, Harohalli and Tataguni. That's one chain with no bypass.
- The TK Halli pumping station flooded with all pumps under 40 feet of water. BWSSB's chairperson called it the first time a pumping station was totally flooded.
- 18 pumps and motors were damaged, costing about ₹3 crore. Standby units were borrowed from the other two stages, and the station was restored in 36 hours against a 7-day estimate.
- The flood rose 1.5 m above the flood level the retaining walls were designed for, so the design assumption itself failed.
- Rainfall that season was 162% above average.

**Flood → power**
- The Kadubeesanahalli power station flooded.
- BESCOM also deliberately cuts power to flooded apartment basements to prevent short circuits.
- So some outages are safety shutdowns, not damage. DOMINO treats both the same way: the supply is gone for a number of hours.

**Power → water (this happens even without floods)**
- **2019:** TK Halli had 14 power disruptions in about two months. Officials said a five-minute cut causes about a half-hour stoppage in pumping. A sudden stop also sends water surging backwards, which can burst pipes.
- **October 2024:** lightning and rain damaged transformers feeding TK Halli and Harohalli, and both stations lost power at about 11 PM.
- **Undated incident (the article gives no date):** an electrical failure at TK Halli and Tataguni stopped pumps for about 8.5 hours.
  - It hit the stages supplying 140 and 320 million litres a day.
  - Affected areas included Hebbal, RT Nagar, Rajajinagar, Yelahanka and Banaswadi.

**Power → hospitals**
- **February 2023:** Bowring and Lady Curzon Hospital lost grid power for about 12 hours after a cable was cut.
  - It ran on its generator, with diesel topped up twice.
  - Some patients moved to Victoria and Vani Vilas hospitals.
  - That diesel buffer is the countdown DOMINO shows on every hospital.
- **The 220 kV substation fire:** load had to be rerouted to a substation at Victoria Hospital. That rerouting is the redundancy DOMINO measures (a strong link).
- **September 2022, Ballari (Karnataka, not Bengaluru):** two ICU patients died during a power cut at VIMS. The opposition said backup power failed; the government disputed that, citing a 1.5-hour backup. The cause is disputed.

**Water → hospitals (2024 crisis)**
- Vydehi Hospital in Whitefield needs 8–10 lakh litres a day. BWSSB supply to its area had stopped, and its borewells were barely coping.
- Tanker prices rose from ₹80 to ₹120 per kilolitre in six months.
- Apollo Bannerghatta was spending ₹30,000–35,000 a day on water.
- In March 2024, BWSSB cut Cauvery supply to bulk consumers, including hospitals, by up to 20%.

**Power → telecom → hospitals**
- NIMHANS and Sanjay Gandhi Institute of Trauma and Orthopaedics lost landlines for two days after power to a BSNL exchange was cut.
- Mobile coverage inside operating theatres and ICUs was poor, so staff used personal phones.
- The report places this in mid-July during the Covid period. The year isn't stated directly.

### Nobody owns the whole chain

These chains cross agency boundaries: BESCOM and KPTCL (power), BWSSB (water), BSNL (telecom) and the hospitals themselves. BWSSB has had to publicly urge the power utilities for uninterrupted supply, and a senior Urban Development official had to chair a meeting to coordinate them. **Nobody owns the whole chain.** That is the gap DOMINO fills.

### Notes on the evidence

- We found no public tool that maps these dependencies for Bengaluru. That isn't proof that none exists.
- We could not verify a typical hospital diesel-backup figure, so DOMINO uses a placeholder until a hospital confirms it.
- Two incidents above have no exact date in the source (the 8.5-hour TK Halli / Tataguni failure and the NIMHANS phone outage).

### Sources

- [Deccan Herald – BWSSB restores flooded TK Halli pumping station in 36 hours](https://www.deccanherald.com/india/karnataka/bengaluru/bengaluru-bbwssb-restores-flooded-tk-halli-pumping-station-in-36-hours-1143174.html)
- [The News Minute – Water supply affected as pumping station flooded](https://www.thenewsminute.com/article/bengaluru-water-supply-be-affected-pumping-station-flooded-list-areas-167547)
- [Reuters via Malay Mail – Power cuts, traffic snarls as tech hub endures second day of floods](https://www.malaymail.com/news/world/2022/09/06/power-cuts-traffic-snarls-as-indias-tech-hub-endures-second-day-of-floods/26757)
- [Deccan Herald – BWSSB urges uninterrupted power to pumping stations](https://www.deccanherald.com/india/karnataka/bengaluru/bwssb-urges-electricity-authorities-for-uninterrupted-power-supply-to-pumping-stations-1213633.html)
- [The News Minute – BWSSB looks to fix power cuts affecting water supply (2019)](https://www.thenewsminute.com/article/bwssb-looks-fix-issue-power-cuts-affecting-water-supply-bengaluru-98091)
- [Asianet Newsable – Rain damages TK Halli transformer (Oct 2024)](https://newsable.asianetnews.com/karnataka-news/bengaluru-water-supply-to-face-disruptions-after-heavy-rainfall-damages-tk-hall-transformer-vkp-skrhq6)
- [Deccan Herald – Snag at TK Halli](https://www.deccanherald.com/india/karnataka/bengaluru/snag-t-k-halli-reservoir-2476944)
- [Deccan Herald – Load shedding hits water supply](https://www.deccanherald.com/india/karnataka/bengaluru/load-shedding-hit-water-supply-2239726)
- [Deccan Herald – Fire in 220 kV substation](https://www.deccanherald.com/india/karnataka/fire-in-220kv-substation-bengaluru-s-power-centres-feel-the-heat-805711.html)
- [Deccan Herald – Techies hit by lengthy unscheduled power cuts](https://www.deccanherald.com/india/karnataka/bengaluru/bengaluru-techies-in-a-quandary-over-lengthy-unscheduled-power-cuts-1142841.html)
- [Public TV – Bowring Hospital without electricity for 12 hours](https://english.publictv.in/patients-at-bowring-hospital-in-bluru-suffer-without-electricity-for-12-hours/)
- [The Hans India – Power outage at VIMS Ballari](https://www.thehansindia.com/karnataka/bengaluru-power-outage-at-hospital-kills-2-patients-761886)
- [The News Minute – Water shortage leaves hospitals high and dry (2024)](https://www.thenewsminute.com/karnataka/bengaluru-crippling-water-shortage-leaves-hospitals-high-and-dry)
- [Down To Earth – BWSSB 20% cut to bulk consumers](https://www.downtoearth.org.in/water/bengaluru-water-crisis-bwssb-announces-20-water-cut-to-bulk-consumers-identifies-areas-bearing-the-brunt-94973)
- [inkl – Two hospitals without phone link for two days](https://www.inkl.com/news/bengaluru-2-hospitals-went-without-phone-link-for-2-days-disrupting-patient-care)

---

## Contents

1. [Why DOMINO](#why-domino-every-link-has-already-failed-in-bengaluru)
2. [What it does](#what-it-does)
3. [Run it (Windows, VS Code)](#run-it-windows-vs-code)
4. [Two-minute demo](#two-minute-demo)
5. [Keyboard shortcuts](#keyboard-shortcuts)
6. [Reading the map](#reading-the-map)
7. [Report an incident](#report-an-incident)
8. [Alerts and response](#alerts-and-response)
9. [Weak links, Fix it and the Resilience Index](#weak-links-fix-it-and-the-resilience-index)
10. [How it works](#how-it-works)
11. [Use the real Bengaluru data](#use-the-real-bengaluru-data)
12. [Put it online](#put-it-online)
13. [Project structure](#project-structure)
14. [Where the numbers come from](#where-the-numbers-come-from)
15. [Limits](#limits)

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
