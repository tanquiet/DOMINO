// Tests for naming contractors and for citizens' reports to the control room.
// Run from the project folder:  node --test tools/test_contractors.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeComplaint, sampleComplaints, withStatus } from '../web/src/complaints.js';
import { fixedWork, makeFeedback } from '../web/src/feedback.js';
import { NOT_NAMED, REPORT_DETAILS_MAX, REPORT_REASONS, REPORT_STATUS, cleanContractorName, contractorOf, contractorSummary, makeContractorReport, reportForJob, reviewReport, sampleContractorReports, sortReports } from '../web/src/contractors.js';

const H = 3600 * 1000, NOW = 1_800_000_000_000;
const complaint = (over = {}, ageH = 100) => makeComplaint({ category: 'pothole', hazard: 'low', lat: 13.2, lon: 77.8, ...over }, NOW - ageH * H);
const done = (over = {}, contractor, ageH = 100) => ({ ...withStatus(complaint(over, ageH), 'resolved', NOW - H), ...(contractor ? { contractor } : {}) });
const jobOf = (...c) => fixedWork(c)[0];
const send = (job, over = {}) => makeContractorReport({ userId: 'u1', job, reason: 'poor_quality', ...over }, NOW);

test('a report needs a reason and is tidied', () => {
  const job = jobOf(done({}, 'Acme'));
  assert.throws(() => send(job, { reason: null }), /Choose what went wrong/);
  const r = send(job, { details: `  ${'x'.repeat(REPORT_DETAILS_MAX + 5)}  ` });
  assert.equal(r.details.length, REPORT_DETAILS_MAX);
  assert.equal(r.status, 'new');
  assert.equal(r.contractor, 'Acme');
});

test('one person reports one job once, through any report that job closed', () => {
  const a = done({}, 'Acme', 100), b = done({ lat: 13.2005 }, 'Acme', 90);
  const job = jobOf(a, b);
  assert.equal(job.memberIds.length, 2);
  const r = send(job);
  assert.equal(r.id, send(job, { reason: 'mess' }).id);
  assert.equal(reportForJob([r], 'u1', job).id, r.id);
  assert.equal(reportForJob([r], 'u2', job), null);
  assert.notEqual(r.id, makeContractorReport({ userId: 'u2', job, reason: 'mess' }, NOW).id);
});

test('a fixed job carries its contractor, from whichever report has the name', () => {
  assert.equal(jobOf(done({}, 'Acme')).contractor, 'Acme');
  assert.equal(jobOf(done({}, null, 100), done({ lat: 13.2005 }, 'Acme', 90)).contractor, 'Acme');
  assert.equal(jobOf(done()).contractor, null);
});

test('a name the department adds later reaches an earlier report', () => {
  const c = done();
  const r = send(jobOf(c));
  assert.equal(contractorOf(r, [c]), '');
  assert.equal(contractorOf(r, [{ ...c, contractor: 'Acme' }]), 'Acme');
  assert.equal(contractorOf(r, []), '');
});

test('a review changes status and reply, and rejects an unknown status', () => {
  const r = send(jobOf(done({}, 'Acme')));
  const seen = reviewReport(r, { status: 'reviewing', reply: '  Sent to the engineer  ' }, NOW + H);
  assert.deepEqual([seen.status, seen.reply, seen.updatedAt], ['reviewing', 'Sent to the engineer', NOW + H]);
  assert.equal(reviewReport(seen, { status: 'nonsense' }).status, 'reviewing');
  assert.equal(reviewReport(seen, { status: 'closed' }).reply, 'Sent to the engineer');
});

test('open reports come first, then newest', () => {
  const r = send(jobOf(done({}, 'Acme')));
  const list = sortReports([{ ...r, id: 'closed', status: 'closed', createdAt: NOW + 9 }, { ...r, id: 'old', createdAt: NOW }, { ...r, id: 'recent', status: 'reviewing', createdAt: NOW + 1 }]);
  assert.deepEqual(list.map((x) => x.id), ['recent', 'old', 'closed']);
});

test('the summary counts each contractor, whatever the capitals or spacing', () => {
  const a = done({}, 'Acme Roads'), b = done({ lat: 13.3 }, 'acme  roads'), c = done({ lat: 13.4 }, 'Best Works'), d = done({ lat: 13.5 });
  const reports = [send(jobOf(a)), { ...send(jobOf(a)), id: 'x', userId: 'u2', reason: 'poor_quality', status: 'closed' }, send(jobOf(b), { reason: 'mess' }), send(jobOf(c)), send(jobOf(d))];
  const feedback = [makeFeedback({ userId: 'u1', dept: 'roads', complaintId: a.id, grade: 'F' }, NOW), makeFeedback({ userId: 'u2', dept: 'roads', complaintId: b.id, grade: 'D' }, NOW), makeFeedback({ userId: 'u3', dept: 'roads', grade: 'A' }, NOW)];
  const rows = contractorSummary(reports, feedback, [a, b, c, d]);
  assert.deepEqual(rows.map((r) => [r.name, r.reports, r.open, r.jobs]), [['Acme Roads', 3, 2, 2], ['Best Works', 1, 1, 1], [NOT_NAMED, 1, 1, 1]]);
  assert.equal(rows[0].topReason, 'poor_quality');
  assert.equal(rows[0].avg, 1.5);
  assert.equal(rows[0].letter, 'D');
  assert.equal(rows[1].letter, null);
});

test('the examples show every reason, every status and a job with no contractor named', () => {
  const complaints = sampleComplaints([{ id: 'h', kind: 'hospital', name: 'H', lat: 12.97, lon: 77.59 }], NOW);
  const reports = sampleContractorReports(fixedWork(complaints), NOW);
  assert.deepEqual([...new Set(reports.map((r) => r.reason))].sort(), Object.keys(REPORT_REASONS).sort());
  assert.deepEqual([...new Set(reports.map((r) => r.status))].sort(), Object.keys(REPORT_STATUS).sort());
  assert.ok(reports.filter((r) => r.status !== 'new').every((r) => r.reply));
  const rows = contractorSummary(reports, [], complaints);
  assert.ok(rows.some((r) => r.name === NOT_NAMED));
  assert.ok(rows.filter((r) => r.name.startsWith('Sample Contractor ')).length === 3);
});

test('names are tidied before they are stored', () => {
  assert.equal(cleanContractorName('  Acme   Roads '), 'Acme Roads');
  assert.equal(cleanContractorName(null), '');
  assert.equal(cleanContractorName('x'.repeat(200)).length, 80);
});

test('sample data uses invented names, is marked, and points at sample work', () => {
  const complaints = sampleComplaints([{ id: 'h', kind: 'hospital', name: 'H', lat: 12.97, lon: 77.59 }], NOW);
  const names = new Set(complaints.map((c) => c.contractor).filter(Boolean));
  assert.ok(names.size >= 3);
  for (const n of names) assert.match(n, /^Sample Contractor /);
  const reports = sampleContractorReports(fixedWork(complaints), NOW);
  assert.ok(reports.every((r) => r.sample && r.details));
  assert.equal(new Set(reports.map((r) => r.id)).size, reports.length);
  assert.deepEqual(sampleContractorReports([], NOW), []);
  assert.deepEqual(sampleContractorReports(fixedWork(complaints.filter((c) => !c.sample)), NOW), []);
});
