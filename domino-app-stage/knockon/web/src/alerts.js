// Alerts & response: turn a simulated cascade into alerts for the people responsible, and turn
// their responses back into changes the engine can re-simulate (closed loop).

const AGENCY = {
  substation_tx: 'BESCOM', substation: 'BESCOM', feeder: 'BESCOM',
  pump: 'BWSSB', reservoir: 'BWSSB', hospital: 'Hospital', telecom: 'Telecom',
};
export const AGENCIES = ['All', 'BESCOM', 'BWSSB', 'Hospital', 'Telecom'];

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

export function buildAlerts(result, nodesById, dependentsOf) {
  if (!result) return [];
  const first = new Map(), firstDown = new Map(), firstBackup = new Map();
  for (const ev of result.timeline) {
    if (ev.state === 'UP') continue;
    if (!first.has(ev.id)) first.set(ev.id, ev);
    if (ev.state === 'DOWN' && !firstDown.has(ev.id)) firstDown.set(ev.id, ev);
    if (ev.state === 'BACKUP' && !firstBackup.has(ev.id)) firstBackup.set(ev.id, ev);
  }
  const forced = new Map((result.failures || []).map((f) => [f.id, f]));
  const hospitalsHit = (id) => {
    let c = 0;
    for (const d of downstream(id, dependentsOf)) if (nodesById.get(d)?.kind === 'hospital' && firstDown.has(d)) c++;
    return c;
  };
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
    const hosp = n.kind === 'hospital' ? 0 : hospitalsHit(id);
    let severity = 'watch';
    if (isForced || (failAt != null && failAt - hitAt <= 3)) severity = 'critical';
    else if (failAt != null) severity = 'high';

    let title = `${n.name}`, detail = '', action = null;
    if (n.kind === 'substation' || n.kind === 'substation_tx' || n.kind === 'feeder') {
      if (isForced) {
        title = `${n.name} is down`;
        detail = `${forced.get(id).reason}. ${hosp} hospital${hosp === 1 ? '' : 's'} depend on it. Repair this first.`;
        action = { type: 'priority_repair', label: 'Prioritise repair' };
      } else {
        title = `${n.name} lost supply`;
        detail = 'The substation feeding it failed. Restoring that one restores this.';
      }
    } else if (n.kind === 'pump') {
      title = `${n.name} stopped`;
      detail = isForced ? `${forced.get(id).reason}. Reservoirs on this line start draining.`
        : /power/.test(why) ? 'Its power line failed. Ask BESCOM for priority restore.' : 'The upstream stage stopped sending water.';
    } else if (n.kind === 'reservoir') {
      title = failAt != null ? `${n.name} will run dry` : `${n.name} on reserve`;
      detail = /power/.test(why)
        ? `Lost power for distribution pumps at ${hr(hitAt)}. ${hosp} hospitals depend on it.`
        : `Inflow stopped at ${hr(hitAt)}${failAt != null ? `; empties at ${hr(failAt)}` : ''}. ${hosp} hospitals depend on it.`;
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
      if (resource === 'water') {
        title = `${n.name}: water supply`;
        detail = failAt != null
          ? `City water stops at ${hr(hitAt)}; your tank lasts until ${hr(failAt)}. Order a tanker now and cut non-essential use.`
          : `City water stops at ${hr(hitAt)}; your tank should cover it. Conserve water.`;
        action = { type: 'tanker', label: 'Send water tanker' };
      } else {
        title = `${n.name}: power supply`;
        detail = failAt != null
          ? `On diesel from ${hr(hitAt)}; diesel lasts until ${hr(failAt)}. Arrange refuelling or a mobile generator.`
          : `On diesel from ${hr(hitAt)}; diesel should cover it. Check stock.`;
        action = { type: 'generator', label: 'Send mobile generator' };
      }
    } else if (n.kind === 'telecom') {
      title = `${n.name}: on battery`;
      detail = failAt != null ? `Battery runs out at ${hr(failAt)}. Send a generator.` : 'Battery should last.';
      action = failAt != null ? { type: 'generator', label: 'Send generator' } : null;
    }
    alerts.push({ id: `a_${id}`, nodeId: id, name: n.name, kind: n.kind, agency: AGENCY[n.kind] || 'City',
      severity, hitAt, failAt, resource, hosp, title, detail, action, forced: isForced });
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

export { fmtH };
