// All the app's "backend" logic, running in the browser on engine.js.
import { buildGraph, failuresFor, groupedCriticality, recommend as rec, simulateWith } from './engine.js';

let DATA = null;
let DEFAULTS = {};
const graphCache = new Map();
const critCache = new Map();

export function init(data) {
  DATA = data;
  DEFAULTS = Object.fromEntries(Object.entries(data.meta.params).map(([k, v]) => [k, v.value]));
  graphCache.clear(); critCache.clear();
  return true;
}

function paramsFor(overrides) {
  const p = { ...DEFAULTS };
  for (const [k, v] of Object.entries(overrides || {})) if (k in p && v !== null && v !== undefined) p[k] = Number(v);
  return p;
}

function graphFor(p) {
  const key = JSON.stringify(p);
  if (!graphCache.has(key)) {
    if (graphCache.size > 24) graphCache.clear();
    graphCache.set(key, buildGraph(DATA, p));
  }
  return graphCache.get(key);
}

function failures(body, g, p) {
  const f = failuresFor(body, g, p, DATA.meta.orr_flood_polygon);
  if (!f.length) throw new Error('Nothing failed - pick a scenario, a facility or a flood area.');
  return f;
}

export function simulate(body) {
  const p = paramsFor(body.params);
  const g = graphFor(p);
  const f = failures(body, g, p);
  // responses from alerts: a prioritised repair finishes earlier than planned
  for (const x of f) {
    const o = body.repair_overrides?.[x.node_id];
    if (o !== undefined && o !== null && (x.repair_h === null || x.repair_h === undefined || o < x.repair_h)) x.repair_h = Number(o);
  }
  const r = simulateWith(g, f, body.horizon_h || p.horizon_h, body.interventions);
  r.failures = f.map((x) => ({ id: x.node_id, at_h: x.at_h, repair_h: x.repair_h, reason: x.reason }));
  return r;
}

export function recommend(body) {
  const p = paramsFor(body.params);
  const g = graphFor(p);
  const f = failures(body, g, p);
  return rec(g, f, body.horizon_h || p.horizon_h, p.generator_h, p.storage_h, 3, Math.max(1, Math.min(body.budget || 3, 5)));
}

export function criticality(body) {
  const p = paramsFor(body?.params);
  const key = JSON.stringify(p);
  if (!critCache.has(key)) critCache.set(key, groupedCriticality(graphFor(p), p.default_repair_h));
  return { ranking: critCache.get(key),
    method: 'Each facility fails alone for the default repair time; score = hospital-hours lost in 48 h.' };
}
