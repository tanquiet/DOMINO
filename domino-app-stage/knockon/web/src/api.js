// The whole app runs in the browser: data comes from data/knockon.json and the simulation runs
// in a Web Worker (engine.js). No server needed - host the built folder anywhere.
import * as core from './core.js';

let worker = null;
let seq = 0;
const pending = new Map();

function startWorker(data) {
  try {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.res); else p.reject(new Error(e.data.err));
    };
    w.onerror = () => { worker = null; };     // fall back to the main thread
    worker = w;
    return call('init', data);
  } catch {
    worker = null;
    return Promise.resolve(true);
  }
}

function call(fn, ...args) {
  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, fn, args });
    });
  }
  // main-thread fallback: yield once so the "Simulating..." label can paint
  return new Promise((resolve, reject) => setTimeout(() => {
    try { resolve(core[fn](...args)); } catch (e) { reject(e); }
  }, 20));
}

export async function loadAll() {
  const r = await fetch('data/knockon.json');
  if (!r.ok) throw new Error('Could not load data/knockon.json - run: python api/export_static.py');
  const data = await r.json();
  core.init(data);                 // main-thread copy (fallback)
  await startWorker(data).catch(() => { worker = null; });
  const graph = { nodes: data.graph.nodes, edges: [] };
  for (const [to, groups] of Object.entries(data.graph.deps)) {
    for (const g of groups) for (const from of g.providers) graph.edges.push({ from, to, resource: g.resource });
  }
  return { mode: 'local', meta: data.meta, graph, roads: data.roads };
}

export const simulate = (body) => call('simulate', body);
export const recommend = (body) => call('recommend', body);
export const criticality = (body) => call('criticality', body);
