// Accounts and the three roles. DEMO ONLY: with no server, accounts live in this browser, so anyone with
// the browser's developer tools could change them. Real security needs a server (see README).
export const ROLES = {
  citizen: { label: 'Citizen', blurb: 'See alerts near you, send photo reports, and track them.', home: 'citizen' },
  officer: { label: 'Department officer', blurb: 'Work through your department’s queue and close jobs.', home: 'citizen' },
  admin: { label: 'Control room admin', blurb: 'See every department, run cascade analysis, manage users.', home: 'cascade' },
};

// Each officer works for one authority, which owns these departments in complaints.js.
export const AGENCY_DEPARTMENTS = {
  BWSSB: ['water'],
  KPTCL: ['kptcl'],
  BESCOM: ['power'],
  'GBA / BBMP': ['roads', 'drains', 'waste', 'lights', 'trees'],
  'Traffic Police': ['traffic'],
};

// Demo stand-ins for an invitation from the department. They are visible in the app's code.
export const ACCESS_CODES = { officer: 'DEMO-OFFICER', admin: 'DEMO-ADMIN' };

export const DEMO_ACCOUNTS = [
  { role: 'citizen', name: 'Demo Citizen', email: 'citizen@example.com', password: 'Domino-Citizen-2026' },
  { role: 'officer', agency: 'BWSSB', name: 'Demo BWSSB Officer', email: 'bwssb@example.com', password: 'Domino-Officer-2026' },
  { role: 'officer', agency: 'KPTCL', name: 'Demo KPTCL Officer', email: 'kptcl@example.com', password: 'Domino-Officer-2026' },
  { role: 'admin', name: 'Demo Admin', email: 'admin@example.com', password: 'Domino-Admin-2026' },
];

const PAGES = { guest: ['citizen', 'help'], citizen: ['citizen', 'help'], officer: ['citizen', 'help'], admin: ['citizen', 'cascade', 'help'] };
export const canOpen = (role, page) => (PAGES[role] || PAGES.guest).includes(page);
export const homePage = (role) => ROLES[role]?.home || 'citizen';
// null means every department.
export const departmentsFor = (user) => (user?.role === 'officer' ? AGENCY_DEPARTMENTS[user.agency] || [] : null);

const USERS = 'domino-users', SESSION = 'domino-session';
const SESSION_MS = 12 * 3600 * 1000;
const ITERATIONS = 100000;

function browserStore() {
  const mem = new Map();
  return {
    getItem: (k) => { try { return localStorage.getItem(k); } catch { return mem.get(k) ?? null; } },
    setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { mem.set(k, v); } },
    removeItem: (k) => { try { localStorage.removeItem(k); } catch { mem.delete(k); } },
  };
}
let store = browserStore();
export const useAuthStore = (s) => { store = s; };

const readUsers = () => { try { return JSON.parse(store.getItem(USERS)) || []; } catch { return []; } };
const writeUsers = (u) => store.setItem(USERS, JSON.stringify(u));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const normalise = (email) => email.trim().toLowerCase();

async function hashPassword(password, saltHex) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Accounts need a secure address. Open the app from localhost or an https link.');
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return toHex(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256));
}

async function makeUser({ name, email, password, role, agency }) {
  const salt = toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  return { id: `u_${salt.slice(0, 12)}`, name: name.trim(), email: normalise(email), role, agency: role === 'officer' ? agency : null,
    salt, hash: await hashPassword(password, salt), createdAt: Date.now() };
}

export const publicUser = (u) => (u ? { id: u.id, name: u.name, email: u.email, role: u.role, agency: u.agency, createdAt: u.createdAt } : null);
const startSession = (u, now) => { store.setItem(SESSION, JSON.stringify({ userId: u.id, expires: now + SESSION_MS })); return publicUser(u); };

// Returns the first problem with a sign-up, or null.
export function signUpProblem({ name, email, password, role, agency, code }) {
  if (!name?.trim()) return 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return 'Enter a valid email address.';
  if ((password || '').length < 8) return 'Use a password of at least 8 characters.';
  if (!ROLES[role]) return 'Choose who you are.';
  if (role === 'officer' && !AGENCY_DEPARTMENTS[agency]) return 'Choose your department.';
  if (role !== 'citizen' && code?.trim() !== ACCESS_CODES[role]) return 'That access code is not right.';
  if (readUsers().some((u) => u.email === normalise(email))) return 'An account with this email already exists. Log in instead.';
  return null;
}

export async function signUp(details, now = Date.now()) {
  const problem = signUpProblem(details);
  if (problem) throw new Error(problem);
  const user = await makeUser(details);
  writeUsers([...readUsers(), user]);
  return startSession(user, now);
}

export async function logIn(email, password, now = Date.now()) {
  const user = readUsers().find((u) => u.email === normalise(email || ''));
  // The same message either way, so this form can't be used to find out who has an account.
  if (!user || await hashPassword(password || '', user.salt) !== user.hash) throw new Error('Email or password is incorrect.');
  return startSession(user, now);
}

export function currentUser(now = Date.now()) {
  try {
    const s = JSON.parse(store.getItem(SESSION));
    if (!s || s.expires <= now) return null;
    return publicUser(readUsers().find((u) => u.id === s.userId));
  } catch { return null; }
}

export const logOut = () => store.removeItem(SESSION);
export const listUsers = () => readUsers().map(publicUser);

export function removeUser(id) {
  const users = readUsers();
  const target = users.find((u) => u.id === id);
  if (target?.role === 'admin' && users.filter((u) => u.role === 'admin').length === 1) throw new Error('This is the only admin, so it can’t be removed.');
  writeUsers(users.filter((u) => u.id !== id));
}

// Adds the demo accounts once. A secure address is needed; without one the login form explains why.
export async function ensureDemoAccounts() {
  if (!globalThis.crypto?.subtle) return;
  const users = readUsers();
  const missing = DEMO_ACCOUNTS.filter((d) => !users.some((u) => u.email === d.email));
  if (!missing.length) return;
  writeUsers([...users, ...await Promise.all(missing.map(makeUser))]);
}
