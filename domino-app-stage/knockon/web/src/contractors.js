// Citizens' reports about contractors, for the control room only.
// Pure logic (no browser APIs), tested by tools/test_contractors.mjs.
import { CATEGORIES } from './complaints.js';
import { GRADES, letterFor } from './feedback.js';

export const REPORT_REASONS = {
  poor_quality: 'Poor quality work',
  unfinished: 'Work left unfinished',
  failed_again: 'The problem came back',
  unsafe: 'Unsafe site or materials',
  mess: 'Debris or mess left behind',
  conduct: 'Bad behaviour or asked for money',
};
export const REPORT_STATUS = { new: 'Sent to the control room', reviewing: 'Under review', closed: 'Closed' };
export const REPORT_DETAILS_MAX = 500;
export const CONTRACTOR_NAME_MAX = 80;
export const NOT_NAMED = 'Not named yet';

export const cleanContractorName = (name) => (name || '').trim().replace(/\s+/g, ' ').slice(0, CONTRACTOR_NAME_MAX);
const nameKey = (name) => cleanContractorName(name).toLowerCase();

// The id comes from the person and the job, so one person can report one job once.
export function makeContractorReport({ userId, job, reason, details = '', photo = null, sample = false }, now = Date.now()) {
  if (!REPORT_REASONS[reason]) throw new Error('Choose what went wrong.');
  const { lat, lon, category } = job.lead;
  return { id: `${userId}:${job.id}`, userId, complaintId: job.id, memberIds: job.memberIds, dept: job.dept, category, lat, lon,
    contractor: cleanContractorName(job.contractor), reason, details: details.trim().slice(0, REPORT_DETAILS_MAX), photo, sample,
    status: 'new', reply: '', createdAt: now, updatedAt: now };
}

export const reportForJob = (reports, userId, job) => reports.find((r) => r.userId === userId && job.memberIds.includes(r.complaintId)) || null;

export const reviewReport = (report, { status = report.status, reply = report.reply }, now = Date.now()) => ({
  ...report, status: REPORT_STATUS[status] ? status : report.status, reply: reply.trim().slice(0, REPORT_DETAILS_MAX), updatedAt: now });

// The department may name the contractor after a citizen reports, so the job's current name comes first.
export function contractorOf(report, list) {
  const named = list.find((c) => (report.memberIds || [report.complaintId]).includes(c.id) && c.contractor);
  return cleanContractorName(named?.contractor) || report.contractor || '';
}

// Open reports first, then newest.
export const sortReports = (reports) => [...reports].sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || b.createdAt - a.createdAt);

// One row per contractor, most open reports first. Grades for their jobs give the wider picture,
// because a report describes one person's complaint and most work never gets one.
export function contractorSummary(reports, feedback, list) {
  const rows = new Map();
  const row = (name) => {
    const key = nameKey(name) || NOT_NAMED;
    if (!rows.has(key)) rows.set(key, { key, name: cleanContractorName(name) || NOT_NAMED, reports: 0, open: 0, jobs: new Set(), reasons: {}, points: 0, grades: 0 });
    return rows.get(key);
  };
  for (const r of reports) {
    const c = row(contractorOf(r, list));
    c.reports += 1;
    if (r.status !== 'closed') c.open += 1;
    c.jobs.add(r.complaintId);
    c.reasons[r.reason] = (c.reasons[r.reason] || 0) + 1;
  }
  for (const f of feedback) {
    if (!f.complaintId) continue;
    const name = list.find((x) => x.id === f.complaintId)?.contractor;
    if (!name) continue;
    const c = row(name);
    c.points += GRADES[f.grade].points;
    c.grades += 1;
  }
  return [...rows.values()].map(({ jobs, reasons, points, ...c }) => ({
    ...c,
    jobs: jobs.size,
    topReason: Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    avg: c.grades ? points / c.grades : null,
    letter: c.grades ? letterFor(points / c.grades) : null,
  })).sort((a, b) => b.open - a.open || b.reports - a.reports || a.name.localeCompare(b.name));
}

export const departmentOf = (report) => CATEGORIES[report.category]?.dept || report.dept;

// Clearly marked demo records. Removed with the sample reports.
export function sampleContractorReports(jobs, now = Date.now()) {
  const H = 3600 * 1000;
  // Between them these show every reason, every status, and a job with no contractor named yet.
  const EXAMPLES = [
    ['pothole', 'failed_again', 'The same spot has broken open again after one week of rain.'],
    ['pothole', 'poor_quality', 'The surface is uneven and the patch is already cracking.', 'reviewing', 'An engineer will inspect this stretch and ask the contractor to respond.'],
    ['water_leak', 'mess', 'Broken pipe and soil were left on the footpath after the work finished.', 'closed', 'The contractor cleared the site, and a site visit confirmed it.'],
    ['water_leak', 'unfinished', 'The trench was only half filled, so vehicles have to swerve around it.'],
    ['garbage', 'conduct', 'A worker asked residents for money before clearing the pile.', 'reviewing', 'Passed to the department’s vigilance officer to look into.'],
    ['garbage', 'unfinished', 'Only half of the pile was taken away.'],
    ['street_light', 'unsafe', 'A cable has been left exposed at the base of the pole, near where children walk.', 'reviewing', 'The department has been asked to make this safe today.'],
    ['fallen_tree', 'mess', 'Cut branches are still blocking the footpath.'],
  ];
  const rows = EXAMPLES.map(([category, reason, details, status, reply]) => {
    const job = jobs.find((j) => j.lead.sample && j.lead.category === category);
    return job && { job, reason, details, status, reply };
  }).filter(Boolean);
  return rows.map(({ status, reply, ...r }, i) => {
    const report = makeContractorReport({ ...r, userId: `sample-${i + 1}`, sample: true }, now - (i + 1) * 5 * H);
    return status ? reviewReport(report, { status, reply }, report.createdAt + 2 * H) : report;
  });
}
