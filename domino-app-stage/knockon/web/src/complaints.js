// Public complaints: who is responsible, how urgent it is, and what the pattern looks like.
// Pure logic (no browser APIs), tested by tools/test_complaints.mjs.
import { distanceKm } from './mapkit.js';

// Helplines come from official pages: see contacts.js for each number's source.
export const DEPARTMENTS = {
  roads: { name: 'GBA / BBMP Road Infrastructure', short: 'Roads', helpline: '1533' },
  drains: { name: 'GBA / BBMP Storm Water Drains', short: 'Storm drains', helpline: '1533' },
  waste: { name: 'GBA / BBMP Solid Waste', short: 'Solid waste', helpline: '1533' },
  lights: { name: 'GBA / BBMP Electrical (street lights)', short: 'Street lights', helpline: '1533' },
  trees: { name: 'GBA / BBMP Forest Cell', short: 'Trees', helpline: '1533' },
  water: { name: 'BWSSB (water and sewage)', short: 'BWSSB', helpline: '1916' },
  power: { name: 'BESCOM (electricity)', short: 'BESCOM', helpline: '1912' },
  kptcl: { name: 'KPTCL (high-voltage network)', short: 'KPTCL', helpline: '080-22228367' },
  traffic: { name: 'Bengaluru Traffic Police', short: 'Traffic police', helpline: '080-25588444' },
  disaster: { name: 'State disaster helpline (KSDMA)', short: 'Disaster help', helpline: '1070' },
};

// base = how dangerous this kind of problem is on its own; slaH = target hours to fix.
// Both are ASSUMPTIONS for this demo, not official service levels.
export const CATEGORIES = {
  pothole: { icon: '🕳️', label: 'Pothole / road damage', dept: 'roads', base: 25, slaH: 72, words: ['pothole', 'road', 'crater', 'caved', 'footpath'] },
  flood: { icon: '🌊', label: 'Flooding / waterlogging', dept: 'drains', base: 40, slaH: 12, words: ['flood', 'waterlog', 'submerged', 'stagnant', 'drain', 'rainwater'] },
  water_leak: { icon: '💧', label: 'Water leak / burst pipe', dept: 'water', base: 25, slaH: 24, words: ['leak', 'burst', 'pipe'] },
  no_water: { icon: '🚱', label: 'No water supply', dept: 'water', base: 30, slaH: 24, words: ['no water', 'water supply', 'tanker', 'dry tap'] },
  sewage: { icon: '🚽', label: 'Sewage overflow', dept: 'water', base: 30, slaH: 24, words: ['sewage', 'manhole', 'overflow', 'sewer', 'smell'] },
  power_line: { icon: '⚡', label: 'Fallen wire / power fault', dept: 'power', base: 50, slaH: 4, words: ['wire', 'electric', 'transformer', 'power', 'shock', 'spark'] },
  transmission: { icon: '🗼', label: 'High-voltage tower / line', dept: 'kptcl', base: 45, slaH: 4, words: ['tower', 'high voltage', 'high-voltage', 'transmission', 'pylon'] },
  street_light: { icon: '💡', label: 'Street light not working', dept: 'lights', base: 15, slaH: 72, words: ['street light', 'streetlight', 'lamp', 'dark'] },
  garbage: { icon: '🗑️', label: 'Garbage not cleared', dept: 'waste', base: 15, slaH: 48, words: ['garbage', 'waste', 'trash', 'dump', 'rubbish'] },
  fallen_tree: { icon: '🌳', label: 'Fallen tree / branch', dept: 'trees', base: 35, slaH: 12, words: ['tree', 'branch'] },
  signal: { icon: '🚦', label: 'Traffic signal fault', dept: 'traffic', base: 30, slaH: 12, words: ['signal', 'traffic light'] },
  // These pass on their own, so reports drop out after `lastsH`, and they cover a wider area than one spot.
  heavy_rain: { icon: '🌧️', label: 'Heavy rainfall', dept: 'disaster', base: 30, slaH: 3, lastsH: 3, dupM: 1000, words: ['heavy rain', 'rainfall', 'downpour', 'cloudburst', 'raining'] },
  traffic: { icon: '🚗', label: 'Heavy traffic', dept: 'traffic', base: 20, slaH: 2, lastsH: 2, dupM: 300, words: ['traffic', 'jam', 'congestion', 'gridlock', 'stuck'] },
};

// How the report form groups problems, so nobody has to read all of them to find theirs.
export const CITIZEN_GROUPS = [
  { label: 'Road and traffic', ids: ['pothole', 'traffic', 'signal', 'fallen_tree'] },
  { label: 'Water and rain', ids: ['flood', 'heavy_rain', 'water_leak', 'no_water', 'sewage'] },
  { label: 'Power, lights and waste', ids: ['power_line', 'transmission', 'street_light', 'garbage'] },
];

// Approximate centres, for choosing an area and naming a spot. Not boundaries.
export const AREAS = [
  ['Banashankari', 12.9255, 77.5468], ['Bellandur', 12.9304, 77.6784], ['BTM Layout', 12.9166, 77.6101], ['Electronic City', 12.8452, 77.6602],
  ['Hebbal', 13.0358, 77.5970], ['HSR Layout', 12.9116, 77.6389], ['Indiranagar', 12.9784, 77.6408], ['Jayanagar', 12.9308, 77.5838],
  ['KR Puram', 13.0075, 77.6959], ['Koramangala', 12.9352, 77.6245], ['Majestic', 12.9767, 77.5713], ['Malleshwaram', 13.0035, 77.5710],
  ['Marathahalli', 12.9569, 77.7011], ['MG Road', 12.9756, 77.6050], ['Rajajinagar', 12.9882, 77.5540], ['Whitefield', 12.9698, 77.7500],
  ['Yelahanka', 13.1007, 77.5963],
].map(([name, lat, lon]) => ({ name, lat, lon }));

export function nearestArea(lat, lon, maxKm = 4) {
  let best = null, bestKm = maxKm;
  for (const a of AREAS) {
    const km = distanceKm(lat, lon, a.lat, a.lon);
    if (km <= bestKm) { best = a; bestKm = km; }
  }
  return best;
}

// What other people are told when a report is near them. Problems nobody needs warning about have no entry.
export const ALERT_ADVICE = {
  pothole: 'Slow down here, especially on a two-wheeler or at night.',
  flood: 'Avoid this road if you can. Do not walk or drive through standing water. Expect slow traffic nearby.',
  heavy_rain: 'Low roads and underpasses may flood soon. Leave extra time or delay travel.',
  traffic: 'Expect delays. Choose another route if you can.',
  power_line: 'Keep well away and do not touch anything near the wire.',
  transmission: 'Keep well away from the tower and any fallen line.',
  sewage: 'Take care on foot, as the manhole may be open.',
  fallen_tree: 'The road may be partly blocked. Choose another route if you can.',
  signal: 'Signal not working. Treat the junction with care.',
};
const TRAFFIC_CAUSES = ['flood', 'heavy_rain', 'pothole', 'fallen_tree', 'signal'];
const CAUSE_RADIUS_KM = 1.5;

export const HAZARDS = {
  low: { label: 'An inconvenience', points: 0 },
  medium: { label: 'Blocking people or traffic', points: 10 },
  high: { label: 'Dangerous right now', points: 20 },
};

export const STATUSES = ['new', 'assigned', 'in_progress', 'resolved'];
export const CITIZEN_STATUS = { new: 'Reported', assigned: 'Assigned', in_progress: 'In progress', resolved: 'Fixed' };
export const STATUS_LABEL = { new: 'New', assigned: 'Assigned', in_progress: 'In progress', resolved: 'Resolved' };

export const BANDS = [
  { id: 'critical', label: 'Critical', min: 70 },
  { id: 'high', label: 'High', min: 50 },
  { id: 'medium', label: 'Medium', min: 30 },
  { id: 'low', label: 'Low', min: 0 },
];
export const bandOf = (score) => BANDS.find((b) => score >= b.min);

const H = 3600 * 1000;
export const DUPLICATE_M = 100;
const UTILITY_CATEGORIES = new Set(['flood', 'water_leak', 'no_water', 'sewage', 'power_line', 'transmission']);
// The incident types the cascade map can simulate.
export const CASCADE_KIND = { flood: 'flood', heavy_rain: 'flood', water_leak: 'water', no_water: 'water', power_line: 'power', transmission: 'power' };

// A suggestion from the words typed. The photo itself is not analysed.
export function suggestCategory(text) {
  const t = (text || '').toLowerCase();
  let best = null, bestScore = 0;
  for (const [id, c] of Object.entries(CATEGORIES)) {
    const score = c.words.reduce((s, w) => s + (t.includes(w) ? w.length : 0), 0);
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}

export function makeComplaint({ category, hazard, lat, lon, description = '', photo = null, sample = false, ownerId = null }, now = Date.now(), rand = Math.random) {
  const d = new Date(now);
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const tail = Math.floor(rand() * 36 ** 4).toString(36).toUpperCase().padStart(4, '0');
  return { id: `BLR-${day}-${tail}`, category, hazard, lat, lon, description: description.trim(), photo, sample, ownerId,
    createdAt: now, status: 'new', history: [{ status: 'new', at: now }] };
}

export function withStatus(c, status, now = Date.now()) {
  return c.status === status ? c : { ...c, status, history: [...c.history, { status, at: now }] };
}

export function slaState(c, now = Date.now()) {
  const dueAt = c.createdAt + CATEGORIES[c.category].slaH * H;
  return { dueAt, hoursLeft: (dueAt - now) / H, overdue: c.status !== 'resolved' && now > dueAt };
}

// What sits close to a place: this is where the complaint meets the dependency map.
export function nearbyCritical(lat, lon, nodes) {
  let hospital = null, hospitalKm = Infinity, utility = null, utilityKm = Infinity;
  for (const n of nodes) {
    if (n.on_map === false) continue;
    const isUtility = ['substation', 'substation_tx', 'reservoir'].includes(n.kind);
    if (n.kind !== 'hospital' && !isUtility) continue;
    const km = distanceKm(lat, lon, n.lat, n.lon);
    if (n.kind === 'hospital' && km < hospitalKm) { hospital = n; hospitalKm = km; }
    if (isUtility && km < utilityKm) { utility = n; utilityKm = km; }
  }
  return { hospital, hospitalKm, utility, utilityKm };
}

// Every point of the score is listed, so an officer can see why something is at the top.
export function scoreComplaint(c, { nodes = [], reports = 1, now = Date.now() } = {}) {
  const cat = CATEGORIES[c.category];
  const parts = [{ label: cat.label, points: cat.base }];
  if (HAZARDS[c.hazard]?.points) parts.push({ label: HAZARDS[c.hazard].label, points: HAZARDS[c.hazard].points });
  const near = nearbyCritical(c.lat, c.lon, nodes);
  if (near.hospitalKm <= 0.5) parts.push({ label: `Within 500 m of ${near.hospital.name}`, points: 15 });
  else if (near.hospitalKm <= 1) parts.push({ label: `Within 1 km of ${near.hospital.name}`, points: 8 });
  if (UTILITY_CATEGORIES.has(c.category) && near.utilityKm <= 0.3) parts.push({ label: `Within 300 m of ${near.utility.name}`, points: 10 });
  if (reports > 1) parts.push({ label: `${reports} people reported this`, points: Math.min(12, (reports - 1) * 3) });
  if (c.status !== 'resolved') {
    const ageH = (now - c.createdAt) / H;
    const late = slaState(c, now).overdue;
    const agePoints = late ? 10 : Math.min(5, Math.floor(ageH / 12));
    if (agePoints) parts.push({ label: late ? 'Past its target time' : `Waiting ${Math.floor(ageH)} h`, points: agePoints });
  }
  const score = Math.min(100, parts.reduce((s, p) => s + p.points, 0));
  return { score, band: bandOf(score), parts, near };
}

// Reports of the same kind of problem within 100 m become one job. Resolved ones stand alone.
export const isPassed = (c, now = Date.now()) => {
  const lasts = CATEGORIES[c.category].lastsH;
  return !!lasts && c.status !== 'resolved' && now - c.createdAt > lasts * H;
};

export function groupComplaints(list, nodes = [], now = Date.now()) {
  const groups = [];
  for (const c of [...list].filter((x) => !isPassed(x, now)).sort((a, b) => a.createdAt - b.createdAt)) {
    const home = c.status === 'resolved' ? null : groups.find((g) => g.lead.status !== 'resolved' && g.lead.category === c.category
      && distanceKm(g.lead.lat, g.lead.lon, c.lat, c.lon) * 1000 <= (CATEGORIES[c.category].dupM ?? DUPLICATE_M));
    if (home) home.members.push(c); else groups.push({ lead: c, members: [c] });
  }
  return groups.map((g) => {
    // The job carries the strongest reported hazard, so a later "dangerous" report still counts.
    const rank = { low: 0, medium: 1, high: 2 };
    const hazard = g.members.reduce((h, m) => (rank[m.hazard] > rank[h] ? m.hazard : h), g.lead.hazard);
    return { ...g, id: g.lead.id, ...scoreComplaint({ ...g.lead, hazard }, { nodes, reports: g.members.length, now }), sla: slaState(g.lead, now) };
  }).sort((a, b) => b.score - a.score || a.lead.createdAt - b.lead.createdAt);
}

// Warnings for people: open problems near a place, most urgent first. Without a place, all of them.
export function activeAlerts(list, nodes = [], now = Date.now(), at = null, radiusKm = 5) {
  const open = groupComplaints(list, nodes, now).filter((g) => g.lead.status !== 'resolved' && ALERT_ADVICE[g.lead.category]);
  return open.map((g) => {
    const km = at ? distanceKm(at.lat, at.lon, g.lead.lat, g.lead.lon) : null;
    const causes = g.lead.category !== 'traffic' ? [] : open
      .filter((o) => TRAFFIC_CAUSES.includes(o.lead.category))
      .map((o) => ({ category: o.lead.category, km: distanceKm(g.lead.lat, g.lead.lon, o.lead.lat, o.lead.lon) }))
      .filter((o) => o.km <= CAUSE_RADIUS_KM).sort((a, b) => a.km - b.km);
    return { ...g, km, causes, advice: ALERT_ADVICE[g.lead.category],
      latestAt: Math.max(...g.members.map((m) => m.createdAt)) };
  }).filter((g) => km_ok(g.km, radiusKm)).sort((a, b) => b.score - a.score || (a.km ?? 0) - (b.km ?? 0));
}
const km_ok = (km, radiusKm) => km === null || km <= radiusKm;

export function alertShareText(a) {
  return [`Alert: ${CATEGORIES[a.lead.category].label}`, a.advice, `${a.members.length} ${a.members.length === 1 ? 'person' : 'people'} reported this. Not officially confirmed.`,
    `Location: https://www.google.com/maps/search/?api=1&query=${a.lead.lat.toFixed(6)},${a.lead.lon.toFixed(6)}`].join('\n');
}

export function analyse(list, nodes = [], now = Date.now()) {
  const groups = groupComplaints(list, nodes, now);
  const open = groups.filter((g) => g.lead.status !== 'resolved');
  const tally = (items, key) => {
    const m = new Map();
    for (const it of items) m.set(key(it), (m.get(key(it)) || 0) + 1);
    return [...m].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
  };
  const resolveHours = list.filter((c) => c.status === 'resolved')
    .map((c) => (c.history.find((h) => h.status === 'resolved').at - c.createdAt) / H).sort((a, b) => a - b);
  const mid = Math.floor(resolveHours.length / 2);
  const median = !resolveHours.length ? null : resolveHours.length % 2 ? resolveHours[mid] : (resolveHours[mid - 1] + resolveHours[mid]) / 2;
  // ~500 m grid cells, counting people's reports, so repeated problems stand out.
  const cells = new Map();
  for (const g of open) {
    const key = `${Math.round(g.lead.lat / 0.005)}:${Math.round(g.lead.lon / 0.005)}`;
    if (!cells.has(key)) cells.set(key, { key, lat: g.lead.lat, lon: g.lead.lon, reports: 0, jobs: 0, near: g.near.hospital?.name || null, top: 0 });
    const cell = cells.get(key);
    cell.reports += g.members.length; cell.jobs += 1; cell.top = Math.max(cell.top, g.score);
  }
  return {
    reports: list.filter((c) => !isPassed(c, now)).length, jobs: groups.length, open: open.length,
    overdue: open.filter((g) => g.sla.overdue).length,
    resolved: list.filter((c) => c.status === 'resolved').length,
    medianResolveH: median,
    byBand: BANDS.map((b) => ({ id: b.id, label: b.label, count: open.filter((g) => g.band.id === b.id).length })),
    byCategory: tally(open, (g) => g.lead.category),
    byDept: tally(open, (g) => CATEGORIES[g.lead.category].dept),
    hotspots: [...cells.values()].sort((a, b) => b.reports - a.reports || b.top - a.top).slice(0, 5),
  };
}

export function shareText(c, deptName) {
  return [`Complaint ${c.id}: ${CATEGORIES[c.category].label}`, `To: ${deptName}`, c.description,
    `Location: https://www.google.com/maps/search/?api=1&query=${c.lat.toFixed(6)},${c.lon.toFixed(6)}`].filter(Boolean).join('\n');
}

// Clearly marked demo records, placed near real entries in the data so the scoring has something to show.
export function sampleComplaints(nodes, now = Date.now()) {
  const on = (k) => nodes.filter((n) => n.kind === k && n.on_map !== false);
  const hospitals = on('hospital'), subs = on('substation'), res = on('reservoir');
  if (!hospitals.length) return [];
  const at = (arr, i, dLat = 0, dLon = 0) => { const n = arr[i % arr.length] || hospitals[i % hospitals.length]; return { lat: n.lat + dLat, lon: n.lon + dLon }; };
  const rows = [
    ['power_line', 'high', at(hospitals, 2, 0.002), 1, 'Wire hanging low over the footpath, sparks when it rains.'],
    ['flood', 'high', at(subs, 3, 0.001), 3, 'Road under knee-deep water next to the substation gate.'],
    ['flood', 'medium', at(subs, 3, 0.0012, 0.0002), 2, 'Same waterlogging, cars stalling.'],
    ['flood', 'high', at(subs, 3, 0.0009, -0.0003), 1, 'Water entering shops now.'],
    ['pothole', 'medium', at(hospitals, 5, 0.003), 90, 'Deep pothole on the ambulance route.'],
    ['pothole', 'low', at(hospitals, 9, 0.03, 0.02), 30, 'Small pothole near the bus stop.'],
    ['water_leak', 'medium', at(res, 1, 0.002), 10, 'Burst pipe, water running down the road since morning.'],
    ['no_water', 'medium', at(res, 4, 0.004), 30, 'No water supply for two days.'],
    ['sewage', 'medium', at(hospitals, 11, 0.004), 40, 'Manhole overflowing near the school.'],
    ['garbage', 'low', at(hospitals, 13, 0.02), 60, 'Garbage not collected this week.'],
    ['street_light', 'low', at(hospitals, 15, 0.015), 20, 'Three street lights out on this stretch.'],
    ['fallen_tree', 'high', at(hospitals, 17, 0.006), 5, 'Branch blocking one lane after the storm.'],
    ['transmission', 'high', at(subs, 8, 0.002), 3, 'Tower leaning after the storm, line sagging over the road.'],
    ['heavy_rain', 'medium', at(subs, 3, 0.004), 1, 'Very heavy rain for the last hour, water rising on the road.'],
    ['traffic', 'medium', at(subs, 3, 0.002, 0.003), 0.5, 'Traffic not moving because of the water on the road.'],
  ];
  const list = rows.map(([category, hazard, p, ageH, description], i) => ({
    ...makeComplaint({ category, hazard, ...p, description, sample: true }, now - ageH * H, () => (i + 1) / 40),
  }));
  // A few jobs already in progress or closed, so the desk and the analysis have history to show.
  const advance = (c, status, afterH) => withStatus(c, status, c.createdAt + afterH * H);
  list[4] = advance(list[4], 'assigned', 6);
  list[6] = advance(list[6], 'in_progress', 2);
  list.push(advance(makeComplaint({ category: 'pothole', hazard: 'medium', ...at(hospitals, 21, 0.01), description: 'Patched last week.', sample: true }, now - 120 * H, () => 0.7), 'resolved', 40));
  list.push(advance(makeComplaint({ category: 'water_leak', hazard: 'low', ...at(res, 7, 0.003), description: 'Leak fixed.', sample: true }, now - 80 * H, () => 0.8), 'resolved', 16));
  return list;
}
