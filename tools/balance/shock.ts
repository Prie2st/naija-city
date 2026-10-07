// Recovery tests: grow a city with the balanced bot, snapshot it, then replay the same years with and
// without a shock. Recovery time is measured against the unshocked control run from the same snapshot,
// so seasonal floods and the economic cycle cancel out. The bot keeps playing after the shock (player
// response); `--no-response` stops player actions at the shock instead.
// Usage: node dist/shock.mjs <seed> [warmupYears] [afterYears] [--no-response] > out/shock-<seed>.json
import { Bot, STRATEGIES } from './bot';
import { setWeather } from '../../shared/simulation/weather';
import { INFRASTRUCTURE } from '../../shared/simulation/infrastructure-config';
import { isOperating } from '../../shared/simulation/world';
import type { City } from '../../shared/types/city';

const seed = Number(process.argv[2] ?? 731), warmup = Number(process.argv[3] ?? 10), after = Number(process.argv[4] ?? 8);
const respond = !process.argv.includes('--no-response');
type Shock = { name: string; description: string; apply: (c: City) => void; during?: (c: City, day: number) => void };
const SHOCKS: Shock[] = [
  { name: 'major-flood', description: 'Five consecutive days of extreme rain at the start of the rainy season.', apply: () => {}, during: (c, day) => { if (day < 5) setWeather(c, 'extreme-rain', 2); } },
  { name: 'power-disruption', description: 'Every power plant and substation fails for 60 days.', apply: c => { for (const t of c.tiles) if (t.infrastructure && INFRASTRUCTURE[t.infrastructure.kind].group === 'power') t.infrastructure.failedUntil = c.tick + 60; } },
  { name: 'worker-shortage', description: 'A quarter of residents leave at once (out-migration wave).', apply: c => { for (const t of c.tiles) if (isOperating(t.building) && t.building!.type === 'residential') t.building!.occupants = Math.floor(t.building!.occupants * 0.75); } },
  { name: 'business-decline', description: 'A third of trading businesses close at once.', apply: c => { let i = 0; for (const t of c.tiles) { const b = t.building; if (isOperating(b) && b!.business && b!.business.closedAt === null && i++ % 3 === 0) { b!.business.closedAt = c.tick; b!.jobs = 0; } } } },
  { name: 'budget-deficit', description: 'An emergency bill equal to 18 months of expenses drives the treasury into debt.', apply: c => { c.treasury -= Math.max(0, c.expenses * 18 + Math.max(0, c.treasury)); } },
];
const metrics = (c: City) => ({ pop: c.population, employed: c.employed, jobs: c.jobs, sat: c.satisfaction, treasury: c.treasury, businesses: c.tiles.filter(t => isOperating(t.building) && t.building!.business?.closedAt === null).length });
function cloneBot(source: Bot) {
  const b = new Bot(STRATEGIES.balanced, seed);
  Object.assign(b, structuredClone({ radius: source.radius, stops: source.stops, depot: source.depot, brtBuilt: source.brtBuilt, policyLog: source.policyLog, taxes: source.taxes }));
  b.city = structuredClone(source.city);
  if (!respond) b.s = { ...b.s, stopAfter: b.city.tick };
  return b;
}
function replay(base: Bot, shock?: Shock) {
  const bot = cloneBot(base), start = bot.city.tick, series: ReturnType<typeof metrics>[] = [];
  shock?.apply(bot.city);
  for (let day = 0; day < after * 360; day++) {
    shock?.during?.(bot.city, day);
    bot.run(1);
    if (day % 10 === 9) series.push(metrics(bot.city));
  }
  return { start, series };
}
// Wait for the rainy season so the flood shock and its control share the same weather window.
const base = new Bot(STRATEGIES.balanced, seed);
base.run(warmup * 360);
while (base.city.weather.season !== 'rainy') base.run(1);
const before = metrics(base.city), control = replay(base);
const results = SHOCKS.map(shock => {
  const run = replay(base, shock);
  const worst = { pop: Math.min(...run.series.map(r => r.pop)), employed: Math.min(...run.series.map(r => r.employed)), sat: Math.min(...run.series.map(r => r.sat)), treasury: Math.min(...run.series.map(r => r.treasury)) };
  // Recovered: population and employment within 5% of the control run, satisfaction within 3 points, and
  // (for fiscal shocks) the treasury back above zero, held for 60 days.
  const ok = (i: number) => { const r = run.series[i], k = control.series[i]; return r.pop >= k.pop * 0.95 && r.employed >= k.employed * 0.95 && r.sat >= k.sat - 3 && (shock.name !== 'budget-deficit' || r.treasury >= 0); };
  let recoveredAt: number | null = null;
  for (let i = 0; i < run.series.length; i++) if (ok(i) && run.series.slice(i, i + 6).every((_, j) => ok(i + j))) { recoveredAt = (i + 1) * 10; break; }
  const end = run.series.at(-1)!, controlEnd = control.series.at(-1)!;
  console.error(`${seed} ${shock.name}: recovered ${recoveredAt === null ? 'not within ' + after + 'y' : 'after ' + recoveredAt + ' days'}; worst pop ${worst.pop} (control ${Math.min(...control.series.map(r => r.pop))})`);
  return { shock: shock.name, description: shock.description, recoveredDays: recoveredAt, worst, end, controlEnd, series: run.series.filter((_, i) => i % 3 === 0) };
});
console.log(JSON.stringify({ seed, warmup, after, respond, shockTick: base.city.tick, before, control: control.series.filter((_, i) => i % 3 === 0), results }));
