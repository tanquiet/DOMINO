// Dark by default. The choice is remembered on this device. The cascade map stays dark in both themes.
import React, { useState } from 'react';
import { loadSettings, saveSettings } from './settings.js';

export const applyTheme = (theme) => { document.documentElement.dataset.theme = theme; };

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => loadSettings().theme);
  const next = theme === 'dark' ? 'light' : 'dark';
  const change = () => { saveSettings({ theme: next }); applyTheme(next); setTheme(next); };
  return (
    <button type="button" className="theme-toggle" onClick={change} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <span aria-hidden="true">{next === 'light' ? '☀️' : '🌙'}</span><span className="theme-word">{next === 'light' ? 'Light' : 'Dark'}</span>
    </button>
  );
}
