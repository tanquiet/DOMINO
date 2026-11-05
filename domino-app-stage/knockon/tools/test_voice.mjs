// Tests for voice: words in each language, spoken alerts and the fallback when a phone lacks a voice.
// Run from the project folder:  node --test tools/test_voice.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_ADVICE, CATEGORIES, suggestCategory } from '../web/src/complaints.js';
import { VOICE_LANGS, alertSpeech, appendDictated, canListen, canSpeak, micProblem, spokenAlert, voiceFor } from '../web/src/voice.js';

const alert = (category, km = null) => ({ lead: { category }, km });

test('spoken words point to the right problem in every language', () => {
  const cases = {
    pothole: ['big pothole near the bus stop', 'ಬಸ್ ನಿಲ್ದಾಣದ ಹತ್ತಿರ ದೊಡ್ಡ ಗುಂಡಿ ಇದೆ', 'बस स्टॉप के पास बड़ा गड्ढा है'],
    flood: ['the road is flooded', 'ರಸ್ತೆಯಲ್ಲಿ ಪ್ರವಾಹ', 'सड़क पर जलभराव है'],
    no_water: ['no water since morning', 'ಬೆಳಗ್ಗೆಯಿಂದ ನೀರು ಇಲ್ಲ', 'सुबह से पानी नहीं आ रहा'],
    sewage: ['manhole overflow', 'ಒಳಚರಂಡಿ ಉಕ್ಕಿ ಹರಿಯುತ್ತಿದೆ', 'सीवर का गंदा पानी बह रहा है'],
    garbage: ['garbage not cleared', 'ಕಸ ತೆಗೆದಿಲ್ಲ', 'कचरा नहीं उठाया गया'],
    fallen_tree: ['a tree fell', 'ರಸ್ತೆಗೆ ಮರ ಬಿದ್ದಿದೆ', 'सड़क पर पेड़ गिर गया'],
    heavy_rain: ['heavy rain here', 'ಇಲ್ಲಿ ಭಾರಿ ಮಳೆ', 'यहाँ तेज़ बारिश हो रही है'],
    traffic: ['huge traffic jam', 'ಭಾರಿ ಟ್ರಾಫಿಕ್', 'बहुत ट्रैफिक जाम है'],
    power_line: ['fallen electric wire', 'ವಿದ್ಯುತ್ ತಂತಿ ಬಿದ್ದಿದೆ', 'बिजली का तार गिरा है'],
    street_light: ['street light is off', 'ಬೀದಿ ದೀಪ ಉರಿಯುತ್ತಿಲ್ಲ', 'स्ट्रीट लाइट बंद है'],
  };
  for (const [id, phrases] of Object.entries(cases)) {
    for (const p of phrases) assert.equal(suggestCategory(p), id, p);
  }
  assert.equal(suggestCategory('ನಮಸ್ಕಾರ'), null);
  assert.equal(suggestCategory('नमस्ते'), null);
});

test('the same letters typed in different ways still match', () => {
  assert.equal(suggestCategory('ಮ್ಯಾನ್‌ಹೋಲ್ ತೆರೆದಿದೆ'), suggestCategory('ಮ್ಯಾನ್ಹೋಲ್ ತೆರೆದಿದೆ'));
  assert.equal(suggestCategory('सड़क पर गड्ढा'), 'pothole');
  assert.equal(suggestCategory('बाढ़ आ गई'), 'flood');
});

test('every alert can be read aloud in every language', () => {
  const alerts = Object.keys(ALERT_ADVICE);
  assert.equal(alerts.length, 9);
  const scripts = { 'kn-IN': /[ಀ-೿]/, 'hi-IN': /[ऀ-ॿ]/, 'en-IN': /[a-z]/ };
  for (const lang of Object.keys(VOICE_LANGS)) {
    for (const id of alerts) {
      const text = spokenAlert(alert(id), lang);
      assert.ok(scripts[lang].test(text), `${lang} ${id}`);
      if (lang !== 'en-IN') assert.ok(!text.includes(ALERT_ADVICE[id]), `${lang} ${id} is still in English`);
    }
  }
  assert.ok(spokenAlert(alert('pothole'), 'en-IN').startsWith(`Pothole or road damage. ${ALERT_ADVICE.pothole}`));
  for (const id of alerts) assert.ok(!spokenAlert(alert(id), 'en-IN').includes('/'), id);
  assert.ok(CATEGORIES.pothole.label.includes('/'));
});

test('a spoken alert says it is not official, and gives the distance when known', () => {
  assert.match(spokenAlert(alert('flood'), 'en-IN'), /not an official warning/);
  assert.match(spokenAlert(alert('flood', 0.5), 'en-IN'), /500 metres away/);
  assert.match(spokenAlert(alert('flood', 2.34), 'en-IN'), /2\.3 kilometres away/);
  assert.match(spokenAlert(alert('flood', 0.5), 'kn-IN'), /500 ಮೀಟರ್ ದೂರ/);
  assert.match(spokenAlert(alert('flood', 2.34), 'hi-IN'), /2\.3 किलोमीटर दूर/);
  assert.ok(!/away/.test(spokenAlert(alert('flood'), 'en-IN')));
});

test('voices match by language, then by another accent of it', () => {
  const voices = [{ lang: 'en-GB' }, { lang: 'hi_IN' }, { lang: 'en-IN' }];
  assert.equal(voiceFor(voices, 'en-IN').lang, 'en-IN');
  assert.equal(voiceFor(voices, 'hi-IN').lang, 'hi_IN');
  assert.equal(voiceFor([{ lang: 'en-GB' }], 'en-IN').lang, 'en-GB');
  assert.equal(voiceFor(voices, 'kn-IN'), null);
});

test('a phone without the voice reads the alert in English and says so', () => {
  const none = alertSpeech(alert('flood'), 'kn-IN', [{ lang: 'en-IN' }]);
  assert.equal(none.fellBackFrom, 'Kannada');
  assert.equal(none.lang, 'en-IN');
  assert.match(none.text, /Avoid this road/);
  const has = alertSpeech(alert('flood'), 'kn-IN', [{ lang: 'kn-IN' }]);
  assert.equal(has.fellBackFrom, null);
  assert.match(has.text, /[ಀ-೿]/);
  assert.equal(alertSpeech(alert('flood'), 'en-IN', []).fellBackFrom, null);
});

test('dictated words add to what is there and respect the limit', () => {
  assert.equal(appendDictated('', '  big pothole ', 500), 'big pothole');
  assert.equal(appendDictated('near school', 'very deep', 500), 'near school very deep');
  assert.equal(appendDictated('keep', '   ', 500), 'keep');
  assert.equal(appendDictated('abc', 'def', 5), 'abc d');
});

test('microphone problems have clear messages, with a default', () => {
  for (const code of ['not-allowed', 'no-speech', 'audio-capture', 'network']) assert.notEqual(micProblem(code), micProblem('unknown'), code);
  assert.match(micProblem('not-allowed'), /type instead/);
});

test('without browser speech the app reports no support rather than failing', () => {
  assert.equal(canListen(), false);
  assert.equal(canSpeak(), false);
});
