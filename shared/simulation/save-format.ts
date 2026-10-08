import { initializeTransit } from './transit';
import { validTransit } from './transit-save';
import { initializeSafety } from './safety';
import { validSafety } from './safety-save';
import { initializeGovernance } from './governance';
import { validGovernance } from './governance-save';
import { initializePublicServices } from './public-services';
import { validPublicServices } from './public-service-save';
import { initializeMobility } from './mobility';
import { validMobilitySave } from './mobility-save';
import type { City } from '../types/city';
import { createBuilding, setTypology } from './buildings';
import { newEconomyState } from './engine';
import { refreshCity, updateDemand, operateBusinesses } from './economy';
import { updateClusters, updateLandValues } from './development';
import { initializeInfrastructure } from './infrastructure';
import { INFRASTRUCTURE } from './infrastructure-config';
import { initializeLiving } from './living-city';
import { validLivingSave } from './living-save';
import { missingAuthoritative, repairDerivedState } from './save-repair';

type RecordValue = Record<string, any>;
const record = (v: unknown): v is RecordValue => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (n: unknown, low = 0, high = Number.MAX_SAFE_INTEGER): n is number => typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high;
function baseValid(c: RecordValue) {
  return typeof c.name === 'string' && c.name.length <= 100 && c.size === 32 && finite(c.seed, 0, 4294967295) &&
    finite(c.tick) && Number.isInteger(c.tick) && finite(c.treasury, -Number.MAX_SAFE_INTEGER) && finite(c.lastSimulatedTimestamp) &&
    Array.isArray(c.history) && c.history.length <= 1000 && c.history.every((s: unknown) => typeof s === 'string') &&
    Array.isArray(c.tiles) && c.tiles.length === 1024 && c.tiles.every((t: unknown, id: number) => record(t) &&
      t.x === id % 32 && t.y === Math.floor(id / 32) && ['land', 'water', 'wetland', 'vegetation'].includes(t.terrain) &&
      typeof t.road === 'boolean' && [null, 'residential', 'commercial', 'industrial'].includes(t.zone) && finite(t.progress) &&
      (t.building === null || (record(t.building) && t.zone && !t.road && finite(t.building.level, 1, 5) && Number.isInteger(t.building.level) &&
        finite(t.building.age) && finite(t.building.occupants, 0, 100000) && finite(t.building.jobs, 0, 100000))));
}
function versionTwoValid(c: RecordValue) {
  const numbers = ['population', 'jobs', 'income', 'expenses', 'households', 'housingCapacity', 'occupiedHousing', 'vacantHousing', 'workforce', 'employed', 'unemployed', 'unemploymentRate', 'satisfaction', 'purchasingPower', 'averageLandValue', 'economicOutput'];
  if (!numbers.every(k => finite(c[k])) || !finite(c.growth, -1000000, 1000000) || !record(c.demand) || !record(c.taxes) ||
    !['residential', 'commercial', 'industrial'].every(k => finite(c.demand[k], 0, 100) && finite(c.taxes[k])) ||
    !record(c.counters) || !['buildingsOpened', 'businessesOpened', 'businessesClosed', 'upgrades', 'redevelopments', 'taxRevenue'].every(k => finite(c.counters[k])) ||
    !record(c.debug) || !record(c.debug.demandBoost) || !finite(c.debug.demandUntil) || !finite(c.debug.economyUntil) ||
    !['residential', 'commercial', 'industrial'].every(k => finite(c.debug.demandBoost[k], 0, 100)) ||
    !Array.isArray(c.milestones) || !c.milestones.every((s: unknown) => typeof s === 'string') ||
    !Array.isArray(c.trends) || c.trends.length > 120 || !c.trends.every((s: unknown) => record(s) && Object.values(s).every(v => finite(v))) ||
    !Array.isArray(c.developmentQueue) || c.developmentQueue.length > 24 || !c.developmentQueue.every((e: unknown) => record(e) && finite(e.tileId, 0, 1023) && Number.isInteger(e.tileId) && finite(e.score, 0, 100) && finite(e.queuedAt)) ||
    !Array.isArray(c.clusters) || !c.clusters.every((e: unknown) => record(e) && typeof e.name === 'string' && finite(e.id, 0, 1023) && finite(e.x, 0, 31) && finite(e.y, 0, 31) && finite(e.population) && Array.isArray(e.tileIds) && e.tileIds.every((id: unknown) => finite(id, 0, 1023) && Number.isInteger(id)))) return false;
  const ids = new Set<string>();
  return c.tiles.every((t: RecordValue) => {
    if (!finite(t.landValue, 0, 100) || !finite(t.attractiveness, 0, 100) || (t.clusterId !== null && !finite(t.clusterId, 0, 1023))) return false;
    const b = t.building; if (!b) return true;
    if (typeof b.id !== 'string' || ids.has(b.id) || typeof b.name !== 'string' || b.type !== t.zone || typeof b.subtype !== 'string' ||
      !finite(b.variant, 0, 4294967295) || !['site-preparation', 'construction', 'complete', 'redevelopment'].includes(b.constructionState) ||
      !finite(b.constructionProgress, 0, 100) || !(b.openedAt === null || finite(b.openedAt)) ||
      !['maximumOccupancy', 'maximumJobs', 'propertyValue', 'monthlyEconomicOutput', 'taxContribution', 'satisfaction', 'poorDays', 'redevelopmentCount'].every(k => finite(b[k])) ||
      !finite(b.occupancy, 0, 1) || !finite(b.upgradeProgress, 0, 100) || typeof b.abandoned !== 'boolean' ||
      !(b.abandonedAt === null || finite(b.abandonedAt)) || !(b.pendingLevel === null || finite(b.pendingLevel, 2, 5) && Number.isInteger(b.pendingLevel)) ||
      b.occupants > b.maximumOccupancy || b.jobs > b.maximumJobs) return false;
    ids.add(b.id);
    if (b.type === 'residential') return b.business === null;
    const business = b.business;
    return record(business) && typeof business.name === 'string' && ['opening', 'operating', 'growing', 'struggling', 'closed'].includes(business.state) &&
      ['employees', 'employeeCapacity', 'economicOutput', 'operatingCost', 'age'].every(k => finite(business[k])) && finite(business.netProfit, -Number.MAX_SAFE_INTEGER) &&
      finite(business.profitability, 0, 100) && finite(business.occupancy, 0, 1) && business.employees <= business.employeeCapacity;
  });
}
export class SaveValidationError extends Error {
  constructor(detail: string) { super(`This save is incompatible or damaged: ${detail}.`); this.name = 'SaveValidationError'; }
}
const CURRENT_VERSIONS = [5, 6, 7, 8, 9];
/** First failing check for a v5+ save, or null. Subsystems added after the save's version are skipped (they are initialized). */
function currentProblem(value: RecordValue): string | null {
  const missing = missingAuthoritative({ ...value, ...(value.version < 6 ? { publicServices: {} } : {}), ...(value.version < 7 ? { governance: {} } : {}), ...(value.version < 8 ? { safety: {} } : {}), ...(value.version < 9 ? { transit: {} } : {}) });
  if (missing) return `missing required state "${missing}"`;
  if (!baseValid(value)) return 'core city state is invalid';
  if (!versionTwoValid(value)) return 'economy or building state is invalid';
  if (!versionThreeValid(value)) return 'infrastructure or weather state is invalid';
  if (!validMobilitySave(value)) return 'mobility state is invalid';
  if (!validLivingSave(value as City)) return 'living-city state is invalid';
  if (value.version >= 6 && !validPublicServices(value as City)) return 'Public service state is invalid';
  if (value.version >= 7 && !validGovernance(value as City)) return 'Governance state is invalid';
  if (value.version >= 8 && !validSafety(value as City)) return 'Safety state is invalid';
  if (value.version >= 9 && !validTransit(value as City)) return 'Transit state is invalid';
  return null;
}
/** Pre-write check of an in-memory city: the same rules a load applies, without migration or repair. */
export function validateCityState(city: City): string | null {
  const value = city as unknown as RecordValue;
  if (typeof value.version !== 'number' || !Number.isInteger(value.version)) return 'version information is malformed';
  if (value.version !== 9) return `unexpected save version ${value.version}`;
  return currentProblem(value);
}
export interface DecodedCity { city: City; repaired: string[] }
export function decodeCity(value: unknown): City { return decodeCityWithReport(value).city; }
export function decodeCityWithReport(value: unknown): DecodedCity {
  if (record(value) && (typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1)) throw new SaveValidationError('version information is malformed');
  if (record(value) && value.version > 9) throw new SaveValidationError(`save version ${value.version} is newer than this game supports`);
  if (record(value) && CURRENT_VERSIONS.includes(value.version)) {
    if(value.version<9&&record(value.mobility)&&record(value.mobility.stats)&&record(value.mobility.stats.modes)){value.mobility.stats.modes.brt=0;for(const flow of Array.isArray(value.mobility.flows)?value.mobility.flows:[])if(record(flow)&&record(flow.modes))flow.modes.brt=0;}
    if(value.version<8){
      const p=value.publicServices;
      if(record(p)){if(record(p.funding))p.funding.police=100;if(record(p.costs))p.costs.police=0;if(record(p.stats))p.stats.police={demand:0,capacity:0,usage:0,served:0,access:0,quality:0};}
      if(Array.isArray(value.tiles))for(const t of value.tiles)if(record(t.publicServices))t.publicServices.police={access:0,served:0,quality:0,minutes:0,facilityId:null};
      if(record(value.governance)&&Array.isArray(value.governance.local))for(const l of value.governance.local)if(record(l.effects))Object.assign(l.effects,{lighting:0,prevention:0,commercialPatrol:0,hubSafety:0});
    }
    let repaired: string[] = [];
    let problem = currentProblem(value);
    if (problem && !problem.startsWith('missing required')) { repaired = repairDerivedState(value).filled; problem = currentProblem(value); }
    if (problem) throw new SaveValidationError(problem);
    if (value.version < 6) { value.version = 6; initializePublicServices(value as City); }
    if (value.version < 7) { initializeGovernance(value as City); value.version = 7; }
    if (value.version < 8) { initializeSafety(value as City); value.version = 8; }
    if (value.version < 9) { initializeTransit(value as City); value.version = 9; }
    return { city: value as City, repaired };
  }
  const city = decodeLegacyCity(value);
  city.version = 9; initializeLiving(city); initializePublicServices(city); initializeGovernance(city); initializeSafety(city); initializeTransit(city);
  city.history.unshift('Living city enabled: stable neighborhoods, activity rhythms and sampled households. Existing roads, buildings and services retained.');
  city.history = city.history.slice(0, 60);
  return { city, repaired: [] };
}
function decodeLegacyCity(value: unknown): City {
  if (!record(value) || !baseValid(value) || ![1, 2, 3, 4].includes(value.version)) throw new Error('This save is incompatible or damaged.');
  if (value.version === 4) {
    if(record(value.mobility)&&record(value.mobility.stats)&&record(value.mobility.stats.modes))value.mobility.stats.modes.brt=0;
    if(Array.isArray(value.mobility?.flows))for(const flow of value.mobility.flows)if(record(flow.modes))flow.modes.brt=0;
    if (!versionTwoValid(value) || !versionThreeValid(value) || !validMobilitySave(value)) throw new Error('This save is incompatible or damaged.');
    return value as City;
  }
  if (value.version === 3) {
    if (!versionTwoValid(value) || !versionThreeValid(value)) throw new Error('This save is incompatible or damaged.');
    value.version = 4; initializeMobility(value as City);
    value.history.unshift('Mobility enabled: existing roads remain local roads. Spatial commuting now shapes employment.');
    return value as City;
  }
  if (value.version === 2) {
    if (!versionTwoValid(value)) throw new Error('This save is incompatible or damaged.');
    value.version = 4;
    initializeInfrastructure(value as City); initializeMobility(value as City);
    initializeLiving(value as City);
    value.trends = value.trends.map((sample: RecordValue) => ({ ...sample, gridReliability: 0, waterReliability: 0, floodIncidents: 0, generatorDependency: 0, peakPowerDemand: 0 }));
    value.history.unshift('Infrastructure enabled: starter diesel, distribution and water services established. Expand them as your city grows.');
    refreshCity(value as City); updateDemand(value as City);
    return value as City;
  }
  // Migration consumes a parsed copy. Storage keeps the original v1 key untouched.
  const city = { ...newEconomyState(), version: 4, name: value.name, size: value.size, seed: value.seed,
    tick: value.tick, treasury: value.treasury, population: 0, jobs: 0, income: 0, expenses: 0,
    lastSimulatedTimestamp: value.lastSimulatedTimestamp, history: [...value.history], tiles: [] } as unknown as City;
  city.tiles = value.tiles.map((old: RecordValue, id: number) => {
    let building = null;
    if (old.building) {
      building = createBuilding(old.zone, id, city.seed, Math.max(0, city.tick - old.building.age), true);
      setTypology(building, old.building.level); building.age = old.building.age;
      building.occupants = old.building.occupants; building.jobs = old.building.jobs;
      building.maximumOccupancy = Math.max(building.maximumOccupancy, building.occupants);
      building.maximumJobs = Math.max(building.maximumJobs, building.jobs);
      if (building.business) { building.business.employees = building.jobs; building.business.employeeCapacity = building.maximumJobs; }
    }
    return { ...old, building, progress: 0, landValue: 22, attractiveness: 0, clusterId: null } as City['tiles'][number];
  });
  city.employed = city.tiles.reduce((s, t) => s + (t.building?.jobs ?? 0), 0);
  initializeInfrastructure(city); initializeMobility(city);
  updateLandValues(city); refreshCity(city); operateBusinesses(city); refreshCity(city); updateDemand(city); updateClusters(city);
  city.history.unshift('Organic city systems enabled. Your original city layout and residents were preserved.');
  return city;
}
function versionThreeValid(c: RecordValue) {
  const i = c.infrastructure, w = c.weather;
  if (!record(i) || !record(w) || !finite(i.revision) || !finite(i.fuelPrice, 0.1, 10) ||
    !['power', 'water', 'costs', 'maintenance', 'debug', 'lastEvents'].every(k => record(i[k])) ||
    !['supply', 'demand', 'peakDemand', 'reliability', 'coverage', 'generatorDependency'].every(k => finite(i.power[k])) || !finite(i.power.reserve, -100) ||
    !['production', 'delivered', 'demand', 'reliability', 'coverage', 'privateDependency', 'storage'].every(k => finite(i.water[k])) ||
    !['power', 'water', 'drainage', 'roads'].every(k => finite(i.costs[k]) && finite(i.maintenance[k], 0, 150)) ||
    !['floodedTiles', 'floodedProperties', 'floodIncidents', 'economicLoss'].every(k => finite(i[k])) ||
    !['powerMultiplier', 'waterMultiplier', 'drainageMultiplier', 'waterUntil'].every(k => finite(i.debug[k])) ||
    !Object.values(i.lastEvents).every(v => finite(v)) || !Array.isArray(i.alerts) || !i.alerts.every((s: unknown) => typeof s === 'string') ||
    !Array.isArray(i.recentEvents) || i.recentEvents.length > 60 || !i.recentEvents.every((e: unknown) => record(e) && finite(e.tick) && typeof e.kind === 'string' && typeof e.text === 'string') ||
    !['clear', 'cloudy', 'light-rain', 'heavy-rain', 'extreme-rain'].includes(w.kind) || !['dry', 'rainy'].includes(w.season) ||
    !finite(w.rainfall, 0, 1000) || !finite(w.remaining) || !finite(w.hour, 0, 23) || !record(w.climate) ||
    !['rainyStart', 'rainyEnd', 'dryRainChance', 'wetRainChance', 'intensity'].every(k => finite(w.climate[k])) ||
    w.climate.dryRainChance > 1 || w.climate.wetRainChance > 1 || w.climate.rainyEnd > 360) return false;
  return c.tiles.every((t: RecordValue) => {
    const s = t.services, a = t.infrastructure, b = t.building;
    if (record(s) && s.roadCondition === undefined) s.roadCondition = 100;
    if (!record(s) || !['powerCoverage', 'powerReliability', 'waterCoverage', 'waterReliability', 'drainageQuality', 'floodRisk', 'roadCondition'].every(k => finite(s[k], 0, 100)) ||
      !['powerDemand', 'waterDemand', 'drainageCapacity', 'runoff', 'floodDepth', 'floodEvents', 'recovery', 'pollution', 'elevation', 'waterDistance'].every(k => finite(s[k])) ||
      !['dry', 'wet', 'waterlogged', 'minor', 'major'].includes(s.floodStage)) return false;
    if (a !== null && (!record(a) || typeof a.id !== 'string' || !(a.kind in INFRASTRUCTURE) || !finite(a.condition, 0, 100) || !finite(a.builtAt) || !finite(a.failedUntil) || !finite(a.storedWater))) return false;
    return !b || (finite(b.generator, 0, 100) && finite(b.privateWater, 0, 100) && typeof b.privateBorehole === 'boolean' && typeof b.floodClosed === 'boolean');
  });
}
