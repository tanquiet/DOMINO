import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { BitmapLayer, GeoJsonLayer, IconLayer, LineLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { FlyToInterpolator, WebMercatorViewport } from '@deck.gl/core';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { criticality, loadAll, recommend, simulate } from './api.js';
import { MapControls, PlaceCard, SearchBox, upstreamIds, downstream, useSlashFocus } from './PlaceUI.jsx';
import AlertsPanel from './AlertsPanel.jsx';
import AgencyReports from './AgencyReports.jsx';
import ReportCard from './ReportCard.jsx';
import { autoResponses, buildAlerts, responsesToPlan } from './alerts.js';
import { KIND, STATE_COLOR, STRENGTH, buildLinks, escapeHtml, hospitalCounts, layerOf, linkCounts, linkWidth,
  pinAtlas, pinKey, reportScenario, reportTarget } from './mapkit.js';

// ------------------------------------------------------------------ look
const RES_COLOR = { power: [245, 166, 35], water: [34, 211, 238] };
const SLIDERS = [
  ['hospital_diesel_h', 0, 48, 1],
  ['hospital_water_h', 0, 48, 1],
  ['reservoir_storage_h', 0, 6, 0.5],
  ['telecom_battery_h', 0, 12, 1],
];
// Real basemaps (Esri, keyless; credit shown on screen). They need internet: if tiles fail to load,
// the offline OpenStreetMap road lines appear instead, so the demo never goes blank.
const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services';
const BASEMAPS = [
  { id: 'street', label: 'Street map', base: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    credit: 'Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors' },
  { id: 'dark', label: 'Dark street map', base: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    credit: 'Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors' },
  { id: 'satellite', label: 'Satellite', base: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    credit: 'Imagery: Esri, Maxar, Earthstar Geographics' },
  { id: 'off', label: 'Offline road lines', credit: 'Roads © OpenStreetMap contributors' },
];

function tileLayer(id, url, onLoad, opacity = 1) {
  return new TileLayer({
    id, data: url, minZoom: 0, maxZoom: 19, tileSize: 256, maxRequests: 12,
    onTileError: () => {}, onTileLoad: onLoad,
    renderSubLayers: (props) => {
      const [[w, sth], [e, nth]] = props.tile.boundingBox;
      return new BitmapLayer(props, { data: null, image: props.data, bounds: [w, sth, e, nth], opacity });
    },
  });
}

const STATIONS = [
  ['cauvery_tk_halli', 'TK Halli'],
  ['cauvery_harohalli', 'Harohalli'],
  ['cauvery_tataguni', 'Tataguni'],
];

const TELECOM_MIN_ZOOM = 12.5;
const HOSPITAL_PIN_MIN_ZOOM = 12.5;     // further out, 1,000+ hospital pins would hide the map, so they are dots
const PHONE_QUERY = '(max-width: 900px)';   // same breakpoint as styles.css
const fmtH = (h) => (h == null ? '-' : h < 1 ? `${Math.round(h * 60)} min` : `${(Math.round(h * 10) / 10).toString()} h`);

const isTyping = (el) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) && el.type !== 'range';

// state of every touched node at time t
function statesAt(timeline, t) {
  const m = new Map();
  if (!timeline) return m;
  for (const ev of timeline) {
    if (ev.t > t + 1e-9) break;
    m.set(ev.id, ev);
  }
  return m;
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [params, setParams] = useState({});
  const [scenario, setScenario] = useState(null);   // { body, label, note }
  const [result, setResult] = useState(null);
  const [fixed, setFixed] = useState(null);         // { rec, result }
  const [showFixed, setShowFixed] = useState(false);
  const [crit, setCrit] = useState(null);
  const [mode, setMode] = useState('idle');         // idle | draw | weak | fix
  const [drawPts, setDrawPts] = useState([]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  // alerts & response
  const [responses, setResponses] = useState([]);
  const [respResult, setRespResult] = useState(null);
  const [respOutcome, setRespOutcome] = useState({});
  const [showResp, setShowResp] = useState(false);
  const [alertToasts, setAlertToasts] = useState([]);
  const [cutHours, setCutHours] = useState(4);
  const [report, setReport] = useState(null);        // the report being filled in
  const atlas = useMemo(() => pinAtlas(), []);
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const on = (e) => setPhone(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const announcedRef = useRef(new WeakMap());         // simulation result -> alert ids already announced
  const resetResponses = () => {
    setResponses([]); setRespResult(null); setRespOutcome({}); setShowResp(false);
    setAlertToasts([]);
  };
  const [toast, setToast] = useState(null);
  const [viewState, setViewState] = useState(null);
  const [mapStyle, setMapStyle] = useState(0);       // index into BASEMAPS
  const [hidden, setHidden] = useState(() => new Set());   // facility types switched off
  const [tilesOk, setTilesOk] = useState(false);
  const tilesOkRef = useRef(false);
  const onTileLoad = useCallback(() => {
    if (!tilesOkRef.current) { tilesOkRef.current = true; setTilesOk(true); }
  }, []);
  const tRef = useRef(0);
  const [selected, setSelected] = useState(null);   // id of the place card's facility
  const homeRef = useRef(null);
  const searchRef = useRef(null);
  useSlashFocus(searchRef);

  // ---------------------------------------------------------------- load
  useEffect(() => {
    loadAll().then((d) => {
      setData(d);
      const p = {};
      for (const [k] of SLIDERS) p[k] = d.meta.params[k]?.value;
      setParams(p);
      const pts = d.graph.nodes.filter((n) => n.on_map);
      const lons = pts.map((n) => n.lon), lats = pts.map((n) => n.lat);
      const isPhone = window.matchMedia(PHONE_QUERY).matches;
      const w = isPhone ? window.innerWidth : Math.max(window.innerWidth - 410, 400);
      const h = isPhone ? window.innerHeight * 0.62 : window.innerHeight;
      const vp = new WebMercatorViewport({ width: w, height: h }).fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: { top: 70, bottom: 90, left: 40, right: 40 } });
      const home = { longitude: vp.longitude, latitude: vp.latitude, zoom: vp.zoom, pitch: 0, bearing: 0 };
      homeRef.current = home;
      setViewState(home);
      // Arrived from a complaint ("What could fail next?"): start a report at that spot.
      const q = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const lon = Number(q.get('lon')), lat = Number(q.get('lat'));
      if (['power', 'flood', 'water'].includes(q.get('report')) && Number.isFinite(lon) && Number.isFinite(lat)) {
        setMode('report');
        setReport({ kind: q.get('report'), where: { lon, lat }, widthM: 1000, reporter: null });
        setViewState({ ...home, longitude: lon, latitude: lat, zoom: Math.max(home.zoom, 13) });
      }
    }).catch((e) => setError(e.message));
  }, []);

  const nodesById = useMemo(() => {
    const m = new Map();
    data?.graph.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [data]);
  const { depsOf, dependentsOf } = useMemo(() => {
    const dOf = new Map(), depd = new Map();
    for (const e of data?.graph.edges || []) {
      if (!dOf.has(e.to)) dOf.set(e.to, []);
      let g = dOf.get(e.to).find((x) => x.resource === e.resource);
      if (!g) { g = { resource: e.resource, providers: [] }; dOf.get(e.to).push(g); }
      g.providers.push(e.from);
      if (!depd.has(e.from)) depd.set(e.from, []);
      depd.get(e.from).push(e.to);
    }
    return { depsOf: dOf, dependentsOf: depd };
  }, [data]);
  const mapNodes = useMemo(() => (data ? data.graph.nodes.filter((n) => n.on_map) : []), [data]);
  const visibleNodes = useMemo(() => mapNodes.filter((n) => !hidden.has(layerOf(n.kind))), [mapNodes, hidden]);
  const defaults = data?.meta.params || {};
  const hospitalsBelow = useMemo(() => hospitalCounts(nodesById, dependentsOf), [nodesById, dependentsOf]);
  const links = useMemo(() => buildLinks(nodesById, depsOf, hospitalsBelow, params), [nodesById, depsOf, hospitalsBelow, params]);
  const linkTally = useMemo(() => linkCounts(links), [links]);
  const visibleLinks = useMemo(() => links.filter((l) => !hidden.has(l.strength)
    && !hidden.has(layerOf(nodesById.get(l.from).kind)) && !hidden.has(layerOf(nodesById.get(l.to).kind))),
  [links, hidden, nodesById]);
  const horizon = result?.horizon_h || defaults.horizon_h?.value || 72;

  const toggleHidden = (k) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  // ---------------------------------------------------------------- run
  const run = useCallback(async (sc, opts = {}) => {
    if (!sc) return;
    setBusy(true);
    try {
      const r = await simulate({ ...sc.body, params });
      setScenario(sc);
      setResult(r);
      setFixed(null);
      setShowFixed(false);
      resetResponses();
      if (!opts.keepMode) setMode('idle');
      setT(0); tRef.current = 0;
      setPlaying(true);
      setReport(null);
      return true;
    } catch (e) {
      flash(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [params]);

  const preset = useCallback((key) => {
    const s = data?.meta.scenarios[key];
    if (s) run({ body: { scenario: key }, label: s.label, note: s.note, key });
  }, [data, run]);

  const heavyRain = useCallback(() => {
    const rep = data?.meta.params.default_repair_h?.value ?? 12;
    run({ body: { scenario: 'orr_flood', failures: [{ id: 'feeder_cauvery_tk_halli', repair_h: rep, reason: 'rain damaged the power line' }] },
      label: 'Heavy rain night', key: 'heavy_rain',
      note: 'Flooded Outer Ring Road zone plus a rain-damaged power line to TK Halli (like Oct 2024). Illustrative combination.' });
  }, [data, run]);

  const runFix = useCallback(async () => {
    if (!scenario) { flash('Run a scenario first (press 1).'); return; }
    setBusy(true);
    try {
      const rec = await recommend({ ...scenario.body, params, budget: 3 });
      if (!rec.plan?.length) { flash('No single fix improves this scenario.'); setBusy(false); return; }
      const r2 = await simulate({ ...scenario.body, params, interventions: rec.interventions });
      setFixed({ rec, result: r2 });
      setShowFixed(false);
      setShowResp(false);
      setMode('fix');
    } catch (e) { flash(e.message); } finally { setBusy(false); }
  }, [scenario, params]);

  const runWeak = useCallback(async () => {
    setBusy(true);
    setAlertToasts([]);
    try {
      const c = await criticality({ params });
      setCrit(c.ranking);
      setMode('weak');
      setPlaying(false);
    } catch (e) { flash(e.message); } finally { setBusy(false); }
  }, [params]);

  const finishDraw = useCallback(() => {
    if (drawPts.length < 3) { flash('Click at least 3 points on the map, then press Enter.'); return; }
    run({ body: { polygon: drawPts }, label: 'Flood: area you drew', note: 'Substations, reservoirs and telecom sites inside the area fail for the default repair time.', polygon: drawPts });
    setDrawPts([]);
  }, [drawPts, run]);

  // re-run the current scenario when an assumption slider moves (debounced)
  const firstParams = useRef(true);
  useEffect(() => {
    if (firstParams.current) { firstParams.current = false; return; }
    setCrit(null);
    const id = setTimeout(async () => {
      if (mode === 'weak') { runWeak(); return; }
      if (!scenario) return;
      try {
        const r = await simulate({ ...scenario.body, params });
        setResult(r);
        setFixed(null);
        setShowFixed(false);
        if (mode === 'fix') setMode('idle');       // the fixes were for the old numbers
        resetResponses();
        setT(horizon); tRef.current = horizon;
        setPlaying(false);
      } catch (e) { flash(e.message); }
    }, 300);
    return () => clearTimeout(id);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- playback
  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000; last = now;
      // slow while the cascade unfolds (first 12 h), faster afterwards
      const rate = tRef.current < 12 ? 1.5 : 5;   // simulated hours per real second
      const next = Math.min(tRef.current + dt * rate, horizon);
      tRef.current = next; setT(next);
      if (next >= horizon) { setPlaying(false); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, horizon]);

  const replay = () => { setT(0); tRef.current = 0; setPlaying(true); };
  const togglePlay = () => {
    if (!result) return;
    if (t >= horizon) { setT(0); tRef.current = 0; }
    setPlaying((p) => !p);
  };
  const toggleFixed = () => { setShowResp(false); setShowFixed((v) => !v); replay(); };
  const toggleResp = () => { setShowFixed(false); setShowResp((v) => !v); replay(); };
  const resetAll = () => {
    setResult(null); setScenario(null); setFixed(null); setShowFixed(false); setMode('idle');
    setT(0); tRef.current = 0; setPlaying(false); setDrawPts([]); setReport(null); setSelected(null);
    resetResponses();
  };
  const toggleDraw = () => { setReport(null); setMode((m) => (m === 'draw' ? 'idle' : 'draw')); setDrawPts([]); };
  const openReport = (preset = {}) => {
    setPlaying(false); setDrawPts([]); setSelected(null); setMode('report');
    setReport({ kind: null, where: null, widthM: 1000, reporter: null, ...preset });
  };
  const closeReport = () => { setReport(null); setMode('idle'); };
  const stepBack = () => {
    setDrawPts([]);
    if (mode !== 'idle') { setReport(null); setMode('idle'); } else setSelected(null);
  };

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    const onKey = (e) => {
      // leave browser shortcuts alone (Ctrl+R, Ctrl+1, ...) and let text fields type
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.target.type === 'range' && e.key.startsWith('Arrow')) return;
      const k = e.key.toLowerCase();
      if (k === '1') heavyRain();
      else if (k === '2') toggleDraw();
      else if (k === '3') runWeak();
      else if (k === '4') runFix();
      else if (k === '5') preset('tk_halli_trip');
      else if (k === '6') preset('tk_halli_feeder');
      else if (k === '7') preset('orr_flood');
      else if (k === '8') preset('tk_halli_2022');
      else if (k === 'i') { if (mode === 'report') closeReport(); else openReport(); }
      else if (k === 'g' && respResult) toggleResp();
      else if (k === 'enter' && mode === 'draw') finishDraw();
      else if (k === 'escape') stepBack();
      else if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (k === 'f' && fixed) toggleFixed();
      else if (k === 'm') setMapStyle((m) => (m + 1) % BASEMAPS.length);
      else if (k === 'r') resetAll();
      else if (k === 'c') window.location.hash = '#/citizen';
      else if (k === 'h') window.location.hash = '#/help';
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------------------------------------------------------- derived
  const shown = mode === 'weak' ? null : (showResp && respResult ? respResult : (showFixed && fixed ? fixed.result : result));
  const alerts = useMemo(() => buildAlerts(result, nodesById, dependentsOf, depsOf, params), [result, nodesById, dependentsOf, depsOf, params]);
  const reportNow = useMemo(() => (report ? reportTarget(report, nodesById) : null), [report, nodesById]);

  // pop-up notifications as alerts are raised during playback
  useEffect(() => {
    if (!result || showResp || showFixed || mode === 'weak') return;
    if (!announcedRef.current.has(result)) announcedRef.current.set(result, new Set());
    const announced = announcedRef.current.get(result);
    const fresh = alerts.filter((a) => a.hitAt <= t + 1e-9 && a.severity !== 'watch' && !announced.has(a.id));
    if (!fresh.length) return;
    fresh.forEach((a) => announced.add(a.id));
    if (!playing) return;
    const groups = new Map();
    for (const a of fresh) { if (!groups.has(a.agency)) groups.set(a.agency, []); groups.get(a.agency).push(a); }
    const items = [...groups].map(([agency, list]) => ({
      id: `${agency}-${list[0].id}-${Math.round(t * 100)}`, agency, forResult: result,
      text: list.length === 1 ? list[0].title : `${list.length} new alerts · ${list[0].title}`,
      critical: list.some((x) => x.severity === 'critical'),
    }));
    setAlertToasts((prev) => [...items, ...prev].slice(0, 4));
    items.forEach((it) => setTimeout(() => setAlertToasts((prev) => prev.filter((x) => x.id !== it.id)), 5000));
  }, [t, alerts, result, showResp, showFixed, mode, playing]);
  const liveToasts = alertToasts.filter((a) => a.forResult === result);
  const now = useMemo(() => statesAt(shown?.timeline, t), [shown, t]);
  const forcedIds = useMemo(() => new Set((shown?.failures || []).map((f) => f.id)), [shown]);
  const critById = useMemo(() => {
    const m = new Map();
    (crit || []).forEach((c) => m.set(c.id, c));
    return m;
  }, [crit]);
  const critMax = Math.max(1, ...(crit || []).map((c) => c.impact_hospital_hours));
  const fixIds = useMemo(() => new Set((fixed?.rec.interventions || []).map((i) => i.node_id)), [fixed]);
  const hospitalsNow = useMemo(() => {
    if (!shown) return { down: 0, backup: 0 };
    let down = 0, backup = 0;
    for (const [id, ev] of now) {
      if (nodesById.get(id)?.kind !== 'hospital') continue;
      if (ev.state === 'DOWN') down++; else if (ev.state === 'BACKUP') backup++;
    }
    return { down, backup };
  }, [now, shown, nodesById]);

  const activeEdges = useMemo(() => {
    if (!data || !shown) return [];
    const out = [];
    for (const e of data.graph.edges) {
      const from = nodesById.get(e.from), to = nodesById.get(e.to);
      if (!from?.on_map || !to?.on_map) continue;
      if (hidden.has(layerOf(from.kind)) || hidden.has(layerOf(to.kind))) continue;
      if (now.get(e.from)?.state === 'DOWN' && now.get(e.to)) out.push({ ...e, a: [from.lon, from.lat], b: [to.lon, to.lat] });
    }
    return out;
  }, [data, shown, now, nodesById, hidden]);

  const chartData = useMemo(() => {
    if (!result) return [];
    const s = result.series, f = fixed?.result.series, g = respResult?.series;
    return s.t.map((tt, i) => ({
      t: tt,
      down: s.hospital_down?.[i] ?? 0,
      backup: s.hospital_backup?.[i] ?? 0,
      fixedDown: f ? f.hospital_down?.[i] ?? 0 : undefined,
      respDown: g ? g.hospital_down?.[i] ?? 0 : undefined,
    }));
  }, [result, fixed, respResult]);

  const flyTo = useCallback((lon, lat, zoom) => {
    setViewState((v) => ({ ...v, longitude: lon, latitude: lat, zoom, transitionDuration: 1100,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }) }));
  }, []);
  const zoomBy = (dz) => setViewState((v) => ({ ...v, zoom: Math.max(8, Math.min(18, v.zoom + dz)), transitionDuration: 250 }));
  const goHome = () => homeRef.current && setViewState({ ...homeRef.current, transitionDuration: 900, transitionInterpolator: new FlyToInterpolator() });
  const pickPlace = useCallback((n) => {
    setSelected(n.id);
    if (n.on_map !== false) flyTo(n.lon, n.lat, Math.max(viewState?.zoom || 12, 13.6));
  }, [flyTo, viewState]);

  // supply chain of the selected facility, drawn on the map
  const chainEdges = useMemo(() => {
    if (!selected || !data) return [];
    const ups = upstreamIds(selected, depsOf);
    const downs = nodesById.get(selected)?.kind === 'hospital' ? new Set() : downstream(selected, dependentsOf);
    const out = [];
    for (const e of data.graph.edges) {
      const a = nodesById.get(e.from), b = nodesById.get(e.to);
      if (!a?.on_map || !b?.on_map) continue;
      const up = (e.to === selected || ups.has(e.to)) && ups.has(e.from);
      const dn = (e.from === selected || downs.has(e.from)) && downs.has(e.to);
      if (up || dn) out.push({ a: [a.lon, a.lat], b: [b.lon, b.lat], resource: e.resource, up });
    }
    return out;
  }, [selected, data, depsOf, dependentsOf, nodesById]);

  const polygon = report ? reportNow?.polygon
    : scenario?.polygon || (['orr_flood', 'heavy_rain'].includes(scenario?.key) ? data?.meta.orr_flood_polygon : null);
  const reportPin = report?.where || scenario?.report?.where || null;
  const zoom = viewState?.zoom || 0;
  const pinScale = zoom < 10.5 ? 0.6 : zoom < 12 ? 0.75 : zoom < 13.5 ? 0.9 : 1;
  const hospitalDots = useMemo(() => {
    const rank = (n) => ({ DOWN: 2, BACKUP: 1 }[now.get(n.id)?.state] || 0);
    return visibleNodes.filter((n) => n.kind === 'hospital').sort((a, b) => rank(a) - rank(b));
  }, [visibleNodes, now]);
  const pinNodes = useMemo(() => {
    const on = visibleNodes.filter((n) => (n.kind !== 'telecom' || zoom >= TELECOM_MIN_ZOOM || now.get(n.id)?.state === 'DOWN')
      && (n.kind !== 'hospital' || zoom >= HOSPITAL_PIN_MIN_ZOOM));
    // draw big things and failing things on top of the rest
    const rank = (n) => (now.get(n.id)?.state === 'DOWN' ? 3 : now.get(n.id)?.state === 'BACKUP' ? 2 : n.kind === 'hospital' ? 1 : 0);
    return [...on].sort((a, b) => rank(a) - rank(b));
  }, [visibleNodes, zoom, now]);

  // ---------------------------------------------------------------- layers
  const layers = data ? [
    BASEMAPS[mapStyle].base && tileLayer(`base-${BASEMAPS[mapStyle].id}`, BASEMAPS[mapStyle].base, onTileLoad,
      BASEMAPS[mapStyle].id === 'satellite' ? 0.75 : 1),
    BASEMAPS[mapStyle].labels && tileLayer(`labels-${BASEMAPS[mapStyle].id}`, BASEMAPS[mapStyle].labels, onTileLoad, 0.9),
    new GeoJsonLayer({
      id: 'roads', visible: !BASEMAPS[mapStyle].base || !tilesOk, data: data.roads, stroked: true, filled: false, pickable: false,
      lineWidthUnits: 'pixels',
      getLineWidth: (f) => (['motorway', 'trunk'].includes(f.properties?.highway) ? 1.6 : 0.8),
      getLineColor: (f) => (['motorway', 'trunk'].includes(f.properties?.highway) ? [70, 84, 100, 220] : [48, 58, 70, 200]),
    }),
    polygon && new PolygonLayer({
      id: 'flood', data: [{ polygon }], getPolygon: (d) => d.polygon,
      getFillColor: [37, 99, 235, 60], getLineColor: [96, 165, 250, 200], lineWidthMinPixels: 1.5,
    }),
    mode === 'draw' && drawPts.length > 0 && new PolygonLayer({
      id: 'drawing', data: [{ polygon: drawPts }], getPolygon: (d) => d.polygon,
      getFillColor: [37, 99, 235, 50], getLineColor: [147, 197, 253, 255], lineWidthMinPixels: 2,
    }),
    new LineLayer({
      id: 'strength-links', data: visibleLinks, pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 160],
      getSourcePosition: (d) => d.a, getTargetPosition: (d) => d.b, widthUnits: 'pixels',
      getColor: (d) => [...STRENGTH[d.strength].color, shown ? 45 : mode === 'weak' ? 70 : 175],
      getWidth: (d) => linkWidth(d.hospitals),
      updateTriggers: { getColor: [!!shown, mode] },
    }),
    new LineLayer({
      id: 'links', data: activeEdges, getSourcePosition: (d) => d.a, getTargetPosition: (d) => d.b,
      getColor: (d) => [...(RES_COLOR[d.resource] || [200, 200, 200]), 220], getWidth: 2.2, widthUnits: 'pixels',
    }),
    fixed && new LineLayer({
      id: 'fix-links',
      data: fixed.rec.interventions.filter((i) => i.type === 'interconnect' && nodesById.get(i.provider))
        .map((i) => ({ a: nodesById.get(i.provider), b: nodesById.get(i.node_id) })),
      getSourcePosition: (d) => [d.a.lon, d.a.lat], getTargetPosition: (d) => [d.b.lon, d.b.lat],
      getColor: [45, 212, 191, 255], getWidth: 3, widthUnits: 'pixels',
    }),
    chainEdges.length > 0 && new LineLayer({
      id: 'chain', data: chainEdges, getSourcePosition: (d) => d.a, getTargetPosition: (d) => d.b,
      getColor: (d) => (d.up ? [255, 255, 255, 230] : [...(RES_COLOR[d.resource] || [200, 200, 200]), 110]),
      getWidth: (d) => (d.up ? 2.5 : 1.2), widthUnits: 'pixels',
    }),
    new ScatterplotLayer({
      id: 'rings', data: visibleNodes.filter((n) => fixIds.has(n.id) || (now.get(n.id) && now.get(n.id).state !== 'UP'
        && (n.kind !== 'hospital' || zoom >= HOSPITAL_PIN_MIN_ZOOM))),
      getPosition: (n) => [n.lon, n.lat], filled: false, stroked: true, lineWidthUnits: 'pixels',
      getLineWidth: (n) => (fixIds.has(n.id) ? 3 : 1.5),
      getRadius: 500, radiusMinPixels: 11, radiusMaxPixels: 26,
      getLineColor: (n) => (fixIds.has(n.id) ? [45, 212, 191, 255]
        : [...(STATE_COLOR[now.get(n.id)?.state] || [255, 255, 255]), 170]),
      updateTriggers: { getLineColor: [now, fixIds], getLineWidth: [fixIds] },
    }),
    zoom < HOSPITAL_PIN_MIN_ZOOM && new ScatterplotLayer({
      id: 'hospital-dots', data: hospitalDots, pickable: true, getPosition: (n) => [n.lon, n.lat], radiusUnits: 'pixels',
      getRadius: (n) => (now.get(n.id)?.state === 'DOWN' ? 4.5 : 3.5), stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1, getLineColor: [255, 255, 255, 230],
      getFillColor: (n) => [...(STATE_COLOR[now.get(n.id)?.state] || KIND.hospital.color), 255],
      updateTriggers: { getRadius: [now], getFillColor: [now] },
    }),
    new IconLayer({
      id: 'pins', data: pinNodes, pickable: true, iconAtlas: atlas.url, iconMapping: atlas.mapping,
      getPosition: (n) => [n.lon, n.lat], sizeUnits: 'pixels', sizeScale: pinScale,
      getIcon: (n) => {
        const st = now.get(n.id)?.state;
        return pinKey(n.kind, st || (mode === 'weak' && critById.has(n.id) ? 'DOWN' : null));
      },
      getSize: (n) => {
        const base = KIND[n.kind]?.size || 24;
        if (mode === 'weak' && critById.has(n.id)) return base * (1.2 + 1.3 * critById.get(n.id).impact_hospital_hours / critMax);
        return base;
      },
      getColor: (n) => [255, 255, 255, now.get(n.id) || !shown ? 255 : 165],
      updateTriggers: { getIcon: [now, mode, critById], getSize: [mode, critById], getColor: [now, !!shown] },
    }),
    reportPin && new IconLayer({
      id: 'report-pin', data: [reportPin], iconAtlas: atlas.url, iconMapping: atlas.mapping, sizeUnits: 'pixels',
      getPosition: (d) => [d.lon, d.lat], getIcon: () => 'report', getSize: 38,
    }),
    reportNow?.node && new ScatterplotLayer({
      id: 'report-target', data: [reportNow.node], getPosition: (n) => [n.lon, n.lat], filled: false, stroked: true,
      getLineColor: [17, 24, 39, 255], lineWidthUnits: 'pixels', getLineWidth: 3, getRadius: 500, radiusMinPixels: 15, radiusMaxPixels: 30,
    }),
    selected && nodesById.get(selected)?.on_map && new ScatterplotLayer({
      id: 'selected', data: [nodesById.get(selected)], getPosition: (n) => [n.lon, n.lat],
      filled: false, stroked: true, getLineColor: [255, 255, 255, 255], lineWidthUnits: 'pixels', getLineWidth: 3,
      getRadius: 500, radiusMinPixels: 13, radiusMaxPixels: 30,
    }),
    new TextLayer({
      id: 'labels',
      data: visibleNodes.filter((n) => n.id === selected || (n.kind === 'hospital' && (viewState?.zoom || 0) >= 13.2)),
      getPosition: (n) => [n.lon, n.lat], getText: (n) => n.name, getSize: (n) => (n.id === selected ? 14 : 11.5),
      getColor: (n) => (n.id === selected ? [255, 255, 255, 255] : [214, 222, 230, 230]),
      getPixelOffset: [0, -38], fontFamily: '-apple-system, Segoe UI, Roboto, Arial, sans-serif', fontWeight: 600,
      background: true, getBackgroundColor: [11, 15, 20, 190], backgroundPadding: [4, 2],
      characterSet: 'auto', billboard: true, updateTriggers: { getSize: [selected], getColor: [selected] },
    }),
  ].filter(Boolean) : [];

  const onClick = (info) => {
    if (mode === 'draw') {
      if (info.coordinate) setDrawPts((p) => [...p, [info.coordinate[0], info.coordinate[1]]]);
      return;
    }
    if (mode === 'report') {
      if (info.coordinate) setReport((r) => ({ ...r, where: { lon: info.coordinate[0], lat: info.coordinate[1] } }));
      return;
    }
    const o = info.object;
    if (o?.isLink) { pickPlace(nodesById.get(o.to)); return; }   // a line opens the place it feeds
    setSelected(o && o.kind ? o.id : null);
  };
  const sendReport = async () => {
    const sc = reportScenario(report, reportNow, defaults.default_repair_h?.value ?? 12);
    if (await run(sc)) flash(sc.report.verified ? 'Report sent. Running the cascade.' : 'Report sent, marked unverified. Running the cascade.');
  };
  const confirmReport = () => setScenario((s) => ({ ...s, report: { ...s.report, verified: true } }));
  const failSelected = () => {
    const n = nodesById.get(selected);
    if (!n) return;
    const isPower = ['substation', 'substation_tx', 'feeder'].includes(n.kind);
    const rep = isPower ? cutHours : (defaults.default_repair_h?.value ?? 12);
    run({ body: { failures: [{ id: n.id, repair_h: rep, reason: isPower ? `power cut (${rep} h)` : 'failed' }] },
      label: isPower ? `Power cut: ${n.name}` : `Failure: ${n.name}`,
      note: isPower ? `No power for ${rep} h, then restored. Watch the alerts.` : `Fails for ${rep} h, then is repaired.` });
  };
  const actOn = (a) => setResponses((rs) => (rs.some((r) => r.alertId === a.id) ? rs
    : [...rs, { alertId: a.id, at: Math.max(tRef.current, a.hitAt) }]));
  const respondAll = (delay) => { setResponses(autoResponses(alerts, delay)); setRespResult(null); setRespOutcome({}); };
  const replayResponses = async () => {
    if (!scenario || !responses.length || !result) return;
    setBusy(true);
    try {
      const plan = responsesToPlan(alerts, responses, result.failures || []);
      const r2 = await simulate({ ...scenario.body, params, interventions: plan.interventions, repair_overrides: plan.repair_overrides });
      setRespResult(r2); setRespOutcome(plan.outcome); setShowResp(true);
      setT(0); tRef.current = 0; setPlaying(true);
    } catch (e) { flash(e.message); } finally { setBusy(false); }
  };

  const tooltip = ({ object: n }) => {
    if (mode === 'report' || mode === 'draw') return null;
    const tipStyle = { background: '#11161d', color: '#e6edf3', border: '1px solid #2a3542', borderRadius: '8px', fontSize: '12px', padding: '8px 10px', maxWidth: '280px' };
    if (n?.isLink) {
      const lines = n.providers === 1 ? '1 supply line' : `${n.providers} supply lines`;
      return { html: `<b>${STRENGTH[n.strength].label} ${n.resource} link</b><br/>${escapeHtml(n.fromName)} → ${escapeHtml(n.toName)}<br/><span style="opacity:.75">${lines}, ${fmtH(n.backupH)} of backup · carries ${n.hospitals} hospital${n.hospitals === 1 ? '' : 's'}</span>`, style: tipStyle };
    }
    if (!n || !n.kind) return null;
    const ev = now.get(n.id);
    const status = ev ? `${ev.state === 'DOWN' ? 'DOWN' : 'ON BACKUP'} - ${ev.reason}` : 'Working';
    const extra = n.kind === 'hospital' ? `<br/>Backup: diesel ${fmtH(n.buffers.power)}, water ${fmtH(n.buffers.water)}` : '';
    return { html: `<b>${escapeHtml(n.name)}</b><br/><span style="opacity:.7">${KIND[n.kind]?.label || n.kind}</span><br/>${status}${extra}`, style: tipStyle };
  };

  // ---------------------------------------------------------------- render
  if (error) return <div className="splash"><h1>DOMINO</h1><p className="err">{error}</p></div>;
  if (!data || !viewState) return <div className="splash"><h1>DOMINO</h1><p>Loading Bengaluru…</p></div>;

  const info = data.meta.info;
  const reportCard = report && (
    <ReportCard report={report} target={reportNow} busy={busy} assumedHours={defaults.default_repair_h?.value ?? 12}
      onChange={(patch) => setReport((r) => ({ ...r, ...patch }))} onSend={sendReport} onCancel={closeReport} />
  );
  const hosp = shown?.hospitals || [];
  const firstDown = shown?.first_hospital_down_h;
  // Resilience index: share of all hospital-hours (every hospital x simulation length) that keep power and water.
  const hospTotal = info.counts.hospital || 1;
  const resilience = (impact) => Math.max(0, 100 * (1 - impact / (hospTotal * horizon)));
  const fmtRI = (impact) => resilience(impact).toFixed(1);

  return (
    <div className="app">
      <div className="map">
        <DeckGL viewState={viewState} onViewStateChange={({ viewState: v }) => setViewState(v)}
          controller={{ doubleClickZoom: mode !== 'draw' }} layers={layers} onClick={onClick} getTooltip={tooltip} pickingRadius={5}
          getCursor={({ isDragging, isHovering }) => (mode === 'draw' || mode === 'report' ? 'crosshair' : isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')} />

        <div className="leftcol">
          {info.is_sample && <div className="brand"><div className="badge warn">SAMPLE DATA - not real Bengaluru</div></div>}
          <SearchBox nodes={data.graph.nodes} onPick={pickPlace} inputRef={searchRef} />
          {report && !phone && reportCard}
          <PlaceCard node={selected && !report ? nodesById.get(selected) : null} nodesById={nodesById} depsOf={depsOf} isSample={info.is_sample}
            dependentsOf={dependentsOf} status={selected ? now.get(selected) : null}
            hospitalRow={selected ? (shown?.hospitals || []).find((h) => h.id === selected) : null}
            params={params} repairH={defaults.default_repair_h?.value ?? 12} busy={busy}
            onClose={() => setSelected(null)} onFail={failSelected} cutHours={cutHours} onCutHours={setCutHours} onReport={openReport}
            onZoom={() => { const n = nodesById.get(selected); if (n) flyTo(n.lon, n.lat, 15); }} />
        </div>
        <MapControls onZoomIn={() => zoomBy(1)} onZoomOut={() => zoomBy(-1)} onHome={goHome}
          nextLabel={BASEMAPS[(mapStyle + 1) % BASEMAPS.length].label}
          onStyle={() => setMapStyle((m) => (m + 1) % BASEMAPS.length)} />

        {mode === 'weak' && (
          <div className="scenario">
            <div className="sc-label">City's weakest links</div>
            <div className="sc-note">Bigger red circle = more hospital-hours lost if it fails. Pumping stations are listed on the right.</div>
          </div>
        )}
        {scenario && mode !== 'weak' && (
          <div className="scenario">
            <div className="sc-label">{showResp ? 'WITH RESPONSES - ' : showFixed ? 'WITH FIXES - ' : ''}{scenario.label}</div>
            {scenario.note && <div className="sc-note">{scenario.note}</div>}
            {scenario.report && (
              <div className={`sc-report ${scenario.report.verified ? 'ok' : 'unverified'}`}>
                Reported by {scenario.report.reporter} · {scenario.report.verified ? 'verified' : 'unverified'}
                {!scenario.report.verified && <button onClick={confirmReport}>BESCOM / BWSSB confirms</button>}
              </div>
            )}
          </div>
        )}
        {mode === 'draw' && (
          <div className="hint">
            <span>Tap points to outline the flooded area ({drawPts.length})</span>
            <button onClick={finishDraw} disabled={drawPts.length < 3}>Run flood <kbd>Enter</kbd></button>
            <button className="ghost" onClick={() => { setMode('idle'); setDrawPts([]); }}>Cancel</button>
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}
        {liveToasts.length > 0 && (
          <div className="alert-toasts" aria-live="polite">
            {liveToasts.map((a) => (
              <div key={a.id} className={`atoast ${a.critical ? 'critical' : ''}`}>
                <span className="atoast-to">Alert to {a.agency === 'Hospital' ? 'hospital' : a.agency}</span>
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="legend">
          {['substation', 'reservoir', 'hospital', 'telecom'].map((k) => (
            <button key={k} className={`layer ${hidden.has(k) ? 'off' : ''}`} aria-pressed={!hidden.has(k)} title={k === 'telecom' ? 'Show or hide this layer (telecom sites appear when zoomed in)' : 'Show or hide this layer'}
              onClick={() => toggleHidden(k)}>
              <i style={{ background: `rgb(${KIND[k].color.join(',')})` }} />{KIND[k].label.split(' (')[0]}
            </button>
          ))}
          <span><i style={{ background: `rgb(${STATE_COLOR.BACKUP.join(',')})` }} />On backup</span>
          <span><i style={{ background: `rgb(${STATE_COLOR.DOWN.join(',')})` }} />Down</span>
          <div className="legend-links">
            <span className="ll-title">{linkTally.total} links · <b>{linkTally.weakPct}% weak</b></span>
            {['weak', 'medium', 'strong'].map((k) => (
              <button key={k} className={`layer ${hidden.has(k) ? 'off' : ''}`} aria-pressed={!hidden.has(k)} title={STRENGTH[k].hint} onClick={() => toggleHidden(k)}>
                <em style={{ background: `rgb(${STRENGTH[k].color.join(',')})` }} />{STRENGTH[k].label} {linkTally[k]}
              </button>
            ))}
          </div>
          <span className="attr">{BASEMAPS[mapStyle].base && !tilesOk ? 'Map offline - showing OpenStreetMap road lines' : BASEMAPS[mapStyle].credit}
            <button className="mapswitch" onClick={() => setMapStyle((m) => (m + 1) % BASEMAPS.length)}><kbd>M</kbd> {BASEMAPS[(mapStyle + 1) % BASEMAPS.length].label.toLowerCase()}</button></span>
        </div>

        <div className="legend-mini">
          <span><i style={{ background: `rgb(${STATE_COLOR.BACKUP.join(',')})` }} />On backup</span>
          <span><i style={{ background: `rgb(${STATE_COLOR.DOWN.join(',')})` }} />Down</span>
          <span><b>{linkTally.weakPct}%</b> of links weak</span>
          <button className="mapswitch" onClick={() => setMapStyle((m) => (m + 1) % BASEMAPS.length)}>Map: {BASEMAPS[mapStyle].label}</button>
          <span className="credit">{BASEMAPS[mapStyle].base && tilesOk ? BASEMAPS[mapStyle].credit : 'Roads © OpenStreetMap contributors'}</span>
        </div>

        <div className="timeline">
          <button className="play" onClick={togglePlay} disabled={!result} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <input type="range" aria-label="Simulation hour" min={0} max={horizon} step={0.25} value={t} disabled={!result}
            onChange={(e) => { const v = +e.target.value; setT(v); tRef.current = v; setPlaying(false); }} />
          <div className="clock">Hour <b>{t.toFixed(1)}</b></div>
        </div>
      </div>

      <aside className="panel">
        <button className={`report-cta ${mode === 'report' ? 'on' : ''}`} onClick={() => (mode === 'report' ? closeReport() : openReport())} disabled={busy}>
          <kbd>I</kbd>Report an incident
        </button>
        <div className="keys">
          <button onClick={heavyRain} disabled={busy}><kbd>1</kbd>Heavy rain</button>
          <button onClick={toggleDraw} className={mode === 'draw' ? 'on' : ''} disabled={busy}><kbd>2</kbd>Draw flood</button>
          <button onClick={runWeak} className={mode === 'weak' ? 'on' : ''} disabled={busy}><kbd>3</kbd>Weak links</button>
          <button onClick={runFix} className={mode === 'fix' ? 'on' : ''} disabled={busy || !scenario}><kbd>4</kbd>Fix it</button>
        </div>
        {report && phone && reportCard}
        <details className="more">
          <summary>More</summary>
          <div className="keys small">
            <button onClick={() => preset('tk_halli_trip')} disabled={busy}><kbd>5</kbd>20-min trip</button>
            <button onClick={() => preset('tk_halli_feeder')} disabled={busy}><kbd>6</kbd>Power line</button>
            <button onClick={() => preset('orr_flood')} disabled={busy}><kbd>7</kbd>ORR flood</button>
            <button onClick={() => preset('tk_halli_2022')} disabled={busy}><kbd>8</kbd>Replay 2022</button>
          </div>
        </details>

        {!result && mode !== 'weak' && (
          <div className="intro">
            <p><b>{info.counts.hospital}</b> hospitals, <b>{info.counts.substation + info.counts.substation_tx}</b> substations, <b>{info.counts.reservoir}</b> water facilities and <b>{info.counts.telecom}</b> telecom sites.</p>
            <p><b>{linkTally.weakPct}%</b> of the links between them are weak: one supply line and little or no backup.</p>
            {phone
              ? <p>Tap <b>Report an incident</b> or <b>Heavy rain</b>. Alerts go to BWSSB, KPTCL, BESCOM and hospitals as the cascade unfolds.</p>
              : <p>Press <kbd>I</kbd> to report an incident or <kbd>1</kbd> for a heavy-rain night. Alerts go to BWSSB, KPTCL, BESCOM and hospitals as the cascade unfolds. Search with <kbd>/</kbd>.</p>}
          </div>
        )}

        {mode === 'fix' && fixed && (
          <div className="fix">
            <div className="h">Best 3 fixes for this scenario</div>
            <div className="beforeafter">
              <div><div className="num down">{fixed.rec.baseline.impact_hospital_hours}</div><div className="lbl">hospital-hours lost now</div></div>
              <div className="arrow">→</div>
              <div><div className="num ok">{fixed.rec.plan_result.impact_hospital_hours}</div><div className="lbl">with these fixes</div></div>
              <div className="pct">−{fixed.rec.plan_result.reduction_pct}%</div>
            </div>
            <div className="ri-change">Resilience index <b>{fmtRI(fixed.rec.baseline.impact_hospital_hours)}</b> → <b className="okc">{fmtRI(fixed.rec.plan_result.impact_hospital_hours)}</b> / 100</div>
            <ol>
              {fixed.rec.plan.map((s, i) => (
                <li key={i}><b>{s.label}</b> at {s.name}{s.provider_name ? ` (from ${s.provider_name})` : ''}{s.extra_hours ? `, +${s.extra_hours} h` : ''}<span className="gain" title={`${s.reduction_pct}% of what was still being lost at this step`}>−{Math.round(s.impact_before - s.impact_after)} h</span></li>
              ))}
            </ol>
            <button className="wide" onClick={toggleFixed}>
              {showFixed ? 'Show without fixes' : 'Replay with fixes'} <kbd>F</kbd>
            </button>
            <button className="wide quiet" onClick={() => setMode('idle')}>Back to alerts <kbd>Esc</kbd></button>
          </div>
        )}

        {result && mode !== 'weak' && (
          <>
            <div className="stats">
              <div className="stat"><div className="num down">{hospitalsNow.down}</div><div className="lbl">hospitals without power or water</div></div>
              <div className="stat"><div className="num backup">{hospitalsNow.backup}</div><div className="lbl">hospitals on backup</div></div>
              <div className="stat"><div className="num">{firstDown == null ? '—' : fmtH(firstDown)}</div><div className="lbl">until the first hospital fails</div></div>
            </div>
            <div className="ri" title={`Share of all hospital-hours (${hospTotal} hospitals x ${horizon} h) that keep power and water in this scenario`}>
              <div><span className="ri-num">{fmtRI(shown.impact_hospital_hours)}</span><span className="ri-of">/ 100</span></div>
              <div className="lbl"><b>Resilience index</b> · share of hospital-hours ({hospTotal} hospitals × {horizon} h) that keep power and water · {Math.round(shown.impact_hospital_hours)} hospital-hours lost</div>
            </div>

            {mode !== 'fix' && (
              <AlertsPanel alerts={alerts} t={t} responses={responses} outcome={respOutcome} busy={busy}
                onAct={actOn} onRespondAll={respondAll} onReplay={replayResponses}
                onClear={() => { setResponses([]); setRespResult(null); setRespOutcome({}); setShowResp(false); setT(0); tRef.current = 0; }}
                summary={respResult ? {
                  before: { hosp: result.hospitals_down, hours: result.impact_hospital_hours, ri: fmtRI(result.impact_hospital_hours) },
                  after: { hosp: respResult.hospitals_down, hours: respResult.impact_hospital_hours, ri: fmtRI(respResult.impact_hospital_hours) },
                } : null}
                showResp={showResp}
                onToggleResp={toggleResp}
                onSelect={(id) => { const n = nodesById.get(id); if (n) pickPlace(n); }} />
            )}

            {mode !== 'fix' && <AgencyReports scenario={scenario} result={result} alerts={alerts} nodesById={nodesById} dependentsOf={dependentsOf} respResult={respResult} />}

            <Chain now={now} stages={info.stages} />

            <div className="chart">
              <div className="h">Hospitals affected over time</div>
              <ResponsiveContainer width="100%" height={120}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="#1f2833" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={[0, horizon]} tick={{ fill: '#8b98a5', fontSize: 10 }} tickCount={7} unit="h" />
                  <YAxis tick={{ fill: '#8b98a5', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#11161d', border: '1px solid #2a3542', fontSize: 12 }} labelFormatter={(v) => `Hour ${v}`} />
                  <Area dataKey="backup" name="On backup" stroke="#f5a623" fill="#f5a623" fillOpacity={0.18} isAnimationActive={false} />
                  <Area dataKey="down" name="Down" stroke="#ff4d4f" fill="#ff4d4f" fillOpacity={0.35} isAnimationActive={false} />
                  {fixed && <Line dataKey="fixedDown" name="Down, with fixes" stroke="#2dd4bf" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
                  {respResult && <Line dataKey="respDown" name="Down, with responses" stroke="#60a5fa" strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} />}
                  <ReferenceLine x={t} stroke="#e6edf3" strokeOpacity={0.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {mode === 'weak' && crit && (
          <div className="weak">
            <div className="h">City's weakest links</div>
            <div className="sub">Each facility fails alone for {fmtH(defaults.default_repair_h?.value)}; ranked by hospital-hours lost.</div>
            <ol>
              {crit.slice(0, 10).map((c) => (
                <li key={c.id} title="Click to simulate this failure" onClick={() => run({ body: { failures: [{ id: c.id, repair_h: defaults.default_repair_h?.value ?? 12 }] }, label: `Failure: ${c.name}`, note: `Weak link from the ranking. Fails for ${fmtH(defaults.default_repair_h?.value)}.` })}>
                  <span className="nm">{c.name}</span><span className="val">{c.hospitals_down} hosp · {Math.round(c.impact_hospital_hours)} h</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {result && mode !== 'weak' && mode !== 'fix' && (
          <div className="hosp">
            <div className="h">Hospitals, in order of failure</div>
            {hosp.slice(0, 7).map((h) => <HospitalRow key={h.id} h={h} t={t} state={now.get(h.id)?.state} />)}
            {hosp.length === 0 && <div className="sub">No hospital is affected in this scenario.</div>}
          </div>
        )}

        <div className="assume">
          <div className="h">Assumptions</div>
          {SLIDERS.map(([k, min, max, step]) => (
            <label key={k} title={defaults[k]?.source}>
              <span>{defaults[k]?.label}{defaults[k]?.assumption ? ' *' : ''}</span>
              <input type="range" min={min} max={max} step={step} aria-label={defaults[k]?.label} value={params[k] ?? 0}
                onChange={(e) => setParams((p) => ({ ...p, [k]: +e.target.value }))} />
              <b>{fmtH(params[k])}</b>
            </label>
          ))}
          <div className="sub">* assumption · Timings: BWSSB via Deccan Herald (~1 h pump restart, ~3 h reservoir refill). Locations: OpenStreetMap. Links between facilities are inferred.</div>
        </div>
      </aside>
      {busy && <div className="busy">Simulating…</div>}
    </div>
  );
}

const REASON = {
  'water backup ran out': 'Out of water', 'power backup ran out': 'Out of power',
  'lost water': 'Lost water', 'lost power': 'Lost power',
};

function HospitalRow({ h, t, state }) {
  const firstHit = Math.min(h.warning_at_h ?? Infinity, h.down_at_h ?? Infinity);
  let status = 'ok', pct = 0, text = `Hit at hour ${firstHit.toFixed(1)}`;
  if (state === 'DOWN') {
    status = 'down'; pct = 1;
    text = `${REASON[h.down_reason] || h.down_reason} since hour ${h.down_at_h.toFixed(1)}`;
  } else if (state === 'BACKUP') {
    status = 'backup';
    if (h.down_at_h != null && h.down_at_h > t) {
      pct = (t - h.warning_at_h) / (h.down_at_h - h.warning_at_h);
      text = `${fmtH(h.down_at_h - t)} of backup left`;
    } else { pct = 0.3; text = 'On backup, recovers in time'; }
  } else if (t >= firstHit) {
    status = 'recovered'; text = h.hours_down > 0 ? `Recovered after ${fmtH(h.hours_down)} down` : 'Rode it out on backup';
  }
  return (
    <div className={`hrow ${status}`}>
      <div className="hn">{h.name}</div>
      <div className="bar"><div style={{ width: `${Math.round(pct * 100)}%` }} /></div>
      <div className="ht">{text}</div>
    </div>
  );
}

function Chain({ now, stages }) {
  return (
    <div className="chain">
      <div className="h">Cauvery supply, ~100 km away <span className="sub">TK Halli → Harohalli → Tataguni → city</span></div>
      <div className="grid" style={{ gridTemplateColumns: `90px repeat(${stages.length}, 1fr)` }}>
        <div />
        {stages.map((s) => <div key={s} className="st">Stage {s}</div>)}
        {STATIONS.map(([id, name]) => (
          <React.Fragment key={id}>
            <div className={`stn ${now.get(`feeder_${id}`)?.state || ''}`}>{name}</div>
            {stages.map((s) => {
              const st = now.get(`${id}_${s.toLowerCase()}`)?.state || 'UP';
              return <div key={s} className={`cell ${st}`} title={`${name} Stage ${s}: ${st}`} />;
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
