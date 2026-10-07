// Tabulates exp.ts outputs (out/exp-<variant>-<seed>.json) for two codebases at the final year.
// Usage: node tools/balance/exp-report.mjs <label>=<dir> <label>=<dir> [seed]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const sets = process.argv.slice(2).filter(a => a.includes('=')).map(a => a.split('='));
const seed = process.argv.slice(2).find(a => /^\d+$/.test(a)) ?? '731';
const cols = ['pop', 'unemp', 'treasuryM', 'incomeM', 'expensesM', 'policyM', 'sat', 'qol', 'land', 'rent', 'crime', 'safety', 'power', 'water', 'flooded', 'commute', 'walk', 'lvlAll', 'profit', 'informal'];
const variants = [...new Set(sets.flatMap(([, d]) => existsSync(d) ? readdirSync(d).filter(f => f.startsWith('exp-') && f.endsWith(`-${seed}.json`)).map(f => f.slice(4, -(seed.length + 6))) : []))].sort((a, b) => (a === 'control' ? -1 : b === 'control' ? 1 : a.localeCompare(b)));
console.log(`| Variant | Code | ${cols.join(' | ')} |`);
console.log(`|---|---|${cols.map(() => '---:').join('|')}|`);
for (const v of variants) for (const [label, d] of sets) {
  const f = `${d}/exp-${v}-${seed}.json`; if (!existsSync(f)) continue;
  const rows = JSON.parse(readFileSync(f, 'utf8')), r = rows.at(-1);
  console.log(`| ${v} | ${label} | ${cols.map(c => typeof r[c] === 'number' ? (Math.abs(r[c]) >= 1000 ? Math.round(r[c]).toLocaleString('en-GB') : +r[c].toFixed(1)) : r[c]).join(' | ')} |`);
}
