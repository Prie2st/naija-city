import { initializeTransit, previewTransitFacility, placeTransitFacility, removeTransitFacility } from './transit';
import { isTransitFacility, TRANSIT_FACILITIES, TRANSIT } from './transit-config';
import { initializeSafety, updateSafety } from './safety';
import { initializeGovernance, updateGovernance, displaceResidents } from './governance';
import { initializePublicServices, updatePublicServices, makeFacility, facilityFootprint } from './public-services';
import { PUBLIC_SERVICES, emptyPublicTile, isPublicService } from './public-service-config';
import { initializeMobility, updateMobility } from './mobility';
import { roadTool, ROADS, emptyMobilityTile } from './road-network';
import type { City, OfflineReport, Zone } from '../types/city';
import { terrainAt } from './terrain';
import { createBuilding } from './buildings';
import { labourAndMigration, operateBusinesses, refreshCity, updateDemand } from './economy';
import { developmentTick, milestone, recordHistory, updateBuildings, updateClusters, updateLandValues } from './development';
import { tileAt } from './world';
import { asset, emptyServices, INFRASTRUCTURE, isDrainage, isInfrastructure } from './infrastructure-config';
import { initializeInfrastructure, infrastructureEvents, updateInfrastructure } from './infrastructure';
import { updateFloods, updateWeather } from './weather';
import { updateNationalEconomy } from './national-economy';
import { perfNow, perfRecord } from './perf-counters';
export { tileAt, roadAccess } from './world';
export { refreshCity, updateDemand, propertyValue } from './economy';
export { attractiveness } from './development';
import type { Tool } from '../types/city';
import { initializeLiving, updateLiving, refreshHouseholds, updateLivingFeed, feedEvent } from './living-city';

export const TICK_MS = 5000;
export const COSTS: Record<Exclude<Tool, 'inspect'>, number> = { road: 250000, 'dirt-road': 80000, avenue: 800000, 'major-road': 1800000, residential: 20000, commercial: 30000, industrial: 40000, bulldoze: 50000,
  ...Object.fromEntries(Object.entries(TRANSIT_FACILITIES).map(([kind,def])=>[kind,def.cost])), ...Object.fromEntries(Object.entries(INFRASTRUCTURE).map(([kind, def]) => [kind, def.cost])), ...Object.fromEntries(Object.entries(PUBLIC_SERVICES).map(([kind,def])=>[kind,def.cost])) } as Record<Exclude<Tool, 'inspect'>, number>;
export function newEconomyState() {
  return { demand: { residential: 0, commercial: 0, industrial: 0 }, taxes: { residential: 0, commercial: 0, industrial: 0 },
    households: 0, housingCapacity: 0, occupiedHousing: 0, vacantHousing: 0, workforce: 0, employed: 120,
    unemployed: 0, unemploymentRate: 0, growth: 0, satisfaction: 60, purchasingPower: 60, averageLandValue: 22, economicOutput: 0,
    developmentQueue: [], clusters: [], counters: { buildingsOpened: 0, businessesOpened: 0, businessesClosed: 0, upgrades: 0, redevelopments: 0, taxRevenue: 0 },
    milestones: [], trends: [], debug: { demandBoost: { residential: 0, commercial: 0, industrial: 0 }, demandUntil: 0, economyUntil: 0 } };
}
export function createCity(now = Date.now(), seed = 731): City {
  const city = { version: 9, name: 'Ilu Alafia', size: 32, seed, tick: 0,
    treasury: 500000000, population: 500, jobs: 0, income: 0, expenses: 0,
    lastSimulatedTimestamp: now, tiles: [], history: ['Ilu Alafia founded. A new beginning.'], ...newEconomyState() } as unknown as City;
  for (let y = 0; y < city.size; y++) for (let x = 0; x < city.size; x++) {
    city.tiles.push({ x, y, terrain: terrainAt(x, y, seed), road: false, roadClass: null, mobility: emptyMobilityTile(), zone: null, building: null, progress: 0, landValue: 22, attractiveness: 0, clusterId: null, infrastructure: null, services: emptyServices(), publicFacility:null, publicServices:emptyPublicTile() });
  }
  for (let y = 0; y <= 20; y++) { const t = tileAt(city, 13, y)!; t.road = true; t.terrain = 'land'; }
  for (let x = 9; x <= 18; x++) { const t = tileAt(city, x, 15)!; t.road = true; t.terrain = 'land'; }
  for (const [x, y, zone] of [[12, 10, 'residential'], [14, 10, 'residential'], [12, 12, 'residential'], [14, 12, 'residential'], [12, 14, 'residential'], [14, 14, 'commercial']] as [number, number, Zone][]) {
    const t = tileAt(city, x, y)!; t.terrain = 'land'; t.zone = zone;
    t.building = createBuilding(zone, y * city.size + x, seed, 0, true);
    if (zone === 'residential') t.building.occupants = 100;
    else { t.building.jobs = 120; t.building.business!.employees = 120; }
  }
  initializeInfrastructure(city); initializeMobility(city, false); updateFloods(city);
  updateLandValues(city); refreshCity(city); operateBusinesses(city); refreshCity(city); updateDemand(city); updateClusters(city); updateMobility(city, false, true);
  initializeLiving(city); initializePublicServices(city); initializeGovernance(city); initializeSafety(city); initializeTransit(city);
  return city;
}
export interface Placement { status: 'valid' | 'invalid' | 'unchanged'; cost: number; reason: string }
export function previewTool(city: City, x: number, y: number, tool: Tool): Placement {
  const tile = tileAt(city, x, y);
  const invalid = (reason: string): Placement => ({ status: 'invalid', cost: 0, reason });
  const unchanged = (reason: string): Placement => ({ status: 'unchanged', cost: 0, reason });
  if (!tile) return invalid('Choose a tile inside the region.');
  if (tool === 'inspect') return unchanged('Explore the city.');
  if(isTransitFacility(tool))return previewTransitFacility(city,y*city.size+x,tool);
  if(city.transit?.stops.some(s=>s.tileId===y*city.size+x&&!city.tiles[s.tileId].road)&&tool!=='bulldoze')return invalid('This parcel is reserved for transit infrastructure.');
  if (tile.terrain === 'water' || tile.terrain === 'wetland') return invalid('River and wetland are protected. Choose dry land.');
  if (isPublicService(tool)) {
    const ids=facilityFootprint(city,y*city.size+x,tool);
    if(!ids.length)return invalid('The whole facility must fit inside the region.');
    if(city.publicServices.facilities.length>=128)return invalid('Facility limit reached.');
    if(ids.some(id=>{const t=city.tiles[id];return ['water','wetland'].includes(t.terrain)||t.building||t.road||t.zone||t.infrastructure||t.publicFacility;}))return invalid('Clear the entire footprint before building.');
    if(city.treasury<COSTS[tool])return invalid('Treasury too low for this facility.');
    return {status:'valid',cost:COSTS[tool],reason:`${PUBLIC_SERVICES[tool].footprint}×${PUBLIC_SERVICES[tool].footprint} site. Road access, staffing and capacity determine service.`};
  }
  if(tile.publicFacility&&tool!=='bulldoze')return invalid('This land is reserved for a public facility.');
  if (isInfrastructure(tool)) {
    if (tile.infrastructure?.kind === tool) return unchanged('Infrastructure already built.');
    if (tile.infrastructure) return invalid('Clear the existing infrastructure first.');
    if (!isDrainage(tool) && (tile.building || tile.road || tile.zone)) return invalid('Clear this tile before building a public facility.');
    if (city.treasury < COSTS[tool]) return invalid('Treasury too low for this action.');
    return { status: 'valid', cost: COSTS[tool], reason: isDrainage(tool) ? 'Add drainage serving this area.' : 'Ready to build public infrastructure.' };
  }
  const roadClass = roadTool(tool);
  if (roadClass && tile.road) {
    const current = ROADS[tile.roadClass ?? 'local'], target = ROADS[roadClass];
    if (target.cost <= current.cost) return unchanged('Choose a higher road class to upgrade.');
    const cost = target.cost - current.cost;
    return city.treasury >= cost ? { status: 'valid', cost, reason: 'Upgrade road; adjacent development is preserved.' } : invalid('Treasury too low for this upgrade.');
  }
  if (!roadClass && tool !== 'bulldoze' && tile.zone === tool) return unchanged('This zone is already painted.');
  if (tool !== 'bulldoze' && (tile.building || tile.road || tile.infrastructure && !isDrainage(tile.infrastructure.kind))) return invalid('Clear this tile before changing its use.');
  if (tool === 'bulldoze' && !tile.publicFacility && !tile.road && !tile.zone && !tile.building && !tile.infrastructure && !city.transit?.stops.some(s=>s.tileId===y*city.size+x) && !city.living.markets.some(m => m.tileId === y * city.size + x)) return unchanged('Nothing to clear.');
  const cost = COSTS[tool];
  if (city.treasury < cost) return invalid('Treasury too low for this action.');
  return { status: 'valid', cost, reason: tool === 'bulldoze' ? 'Remove this tile’s development.' : 'Ready to build.' };
}
export function applyTool(city: City, x: number, y: number, tool: Tool): string {
  if (tool === 'inspect') return '';
  const placement = previewTool(city, x, y, tool);
  if (placement.status !== 'valid') return placement.status === 'invalid' ? placement.reason : '';
  const tile = tileAt(city, x, y)!;
  const cost = placement.cost;
  if(isTransitFacility(tool)){const error=placeTransitFacility(city,y*city.size+x,tool);settle(city,'mobility');return error;}
  city.treasury -= cost;
  if(tool==='bulldoze')removeTransitFacility(city,y*city.size+x);
  const wasRoad=tile.road;
  if(isPublicService(tool)) {const f=makeFacility(city,y*city.size+x,tool);city.publicServices.facilities.push(f);feedEvent(city,`facility-open:${f.id}`,`${f.name} opened. Staffing and road access determine its actual service.`,f.location,'notice');milestone(city,`first-${tool}`,`${f.name} opened. Road access, staffing and utilities determine its service.`);for(const id of f.tiles){city.tiles[id].publicFacility=f.id;city.tiles[id].terrain='land';}}
  else if (isInfrastructure(tool)) { tile.infrastructure = asset(tool, city.seed, y * city.size + x, city.tick); }
  else if (tool === 'bulldoze') { displaceResidents(city,tile); tile.road = false; tile.roadClass = null; tile.zone = null; tile.building = null; tile.progress = 0; tile.infrastructure = null; }
  else if (roadTool(tool)) { tile.roadClass = roadTool(tool); tile.road = true; tile.services.roadCondition = 100; if(wasRoad&&city.transit)city.transit.works[y*city.size+x]=city.tick+TRANSIT.disruptionDays; tile.zone = null; tile.progress = 0; }
  else { tile.zone = tool as Zone; tile.progress = 0; }
  if(tool==='bulldoze'&&tile.publicFacility){const f=city.publicServices.facilities.find(f=>f.id===tile.publicFacility)!;for(const id of f.tiles)city.tiles[id].publicFacility=null;city.publicServices.facilities=city.publicServices.facilities.filter(a=>a.id!==f.id);for(const fire of city.publicServices.fires)if(fire.stationId===f.id)fire.stationId=null;}
  city.publicServices.revision++;
  if (tool === 'bulldoze' || tile.publicFacility || tile.road || tile.infrastructure && !isDrainage(tile.infrastructure.kind) || tile.zone === 'residential' || tile.zone === 'industrial') {
    const occupied=new Set(city.publicServices.facilities.find(f=>f.id===tile.publicFacility)?.tiles??[y*city.size+x]);
    const removed = city.living.markets.filter(m => occupied.has(m.tileId));
    city.living.markets = city.living.markets.filter(m => !occupied.has(m.tileId));
    city.living.informal.jobs = Math.max(0, city.living.informal.jobs - removed.reduce((sum,m)=>sum+m.jobs,0));
    city.living.informal.output = Math.max(0, city.living.informal.output - removed.reduce((sum,m)=>sum+m.output,0));
  }
  tile.terrain = 'land';
  city.infrastructure.revision++;
  city.developmentQueue = city.developmentQueue.filter(entry => entry.tileId !== y * city.size + x);
  settle(city, 'full');
  return '';
}
// Tool batches. A drag paints many tiles; each tile's own change (validation, cost and
// tile state) applies at once so it can be drawn, but the city-wide recompute below runs
// once when the batch ends instead of once per tile. step() settles a pending batch first.
type Pending = 'mobility' | 'full';
const batches = new WeakMap<City, { depth: number; pending: Pending | null }>();
function settle(city: City, scope: Pending) {
  const batch = batches.get(city);
  if (batch) { if (batch.pending !== 'full') batch.pending = scope; return; }
  recompute(city, scope);
}
function recompute(city: City, scope: Pending) {
  const started = perfNow();
  if (scope === 'mobility') { updateMobility(city, false, true); refreshCity(city); }
  else {
    updateInfrastructure(city, false); updatePublicServices(city,false); updateMobility(city, false, true); refreshCity(city); updateDemand(city);
    updateSafety(city,false); updateClusters(city); refreshHouseholds(city); updateLivingFeed(city, false);
  }
  perfRecord('tool-recompute', perfNow() - started);
}
/** Start (or nest) a batch of tool applications; pair with endToolBatch. */
export function beginToolBatch(city: City) {
  const batch = batches.get(city) ?? { depth: 0, pending: null }; batch.depth++; batches.set(city, batch);
}
/** Close a batch; the outermost close runs the deferred recompute once. Returns whether it ran. */
export function endToolBatch(city: City) {
  const batch = batches.get(city); if (!batch || --batch.depth > 0) return false;
  batches.delete(city); if (batch.pending) recompute(city, batch.pending);
  return batch.pending !== null;
}
/** Run any deferred recompute now, keeping the batch open (before a tick or a save). */
export function settleToolBatch(city: City) {
  const batch = batches.get(city); if (!batch?.pending) return false;
  const scope = batch.pending; batch.pending = null; recompute(city, scope); return true;
}
export function toolBatchOpen(city: City) { return batches.has(city); }
/** Apply one tool to many tiles with a single recompute. Returns the first error. */
export function applyToolBatch(city: City, tiles: { x: number; y: number }[], tool: Tool): string {
  beginToolBatch(city); let error = '';
  try { for (const t of tiles) { const e = applyTool(city, t.x, t.y, tool); error ||= e; } } finally { endToolBatch(city); }
  return error;
}

/** One simulated day. Offline coarse replay may skip or force the mobility evaluation; active play always uses 'normal'. */
export function step(city: City, mobility: 'normal' | 'skip' | 'force' = 'normal') {
  settleToolBatch(city);
  const started = perfNow(), previousPopulation = city.population;
  city.tick++;
  updateGovernance(city); updateNationalEconomy(city);
  updateWeather(city); updateInfrastructure(city); updateFloods(city);
  refreshCity(city); if (mobility !== 'skip') updateMobility(city, true, mobility === 'force'); labourAndMigration(city); updatePublicServices(city); updateSafety(city); refreshCity(city); updateDemand(city); operateBusinesses(city);
  if (city.tick % 5 === 0) updateLandValues(city);
  updateBuildings(city); developmentTick(city); refreshCity(city);
  updateLiving(city); refreshCity(city);
  city.growth = city.population - previousPopulation;
  updateDemand(city);
  city.treasury += (city.income - city.expenses) / 30;
  city.counters.taxRevenue += city.income / 30;
  recordHistory(city);
  infrastructureEvents(city);
  perfRecord('sim-day', perfNow() - started);
}
export function advance(city: City, ticks: number) {
  for (let i = 0; i < Math.max(0, Math.floor(ticks)); i++) step(city);
}
// Offline replay. Short absences replay every day exactly as active play. Longer
// absences become progressively coarser so a large city never blocks for minutes:
//   exact      every day, identical to active play;
//   coarse     every day, but the commuting/transit network (the dominant cost,
//              ~88% of a large city's day) is re-evaluated every 15 days;
//   aggregate  the remaining days are spread over at most 24 evaluated days,
//              aligned to month ends. Skipped days carry the daily budget balance
//              and tax revenue forward; growth, services, safety and governance
//              advance at each evaluated day. No per-day events are generated.
// The plan depends only on the city and the absence, so replay stays deterministic.
export const OFFLINE = {
  maxTicks: 17280, mobilityEvery: 15, macroSteps: 24, macroMobilityEvery: 3, yieldEvery: 64, yieldMs: 40,
  // Active load (residents + jobs) decides how many days can be afforded exactly.
  tiers: [{ load: 5000, exact: 360, coarse: 240 }, { load: 50000, exact: 120, coarse: 120 }, { load: 150000, exact: 40, coarse: 90 }, { load: Infinity, exact: 10, coarse: 60 }],
};
export interface OfflinePlan { ticks: number; exact: number; coarse: number; aggregate: number; macroSteps: number }
export function planOffline(city: City, ticks: number): OfflinePlan {
  const load = city.population + city.jobs, tier = OFFLINE.tiers.find(t => load < t.load)!;
  const exact = Math.min(ticks, tier.exact), coarse = Math.min(ticks - exact, tier.coarse), aggregate = ticks - exact - coarse;
  return { ticks, exact, coarse, aggregate, macroSteps: aggregate ? Math.min(OFFLINE.macroSteps, Math.ceil(aggregate / 30)) : 0 };
}
/** Carries skipped days' daily balance and tax revenue forward without simulating them. */
function skipDays(city: City, days: number) {
  if (days <= 0) return;
  city.tick += days;
  city.treasury += days * (city.income - city.expenses) / 30;
  city.counters.taxRevenue += days * city.income / 30;
}
/** Yields the number of days completed after each unit of offline work. */
function* offlineWork(city: City, plan: OfflinePlan): Generator<number> {
  let done = 0;
  for (let i = 0; i < plan.exact; i++) { step(city); yield ++done; }
  for (let i = 0; i < plan.coarse; i++) {
    const last = i === plan.coarse - 1 && !plan.aggregate;
    step(city, last ? 'force' : (city.tick + 1) % OFFLINE.mobilityEvery === 0 ? 'normal' : 'skip'); yield ++done;
  }
  if (!plan.aggregate) return;
  const start = city.tick, end = start + plan.aggregate;
  for (let j = 1; j <= plan.macroSteps; j++) {
    const target = j === plan.macroSteps ? end : Math.floor((start + plan.aggregate * j / plan.macroSteps) / 30) * 30;
    if (target <= city.tick) continue;
    const skipped = target - city.tick - 1;
    skipDays(city, skipped);
    step(city, j % OFFLINE.macroMobilityEvery === 0 || j === plan.macroSteps ? 'force' : 'skip');
    done += skipped + 1; yield done;
  }
}
export function catchUp(city: City, now: number): OfflineReport {
  const report = offlineStart(city, now);
  for (const _ of offlineWork(city, report.plan)) { /* run to completion */ }
  return offlineFinish(city, now, report);
}
/** Transit conditions worth reporting after time away: disruptions and the busiest hub. */
function transitAwaySummary(city: City) {
  const hubs = city.transit.stops.filter(s => s.kind === 'bus-terminal' || s.kind === 'transport-interchange' || s.kind === 'brt-station').sort((a, b) => b.crowding - a.crowding);
  return { transitDisruptedAfter: city.transit.routes.filter(r => r.status === 'disrupted' || r.status === 'no-depot').length, transitBusiestHub: hubs[0]?.name ?? '', transitHubLoadAfter: (hubs[0]?.crowding ?? 0) * 100 };
}
function offlineStart(city: City, now: number) {
  const awayMs = Math.max(0, now - city.lastSimulatedTimestamp);
  const ticks = Math.min(OFFLINE.maxTicks, Math.floor(awayMs / TICK_MS)), plan = planOffline(city, ticks);
  const populationBefore = city.population, treasury = city.treasury, previous = { ...city.counters }, history = new Set(city.history);
  const gridBefore = city.infrastructure.power.reliability, waterBefore = city.infrastructure.water.reliability;
  const floods = city.infrastructure.floodIncidents, properties = city.infrastructure.floodedProperties, losses = city.infrastructure.economicLoss;
  const commuteBefore = city.mobility.stats.averageCommute, congestionBefore = city.mobility.stats.congestion, routesBefore = city.mobility.routes.length;
  return { transitRecoveryBefore:city.transit.finance.recovery,transitBefore:city.transit.stats.ridership,transitAccessBefore:city.transit.stats.access,transitJobsBefore:city.transit.stats.jobs45,safetyBefore:city.safety.metrics.publicSafety,safetyTotal:city.safety.totalIncidents,safetySerious:city.safety.seriousIncidents,policeResponseBefore:city.safety.metrics.responseMinutes,rentBefore:city.governance.housing.averageRent,affordabilityBefore:city.governance.housing.affordability,educationBefore:city.publicServices.stats.education.served/Math.max(1,city.publicServices.stats.education.demand)*100,healthcareBefore:city.publicServices.stats.healthcare.served/Math.max(1,city.publicServices.stats.healthcare.demand)*100,wasteBefore:city.publicServices.waste.backlog,qolBefore:city.publicServices.qualityOfLife,firesBefore:city.publicServices.containedFires,commuteBefore, congestionBefore, routesBefore, awayMs, ticks, plan, populationBefore, treasury, previous, history, gridBefore, waterBefore, floods, properties, losses, jobsBefore: city.jobs, marketsBefore: city.living.markets.length };
}
function offlineFinish(city: City, now: number, snapshot: ReturnType<typeof offlineStart>): OfflineReport {
  const { awayMs, ticks, populationBefore, treasury, previous, history, gridBefore, waterBefore, floods, properties, losses } = snapshot;
  city.lastSimulatedTimestamp = Math.max(city.lastSimulatedTimestamp, now);
  return { ...transitAwaySummary(city),transitRecoveryBefore:snapshot.transitRecoveryBefore,transitRecoveryAfter:city.transit.finance.recovery,transitBefore:snapshot.transitBefore,transitAfter:city.transit.stats.ridership,transitAccessBefore:snapshot.transitAccessBefore,transitAccessAfter:city.transit.stats.access,transitJobsBefore:snapshot.transitJobsBefore,transitJobsAfter:city.transit.stats.jobs45,safetyBefore:snapshot.safetyBefore,safetyAfter:city.safety.metrics.publicSafety,safetyIncidents:city.safety.totalIncidents-snapshot.safetyTotal,seriousSafetyIncidents:city.safety.seriousIncidents-snapshot.safetySerious,policeResponseBefore:snapshot.policeResponseBefore,policeResponseAfter:city.safety.metrics.responseMinutes,rentBefore:snapshot.rentBefore,rentAfter:city.governance.housing.averageRent,affordabilityBefore:snapshot.affordabilityBefore,affordabilityAfter:city.governance.housing.affordability,displacedResidents:city.governance.housing.displacedResidents,educationBefore:snapshot.educationBefore,educationAfter:city.publicServices.stats.education.served/Math.max(1,city.publicServices.stats.education.demand)*100,healthcareBefore:snapshot.healthcareBefore,healthcareAfter:city.publicServices.stats.healthcare.served/Math.max(1,city.publicServices.stats.healthcare.demand)*100,wasteBefore:snapshot.wasteBefore,wasteAfter:city.publicServices.waste.backlog,qolBefore:snapshot.qolBefore,qolAfter:city.publicServices.qualityOfLife,firesContained:city.publicServices.containedFires-snapshot.firesBefore,commuteBefore: snapshot.commuteBefore, commuteAfter: city.mobility.stats.averageCommute, congestionBefore: snapshot.congestionBefore, congestionAfter: city.mobility.stats.congestion, routesBefore: snapshot.routesBefore, routesAfter: city.mobility.routes.length, ticks, exactDays: snapshot.plan.exact, awayMs, simulatedMs: ticks * TICK_MS, populationBefore, populationAfter: city.population, population: city.population - populationBefore,
    revenue: city.treasury - treasury, taxRevenue: city.counters.taxRevenue - previous.taxRevenue,
    buildingsOpened: city.counters.buildingsOpened - previous.buildingsOpened,
    businessesOpened: city.counters.businessesOpened - previous.businessesOpened,
    businessesClosed: city.counters.businessesClosed - previous.businessesClosed,
    upgrades: city.counters.upgrades - previous.upgrades,
    events: [...city.history.filter(entry => !history.has(entry)), ...city.living.feed.filter(e => e.tick > city.tick - ticks).map(e => e.text)].slice(0, 10), jobsBefore: snapshot.jobsBefore, jobsAfter: city.jobs, marketsBefore: snapshot.marketsBefore, marketsAfter: city.living.markets.length, gridBefore, gridAfter: city.infrastructure.power.reliability,
    waterBefore, waterAfter: city.infrastructure.water.reliability, floodIncidents: city.infrastructure.floodIncidents - floods,
    floodProperties: city.infrastructure.floodedProperties - properties, economicLoss: city.infrastructure.economicLoss - losses };
}
export async function catchUpInChunks(city: City, now: number, yieldTick: (completed: number, total: number) => Promise<void>): Promise<OfflineReport> {
  const snapshot = offlineStart(city, now);
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let lastYield = clock(), lastYieldDone = 0;
  for (const done of offlineWork(city, snapshot.plan)) {
    if (done < snapshot.ticks && (done - lastYieldDone >= OFFLINE.yieldEvery || clock() - lastYield >= OFFLINE.yieldMs)) {
      await yieldTick(done, snapshot.ticks); lastYield = clock(); lastYieldDone = done;
    }
  }
  return offlineFinish(city, now, snapshot);
}
