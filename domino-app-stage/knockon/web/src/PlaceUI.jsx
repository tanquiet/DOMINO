// Google-Maps-style pieces: search box, place card, zoom / map-type controls.
import React, { useEffect, useMemo, useState } from 'react';

const KIND_LABEL = {
  substation_tx: 'Transmission substation (220 kV+)',
  substation: 'Substation',
  reservoir: 'Water reservoir / tank',
  hospital: 'Hospital',
  telecom: 'Telecom site',
  pump: 'Cauvery pumping station',
  feeder: 'Dedicated power line',
};
const ICON = { power: '⚡', water: '💧' };
const PLURAL = { hospital: 'hospitals', reservoir: 'water facilities', telecom: 'telecom sites',
  substation: 'substations', substation_tx: 'substations', pump: 'pumping units' };

const fmtH = (h) => (h == null ? '-' : h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} h`);

// ------------------------------------------------------------------ search
export function SearchBox({ nodes, onPick, inputRef }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const starts = [], inside = [];
    for (const n of nodes) {
      if (n.kind === 'feeder') continue;
      const name = (n.name || '').toLowerCase();
      if (name.startsWith(s)) starts.push(n); else if (name.includes(s)) inside.push(n);
      if (starts.length > 8) break;
    }
    return [...starts, ...inside].slice(0, 8);
  }, [q, nodes]);
  useEffect(() => setHi(0), [q]);

  const pick = (n) => { onPick(n); setQ(n.name); setOpen(false); inputRef.current?.blur(); };

  return (
    <div className="search">
      <span className="search-icon" aria-hidden>⌕</span>
      <input ref={inputRef} type="text" value={q} placeholder="Search a hospital, substation or reservoir"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && results[hi]) pick(results[hi]);
          else if (e.key === 'Escape') { setQ(''); setOpen(false); e.currentTarget.blur(); }
        }} />
      {q && <button className="search-clear" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Clear">×</button>}
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((n, i) => (
            <li key={n.id} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); pick(n); }}>
              <span className={`dot k-${n.kind}`} />
              <span className="sr-name">{n.name}</span>
              <span className="sr-kind">{KIND_LABEL[n.kind] || n.kind}{n.on_map === false ? ' · ~100 km away' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ dependency helpers
// path upstream along one dependency: provider -> its provider of the same resource -> ...
function pathUp(id, resource, depsOf, nodesById, guard = 8) {
  const out = [];
  let cur = id;
  while (cur && guard-- > 0) {
    const groups = depsOf.get(cur) || [];
    const g = groups.find((x) => x.resource === resource);
    if (!g) break;
    const names = g.providers.map((p) => nodesById.get(p)).filter(Boolean);
    if (!names.length) break;
    out.push(names);
    cur = names[0].id;
    if (names[0].kind === 'feeder') break;
  }
  return out;
}

export function downstream(id, dependentsOf) {
  const seen = new Set([id]);
  const q = [id];
  while (q.length) {
    const cur = q.shift();
    for (const d of dependentsOf.get(cur) || []) if (!seen.has(d)) { seen.add(d); q.push(d); }
  }
  seen.delete(id);
  return seen;
}

export function upstreamIds(id, depsOf) {
  const seen = new Set();
  const q = [id];
  while (q.length) {
    const cur = q.shift();
    for (const g of depsOf.get(cur) || []) for (const p of g.providers) if (!seen.has(p)) { seen.add(p); q.push(p); }
  }
  return seen;
}

// ------------------------------------------------------------------ place card
export function PlaceCard({ node, nodesById, depsOf, dependentsOf, status, hospitalRow, params, repairH,
  onClose, onFail, onZoom, busy, cutHours, onCutHours }) {
  if (!node) return null;
  const groups = depsOf.get(node.id) || [];
  const down = node.kind === 'hospital' ? null : downstream(node.id, dependentsOf);
  const counts = {};
  if (down) for (const d of down) { const k = nodesById.get(d)?.kind; if (k) counts[k] = (counts[k] || 0) + 1; }
  const stateCls = status ? status.state.toLowerCase() : 'up';
  const stateTxt = status ? (status.state === 'DOWN' ? `Down · ${status.reason}` : status.state === 'BACKUP' ? `On backup · ${status.reason.replace('on backup ', '')}` : 'Working') : 'Working';
  const failable = !['hospital', 'telecom'].includes(node.kind);
  const isPower = ['substation', 'substation_tx', 'feeder'].includes(node.kind);
  return (
    <div className="place">
      <button className="place-x" onClick={onClose} aria-label="Close">×</button>
      <div className="place-kind">{KIND_LABEL[node.kind] || node.kind}</div>
      <div className="place-name">{node.name}</div>
      <div className={`chip ${stateCls}`}>{stateTxt}</div>

      {node.kind === 'hospital' && (
        <div className="place-sec">
          <div className="row"><span>Diesel backup</span><b>{fmtH(params.hospital_diesel_h)}</b></div>
          <div className="row"><span>Water storage</span><b>{fmtH(params.hospital_water_h)}</b></div>
          {node.meta?.beds ? <div className="row"><span>Beds (OpenStreetMap)</span><b>{node.meta.beds}</b></div> : null}
          {node.meta?.dual_feed ? <div className="row"><span>Power feeds</span><b>2 substations</b></div> : null}
          {hospitalRow && (
            <div className="row hl"><span>In this scenario</span>
              <b>{hospitalRow.down_at_h != null ? `fails at hour ${hospitalRow.down_at_h.toFixed(1)}` : 'rides it out on backup'}</b></div>
          )}
        </div>
      )}
      {node.kind === 'substation_tx' || node.kind === 'substation' ? (
        node.meta?.voltage_kv ? <div className="place-sec"><div className="row"><span>Voltage</span><b>{node.meta.voltage_kv} kV</b></div></div> : null
      ) : null}
      {node.kind === 'reservoir' && node.meta?.supply_line && (
        <div className="place-sec"><div className="row"><span>Cauvery supply line</span><b>Stage {node.meta.supply_line}</b></div></div>
      )}

      {groups.length > 0 && (
        <div className="place-sec">
          <div className="sec-h">Depends on</div>
          {groups.map((g, i) => {
            const path = pathUp(node.id, g.resource, depsOf, nodesById);
            return (
              <div key={i} className="dep">
                <span className="dep-ic">{ICON[g.resource] || '•'}</span>
                <span>{path.map((step, j) => (
                  <span key={j}>{j > 0 && <span className="arr"> ← </span>}{step.map((s) => s.name).join(' or ')}</span>
                ))}</span>
              </div>
            );
          })}
        </div>
      )}

      {down && down.size > 0 && (
        <div className="place-sec">
          <div className="sec-h">If it fails, it can affect</div>
          <div className="affects">
            {['hospital', 'reservoir', 'telecom', 'substation'].filter((k) => counts[k] || (k === 'substation' && counts.substation_tx)).map((k) => (
              <span key={k}><b>{(counts[k] || 0) + (k === 'substation' ? counts.substation_tx || 0 : 0)}</b> {PLURAL[k]}</span>
            ))}
          </div>
        </div>
      )}

      <div className="place-actions">
        {failable && isPower && (
          <span className="cut">
            <button className="danger" disabled={busy} onClick={onFail}>Simulate power cut</button>
            <select aria-label="Power cut length" value={cutHours} onChange={(e) => onCutHours(+e.target.value)}>
              {[1, 2, 4, 7, 12, 24].map((h) => <option key={h} value={h}>{h} h</option>)}
            </select>
          </span>
        )}
        {failable && !isPower && <button className="danger" disabled={busy} onClick={onFail}>Simulate failure ({fmtH(repairH)})</button>}
        {node.on_map !== false && <button onClick={onZoom}>Zoom here</button>}
      </div>
      <div className="place-foot">Links are inferred from location; utilities don't publish feeder maps.</div>
    </div>
  );
}

// ------------------------------------------------------------------ map controls
export function MapControls({ onZoomIn, onZoomOut, onHome, styleLabel, nextLabel, onStyle }) {
  return (
    <div className="mapctl">
      <button className="mapstyle" onClick={onStyle} title={`Switch to ${nextLabel} (M)`}>
        <span className={`thumb t-${nextLabel.split(' ')[0].toLowerCase()}`} />
        <span>{nextLabel.split(' ')[0]}</span>
      </button>
      <div className="zoom">
        <button onClick={onZoomIn} aria-label="Zoom in">+</button>
        <button onClick={onZoomOut} aria-label="Zoom out">−</button>
        <button onClick={onHome} aria-label="Whole city" title="Whole city">⌂</button>
      </div>
    </div>
  );
}

export function useSlashFocus(ref) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ref]);
}
