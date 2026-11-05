// Speaking to the app and hearing alerts, using speech features built into the browser.
// The words and rules here are plain logic, tested by tools/test_voice.mjs. Browser calls are at the bottom.
import { ALERT_ADVICE, CATEGORIES } from './complaints.js';

export const VOICE_LANGS = { 'en-IN': 'English', 'kn-IN': 'ಕನ್ನಡ', 'hi-IN': 'हिन्दी' };
const ENGLISH_NAME = { 'kn-IN': 'Kannada', 'hi-IN': 'Hindi' };

// Alerts read aloud. Translations should be checked by fluent speakers before real use.
const SPOKEN = {
  'kn-IN': {
    away: (n, unit) => `${n} ${unit === 'm' ? 'ಮೀಟರ್' : 'ಕಿಲೋಮೀಟರ್'} ದೂರ.`,
    note: 'ಇದು ನಾಗರಿಕರ ವರದಿ, ಅಧಿಕೃತ ಎಚ್ಚರಿಕೆ ಅಲ್ಲ.',
    pothole: ['ರಸ್ತೆ ಗುಂಡಿ', 'ಇಲ್ಲಿ ನಿಧಾನವಾಗಿ ಚಲಿಸಿ, ವಿಶೇಷವಾಗಿ ದ್ವಿಚಕ್ರ ವಾಹನದಲ್ಲಿ ಅಥವಾ ರಾತ್ರಿ ಹೊತ್ತು.'],
    flood: ['ರಸ್ತೆಯಲ್ಲಿ ಪ್ರವಾಹ', 'ಸಾಧ್ಯವಾದರೆ ಈ ರಸ್ತೆ ಬಳಸಬೇಡಿ. ನಿಂತ ನೀರಿನಲ್ಲಿ ನಡೆಯಬೇಡಿ ಅಥವಾ ವಾಹನ ಚಲಾಯಿಸಬೇಡಿ. ಸುತ್ತಮುತ್ತ ಸಂಚಾರ ನಿಧಾನವಾಗಬಹುದು.'],
    heavy_rain: ['ಭಾರಿ ಮಳೆ', 'ತಗ್ಗು ರಸ್ತೆಗಳು ಮತ್ತು ಅಂಡರ್‌ಪಾಸ್‌ಗಳಲ್ಲಿ ಶೀಘ್ರದಲ್ಲೇ ನೀರು ತುಂಬಬಹುದು. ಹೆಚ್ಚು ಸಮಯ ಇಟ್ಟುಕೊಳ್ಳಿ ಅಥವಾ ಪ್ರಯಾಣ ಮುಂದೂಡಿ.'],
    traffic: ['ಭಾರಿ ಟ್ರಾಫಿಕ್', 'ವಿಳಂಬ ನಿರೀಕ್ಷಿಸಿ. ಸಾಧ್ಯವಾದರೆ ಬೇರೆ ಮಾರ್ಗ ಆರಿಸಿ.'],
    power_line: ['ವಿದ್ಯುತ್ ತಂತಿ ಸಮಸ್ಯೆ', 'ದೂರ ಇರಿ ಮತ್ತು ತಂತಿಯ ಹತ್ತಿರ ಯಾವುದನ್ನೂ ಮುಟ್ಟಬೇಡಿ.'],
    transmission: ['ಹೈ ವೋಲ್ಟೇಜ್ ಟವರ್ ಸಮಸ್ಯೆ', 'ಟವರ್ ಮತ್ತು ಬಿದ್ದ ತಂತಿಯಿಂದ ದೂರ ಇರಿ.'],
    sewage: ['ಒಳಚರಂಡಿ ಉಕ್ಕಿ ಹರಿಯುತ್ತಿದೆ', 'ನಡೆಯುವಾಗ ಎಚ್ಚರವಹಿಸಿ, ಮ್ಯಾನ್‌ಹೋಲ್ ತೆರೆದಿರಬಹುದು.'],
    fallen_tree: ['ಮರ ಬಿದ್ದಿದೆ', 'ರಸ್ತೆ ಭಾಗಶಃ ಮುಚ್ಚಿರಬಹುದು. ಸಾಧ್ಯವಾದರೆ ಬೇರೆ ಮಾರ್ಗ ಆರಿಸಿ.'],
    signal: ['ಟ್ರಾಫಿಕ್ ಸಿಗ್ನಲ್ ದೋಷ', 'ಸಿಗ್ನಲ್ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ. ಜಂಕ್ಷನ್‌ನಲ್ಲಿ ಎಚ್ಚರವಹಿಸಿ.'],
  },
  'hi-IN': {
    away: (n, unit) => `${n} ${unit === 'm' ? 'मीटर' : 'किलोमीटर'} दूर।`,
    note: 'यह नागरिकों की रिपोर्ट है, आधिकारिक चेतावनी नहीं।',
    pothole: ['सड़क पर गड्ढा', 'यहाँ धीरे चलें, खासकर दोपहिया वाहन पर या रात में।'],
    flood: ['सड़क पर जलभराव', 'हो सके तो इस सड़क से न जाएँ। भरे पानी में न चलें और न गाड़ी चलाएँ। आसपास यातायात धीमा रह सकता है।'],
    heavy_rain: ['तेज़ बारिश', 'निचली सड़कों और अंडरपास में जल्द पानी भर सकता है। अतिरिक्त समय रखें या यात्रा टाल दें।'],
    traffic: ['भारी ट्रैफिक', 'देरी हो सकती है। हो सके तो दूसरा रास्ता चुनें।'],
    power_line: ['बिजली के तार की समस्या', 'दूर रहें और तार के पास किसी चीज़ को न छुएँ।'],
    transmission: ['हाई वोल्टेज टावर की समस्या', 'टावर और गिरे हुए तार से दूर रहें।'],
    sewage: ['सीवर का पानी बह रहा है', 'पैदल चलते समय सावधान रहें, मैनहोल खुला हो सकता है।'],
    fallen_tree: ['पेड़ गिरा हुआ है', 'सड़क आंशिक रूप से बंद हो सकती है। हो सके तो दूसरा रास्ता चुनें।'],
    signal: ['ट्रैफिक सिग्नल खराब', 'सिग्नल काम नहीं कर रहा। चौराहे पर सावधान रहें।'],
  },
  'en-IN': {
    away: (n, unit) => `${n} ${unit === 'm' ? 'metres' : 'kilometres'} away.`,
    note: 'Reported by citizens, not an official warning.',
  },
};

export function spokenAlert(alert, lang) {
  const words = SPOKEN[lang] || SPOKEN['en-IN'];
  const id = alert.lead.category;
  // "Pothole / road damage" would otherwise be read out with the word "slash".
  const [label, advice] = words[id] || [CATEGORIES[id].label.replace(' / ', ' or '), ALERT_ADVICE[id]];
  const distance = alert.km == null ? null
    : alert.km < 1 ? words.away(Math.round(alert.km * 1000), 'm') : words.away(alert.km.toFixed(1), 'km');
  return [label + (lang === 'hi-IN' ? '।' : '.'), distance, advice, words.note].filter(Boolean).join(' ');
}

// The closest voice this device has: the exact language, or another accent of it.
export function voiceFor(voices, lang) {
  const norm = (l) => (l || '').replace('_', '-').toLowerCase();
  return voices.find((v) => norm(v.lang) === norm(lang))
    || voices.find((v) => norm(v.lang).split('-')[0] === norm(lang).split('-')[0]) || null;
}

// Phones differ in the voices they have, so a missing one falls back to English rather than silence.
export function alertSpeech(alert, lang, voices) {
  const voice = voiceFor(voices, lang);
  if (voice || lang === 'en-IN') return { text: spokenAlert(alert, lang), lang, voice, fellBackFrom: null };
  return { text: spokenAlert(alert, 'en-IN'), lang: 'en-IN', voice: voiceFor(voices, 'en-IN'), fellBackFrom: ENGLISH_NAME[lang] };
}

export function appendDictated(existing, text, max) {
  const add = (text || '').trim();
  if (!add) return existing || '';
  const before = (existing || '').trim();
  return (before ? `${before} ${add}` : add).slice(0, max);
}

export function micProblem(code) {
  return {
    'not-allowed': 'Microphone access is blocked. Allow it in your browser settings, or type instead.',
    'service-not-allowed': 'Speech is turned off in this browser. You can type instead.',
    'no-speech': 'We did not hear anything. Please try again.',
    'audio-capture': 'No microphone was found. You can type instead.',
    network: 'Speech needs an internet connection. You can type instead.',
    'language-not-supported': 'This browser cannot understand that language. Try English, or type instead.',
  }[code] || 'Could not catch that. Please try again, or type instead.';
}

// ------------------------------------------------------------------ browser speech
const Recognition = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
export const canListen = () => !!Recognition();
export const canSpeak = () => !!(globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance);

// Listens until the person pauses. Returns a function that stops listening early.
export function listen({ lang, onInterim, onFinal, onProblem, onEnd }) {
  const Rec = Recognition();
  const rec = new Rec();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
    }
    if (final.trim()) onFinal(final.trim()); else onInterim(interim);
  };
  rec.onerror = (e) => { if (e.error !== 'aborted') onProblem(micProblem(e.error)); };
  rec.onend = onEnd;
  try { rec.start(); } catch { onProblem(micProblem()); onEnd(); }
  return () => { try { rec.abort(); } catch { /* already stopped */ } };
}

// Voices can arrive a moment after the page opens.
export function loadVoices(waitMs = 1000) {
  const synth = globalThis.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => { synth.removeEventListener?.('voiceschanged', done); clearTimeout(timer); resolve(synth.getVoices()); };
    const timer = setTimeout(done, waitMs);
    synth.addEventListener?.('voiceschanged', done);
  });
}

let speaking = null; // Held here because some browsers drop an utterance that nothing refers to, and it never finishes.
export function speak({ text, lang, voice }, onEnd) {
  const synth = globalThis.speechSynthesis;
  synth.cancel();
  const u = new globalThis.SpeechSynthesisUtterance(text);
  u.lang = lang;
  if (voice) u.voice = voice;
  u.onend = onEnd;
  u.onerror = onEnd;
  speaking = u;
  synth.speak(speaking);
}
export const stopSpeaking = () => { if (canSpeak()) globalThis.speechSynthesis.cancel(); };
