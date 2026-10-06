import { createCity, step } from '../../shared/simulation/engine';
import { persistentUnemployment, migrationBalance } from '../../shared/simulation/economy';
import { sentimentFactors } from '../../shared/simulation/activity';
const c = createCity(0, Number(process.argv[2] ?? 731));
const days = Number(process.argv[3] ?? 400);
for (let d = 0; d < days; d++) {
  step(c);
  const shop = c.tiles.find(t => t.building?.type === 'commercial')?.building;
  const homes = c.tiles.filter(t => t.building?.type === 'residential').map(t => t.building!);
  if (d % 5 === 0 || (d > 150 && d < 260 && d % 2 === 0)) console.log(d, 'pop', c.population, 'disp', c.governance.housing.displacedResidents, 'jobs', c.jobs, 'emp', c.employed, 'wf', c.workforce, 'inf', c.living.informal.jobs, 'acc', c.mobility.stats.jobAccessibility.toFixed(0), 'pp', c.purchasingPower.toFixed(0), 'u', c.unemploymentRate.toFixed(0), 'pu', persistentUnemployment(c).toFixed(0), 'sat', c.satisfaction, 'mig', migrationBalance(c),
    'rain', c.weather.kind, c.weather.rainfall.toFixed(0), 'fl', c.infrastructure.floodedTiles, 'pw', c.infrastructure.power.reliability.toFixed(0),
    'shop', shop ? `${shop.abandoned ? 'AB' : ''}${shop.floodClosed ? 'FC' : ''}${shop.business?.closedAt !== null ? 'CL' : ''} p${shop.business?.profitability} ld${shop.business?.lossDays} pd${shop.poorDays} j${shop.jobs}/${shop.maximumJobs}` : '-',
    'homes', homes.map(h => `${h.abandoned ? 'A' : ''}${h.occupants}/${h.satisfaction}/${h.poorDays}`).join(' '),
    'dem', JSON.stringify(c.demand));
}
console.log(sentimentFactors(c).map(f => `${f.label}:${f.value.toFixed(1)}`).join(' | '));
