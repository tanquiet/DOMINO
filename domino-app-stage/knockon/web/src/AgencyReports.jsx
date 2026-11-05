// Cascade page: a ready-to-send situation report for BWSSB or KPTCL. Nothing leaves without the person pressing send.
import React, { useMemo, useState } from 'react';
import { REPORT_AGENCIES, agencyReport } from './alerts.js';
import { telHref, whatsappHref } from './contacts.js';

export default function AgencyReports({ scenario, result, alerts, nodesById, dependentsOf, respResult }) {
  const [agency, setAgency] = useState('BWSSB');
  const [note, setNote] = useState(null);
  const report = useMemo(() => agencyReport(agency, { scenario, result, alerts, nodesById, dependentsOf, respResult }),
    [agency, scenario, result, alerts, nodesById, dependentsOf, respResult]);
  const to = REPORT_AGENCIES[agency];
  const subject = `DOMINO cascade report: ${scenario.label}`;
  const choose = (a) => { setAgency(a); setNote(null); };

  const copy = async () => {
    try { await navigator.clipboard.writeText(report.text); setNote('Report copied.'); } catch { setNote('Could not copy here. Select the text below instead.'); }
  };
  const share = async () => {
    try { await navigator.share({ title: subject, text: report.text }); } catch { /* the person closed the share sheet */ }
  };

  return (
    <section className="agency-reports" aria-label="Reports for authorities">
      <div className="h">Report to authorities</div>
      <div className="roles" role="group" aria-label="Report for">
        {Object.keys(REPORT_AGENCIES).map((a) => (
          <button key={a} className={agency === a ? 'on' : ''} aria-pressed={agency === a} onClick={() => choose(a)}>{a}</button>
        ))}
      </div>
      <div className="sub">{to.name}: {to.covers}</div>

      {report.count === 0 ? (
        <div className="sub ar-none">Nothing for {agency} in this scenario. None of its facilities are affected.</div>
      ) : (
        <>
          <div className="ar-counts">
            <div><div className="num">{report.count}</div><div className="lbl">facilities affected</div></div>
            <div><div className="num down">{report.failing}</div><div className="lbl">fail</div></div>
            <div><div className="num backup">{report.hospitals}</div><div className="lbl">hospitals lose service downstream</div></div>
          </div>
          <details className="ar-preview">
            <summary>Read the report</summary>
            <pre tabIndex={0}>{report.text}</pre>
          </details>
          <div className="ar-actions">
            <a href={`mailto:${to.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(report.text)}`}>Email draft</a>
            {to.whatsapp && <a href={`${whatsappHref(to.whatsapp)}?text=${encodeURIComponent(report.text)}`} target="_blank" rel="noreferrer">WhatsApp draft</a>}
            <a href={telHref(to.phone)}>Call {to.phone}</a>
            <button onClick={copy}>Copy</button>
            {typeof navigator.share === 'function' && <button onClick={share}>Share</button>}
          </div>
          {note && <div className="sub" role="status">{note}</div>}
          <div className="ar-warn">These drafts go to real offices. This is a simulation: send one only for a real situation, never during a demo.</div>
        </>
      )}
    </section>
  );
}
