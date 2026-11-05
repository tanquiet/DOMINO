// Compare the JS engine with the Python engine on the same exported data.
import { readFileSync } from 'node:fs';
import { buildGraph, simulate, simulateWith, recommend, groupedCriticality, failuresFor } from '../web/src/engine.js';
const root = new URL('..', import.meta.url);
const data = JSON.parse(readFileSync(new URL('web/public/data/knockon.json', root)));
const exp = JSON.parse(readFileSync(new URL('tools/parity_expected.json', root)));
const defaults = Object.fromEntries(Object.entries(data.meta.params).map(([k, v]) => [k, v.value]));
let fails = 0;
const eq = (label, a, b) => {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) { fails++; console.log('MISMATCH', label, '\n  js:', sa.slice(0, 300), '\n  py:', sb.slice(0, 300)); }
};
const run = (req, params = defaults) => {
  const g = buildGraph(data, params);
  const f = failuresFor(req, g, params, data.meta.orr_flood_polygon);
  return [g, f, params];
};
for (const k of Object.keys(exp.sim)) {
  const [g, f, p] = run({ scenario: k });
  const r = simulate(g, f, p.horizon_h);
  const e = exp.sim[k];
  eq(`${k} impact`, r.impact_hospital_hours, e.impact_hospital_hours);
  eq(`${k} hospitals_down`, r.hospitals_down, e.hospitals_down);
  eq(`${k} first_down`, r.first_hospital_down_h, e.first_hospital_down_h);
  eq(`${k} timeline`, r.timeline, e.timeline);
  eq(`${k} hospitals`, r.hospitals, e.hospitals);
  eq(`${k} series`, r.series, e.series);
  const rec = recommend(g, f, p.horizon_h, p.generator_h, p.storage_h, 3, 3);
  eq(`${k} rec plan`, rec.plan, exp.rec[k].plan);
  eq(`${k} rec result`, rec.plan_result, exp.rec[k].plan_result);
  eq(`${k} rec options`, rec.options, exp.rec[k].options);
  if (rec.interventions.length) {
    const r2 = simulateWith(g, f, p.horizon_h, rec.interventions);
    eq(`${k} with plan`, r2.impact_hospital_hours, rec.plan_result.impact_hospital_hours);
  }
}
{ const g = buildGraph(data, defaults); eq('criticality', groupedCriticality(g, defaults.default_repair_h), exp.crit); }
{ const p = { ...defaults, ...exp.sliders_params }; const [g, f] = run({ scenario: 'tk_halli_2022' }, p);
  const r = simulate(g, f, p.horizon_h); eq('sliders timeline', r.timeline, exp.sliders.timeline); eq('sliders impact', r.impact_hospital_hours, exp.sliders.impact_hospital_hours); }
{ const [g, f, p] = run({ polygon: exp.poly_in }); const r = simulate(g, f, p.horizon_h);
  eq('polygon impact', r.impact_hospital_hours, exp.poly.impact_hospital_hours); eq('polygon failures', f.map((x) => x.node_id), exp.poly.failures.map((x) => x.id)); }
console.log(fails ? `${fails} mismatches` : 'ALL MATCH: JS engine == Python engine');
process.exit(fails ? 1 : 0);
