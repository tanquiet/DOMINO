// Voice controls. Where a browser has no speech support they do not appear, and typing and reading still work.
import React, { useEffect, useRef, useState } from 'react';
import { loadSettings, saveSettings } from './settings.js';
import { VOICE_LANGS, alertSpeech, canListen, canSpeak, listen, loadVoices, speak, stopSpeaking } from './voice.js';

export function VoiceLangPicker({ value, onChange }) {
  return (
    <select className="z-select v-lang" aria-label="Voice language" value={value} onChange={(e) => { saveSettings({ voiceLang: e.target.value }); onChange(e.target.value); }}>
      {Object.entries(VOICE_LANGS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
  );
}

export function MicButton({ onText, label = 'Speak' }) {
  const [lang, setLang] = useState(() => loadSettings().voiceLang);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [problem, setProblem] = useState(null);
  const stop = useRef(null);
  useEffect(() => () => stop.current?.(), []);
  if (!canListen()) return null;
  const toggle = () => {
    if (listening) { stop.current?.(); return; }
    setProblem(null); setInterim(''); setListening(true);
    stop.current = listen({
      lang,
      onInterim: setInterim,
      onFinal: (text) => { setInterim(''); onText(text); },
      onProblem: setProblem,
      onEnd: () => { setListening(false); setInterim(''); stop.current = null; },
    });
  };
  return (
    <div className="v-mic">
      <div className="v-mic-row">
        <button type="button" className={`c-btn ${listening ? 'v-on' : ''}`} aria-pressed={listening} onClick={toggle}>{listening ? '⏹ Stop' : `🎤 ${label}`}</button>
        <VoiceLangPicker value={lang} onChange={setLang} />
      </div>
      <p className="c-foot v-status" role="status">{listening ? (interim || 'Listening… speak now.') : ''}</p>
      {problem && <p className="c-error" role="alert">{problem}</p>}
      <p className="c-foot">Your browser’s speech service turns your voice into text and may send it over the internet. Check the words before you send.</p>
    </div>
  );
}

export function SpeakAlert({ alert }) {
  const [on, setOn] = useState(false);
  const [note, setNote] = useState(null);
  useEffect(() => () => { if (on) stopSpeaking(); }, [on]);
  if (!canSpeak()) return null;
  const toggle = async () => {
    if (on) { stopSpeaking(); setOn(false); return; }
    setNote(null);
    const plan = alertSpeech(alert, loadSettings().voiceLang, await loadVoices());
    if (plan.fellBackFrom) setNote(`This device has no ${plan.fellBackFrom} voice, so this is read in English.`);
    setOn(true);
    speak(plan, () => setOn(false));
  };
  return (
    <>
      <button className="c-btn" aria-pressed={on} onClick={toggle}>{on ? '⏹ Stop' : '🔊 Read aloud'}</button>
      {note && <span className="c-foot v-note" role="status">{note}</span>}
    </>
  );
}
