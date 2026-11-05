// Map building blocks: facility colours, Google-style pins, link strength, incident reports and photos.
// Everything except pinAtlas() is pure, so tools/test_web.mjs can test it in Node.
import { nodesInPolygon } from './engine.js';

// ------------------------------------------------------------------ facilities
export const KIND = {
  substation_tx: { label: 'Transmission substation (220 kV+)', color: [30, 64, 175], size: 32 },
  substation: { label: 'Substation', color: [37, 99, 235], size: 26 },
  reservoir: { label: 'Water reservoir / tank', color: [13, 148, 136], size: 28 },
  hospital: { label: 'Hospital', color: [22, 163, 74], size: 28 },
  telecom: { label: 'Telecom site', color: [124, 58, 237], size: 22 },
};
export const STATE_COLOR = { BACKUP: [245, 158, 11], DOWN: [220, 38, 38] };
export const layerOf = (kind) => (kind === 'substation_tx' ? 'substation' : kind);

// ------------------------------------------------------------------ link strength
export const STRENGTH = {
  strong: { label: 'Strong', color: [22, 163, 74], hint: 'Two or more supply lines; losing one changes nothing' },
  medium: { label: 'Medium', color: [234, 179, 8], hint: 'One supply line, but 6 h or more of its own backup' },
  weak: { label: 'Weak', color: [220, 38, 38], hint: 'One supply line and little or no backup: a single point of failure' },
};
export const MEDIUM_BACKUP_H = 6;

export function linkStrength(providerCount, backupH) {
  if (providerCount >= 2) return 'strong';
  return backupH >= MEDIUM_BACKUP_H ? 'medium' : 'weak';
}

// The backup a facility has for one resource, honouring the assumption sliders.
export function backupHours(node, resource, params = {}) {
  const fromSlider = { hospital: { power: 'hospital_diesel_h', water: 'hospital_water_h' },
    reservoir: { water: 'reservoir_storage_h', power: 'reservoir_power_backup_h' },
    telecom: { power: 'telecom_battery_h' } }[node.kind]?.[resource];
  const v = fromSlider ? params[fromSlider] : undefined;
  return v ?? node.buffers?.[resource] ?? 0;
}

// How many hospitals sit downstream of each facility (including itself, when it is a hospital).
export function hospitalCounts(nodesById, dependentsOf) {
  const counts = new Map();
  for (const id of nodesById.keys()) {
    const seen = new Set([id]);
    const queue = [id];
    let c = 0;
    while (queue.length) {
      const cur = queue.pop();
      if (nodesById.get(cur)?.kind === 'hospital') c++;
      for (const d of dependentsOf.get(cur) || []) if (!seen.has(d)) { seen.add(d); queue.push(d); }
    }
    counts.set(id, c);
  }
  return counts;
}

// One drawable line per dependency between two places on the city map.
export function buildLinks(nodesById, depsOf, hospitalsBelow, params) {
  const links = [];
  for (const [to, groups] of depsOf) {
    const b = nodesById.get(to);
    if (!b || b.on_map === false) continue;
    for (const g of groups) {
      const backupH = backupHours(b, g.resource, params);
      const strength = linkStrength(g.providers.length, backupH);
      for (const from of g.providers) {
        const a = nodesById.get(from);
        if (!a || a.on_map === false) continue;
        links.push({ isLink: true, from, to, resource: g.resource, strength, backupH,
          providers: g.providers.length, hospitals: hospitalsBelow.get(to) || 0,
          a: [a.lon, a.lat], b: [b.lon, b.lat], fromName: a.name, toName: b.name });
      }
    }
  }
  return links;
}

export function linkCounts(links) {
  const c = { strong: 0, medium: 0, weak: 0, total: links.length };
  for (const l of links) c[l.strength]++;
  c.weakPct = c.total ? Math.round((100 * c.weak) / c.total) : 0;
  return c;
}

// Line width in pixels: thicker lines carry more hospitals.
export const linkWidth = (hospitals) => Math.min(6, 1.2 + Math.log2(1 + hospitals) * 0.8);

// ------------------------------------------------------------------ pins
const CELL = { w: 72, h: 96 };
const PIN_KINDS = ['substation_tx', 'substation', 'reservoir', 'hospital', 'telecom'];
const PIN_STATES = ['normal', 'BACKUP', 'DOWN'];
const css = (c) => `rgb(${c.join(',')})`;

function drawGlyph(ctx, kind, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (kind === 'substation' || kind === 'substation_tx') {            // lightning bolt
    ctx.beginPath();
    [[4, -17], [-10, 3], [-1, 3], [-4, 17], [10, -4], [1, -4]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.fill();
  } else if (kind === 'reservoir') {                                  // water drop
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.bezierCurveTo(5, -8, 12, -2, 12, 5);
    ctx.arc(0, 5, 12, 0, Math.PI);
    ctx.bezierCurveTo(-12, -2, -5, -8, 0, -16);
    ctx.fill();
  } else if (kind === 'hospital') {                                   // medical cross
    ctx.fillRect(-4.5, -14, 9, 28);
    ctx.fillRect(-14, -4.5, 28, 9);
  } else if (kind === 'telecom') {                                    // radio mast with signal arcs
    ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 16); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -5, 3.5, 0, Math.PI * 2); ctx.fill();
    for (const r of [8, 14]) {
      ctx.beginPath(); ctx.arc(0, -5, r, -Math.PI / 4, Math.PI / 4); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -5, r, (3 * Math.PI) / 4, (5 * Math.PI) / 4); ctx.stroke();
    }
  } else {                                                            // reported incident: exclamation mark
    ctx.fillRect(-3.5, -15, 7, 19);
    ctx.beginPath(); ctx.arc(0, 11, 4.2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPin(ctx, x, y, fill, kind) {
  const cx = x + CELL.w / 2, cy = y + 35, r = 31;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.82, Math.PI * 0.18);
  ctx.quadraticCurveTo(cx + 16, cy + 44, cx, y + CELL.h - 3);
  ctx.quadraticCurveTo(cx - 16, cy + 44, cx - r * Math.cos(Math.PI * 0.18), cy + r * Math.sin(Math.PI * 0.18));
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx, cy, 23, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); drawGlyph(ctx, kind, fill); ctx.restore();
}

// Draws every pin once into a sprite sheet. Browser only.
export function pinAtlas() {
  const cols = PIN_KINDS.length, rows = PIN_STATES.length + 1;
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL.w; canvas.height = rows * CELL.h;
  const ctx = canvas.getContext('2d');
  const mapping = {};
  const add = (key, col, row, fill, kind) => {
    const x = col * CELL.w, y = row * CELL.h;
    drawPin(ctx, x, y, fill, kind);
    mapping[key] = { x, y, width: CELL.w, height: CELL.h, anchorX: CELL.w / 2, anchorY: CELL.h, mask: false };
  };
  PIN_KINDS.forEach((kind, col) => PIN_STATES.forEach((state, row) => {
    add(pinKey(kind, state), col, row, css(state === 'normal' ? KIND[kind].color : STATE_COLOR[state]), kind);
  }));
  add('report', 0, PIN_STATES.length, '#111827', 'report');
  return { url: canvas.toDataURL('image/png'), mapping };
}
export const pinKey = (kind, state) => `${kind}-${state === 'BACKUP' || state === 'DOWN' ? state : 'normal'}`;

// ------------------------------------------------------------------ incident reports
export const REPORT_KINDS = {
  power: { label: 'Power cut', snap: ['substation', 'substation_tx'], noun: 'substation' },
  flood: { label: 'Flooding', snap: null, noun: 'spot' },
  water: { label: 'No water', snap: ['reservoir'], noun: 'reservoir' },
};
export const REPORTERS = {
  citizen: { label: 'Citizen', verified: false },
  bescom: { label: 'BESCOM staff', verified: true },
  bwssb: { label: 'BWSSB staff', verified: true },
  hospital: { label: 'Hospital', verified: false },
};
export const FLOOD_WIDTHS_M = [500, 1000, 2000];
export const REPORT_HOURS = [1, 2, 4, 12, 24];

export function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const x = (lon2 - lon1) * toRad * Math.cos(((lat1 + lat2) / 2) * toRad);
  const y = (lat2 - lat1) * toRad;
  return 6371 * Math.hypot(x, y);
}

export function nearestNode(lon, lat, nodes, kinds) {
  let best = null, bestD = Infinity;
  for (const n of nodes) {
    if (!kinds.includes(n.kind) || n.on_map === false) continue;
    const d = distanceKm(lat, lon, n.lat, n.lon);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

// A circle `widthM` across, as a polygon the engine can use.
export function circlePolygon(lon, lat, widthM, points = 40) {
  const r = widthM / 2 / 1000 / 6371 * (180 / Math.PI);
  const rLon = r / Math.cos((lat * Math.PI) / 180);
  return Array.from({ length: points }, (_, i) => {
    const a = (2 * Math.PI * i) / points;
    return [lon + rLon * Math.cos(a), lat + r * Math.sin(a)];
  });
}

// What a report currently points at, from the place tapped and the type of incident.
export function reportTarget(report, nodesById) {
  const k = REPORT_KINDS[report.kind];
  if (!k || !report.where) return { node: null, polygon: null, inside: [] };
  const { lon, lat } = report.where;
  if (k.snap) return { node: nearestNode(lon, lat, nodesById.values(), k.snap), polygon: null, inside: [] };
  const polygon = circlePolygon(lon, lat, report.widthM);
  return { node: null, polygon, inside: nodesInPolygon({ nodes: nodesById }, polygon) };
}

export function reportMissing(report, target) {
  if (!report.kind) return 'what happened';
  if (!report.where) return 'where it happened';
  if (REPORT_KINDS[report.kind].snap ? !target.node : target.inside.length === 0) return 'a spot with facilities nearby';
  if (report.hours === undefined) return 'how long it lasts';
  if (!report.reporter) return 'who is reporting';
  return null;
}

// Turn a finished report into a scenario the app can run.
export function reportScenario(report, target, defaultRepairH) {
  const k = REPORT_KINDS[report.kind];
  const assumed = report.hours === null;                       // "Not sure"
  const hours = assumed ? defaultRepairH : report.hours;
  const span = assumed ? `not sure how long, ${hours} h assumed` : `${hours} h`;
  const who = REPORTERS[report.reporter];
  const meta = { reporter: who.label, verified: who.verified, where: report.where };
  if (report.kind === 'flood') {
    const width = report.widthM >= 1000 ? `${report.widthM / 1000} km` : `${report.widthM} m`;
    return {
      body: { polygon: target.polygon, polygon_repair_h: hours }, polygon: target.polygon, report: meta,
      label: `Reported flooding (${width} wide)`,
      note: `Substations, reservoirs and telecom sites inside the area fail: ${span}.`,
    };
  }
  const reason = report.kind === 'power' ? `power cut reported (${span})` : `no water reported (${span})`;
  return {
    body: { failures: [{ id: target.node.id, repair_h: hours, reason }] }, report: meta,
    label: `Reported ${k.label.toLowerCase()}: ${target.node.name}`,
    note: `Snapped to the nearest ${k.noun}: ${span}, then restored.`,
  };
}

// ------------------------------------------------------------------ place photos and links
const IMAGERY = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';

export function satelliteUrl(lat, lon, width = 620, height = 240, metresAcross = 320) {
  const dLon = (metresAcross / 2 / 111320) / Math.cos((lat * Math.PI) / 180);
  const dLat = dLon * Math.cos((lat * Math.PI) / 180) * (height / width);
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(6)).join(',');
  return `${IMAGERY}?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=${width},${height}&format=jpg&f=image`;
}
export const streetViewUrl = (lat, lon) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
export const googlePhotosUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

const photoCache = new Map();
// Real photos taken near a place, from Wikimedia Commons (keyless). Quietly empty when offline.
export function commonsPhotos(lat, lon) {
  const key = `${lat},${lon}`;
  if (photoCache.has(key)) return photoCache.get(key);
  const qs = new URLSearchParams({
    action: 'query', generator: 'geosearch', ggscoord: `${lat}|${lon}`, ggsradius: '300', ggsnamespace: '6',
    ggslimit: '12', prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '260', format: 'json', origin: '*',
  });
  const p = fetch(`https://commons.wikimedia.org/w/api.php?${qs}`)
    .then((r) => (r.ok ? r.json() : { query: null }))
    .then((j) => Object.values(j.query?.pages || {})
      .map((pg) => ({ title: pg.title, info: pg.imageinfo?.[0] }))
      .filter((x) => x.info && /jpeg|png/.test(x.info.mime))
      .slice(0, 4)
      .map((x) => ({ title: x.title.replace(/^File:/, ''), thumb: x.info.thumburl, page: x.info.descriptionurl })))
    .catch(() => { photoCache.delete(key); return []; });
  photoCache.set(key, p);
  return p;
}

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
