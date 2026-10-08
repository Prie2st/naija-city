// Summarizes run.ts outputs into Markdown tables for BALANCE_RETEST.md.
// Usage: node tools/balance/report.mjs <label>=<dir> [<label>=<dir> ...] [--years 5,20,50] [--strategies a,b] [--seeds 731,1009]
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sets = args.filter(a => a.includes('=') && !a.startsWith('--')).map(a => { const [label, dir] = a.split('='); return { label, dir }; });
const years = opt('--years', '5,20,50').split(',').map(Number);
const only = opt('--strategies', ''), seedsOnly = opt('--seeds', '');
const load = dir => Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f.replace(/(-\d+y)?\.json$/, '').replace(/-50y-/, '-'), JSON.parse(readFileSync(`${dir}/${f}`))]));
const data = sets.map(s => ({ ...s, runs: existsSync(s.dir) ? load(s.dir) : {} }));
const at = (run, y) => run.rows.reduce((best, r) => Math.abs(r.year - y) < Math.abs(best.year - y) ? r : best, run.rows[0]);
const transit = r => +(r.bus + r.brt + r.danfo + r.keke).toFixed(1);
const fmt = v => typeof v === 'number' ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : String(+v.toFixed(1))) : String(v);
const columns = [
  ['Pop', r => r.pop], ['Households', r => r.households], ['Jobs', r => r.jobs], ['Unemp %', r => r.unemp],
  ['Housing', r => r.housing], ['Vacancy %', r => r.vacancy], ['Housing pressure', r => r.housingPressure], ['Rent ₦', r => r.rent],
  ['Treasury ₦M', r => r.treasuryM], ['Income ₦M/mo', r => r.incomeM], ['Expenses ₦M/mo', r => r.expensesM],
  ['Power %', r => r.power], ['Water %', r => r.water], ['Flooded tiles', r => r.flooded],
  ['QoL', r => r.qol], ['Satisfaction', r => r.sat], ['Crime', r => r.crime], ['Safety', r => r.safety],
  ['Walk %', r => r.walk], ['Car %', r => r.car], ['Okada %', r => r.okada], ['Transit %', transit], ['Commute min', r => r.commute], ['Land value', r => r.land],
  ['Res lvl', r => r.lvlR], ['Com lvl', r => r.lvlC], ['Ind lvl', r => r.lvlI], ['Businesses', r => r.businesses], ['Informal bldgs', r => r.informalB], ['Abandoned', r => r.abandoned],
];
const keys = [...new Set(data.flatMap(d => Object.keys(d.runs)))].filter(k => (!only || only.split(',').includes(k.replace(/-\d+$/, ''))) && (!seedsOnly || seedsOnly.split(',').includes(k.split('-').at(-1)))).sort();
for (const y of years) {
  console.log(`\n#### Year ${y}\n`);
  console.log(`| Run | ${data.length > 1 ? 'Code | ' : ''}${columns.map(c => c[0]).join(' | ')} |`);
  console.log(`|---|${data.length > 1 ? '---|' : ''}${columns.map(() => '---:').join('|')}|`);
  for (const k of keys) for (const d of data) {
    const run = d.runs[k]; if (!run) continue;
    const r = at(run, y); if (Math.abs(r.year - y) > 0.6) continue;
    console.log(`| ${k} | ${data.length > 1 ? d.label + ' | ' : ''}${columns.map(c => fmt(c[1](r))).join(' | ')} |`);
  }
}
// Minimum treasury over the whole run and the population trajectory by decade.
console.log('\n#### Trajectories (population by year; lowest treasury)\n');
const marks = [1, 2, 3, 5, 10, 15, 20, 30, 40, 50];
console.log(`| Run | ${data.length > 1 ? 'Code | ' : ''}${marks.map(m => 'y' + m).join(' | ')} | Lowest treasury ₦M |`);
console.log(`|---|${data.length > 1 ? '---|' : ''}${marks.map(() => '---:').join('|')}|---:|`);
for (const k of keys) for (const d of data) {
  const run = d.runs[k]; if (!run) continue;
  const last = run.rows.at(-1).year;
  console.log(`| ${k} | ${data.length > 1 ? d.label + ' | ' : ''}${marks.map(m => m <= last + 0.1 ? fmt(at(run, m).pop) : '').join(' | ')} | ${fmt(run.minTreasury / 1e6)} |`);
}
