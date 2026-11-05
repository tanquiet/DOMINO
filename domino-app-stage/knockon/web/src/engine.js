// DOMINO cascade engine - JavaScript port of sim/engine.py (runs in the browser, no server).
// Keep the two in step: tools/parity_check.mjs compares their results on the same data.

export const UP = 'UP', BACKUP = 'BACKUP', DOWN = 'DOWN';

// Python-style round(x, n) (half to even on exact ties) so numbers match the Python engine.
export function pyRound(x, n = 0) {
  const m = 10 ** n;
  const y = x * m;
  const fl = Math.floor(y);
  const diff = y - fl;
  let r;
  if (diff > 0.5) r = fl + 1;
  else if (diff < 0.5) r = fl;
  else r = fl % 2 === 0 ? fl : fl + 1;
  return r / m;
}

// ---------------------------------------------------------------- graph
export class Graph {
  constructor(nodes, deps) {
    this.nodes = nodes;           // Map id -> node
    this.deps = deps;             // Map id -> [{resource, providers}]
    this.dependents = new Map();  // provider id -> [dependent ids]
    for (const [nid, groups] of deps) {
      for (const g of groups) {
        for (const p of g.providers) {
          if (!this.dependents.has(p)) this.dependents.set(p, []);
          const arr = this.dependents.get(p);
          if (!arr.includes(nid)) arr.push(nid);
        }
      }
    }
  }
  *edges() {
    for (const [nid, groups] of this.deps) {
      for (const g of groups) for (const p of g.providers) yield { from: p, to: nid, resource: g.resource };
    }
  }
}

// Build the runtime graph from the exported data, applying the assumption sliders.
export function buildGraph(data, params) {
  const v = (k) => params[k];
  const nodes = new Map();
  for (const raw of data.graph.nodes) {
    const n = { ...raw, buffers: { ...raw.buffers }, restart_h: { ...raw.restart_h }, meta: { ...raw.meta } };
    if (n.kind === 'hospital') n.buffers = { power: v('hospital_diesel_h'), water: v('hospital_water_h') };
    else if (n.kind === 'reservoir') {
      n.buffers = { water: v('reservoir_storage_h'), power: v('reservoir_power_backup_h') };
      n.restart_h = { water: v('reservoir_refill_h'), power: v('pump_restart_h'), repair: v('pump_restart_h') };
    } else if (n.kind === 'telecom') n.buffers = { power: v('telecom_battery_h') };
    else if (n.kind === 'pump') n.restart_h = { power: v('pump_restart_h'), repair: v('pump_restart_h'), water: 0 };
    nodes.set(n.id, n);
  }
  const deps = new Map();
  for (const [nid, groups] of Object.entries(data.graph.deps)) {
    deps.set(nid, groups.map((g) => ({ resource: g.resource, providers: [...g.providers] })));
  }
  return new Graph(nodes, deps);
}

// ---------------------------------------------------------------- min-heap of [t, seq, ...]
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(i, j) { const x = this.a[i], y = this.a[j]; return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
  push(item) {
    const a = this.a; a.push(item);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

// ---------------------------------------------------------------- simulation
class Simulation {
  constructor(graph, failures, horizonH = 72, bufferOverrides = {}) {
    this.g = graph;
    this.failures = failures;
    this.horizon = Number(horizonH);
    this.ov = bufferOverrides || {};
    this.state = new Map(); this.downCauses = new Map(); this.onBackup = new Map(); this.gen = new Map();
    for (const id of graph.nodes.keys()) {
      this.state.set(id, UP); this.downCauses.set(id, new Set()); this.onBackup.set(id, new Map()); this.gen.set(id, 0);
    }
    this.forced = new Set(); this.pending = new Set();
    this.events = new Heap(); this.seq = 0; this.now = 0; this.timeline = [];
  }

  buffer(nid, res) {
    const o = this.ov[nid];
    if (o && res in o) return Number(o[res]);
    return Number(this.g.nodes.get(nid).buffers?.[res] ?? 0);
  }
  working(nid) { return this.state.get(nid) !== DOWN; }
  missing(nid) {
    const out = [];
    for (const grp of this.g.deps.get(nid) || []) {
      if (!grp.providers.some((p) => this.state.has(p) && this.working(p))) out.push(grp.resource);
    }
    return out;
  }
  // at the same instant, supply coming back wins over a backup running out
  push(t, kind, nid, extra) { this.events.push([t, (kind === 'expire' ? 1e9 : 0) + this.seq++, kind, nid, extra]); }

  setState(nid, next, reason) {
    const old = this.state.get(nid);
    if (old === next) return false;
    this.state.set(nid, next);
    this.timeline.push({ t: pyRound(this.now, 4), id: nid, state: next, reason });
    if ((old !== DOWN) !== (next !== DOWN)) {
      for (const dep of this.g.dependents.get(nid) || []) this.evaluate(dep);
    }
    return true;
  }

  evaluate(nid) {
    if (this.forced.has(nid)) return;
    const lacking = this.missing(nid);
    const st = this.state.get(nid);
    const ob = this.onBackup.get(nid);
    if (lacking.length) {
      if (st === DOWN) { for (const r of lacking) this.downCauses.get(nid).add(r); return; }
      for (const res of lacking) {
        if (ob.has(res)) continue;
        const b = this.buffer(nid, res);
        if (b <= 0) { this.goDown(nid, new Set([res]), `lost ${res}`); return; }
        const expires = this.now + b;
        ob.set(res, expires);
        this.push(expires, 'expire', nid, [res, this.gen.get(nid)]);
      }
      for (const res of [...ob.keys()]) if (!lacking.includes(res)) ob.delete(res);
      const names = [...ob.keys()].sort().join(', ');
      this.setState(nid, BACKUP, `on backup (${names})`);
      return;
    }
    if (st === BACKUP) {
      ob.clear();
      this.gen.set(nid, this.gen.get(nid) + 1);
      this.setState(nid, UP, 'supply restored');
    } else if (st === DOWN && !this.pending.has(nid)) {
      let causes = this.downCauses.get(nid);
      if (!causes.size) causes = new Set(['repair']);
      const node = this.g.nodes.get(nid);
      const wait = Math.max(...[...causes].map((c) => Number(node.restart_h?.[c] ?? 0)));
      this.gen.set(nid, this.gen.get(nid) + 1);
      if (wait <= 0) this.recover(nid);
      else { this.pending.add(nid); this.push(this.now + wait, 'recover', nid, [this.gen.get(nid)]); }
    }
  }

  goDown(nid, causes, reason) {
    this.onBackup.get(nid).clear();
    this.gen.set(nid, this.gen.get(nid) + 1);
    this.downCauses.set(nid, new Set(causes));
    this.pending.delete(nid);
    this.setState(nid, DOWN, reason);
  }

  recover(nid) {
    this.pending.delete(nid);
    if (this.missing(nid).length) { this.evaluate(nid); return; }
    this.downCauses.set(nid, new Set());
    this.setState(nid, UP, 'back in service');
  }

  run() {
    for (const f of this.failures) {
      if (this.g.nodes.has(f.node_id)) this.push(f.at_h, 'fail', f.node_id, [f.repair_h, f.reason]);
    }
    while (this.events.size) {
      const [t, , kind, nid, extra] = this.events.pop();
      if (t > this.horizon) break;
      this.now = t;
      if (kind === 'fail') {
        const [repair, reason] = extra;
        this.forced.add(nid);
        this.goDown(nid, new Set(['repair']), reason);
        if (repair !== null && repair !== undefined) this.push(t + repair, 'repair', nid, []);
      } else if (kind === 'repair') {
        this.forced.delete(nid);
        this.downCauses.set(nid, new Set(['repair']));
        this.evaluate(nid);
      } else if (kind === 'expire') {
        const [res, gen] = extra;
        if (gen !== this.gen.get(nid) || this.state.get(nid) !== BACKUP) continue;
        if (this.onBackup.get(nid).get(res) === t && this.missing(nid).includes(res)) {
          this.goDown(nid, new Set([res]), `${res} backup ran out`);
        }
      } else if (kind === 'recover') {
        const [gen] = extra;
        if (gen !== this.gen.get(nid) || this.state.get(nid) !== DOWN) continue;
        this.recover(nid);
      }
    }
    this.now = this.horizon;
    return this.result();
  }

  result() {
    const perNode = new Map();
    for (const ev of this.timeline) {
      if (!perNode.has(ev.id)) perNode.set(ev.id, []);
      perNode.get(ev.id).push(ev);
    }
    const downHours = (evs) => {
      let total = 0, since = null;
      for (const ev of evs) {
        if (ev.state === DOWN && since === null) since = ev.t;
        else if (ev.state !== DOWN && since !== null) { total += ev.t - since; since = null; }
      }
      if (since !== null) total += this.horizon - since;
      return total;
    };
    const hospitals = [];
    let impact = 0;
    for (const [nid, node] of this.g.nodes) {
      if (node.kind !== 'hospital') continue;
      const evs = perNode.get(nid);
      if (!evs) continue;
      const fb = evs.find((e) => e.state === BACKUP);
      const fd = evs.find((e) => e.state === DOWN);
      const hrs = downHours(evs);
      impact += hrs * (node.weight ?? 1);
      hospitals.push({
        id: nid, name: node.name,
        warning_at_h: fb ? fb.t : null,
        down_at_h: fd ? fd.t : null,
        down_reason: fd ? fd.reason : null,
        hours_down: pyRound(hrs, 2),
      });
    }
    // same ordering as Python: key (down is None, down or 1e9, warning or 1e9)
    hospitals.sort((a, b) => {
      const ka = [a.down_at_h === null ? 1 : 0, a.down_at_h || 1e9, a.warning_at_h || 1e9];
      const kb = [b.down_at_h === null ? 1 : 0, b.down_at_h || 1e9, b.warning_at_h || 1e9];
      for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    });
    const affected = {};
    for (const nid of perNode.keys()) {
      const k = this.g.nodes.get(nid).kind;
      affected[k] = (affected[k] || 0) + 1;
    }
    const firstDown = hospitals.find((h) => h.down_at_h !== null);
    return {
      horizon_h: this.horizon,
      timeline: this.timeline,
      impact_hospital_hours: pyRound(impact, 2),
      hospitals,
      hospitals_down: hospitals.filter((h) => h.down_at_h !== null).length,
      first_hospital_down_h: firstDown ? firstDown.down_at_h : null,
      affected_by_kind: affected,
      series: this.series(perNode),
    };
  }

  series(perNode, step = 0.5) {
    const kinds = [...new Set([...this.g.nodes.values()].map((n) => n.kind))].sort();
    const steps = Math.floor(this.horizon / step) + 1;
    const out = { t: Array.from({ length: steps }, (_, i) => pyRound(i * step, 2)) };
    for (const k of kinds) { out[`${k}_down`] = new Array(steps).fill(0); out[`${k}_backup`] = new Array(steps).fill(0); }
    for (const [nid, evs] of perNode) {
      const k = this.g.nodes.get(nid).kind;
      evs.forEach((ev, i) => {
        if (ev.state === UP) return;
        const end = i + 1 < evs.length ? evs[i + 1].t : this.horizon + step;
        const key = ev.state === DOWN ? `${k}_down` : `${k}_backup`;
        const a = Math.ceil(ev.t / step), b = Math.ceil(end / step);
        for (let s = a; s < Math.min(b, steps); s++) out[key][s] += 1;
      });
    }
    return out;
  }
}

export function simulate(graph, failures, horizonH = 72, overrides = {}) {
  return new Simulation(graph, failures, horizonH, overrides).run();
}

// ---------------------------------------------------------------- interventions
export const INTERVENTION_LABELS = {
  generator: 'Add a backup generator',
  water_storage: 'Add water storage at the hospital',
  interconnect: 'Link to a reservoir on another supply line',
};

export function applyInterventions(graph, interventions) {
  const overrides = {};
  let newDeps = null;
  for (const iv of interventions || []) {
    const node = graph.nodes.get(iv.node_id);
    if (!node) continue;
    if (iv.type === 'generator' || iv.type === 'water_storage') {
      const res = iv.type === 'generator' ? 'power' : 'water';
      const cur = overrides[iv.node_id]?.[res] ?? node.buffers?.[res] ?? 0;
      overrides[iv.node_id] = { ...(overrides[iv.node_id] || {}), [res]: cur + Number(iv.extra_hours || 0) };
    } else if (iv.type === 'interconnect' && graph.nodes.has(iv.provider)) {
      if (!newDeps) {
        newDeps = new Map();
        for (const [k, groups] of graph.deps) newDeps.set(k, groups.map((d) => ({ resource: d.resource, providers: [...d.providers] })));
      }
      for (const d of newDeps.get(iv.node_id) || []) {
        if (d.resource === 'water' && !d.providers.includes(iv.provider)) d.providers.push(iv.provider);
      }
    }
  }
  return [newDeps ? new Graph(graph.nodes, newDeps) : graph, overrides];
}

export function simulateWith(graph, failures, horizonH = 72, interventions = null) {
  const [g, ov] = applyInterventions(graph, interventions);
  return simulate(g, failures, horizonH, ov);
}

function* candidateInterventions(graph, touched, forced, chosen, generatorH, storageH, wentDown) {
  const interconnected = new Set(chosen.filter((i) => i.type === 'interconnect').map((i) => i.node_id));
  const usedProviders = new Set(chosen.filter((i) => i.type === 'interconnect').map((i) => i.provider));
  const reservoirs = [...graph.nodes.values()].filter((n) => n.kind === 'reservoir');
  const pool = [...(wentDown || touched)].filter((id) => !forced.has(id)).sort();
  for (const nid of pool) {
    const node = graph.nodes.get(nid);
    const resources = new Set((graph.deps.get(nid) || []).map((d) => d.resource));
    if (resources.has('power') && ['pump', 'reservoir', 'hospital', 'telecom'].includes(node.kind)) {
      yield { node_id: nid, type: 'generator', extra_hours: generatorH };
    }
    if (resources.has('water') && node.kind === 'hospital') {
      yield { node_id: nid, type: 'water_storage', extra_hours: storageH };
    }
    if (node.kind === 'reservoir' && !interconnected.has(nid) && !usedProviders.has(nid)) {
      const line = node.meta?.supply_line;
      const others = reservoirs.filter((r) => r.meta?.supply_line !== line && !touched.has(r.id) && !interconnected.has(r.id));
      if (others.length) {
        let best = others[0], bestD = Infinity;
        for (const r of others) {
          const d = (r.lat - node.lat) ** 2 + (r.lon - node.lon) ** 2;
          if (d < bestD) { bestD = d; best = r; }
        }
        yield { node_id: nid, type: 'interconnect', provider: best.id, provider_name: best.name };
      }
    }
  }
}

export function recommend(graph, failures, horizonH = 72, generatorH = 24, storageH = 12, top = 3, budget = 3) {
  const base = simulate(graph, failures, horizonH);
  const baseImpact = base.impact_hospital_hours;
  const forced = new Set(failures.map((f) => f.node_id));
  const describe = (iv, r, before) => {
    const node = graph.nodes.get(iv.node_id);
    return {
      ...iv, name: node.name, kind: node.kind, label: INTERVENTION_LABELS[iv.type],
      impact_before: pyRound(before, 2), impact_after: r.impact_hospital_hours,
      reduction_pct: before ? pyRound((100 * (before - r.impact_hospital_hours)) / before, 1) : 0,
      hospitals_down_after: r.hospitals_down,
    };
  };
  const chosen = [], steps = [], options = [];
  let current = base, currentImpact = baseImpact;
  for (let step = 0; step < Math.max(budget, 1); step++) {
    const touched = new Set(current.timeline.map((e) => e.id));
    const wentDown = new Set(current.timeline.filter((e) => e.state === DOWN).map((e) => e.id));
    let best = null;
    for (const iv of candidateInterventions(graph, touched, forced, chosen, generatorH, storageH, wentDown)) {
      const r = simulateWith(graph, failures, horizonH, [...chosen, iv]);
      const gain = currentImpact - r.impact_hospital_hours;
      if (gain > 1e-6) {
        if (step === 0) options.push(describe(iv, r, baseImpact));
        if (!best || gain > best.gain + 1e-9) best = { gain, iv, r };
      }
    }
    if (!best) break;
    chosen.push(best.iv);
    steps.push(describe(best.iv, best.r, currentImpact));
    current = best.r; currentImpact = best.r.impact_hospital_hours;
  }
  options.sort((a, b) => a.impact_after - b.impact_after);
  return {
    baseline: { impact_hospital_hours: baseImpact, hospitals_down: base.hospitals_down,
      first_hospital_down_h: base.first_hospital_down_h },
    options: options.slice(0, top),
    plan: steps,
    plan_result: { impact_hospital_hours: currentImpact, hospitals_down: current.hospitals_down,
      reduction_pct: baseImpact ? pyRound((100 * (baseImpact - currentImpact)) / baseImpact, 1) : 0 },
    interventions: chosen,
  };
}

// ---------------------------------------------------------------- weak links
export function criticality(graph, kinds = ['substation_tx', 'substation', 'feeder', 'pump', 'reservoir'],
  repairH = 12, horizonH = 48, top = null) {
  const rows = [];
  for (const [nid, node] of graph.nodes) {
    if (!kinds.includes(node.kind)) continue;
    const r = simulate(graph, [{ node_id: nid, at_h: 0, repair_h: repairH, reason: 'single failure' }], horizonH);
    rows.push({ id: nid, name: node.name, kind: node.kind, impact_hospital_hours: r.impact_hospital_hours,
      hospitals_down: r.hospitals_down, nodes_affected: new Set(r.timeline.map((e) => e.id)).size - 1 });
  }
  rows.sort((a, b) => (b.impact_hospital_hours - a.impact_hospital_hours) || (b.hospitals_down - a.hospitals_down)
    || (b.nodes_affected - a.nodes_affected));
  return top ? rows.slice(0, top) : rows;
}

// Collapse identical rows (the 3 stations on one stage; the 3 dedicated lines) - mirrors api/main.py
export function groupedCriticality(graph, repairH) {
  const rows = criticality(graph, undefined, repairH, 48, null);
  const out = [], seen = new Set();
  for (const r of rows) {
    const node = graph.nodes.get(r.id);
    let key, name;
    if (node.kind === 'pump') {
      key = `stage:${node.meta?.stage}`;
      name = `Cauvery Stage ${node.meta?.stage} pumps (TK Halli, Harohalli or Tataguni)`;
    } else if (node.kind === 'feeder') {
      key = `feeder:${r.impact_hospital_hours}`;
      name = 'Power line to any one Cauvery pumping station';
    } else { key = `node:${r.id}`; name = r.name; }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, name });
    if (out.length >= 12) break;
  }
  return out;
}

// ---------------------------------------------------------------- scenarios
export function nodesInPolygon(graph, polygon, kinds = ['substation_tx', 'substation', 'reservoir', 'telecom']) {
  const inside = (lon, lat) => {
    let hit = false;
    for (let i = 0, n = polygon.length; i < n; i++) {
      const [x1, y1] = polygon[i], [x2, y2] = polygon[(i + 1) % n];
      if ((y1 > lat) !== (y2 > lat)) {
        const xin = ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1;
        if (lon < xin) hit = !hit;
      }
    }
    return hit;
  };
  return [...graph.nodes.values()]
    .filter((n) => kinds.includes(n.kind) && n.on_map !== false && inside(n.lon, n.lat)).map((n) => n.id);
}

export function failuresFor(req, graph, params, orrPolygon) {
  const out = [];
  const F = (node_id, repair_h, reason) => ({ node_id, at_h: 0, repair_h, reason });
  switch (req.scenario) {
    case 'tk_halli_2022':
      for (const st of ['iii', 'iv']) out.push(F(`cauvery_tk_halli_${st}`, params.tk_halli_flood_repair_h, 'flooded (Sept 2022)'));
      break;
    case 'tk_halli_trip': out.push(F('feeder_cauvery_tk_halli', 20 / 60, '20-minute power trip')); break;
    case 'tk_halli_feeder': out.push(F('feeder_cauvery_tk_halli', params.default_repair_h, 'transformer damaged')); break;
    case 'orr_flood':
      for (const id of nodesInPolygon(graph, orrPolygon)) out.push(F(id, params.default_repair_h, 'flooded'));
      break;
    case undefined: case null: break;
    default: throw new Error(`unknown scenario ${req.scenario}`);
  }
  for (const f of req.failures || []) {
    if (!graph.nodes.has(f.id)) throw new Error(`unknown node ${f.id}`);
    out.push({ node_id: f.id, at_h: Number(f.at_h || 0), repair_h: f.repair_h ?? null, reason: f.reason || 'failed' });
  }
  if (req.polygon) {
    const rep = req.polygon_repair_h ?? params.default_repair_h;
    for (const id of nodesInPolygon(graph, req.polygon)) out.push(F(id, rep, 'flooded'));
  }
  return out;
}
