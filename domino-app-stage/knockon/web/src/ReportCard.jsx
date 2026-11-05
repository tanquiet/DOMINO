// "Report an incident": what happened, where, for how long, who is reporting.
import React from 'react';
import { FLOOD_WIDTHS_M, REPORTERS, REPORT_HOURS, REPORT_KINDS, reportMissing } from './mapkit.js';

function Choice({ value, current, onPick, children }) {
  const on = current === value;
  return <button type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => onPick(value)}>{children}</button>;
}

export default function ReportCard({ report, target, assumedHours, onChange, onSend, onCancel, busy }) {
  const kind = REPORT_KINDS[report.kind];
  const missing = reportMissing(report, target);
  const set = (key) => (value) => onChange({ [key]: value });

  let where = 'Tap the map.';
  if (report.where && kind?.snap) where = target.node ? `Nearest ${kind.noun}: ${target.node.name}` : `No ${kind.noun} found.`;
  else if (report.where && kind) {
    const n = target.inside.length;
    where = n ? `${n} ${n === 1 ? 'facility' : 'facilities'} inside this area.` : 'No facility inside this area. Tap elsewhere or make it wider.';
  } else if (report.where) where = 'Spot marked. Now choose what happened.';

  return (
    <div className="place report" role="dialog" aria-label="Report an incident">
      <button className="place-x" onClick={onCancel} aria-label="Cancel report">×</button>
      <div className="place-name">Report an incident</div>

      <div className="rep-step">
        <div className="sec-h">1. What happened?</div>
        <div className="rep-choices">
          {Object.entries(REPORT_KINDS).map(([k, v]) => <Choice key={k} value={k} current={report.kind} onPick={set('kind')}>{v.label}</Choice>)}
        </div>
      </div>

      <div className="rep-step">
        <div className="sec-h">2. Where?</div>
        <div className={`rep-where ${report.where ? '' : 'wait'}`}>{where}</div>
        {report.kind === 'flood' && (
          <div className="rep-choices">
            {FLOOD_WIDTHS_M.map((m) => <Choice key={m} value={m} current={report.widthM} onPick={set('widthM')}>{m >= 1000 ? `${m / 1000} km` : `${m} m`}</Choice>)}
          </div>
        )}
      </div>

      <div className="rep-step">
        <div className="sec-h">3. For how long?</div>
        <div className="rep-choices">
          {REPORT_HOURS.map((h) => <Choice key={h} value={h} current={report.hours} onPick={set('hours')}>{h} h</Choice>)}
          <Choice value={null} current={report.hours} onPick={set('hours')}>Not sure</Choice>
        </div>
        {report.hours === null && <div className="rep-note">{assumedHours} h is assumed.</div>}
      </div>

      <div className="rep-step">
        <div className="sec-h">4. Who is reporting?</div>
        <div className="rep-choices">
          {Object.entries(REPORTERS).map(([k, v]) => <Choice key={k} value={k} current={report.reporter} onPick={set('reporter')}>{v.label}</Choice>)}
        </div>
        {report.reporter && !REPORTERS[report.reporter].verified && <div className="rep-note">Marked unverified until BESCOM or BWSSB confirms.</div>}
      </div>

      <button className="rep-send" disabled={!!missing || busy} onClick={onSend}>Send report</button>
      <div className="place-foot">{missing ? `Still needed: ${missing}.` : 'The cascade runs at once. Nothing is sent to anyone yet.'}</div>
    </div>
  );
}
