import React, { useMemo, useState } from 'react';
import { AGENCIES, RESPONSE, fmtH } from './alerts.js';

const SEV_LABEL = { critical: 'Critical', high: 'High', watch: 'Watch' };

export default function AlertsPanel({ alerts, t, responses, outcome, onAct, onRespondAll, onReplay, onClear,
  summary, showResp, onToggleResp, onSelect, busy }) {
  const [role, setRole] = useState('All');
  const [delay, setDelay] = useState(1);
  const raised = useMemo(() => alerts.filter((a) => a.hitAt <= t + 1e-9), [alerts, t]);
  const counts = useMemo(() => {
    const c = { All: raised.length };
    for (const a of raised) c[a.agency] = (c[a.agency] || 0) + 1;
    return c;
  }, [raised]);
  const list = raised.filter((a) => role === 'All' || a.agency === role);
  const responded = new Map(responses.map((r) => [r.alertId, r]));
  const actionable = alerts.filter((a) => a.action).length;

  return (
    <div className="alerts">
      <div className="alerts-head">
        <div className="h">Alerts <span className="sub">sent to the people responsible (SMS / WhatsApp simulated)</span></div>
        <div className="alert-count">{raised.length}<span>/{alerts.length}</span></div>
      </div>

      {summary && (
        <div className="saved">
          <div className="h">Damage avoided by acting on alerts</div>
          <div className="saved-grid">
            <div><div className="lbl">Hospitals that fail</div><div className="num"><span className="down">{summary.before.hosp}</span> → <span className="okc">{summary.after.hosp}</span></div></div>
            <div><div className="lbl">Hospital-hours lost</div><div className="num"><span className="down">{Math.round(summary.before.hours)}</span> → <span className="okc">{Math.round(summary.after.hours)}</span></div></div>
            <div><div className="lbl">Resilience index</div><div className="num">{summary.before.ri} → <span className="okc">{summary.after.ri}</span></div></div>
          </div>
          <button className="wide" onClick={onToggleResp}>{showResp ? 'Show without responses' : 'Show with responses'} <kbd>G</kbd></button>
        </div>
      )}
      <div className="roles" role="tablist">
        {AGENCIES.map((a) => (
          <button key={a} role="tab" aria-selected={role === a} className={role === a ? 'on' : ''} onClick={() => setRole(a)}>
            {a === 'Hospital' ? 'Hospitals' : a}{counts[a] ? <b>{counts[a]}</b> : null}
          </button>
        ))}
      </div>

      <div className="alert-list">
        {list.length === 0 && <div className="sub">{alerts.length ? 'No alerts yet at this hour. Press play.' : 'No alerts in this scenario.'}</div>}
        {list.slice(0, 30).map((a) => {
          const r = responded.get(a.id);
          const left = a.failAt == null ? null : a.failAt - t;
          return (
            <div key={a.id} className={`alert ${a.severity}`}>
              <div className="al-top">
                <span className={`sev ${a.severity}`}>{SEV_LABEL[a.severity]}</span>
                <span className="agency">{a.agency}</span>
                <span className="al-time">{a.failAt == null ? 'recovers in time' : left > 0 ? `fails in ${fmtH(left)}` : `failed at hour ${a.failAt.toFixed(1)}`}</span>
              </div>
              <button className="al-title" onClick={() => onSelect(a.nodeId)}>{a.title}</button>
              <div className="al-detail">{a.detail}</div>
              {a.action && (
                <div className="al-act">
                  {r ? (
                    <span className="done">✓ {a.action.label.replace('Send', 'Sent').replace('Prioritise', 'Prioritised').replace('Link to', 'Linked to')} at hour {r.at.toFixed(1)}
                      {outcome[a.id] && <em className={outcome[a.id] === 'too late' ? 'late' : 'ok'}> · {outcome[a.id]}</em>}</span>
                  ) : (
                    <button onClick={() => onAct(a)} disabled={busy}>{a.action.label}</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {list.length > 30 && <div className="sub">+ {list.length - 30} more</div>}
      </div>

      <div className="respond">
        <div className="resp-row">
          <button className="wide2" disabled={busy || !actionable} onClick={() => onRespondAll(delay)}>Respond to all</button>
          <label>within
            <select value={delay} onChange={(e) => setDelay(+e.target.value)}>
              {[0.5, 1, 2, 4].map((d) => <option key={d} value={d}>{fmtH(d)}</option>)}
            </select>
            of each alert</label>
        </div>
        <div className="resp-row">
          <button className="wide2 go" disabled={busy || responses.length === 0} onClick={onReplay}>Replay with responses ({responses.length})</button>
          {responses.length > 0 && <button className="ghost2" onClick={onClear}>Clear</button>}
        </div>
      </div>

      <div className="sub assume-note">Response assumptions: a tanker service starts {RESPONSE.tanker_arrive_h} h after the request and keeps supplying until city water returns;
        a mobile generator arrives in {RESPONSE.gen_arrive_h} h and runs with refuelling; switching a reservoir takes {RESPONSE.link_h} h; a prioritised repair
        finishes {RESPONSE.priority_repair_h} h after dispatch. Enough tankers and generators are assumed. An action only helps if it lands before the failure.</div>
    </div>
  );
}
