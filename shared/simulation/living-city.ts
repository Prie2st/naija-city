import { localGovernance } from './governance';
import type { City, Tile } from '../types/city';
import type { HouseholdSample, LivingState, CityFeedEvent } from '../types/living';
import { createBuilding } from './buildings';
import { clamp, isOperating, neighbourhoods, roadAccess, stableHash } from './world';
import { milestone, updateClusters } from './development';

export function newLivingState(): LivingState {
  return { households: [], markets: [], informal: { jobs: 0, employed: 0, output: 0, housingPressure: 0, pressureDays: 0 },
    feed: [], lastEvents: {}, previous: {} };
}
const surnames = ['Adeyemi', 'Okafor', 'Bello', 'Eze', 'Adebayo', 'Danjuma', 'Okon', 'Ibrahim', 'Obi', 'Lawal', 'Usman', 'Etim', 'Nwosu', 'Ojo', 'Bassey', 'Yakubu'];
export function refreshHouseholds(city: City) {
  const homes = city.tiles.filter(t => isOperating(t.building) && t.building!.type === 'residential' && t.building!.occupants > 0);
  const ids = new Set(homes.map(t => t.building!.id));
  city.living.households = city.living.households.filter(h => ids.has(h.homeId));
  for (const t of homes.sort((a, b) => stableHash(city.seed, a.y * city.size + a.x) - stableHash(city.seed, b.y * city.size + b.x))) {
    if (city.living.households.length >= 12) break;
    if (city.living.households.some(h => h.homeId === t.building!.id)) continue;
    const hash = stableHash(city.seed + 79, t.y * city.size + t.x);
    city.living.households.push({ id: `sample-${t.building!.id}`, surname: surnames[hash % surnames.length], homeId: t.building!.id, size: 2 + hash % 5 });
  }
}
export function householdSamples(city: City): HouseholdSample[] {
  return city.living.households.flatMap(h => {
    const homeTile = city.tiles.findIndex(t => t.building?.id === h.homeId);
    if (homeTile < 0) return [];
    const t = city.tiles[homeTile], b = t.building!, flows = city.mobility.flows.filter(f => f.purpose === 'work' && Math.abs(city.tiles[f.origin].x - t.x) < 4 && Math.abs(city.tiles[f.origin].y - t.y) < 4);
    if (!isOperating(b) || b.occupants <= 0) return [];
    const trips = flows.reduce((s, f) => s + f.trips, 0), commute = trips ? flows.reduce((s, f) => s + f.minutes * f.trips, 0) / trips : city.mobility.stats.averageCommute;
    const concerns = [
      {score:Math.max(0,65-(city.safety?.local[homeTile].nightSafety??75))*1.5+(city.safety?.local[homeTile].shock??0),text:'Public safety and reliable night lighting around our neighborhood.'},
      {score:Math.max(0,80-(localGovernance(city,t)?.affordability??100))*1.1,text:'Housing costs are rising faster than household income.'},
      {score:Math.max(0,(localGovernance(city,t)?.costOfLiving??40)-50),text:'Housing, travel, utilities and taxes strain our household budget.'},
      {score:t.publicServices?.fireActive?100:(t.publicServices?.fireRisk??0)*(1-(t.publicServices?.fire.quality??0)/100),text:'Fire response and safe recovery.'},
      {score:(100-(t.publicServices?.education.served??0))*.4,text:'Enough school places within reach.'},
      {score:(100-(t.publicServices?.healthcare.served??0))*.48,text:'Access to a staffed local health service.'},
      {score:Math.min(70,(t.publicServices?.uncollectedWaste??0)/Math.max(.02,t.publicServices?.wasteGenerated??0)*2),text:'Waste collection is falling behind.'},
      {score:(100-(t.publicServices?.parks.served??0))*.28,text:'Nearby recreation for our household.'},
      { score: city.unemploymentRate * 0.9 + (100 - t.mobility.accessibility) * 0.3, text: 'Finding accessible, steady work.' },
      { score: Math.max(0, commute - 15) * 2.5, text: 'The long journey to work.' },
      { score: t.mobility.congestion * 0.6, text: 'Traffic delays on nearby roads.' },
      { score: (100 - t.services.powerReliability) * 0.6, text: 'Frequent public power interruptions.' },
      { score: (100 - t.services.waterReliability) * 0.65, text: 'Reliable water at home.' },
      { score: t.services.floodDepth * 1.2, text: 'Floodwater around the home.' },
      { score: city.vacantHousing / Math.max(1, city.housingCapacity) < 0.05 ? 45 : 0, text: 'Finding room for growing households.' },
      { score: Math.max(0, 65 - city.purchasingPower) * 1.4, text: 'Household costs and purchasing power.' },
      { score: commute > 20 ? (100 - t.mobility.sharedCoverage) * 0.45 : 0, text: 'Better shared transport to work.' },
    ].sort((a, c) => c.score - a.score);
    return [{ ...h, homeTile, neighborhood: city.clusters.find(c => c.tileIds.includes(homeTile))?.name ?? 'Emerging settlement',
      size: Math.min(h.size, b.occupants), income: t.landValue >= 70 || b.level >= 4 ? 'comfortable' as const : t.landValue >= 40 ? 'middle' as const : 'modest' as const,
      employed: Math.min(Math.ceil(h.size * 0.45), Math.round(h.size * 0.45 * (1 - city.unemploymentRate / 100) * t.mobility.accessibility / 100)),
      commute, satisfaction: b.satisfaction, concern: concerns[0].score >= 25 ? concerns[0].text : 'Local opportunities and a stable neighborhood.' }];
  });
}
export function feedEvent(city: City, key: string, text: string, tileId: number | null = null, severity: CityFeedEvent['severity'] = 'notice', cooldown = 30) {
  const s = city.living;
  if (city.tick - (s.lastEvents[key] ?? -10000) < cooldown) return;
  s.lastEvents[key] = city.tick;
  s.feed.unshift({ id: `${key}-${city.tick}`, tick: city.tick, hour: 12, kind: key.split(':')[0], text, tileId, severity });
  s.feed = s.feed.slice(0, 80);
  const keys = Object.entries(s.lastEvents).sort((a, b) => b[1] - a[1]).slice(0, 256);
  s.lastEvents = Object.fromEntries(keys);
}
export function marketAttraction(city: City, t: Tile) {
  if (t.terrain === 'water' || t.terrain === 'wetland' || t.publicFacility || t.infrastructure || t.road || t.zone === 'industrial' || t.building?.type === 'residential' || t.building?.abandoned || !roadAccess(city, t)) return 0;
  const nearby = neighbourhoods(city.size)[t.y * city.size + t.x].map(id => city.tiles[id]);
  const residents = nearby.reduce((s, n) => s + (isOperating(n.building) ? n.building!.occupants : 0), 0);
  const shops = nearby.filter(n => isOperating(n.building) && n.building!.type === 'commercial' && n.building!.business?.closedAt === null).length;
  const riders = city.mobility.stops.filter(s => Math.abs(city.tiles[s.tileId].x - t.x) + Math.abs(city.tiles[s.tileId].y - t.y) <= 2).reduce((s, stop) => s + stop.passengers, 0);
  const major = nearby.some(n => n.road && (n.roadClass === 'major' || n.roadClass === 'avenue'));
  return clamp(residents / 18 + shops * 7 + Math.min(25, riders / 25) + (major ? 8 : 0) + city.purchasingPower * 0.08 - t.services.floodRisk * 0.18 - t.mobility.congestion * 0.12 - Math.min(40, t.services.floodDepth));
}
function updateMarkets(city: City) {
  const s = city.living;
  for (const m of s.markets) {
    m.age += 5; const t = city.tiles[m.tileId]; m.attraction = marketAttraction(city, t);
    m.poorDays = m.attraction < 25 ? m.poorDays + 5 : Math.max(0, m.poorDays - 10);
    if (m.attraction >= 70 && m.stalls < 10 && m.age % 30 === 0) { m.stalls++; feedEvent(city, `market-grow:${m.id}`, `${m.name} expanded to ${m.stalls} stalls.`, m.tileId, 'opportunity', 60); }
    if (m.poorDays >= 30 && m.stalls > 2 && m.age % 15 === 0) m.stalls--;
    m.jobs = t.services.floodDepth < 90 && roadAccess(city, t) && !t.infrastructure && !t.road ? m.stalls * 2 : 0;
    m.output = Math.round(m.jobs * 45000 * (0.3 + m.attraction / 100) * (1 - Math.min(0.9, t.services.floodDepth / 100)));
  }
  s.markets = s.markets.filter(m => m.poorDays < 90 && !city.tiles[m.tileId].road && !city.tiles[m.tileId].infrastructure && !city.tiles[m.tileId].publicFacility && (!city.tiles[m.tileId].building || city.tiles[m.tileId].building!.type === 'commercial'));
  if (s.markets.length >= 16 || city.population < 600) return;
  const candidates = city.tiles.map((t, tileId) => ({ tileId, score: marketAttraction(city, t) }))
    .filter(c => c.score >= 55 && !s.markets.some(m => Math.abs(city.tiles[m.tileId].x - city.tiles[c.tileId].x) + Math.abs(city.tiles[m.tileId].y - city.tiles[c.tileId].y) < 5))
    .sort((a, b) => b.score - a.score || a.tileId - b.tileId);
  const candidate = candidates[0];
  if (!candidate) { delete s.previous.marketCandidate; delete s.previous.marketSince; return; }
  if (s.previous.marketCandidate !== candidate.tileId) { s.previous.marketCandidate = candidate.tileId; s.previous.marketSince = city.tick; return; }
  if (city.tick - Number(s.previous.marketSince) < 15) return;
  const name = `${city.clusters.find(c => c.tileIds.some(id => Math.abs(city.tiles[id].x - city.tiles[candidate.tileId].x) + Math.abs(city.tiles[id].y - city.tiles[candidate.tileId].y) <= 2))?.name ?? 'Unity'} Market`;
  s.markets.push({ id: `market-${city.seed}-${candidate.tileId}`, tileId: candidate.tileId, name, age: 0, stalls: 3, attraction: candidate.score, jobs: 6, output: 270000, poorDays: 0 });
  feedEvent(city, `market-open:${candidate.tileId}`, `${name} formed around local households and passing customers.`, candidate.tileId, 'opportunity');
  milestone(city, 'first-market', `First organic market: ${name}.`); delete s.previous.marketCandidate;
}
export function informalSuitability(city: City, t: Tile) {
  if (t.terrain === 'water' || t.terrain === 'wetland' || t.road || t.publicFacility || t.infrastructure || t.zone || t.building || !roadAccess(city, t)) return 0;
  const near = neighbourhoods(city.size)[t.y * city.size + t.x].map(id => city.tiles[id]);
  if (!near.some(n => isOperating(n.building) && n.building!.occupants > 0)) return 0;
  return clamp(65 + near.filter(n => isOperating(n.building)).length * 3 + t.mobility.accessibility * 0.1 - t.services.floodRisk * 0.65 - t.services.floodDepth * 0.5);
}
function updateInformal(city: City) {
  const s = city.living, i = s.informal;
  const occupied = city.population / Math.max(1, city.housingCapacity);
  i.housingPressure = clamp((occupied - 0.85) * 250 + Math.max(0, city.demand.residential - 45) * 0.8 + Math.max(0,65-(city.governance?.housing.affordability??70))*.8 + (city.governance?.housing.displacedResidents??0)/Math.max(1,city.population)*80);
  const formalSupply = city.tiles.some(t => t.building?.type === 'residential' && t.building.openedAt === null);
  i.pressureDays = i.housingPressure >= 55 && !formalSupply ? i.pressureDays + 1 : Math.max(0, i.pressureDays - 2);
  const marketJobs = s.markets.reduce((sum, m) => sum + m.jobs, 0), marketOutput = s.markets.reduce((sum, m) => sum + m.output, 0);
  const accessible = city.mobility.stats.jobAccessibility / 100;
  const targetJobs = Math.floor(Math.min(city.workforce * 0.15, city.unemployed * 0.22) * (0.4 + accessible * 0.6)) + marketJobs;
  i.jobs += Math.sign(targetJobs - i.jobs) * Math.min(Math.abs(targetJobs - i.jobs), Math.max(1, Math.ceil(Math.abs(targetJobs - i.jobs) * 0.08)));
  const formalEmployees = city.tiles.reduce((sum, t) => sum + (t.building?.jobs ?? 0), 0);
  i.employed = Math.min(i.jobs, Math.max(0, city.workforce - formalEmployees - (city.publicServices?.employed??0)));
  const marketEmployees = Math.min(i.employed, marketJobs);
  i.output = Math.round(Math.max(0, i.employed - marketEmployees) * 40000 * (0.4 + city.purchasingPower / 150) + marketOutput * marketEmployees / Math.max(1, marketJobs));
  if (i.pressureDays >= 30 && city.tick % 15 === 0) {
    const candidate = city.tiles.map((t, tileId) => ({ tileId, score: informalSuitability(city, t) })).filter(c => c.score >= 45).sort((a, b) => b.score - a.score || a.tileId - b.tileId)[0];
    if (candidate && city.tiles.filter(t => t.building && t.building.constructionState !== 'complete').length < 3) {
      const t = city.tiles[candidate.tileId]; t.zone = 'residential'; t.terrain = 'land';
      t.building = createBuilding('residential', candidate.tileId, city.seed, city.tick);
      t.building.tenure = 'informal'; t.building.maximumOccupancy = 180;
      feedEvent(city, `informal:${candidate.tileId}`, 'Households began building an informal compound after sustained housing pressure. Nearby services can help integrate it.', candidate.tileId);
      milestone(city, 'first-informal-home', 'First informal housing responded to a shortage of accessible formal homes.');
      i.pressureDays = 0;
    }
  }
  for (const t of city.tiles) if (t.building && t.building.tenure !== 'formal' && t.building.constructionState === 'complete') {
    const b = t.building, quality = Math.min(t.services.powerReliability, t.services.waterReliability, t.services.drainageQuality);
    if (quality >= 65 && t.services.floodDepth < 12 && roadAccess(city, t)) {
      b.tenure = 'integrating'; b.integrationProgress = Math.min(100, b.integrationProgress + 1 + (localGovernance(city,t)?.effects.integration??0));
      if (b.integrationProgress === 100) { b.tenure = 'formal'; feedEvent(city, `integrated:${b.id}`, `${b.name} integrated through sustained public services and drainage.`, t.y * city.size + t.x, 'opportunity'); }
    }
  }
}
export function initializeLiving(city: City) {
  city.living = newLivingState();
  city.tiles.forEach(t => {
    const b = t.building; if (!b) return;
    b.tenure ??= 'formal'; b.integrationProgress ??= 0;
    if (b.business) {
      const biz = b.business;
      biz.lossDays ??= 0; biz.closedAt ??= b.abandoned ? city.tick : null;
      biz.reopenProgress ??= 0; biz.generation ??= 0;
    }
  });
  updateClusters(city); refreshHouseholds(city); updateLivingFeed(city, false);
}
export function updateLivingFeed(city: City, emit = true) {
  const s = city.living, next: LivingState['previous'] = {};
  for (const t of city.tiles) {
    const b = t.building; if (!b) continue;
    const id = t.y * city.size + t.x, key = `business:${b.id}`;
    if (b.business) {
      const status = b.business.closedAt !== null || b.abandoned ? 'closed' : b.openedAt === null ? 'construction' : b.floodClosed ? 'flood' : b.business.state;
      const old = s.previous[key]; next[key] = status;
      if (emit && status !== old && status !== 'construction' && status !== 'flood') {
        if (status === 'closed') feedEvent(city, `close:${b.id}`, `${b.business.name} closed after sustained poor trading.`, id, 'warning');
        else if (old === 'closed' || old === 'construction' || old === undefined) feedEvent(city, `open:${b.id}`, `${b.business.name} opened in ${city.clusters.find(c => c.tileIds.includes(id))?.name ?? 'a growing area'}.`, id, 'opportunity');
      }
      const jobsKey = `jobs:${b.id}`, previousJobs = Number(s.previous[jobsKey] ?? b.jobs); next[jobsKey] = b.jobs;
      if (emit && b.type === 'industrial' && b.jobs - previousJobs >= 15) feedEvent(city, `jobs:${b.id}`, `${b.business.name} added ${Math.round(b.jobs - previousJobs)} jobs. Commuting demand is growing.`, id, 'opportunity', 60);
    }
  }
  const conditions: [string, number, number, string, number | null][] = [
    ['traffic', city.mobility.stats.congestion, 65, 'Heavy traffic is delaying the main commuter corridors.', city.tiles.findIndex(t => t.road && t.mobility.congestion >= 65)],
    ['flood', city.infrastructure.floodedTiles, 1, 'Flooding is disrupting local roads and businesses.', city.tiles.findIndex(t => (t.road || t.building) && t.services.floodDepth >= 35)],
  ];
  for (const [key, value, threshold, text, location] of conditions) {
    next[key] = value;
    if (emit && value >= threshold && Number(s.previous[key] ?? 0) < threshold) feedEvent(city, key, text, location === -1 ? null : location, 'warning', 30);
  }
  for (const r of city.mobility.routes) {
    const key = `crowded:${r.id}`, busy = r.capacity > 0 && r.ridership / r.capacity >= 0.85;
    next[key] = busy ? 1 : 0;
    if (emit && busy && !s.previous[key]) feedEvent(city, key, `The ${r.originName} ↔ ${r.destinationName} ${r.mode} service is heavily used.`, r.path[Math.floor(r.path.length / 2)] ?? null, 'warning', 45);
  }
  const power = city.infrastructure.power.reliability; next.power = power;
  if (emit && power >= 80 && Number(s.previous.power ?? power) < 65) feedEvent(city, 'power-improved', 'Public electricity reliability improved; generator dependence can now decline.', null, 'opportunity', 60);
  for (const cluster of city.clusters) {
    const key = `neighborhood:${cluster.id}`; next[key] = cluster.tileIds.length;
    if (emit && s.previous[key] !== undefined && cluster.tileIds.length >= Number(s.previous[key]) + 2) feedEvent(city, key, `${cluster.name} is growing: ${cluster.tileIds.length} developed properties now share this neighborhood.`, cluster.tileIds[0], 'opportunity', 60);
  }
  // Keep market interest across feed refreshes; discard removed building/route references.
  for (const key of ['marketCandidate', 'marketSince']) if (s.previous[key] !== undefined) next[key] = s.previous[key];
  s.previous = next;
}
export function updateLiving(city: City) {
  if (city.tick % 5 === 0) updateMarkets(city);
  updateInformal(city);
  if (city.tick % 10 === 0) { updateClusters(city); refreshHouseholds(city); }
  updateLivingFeed(city);
  if (city.clusters.some(c => c.tileIds.length >= 8 && c.tileIds.some(id => (city.tiles[id].building?.level ?? 0) >= 4))) milestone(city, 'dense-district', 'A neighborhood has become a high-density district.');
}
