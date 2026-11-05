// Log in and sign up for the three roles. Emergency numbers stay reachable without an account.
import React, { useState } from 'react';
import { AGENCY_DEPARTMENTS, DEMO_ACCOUNTS, ROLES, logIn, signUp } from './auth.js';
import { EMERGENCY } from './contacts.js';
import { ThemeToggle } from './ThemeToggle.jsx';

function Field({ label, id, hint, ...props }) {
  return (
    <div className="au-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
      {hint && <div className="au-hint">{hint}</div>}
    </div>
  );
}

export default function AuthPage({ onDone, onGuest }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'citizen', agency: '', code: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const switchMode = (m) => { setMode(m); setError(null); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      onDone(mode === 'login' ? await logIn(form.email, form.password) : await signUp(form));
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const fillDemo = (d) => { switchMode('login'); setForm((f) => ({ ...f, email: d.email, password: d.password })); };

  return (
    <div className="au-page cz">
      <main className="au-card">
        <div className="au-top"><ThemeToggle /></div>
        <div className="au-brand"><span className="logo">DOMIN<span>O</span></span><p>See what fails next, before it happens.</p></div>

        <div className="au-tabs" role="group" aria-label="Log in or sign up">
          <button className={mode === 'login' ? 'on' : ''} aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>Log in</button>
          <button className={mode === 'signup' ? 'on' : ''} aria-pressed={mode === 'signup'} onClick={() => switchMode('signup')}>Sign up</button>
        </div>

        <form onSubmit={submit} noValidate>
          {mode === 'signup' && (
            <>
              <fieldset className="au-roles">
                <legend>I am a</legend>
                {Object.entries(ROLES).map(([id, r]) => (
                  <label key={id} className={form.role === id ? 'on' : ''}>
                    <input type="radio" name="role" value={id} checked={form.role === id} onChange={set('role')} />
                    <span><b>{r.label}</b>{r.blurb}</span>
                  </label>
                ))}
              </fieldset>
              <Field label="Full name" id="au-name" autoComplete="name" value={form.name} onChange={set('name')} />
              {form.role === 'officer' && (
                <div className="au-field">
                  <label htmlFor="au-agency">Department</label>
                  <select id="au-agency" value={form.agency} onChange={set('agency')}>
                    <option value="">Choose your department</option>
                    {Object.keys(AGENCY_DEPARTMENTS).map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          <Field label="Email" id="au-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          <div className="au-field">
            <label htmlFor="au-password">Password</label>
            <div className="au-password">
              <input id="au-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
            {mode === 'signup' && <div className="au-hint">At least 8 characters.</div>}
          </div>
          {mode === 'signup' && form.role !== 'citizen' && (
            <Field label="Access code" id="au-code" autoComplete="off" hint={`Staff accounts need a code from your department. For this demo: ${form.role === 'officer' ? 'DEMO-OFFICER' : 'DEMO-ADMIN'}`} value={form.code} onChange={set('code')} />
          )}
          {error && <p className="au-error" role="alert">{error}</p>}
          <button className="au-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
        </form>

        <button className="au-guest" onClick={onGuest}>Continue without an account: see alerts and phone numbers</button>

        <section className="au-demo" aria-label="Demo accounts">
          <h2>Demo accounts</h2>
          <div className="au-demo-list">
            {DEMO_ACCOUNTS.map((d) => (
              <button key={d.email} type="button" onClick={() => fillDemo(d)}>
                <b>{d.agency ? `${d.agency} officer` : ROLES[d.role].label}</b><span>{d.email}</span>
              </button>
            ))}
          </div>
          <p className="au-hint">Tap one to fill the form, then press Log in. Accounts are stored in this browser only, for demonstration.</p>
        </section>

        <div className="au-emergency">
          <span>In an emergency</span>
          {EMERGENCY.map((e) => <a key={e.number} href={`tel:${e.number}`} aria-label={`${e.label}: ${e.number}`}><b>{e.number}</b> {e.label}</a>)}
        </div>
      </main>
    </div>
  );
}
