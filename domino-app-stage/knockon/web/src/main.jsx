import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ComplaintsPage from './ComplaintsPage.jsx';
import HelpPage from './HelpPage.jsx';
import AuthPage from './AuthPage.jsx';
import { ROLES, canOpen, currentUser, ensureDemoAccounts, homePage, logOut } from './auth.js';
import { ThemeToggle, applyTheme } from './ThemeToggle.jsx';
import { loadSettings } from './settings.js';
import './styles.css';

// Before the first paint, so a light-theme user never sees a dark flash.
applyTheme(loadSettings().theme);

const PAGES = [
  { id: 'citizen', href: '#/citizen', label: 'Citizen alerts', short: 'Alerts', officerLabel: 'Department desk', officerShort: 'Desk' },
  { id: 'cascade', href: '#/cascade', label: 'Cascade analysis', short: 'Cascade' },
  { id: 'help', href: '#/help', label: 'Help desk & settings', short: 'Help' },
];
const GUEST = { role: 'guest', name: 'Guest' };

function pageFromHash() {
  const h = window.location.hash;
  if (h.startsWith('#/citizen') || h.startsWith('#/complaints')) return 'citizen';
  if (h.startsWith('#/help')) return 'help';
  if (h.startsWith('#/cascade')) return 'cascade';
  return null;
}

function Root() {
  const [user, setUser] = useState(() => currentUser());
  const [ready, setReady] = useState(false);
  const [wanted, setWanted] = useState(pageFromHash);
  useEffect(() => { ensureDemoAccounts().catch(() => {}).finally(() => setReady(true)); }, []);
  useEffect(() => {
    const on = () => setWanted(pageFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // A page this role can't open falls back to its home page, and the address follows.
  const page = user && (wanted && canOpen(user.role, wanted) ? wanted : homePage(user.role));
  useEffect(() => {
    if (page && page !== wanted) window.location.hash = `#/${page}`;
  }, [page, wanted]);

  if (!ready) return null;
  if (!user) return <AuthPage onDone={setUser} onGuest={() => setUser(GUEST)} />;
  const signOut = () => { logOut(); setUser(null); window.location.hash = '#/'; };
  const officer = user.role === 'officer';
  const who = user.role === 'guest' ? 'Guest' : `${user.name} · ${officer ? `${user.agency} officer` : ROLES[user.role].label}`;
  return (
    <div className={`shell ${officer || user.role === 'admin' ? '' : 'cz'}`}>
      <header className="shell-nav">
        <a className="shell-brand logo" href={`#/${homePage(user.role)}`} aria-label="DOMINO home">DOMIN<span>O</span></a>
        <nav aria-label="Pages">
          {PAGES.filter((p) => canOpen(user.role, p.id)).map((p) => (
            <a key={p.id} href={p.href} className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined}>
              <span className="long">{(officer && p.officerLabel) || p.label}</span><span className="short">{(officer && p.officerShort) || p.short}</span>
            </a>
          ))}
        </nav>
        <div className="shell-user">
          <span className="shell-who" title={user.email}>{who}</span>
          <ThemeToggle />
          <button className="shell-logout" onClick={signOut}>{user.role === 'guest' ? 'Log in' : 'Log out'}</button>
        </div>
      </header>
      <div className="shell-main">
        {page === 'citizen' && <ComplaintsPage key={user.id || 'guest'} user={user} onNeedLogin={signOut} />}
        {page === 'help' && <HelpPage key={user.id || 'guest'} user={user} />}
        {page === 'cascade' && <App key={window.location.hash.split('?')[1] || 'cascade'} />}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Root />);

// Offline cache + installable app (skipped where the browser or host doesn't allow it)
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
      const reg = await navigator.serviceWorker.ready;
      const urls = [location.pathname, ...performance.getEntriesByType('resource').map((r) => r.name)
        .filter((u) => u.startsWith(location.origin))];
      reg.active?.postMessage({ type: 'cache-urls', urls });
    } catch { /* offline cache is optional */ }
  });
}
