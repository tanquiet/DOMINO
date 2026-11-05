// Alerts & response: turn a simulated cascade into alerts for the people responsible, and turn
// their responses back into changes the engine can re-simulate (closed loop).

import { backupHours } from './mapkit.js';

const AGENCY = { pump: 'BWSSB', reservoir: 'BWSSB', hospital: 'Hospital', telecom: 'Telecom' };
export const AGENCIES = ['All', 'BWSSB', 'KPTCL', 'BESCOM', 'Hospital', 'Telecom'];
const KPTCL_MIN_KV = 66;

// KPTCL runs the transmission network (66 kV and above, and the dedicated lines to the Cauvery pumps).
// BESCOM runs local distribution. OpenStreetMap often has no voltage, so those substations go to BESCOM.
export function agencyOf(node) {
  if (node.kind === 'feeder' || node.kind === 'substation_tx') return 'KPTCL';
  if (node.kind === 'substation') return (node.meta?.voltage_kv ?? 0) >= KPTCL_MIN_KV ? 'KPTCL' : 'BESCOM';
  return AGENCY[node.kind] || 'City';
}

// Who can receive a report. Numbers and addresses come from the official pages listed in contacts.js.
export const REPORT_AGENCIES = {
  BWSSB: { name: 'Bangalore Water Supply and Sewerage Board', covers: 'Cauvery pumping stations and city reservoirs',
    email: 'callcenter@bwssb.gov.in', phone: '1916', whatsapp: '8762228888' },
  KPTCL: { name: 'Karnataka Power Transmission Corporation', covers: 'transmission substations and the power lines to the pumps',
    email: 'director.operations@kptcl.com', phone: '080-22228367', whatsapp: null },
};

// ASSUMPTIONS for the response model (shown on screen). Adjust once real response times are known.
export const RESPONSE = {
  tanker_arrive_h: 2, tanker_adds_h: 72,   // tanker service starts 2 h after the request and keeps supplying until city water returns
  gen_arrive_h: 3, gen_adds_h: 72,         // a mobile generator arrives in 3 h and runs (with refuelling) until power returns
  link_h: 1,                               // switching a reservoir to another supply line takes 1 h
  priority_repair_h: 4,                    // a prioritised repair crew restores a substation 4 h after dispatch
};

const fmtH = (h) => (h == null ? '-' : h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} h`);
const hr = (h) => `hour ${Math.round(h * 10) / 10}`;

function downstream(id, dependentsOf) {
  const seen = new Set([id]);
  const q = [id];
  while (q.length) {
    const cur = q.shift();
    for (const d of dependentsOf.get(cur) || []) if (!seen.has(d)) { seen.add(d); q.push(d); }
  }
  seen.delete(id);
  return seen;
}

// When a hospital loses one resource: the first spell with every supplier of it down, preferring
// the first spell its backup can't cover. Read from the suppliers because the hospital's own
// timeline can't show a second loss once it is already down.
function hospitalLoss(providers, backupH, timeline) {
  const down = new Set();
  let since = null;
  const spells = [];
  for (const ev of timeline) {
    if (!providers.includes(ev.id)) continue;
    if (ev.state === 'DOWN') down.add(ev.id); else down.delete(ev.id);
    const allDown = down.size === providers.length;
    if (allDown && since === null) since = ev.t;
    else if (!allDown && since !== null) { spells.push([since, ev.t]); since = null; }
  }
  if (since !== null) spells.push([since, Infinity]);
  if (!spells.length) return null;
  const fails = spells.find(([from, to]) => from + backupH < to);
  return fails ? { hitAt: fails[0], failAt: fails[0] + backupH } : { hitAt: spells[0][0], failAt: null };
}

export function buildAlerts(result, nodesById, dependentsOf, depsOf = new Map(), params = {}) {
  if (!result) return [];
  const first = new Map(), firstDown = new Map(), firstBackup = new Map();
  for (const ev of result.timeline) {
    if (ev.state === 'UP') continue;
    if (!first.has(ev.id)) first.set(ev.id, ev);
    if (ev.state === 'DOWN' && !firstDown.has(ev.id)) firstDown.set(ev.id, ev);
    if (ev.state === 'BACKUP' && !firstBackup.has(ev.id)) firstBackup.set(ev.id, ev);
  }
  const forced = new Map((result.failures || []).map((f) => [f.id, f]));
  const hospitalsBelow = (id) => {
    let c = 0;
    for (const d of downstream(id, dependentsOf)) if (nodesById.get(d)?.kind === 'hospital') c++;
    return c;
  };
  const depend = (c) => `${c} hospital${c === 1 ? ' depends' : 's depend'} on it`;
  const reservoirs = [...nodesById.values()].filter((n) => n.kind === 'reservoir');

  const alerts = [];
  for (const [id, ev] of first) {
    const n = nodesById.get(id);
    if (!n) continue;
    const fd = firstDown.get(id), fb = firstBackup.get(id);
    const hitAt = ev.t, failAt = fd ? fd.t : null;
    const isForced = forced.has(id);
    const why = (fd || fb || ev).reason || '';
    const resource = /water/.test(fb?.reason || why) ? 'water' : /power/.test(fb?.reason || why) ? 'power' : null;
    const hosp = n.kind === 'hospital' ? 0 : hospitalsBelow(id);
    let severity = 'watch';
    if (isForced || (failAt != null && failAt - hitAt <= 3)) severity = 'critical';
    else if (failAt != null) severity = 'high';

    let title = `${n.name}`, detail = '', action = null;
    if (n.kind === 'substation' || n.kind === 'substation_tx' || n.kind === 'feeder') {
      if (isForced) {
        title = `${n.name} is down`;
        detail = `${forced.get(id).reason}. ${depend(hosp)}. Repair this first.`;
        action = { type: 'priority_repair', label: 'Prioritise repair' };
      } else {
        title = `${n.name} lost supply`;
        detail = 'The substation feeding it failed. Restoring that one restores this.';
      }
    } else if (n.kind === 'pump') {
      title = `${n.name} stopped`;
      detail = isForced ? `${forced.get(id).reason}. Reservoirs on this line start draining.`
        : /power/.test(why) ? 'Its power line failed. Ask KPTCL for priority restore.' : 'The upstream stage stopped sending water.';
    } else if (n.kind === 'reservoir') {
      title = failAt != null ? `${n.name} will run dry` : `${n.name} on reserve`;
      detail = /power/.test(why)
        ? `Lost power for distribution pumps at ${hr(hitAt)}. ${depend(hosp)}.`
        : `Inflow stopped at ${hr(hitAt)}${failAt != null ? `; empties at ${hr(failAt)}` : ''}. ${depend(hosp)}.`;
      if (/water/.test(why) || /water/.test(fb?.reason || '')) {
        const line = n.meta?.supply_line;
        const others = reservoirs.filter((r) => r.meta?.supply_line !== line && !first.has(r.id));
        if (others.length) {
          let best = others[0], bd = Infinity;
          for (const r of others) {
            const d = (r.lat - n.lat) ** 2 + (r.lon - n.lon) ** 2;
            if (d < bd) { bd = d; best = r; }
          }
          action = { type: 'interconnect', provider: best.id, providerName: best.name, label: 'Link to another supply line' };
          detail += ` Switch to ${best.name} (Stage ${best.meta?.supply_line}).`;
        }
      }
    } else if (n.kind === 'hospital') {
      continue;   // handled below: one alert per resource lost
    } else if (n.kind === 'telecom') {
      title = `${n.name}: on battery`;
      detail = failAt != null ? `Battery runs out at ${hr(failAt)}. Send a generator.` : 'Battery should last.';
      action = failAt != null ? { type: 'generator', label: 'Send generator' } : null;
    }
    // A facility that is itself knocked out can't be saved by backups or relinks: repair it.
    if (isForced && (n.kind === 'reservoir' || n.kind === 'telecom')) {
      title = `${n.name} is out of service`;
      detail = `${forced.get(id).reason}.${hosp ? ` ${depend(hosp)}.` : ''} Repair this first.`;
      action = { type: 'priority_repair', label: 'Prioritise repair' };
    }
    alerts.push({ id: `a_${id}`, nodeId: id, name: n.name, kind: n.kind, agency: agencyOf(n),
      severity, hitAt, failAt, resource, hosp, title, detail, action, forced: isForced });
  }
  // Hospitals: a separate alert for water and for power, because a tanker can't fix a power cut.
  for (const n of nodesById.values()) {
    if (n.kind !== 'hospital' || !first.has(n.id)) continue;
    for (const g of depsOf.get(n.id) || []) {
      const loss = hospitalLoss(g.providers, backupHours(n, g.resource, params), result.timeline);
      if (!loss) continue;
      const { hitAt, failAt } = loss;
      const water = g.resource === 'water';
      alerts.push({ id: `a_${n.id}_${g.resource}`, nodeId: n.id, name: n.name, kind: n.kind, agency: 'Hospital',
        severity: failAt == null ? 'watch' : failAt - hitAt <= 3 ? 'critical' : 'high',
        hitAt, failAt, resource: g.resource, hosp: 0, forced: false,
        title: `${n.name}: ${water ? 'water' : 'power'} supply`,
        detail: water
          ? (failAt != null ? `City water stops at ${hr(hitAt)}; your tank lasts until ${hr(failAt)}. Order a tanker now and cut non-essential use.`
            : `City water stops at ${hr(hitAt)}; your tank should cover it. Conserve water.`)
          : (failAt != null ? `On diesel from ${hr(hitAt)}; diesel lasts until ${hr(failAt)}. Arrange refuelling or a mobile generator.`
            : `On diesel from ${hr(hitAt)}; diesel should cover it. Check stock.`),
        action: water ? { type: 'tanker', label: 'Send water tanker' } : { type: 'generator', label: 'Send mobile generator' } });
    }
  }
  const rank = { critical: 0, high: 1, watch: 2 };
  alerts.sort((a, b) => (a.hitAt - b.hitAt) || (rank[a.severity] - rank[b.severity]) || ((a.failAt ?? 1e9) - (b.failAt ?? 1e9)));
  return alerts;
}

// Responses -> engine changes. Each response acts at time `at`; it only helps if it lands before the failure.
export function responsesToPlan(alerts, responses, failures, R = RESPONSE) {
  const byId = new Map(alerts.map((a) => [a.id, a]));
  const interventions = [], repair = {}, outcome = {};
  for (const r of responses) {
    const a = byId.get(r.alertId);
    if (!a || !a.action) continue;
    const t = r.at;
    const inTime = (delay) => a.failAt == null || t + delay < a.failAt;
    if (a.action.type === 'tanker') {
      if (inTime(R.tanker_arrive_h)) { interventions.push({ node_id: a.nodeId, type: 'water_storage', extra_hours: R.tanker_adds_h }); outcome[a.id] = 'in time'; }
      else outcome[a.id] = 'too late';
    } else if (a.action.type === 'generator') {
      if (inTime(R.gen_arrive_h)) { interventions.push({ node_id: a.nodeId, type: 'generator', extra_hours: R.gen_adds_h }); outcome[a.id] = 'in time'; }
      else outcome[a.id] = 'too late';
    } else if (a.action.type === 'interconnect') {
      if (inTime(R.link_h)) { interventions.push({ node_id: a.nodeId, type: 'interconnect', provider: a.action.provider }); outcome[a.id] = 'in time'; }
      else outcome[a.id] = 'too late';
    } else if (a.action.type === 'priority_repair') {
      const f = failures.find((x) => x.id === a.nodeId);
      const done = t + R.priority_repair_h;
      if (f && (f.repair_h == null || done < f.repair_h)) { repair[a.nodeId] = done; outcome[a.id] = `restored at hour ${Math.round(done * 10) / 10}`; }
      else outcome[a.id] = 'no faster';
    }
  }
  return { interventions, repair_overrides: repair, outcome };
}

// "Everyone acts within `delay` hours of their alert"
export function autoResponses(alerts, delay) {
  return alerts.filter((a) => a.action).map((a) => ({ alertId: a.id, at: a.hitAt + delay, auto: true }));
}

// A plain-text situation report for one authority, always labelled as a simulation.
export function agencyReport(agency, { scenario, result, alerts, nodesById, dependentsOf, respResult = null }, now = new Date()) {
  const own = alerts.filter((a) => a.agency === agency);
  const failing = own.filter((a) => a.failAt != null);
  const lostService = new Set((result.hospitals || []).filter((h) => h.down_at_h != null).map((h) => h.id));
  const hospitals = new Set();
  for (const a of own) for (const d of downstream(a.nodeId, dependentsOf)) if (lostService.has(d)) hospitals.add(d);
  const rank = { critical: 0, high: 1, watch: 2 };
  // The three stations on a stage stop together, so the pumps are one line instead of filling the list.
  const pumps = own.filter((a) => a.kind === 'pump');
  const stages = [...new Set(pumps.map((a) => nodesById.get(a.nodeId)?.meta?.stage).filter(Boolean))].sort();
  const others = own.filter((a) => a.kind !== 'pump')
    .sort((x, y) => (y.forced - x.forced) || rank[x.severity] - rank[y.severity] || y.hosp - x.hosp || (x.failAt ?? 1e9) - (y.failAt ?? 1e9));
  const top = others.slice(0, 5);
  const when = (a) => (a.failAt == null ? '' : a.failAt <= a.hitAt ? ` since hour ${Math.round(a.failAt * 10) / 10}` : ` by hour ${Math.round(a.failAt * 10) / 10}`);
  // Many facilities have generic names, so the location is what lets an officer find them.
  const where = (a) => {
    const n = nodesById.get(a.nodeId);
    return n?.on_map === false || !n?.lat ? '' : ` [${n.lat.toFixed(4)}, ${n.lon.toFixed(4)}]`;
  };
  const lines = [
    `DOMINO cascade report for ${agency}`,
    'STATUS: SIMULATION ESTIMATE. NOT A CONFIRMED INCIDENT.',
    `Scenario: ${scenario.label}`,
    ...(scenario.report ? [`Reported by: ${scenario.report.reporter} (${scenario.report.verified ? 'verified' : 'unverified'})`] : []),
    `Prepared: ${now.toLocaleString('en-IN')}`,
    '',
    `${own.length} ${agency} facilit${own.length === 1 ? 'y' : 'ies'} affected, ${failing.length} fail. ${hospitals.size} hospital${hospitals.size === 1 ? '' : 's'} downstream lose service.`,
    '',
    'Act first:',
    ...(pumps.length ? [`- ${pumps.length} Cauvery pump unit${pumps.length === 1 ? '' : 's'} stopped${stages.length ? ` (Stage ${stages.join(', ')})` : ''}.`] : []),
    ...top.map((a) => `- ${a.title}${when(a)}${where(a)}${a.hosp ? `: ${a.hosp} hospital${a.hosp === 1 ? '' : 's'} depend${a.hosp === 1 ? 's' : ''} on it` : ''}${a.action ? `. ${a.action.label}` : ''}`),
    ...(others.length > top.length ? [`...and ${others.length - top.length} more.`] : []),
    ...(respResult ? ['', `If everyone responds as planned: hospitals that fail ${result.hospitals_down} -> ${respResult.hospitals_down}.`] : []),
    '',
    'Links between facilities are estimated from location. Timings are model assumptions.',
  ];
  return { count: own.length, failing: failing.length, hospitals: hospitals.size, text: lines.join('\n') };
}

export { fmtH };
