// Tests for the browser-side logic that isn't the engine: link strength, reports, alerts and responses.
// Run from the project folder:  node --test tools/test_web.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGraph, nodesInPolygon, simulateWith } from '../web/src/engine.js';
import { backupHours, buildLinks, circlePolygon, distanceKm, escapeHtml, hospitalCounts, linkCounts, linkStrength, nearestNode,
  reportMissing, reportScenario, reportTarget, satelliteUrl } from '../web/src/mapkit.js';
import { REPORT_AGENCIES, agencyOf, agencyReport, autoResponses, buildAlerts, responsesToPlan } from '../web/src/alerts.js';
import * as core from '../web/src/core.js';

const data = JSON.parse(readFileSync(new URL('../web/public/data/domino.json', import.meta.url)));
core.init(data);
const defaults = Object.fromEntries(Object.entries(data.meta.params).map(([k, v]) => [k, v.value]));
const graph = buildGraph(data, defaults);
const nodesById = new Map(data.graph.nodes.map((n) => [n.id, n]));
const depsOf = new Map(Object.entries(data.graph.deps));
const dependentsOf = new Map();
for (const [to, groups] of depsOf) for (const g of groups) for (const p of g.providers) {
  if (!dependentsOf.has(p)) dependentsOf.set(p, []);
  dependentsOf.get(p).push(to);
}
const firstOf = (kind) => data.graph.nodes.find((n) => n.kind === kind);
const alertsFor = (r) => buildAlerts(r, nodesById, dependentsOf, depsOf, defaults);

test('link strength follows the README rules', () => {
  assert.equal(linkStrength(2, 0), 'strong');
  assert.equal(linkStrength(1, 6), 'medium');
  assert.equal(linkStrength(1, 5.9), 'weak');
  assert.equal(linkStrength(1, 0), 'weak');
});

test('sliders change link strength', () => {
  const h = firstOf('hospital');
  assert.equal(backupHours(h, 'water', { hospital_water_h: 2 }), 2);
  assert.equal(backupHours(h, 'water', {}), defaults.hospital_water_h);
  const counts = hospitalCounts(nodesById, dependentsOf);
  const strengthOfWater = (p) => buildLinks(nodesById, depsOf, counts, p).find((l) => l.to === h.id && l.resource === 'water').strength;
  assert.equal(strengthOfWater({ hospital_water_h: 8 }), 'medium');
  assert.equal(strengthOfWater({ hospital_water_h: 2 }), 'weak');
});

test('links only join places on the map, and the legend adds up', () => {
  const links = buildLinks(nodesById, depsOf, hospitalCounts(nodesById, dependentsOf), defaults);
  assert.ok(links.length > 0);
  for (const l of links) assert.ok(nodesById.get(l.from).on_map !== false && nodesById.get(l.to).on_map !== false);
  const c = linkCounts(links);
  assert.equal(c.strong + c.medium + c.weak, c.total);
  assert.ok(c.weakPct >= 0 && c.weakPct <= 100);
});

test('a report snaps to the nearest facility of the right type', () => {
  const sub = firstOf('substation'), res = firstOf('reservoir');
  const at = (n) => ({ lon: n.lon + 0.0001, lat: n.lat });
  assert.equal(reportTarget({ kind: 'power', where: at(sub) }, nodesById).node.id, sub.id);
  assert.equal(reportTarget({ kind: 'water', where: at(res) }, nodesById).node.id, res.id);
  assert.equal(nearestNode(sub.lon, sub.lat, nodesById.values(), ['hospital']).kind, 'hospital');
});

test('a flood circle is the requested width', () => {
  const poly = circlePolygon(77.6, 12.97, 2000);
  const across = distanceKm(poly[0][1], poly[0][0], poly[20][1], poly[20][0]);
  assert.ok(Math.abs(across - 2) < 0.01, `2 km circle measured ${across}`);
  assert.deepEqual(nodesInPolygon({ nodes: nodesById }, circlePolygon(0, 0, 500)), []);
});

test('a report needs all four answers and "not sure" assumes the default repair time', () => {
  const sub = firstOf('substation');
  const base = { kind: 'power', where: { lon: sub.lon, lat: sub.lat }, widthM: 1000, reporter: null };
  const t = reportTarget(base, nodesById);
  assert.equal(reportMissing({ ...base, kind: null }, t), 'what happened');
  assert.equal(reportMissing({ ...base, where: null }, t), 'where it happened');
  assert.equal(reportMissing(base, t), 'how long it lasts');
  assert.equal(reportMissing({ ...base, hours: 4 }, t), 'who is reporting');
  assert.equal(reportMissing({ ...base, hours: 4, reporter: 'citizen' }, t), null);
  const sc = reportScenario({ ...base, hours: null, reporter: 'citizen' }, t, 12);
  assert.equal(sc.report.verified, false);
  assert.equal(sc.body.failures[0].repair_h, 12);
  assert.match(sc.note, /12 h assumed/);
  assert.equal(reportScenario({ ...base, hours: 4, reporter: 'bescom' }, t, 12).report.verified, true);
});

test('a flood report over open ground cannot be sent', () => {
  const r = { kind: 'flood', where: { lon: 0, lat: 0 }, widthM: 500, hours: 4, reporter: 'citizen' };
  assert.match(reportMissing(r, reportTarget(r, nodesById)), /facilities/);
});

test('a reported flood runs for the reported time', () => {
  const sub = firstOf('substation');
  const r = { kind: 'flood', where: { lon: sub.lon, lat: sub.lat }, widthM: 2000, hours: 2, reporter: 'citizen' };
  const t = reportTarget(r, nodesById);
  const sim = core.simulate(reportScenario(r, t, 12).body);
  assert.ok(sim.failures.length >= 1);
  assert.ok(sim.failures.every((f) => f.repair_h === 2));
});

test('hospital alert times match the engine, per resource', () => {
  for (const scenario of Object.keys(data.meta.scenarios)) {
    const r = core.simulate({ scenario });
    const alerts = alertsFor(r).filter((a) => a.kind === 'hospital');
    for (const h of r.hospitals) {
      const failAts = alerts.filter((a) => a.nodeId === h.id && a.failAt != null).map((a) => a.failAt);
      if (h.down_at_h != null) assert.ok(Math.abs(Math.min(...failAts) - h.down_at_h) < 1e-3, `${scenario} ${h.id}: ${failAts} vs ${h.down_at_h}`);
      else assert.deepEqual(failAts, [], `${scenario} ${h.id} never fails`);
    }
  }
});

test('hospital alert ids are unique and offer the right help', () => {
  const r = core.simulate({ scenario: 'orr_flood', failures: [{ id: 'feeder_cauvery_tk_halli', repair_h: 12 }] });
  const alerts = alertsFor(r);
  assert.equal(new Set(alerts.map((a) => a.id)).size, alerts.length);
  for (const a of alerts.filter((x) => x.kind === 'hospital')) assert.equal(a.action.type, a.resource === 'water' ? 'tanker' : 'generator');
});

test('a knocked-out reservoir gets a repair, not a relink', () => {
  const res = firstOf('reservoir');
  const r = core.simulate({ failures: [{ id: res.id, repair_h: 12, reason: 'no water reported' }] });
  const a = alertsFor(r).find((x) => x.nodeId === res.id);
  assert.equal(a.action.type, 'priority_repair');
  const plan = responsesToPlan(alertsFor(r), [{ alertId: a.id, at: 1 }], r.failures);
  assert.equal(plan.repair_overrides[res.id], 5);
});

test('responding to every alert in time never makes things worse, and saves hospitals', () => {
  const body = { scenario: 'orr_flood', failures: [{ id: 'feeder_cauvery_tk_halli', repair_h: 12 }] };
  const r = core.simulate(body);
  assert.ok(r.hospitals_down > 0, 'the scenario should hurt hospitals');
  const alerts = alertsFor(r);
  const plan = responsesToPlan(alerts, autoResponses(alerts, 1), r.failures);
  const after = core.simulate({ ...body, interventions: plan.interventions, repair_overrides: plan.repair_overrides });
  assert.ok(after.impact_hospital_hours < r.impact_hospital_hours / 2, `${r.impact_hospital_hours} -> ${after.impact_hospital_hours}`);
  assert.ok(after.hospitals_down <= r.hospitals_down);
  assert.equal(simulateWith(graph, [], 72).hospitals_down, 0);
});

test('names from map data cannot inject markup', () => {
  assert.equal(escapeHtml('<img onerror=x>&"'), '&lt;img onerror=x&gt;&amp;&quot;');
});

test('satellite close-up is a keyless image request centred on the place', () => {
  const u = new URL(satelliteUrl(12.97, 77.6));
  const [w, s, e, n] = u.searchParams.get('bbox').split(',').map(Number);
  assert.ok(Math.abs((w + e) / 2 - 77.6) < 1e-5 && Math.abs((s + n) / 2 - 12.97) < 1e-5);
  assert.equal(u.searchParams.get('f'), 'image');
});

const sc = { label: 'Test scenario' };
const reportFor = (agency, body) => {
  const result = core.simulate(body);
  return agencyReport(agency, { scenario: sc, result, alerts: alertsFor(result), nodesById, dependentsOf });
};
const feeder = { failures: [{ id: 'feeder_cauvery_tk_halli', repair_h: 12, reason: 'line damaged' }] };

test('alerts go to the authority that owns the facility', () => {
  assert.equal(agencyOf({ kind: 'feeder' }), 'KPTCL');
  assert.equal(agencyOf({ kind: 'substation_tx' }), 'KPTCL');
  assert.equal(agencyOf({ kind: 'substation', meta: { voltage_kv: 66 } }), 'KPTCL');
  assert.equal(agencyOf({ kind: 'substation', meta: { voltage_kv: 33 } }), 'BESCOM');
  assert.equal(agencyOf({ kind: 'substation', meta: { voltage_kv: null } }), 'BESCOM');
  assert.equal(agencyOf({ kind: 'pump' }), 'BWSSB');
  assert.equal(agencyOf({ kind: 'reservoir' }), 'BWSSB');
  const r = core.simulate(feeder);
  const a = alertsFor(r).find((x) => x.nodeId === 'feeder_cauvery_tk_halli');
  assert.equal(a.agency, 'KPTCL');
});

test('every report says it is a simulation, not a real incident', () => {
  for (const agency of Object.keys(REPORT_AGENCIES)) assert.match(reportFor(agency, feeder).text, /SIMULATION ESTIMATE\. NOT A CONFIRMED INCIDENT/);
});

test('a power line failure reports to both KPTCL and BWSSB, each with its own facilities', () => {
  const k = reportFor('KPTCL', feeder), b = reportFor('BWSSB', feeder);
  assert.ok(k.count >= 1 && b.count > k.count);
  assert.match(k.text, /Dedicated power line/);
  assert.doesNotMatch(k.text, /will run dry/);
  assert.match(b.text, /TK Halli|will run dry|stopped/);
  assert.doesNotMatch(b.text, /Dedicated power line to .* is down/);
});

test('the pumps are one line, so reservoirs still make the list', () => {
  const b = reportFor('BWSSB', feeder);
  assert.match(b.text, /15 Cauvery pump units stopped \(Stage I, II, III, IV, V\)/);
  assert.equal((b.text.match(/TK Halli - Stage/g) || []).length, 0);
  assert.match(b.text, /will run dry|on reserve/);
});

test('something already down does not say it fails at hour 0', () => {
  const k = reportFor('KPTCL', feeder);
  assert.match(k.text, /since hour 0/);
  assert.doesNotMatch(k.text, /by hour 0/);
});

test('facilities on the map come with a location; off-map lines do not', () => {
  const sub = firstOf('substation');
  const body = { failures: [{ id: sub.id, repair_h: 4, reason: 'cut' }, ...feeder.failures] };
  const result = core.simulate(body);
  const text = [agencyReport('BESCOM', { scenario: sc, result, alerts: alertsFor(result), nodesById, dependentsOf }).text,
    agencyReport('KPTCL', { scenario: sc, result, alerts: alertsFor(result), nodesById, dependentsOf }).text].join('\n');
  assert.ok(text.includes(`[${sub.lat.toFixed(4)}, ${sub.lon.toFixed(4)}]`));
  assert.match(text, /Dedicated power line to TK Halli is down since hour 0: /);
});

test('a pump flood has nothing for KPTCL', () => {
  const r = reportFor('KPTCL', { scenario: 'tk_halli_2022' });
  assert.equal(r.count, 0);
  assert.ok(reportFor('BWSSB', { scenario: 'tk_halli_2022' }).count > 0);
});

test('report counts match the simulation', () => {
  const result = core.simulate(feeder);
  const down = result.hospitals_down;
  const b = reportFor('BWSSB', feeder);
  assert.ok(b.hospitals <= down);
  assert.ok(b.hospitals > 0);
});

test('reports stay short enough for email and WhatsApp links', () => {
  const body = { scenario: 'orr_flood', failures: feeder.failures };
  for (const agency of Object.keys(REPORT_AGENCIES)) assert.ok(encodeURIComponent(reportFor(agency, body).text).length < 2000);
});

test('a reporter and the effect of responses appear when known', () => {
  const result = core.simulate(feeder);
  const text = agencyReport('BWSSB', { scenario: { ...sc, report: { reporter: 'Citizen', verified: false } }, result,
    alerts: alertsFor(result), nodesById, dependentsOf, respResult: { hospitals_down: 0 } }).text;
  assert.match(text, /Reported by: Citizen \(unverified\)/);
  assert.match(text, /-> 0\./);
});
