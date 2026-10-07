import { Bot, STRATEGIES } from './bot';
import { isOperating } from '../../shared/simulation/world';
import type { City } from '../../shared/types/city';
import { writeFileSync } from 'node:fs';

const name = process.argv[2] ?? 'balanced', years = Number(process.argv[3] ?? 5), seed = Number(process.argv[4] ?? 731), out = process.argv[5];
const bot = new Bot(STRATEGIES[name], seed);
const rows: Record<string, number | string>[] = [];
let minTreasury = Infinity;
function sample(c: City) {
  const b = c.tiles.filter(t => t.building).map(t => t.building!);
  const op = b.filter(x => isOperating(x));
  const by = (z: string) => op.filter(x => x.type === z);
  const lvl = (z: string) => { const a = by(z); return a.length ? a.reduce((s, x) => s + x.level, 0) / a.length : 0; };
  const biz = op.filter(x => x.business);
  const m = c.mobility.stats.modes, trips = Object.values(m).reduce((s, v) => s + v, 0) || 1;
  const informal = b.filter(x => x.tenure !== 'formal');
  minTreasury = Math.min(minTreasury, c.treasury);
  const g = c.governance, ps = c.publicServices;
  const roadTiles = c.tiles.filter(t => t.road);
  rows.push({
    tick: c.tick, year: +(c.tick / 360).toFixed(2), pop: c.population, households: c.households, businesses: biz.length, housing: c.housingCapacity, vacancy: +(c.vacantHousing / Math.max(1, c.housingCapacity) * 100).toFixed(1),
    jobs: c.jobs, workforce: c.workforce, employed: c.employed, unemp: +c.unemploymentRate.toFixed(1), informalJobs: c.living.informal.jobs, publicJobs: ps.publicJobs,
    treasuryM: +(c.treasury / 1e6).toFixed(1), incomeM: +(c.income / 1e6).toFixed(2), expensesM: +(c.expenses / 1e6).toFixed(2),
    taxR: +(c.taxes.residential / 1e6).toFixed(2), taxC: +(c.taxes.commercial / 1e6).toFixed(2), taxI: +(c.taxes.industrial / 1e6).toFixed(2),
    infraCostM: +(Object.values(c.infrastructure.costs).reduce((s, v) => s + v, 0) / 1e6).toFixed(2), serviceCostM: +(Object.values(ps.costs).reduce((s, v) => s + v, 0) / 1e6).toFixed(2),
    policyCostM: +(g.programCost / 1e6).toFixed(2), transitCostM: +((c.transit.finance.bus + c.transit.finance.brt + c.transit.finance.stations + c.transit.finance.terminals + c.transit.finance.depots) / 1e6).toFixed(2),
    sat: c.satisfaction, qol: +ps.qualityOfLife.toFixed(1), pp: +c.purchasingPower.toFixed(1), land: +c.averageLandValue.toFixed(1),
    devLand: +(op.length ? op.reduce((s, x) => s + c.tiles.find(t => t.building === x)!.landValue, 0) / op.length : 0).toFixed(1),
    rent: Math.round(g.housing.averageRent), afford: +g.housing.affordability.toFixed(1), housingPressure: +g.housing.pressure.toFixed(1), col: +g.housing.costOfLiving.toFixed(1), displaced: g.housing.displacedResidents,
    demR: c.demand.residential, demC: c.demand.commercial, demI: c.demand.industrial,
    nR: by('residential').length, nC: by('commercial').length, nI: by('industrial').length, lvlR: +lvl('residential').toFixed(2), lvlC: +lvl('commercial').toFixed(2), lvlI: +lvl('industrial').toFixed(2),
    lvl5: op.filter(x => x.level === 5).length, abandoned: b.filter(x => x.abandoned).length, closedBiz: biz.filter(x => x.business!.closedAt !== null).length,
    profit: +(biz.length ? biz.reduce((s, x) => s + x.business!.profitability, 0) / biz.length : 0).toFixed(1),
    jobsC: by('commercial').reduce((s, x) => s + x.maximumJobs, 0), jobsI: by('industrial').reduce((s, x) => s + x.maximumJobs, 0),
    power: +c.infrastructure.power.reliability.toFixed(1), water: +c.infrastructure.water.reliability.toFixed(1), gen: +c.infrastructure.power.generatorDependency.toFixed(1), privW: +c.infrastructure.water.privateDependency.toFixed(1),
    supply: +c.infrastructure.power.supply.toFixed(1), pdemand: +c.infrastructure.power.demand.toFixed(1),
    flooded: c.infrastructure.floodedTiles, floodInc: c.infrastructure.floodIncidents, floodProps: c.infrastructure.floodedProperties, lossM: +(c.infrastructure.economicLoss / 1e6).toFixed(0),
    floodRiskB: +(b.length ? b.reduce((s, x) => s + c.tiles.find(t => t.building === x)!.services.floodRisk, 0) / b.length : 0).toFixed(1),
    drainQ: +(b.length ? b.reduce((s, x) => s + c.tiles.find(t => t.building === x)!.services.drainageQuality, 0) / b.length : 0).toFixed(1),
    cong: +c.mobility.stats.congestion.toFixed(1), commute: +c.mobility.stats.averageCommute.toFixed(1), jobAcc: +c.mobility.stats.jobAccessibility.toFixed(1),
    roadCong50: roadTiles.filter(t => t.mobility.congestion > 50).length, roads: roadTiles.length,
    walk: +(m.walk / trips * 100).toFixed(1), car: +(m.car / trips * 100).toFixed(1), okada: +(m.okada / trips * 100).toFixed(1), keke: +(m.keke / trips * 100).toFixed(1), danfo: +(m.danfo / trips * 100).toFixed(1), bus: +(m.bus / trips * 100).toFixed(1), brt: +(m.brt / trips * 100).toFixed(1),
    kekeRoutes: c.mobility.routes.filter(r => r.mode === 'keke').length, danfoRoutes: c.mobility.routes.filter(r => r.mode === 'danfo').length, danfoVeh: c.mobility.routes.filter(r => r.mode === 'danfo').reduce((s, r) => s + r.vehicles, 0),
    transitRiders: c.transit.stats.ridership,
    crime: +c.safety.metrics.crimePressure.toFixed(1), safety: +c.safety.metrics.publicSafety.toFixed(1), night: +c.safety.metrics.nightSafety.toFixed(1), incidents: c.safety.totalIncidents, serious: c.safety.seriousIncidents,
    informalB: informal.length, informalPop: informal.reduce((s, x) => s + x.occupants, 0), informalPressure: +c.living.informal.housingPressure.toFixed(1), markets: c.living.markets.length,
    edu: +(ps.stats.education.served / Math.max(1, ps.stats.education.demand) * 100).toFixed(1), health: +(ps.stats.healthcare.served / Math.max(1, ps.stats.healthcare.demand) * 100).toFixed(1),
    wasteBacklog: Math.round(ps.waste.backlog), fires: ps.fireCount, facilities: ps.facilities.length,
    sat_factors: '', actions: bot.actions, spentM: +(bot.spent / 1e6).toFixed(0), radius: bot.radius,
  });
}
const t0 = Date.now();
bot.run(years * 360, c => { sample(c); if (c.tick % 1800 === 0) console.error(`${name} y${c.tick / 360} pop ${c.population} ${(Date.now() - t0) / 1000}s`); });
const c = bot.city;
writeFileSync(out ?? `out/${name}-${years}y-${seed}.json`, JSON.stringify({ name, seed, years, minTreasury, rows, history: c.history.slice(0, 40), policyLog: bot.policyLog, challenges: c.governance.challenges.filter(x => !x.resolved).map(x => x.title), feed: c.living.feed.slice(0, 20).map(f => f.text) }));
console.error(`done ${name} ${(Date.now() - t0) / 1000}s`);
