// Citizens' grades and suggestions for finished work and for the services they use.
// Pure logic (no browser APIs), tested by tools/test_feedback.mjs.
import { CATEGORIES, DUPLICATE_M } from './complaints.js';
import { distanceKm } from './mapkit.js';

export const GRADES = {
  A: { label: 'Excellent', points: 5 },
  B: { label: 'Good', points: 4 },
  C: { label: 'Okay', points: 3 },
  D: { label: 'Poor', points: 2 },
  F: { label: 'Failed', points: 1 },
};
export const SUGGESTION_MAX = 500;
const H = 3600 * 1000;

export const letterFor = (avg) => (avg >= 4.5 ? 'A' : avg >= 3.5 ? 'B' : avg >= 2.5 ? 'C' : avg >= 1.5 ? 'D' : 'F');

// The id comes from the person and the target, so grading the same thing again replaces the old grade.
export function makeFeedback({ userId, dept, complaintId = null, category = null, grade, suggestion = '', sample = false }, now = Date.now()) {
  if (!GRADES[grade]) throw new Error('Choose a grade.');
  return { id: `${userId}:${complaintId || dept}`, userId, dept, complaintId, category, grade,
    suggestion: suggestion.trim().slice(0, SUGGESTION_MAX), sample, createdAt: now };
}

// Each resolved report stands alone once closed, but one repair can close several reports of the
// same problem. They count as one piece of work, so nobody is asked to grade the same repair twice.
export function fixedWork(list) {
  const resolvedAt = (c) => Math.max(...c.history.filter((h) => h.status === 'resolved').map((h) => h.at));
  const jobs = [];
  for (const c of list.filter((x) => x.status === 'resolved').sort((a, b) => a.createdAt - b.createdAt)) {
    const at = resolvedAt(c);
    const home = jobs.find((j) => j.lead.category === c.category && Math.abs(j.fixedAt - at) <= H
      && distanceKm(j.lead.lat, j.lead.lon, c.lat, c.lon) * 1000 <= (CATEGORIES[c.category].dupM ?? DUPLICATE_M));
    if (home) { home.memberIds.push(c.id); home.photo ||= c.photo; home.contractor ||= c.contractor || null; } else {
      jobs.push({ id: c.id, lead: c, memberIds: [c.id], dept: CATEGORIES[c.category].dept, fixedAt: at, photo: c.photo, contractor: c.contractor || null });
    }
  }
  return jobs.sort((a, b) => b.fixedAt - a.fixedAt);
}

export const gradeForJob = (feedback, userId, job) => feedback.find((f) => f.userId === userId && job.memberIds.includes(f.complaintId)) || null;
export const gradeForService = (feedback, userId, dept) => feedback.find((f) => f.userId === userId && f.dept === dept && !f.complaintId) || null;

// One row per department that has grades, lowest first so problems stand out. `departments`: null means all.
export function reportCard(feedback, departments = null) {
  const rows = new Map();
  for (const f of feedback) {
    if (departments && !departments.includes(f.dept)) continue;
    if (!rows.has(f.dept)) rows.set(f.dept, { dept: f.dept, count: 0, total: 0, suggestions: 0 });
    const r = rows.get(f.dept);
    r.count += 1; r.total += GRADES[f.grade].points;
    if (f.suggestion) r.suggestions += 1;
  }
  return [...rows.values()].map(({ total, ...r }) => ({ ...r, avg: total / r.count, letter: letterFor(total / r.count) }))
    .sort((a, b) => a.avg - b.avg || b.count - a.count);
}

export const suggestionsFor = (feedback, departments = null) => feedback
  .filter((f) => f.suggestion && (!departments || departments.includes(f.dept)))
  .sort((a, b) => b.createdAt - a.createdAt);

// Clearly marked demo records, so the report card has something to show. Removed with the sample reports.
export function sampleFeedback(complaints, now = Date.now()) {
  const done = complaints.filter((c) => c.sample && c.status === 'resolved');
  if (!done.length) return [];
  const onWork = {
    pothole: ['C', 'The patch is holding for now, but the edge of the road is still rough.'],
    water_leak: ['A', 'Fixed quickly, and the area was cleaned up afterwards.'],
    garbage: ['D', 'Cleared once, but the pile was back within days. It needs regular collection.'],
    street_light: ['C', 'The lights work again, but one still flickers at night.'],
    fallen_tree: ['B', 'The road was cleared the same day. Please also remove the cut branches.'],
  };
  const onJob = done.map((c) => ({ dept: CATEGORIES[c.category].dept, complaintId: c.id, category: c.category, grade: onWork[c.category]?.[0] || 'B', suggestion: onWork[c.category]?.[1] || '' }));
  const rows = [...onJob,
    { dept: 'roads', grade: 'D', suggestion: 'Potholes come back after every monsoon. Please repair these roads before the rains start.' },
    { dept: 'waste', grade: 'F', suggestion: 'Please publish the collection days for each ward, so we know when to expect the truck.' },
    { dept: 'power', grade: 'C', suggestion: 'Tell us how long an outage is likely to last.' },
    { dept: 'water', grade: 'B' },
  ];
  return rows.map((r, i) => makeFeedback({ ...r, userId: `sample-${i + 1}`, sample: true }, now - (i + 1) * 6 * H));
}
