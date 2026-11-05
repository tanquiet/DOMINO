// The public complaints page: report with a photo, a priority desk for departments, and analysis.
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { BitmapLayer, IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { pinAtlas } from './mapkit.js';
import { ALERT_ADVICE, AREAS, BANDS, CASCADE_KIND, CATEGORIES, CITIZEN_GROUPS, CITIZEN_STATUS, DEPARTMENTS, HAZARDS, STATUSES, STATUS_LABEL, activeAlerts, alertShareText, analyse, groupComplaints,
  makeComplaint, nearestArea, progressOf, sampleComplaints, scoreComplaint, shareText, suggestCategory, withStatus } from './complaints.js';
import { allComplaints, allContractorReports, allFeedback, deleteComplaints, deleteContractorReports, deleteFeedback, preparePhoto, saveComplaints, saveContractorReports, saveFeedback } from './complaintStore.js';
import { CONTRACTOR_NAME_MAX, NOT_NAMED, REPORT_DETAILS_MAX, REPORT_REASONS, REPORT_STATUS, cleanContractorName, contractorOf, contractorSummary, makeContractorReport, reportForJob, reviewReport, sampleContractorReports, sortReports } from './contractors.js';
import { DEPARTMENT_PHOTO, WORK_PHOTOS, workPhotoUrl } from './workPhotos.js';
import { MicButton, SpeakAlert, VoiceLangPicker } from './VoiceUI.jsx';
import { appendDictated, canListen, canSpeak } from './voice.js';
import { GRADES, SUGGESTION_MAX, fixedWork, gradeForJob, gradeForService, makeFeedback, reportCard, sampleFeedback, suggestionsFor } from './feedback.js';
import { loadSettings, saveSettings } from './settings.js';
import { DEMO_ACCOUNTS, departmentsFor } from './auth.js';

const STREET = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const BAND_COLOR = { critical: [220, 38, 38], high: [234, 88, 12], medium: [202, 138, 4], low: [100, 116, 139] };
const fmtHours = (h) => (Math.abs(h) < 1 ? `${Math.round(Math.abs(h) * 60)} min` : Math.abs(h) < 48 ? `${Math.round(Math.abs(h))} h` : `${Math.round(Math.abs(h) / 24)} days`);
const fmtWhen = (ms) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const mapsUrl = (c) => `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`;

// ------------------------------------------------------------------ small map
function MiniMap({ center, points = [], pin, onPick, onSelect, selectedId, height, radiusKm, focus }) {
  const atlas = useMemo(() => pinAtlas(), []);
  const [view, setView] = useState({ longitude: center.lon, latitude: center.lat, zoom: 10.6, pitch: 0, bearing: 0 });
  // Move the map only when asked to. A tap to mark a spot should not make the map jump.
  useEffect(() => {
    if (focus) setView((v) => ({ ...v, longitude: focus.lon, latitude: focus.lat, zoom: focus.zoom ?? v.zoom }));
  }, [focus]);
  const layers = [
    new TileLayer({
      id: 'street', data: STREET, minZoom: 0, maxZoom: 19, tileSize: 256, onTileError: () => {},
      renderSubLayers: (props) => {
        const [[w, s], [e, n]] = props.tile.boundingBox;
        return new BitmapLayer(props, { data: null, image: props.data, bounds: [w, s, e, n] });
      },
    }),
    pin && radiusKm && new ScatterplotLayer({
      id: 'radius', data: [pin], getPosition: (p) => [p.lon, p.lat], getRadius: radiusKm * 1000, radiusUnits: 'meters',
      stroked: true, getFillColor: [37, 99, 235, 28], getLineColor: [29, 78, 216, 200], lineWidthUnits: 'pixels', getLineWidth: 2,
      updateTriggers: { getRadius: [radiusKm] },
    }),
    new ScatterplotLayer({
      id: 'jobs', data: points, pickable: !!onSelect, getPosition: (g) => [g.lead.lon, g.lead.lat], radiusUnits: 'pixels',
      getRadius: (g) => (g.id === selectedId ? 11 : 7 + Math.min(4, g.members.length - 1)),
      getFillColor: (g) => [...BAND_COLOR[g.band.id], 235], stroked: true, lineWidthUnits: 'pixels',
      getLineWidth: (g) => (g.id === selectedId ? 3 : 2), getLineColor: [255, 255, 255, 255],
      updateTriggers: { getRadius: [selectedId], getLineWidth: [selectedId] },
    }),
    pin && new IconLayer({
      id: 'pin', data: [pin], iconAtlas: atlas.url, iconMapping: atlas.mapping, sizeUnits: 'pixels',
      getPosition: (p) => [p.lon, p.lat], getIcon: () => 'report', getSize: 40,
    }),
  ].filter(Boolean);
  return (
    <div className="c-map" style={height ? { height } : undefined}>
      <DeckGL viewState={view} onViewStateChange={({ viewState }) => setView(viewState)} controller layers={layers} pickingRadius={6}
        getCursor={({ isDragging, isHovering }) => (onPick ? 'crosshair' : isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
        onClick={(info) => {
          if (onSelect && (info.object || !onPick)) onSelect(info.object?.id ?? null);
          else if (onPick && info.coordinate) onPick({ lon: info.coordinate[0], lat: info.coordinate[1] });
        }} />
      <span className="c-credit">Map: Esri, © OpenStreetMap contributors</span>
    </div>
  );
}

function Photo({ blob, alt, className }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return undefined; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return <div className={`c-nophoto ${className || ''}`}>No photo</div>;
  return <img className={className} src={url} alt={alt} />;
}

const BandChip = ({ band, score }) => <span className={`c-band ${band.id}`}>{band.label}{score != null ? ` · ${score}` : ''}</span>;

function ScoreParts({ parts, score }) {
  return (
    <ul className="c-parts">
      {parts.map((p) => <li key={p.label}><span>{p.label}</span><b>+{p.points}</b></li>)}
      <li className="total"><span>Priority score{parts.reduce((s, p) => s + p.points, 0) > 100 ? ' (capped at 100)' : ''}</span><b>{score}</b></li>
    </ul>
  );
}

// ------------------------------------------------------------------ alerts for people
const timeAgo = (ms, now) => { const h = (now - ms) / 3600000; return h < 1 / 60 ? 'just now' : `${fmtHours(h)} ago`; };
const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
const ZOOM_FOR_KM = { 1: 13.6, 2: 12.9, 5: 11.7, 10: 10.8 };
const placeName = (p) => { const a = nearestArea(p.lat, p.lon); return a ? `of ${a.name}` : 'of this spot'; };

const ReportThumb = ({ blob, category }) => (blob
  ? <Photo blob={blob} alt={CATEGORIES[category].label} className="c-thumb" />
  : <div className="c-thumb z-thumb" aria-hidden="true">{CATEGORIES[category].icon}</div>);

// A list of well-known areas: quicker than finding a place on the map, and works without location access.
function AreaPicker({ place, onPick, emptyLabel }) {
  const match = place && AREAS.find((a) => a.lat === place.lat && a.lon === place.lon);
  return (
    <select className="z-select" aria-label="Choose an area" value={match ? match.name : place ? 'pin' : ''}
      onChange={(e) => { const a = AREAS.find((x) => x.name === e.target.value); onPick(a ? { lat: a.lat, lon: a.lon } : null); }}>
      <option value="">{emptyLabel}</option>
      {place && !match && <option value="pin" disabled>A spot you picked</option>}
      {AREAS.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
    </select>
  );
}

function AlertCard({ a, now, onConfirm, confirmed, selected }) {
  const cat = CATEGORIES[a.lead.category];
  const [note, setNote] = useState(null);
  const people = a.members.length;
  const photo = a.members.find((m) => m.photo)?.photo || null;
  const share = async () => {
    const text = alertShareText(a);
    try {
      if (navigator.share) { await navigator.share({ title: `Alert: ${cat.label}`, text }); return; }
      await navigator.clipboard.writeText(text); setNote('Copied. Paste it into WhatsApp or a message.');
    } catch { /* the person closed the share sheet */ }
  };
  return (
    <article id={`alert-${a.id}`} className={`c-job a-card z-band-${a.band.id} ${selected ? 'selected' : ''}`}>
      <div className="c-job-head a-head">
        <ReportThumb blob={photo} category={a.lead.category} />
        <div className="c-job-main">
          <div className="c-job-top"><BandChip band={a.band} /><span className="c-status">{a.km != null ? `${fmtKm(a.km)} away` : ''}</span></div>
          <div className="c-job-title">{cat.label}</div>
          <div className="c-job-sub">{people} {people === 1 ? 'person' : 'people'} reported · latest {timeAgo(a.latestAt, now)}{a.lead.sample ? ' · sample' : ''}</div>
        </div>
      </div>
      <div className="a-body">
        <p className="a-advice">{a.advice}</p>
        {a.causes.length > 0 && <p className="c-foot">Possibly linked: {a.causes.slice(0, 2).map((c) => `${CATEGORIES[c.category].label.toLowerCase()} reported ${fmtKm(c.km)} away`).join('; ')}.</p>}
        <div className="c-actions">
          <button className="c-btn" disabled={confirmed} onClick={() => onConfirm(a)}>{confirmed ? 'Thanks, counted ✓' : 'I see this too'}</button>
          <button className="c-btn" onClick={share}>Warn others</button>
          <SpeakAlert alert={a} />
          <a className="c-btn" href={mapsUrl(a.lead)} target="_blank" rel="noreferrer">Open map ↗</a>
        </div>
        {note && <p className="c-foot">{note}</p>}
      </div>
    </article>
  );
}

function Welcome({ onClose }) {
  return (
    <section className="z-welcome" aria-label="How DOMINO works">
      <ol>
        <li><b>Check before you leave</b>See floods, heavy traffic and road problems people have reported near you.</li>
        <li><b>Report what you see</b>Tap the problem and add a photo. We name the department responsible.</li>
        <li><b>Follow it</b>Send it to the department and see its progress under My reports.</li>
      </ol>
      <button className="c-btn" onClick={onClose}>Got it</button>
    </section>
  );
}

function AlertsView({ list, nodes, center, now, onConfirm, onReport, onLoadSamples, onClearSamples, hasSamples, canDemo, showWelcome }) {
  const [settings, setSettings] = useState(() => loadSettings());
  const [place, setPlace] = useState(() => settings.area);
  const [focus, setFocus] = useState(() => (settings.area ? { ...settings.area, zoom: ZOOM_FOR_KM[settings.radiusKm] } : null));
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState(null);
  const [voiceLang, setVoiceLang] = useState(settings.voiceLang);
  const radiusKm = settings.radiusKm;
  const alerts = useMemo(() => activeAlerts(list, nodes, now, place, radiusKm), [list, nodes, now, place, radiusKm]);
  const everywhere = useMemo(() => activeAlerts(list, nodes, now).length, [list, nodes, now]);
  useEffect(() => {
    if (selectedId) document.getElementById(`alert-${selectedId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedId]);
  const goTo = (p) => {
    setPlace(p);
    setFocus(p ? { ...p, zoom: ZOOM_FOR_KM[radiusKm] } : { ...center, zoom: 10.6 });
    setSettings(saveSettings({ area: p }));
    setNote(null);
  };
  const locate = () => {
    if (!navigator.geolocation) { setNote('This browser cannot share your location. Choose an area instead.'); return; }
    setNote('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => goTo({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setNote('Could not get your location. Choose an area or tap the map instead.'),
      { timeout: 10000 },
    );
  };
  const setRadius = (km) => {
    setSettings(saveSettings({ radiusKm: km }));
    if (place) setFocus({ ...place, zoom: ZOOM_FOR_KM[km] });
  };
  const confirm = (a) => {
    onConfirm(a);
    setSettings(saveSettings({ confirmed: [...settings.confirmed, a.id].slice(-200) }));
  };
  const n = alerts.length;
  const tone = !n ? 'clear' : alerts.some((a) => a.band.id === 'critical') ? 'danger' : 'watch';
  const title = `${n ? `${n} alert${n === 1 ? '' : 's'}` : 'No alerts'} ${place ? `within ${radiusKm} km ${placeName(place)}` : 'across the city'}`;
  return (
    <div className="z-near">
      <div className={`a-summary z-hero ${tone}`}>
        <div className="z-hero-mark" aria-hidden="true">{tone === 'clear' ? '✓' : '!'}</div>
        <div className="z-hero-text">
          <b>{title}</b>
          <p>{n ? (place ? 'Tap the map to check where you are going before you leave.' : 'Use your location or choose an area to see what affects you.')
            : 'Nothing has been reported here. Conditions can still change, so take care.'}</p>
        </div>
        {onReport && <button className="c-send z-cta" onClick={onReport}>Report a problem</button>}
      </div>

      {showWelcome && !settings.welcomed && <Welcome onClose={() => setSettings(saveSettings({ welcomed: true }))} />}

      <div className="z-controls">
        <button className="c-btn" onClick={locate}>Use my location</button>
        <AreaPicker place={place} onPick={goTo} emptyLabel="All of Bengaluru" />
        {canSpeak() && <VoiceLangPicker value={voiceLang} onChange={setVoiceLang} />}
        <div className="c-seg" role="group" aria-label="Distance">
          {[1, 2, 5, 10].map((km) => <button key={km} className={radiusKm === km ? 'on' : ''} aria-pressed={radiusKm === km} onClick={() => setRadius(km)}>{km} km</button>)}
        </div>
      </div>
      {note && <p className="c-foot" role="status">{note}</p>}

      <div className="z-grid">
        <div className="z-list">
          {n === 0 && (
            <div className="c-empty">
              <p>{everywhere ? `Nothing within ${radiusKm} km of this place. ${everywhere} elsewhere in the city.` : 'No alerts anywhere in the city right now.'}</p>
              {everywhere > 0 && place && <button className="c-btn" onClick={() => goTo(null)}>See the whole city</button>}
              {!everywhere && canDemo && <button className="c-btn" onClick={onLoadSamples}>Load sample reports</button>}
            </div>
          )}
          {alerts.map((a) => <AlertCard key={a.id} a={a} now={now} onConfirm={confirm} confirmed={settings.confirmed.includes(a.id)} selected={selectedId === a.id} />)}
          {hasSamples && canDemo && <button className="c-link" onClick={onClearSamples}>Remove sample reports</button>}
        </div>
        <div className="z-mapwrap">
          <MiniMap center={place || center} points={alerts} pin={place} radiusKm={place ? radiusKm : null} onPick={setPlace} focus={focus} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>
      <p className="c-foot z-disclaimer">Reports come from citizens and are not official warnings. For now, alerts appear only on this device, so use “Warn others” to send one to people. In an emergency call <a href="tel:112">112</a>.</p>
    </div>
  );
}

// ------------------------------------------------------------------ report
const REPORT_STEPS = ['Problem', 'Photo', 'Place', 'Send'];
const EMPTY_DRAFT = { step: 0, photo: null, category: null, hazard: null, where: null, description: '' };

// The draft lives in the page, so moving to another tab and back does not lose it.
function ReportView({ nodes, center, inside, list, onSubmit, draft, setDraft, user, onMine }) {
  const { step, photo, category, hazard, where, description } = draft;
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const [error, setError] = useState(null);
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [focus, setFocus] = useState(where);
  const [area, setArea] = useState(null);
  const cameraRef = useRef(null), galleryRef = useRef(null);

  const go = (s) => { setError(null); patch({ step: s }); };
  // Each step starts at the top, or a phone would open it half way down.
  useEffect(() => { window.scrollTo(0, 0); document.querySelector('.c-main')?.scrollTo(0, 0); }, [step]);
  const choosePhoto = async (file) => {
    if (!file) return;
    setError(null);
    try { patch({ photo: await preparePhoto(file) }); } catch (e) { setError(e.message); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setError('This browser cannot share your location. Tap the map instead.'); return; }
    setLocating(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { const at = { lat: p.coords.latitude, lon: p.coords.longitude }; setLocating(false); patch({ where: at }); setFocus({ ...at, zoom: 16 }); },
      () => { setLocating(false); setError('Could not get your location. Choose an area, then tap the spot on the map.'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const suggestion = suggestCategory(description);
  const outside = where && !inside(where);
  const send = async () => {
    setSending(true); setError(null);
    try {
      const c = makeComplaint({ category, hazard, lat: where.lat, lon: where.lon, description, photo, ownerId: user.id });
      await onSubmit(c);
      const sameJob = groupComplaints([...list, c], nodes).find((g) => g.members.some((m) => m.id === c.id));
      setReceipt({ complaint: c, reports: sameJob.members.length, ...scoreComplaint(c, { nodes, reports: sameJob.members.length }) });
      setDraft(EMPTY_DRAFT);
    } catch (e) { setError(e.message || 'Could not save the report. Please try again.'); }
    setSending(false);
  };

  if (receipt) return <Receipt receipt={receipt} onAnother={() => setReceipt(null)} onMine={onMine} />;

  const dept = category ? DEPARTMENTS[CATEGORIES[category].dept] : null;
  const near = where && nearestArea(where.lat, where.lon);
  const back = step > 0 && <button className="c-btn" onClick={() => go(step - 1)}>Back</button>;
  return (
    <div className="z-wizard">
      <ol className="z-progress" aria-label="Steps">
        {REPORT_STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}><span>{i < step ? '✓' : i + 1}</span>{s}</li>)}
      </ol>

      {step === 0 && (
        <section className="z-step">
          <h2>What is the problem?</h2>
          {canListen() && (
            <div className="v-say">
              <MicButton label="Say the problem" onText={(text) => patch({ description: text.slice(0, 500) })} />
              {description.trim() && <p className="c-quote">“{description.trim()}”</p>}
              {description.trim() && (suggestion
                ? <button className="c-send v-use" onClick={() => patch({ category: suggestion, step: 1 })}>{CATEGORIES[suggestion].icon} {CATEGORIES[suggestion].label}: goes to {DEPARTMENTS[CATEGORIES[suggestion].dept].short}. Use this</button>
                : <p className="c-foot">We could not tell the problem from that. Your words are saved, so choose the problem below or try again.</p>)}
            </div>
          )}
          {CITIZEN_GROUPS.map((g) => (
            <div key={g.label}>
              <h3>{g.label}</h3>
              <div className="z-tiles">
                {g.ids.map((id) => (
                  <button key={id} className={category === id ? 'on' : ''} aria-pressed={category === id} onClick={() => patch({ category: id, step: 1 })}>
                    <span aria-hidden="true">{CATEGORIES[id].icon}</span>{CATEGORIES[id].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="c-warn">If someone is in danger, call <a href="tel:112">112</a> first.</p>
        </section>
      )}

      {step === 1 && (
        <section className="z-step">
          <h2>Add a photo</h2>
          <p className="z-lead">A photo helps the department find and fix it. Stay at a safe distance, and never take one while driving.</p>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { choosePhoto(e.target.files[0]); e.target.value = ''; }} aria-label="Take a photo" />
          <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => { choosePhoto(e.target.files[0]); e.target.value = ''; }} aria-label="Choose a photo" />
          {photo && <Photo blob={photo} alt="Your photo" className="z-preview" />}
          <div className="z-photo-btns">
            <button className="c-btn" onClick={() => cameraRef.current.click()}>{photo ? 'Take another' : 'Take a photo'}</button>
            <button className="c-btn" onClick={() => galleryRef.current.click()}>Choose from gallery</button>
          </div>
          <label className="c-label" htmlFor="c-desc">Anything else to add? (optional)</label>
          <textarea id="c-desc" className="z-text" rows={3} maxLength={500} value={description} onChange={(e) => patch({ description: e.target.value })} placeholder="What do you see? How long has it been like this?" />
          <MicButton onText={(text) => setDraft((d) => ({ ...d, description: appendDictated(d.description, text, 500) }))} />
          {suggestion && suggestion !== category && (
            <button className="c-suggest" onClick={() => patch({ category: suggestion })}>Sounds like: {CATEGORIES[suggestion].label}. Use this</button>
          )}
          {error && <p className="c-error" role="alert">{error}</p>}
          <div className="z-nav">{back}<button className="c-send" onClick={() => go(2)}>{photo || description.trim() ? 'Next' : 'Skip for now'}</button></div>
        </section>
      )}

      {step === 2 && (
        <section className="z-step">
          <h2>Where is it?</h2>
          <div className="z-controls">
            <button className="c-btn" onClick={locate} disabled={locating}>{locating ? 'Finding you…' : 'Use my location'}</button>
            <AreaPicker place={area} emptyLabel="Jump to an area…" onPick={(a) => { setArea(a); if (a) setFocus({ ...a, zoom: 14.5 }); }} />
          </div>
          <div className="c-where">
            <p className="z-marked" role="status">{where ? `✓ Marked ${near ? `near ${near.name}` : 'on the map'}. Tap the map to move it.` : 'Now tap the exact spot on the map.'}</p>
            {outside && <p className="c-warn">This spot looks outside the Bengaluru area this service covers.</p>}
            <MiniMap center={where || center} pin={where} onPick={(p) => patch({ where: p })} focus={focus} height={360} />
          </div>
          {error && <p className="c-error" role="alert">{error}</p>}
          <div className="z-nav">{back}<button className="c-send" disabled={!where} onClick={() => go(3)}>Next</button></div>
        </section>
      )}

      {step === 3 && (
        <section className="z-step">
          <h2>Check and send</h2>
          <div className="z-review">
            <ReportThumb blob={photo} category={category} />
            <div>
              <div className="c-job-title">{CATEGORIES[category].label}</div>
              <div className="c-job-sub">{near ? `Near ${near.name}` : `${where.lat.toFixed(4)}, ${where.lon.toFixed(4)}`}</div>
              <p className="c-routed">Responsible: <b>{dept.name}</b></p>
            </div>
          </div>
          {description.trim() && <p className="c-quote">“{description.trim()}”</p>}
          <h3 id="z-serious">How serious is it?</h3>
          <div className="c-chips z-serious" role="group" aria-labelledby="z-serious">
            {Object.entries(HAZARDS).map(([id, h]) => (
              <button key={id} className={hazard === id ? 'on' : ''} aria-pressed={hazard === id} onClick={() => patch({ hazard: id })}>{h.label}</button>
            ))}
          </div>
          {hazard === 'high' && <p className="c-warn">If someone is in danger, call <a href="tel:112">112</a> first.</p>}
          {error && <p className="c-error" role="alert">{error}</p>}
          <div className="z-nav">{back}<button className="c-send" disabled={!hazard || sending} onClick={send}>{sending ? 'Sending…' : 'Send report'}</button></div>
          <p className="c-foot">{hazard ? 'Your photo is made smaller and its hidden location data removed. Only the place you marked is kept.' : 'Choose how serious it is to continue.'}</p>
        </section>
      )}
    </div>
  );
}

// Where a report has got to, in words a citizen would use.
function Journey({ report }) {
  const reached = STATUSES.indexOf(report.status);
  const { step, total, note } = progressOf(report.status);
  return (
    <div className="z-progressbar">
      <p className="z-journey-now"><b>Step {step} of {total}: {CITIZEN_STATUS[report.status]}.</b> {note}</p>
      <ol className="z-journey" aria-label={`Progress: step ${step} of ${total}, ${CITIZEN_STATUS[report.status]}`}>
        {STATUSES.map((s, i) => {
          // The latest time, because a job that was reopened reaches a stage more than once.
          const at = report.history.filter((h) => h.status === s).pop()?.at;
          return <li key={s} className={i <= reached ? 'done' : ''} aria-current={i === reached ? 'step' : undefined}><i aria-hidden="true" /><b>{CITIZEN_STATUS[s]}</b>{i <= reached && at && <span>{fmtWhen(at)}</span>}</li>;
        })}
      </ol>
    </div>
  );
}

function Receipt({ receipt, onAnother, onMine }) {
  const { complaint: c, reports, score, band, parts } = receipt;
  const dept = DEPARTMENTS[CATEGORIES[c.category].dept];
  const [note, setNote] = useState(null);
  const text = shareText(c, dept.name);
  const file = c.photo ? new File([c.photo], `${c.id}.jpg`, { type: 'image/jpeg' }) : null;
  const canShareFile = !!(file && navigator.canShare?.({ files: [file] }));
  const share = async () => {
    try { await navigator.share({ title: `Complaint ${c.id}`, text, files: [file] }); } catch { /* the person closed the share sheet */ }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setNote('Copied.'); } catch { setNote('Could not copy here.'); }
  };
  const photoUrl = useMemo(() => (c.photo ? URL.createObjectURL(c.photo) : null), [c.photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  return (
    <div className="c-receipt z-receipt">
      <div className="z-tick" aria-hidden="true">✓</div>
      <h2>Report recorded</h2>
      <div className="c-id">{c.id}</div>
      <p>This is a job for <b>{dept.name}</b>.{reports > 1 ? ` ${reports} people have now reported this spot, so it counts as one job.` : ''}</p>
      <Journey report={c} />
      <div className="c-notice">
        <b>One more step: this has not reached the department yet.</b> It is saved on this device{ALERT_ADVICE[c.category] ? ' and shown in Alerts near me here' : ''}. To send it now, use one of these:
      </div>
      <div className="c-actions">
        {canShareFile && <button className="c-send" onClick={share}>Send photo and details</button>}
        <a className="c-btn" href={`tel:${dept.helpline}`}>Call {dept.short} on {dept.helpline}</a>
        <button className="c-btn" onClick={copy}>Copy details</button>
        {photoUrl && <a className="c-btn" href={photoUrl} download={`${c.id}.jpg`}>Save photo</a>}
      </div>
      {note && <p className="c-foot">{note}</p>}
      <details className="z-why">
        <summary>Why this priority? <BandChip band={band} /></summary>
        <ScoreParts parts={parts} score={score} />
      </details>
      <div className="c-actions">
        {onMine && <button className="c-btn" onClick={onMine}>See my reports</button>}
        <button className="c-link" onClick={onAnother}>Send another report</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ a citizen's own reports
function MyReports({ reports, now, onReport, jobs, feedback, userId, onGrade, contractorReports, onReportContractor }) {
  const mine = [...reports].sort((a, b) => b.createdAt - a.createdAt);
  if (!mine.length) return <div className="c-empty"><p>You have not sent any reports yet. When you do, you can follow them here.</p><button className="c-btn" onClick={onReport}>Send a report</button></div>;
  const open = mine.filter((c) => c.status !== 'resolved').length;
  const jobOf = (c) => jobs.find((j) => j.memberIds.includes(c.id));
  const toGrade = mine.filter((c) => c.status === 'resolved' && jobOf(c) && !gradeForJob(feedback, userId, jobOf(c))).length;
  return (
    <div className="h-section z-mine">
      <p className="z-lead"><b>{open} open</b>, {mine.length - open} fixed. Saved on this device.{toGrade > 0 && <> <b>{toGrade} waiting for your grade.</b></>}</p>
      {mine.map((c) => {
        const cat = CATEGORIES[c.category];
        const dept = DEPARTMENTS[cat.dept];
        const near = nearestArea(c.lat, c.lon);
        return (
          <article key={c.id} className="c-job">
            <div className="c-job-head a-head">
              <ReportThumb blob={c.photo} category={c.category} />
              <div className="c-job-main">
                <div className="c-job-top"><b className="c-mine-status">{CITIZEN_STATUS[c.status]}</b><span className="c-status">{timeAgo(c.createdAt, now)}</span></div>
                <div className="c-job-title">{cat.label}</div>
                <div className="c-job-sub">{near ? `Near ${near.name} · ` : ''}{dept.short}</div>
              </div>
            </div>
            <div className="a-body">
              <Journey report={c} />
              <div className="c-actions">
                {c.status !== 'resolved' && <a className="c-btn" href={`tel:${dept.helpline}`}>Call {dept.short}</a>}
                <a className="c-btn" href={mapsUrl(c)} target="_blank" rel="noreferrer">Open map ↗</a>
              </div>
              {c.status === 'resolved' && <JobGrade job={jobOf(c)} feedback={feedback} userId={userId} onGrade={onGrade} invite />}
              {c.status === 'resolved' && <ContractorReportBlock job={jobOf(c)} reports={contractorReports} userId={userId} onSend={onReportContractor} />}
              <p className="c-foot">Reference: {c.id}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ grades and suggestions
const GradeBadge = ({ letter }) => <span className={`g-badge g-${letter}`} title={GRADES[letter].label}>{letter}</span>;

function GradeForm({ existing, onSave, placeholder }) {
  const [grade, setGrade] = useState(existing?.grade || null);
  const [suggestion, setSuggestion] = useState(existing?.suggestion || '');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const id = useId();
  const unchanged = existing && grade === existing.grade && suggestion.trim() === existing.suggestion;
  const submit = async () => {
    setSaving(true); setNote(null);
    try { await onSave(grade, suggestion); setNote('Thanks. Your grade is saved.'); } catch (e) { setNote(e.message || 'Could not save your grade. Please try again.'); }
    setSaving(false);
  };
  return (
    <div className="g-form">
      <div className="c-chips g-chips" role="group" aria-label="Your grade">
        {Object.entries(GRADES).map(([letter, g]) => (
          <button key={letter} className={grade === letter ? 'on' : ''} aria-pressed={grade === letter} onClick={() => { setGrade(letter); setNote(null); }}><b>{letter}</b> {g.label}</button>
        ))}
      </div>
      <label className="c-label" htmlFor={id}>Your suggestion (optional)</label>
      <textarea id={id} className="z-text" rows={2} maxLength={SUGGESTION_MAX} value={suggestion} onChange={(e) => { setSuggestion(e.target.value); setNote(null); }} placeholder={placeholder} />
      <MicButton onText={(text) => { setSuggestion((s) => appendDictated(s, text, SUGGESTION_MAX)); setNote(null); }} />
      <div className="c-actions">
        <button className="c-send" disabled={!grade || saving || unchanged} onClick={submit}>{saving ? 'Saving…' : existing ? 'Update my grade' : 'Save my grade'}</button>
      </div>
      <p className="c-foot" role="status">{note || (grade ? '' : 'Choose a grade to continue.')}</p>
    </div>
  );
}

// Folded away, so a list of fixed work stays short and easy to scan. With `invite`, the person's own
// fixed report opens ready to grade. It stays open after saving, so they see their grade was kept.
function JobGrade({ job, feedback, userId, onGrade, invite = false }) {
  const mine = job ? gradeForJob(feedback, userId, job) : null;
  const [open, setOpen] = useState(invite && !mine);
  if (!job) return null;
  return (
    <details className={`z-why g-job ${invite ? 'g-invite' : ''}`} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{mine ? <>Your grade: <GradeBadge letter={mine.grade} /> Change it</> : invite ? 'It’s fixed. How was the work?' : 'Grade this work'}</summary>
      <GradeForm existing={mine} placeholder="Is it holding up? What could have been done better?"
        onSave={(grade, suggestion) => onGrade({ complaintId: mine?.complaintId || job.id, dept: job.dept, category: job.lead.category, grade, suggestion })} />
    </details>
  );
}

function ReportCardTable({ rows }) {
  return (
    <table className="g-table">
      <thead><tr><th scope="col">Department</th><th scope="col">Grade</th><th scope="col">Average</th><th scope="col">Grades</th><th scope="col">Suggestions</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.dept}>
            <th scope="row">{DEPARTMENTS[r.dept].short}</th>
            <td><GradeBadge letter={r.letter} /></td>
            <td>{r.avg.toFixed(1)} / 5</td>
            <td>{r.count}</td>
            <td>{r.suggestions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A citizen tells the control room about a contractor. Only the control room sees these.
function ContractorReportBlock({ job, reports, userId, onSend }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [photo, setPhoto] = useState(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState(null);
  const id = useId();
  if (!job) return null;
  const sent = reportForJob(reports, userId, job);
  if (sent) {
    return (
      <div className="k-sent" role="status">
        <b>Contractor report: {REPORT_STATUS[sent.status]}</b>
        <span className="c-foot">{REPORT_REASONS[sent.reason]}{sent.details ? `: “${sent.details}”` : ''}</span>
        {sent.reply && <p className="k-reply"><b>Control room:</b> {sent.reply}</p>}
      </div>
    );
  }
  if (!open) return <button className="c-btn k-open" onClick={() => setOpen(true)}>⚠️ Report the contractor to the control room</button>;
  const addPhoto = async (file) => {
    if (!file) return;
    setProblem(null);
    try { setPhoto(await preparePhoto(file)); } catch (e) { setProblem(e.message); }
  };
  const submit = async () => {
    setSending(true); setProblem(null);
    try { await onSend({ job, reason, details, photo }); } catch (e) { setProblem(e.message || 'Could not send your report. Please try again.'); setSending(false); }
  };
  return (
    <section className="k-form" aria-label="Report the contractor">
      <h4>Report the contractor to the control room</h4>
      <p className="c-foot">Contractor: <b>{job.contractor || 'not named by the department yet'}</b>. Only the control room sees this report, without your name. Describe what you saw, as this is checked before anyone acts on it.</p>
      <h5 id={`${id}-why`}>What went wrong?</h5>
      <div className="c-chips" role="group" aria-labelledby={`${id}-why`}>
        {Object.entries(REPORT_REASONS).map(([key, label]) => <button key={key} className={reason === key ? 'on' : ''} aria-pressed={reason === key} onClick={() => setReason(key)}>{label}</button>)}
      </div>
      {reason === 'unsafe' && <p className="c-warn">If someone is in danger, call <a href="tel:112">112</a> first.</p>}
      <label className="c-label" htmlFor={id}>What did you see? (optional)</label>
      <textarea id={id} className="z-text" rows={3} maxLength={REPORT_DETAILS_MAX} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="When was it, and where exactly?" />
      <MicButton onText={(text) => setDetails((d) => appendDictated(d, text, REPORT_DETAILS_MAX))} />
      <label className="c-btn k-photo">{photo ? '✓ Photo added. Change it' : '📷 Add a photo (optional)'}
        <input type="file" accept="image/*" hidden onChange={(e) => { addPhoto(e.target.files[0]); e.target.value = ''; }} />
      </label>
      {problem && <p className="c-error" role="alert">{problem}</p>}
      <div className="c-actions k-actions">
        <button className="c-send" disabled={!reason || sending} onClick={submit}>{sending ? 'Sending…' : 'Send to the control room'}</button>
        <button className="c-link" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {!reason && <p className="c-foot">Choose what went wrong to continue.</p>}
    </section>
  );
}

const WorkPhoto = ({ id }) => <img className="g-photo" src={workPhotoUrl(id)} alt={WORK_PHOTOS[id].alt} loading="lazy" style={WORK_PHOTOS[id].position ? { objectPosition: WORK_PHOTOS[id].position } : undefined} />;

function PhotoCredits() {
  return (
    <details className="z-why g-credits">
      <summary>Photo credits</summary>
      <ul>
        {Object.entries(WORK_PHOTOS).map(([id, p]) => (
          <li key={id}>{CATEGORIES[id].label}: {p.author}, {p.license}, <a href={p.source} target="_blank" rel="noreferrer">Wikimedia Commons ↗</a></li>
        ))}
      </ul>
      <p className="c-foot">Resized for this app.</p>
    </details>
  );
}

function GradeView({ user, feedback, jobs, now, onGrade, onNeedLogin, contractorReports, onReportContractor }) {
  const [dept, setDept] = useState('');
  const guest = user.role === 'guest';
  const rows = reportCard(feedback);
  return (
    <div className="h-section g-view">
      <div>
        <h2>Grade the work you use</h2>
        <p className="z-lead">Say how well a repair or a public service works for you, and what would make it better. Your name is not shown with your grade.</p>
      </div>
      {guest && <div className="c-empty"><p>Log in or sign up to give a grade or a suggestion. You can still see the report card below.</p><button className="c-btn" onClick={onNeedLogin}>Log in or sign up</button></div>}

      {!guest && (
        <section className="c-panel">
          <h3>A service you use</h3>
          <div className="g-services" role="group" aria-label="Choose a service">
            {Object.entries(DEPARTMENTS).map(([id, d]) => {
              const mine = gradeForService(feedback, user.id, id);
              return (
                <button key={id} className={`g-service ${dept === id ? 'on' : ''}`} aria-pressed={dept === id} onClick={() => setDept(dept === id ? '' : id)}>
                  <WorkPhoto id={DEPARTMENT_PHOTO[id]} />
                  {mine && <GradeBadge letter={mine.grade} />}
                  <span>{d.short}</span>
                </button>
              );
            })}
          </div>
          {dept && <p className="g-service-name"><b>{DEPARTMENTS[dept].name}</b></p>}
          {dept && <GradeForm key={dept} existing={gradeForService(feedback, user.id, dept)} placeholder="What works well? What should change?"
            onSave={(grade, suggestion) => onGrade({ dept, grade, suggestion })} />}
        </section>
      )}

      {!guest && (
        <section className="g-fixed">
          <h3>Fixed work</h3>
          {jobs.length === 0 && <p className="c-foot">Nothing has been marked as fixed yet. When a job is finished, you can grade it here.</p>}
          {jobs.map((j) => {
            const near = nearestArea(j.lead.lat, j.lead.lon);
            return (
              <article key={j.id} className="c-job g-work">
                <div className="c-job-head a-head">
                  <div className="g-work-photo">
                    {j.photo ? <Photo blob={j.photo} alt={`Photo sent with this report: ${CATEGORIES[j.lead.category].label}`} className="g-photo" /> : <WorkPhoto id={j.lead.category} />}
                    <span className="g-tag">{j.photo ? 'From the report' : 'Example photo'}</span>
                  </div>
                  <div className="c-job-main">
                    <div className="c-job-top"><b className="c-mine-status">Fixed {timeAgo(j.fixedAt, now)}</b></div>
                    <div className="c-job-title">{CATEGORIES[j.lead.category].label}</div>
                    <div className="c-job-sub">{near ? `Near ${near.name} · ` : ''}{DEPARTMENTS[j.dept].short}{j.lead.sample ? ' · sample' : ''}</div>
                  </div>
                </div>
                <div className="a-body">
                  <JobGrade job={j} feedback={feedback} userId={user.id} onGrade={onGrade} />
                  <ContractorReportBlock job={j} reports={contractorReports} userId={user.id} onSend={onReportContractor} />
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="c-panel">
        <h3>Department report card</h3>
        {rows.length ? <ReportCardTable rows={rows} /> : <p className="c-foot">No grades yet.</p>}
        <p className="c-foot g-note">{feedback.some((f) => f.sample) ? 'Includes sample grades, so these numbers are for demonstration. ' : ''}Lowest grade first. Grades are people’s opinions, not an official rating. For now they stay on this device, so they do not reach the department yet.</p>
      </section>
      <PhotoCredits />
    </div>
  );
}

// What officers and the control room see. Officers see only their own departments.
function GradesPanel({ feedback, departments }) {
  const rows = reportCard(feedback, departments);
  const ideas = suggestionsFor(feedback, departments);
  return (
    <div className="c-analysis g-panel">
      <section className="c-panel">
        <h3>What citizens say</h3>
        {rows.length ? <ReportCardTable rows={rows} /> : <p className="c-foot">No grades yet.</p>}
        {ideas.length > 0 && <h3 className="g-ideas-title">Suggestions, newest first</h3>}
        {ideas.length > 0 && (
          <ul className="g-ideas">
            {ideas.map((f) => (
              <li key={f.id}>
                <GradeBadge letter={f.grade} />
                <div>
                  <p>{f.suggestion}</p>
                  <span className="c-foot">{DEPARTMENTS[f.dept].short} · {f.category ? CATEGORIES[f.category].label : 'The service overall'} · {fmtWhen(f.createdAt)}{f.sample ? ' · sample' : ''}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ contractor reports, for the control room
function ContractorReportCard({ report, name, now, onUpdate }) {
  const [reply, setReply] = useState(report.reply);
  const [note, setNote] = useState(null);
  const near = nearestArea(report.lat, report.lon);
  const update = async (patch, message) => {
    setNote(null);
    try { await onUpdate(reviewReport(report, { reply, ...patch })); setNote(message); } catch { setNote('Could not save. Please try again.'); }
  };
  return (
    <article className="c-job k-card">
      <div className="c-job-top">
        <span className="c-status"><b>{REPORT_STATUS[report.status]}</b></span>
        <span className="c-status">{timeAgo(report.createdAt, now)}{report.sample ? ' · sample' : ''}</span>
      </div>
      <div className="c-job-title">{REPORT_REASONS[report.reason]}</div>
      <div className="c-job-sub">{name || NOT_NAMED} · {CATEGORIES[report.category].label}{near ? ` · near ${near.name}` : ''} · {DEPARTMENTS[report.dept].short}</div>
      {report.details && <p className="c-quote">“{report.details}”</p>}
      {report.photo && <Photo blob={report.photo} alt="Photo sent with this contractor report" className="k-photo-full" />}
      <label className="c-label" htmlFor={`k-${report.id}`}>Reply to the citizen (optional)</label>
      <textarea id={`k-${report.id}`} className="z-text" rows={2} maxLength={REPORT_DETAILS_MAX} value={reply} onChange={(e) => { setReply(e.target.value); setNote(null); }} placeholder="What did you find? What happens next?" />
      <div className="c-actions k-actions">
        <div className="c-chips" role="group" aria-label="Set status">
          {[['reviewing', 'Under review'], ['closed', 'Closed']].map(([id, label]) => <button key={id} className={report.status === id ? 'on' : ''} aria-pressed={report.status === id} onClick={() => update({ status: id }, `Marked as ${label.toLowerCase()}.`)}>{label}</button>)}
        </div>
        <button className="c-btn" disabled={reply.trim() === report.reply} onClick={() => update({}, 'Reply saved.')}>Save reply</button>
        <a className="c-btn" href={mapsUrl(report)} target="_blank" rel="noreferrer">Open map ↗</a>
      </div>
      {note && <p className="c-foot" role="status">{note}</p>}
    </article>
  );
}

function ContractorReportsView({ reports, feedback, list, now, onUpdate, onLoadExamples, onRemoveExamples }) {
  const [filter, setFilter] = useState('all');
  const summary = useMemo(() => contractorSummary(reports, feedback, list), [reports, feedback, list]);
  const nameOf = (r) => contractorOf(r, list);
  const shown = sortReports(reports).filter((r) => filter === 'all' || (cleanContractorName(nameOf(r)).toLowerCase() || NOT_NAMED) === filter);
  const hasExamples = reports.some((r) => r.sample);
  return (
    <div className="c-analysis k-view">
      <p className="c-notice">These are citizens’ reports, not findings. Check the work on site and hear from the contractor before acting. Departments and other citizens cannot see this page.</p>
      {hasExamples && <p className="c-notice">Includes example reports with invented contractor names, for demonstration. <button className="c-link" onClick={() => { setFilter('all'); onRemoveExamples(); }}>Remove all sample data</button></p>}
      {reports.length === 0 && <div className="c-empty"><p>No contractor reports yet. Citizens can send one from any fixed job.</p></div>}
      {!hasExamples && <div className="k-examples"><button className="c-btn" onClick={onLoadExamples}>Load examples</button><span className="c-foot">Adds invented reports and sample jobs, so you can see how this page works.</span></div>}
      {summary.length > 0 && (
        <section className="c-panel">
          <h3>By contractor</h3>
          <div className="k-scroll">
            <table className="g-table">
              <thead><tr><th scope="col">Contractor</th><th scope="col">Open</th><th scope="col">All reports</th><th scope="col">Jobs reported</th><th scope="col">Most reported</th><th scope="col">Citizen grade</th></tr></thead>
              <tbody>
                {summary.map((c) => (
                  <tr key={c.key}>
                    <th scope="row">{c.name}</th>
                    <td>{c.open}</td>
                    <td>{c.reports}</td>
                    <td>{c.jobs}</td>
                    <td>{c.topReason ? REPORT_REASONS[c.topReason] : '–'}</td>
                    <td>{c.letter ? <><GradeBadge letter={c.letter} /> <span className="c-foot">from {c.grades}</span></> : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {reports.length > 0 && (
        <div className="c-filters">
          <select aria-label="Contractor" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All contractors</option>
            {summary.filter((c) => c.reports).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
        </div>
      )}
      {shown.map((r) => <ContractorReportCard key={r.id} report={r} name={nameOf(r)} now={now} onUpdate={onUpdate} />)}
    </div>
  );
}

// The department records who is doing the work.
function ContractorField({ value, known, onSave }) {
  const [name, setName] = useState(value || '');
  const [note, setNote] = useState(null);
  const id = useId();
  const clean = cleanContractorName(name);
  const save = async () => {
    setNote(null);
    try { await onSave(clean); setNote(clean ? 'Contractor saved.' : 'Contractor removed.'); } catch { setNote('Could not save. Please try again.'); }
  };
  return (
    <div className="k-field">
      <label className="c-label" htmlFor={id}>Contractor doing this work</label>
      <div className="k-field-row">
        <input id={id} list={`${id}-known`} maxLength={CONTRACTOR_NAME_MAX} value={name} placeholder="Company or person" onChange={(e) => { setName(e.target.value); setNote(null); }} />
        <datalist id={`${id}-known`}>{known.map((k) => <option key={k} value={k} />)}</datalist>
        <button className="c-btn" disabled={clean === (value || '')} onClick={save}>Save</button>
      </div>
      {note && <p className="c-foot" role="status">{note}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ department desk
function JobCard({ job, open, onToggle, onStatus, onCascade, onRemove, onContractor, knownContractors }) {
  const c = job.lead;
  const cat = CATEGORIES[c.category];
  const dept = DEPARTMENTS[cat.dept];
  const resolved = c.status === 'resolved';
  return (
    <article className={`c-job ${open ? 'open' : ''}`}>
      <button className="c-job-head" onClick={onToggle} aria-expanded={open}>
        <Photo blob={c.photo} alt={cat.label} className="c-thumb" />
        <span className="c-job-main">
          <span className="c-job-top"><BandChip band={job.band} score={job.score} /><span className="c-status">{STATUS_LABEL[c.status]}</span></span>
          <span className="c-job-title">{cat.label}</span>
          <span className="c-job-sub">{dept.short}{job.members.length > 1 ? ` · ${job.members.length} reports` : ''}{c.sample ? ' · sample' : ''}</span>
          <span className={`c-sla ${job.sla.overdue ? 'late' : ''}`}>{resolved ? 'Closed' : job.sla.overdue ? `Overdue by ${fmtHours(job.sla.hoursLeft)}` : `Target: ${fmtHours(job.sla.hoursLeft)} left`}</span>
        </span>
      </button>
      {open && (
        <div className="c-job-body">
          {c.photo && <Photo blob={c.photo} alt={cat.label} className="c-full" />}
          {job.members.map((m) => m.description && <p key={m.id} className="c-quote">“{m.description}”</p>)}
          <h3>Why this priority</h3>
          <ScoreParts parts={job.parts} score={job.score} />
          <h3>Status</h3>
          <div className="c-chips" role="group" aria-label="Set status">
            {STATUSES.map((s) => <button key={s} className={c.status === s ? 'on' : ''} aria-pressed={c.status === s} onClick={() => onStatus(job, s)}>{STATUS_LABEL[s]}</button>)}
          </div>
          <ol className="c-history">{c.history.map((h) => <li key={h.status + h.at}>{STATUS_LABEL[h.status]}: {fmtWhen(h.at)}</li>)}</ol>
          <ContractorField value={job.members.find((m) => m.contractor)?.contractor} known={knownContractors} onSave={(name) => onContractor(job, name)} />
          <div className="c-actions">
            <a className="c-btn" href={mapsUrl(c)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
            {onCascade && CASCADE_KIND[c.category] && !resolved && <button className="c-btn" onClick={() => onCascade(c)}>What could fail next? ↗</button>}
            {onRemove && <button className="c-btn" onClick={() => onRemove(job)}>Remove report</button>}
          </div>
          <p className="c-foot">{c.id}</p>
        </div>
      )}
    </article>
  );
}

function DeskView({ groups, center, onStatus, onCascade, onRemove, onLoadSamples, onClearSamples, hasSamples, departments, onContractor, knownContractors }) {
  const [dept, setDept] = useState('all');
  const [view, setView] = useState('open');
  const [openId, setOpenId] = useState(null);
  const shown = groups.filter((g) => (dept === 'all' || CATEGORIES[g.lead.category].dept === dept)
    && (view === 'open' ? g.lead.status !== 'resolved' : view === 'overdue' ? g.sla.overdue : g.lead.status === 'resolved'));
  return (
    <div className="c-desk">
      <div className="c-queue">
        <div className="c-filters">
          <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">{departments ? 'My department' : 'All departments'}</option>
            {Object.entries(DEPARTMENTS).filter(([id]) => !departments || departments.includes(id)).map(([id, d]) => <option key={id} value={id}>{d.short}</option>)}
          </select>
          <div className="c-seg" role="group" aria-label="Show">
            {[['open', 'Open'], ['overdue', 'Overdue'], ['resolved', 'Resolved']].map(([id, label]) => (
              <button key={id} className={view === id ? 'on' : ''} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>
            ))}
          </div>
        </div>
        {shown.length === 0 && (
          <div className="c-empty">
            <p>{groups.length ? 'Nothing matches these filters.' : 'No complaints yet.'}</p>
            {!groups.length && <button className="c-btn" onClick={onLoadSamples}>Load sample complaints</button>}
          </div>
        )}
        {shown.map((g) => <JobCard key={g.id} job={g} open={openId === g.id} onToggle={() => setOpenId(openId === g.id ? null : g.id)} onStatus={onStatus} onCascade={onCascade} onRemove={onRemove} onContractor={onContractor} knownContractors={knownContractors} />)}
        {hasSamples && <button className="c-link" onClick={onClearSamples}>Remove sample complaints</button>}
      </div>
      <div className="c-desk-map">
        <MiniMap center={center} points={shown} selectedId={openId} onSelect={setOpenId} />
        <div className="c-key">{BANDS.map((b) => <span key={b.id}><i style={{ background: `rgb(${BAND_COLOR[b.id].join(',')})` }} />{b.label}</span>)}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ analysis
function Bars({ title, rows, labelOf }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="c-panel">
      <h3>{title}</h3>
      {rows.length === 0 && <p className="c-foot">Nothing open.</p>}
      <table className="c-bars">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} title={`${labelOf(r)}: ${r.count}`}>
              <th scope="row">{labelOf(r)}</th>
              <td><span className="c-bar" style={{ width: `${(100 * r.count) / max}%` }} /></td>
              <td className="c-val">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function AnalysisView({ stats, hasSamples, onLoadSamples }) {
  if (!stats.reports) {
    return <div className="c-empty"><p>No complaints to analyse yet.</p><button className="c-btn" onClick={onLoadSamples}>Load sample complaints</button></div>;
  }
  const tiles = [
    ['Open jobs', stats.open, `${stats.reports} reports in total`],
    ['Overdue', stats.overdue, 'past their target time'],
    ['Resolved', stats.resolved, 'reports closed'],
    ['Typical fix time', stats.medianResolveH == null ? '–' : fmtHours(stats.medianResolveH), 'median, once closed'],
  ];
  return (
    <div className="c-analysis">
      {hasSamples && <p className="c-notice">Includes sample complaints, so these numbers are for demonstration.</p>}
      <div className="c-tiles">{tiles.map(([label, value, sub]) => <div key={label} className="c-tile"><div className="c-tile-num">{value}</div><div className="c-tile-label">{label}</div><div className="c-foot">{sub}</div></div>)}</div>
      <div className="c-grid">
        <Bars title="Open jobs by priority" rows={stats.byBand} labelOf={(r) => r.label} />
        <Bars title="Open jobs by department" rows={stats.byDept} labelOf={(r) => DEPARTMENTS[r.id].short} />
        <Bars title="Open jobs by problem" rows={stats.byCategory} labelOf={(r) => CATEGORIES[r.id].label} />
        <section className="c-panel">
          <h3>Hotspots</h3>
          <p className="c-foot">Areas about 500 m across with the most open reports.</p>
          <ol className="c-hot">
            {stats.hotspots.map((h) => (
              <li key={h.key}>
                <a href={mapsUrl(h)} target="_blank" rel="noreferrer">{h.near ? `Near ${h.near}` : `${h.lat.toFixed(3)}, ${h.lon.toFixed(3)}`}</a>
                <span>{h.reports} report{h.reports === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="c-foot">Priority weights and target times are working assumptions, not official service levels. Set them with each department before real use.</p>
    </div>
  );
}

// ------------------------------------------------------------------ page
const TAB_ICON = { alerts: '🔔', report: '📷', mine: '📋', grade: '⭐', desk: '🗂️', analysis: '📊', contractors: '⚠️' };

export default function ComplaintsPage({ user, onNeedLogin }) {
  const [nodes, setNodes] = useState(null);
  const [isSampleMap, setIsSampleMap] = useState(false);
  const [list, setList] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [contractorReports, setContractorReports] = useState([]);
  const [tab, setTab] = useState(user.role === 'officer' ? 'desk' : 'alerts');
  const isAdmin = user.role === 'admin';
  // Example data is for demonstrations: real sign-ups never see the option on the alerts page.
  const canDemo = isAdmin || DEMO_ACCOUNTS.some((d) => d.email === user.email);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    document.title = 'DOMINO - Citizen alerts';
    return () => { document.title = 'DOMINO'; };
  }, []);
  useEffect(() => {
    (async () => {
      const r = await fetch('data/domino.json');
      if (!r.ok) throw new Error('Could not load the city data.');
      const d = await r.json();
      setNodes(d.graph.nodes.filter((n) => n.on_map !== false));
      setIsSampleMap(!!d.meta.info.is_sample);
      setList(await allComplaints());
      setFeedback(await allFeedback());
      setContractorReports(await allContractorReports());
    })().catch((e) => setError(e.message));
  }, []);

  const save = useCallback(async (items) => {
    await saveComplaints(items);
    setList(await allComplaints());
    setNow(Date.now());
  }, []);

  const center = useMemo(() => {
    if (!nodes?.length) return { lat: 12.97, lon: 77.59 };
    return { lat: nodes.reduce((s, n) => s + n.lat, 0) / nodes.length, lon: nodes.reduce((s, n) => s + n.lon, 0) / nodes.length };
  }, [nodes]);
  const inside = useCallback((p) => Math.abs(p.lat - center.lat) < 0.5 && Math.abs(p.lon - center.lon) < 0.5, [center]);
  // An officer's desk and analysis cover only their own department.
  const departments = useMemo(() => departmentsFor(user), [user]);
  const scoped = useMemo(() => (departments ? list.filter((c) => departments.includes(CATEGORIES[c.category].dept)) : list), [list, departments]);
  const groups = useMemo(() => groupComplaints(scoped, nodes || [], now), [scoped, nodes, now]);
  const stats = useMemo(() => analyse(scoped, nodes || [], now), [scoped, nodes, now]);
  const jobs = useMemo(() => fixedWork(list), [list]);
  const knownContractors = useMemo(() => [...new Set(list.map((c) => c.contractor).filter(Boolean))].sort(), [list]);
  const hasSamples = list.some((c) => c.sample);
  const openCount = groups.filter((g) => g.lead.status !== 'resolved').length;

  // Another person confirming an alert counts as one more report at the same spot.
  const confirmAlert = (a) => save([makeComplaint({ category: a.lead.category, hazard: a.lead.hazard, lat: a.lead.lat, lon: a.lead.lon, sample: a.lead.sample })]);

  // New alert in my saved area: tell me, if I asked for notifications.
  const seenAlerts = useRef(null);
  useEffect(() => {
    if (!nodes) return;
    const { area, radiusKm, notify } = loadSettings();
    const current = area ? activeAlerts(list, nodes, Date.now(), area, radiusKm) : [];
    const fresh = seenAlerts.current ? current.filter((x) => !seenAlerts.current.has(x.id)) : [];
    seenAlerts.current = new Set(current.map((x) => x.id));
    if (!notify || !fresh.length || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const title = `Alert near you: ${CATEGORIES[fresh[0].lead.category].label}`;
    const body = fresh[0].advice;
    navigator.serviceWorker?.getRegistration().then((reg) => (reg ? reg.showNotification(title, { body }) : new Notification(title, { body }))).catch(() => {});
  }, [list, nodes]);

  const setStatus = (job, status) => save(job.members.map((m) => withStatus(m, status)));
  const loadSamples = async () => {
    const samples = sampleComplaints(nodes, Date.now());
    await saveFeedback(sampleFeedback(samples));
    setFeedback(await allFeedback());
    await saveContractorReports(sampleContractorReports(fixedWork(samples)));
    setContractorReports(await allContractorReports());
    await save(samples);
  };
  const clearSamples = async () => {
    await deleteComplaints(list.filter((c) => c.sample).map((c) => c.id));
    await deleteFeedback(feedback.filter((f) => f.sample).map((f) => f.id));
    await deleteContractorReports(contractorReports.filter((r) => r.sample).map((r) => r.id));
    setList(await allComplaints());
    setFeedback(await allFeedback());
    setContractorReports(await allContractorReports());
  };
  // Starting clean means sample jobs from an earlier day, or from before contractors existed, are not left behind.
  const loadExamples = async () => { await clearSamples(); await loadSamples(); };
  const saveContractorReport = async (report) => {
    await saveContractorReports([report]);
    setContractorReports(await allContractorReports());
  };
  const reportContractor = (details) => saveContractorReport(makeContractorReport({ ...details, userId: user.id }));
  const setContractor = (job, name) => save(job.members.map((m) => ({ ...m, contractor: name })));
  const saveGrade = async (details) => {
    await saveFeedback([makeFeedback({ ...details, userId: user.id })]);
    setFeedback(await allFeedback());
  };
  const removeJob = async (job) => { await deleteComplaints(job.members.map((m) => m.id)); setList(await allComplaints()); };
  const toCascade = (c) => {
    window.location.hash = `#/cascade?report=${CASCADE_KIND[c.category]}&lon=${c.lon}&lat=${c.lat}`;
  };

  if (error) return <div className="splash"><h1>DOMINO</h1><p className="err">{error}</p></div>;
  if (!nodes) return <div className="splash"><h1>DOMINO</h1><p>Loading…</p></div>;

  const desk = ['desk', `Department desk${openCount ? ` (${openCount})` : ''}`];
  const analysis = ['analysis', 'Infrastructure analysis'];
  const openContractorReports = contractorReports.filter((r) => r.status !== 'closed').length;
  const contractorsTab = ['contractors', `Contractor reports${openContractorReports ? ` (${openContractorReports})` : ''}`];
  const alertsTab = ['alerts', 'Alerts near me'], reportTab = ['report', 'Send a report'], gradeTab = ['grade', 'Grade & suggest'];
  const TABS = {
    guest: [alertsTab, reportTab, gradeTab],
    citizen: [alertsTab, reportTab, ['mine', 'My reports'], gradeTab],
    officer: [desk, analysis, alertsTab],
    admin: [alertsTab, reportTab, desk, analysis, contractorsTab],
  }[user.role];
  return (
    <div className="c-page">
      <div className="c-header">
        <nav className="c-tabs" aria-label="Citizen sections">
          {TABS.map(([id, label]) => <button key={id} data-ico={TAB_ICON[id]} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}
        </nav>
      </div>
      {isSampleMap && <div className="c-sample-bar">The facility data is still a sample, so “near a hospital” points are for demonstration only.</div>}
      <main className="c-main">
        {tab === 'alerts' && <AlertsView list={list} nodes={nodes} center={center} now={now} onConfirm={confirmAlert} onReport={user.role === 'officer' ? null : () => setTab('report')} onLoadSamples={loadSamples} onClearSamples={clearSamples} hasSamples={hasSamples} canDemo={canDemo} showWelcome={user.role === 'citizen' || user.role === 'guest'} />}
        {tab === 'report' && (user.role === 'guest'
          ? <div className="c-empty"><p>Log in or sign up to send a report, so you can follow it afterwards. You can still see alerts and phone numbers without an account.</p><button className="c-btn" onClick={onNeedLogin}>Log in or sign up</button></div>
          : <ReportView nodes={nodes} center={center} inside={inside} list={list} user={user} draft={draft} setDraft={setDraft} onSubmit={(c) => save([c])} onMine={user.role === 'citizen' ? () => setTab('mine') : null} />)}
        {tab === 'mine' && <MyReports reports={list.filter((c) => c.ownerId === user.id)} now={now} onReport={() => setTab('report')} jobs={jobs} feedback={feedback} userId={user.id} onGrade={saveGrade} contractorReports={contractorReports} onReportContractor={reportContractor} />}
        {tab === 'grade' && <GradeView user={user} feedback={feedback} jobs={jobs} now={now} onGrade={saveGrade} onNeedLogin={onNeedLogin} contractorReports={contractorReports} onReportContractor={reportContractor} />}
        {tab === 'contractors' && isAdmin && <ContractorReportsView reports={contractorReports} feedback={feedback} list={list} now={now} onUpdate={saveContractorReport} onLoadExamples={loadExamples} onRemoveExamples={clearSamples} />}
        {tab === 'desk' && <DeskView groups={groups} center={center} onStatus={setStatus} onCascade={isAdmin ? toCascade : null} onRemove={isAdmin ? removeJob : null} onLoadSamples={loadSamples} onClearSamples={clearSamples} hasSamples={hasSamples && isAdmin} departments={departments} onContractor={setContractor} knownContractors={knownContractors} />}
        {tab === 'analysis' && <AnalysisView stats={stats} hasSamples={scoped.some((c) => c.sample)} onLoadSamples={loadSamples} />}
        {tab === 'analysis' && <GradesPanel feedback={feedback} departments={departments} />}
      </main>
    </div>
  );
}
