// Tests for routing, priority scoring, duplicate grouping and analysis.
// Run from the project folder:  node --test tools/test_complaints.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALERT_ADVICE, AREAS, CASCADE_KIND, CATEGORIES, CITIZEN_GROUPS, CITIZEN_STATUS, DEPARTMENTS, STATUSES, nearestArea, activeAlerts, alertShareText, analyse, bandOf, groupComplaints, makeComplaint, sampleComplaints, scoreComplaint,
  shareText, slaState, suggestCategory, withStatus } from '../web/src/complaints.js';
import { CONTACT_GROUPS, EMERGENCY, HELP_TOPICS, searchContacts, telHref, whatsappHref } from '../web/src/contacts.js';

const H = 3600 * 1000, NOW = 1_800_000_000_000;
const hospital = { id: 'h', kind: 'hospital', name: 'City Hospital', lat: 12.97, lon: 77.59, on_map: true };
const substation = { id: 's', kind: 'substation', name: 'Sub A', lat: 12.90, lon: 77.50, on_map: true };
const nodes = [hospital, substation];
const make = (over = {}, ageH = 0) => makeComplaint({ category: 'pothole', hazard: 'low', lat: 13.2, lon: 77.8, ...over }, NOW - ageH * H);

test('every category routes to a real department with a helpline', () => {
  for (const c of Object.values(CATEGORIES)) assert.ok(DEPARTMENTS[c.dept]?.helpline, c.label);
  assert.equal(CATEGORIES.pothole.dept, 'roads');
  assert.equal(CATEGORIES.flood.dept, 'drains');
  assert.equal(CATEGORIES.sewage.dept, 'water');
  assert.equal(CATEGORIES.power_line.dept, 'power');
});

test('the score adds up from its listed parts', () => {
  const r = scoreComplaint(make({ hazard: 'high' }), { nodes, now: NOW });
  assert.equal(r.score, r.parts.reduce((s, p) => s + p.points, 0));
  assert.equal(r.score, 45);
});

test('a problem beside a hospital outranks the same problem elsewhere', () => {
  const near = scoreComplaint(make({ lat: 12.971, lon: 77.59 }), { nodes, now: NOW });
  const far = scoreComplaint(make(), { nodes, now: NOW });
  assert.equal(near.score - far.score, 15);
  assert.ok(near.parts.some((p) => p.label.includes('City Hospital')));
});

test('a flood beside a substation scores more, a pothole there does not', () => {
  const at = { lat: 12.901, lon: 77.50 };
  const floodBoost = scoreComplaint(make({ ...at, category: 'flood' }), { nodes, now: NOW }).score - scoreComplaint(make({ category: 'flood' }), { nodes, now: NOW }).score;
  const potholeBoost = scoreComplaint(make(at), { nodes, now: NOW }).score - scoreComplaint(make(), { nodes, now: NOW }).score;
  assert.equal(floodBoost, 10);
  assert.equal(potholeBoost, 0);
});

test('scores cap at 100 and bands follow the thresholds', () => {
  const r = scoreComplaint(make({ category: 'power_line', hazard: 'high', lat: 12.9701, lon: 77.59 }, 10), { nodes: [...nodes, { ...substation, lat: 12.97, lon: 77.59 }], reports: 9, now: NOW });
  assert.equal(r.score, 100);
  assert.deepEqual([70, 69, 50, 49, 30, 29].map((s) => bandOf(s).id), ['critical', 'high', 'high', 'medium', 'medium', 'low']);
});

test('older and overdue jobs rise, and closed ones stop ageing', () => {
  const fresh = scoreComplaint(make(), { now: NOW }).score;
  const waiting = scoreComplaint(make({}, 36), { now: NOW }).score;
  const late = scoreComplaint(make({}, 100), { now: NOW }).score;
  assert.ok(fresh < waiting && waiting < late);
  const closed = withStatus(make({}, 100), 'resolved', NOW);
  assert.equal(scoreComplaint(closed, { now: NOW }).score, fresh);
  assert.equal(slaState(closed, NOW).overdue, false);
});

test('reports within 100 m of the same kind become one job; others stay separate', () => {
  const a = make({}, 3), b = make({ lat: 13.2005 }, 2), far = make({ lat: 13.21 }, 1), other = make({ category: 'garbage' }, 1);
  const groups = groupComplaints([a, b, far, other], nodes, NOW);
  assert.equal(groups.length, 3);
  const job = groups.find((g) => g.lead.id === a.id);
  assert.equal(job.members.length, 2);
  assert.ok(job.parts.some((p) => p.label === '2 people reported this' && p.points === 3));
});

test('a later "dangerous" report raises the whole job', () => {
  const a = make({}, 2), b = make({ hazard: 'high' }, 1);
  const [job] = groupComplaints([a, b], nodes, NOW);
  assert.equal(job.lead.id, a.id);
  assert.ok(job.parts.some((p) => p.points === 20));
});

test('a new report at a resolved spot opens a new job', () => {
  const old = withStatus(make({}, 200), 'resolved', NOW - 100 * H);
  assert.equal(groupComplaints([old, make()], nodes, NOW).length, 2);
});

test('the queue is sorted most urgent first', () => {
  const scores = groupComplaints(sampleComplaints([...nodes, { ...hospital, id: 'h2', lat: 12.8 }], NOW), nodes, NOW).map((g) => g.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test('status changes keep a history and ignore repeats', () => {
  const a = make();
  const b = withStatus(a, 'assigned', NOW + H);
  assert.equal(b.history.length, 2);
  assert.equal(withStatus(b, 'assigned', NOW + 2 * H), b);
  assert.equal(a.status, 'new');
});

test('analysis counts and median fix time are right', () => {
  const closed = (h) => withStatus(make({ lat: 12 + h / 100 }, 200), 'resolved', NOW - 200 * H + h * H);
  const s = analyse([closed(10), closed(20), closed(60), make({ category: 'flood' }), make({}, 500)], nodes, NOW);
  assert.equal(s.reports, 5);
  assert.equal(s.resolved, 3);
  assert.equal(s.medianResolveH, 20);
  assert.equal(s.open, 2);
  assert.equal(s.overdue, 1);
  assert.equal(s.byBand.reduce((t, b) => t + b.count, 0), s.open);
  assert.equal(analyse([], nodes, NOW).medianResolveH, null);
});

test('hotspots rank the area with the most open reports first', () => {
  const crowd = [0, 0.0002, 0.0004].map((d) => make({ lat: 12.971 + d, lon: 77.59 }));
  const s = analyse([...crowd, make()], nodes, NOW);
  assert.equal(s.hotspots[0].reports, 3);
  assert.equal(s.hotspots[0].near, 'City Hospital');
});

test('the description suggests a category; unknown words suggest nothing', () => {
  assert.equal(suggestCategory('huge POTHOLE near my house'), 'pothole');
  assert.equal(suggestCategory('road is flooded after rain'), 'flood');
  assert.equal(suggestCategory('burst pipe'), 'water_leak');
  assert.equal(suggestCategory('hello there'), null);
});

test('complaint ids are readable and the shared text carries the location', () => {
  const c = make({ description: 'Deep' });
  assert.match(c.id, /^BLR-\d{8}-[0-9A-Z]{4}$/);
  const t = shareText(c, 'Roads');
  assert.match(t, /To: Roads/);
  assert.match(t, /query=13\.200000,77\.800000/);
});

test('only problems the cascade map can simulate link to it', () => {
  assert.equal(CASCADE_KIND.flood, 'flood');
  assert.equal(CASCADE_KIND.power_line, 'power');
  assert.equal(CASCADE_KIND.pothole, undefined);
});

test('sample complaints work on the shipped data and are all marked', () => {
  const data = JSON.parse(readFileSync(new URL('../web/public/data/domino.json', import.meta.url)));
  const list = sampleComplaints(data.graph.nodes, NOW);
  assert.ok(list.length >= 10);
  assert.ok(list.every((c) => c.sample));
  assert.equal(new Set(list.map((c) => c.id)).size, list.length);
  const s = analyse(list, data.graph.nodes, NOW);
  assert.ok(s.open > 0 && s.resolved > 0 && s.overdue > 0);
});

test('alerts near a place: inside the radius only, and most urgent first', () => {
  const near = make({ category: 'flood', hazard: 'high', lat: 13.0, lon: 77.6 });
  const pothole = make({ lat: 13.001, lon: 77.6 });
  const far = make({ category: 'flood', lat: 13.2, lon: 77.6 });
  const alerts = activeAlerts([near, pothole, far], nodes, NOW, { lat: 13.0, lon: 77.6 }, 5);
  assert.deepEqual(alerts.map((a) => a.lead.id), [near.id, pothole.id]);
  assert.ok(alerts[0].km < 0.01);
  assert.equal(activeAlerts([near, pothole, far], nodes, NOW).length, 3);
});

test('problems nobody needs warning about do not alert, and fixed ones stop', () => {
  assert.equal(activeAlerts([make({ category: 'garbage' })], nodes, NOW).length, 0);
  assert.equal(activeAlerts([make({ category: 'no_water' })], nodes, NOW).length, 0);
  assert.equal(activeAlerts([withStatus(make(), 'resolved', NOW)], nodes, NOW).length, 0);
});

test('every category that alerts has advice; heavy rain and traffic are reportable', () => {
  for (const k of Object.keys(ALERT_ADVICE)) assert.ok(CATEGORIES[k], k);
  assert.equal(CATEGORIES.heavy_rain.dept, 'disaster');
  assert.equal(CATEGORIES.traffic.dept, 'traffic');
  assert.equal(suggestCategory('huge traffic jam here'), 'traffic');
  assert.equal(suggestCategory('heavy rain since morning'), 'heavy_rain');
});

test('rain and traffic reports pass after a few hours; potholes do not', () => {
  const list = [make({ category: 'traffic' }, 3), make({ category: 'heavy_rain' }, 4), make({ lat: 12 }, 300)];
  const alerts = activeAlerts(list, nodes, NOW);
  assert.deepEqual(alerts.map((a) => a.lead.category), ['pothole']);
  assert.equal(activeAlerts([make({ category: 'traffic' }, 1)], nodes, NOW).length, 1);
  assert.equal(analyse(list, nodes, NOW).reports, 1);
});

test('heavy rain merges over a wider area than a pothole', () => {
  const rain = [make({ category: 'heavy_rain' }), make({ category: 'heavy_rain', lat: 13.205 })];
  assert.equal(groupComplaints(rain, nodes, NOW).length, 1);
  assert.equal(groupComplaints([make(), make({ lat: 13.205 })], nodes, NOW).length, 2);
});

test('heavy traffic is linked to a nearby flood, not to a far one', () => {
  const traffic = make({ category: 'traffic' });
  const link = (other) => activeAlerts([traffic, other], nodes, NOW).find((a) => a.lead.id === traffic.id).causes;
  assert.equal(link(make({ category: 'flood', lat: 13.205 }))[0].category, 'flood');
  assert.equal(link(make({ category: 'flood', lat: 13.3 })).length, 0);
});

test('a shared alert says it is unconfirmed and where it is', () => {
  const [a] = activeAlerts([make({ category: 'flood' })], nodes, NOW);
  const t = alertShareText(a);
  assert.match(t, /Not officially confirmed/);
  assert.match(t, /query=13\.200000/);
});

test('every listed contact is dialable and has a source', () => {
  for (const g of CONTACT_GROUPS) for (const c of g.items) {
    assert.ok(c.source?.startsWith('http'), c.name);
    assert.ok(['official', 'older'].includes(c.status), c.name);
    assert.ok(c.number || c.whatsapp, c.name);
    if (c.number) assert.match(telHref(c.number), /^tel:\d{3,11}$/, c.name);
    if (c.whatsapp) assert.match(whatsappHref(c.whatsapp), /^https:\/\/wa\.me\/91\d{10}$/, c.name);
  }
});

test('the directory covers each authority asked for', () => {
  const text = JSON.stringify(CONTACT_GROUPS);
  for (const n of ['BWSSB', 'KPTCL', 'BESCOM', 'GBA / BBMP', 'Traffic', 'Victoria Hospital', 'NIMHANS', 'Jayadeva']) assert.ok(text.includes(n), n);
  for (const e of EMERGENCY) assert.ok(text.includes(`"number":"${e.number}"`), e.number);
});

test('searching numbers finds the right authority', () => {
  assert.deepEqual(searchContacts('kptcl').map((g) => g.id), ['power']);
  assert.ok(searchContacts('kptcl')[0].items.every((c) => c.name.includes('KPTCL')));
  assert.ok(searchContacts('1916')[0].items[0].name.includes('BWSSB'));
  assert.equal(searchContacts('hospital')[0].items.length, CONTACT_GROUPS.find((g) => g.id === 'hospital').items.length);
  assert.equal(searchContacts('nothing matches this').length, 0);
  assert.equal(searchContacts('').length, CONTACT_GROUPS.length);
});

test('help topics point at real groups', () => {
  for (const [id, t] of Object.entries(HELP_TOPICS)) if (t.group) assert.ok(CONTACT_GROUPS.some((g) => g.id === t.group), id);
});

test('the report form offers every problem exactly once, each with an icon', () => {
  const ids = CITIZEN_GROUPS.flatMap((g) => g.ids);
  assert.deepEqual([...ids].sort(), Object.keys(CATEGORIES).sort());
  for (const c of Object.values(CATEGORIES)) assert.ok(c.icon, c.label);
});

test('every status has a citizen wording', () => {
  for (const s of STATUSES) assert.ok(CITIZEN_STATUS[s], s);
});

test('a spot is named after its nearest area, and only when it is close', () => {
  assert.equal(nearestArea(12.9352, 77.6245).name, 'Koramangala');
  assert.equal(nearestArea(12.936, 77.63).name, 'Koramangala');
  assert.equal(nearestArea(13.5, 78.5), null);
  for (const a of AREAS) assert.equal(nearestArea(a.lat, a.lon).name, a.name);
});
