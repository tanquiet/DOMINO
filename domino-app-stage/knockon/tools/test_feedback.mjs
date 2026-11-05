// Tests for grades, suggestions and the department report card.
// Run from the project folder:  node --test tools/test_feedback.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { CATEGORIES, DEPARTMENTS, STATUSES, makeComplaint, progressOf, sampleComplaints, withStatus } from '../web/src/complaints.js';
import { DEPARTMENT_PHOTO, WORK_PHOTOS, workPhotoUrl } from '../web/src/workPhotos.js';
import { GRADES, SUGGESTION_MAX, fixedWork, gradeForJob, gradeForService, letterFor, makeFeedback, reportCard, sampleFeedback, suggestionsFor } from '../web/src/feedback.js';

const H = 3600 * 1000, NOW = 1_800_000_000_000;
const report = (over = {}, ageH = 100) => makeComplaint({ category: 'pothole', hazard: 'low', lat: 13.2, lon: 77.8, ...over }, NOW - ageH * H);
const fixed = (c, ageH = 1) => withStatus(c, 'resolved', NOW - ageH * H);
const grade = (over) => makeFeedback({ userId: 'u1', dept: 'roads', grade: 'B', ...over }, NOW);

test('the progress bar has a step and a note for every status', () => {
  assert.deepEqual(STATUSES.map((s) => progressOf(s).step), [1, 2, 3, 4]);
  for (const s of STATUSES) { assert.equal(progressOf(s).total, 4); assert.ok(progressOf(s).note); }
});

test('every problem and department has a real, credited photo on disk', () => {
  assert.deepEqual(Object.keys(WORK_PHOTOS).sort(), Object.keys(CATEGORIES).sort());
  assert.deepEqual(Object.keys(DEPARTMENT_PHOTO).sort(), Object.keys(DEPARTMENTS).sort());
  for (const id of Object.values(DEPARTMENT_PHOTO)) assert.ok(WORK_PHOTOS[id], id);
  for (const [id, p] of Object.entries(WORK_PHOTOS)) {
    assert.ok(p.alt && p.author && p.license && p.source.startsWith('https://commons.wikimedia.org/'), id);
    const file = new URL(`../web/public/${workPhotoUrl(id)}`, import.meta.url);
    assert.ok(existsSync(file) && statSync(file).size > 5000, id);
  }
});

test('grading the same thing again replaces the earlier grade', () => {
  assert.equal(grade({ grade: 'A' }).id, grade({ grade: 'F' }).id);
  assert.notEqual(grade({}).id, grade({ userId: 'u2' }).id);
  assert.notEqual(grade({}).id, grade({ complaintId: 'BLR-1' }).id);
});

test('a grade is required and a suggestion is tidied', () => {
  assert.throws(() => grade({ grade: null }), /Choose a grade/);
  assert.equal(grade({ suggestion: '  more bins  ' }).suggestion, 'more bins');
  assert.equal(grade({ suggestion: 'x'.repeat(SUGGESTION_MAX + 9) }).suggestion.length, SUGGESTION_MAX);
});

test('average points map to the nearest letter', () => {
  assert.deepEqual(Object.values(GRADES).map((g) => letterFor(g.points)), Object.keys(GRADES));
  assert.deepEqual([4.5, 4.49, 3.5, 2.5, 1.5, 1.49].map(letterFor), ['A', 'B', 'B', 'C', 'D', 'F']);
});

test('only finished work can be graded', () => {
  assert.equal(fixedWork([report()]).length, 0);
  const done = fixed(report());
  assert.deepEqual(fixedWork([report(), done]).map((j) => j.id), [done.id]);
});

test('one repair that closed several reports is one piece of work', () => {
  const a = fixed(report({}, 100)), b = fixed(report({ lat: 13.2005 }, 90));
  const jobs = fixedWork([b, a]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, a.id);
  assert.deepEqual(jobs[0].memberIds, [a.id, b.id]);
});

test('separate repairs stay separate: other place, other problem, other day', () => {
  const a = fixed(report());
  assert.equal(fixedWork([a, fixed(report({ lat: 13.21 }))]).length, 2);
  assert.equal(fixedWork([a, fixed(report({ category: 'garbage' }))]).length, 2);
  assert.equal(fixedWork([a, fixed(report(), 30)]).length, 2);
});

test('a job finds its grade through any report it closed; a service grade is separate', () => {
  const a = fixed(report({}, 100)), b = fixed(report({ lat: 13.2005 }, 90));
  const [job] = fixedWork([a, b]);
  const fb = [grade({ complaintId: b.id, grade: 'A' }), grade({ grade: 'D' })];
  assert.equal(gradeForJob(fb, 'u1', job).grade, 'A');
  assert.equal(gradeForJob(fb, 'u2', job), null);
  assert.equal(gradeForService(fb, 'u1', 'roads').grade, 'D');
  assert.equal(gradeForService(fb, 'u1', 'water'), null);
});

test('the report card averages each department, lowest first', () => {
  const fb = [grade({ userId: 'a', grade: 'A' }), grade({ userId: 'b', grade: 'C', suggestion: 'x' }), grade({ userId: 'c', dept: 'waste', grade: 'F' })];
  const rows = reportCard(fb);
  assert.deepEqual(rows.map((r) => [r.dept, r.letter, r.count, r.suggestions]), [['waste', 'F', 1, 0], ['roads', 'B', 2, 1]]);
  assert.equal(rows[1].avg, 4);
});

test('an officer sees only their own departments', () => {
  const fb = [grade({ userId: 'a', suggestion: 'roads idea' }), grade({ userId: 'b', dept: 'water', suggestion: 'water idea' })];
  assert.deepEqual(reportCard(fb, ['water']).map((r) => r.dept), ['water']);
  assert.deepEqual(suggestionsFor(fb, ['water']).map((f) => f.suggestion), ['water idea']);
  assert.equal(suggestionsFor(fb).length, 2);
});

test('sample grades are marked and point at sample work', () => {
  const nodes = [{ id: 'h', kind: 'hospital', name: 'H', lat: 12.97, lon: 77.59 }];
  const complaints = sampleComplaints(nodes, NOW);
  const fb = sampleFeedback(complaints, NOW);
  assert.ok(fb.length && fb.every((f) => f.sample));
  const ids = new Set(fixedWork(complaints).flatMap((j) => j.memberIds));
  assert.ok(fb.filter((f) => f.complaintId).every((f) => ids.has(f.complaintId)));
  assert.deepEqual(sampleFeedback([], NOW), []);
});
