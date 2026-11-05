// Runs the simulation off the main thread so the map keeps animating.
import * as core from './core.js';

self.onmessage = (e) => {
  const { id, fn, args } = e.data;
  try {
    self.postMessage({ id, ok: true, res: core[fn](...args) });
  } catch (err) {
    self.postMessage({ id, ok: false, err: err.message || String(err) });
  }
};
