import { SAFETY } from './safety-config';
import { roadLightingDemand } from './safety';
import { maintenanceBudget } from './governance';
import { GOVERNANCE } from './governance-config';
import { ROADS } from './road-network';
import type { Building, City, Tile } from '../types/city';
import { asset, emptyServices, INFRASTRUCTURE, infrastructureState, weatherState } from './infrastructure-config';
import { clamp, isOperating, neighbourhoods, stableHash } from './world';
import { BALANCE } from './balance-config';
import { initializeGeography, refreshFloodIndicators } from './weather';

type Reach = { id: number; strength: number }[];
const reachCache = new WeakMap<City, { revision: number; reaches: Map<number, Reach> }>();
/** Older assets cost more to keep in service (parts, repairs, rehabilitation), up to a cap. */
export function assetAgeFactor(city: Pick<City, 'tick'>, builtAt: number) {
  return 1 + Math.min(BALANCE.ageing.maximum, Math.max(0, city.tick - builtAt) / 360 * BALANCE.ageing.yearlyGrowth);
}
export function maintainedCondition(condition: number, budget: number) {
  // Normal maintenance settles at good working condition, rather than making every asset fail during a long offline absence.
  const target = budget > 100 ? 100 : 92;
  if (budget >= 100) return clamp(condition + (target - condition) * 0.0015);
  // Deferred upkeep wears assets down to a condition in proportion to the upkeep still funded, rather than
  // towards zero at any shortfall: a 60% budget leaves worn, failure-prone assets; no upkeep lets them fail.
  const floor = target * budget / 100;
  return condition > floor ? Math.max(floor, clamp(condition - (0.006 + (100 - budget) * 0.001))) : clamp(condition + (floor - condition) * 0.0015);
}
function reaches(city: City) {
  const cached = reachCache.get(city);
  if (cached?.revision === city.infrastructure.revision) return cached.reaches;
  const result = new Map<number, Reach>();
  city.tiles.forEach((source, id) => {
    if (!source.infrastructure) return;
    const radius = INFRASTRUCTURE[source.infrastructure.kind].radius || 3, entries: Reach = [];
    for (let y = Math.max(0, source.y - radius); y <= Math.min(city.size - 1, source.y + radius); y++) {
      for (let x = Math.max(0, source.x - radius); x <= Math.min(city.size - 1, source.x + radius); x++) {
        const distance = Math.hypot(x - source.x, y - source.y);
        if (distance <= radius) entries.push({ id: y * city.size + x, strength: distance <= radius * 0.55 ? 1 : 1 - (distance / radius - 0.55) * 0.9 });
      }
    }
    result.set(id, entries);
  });
  reachCache.set(city, { revision: city.infrastructure.revision, reaches: result }); return result;
}
export function initializeInfrastructure(city: City, provision = true) {
  city.infrastructure = infrastructureState(); city.weather = weatherState();
  for (const t of city.tiles) {
    t.infrastructure = null; t.services = emptyServices();
    if (t.building) Object.assign(t.building, { generator: 0, privateWater: 0, privateBorehole: false, floodClosed: false });
  }
  initializeGeography(city);
  if (provision) {
    // A small starter network preserves the founding settlement. It cannot serve unlimited expansion.
    for (const [kind, x, y] of [['diesel', 11, 9], ['substation', 15, 9], ['borehole', 11, 11], ['water-tower', 15, 11]] as const) {
      const preferred = city.tiles[y * city.size + x];
      const t = !preferred.building && !preferred.road && !preferred.zone && preferred.terrain !== 'water' && preferred.terrain !== 'wetland' ? preferred :
        city.tiles.filter(t => !t.building && !t.road && !t.zone && !t.infrastructure && t.terrain !== 'water' && t.terrain !== 'wetland').sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (t) t.infrastructure = asset(kind, city.seed, t.y * city.size + t.x, city.tick);
    }
  }
  city.infrastructure.revision++; updateInfrastructure(city, false);
}
export function buildingPowerDemand(b: Building, hour: number): number {
  if (!isOperating(b)) return 0;
  const profile = b.type === 'residential' ? hour >= 18 && hour < 23 ? 1.5 : hour < 6 ? 0.6 : 0.9 : b.type === 'commercial' ? hour >= 8 && hour < 19 ? 1.3 : 0.25 : 1;
  return (b.type === 'residential' ? b.occupants * 0.0015 : b.jobs * (b.type === 'commercial' ? 0.006 : 0.012)) * (1 + (b.level - 1) * 0.13) * profile;
}
export function buildingWaterDemand(b: Building): number {
  if (!isOperating(b)) return 0;
  return (b.type === 'residential' ? b.occupants * 0.15 : b.jobs * (b.type === 'commercial' ? 0.12 : 0.6)) * (1 + (b.level - 1) * 0.1);
}
export function effectiveServices(t: Tile) {
  const b = t.building, s = t.services;
  return { power: clamp(s.powerReliability + (b?.generator ?? 0) / 100 * (100 - s.powerReliability) * 0.7),
    water: clamp(s.waterReliability + (b?.privateWater ?? 0) / 100 * (100 - s.waterReliability) * 0.7) };
}
export function densityRequirements(level: number) {
  return { power: [0, 25, 60, 75, 88][level - 1], water: [0, 30, 62, 78, 90][level - 1], drainage: [0, 0, 20, 45, 65][level - 1] };
}
export function supportsDensity(t: Tile, level: number) {
  const r = densityRequirements(level), s = t.services;
  // Private adaptations keep low-density homes/businesses viable, but cannot substitute for a high-quality public network at high levels.
  const effective = level < 3 ? effectiveServices(t) : { power: s.powerReliability, water: s.waterReliability };
  return effective.power >= r.power && effective.water >= r.water && s.drainageQuality >= r.drainage && s.floodDepth < 12 && (level < 3 || s.floodRisk < 65);
}
export function publicEvent(city: City, kind: string, text: string) {
  const infra = city.infrastructure;
  if (city.tick - (infra.lastEvents[kind] ?? -1000) < 30) return;
  infra.lastEvents[kind] = city.tick;
  infra.recentEvents.unshift({ tick: city.tick, kind, text }); infra.recentEvents = infra.recentEvents.slice(0, 60);
  city.history.unshift(`Day ${city.tick + 1}: ${text}`); city.history = city.history.slice(0, 60);
}
export function infrastructureEvents(city: City) {
  const i = city.infrastructure, alerts: string[] = [];
  if (city.weather.rainfall >= 30) {
    alerts.push('Heavy rain warning'); publicEvent(city, 'rain', `${city.weather.kind === 'extreme-rain' ? 'Extreme' : 'Heavy'} rainfall: ${city.weather.rainfall.toFixed(0)} mm/day. Check drainage in vulnerable areas.`);
  }
  if (i.power.demand > 0 && i.power.reserve < 15) {
    alerts.push('Power reserve low'); publicEvent(city, 'power', 'Power demand surge: generation reserve is below 15%. Distribution coverage also matters.');
  }
  if (i.water.demand > 0 && (i.water.production < i.water.demand * 1.1 || i.water.reliability < 45)) {
    alerts.push('Water shortage'); publicEvent(city, 'water', 'Water shortage: production or distribution is struggling to meet local demand.');
  }
  if (i.floodedTiles > 0) {
    alerts.push(`${i.floodedTiles} flooded tiles`); publicEvent(city, 'flood', `Flooding reported on ${i.floodedTiles} tiles. Roads and businesses may be temporarily inaccessible.`);
  }
  i.alerts = alerts;
}
type Substation = { covered: Reach; quality: number; capacity: number };
/**
 * Substations share the load of the tiles they jointly reach. Each tile's demand is split between the
 * operating substations covering it (by signal strength), so a second substation in a busy area adds
 * distribution capacity. Previously every substation compared its capacity with the whole local load
 * and tiles took the best single ratio, which capped dense areas no matter how many were built.
 * A tile reached by one substation is unchanged by this rule.
 */
export function distributeSubstationLoad(city: City, substations: Substation[]) {
  const reach = new Float64Array(city.tiles.length);
  for (const sub of substations) for (const e of sub.covered) reach[e.id] += e.strength;
  for (const sub of substations) {
    const load = sub.covered.reduce((sum, e) => sum + city.tiles[e.id].services.powerDemand * e.strength / Math.max(1, reach[e.id]), 0);
    const served = Math.min(1, sub.capacity / Math.max(0.01, load));
    for (const e of sub.covered) {
      const s = city.tiles[e.id].services;
      s.powerCoverage = Math.min(100, s.powerCoverage + e.strength * sub.quality * 100 * served / Math.max(1, reach[e.id]));
    }
  }
}
export function updateInfrastructure(city: City, progress = true) {
  const i = city.infrastructure, reach = reaches(city);
  let demand = 0, waterDemand = 0, supply = 0, production = 0;
  i.costs = { power: 0, water: 0, drainage: 0, roads: 0 };
  const facilities=new Map((city.publicServices?.facilities??[]).filter(f=>f.active).map(f=>[f.location,f]));
  for (const t of city.tiles) {
    const s = t.services, f=facilities.get(t.y*city.size+t.x);
    s.powerDemand = t.building ? buildingPowerDemand(t.building, city.weather.hour) * i.debug.powerMultiplier : 0;
    s.waterDemand = t.building ? buildingWaterDemand(t.building) * i.debug.waterMultiplier : 0;
    if(f){s.powerDemand+=f.powerRequired*i.debug.powerMultiplier;s.waterDemand+=f.waterRequired*i.debug.waterMultiplier;}
    if(t.road){s.powerDemand+=roadLightingDemand(city,t);i.costs.roads+=roadLightingDemand(city,t)/SAFETY.lightingMW*SAFETY.lightingMonthlyCost;}
    demand += s.powerDemand; waterDemand += s.waterDemand;
    s.powerCoverage = 0; s.waterCoverage = 0; s.drainageCapacity = 0; s.pollution = 0;
    if (t.road) {
      i.costs.roads += ROADS[t.roadClass ?? 'local'].upkeep * maintenanceBudget(city,'roads',t) / 100;
      const budget = maintenanceBudget(city,'roads',t);
      if (progress) s.roadCondition = maintainedCondition(s.roadCondition, budget);
    }
  }
  const substations: Substation[] = [];
  for (const [id, covered] of reach) {
    const t = city.tiles[id], a = t.infrastructure!, def = INFRASTRUCTURE[a.kind], budget = maintenanceBudget(city,def.group,t);
    if (progress && a.failedUntil <= city.tick) a.failedUntil = 0;
    if (progress) a.condition = maintainedCondition(a.condition, budget);
    if (progress && city.governance && !a.failedUntil && a.condition < GOVERNANCE.maintenance.failureCondition && stableHash(city.seed+city.tick,id)%1000 < GOVERNANCE.maintenance.failureChance) a.failedUntil=city.tick+GOVERNANCE.maintenance.failureDays;
    const quality = a.failedUntil > city.tick || t.services.floodDepth >= 90 && def.group !== 'drainage' ? 0 : a.condition / 100;
    const fuel = a.kind === 'diesel' ? i.fuelPrice : a.kind === 'gas' ? 0.6 + i.fuelPrice * 0.4 : 1;
    i.costs[def.group] += def.operatingCost * fuel * (0.65 + budget / 100 * 0.35) * assetAgeFactor(city, a.builtAt);
    if (a.kind === 'diesel' || a.kind === 'gas') supply += def.capacity * quality * (a.kind === 'diesel' ? clamp(1.1 - i.fuelPrice * 0.1, 0.5, 1) : 1);
    if (a.kind === 'solar') {
      const daylight = Math.max(0, Math.sin((city.weather.hour - 6) / 12 * Math.PI));
      supply += def.capacity * quality * daylight * (city.weather.kind === 'clear' ? 1 : city.weather.kind === 'cloudy' ? 0.65 : city.weather.kind === 'light-rain' ? 0.45 : 0.2);
    }
    if (a.kind === 'substation' && quality > 0) substations.push({ covered, quality, capacity: def.capacity });
    for (const e of covered) {
      const s = city.tiles[e.id].services;
      if (def.group === 'water') s.waterCoverage = Math.max(s.waterCoverage, e.strength * quality * 100);
      if (def.group === 'drainage') s.drainageCapacity += def.capacity * quality * e.strength * i.debug.drainageMultiplier;
      s.pollution += def.pollution * quality * e.strength;
    }
  }
  distributeSubstationLoad(city, substations);
  const powerRatio = Math.min(1, supply / Math.max(0.001, demand) * 0.92);
  for (const t of city.tiles) t.services.powerReliability = Math.round(t.services.powerCoverage * powerRatio * (t.services.floodDepth >= 90 ? 0.35 : t.services.floodDepth >= 35 ? 0.75 : 1));
  for (const [id] of reach) {
    const t = city.tiles[id], a = t.infrastructure!, def = INFRASTRUCTURE[a.kind];
    if (a.kind !== 'borehole' && a.kind !== 'treatment') continue;
    const quality = a.failedUntil > city.tick || t.services.floodDepth >= 90 ? 0 : a.condition / 100;
    production += def.capacity * quality * (a.kind === 'borehole' ? 0.7 + t.services.powerReliability / 100 * 0.3 : 0.4 + t.services.powerReliability / 100 * 0.6);
  }
  if (i.debug.waterUntil > city.tick) production *= 0.25;
  let deficit = Math.max(0, waterDemand - production), surplus = Math.max(0, production - waterDemand), released = 0, storage = 0;
  for (const [id] of reach) {
    const a = city.tiles[id].infrastructure!; if (a.kind !== 'water-tower') continue;
    const maximum = INFRASTRUCTURE[a.kind].capacity * a.condition / 100;
    if (progress && a.failedUntil <= city.tick && city.tiles[id].services.floodDepth < 90) {
      const out = Math.min(a.storedWater, deficit, maximum * 0.3); a.storedWater -= out; deficit -= out; released += out;
      const incoming = Math.min(surplus, maximum - a.storedWater); a.storedWater += incoming; surplus -= incoming;
    }
    storage += a.storedWater;
  }
  const delivered = production + released, waterRatio = Math.min(1, delivered / Math.max(1, waterDemand) * 0.96);
  let powerWeighted = 0, waterWeighted = 0, powerCoverage = 0, waterCoverage = 0, generator = 0, privateWater = 0, weights = 0;
  for (const t of city.tiles) {
    const s = t.services, b = t.building;
    s.waterReliability = Math.round(s.waterCoverage * waterRatio * (s.floodDepth >= 90 ? 0.4 : s.floodDepth >= 35 ? 0.8 : 1));
    if (!b || !isOperating(b)) continue;
    if (progress) {
      const wealth = b.type === 'residential' ? 0.3 + b.level * 0.12 : clamp(0.65 + b.business!.profitability / 200, 0.65, 1);
      const target = clamp((75 - s.powerReliability) * wealth * (b.type === 'industrial' ? 1.15 : 1.4));
      b.generator = Math.round(clamp(b.generator + (target > b.generator ? Math.min(2, target - b.generator) : Math.max(-1.5, target - b.generator))) * 10) / 10;
      const waterTarget = clamp((80 - s.waterReliability) * (0.7 + b.level * 0.1));
      b.privateWater = Math.round(clamp(b.privateWater + (waterTarget > b.privateWater ? Math.min(1.8, waterTarget - b.privateWater) : Math.max(-1.2, waterTarget - b.privateWater))) * 10) / 10;
      b.privateBorehole = b.privateWater >= 45 && (b.type !== 'residential' || b.level >= 2);
    }
    s.pollution += b.generator * 0.12;
    if (b.generator > 0) for (const id of neighbourhoods(city.size)[t.y * city.size + t.x]) city.tiles[id].services.pollution += b.generator * 0.015;
    const weight = Math.max(1, b.occupants + b.jobs); weights += weight;
    powerWeighted += s.powerReliability * weight; waterWeighted += s.waterReliability * weight;
    powerCoverage += s.powerCoverage * weight; waterCoverage += s.waterCoverage * weight;
    generator += b.generator * weight; privateWater += b.privateWater * weight;
  }
  i.power = { supply, demand, peakDemand: Math.max(i.power.peakDemand, demand), reserve: demand ? (supply - demand) / demand * 100 : 100,
    reliability: weights ? powerWeighted / weights : 0, coverage: weights ? powerCoverage / weights : 0, generatorDependency: weights ? generator / weights : 0 };
  i.water = { production, delivered, demand: waterDemand, coverage: weights ? waterCoverage / weights : 0, reliability: weights ? waterWeighted / weights : 0, privateDependency: weights ? privateWater / weights : 0, storage };
  if (!progress) { refreshFloodIndicators(city); infrastructureEvents(city); }
}
