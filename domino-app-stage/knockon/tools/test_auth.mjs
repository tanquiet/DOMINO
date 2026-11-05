// Tests for accounts, the three roles, and what each role can reach.
// Run from the project folder:  node --test tools/test_auth.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_CODES, AGENCY_DEPARTMENTS, DEMO_ACCOUNTS, canOpen, currentUser, departmentsFor, ensureDemoAccounts, homePage, listUsers, logIn, logOut,
  publicUser, removeUser, signUp, signUpProblem, useAuthStore } from '../web/src/auth.js';
import { CATEGORIES, DEPARTMENTS } from '../web/src/complaints.js';

let mem;
beforeEach(() => {
  mem = new Map();
  useAuthStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) });
});
const citizen = { name: 'Asha', email: 'Asha@Example.com', password: 'longenough', role: 'citizen' };

test('a citizen can sign up and is logged in, with the email normalised', async () => {
  const u = await signUp(citizen);
  assert.equal(u.role, 'citizen');
  assert.equal(u.email, 'asha@example.com');
  assert.equal(currentUser().id, u.id);
});

test('passwords are never stored or returned in plain text', async () => {
  const u = await signUp(citizen);
  assert.ok(!mem.get('domino-users').includes('longenough'));
  assert.equal(u.hash, undefined);
  assert.equal(u.salt, undefined);
  assert.deepEqual(Object.keys(publicUser({ id: 1, name: 'a', email: 'b', role: 'c', agency: null, createdAt: 1, hash: 'x', salt: 'y' })).includes('hash'), false);
});

test('the same password gives a different stored hash for each account', async () => {
  await signUp(citizen);
  await signUp({ ...citizen, email: 'other@example.com' });
  const [a, b] = JSON.parse(mem.get('domino-users'));
  assert.notEqual(a.hash, b.hash);
});

test('log in works with the right password, in any email case', async () => {
  await signUp(citizen);
  logOut();
  assert.equal(currentUser(), null);
  assert.equal((await logIn('ASHA@example.com', 'longenough')).role, 'citizen');
});

test('a wrong password and an unknown email give the same message', async () => {
  await signUp(citizen);
  const message = async (e, p) => { try { await logIn(e, p); return null; } catch (err) { return err.message; } };
  assert.equal(await message('asha@example.com', 'wrongpassword'), 'Email or password is incorrect.');
  assert.equal(await message('nobody@example.com', 'wrongpassword'), 'Email or password is incorrect.');
});

test('sign-up checks each field', () => {
  assert.match(signUpProblem({ ...citizen, name: ' ' }), /name/);
  assert.match(signUpProblem({ ...citizen, email: 'nope' }), /email/);
  assert.match(signUpProblem({ ...citizen, password: 'short' }), /8 characters/);
  assert.equal(signUpProblem(citizen), null);
});

test('one account per email', async () => {
  await signUp(citizen);
  await assert.rejects(signUp({ ...citizen, email: 'asha@example.com' }), /already exists/);
});

test('staff accounts need the access code; citizens do not', async () => {
  assert.match(signUpProblem({ ...citizen, role: 'admin' }), /access code/);
  assert.match(signUpProblem({ ...citizen, role: 'officer', agency: 'BWSSB', code: 'guess' }), /access code/);
  assert.match(signUpProblem({ ...citizen, role: 'officer', code: ACCESS_CODES.officer }), /department/);
  const o = await signUp({ ...citizen, role: 'officer', agency: 'KPTCL', code: ACCESS_CODES.officer });
  assert.equal(o.agency, 'KPTCL');
});

test('only the admin can open the cascade page', () => {
  for (const role of ['guest', 'citizen', 'officer']) {
    assert.equal(canOpen(role, 'cascade'), false, role);
    assert.equal(canOpen(role, 'citizen'), true, role);
    assert.equal(canOpen(role, 'help'), true, role);
  }
  assert.equal(canOpen('admin', 'cascade'), true);
  assert.equal(canOpen('anything-else', 'cascade'), false);
  assert.equal(homePage('admin'), 'cascade');
  assert.equal(homePage('citizen'), 'citizen');
});

test('officers see only their own departments; admins see all', () => {
  assert.deepEqual(departmentsFor({ role: 'officer', agency: 'BWSSB' }), ['water']);
  assert.deepEqual(departmentsFor({ role: 'officer', agency: 'KPTCL' }), ['kptcl']);
  assert.equal(departmentsFor({ role: 'admin' }), null);
});

test('every department belongs to an authority or the control room, and every authority has work', () => {
  const owned = Object.values(AGENCY_DEPARTMENTS).flat();
  for (const id of owned) assert.ok(DEPARTMENTS[id], id);
  for (const [agency, depts] of Object.entries(AGENCY_DEPARTMENTS)) {
    assert.ok(Object.values(CATEGORIES).some((c) => depts.includes(c.dept)), `${agency} gets no reports`);
  }
  assert.deepEqual(Object.keys(DEPARTMENTS).filter((d) => !owned.includes(d)), ['disaster']);
});

test('sessions expire, and removing a user ends their session', async () => {
  const now = 1_800_000_000_000;
  const u = await signUp(citizen, now);
  assert.ok(currentUser(now + 3600 * 1000));
  assert.equal(currentUser(now + 13 * 3600 * 1000), null);
  removeUser(u.id);
  assert.equal(currentUser(now), null);
});

test('the only admin cannot be removed', async () => {
  const a = await signUp({ ...citizen, role: 'admin', code: ACCESS_CODES.admin });
  assert.throws(() => removeUser(a.id), /only admin/);
  await signUp({ ...citizen, email: 'b@example.com', role: 'admin', code: ACCESS_CODES.admin });
  removeUser(a.id);
  assert.equal(listUsers().length, 1);
});

test('demo accounts are added once and can log in, with one for each role', async () => {
  await ensureDemoAccounts();
  await ensureDemoAccounts();
  assert.equal(listUsers().length, DEMO_ACCOUNTS.length);
  assert.deepEqual([...new Set(DEMO_ACCOUNTS.map((d) => d.role))].sort(), ['admin', 'citizen', 'officer']);
  for (const d of DEMO_ACCOUNTS) assert.equal((await logIn(d.email, d.password)).role, d.role);
});
