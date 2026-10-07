// Branch experiments: grow a balanced city to a base year, then apply one change and keep playing.
import { Bot, STRATEGIES } from './bot';
import { setTax, togglePolicy, setPriority } from '../../shared/simulation/governance';
import { applyTool } from '../../shared/simulation/engine';
import { placeTransitFacility } from '../../shared/simulation/transit';
import { isOperating } from '../../shared/simulation/world';
import type { PolicyId } from '../../shared/types/governance';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [variant, baseYears = '8', runYears = '12', seed = '731'] = process.argv.slice(2);
const basePath = `out/base-${baseYears}-${seed}.json`;
let bot: Bot;
if (variant === 'make-base' || !existsSync(basePath)) {
  bot = new Bot(STRATEGIES.balanced, +seed); bot.run(+baseYears * 360);
  writeFileSync(basePath, JSON.stringify({ city: bot.city, radius: bot.radius }));
  if (variant === 'make-base') process.exit(0);
}
const saved = JSON.parse(readFileSync(basePath, 'utf8'));
const strategy = { ...STRATEGIES.balanced };
bot = new Bot(strategy, +seed); bot.city = saved.city; bot.radius = saved.radius;
const c = bot.city;
const policies: PolicyId[] = ['street-lighting', 'community-safety', 'commercial-patrol', 'hub-safety', 'density', 'affordable', 'infill', 'commerce', 'industry', 'business', 'transit', 'pedestrian', 'drainage', 'waste', 'green', 'integration', 'community-upgrade', 'formalization'];
const tax = (r: number, co: number, i: number) => { c.governance.taxes.changedAt = { residential: -999, commercial: -999, industrial: -999 }; setTax(c, 'residential', r); setTax(c, 'commercial', co); setTax(c, 'industrial', i); strategy.taxes = { residential: r, commercial: co, industrial: i }; };
if (variant === 'tax-max') tax(.6, 8, 8);
else if (variant === 'tax-min') tax(.1, 1, 1);
else if (variant === 'tax-high') tax(.45, 6, 5.5);
else if (variant === 'tax-res-max') tax(.6, 3.5, 2.5);
else if (variant === 'tax-biz-max') tax(.25, 8, 8);
else if (variant.startsWith('policy-')) togglePolicy(c, variant.slice(7) as PolicyId, null);
else if (variant === 'funding-150') for (const g of Object.keys(c.publicServices.funding) as any[]) (c.publicServices.funding as any)[g] = 150;
else if (variant === 'funding-50') for (const g of Object.keys(c.publicServices.funding) as any[]) (c.publicServices.funding as any)[g] = 50;
else if (variant === 'maint-low') for (const g of ['power', 'water', 'drainage', 'roads'] as const) setPriority(c, g, 'low');
else if (variant === 'maint-high') for (const g of ['power', 'water', 'drainage', 'roads'] as const) setPriority(c, g, 'high');
else if (variant === 'freeze') strategy.stopAfter = 0; // stop building entirely
else if (variant === 'no-drain') strategy.drainage = 'none'; // stop adding drains (existing drains stay)
else if (variant === 'drain-proactive') strategy.drainage = 'proactive';
else if (variant === 'road-upgrade') strategy.car = true; // road upgrades and junction treatments
else if (variant === 'utility-infill') strategy.utilityInfill = true; // clear low-rise homes for substations, plants and towers
else if (variant === 'transit-net' || variant === 'transit-sub') {
  // Clear one low-value parcel near the centre for a depot (players bulldoze when the map is full).
  const site = c.tiles.filter(t => t.building && t.building.level <= 2 && t.building.type === 'residential').sort((a, b) => Math.hypot(a.x - 13, a.y - 13) - Math.hypot(b.x - 13, b.y - 13))[0];
  applyTool(c, site.x, site.y, 'bulldoze'); applyTool(c, site.x, site.y, 'bulldoze');
  console.error('depot', placeTransitFacility(c, site.y * 32 + site.x, 'bus-depot'));
  bot.depot = true; strategy.transit = true; strategy.brt = true;
  if (variant === 'transit-sub') { c.transit.subsidyRate = 50; togglePolicy(c, 'transit', null); }
}
else if (variant !== 'control') throw new Error('unknown variant ' + variant);
const snap = () => {
  const b = c.tiles.filter(t => isOperating(t.building)).map(t => t.building!);
  return { year: +(c.tick / 360).toFixed(1), pop: c.population, jobs: c.jobs, unemp: +c.unemploymentRate.toFixed(1), treasuryM: Math.round(c.treasury / 1e6), incomeM: +(c.income / 1e6).toFixed(1), expensesM: +(c.expenses / 1e6).toFixed(1),
    policyM: +(c.governance.programCost / 1e6).toFixed(1), sat: c.satisfaction, qol: +c.publicServices.qualityOfLife.toFixed(1), land: +c.averageLandValue.toFixed(1), rent: Math.round(c.governance.housing.averageRent), afford: +c.governance.housing.affordability.toFixed(1),
    crime: +c.safety.metrics.crimePressure.toFixed(1), safety: +c.safety.metrics.publicSafety.toFixed(1), night: +c.safety.metrics.nightSafety.toFixed(1), cong: +c.mobility.stats.congestion.toFixed(1), riders: c.transit.stats.ridership, routes: c.transit.routes.length, transitCostM: +((c.transit.finance.bus+c.transit.finance.brt+c.transit.finance.stations+c.transit.finance.depots+c.transit.finance.terminals)/1e6).toFixed(1), faresM: +(c.transit.finance.fares/1e6).toFixed(1), bus: c.mobility.stats.modes.bus, brt: c.mobility.stats.modes.brt, danfo: c.mobility.stats.modes.danfo, car: c.mobility.stats.modes.car, okada: c.mobility.stats.modes.okada, trips: c.mobility.stats.dailyTrips, commute: +c.mobility.stats.averageCommute.toFixed(1), power: +c.infrastructure.power.reliability.toFixed(1), water: +c.infrastructure.water.reliability.toFixed(1), edu: +(c.publicServices.stats.education.served/Math.max(1,c.publicServices.stats.education.demand)*100).toFixed(1), walk: +(c.mobility.stats.modes.walk / Math.max(1, c.mobility.stats.dailyTrips) * 100).toFixed(1),
    lvlR: +(b.filter(x => x.type === 'residential').reduce((s, x) => s + x.level, 0) / Math.max(1, b.filter(x => x.type === 'residential').length)).toFixed(2), lvlAll: +(b.reduce((s, x) => s + x.level, 0) / Math.max(1, b.length)).toFixed(2),
    nC: b.filter(x => x.type === 'commercial').length, nI: b.filter(x => x.type === 'industrial').length, nR: b.filter(x => x.type === 'residential').length,
    profit: +(b.filter(x => x.business).reduce((s, x) => s + x.business!.profitability, 0) / Math.max(1, b.filter(x => x.business).length)).toFixed(1),
    flooded: c.infrastructure.floodedTiles, floodInc: c.infrastructure.floodIncidents, drainCond: 0, demR: c.demand.residential, demC: c.demand.commercial, demI: c.demand.industrial, informal: c.tiles.filter(t => t.building?.tenure !== 'formal' && t.building).length };
};
const rows = [snap()];
bot.run(+runYears * 360, cc => { if (cc.tick % 360 === 0) rows.push(snap()); });
writeFileSync(`out/exp-${variant}-${seed}.json`, JSON.stringify(rows));
console.error('done', variant);
