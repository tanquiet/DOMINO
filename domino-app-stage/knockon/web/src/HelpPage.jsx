// Help desk and settings: every authority's numbers, a question form, and this device's preferences.
import React, { useEffect, useMemo, useState } from 'react';
import { CHECKED_ON, CONTACT_GROUPS, EMERGENCY, HELP_TOPICS, searchContacts, telHref, whatsappHref } from './contacts.js';
import { distanceKm } from './mapkit.js';
import { addHelpQuery, loadHelpQueries, loadSettings, removeHelpQuery, saveSettings } from './settings.js';
import { allComplaints, deleteComplaints } from './complaintStore.js';
import { ROLES, listUsers, removeUser } from './auth.js';

const FAQ = [
  ['Do my reports reach the department?', 'Not automatically yet. Reports are saved in this browser. After you report, you can send the photo and details through WhatsApp or email, or call the helpline.'],
  ['Who sees the alerts?', 'Right now, only people using this same device and browser. Alerts between different phones need a server, which is not set up yet. You can share any alert by hand.'],
  ['Are alerts official?', 'No. They come from citizens and are shown as reports until a department confirms them.'],
  ['Is my photo private?', 'Photos are resized and their hidden location data removed before saving. They stay on this device unless you share them.'],
];

function ContactRow({ c }) {
  return (
    <li className="h-row">
      <div className="h-row-main">
        <div className="h-name">{c.name}</div>
        <div className="c-foot">{c.purpose}</div>
        <div className="h-meta">
          {c.status === 'older' && <span className="h-older">Older listing: confirm</span>}
          <a href={c.source} target="_blank" rel="noreferrer">Source ↗</a>
        </div>
      </div>
      {c.number
        ? <a className="h-call" href={telHref(c.number)}>{c.number}</a>
        : <a className="h-call wa" href={whatsappHref(c.whatsapp)} target="_blank" rel="noreferrer">WhatsApp {c.whatsapp}</a>}
    </li>
  );
}

function Numbers() {
  const [q, setQ] = useState('');
  const groups = useMemo(() => searchContacts(q), [q]);
  return (
    <div className="h-section">
      <div className="h-emergency">
        {EMERGENCY.map((e) => <a key={e.number} href={`tel:${e.number}`}><b>{e.number}</b><span>{e.label}</span></a>)}
      </div>
      <input className="h-search" type="search" aria-label="Search numbers" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: water, BESCOM, KPTCL, hospital, traffic…" />
      {groups.length === 0 && <p className="c-empty">No number matches that. Try another word.</p>}
      {groups.map((g) => (
        <section key={g.id} className="c-panel">
          <h3>{g.title}</h3>
          {g.note && <p className="c-foot h-note">{g.note}</p>}
          <ul className="h-list">{g.items.map((c) => <ContactRow key={`${c.name}-${c.number || c.whatsapp}`} c={c} />)}</ul>
        </section>
      ))}
      <p className="c-foot">Taken from official sites on {CHECKED_ON} and not test-called. “Older listing” means the page is dated or other sources disagree. No official number was found for KC General Hospital, so it is not listed.</p>
    </div>
  );
}

function Ask() {
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [queries, setQueries] = useState(() => loadHelpQueries());
  const t = HELP_TOPICS[topic];
  const group = t?.group ? CONTACT_GROUPS.find((g) => g.id === t.group) : null;
  const submit = (e) => {
    e.preventDefault();
    setQueries(addHelpQuery({ topic, message: message.trim() }));
    setMessage('');
  };
  return (
    <div className="h-section">
      <form className="c-panel h-form" onSubmit={submit}>
        <h3>Ask the help desk</h3>
        <label className="c-label" htmlFor="h-topic">What is it about?</label>
        <select id="h-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Choose a topic</option>
          {Object.entries(HELP_TOPICS).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}
        </select>
        {t && <p className="h-answer">{t.answer}</p>}
        {group && <ul className="h-list">{group.items.filter((c) => c.status === 'official').slice(0, 2).map((c) => <ContactRow key={`${c.name}-${c.number || c.whatsapp}`} c={c} />)}</ul>}
        <label className="c-label" htmlFor="h-msg">Your question</label>
        <textarea id="h-msg" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Still need help? Write it here." />
        <button className="c-send" disabled={!topic || !message.trim()}>Save my question</button>
        <p className="c-foot">Saved on this device with a reference number. It does not reach anyone yet, so use the numbers above for anything urgent.</p>
      </form>
      {queries.length > 0 && (
        <section className="c-panel">
          <h3>My questions</h3>
          <ul className="h-list">
            {queries.map((q) => (
              <li key={q.id} className="h-row">
                <div className="h-row-main">
                  <div className="h-name">{q.id} · {HELP_TOPICS[q.topic]?.label}</div>
                  <div className="c-foot">{q.message}</div>
                </div>
                <button className="c-btn" onClick={() => setQueries(removeHelpQuery(q.id))}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="c-panel">
        <h3>Common questions</h3>
        {FAQ.map(([q, a]) => <details key={q} className="h-faq"><summary>{q}</summary><p className="c-foot">{a}</p></details>)}
      </section>
    </div>
  );
}

function Settings({ user }) {
  const [s, setS] = useState(() => loadSettings());
  const [note, setNote] = useState(null);
  const [nearest, setNearest] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const update = (patch) => setS(saveSettings(patch));

  useEffect(() => {
    fetch('data/domino.json').then((r) => r.json())
      .then((d) => setHospitals(d.graph.nodes.filter((n) => n.kind === 'hospital')))
      .catch(() => {});
  }, []);

  const locate = () => {
    if (!navigator.geolocation) { setNote('This browser cannot share your location.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { update({ area: { lat: p.coords.latitude, lon: p.coords.longitude } }); setNote('Area saved.'); },
      () => setNote('Could not get your location. Check the browser permission.'),
      { timeout: 10000 },
    );
  };
  const toggleNotify = async () => {
    if (s.notify) { update({ notify: false }); return; }
    if (!('Notification' in window)) { setNote('This browser does not support notifications.'); return; }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') { update({ notify: true }); setNote('Notifications on, while this app is open.'); } else setNote('Notifications were blocked in the browser.');
  };
  const clearReports = async () => {
    const everything = await allComplaints();
    const all = user.role === 'admin' ? everything : everything.filter((c) => c.ownerId === user.id);
    await deleteComplaints(all.map((c) => c.id));
    setNote(`Removed ${all.length} report${all.length === 1 ? '' : 's'} from this device.`);
  };
  const findNearest = () => {
    if (!s.area) { setNote('Set your area first.'); return; }
    setNearest(hospitals.map((h) => ({ ...h, km: distanceKm(s.area.lat, s.area.lon, h.lat, h.lon) })).sort((a, b) => a.km - b.km).slice(0, 5));
  };

  return (
    <div className="h-section">
      <section className="c-panel h-setting">
        <h3>My area</h3>
        <p className="c-foot">{s.area ? `Saved: ${s.area.lat.toFixed(4)}, ${s.area.lon.toFixed(4)}. Used for alerts near you. Stays on this device.` : 'Not set. Set it to see alerts near you as soon as you open the app.'}</p>
        <div className="c-actions">
          <button className="c-btn" onClick={locate}>Use my location</button>
          {s.area && <button className="c-btn" onClick={() => { update({ area: null }); setNearest(null); }}>Forget my area</button>}
        </div>
      </section>
      <section className="c-panel h-setting">
        <h3>Alert distance</h3>
        <div className="c-chips">
          {[1, 2, 5, 10].map((km) => <button key={km} className={s.radiusKm === km ? 'on' : ''} aria-pressed={s.radiusKm === km} onClick={() => update({ radiusKm: km })}>{km} km</button>)}
        </div>
      </section>
      <section className="c-panel h-setting">
        <h3>Notifications</h3>
        <p className="c-foot">Get a notification when a new alert appears in your area. Works while this app is open on this device.</p>
        <button className="c-btn" aria-pressed={s.notify} onClick={toggleNotify}>{s.notify ? 'Turn off' : 'Turn on'}</button>
      </section>
      <section className="c-panel h-setting">
        <h3>Nearest hospitals</h3>
        <p className="c-foot">From OpenStreetMap, which may include clinics. Open one in Google Maps for its phone number.</p>
        <button className="c-btn" onClick={findNearest}>Find nearest hospitals</button>
        {nearest && (
          <ol className="c-hot">
            {nearest.map((h) => <li key={h.id}><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name}, Bengaluru`)}`} target="_blank" rel="noreferrer">{h.name}</a><span>{h.km.toFixed(1)} km</span></li>)}
          </ol>
        )}
      </section>
      {user.role !== 'guest' && (
        <section className="c-panel h-setting">
          <h3>My data</h3>
          <p className="c-foot">Reports and photos are stored only in this browser.</p>
          <button className="c-btn" onClick={clearReports}>{user.role === 'admin' ? 'Delete all reports on this device' : 'Delete my reports'}</button>
        </section>
      )}
      {note && <p className="c-foot" role="status">{note}</p>}
    </div>
  );
}

function Users({ me }) {
  const [users, setUsers] = useState(() => listUsers());
  const [error, setError] = useState(null);
  const remove = (id) => {
    try { removeUser(id); setUsers(listUsers()); setError(null); } catch (e) { setError(e.message); }
  };
  return (
    <div className="h-section">
      <section className="c-panel">
        <h3>Users ({users.length})</h3>
        <ul className="h-list">
          {users.map((u) => (
            <li key={u.id} className="h-row">
              <div className="h-row-main">
                <div className="h-name">{u.name}</div>
                <div className="c-foot">{u.agency ? `${u.agency} officer` : ROLES[u.role].label} · {u.email}</div>
              </div>
              {u.id === me.id ? <span className="c-foot">You</span> : <button className="c-btn" onClick={() => remove(u.id)}>Remove</button>}
            </li>
          ))}
        </ul>
      </section>
      {error && <p className="c-error" role="alert">{error}</p>}
    </div>
  );
}

export default function HelpPage({ user }) {
  const [tab, setTab] = useState('numbers');
  useEffect(() => {
    document.title = 'DOMINO - Help desk and settings';
    return () => { document.title = 'DOMINO'; };
  }, []);
  const TABS = [['numbers', 'Phone numbers'], ['ask', 'Ask a question'], ['settings', 'Settings'], ...(user.role === 'admin' ? [['users', 'Users']] : [])];
  return (
    <div className="c-page">
      <div className="c-header">
        <nav className="c-tabs" aria-label="Help sections">
          {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}
        </nav>
      </div>
      <main className="c-main">
        {tab === 'numbers' && <Numbers />}
        {tab === 'ask' && <Ask />}
        {tab === 'settings' && <Settings user={user} />}
        {tab === 'users' && <Users me={user} />}
      </main>
    </div>
  );
}
