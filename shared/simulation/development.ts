import { safetyAt } from './safety';
import { localGovernance, taxPressure } from './governance';
import { localServiceEffect } from './public-services';
import type { Building, City, DevelopmentCluster, Tile } from '../types/city';
import { createBuilding, setTypology } from './buildings';
import { clamp, isOperating, neighbourhoods, roadAccess, stableHash } from './world';
import { effectiveServices, supportsDensity } from './infrastructure';
import { isDrainage } from './infrastructure-config';
import { frontageEffect, ROADS } from './road-network';

export interface DevelopmentFactor { label: string; value: number }
export interface Attractiveness { score: number; eligible: boolean; factors: DevelopmentFactor[]; reason: string }
export function attractiveness(city: City, tile: Tile): Attractiveness {
  const factors: DevelopmentFactor[] = [];
  if (city.transit?.stops.some(s=>s.tileId===tile.y*city.size+tile.x) || tile.publicFacility || !tile.zone || tile.road || tile.terrain === 'water' || tile.terrain === 'wetland') return { score: 0, eligible: false, factors, reason: 'This is not a developable zoned parcel.' };
  const nearby = neighbourhoods(city.size)[tile.y * city.size + tile.x].map(id => city.tiles[id]);
  const developed = nearby.filter(t => isOperating(t.building));
  const occupied = developed.length ? developed.reduce((s, t) => s + t.building!.occupancy, 0) / developed.length : 0;
  const nearbyJobs = developed.reduce((s, t) => s + t.building!.jobs, 0);
  const industry = developed.filter(t => t.zone === 'industrial').length;
  const demand = city.demand[tile.zone];
  const road = roadAccess(city, tile);
  factors.push({ label: road ? 'Adjacent road access' : 'No adjacent road — construction cannot start', value: road ? 30 : -60 });
  factors.push({ label: `${tile.zone} demand (${demand}/100)`, value: Math.round(demand * 0.32) });
  factors.push({ label: 'Established nearby development', value: Math.min(14, developed.length * 3) });
  factors.push({ label: tile.zone === 'residential' ? 'Nearby employment' : 'Nearby customers and workforce', value: tile.zone === 'residential' ? Math.min(12, Math.round(nearbyJobs / 12)) : Math.min(12, Math.round(developed.reduce((s, t) => s + t.building!.occupants, 0) / 35)) });
  factors.push({ label: `Land value (${Math.round(tile.landValue)}/100)`, value: Math.round(tile.landValue * 0.12) });
  factors.push({ label: 'Surrounding occupancy', value: Math.round(occupied * 8) });
  if (tile.zone === 'residential') {
    if (industry) factors.push({ label: 'Nearby industrial activity', value: -Math.min(24, industry * 6) });
    if (city.vacantHousing > city.population * 0.35) factors.push({ label: 'Existing vacant housing can meet demand', value: -14 });
  } else if (city.jobs > city.workforce * 1.8) factors.push({ label: 'Existing employment capacity is underused', value: -12 });
  const service = effectiveServices(tile), s = tile.services;
  factors.push({ label: `Power reliability (${Math.round(service.power)}%, public ${s.powerReliability}%)`, value: Math.round((service.power - 35) * (tile.zone === 'industrial' ? 0.12 : 0.08)) });
  factors.push({ label: `Water reliability (${Math.round(service.water)}%, public ${s.waterReliability}%)`, value: Math.round((service.water - 35) * (tile.zone === 'industrial' ? 0.12 : 0.08)) });
  factors.push({ label: `Flood risk (${s.floodRisk}/100), ${s.floodStage}`, value: -Math.round(s.floodRisk * 0.08 + Math.min(25, s.floodDepth * 0.25)) });
  factors.push({ label: `Job accessibility (${Math.round(tile.mobility.accessibility)}%)`, value: tile.zone === 'residential' ? Math.round((tile.mobility.accessibility - 50) * 0.08) : 0 });
  factors.push({ label: 'Passing customers / transport stops', value: tile.zone === 'commercial' ? Math.min(10, Math.round(tile.mobility.footTraffic / 60)) : 0 });
  factors.push({ label: `Road congestion (${Math.round(tile.mobility.congestion)}%)`, value: -Math.round(tile.mobility.congestion * 0.06) });
  const civic=localServiceEffect(tile);factors.push({label:'Schools, healthcare and recreation',value:Math.round(civic.benefit)});factors.push({label:'Waste backlog, landfill and fire damage',value:-Math.round(civic.penalty)});
  const governance=localGovernance(city,tile);
  if(governance) {factors.push({label:'Governance policy support',value:governance.effects[tile.zone]});factors.push({label:'Tax climate',value:-Math.round(taxPressure(city,tile.zone)*8)});if(tile.zone==='residential')factors.push({label:'Housing affordability',value:Math.min(0,(governance.affordability-70)*.06)});}
  const frontage=frontageEffect(city,tile);if(frontage?.value)factors.push({label:`${ROADS[frontage.road].name} frontage`,value:frontage.value});
  factors.push({label:'Useful transit / station-area investment',value:tile.zone==='industrial'?0:city.transit?.local[tile.y*city.size+tile.x].tod??0});
  factors.push({label:'Local public safety',value:Math.min(0,((safetyAt(city,tile)?.publicSafety??75)-70)*.06)});
  const score = Math.round(clamp(factors.reduce((s, f) => s + f.value, 0)));
  const eligible = road && demand >= 18 && score >= 48 && s.floodDepth < 35 && (!tile.infrastructure || isDrainage(tile.infrastructure.kind));
  return { score, eligible, factors, reason: !road ? 'Waiting for road access.' : s.floodDepth >= 35 ? 'Floodwater blocks development until it recedes.' : demand < 18 ? 'Demand is low. Existing capacity meets the city’s needs.' : score < 48 ? 'Conditions are not attractive enough yet.' : 'Attractive parcel. Developer interest is growing.' };
}
export function updateLandValues(city: City) {
  const neighbours = neighbourhoods(city.size);
  for (let id = 0; id < city.tiles.length; id++) {
    const t = city.tiles[id];
    if (t.terrain === 'water' || t.terrain === 'wetland') { t.landValue = 0; continue; }
    let successful = 0, commerce = 0, industry = 0, abandoned = 0, vacancy = 0, density = 0;
    for (const nid of neighbours[id]) {
      const other = city.tiles[nid], b = other.building; if (!b) continue;
      if (b.abandoned) { abandoned++; continue; }
      if (!isOperating(b)) continue;
      successful += b.occupancy; vacancy += 1 - b.occupancy; density += b.level;
      if (other.zone === 'commercial') commerce += b.occupancy;
      if (other.zone === 'industrial') industry++;
    }
    const s = t.services;
    const infrastructureValue = (s.powerReliability + s.waterReliability - 100) * 0.09 + s.drainageQuality * 0.06 - s.floodRisk * 0.08 - Math.min(25, s.floodDepth * 0.15) - s.floodEvents * 0.4 - s.pollution * 0.12;
    const mobilityValue = (t.mobility.accessibility - 50) * 0.04 + Math.min(8, t.mobility.footTraffic / 100) - t.mobility.congestion * 0.06;
    const target = clamp(22 + (city.transit?.local[id].tod??0) + Math.min(0,((safetyAt(city,t)?.publicSafety??75)-70)*.055) + (t.road || roadAccess(city, t) ? 20 : -9) + Math.min(20, successful * 3) + Math.min(12, commerce * 5) + Math.min(10, density * 0.8) - industry * 4 - abandoned * 7 - vacancy * 2 + infrastructureValue + mobilityValue + localServiceEffect(t).benefit - localServiceEffect(t).penalty + ((localGovernance(city,t)?.environment??60)-60)*.06 + (frontageEffect(city,t)?.value??0)*.8, 5, 95);
    t.landValue = Math.round((t.landValue * 0.7 + target * 0.3) * 10) / 10;
  }
}
export function milestone(city: City, key: string, text: string) {
  if (city.milestones.includes(key)) return;
  city.milestones.push(key); city.history.unshift(`Day ${city.tick + 1}: ${text}`); city.history = city.history.slice(0, 60);
}
export function finishConstruction(city: City, b: Building) {
  const upgrade = b.pendingLevel !== null, firstOpening = b.openedAt === null;
  if (upgrade) { setTypology(b, b.pendingLevel!); b.redevelopmentCount++; city.counters.upgrades++; }
  else if (!firstOpening) { b.redevelopmentCount++; city.counters.redevelopments++; }
  b.pendingLevel = null; b.constructionState = 'complete'; b.constructionProgress = 100;
  b.upgradeProgress = 0; b.age = 0; b.openedAt = city.tick; b.abandoned = false; b.abandonedAt = null; b.poorDays = 0;
  if (firstOpening) city.counters.buildingsOpened++;
  if (b.business) {
    b.business.state = 'opening'; b.business.age = 0;
    b.business.closedAt = null; b.business.lossDays = 0; b.business.reopenProgress = 0;
    if (!upgrade) city.counters.businessesOpened++;
    if (firstOpening) milestone(city, `first-${b.type}-business`, `First private ${b.type} business opened: ${b.business.name}.`);
  }
  if (b.level > 1) milestone(city, `level-${b.type}-${b.level}`, `First Level ${b.level} ${b.type} building: ${b.subtype}.`);
}
export function startUpgrade(b: Building) {
  if (b.level >= 5 || b.constructionState !== 'complete' || b.abandoned) return false;
  b.pendingLevel = b.level + 1; b.constructionState = 'redevelopment'; b.constructionProgress = 0; return true;
}
export function closeBuilding(city: City, b: Building) {
  if (b.abandoned) return;
  b.abandoned = true; b.abandonedAt = city.tick; b.occupants = 0; b.jobs = 0; b.occupancy = 0;
  b.taxContribution = 0; b.monthlyEconomicOutput = 0; b.pendingLevel = null; b.constructionState = 'complete';
  if (b.business) { if (b.business.closedAt === null) city.counters.businessesClosed++; b.business.closedAt = city.tick; b.business.state = 'closed'; b.business.employees = 0; b.business.occupancy = 0; b.business.economicOutput = 0; }
  milestone(city, 'first-abandoned', `First abandoned property: ${b.name}. Recovery remains possible.`);
}
export function updateBuildings(city: City) {
  let active = city.tiles.filter(t => t.building && t.building.constructionState !== 'complete').length;
  for (const t of city.tiles) {
    const b = t.building; if (!b) continue;
    if (b.constructionState !== 'complete') {
      if (!roadAccess(city, t)) continue;
      const duration = b.pendingLevel ? 8 + b.pendingLevel * 3 : b.type === 'industrial' ? 12 : 9;
      b.constructionProgress = Math.min(100, b.constructionProgress + 100 / duration);
      if (b.constructionState === 'site-preparation' && b.constructionProgress >= 25) b.constructionState = 'construction';
      if (b.constructionProgress >= 99.999) { finishConstruction(city, b); active--; }
      continue;
    }
    b.age++;
    if (b.abandoned) {
      if (active < 3 && city.tick - (b.abandonedAt ?? city.tick) >= 30 && city.demand[b.type] >= 30 && roadAccess(city, t) && t.landValue >= 25 && attractiveness(city, t).score >= 50) {
        b.constructionState = 'redevelopment'; b.constructionProgress = 0;
        active++;
      }
      continue;
    }
    // Temporary flood closure is distinct from abandonment; storms alone do not erase a business.
    const bad = !b.floodClosed && (!roadAccess(city, t) || (b.type === 'residential' ? b.occupancy < 0.1 || b.satisfaction < 28 : b.business!.profitability < 35 || b.occupancy < 0.08));
    b.poorDays = bad ? b.poorDays + 1 : Math.max(0, b.poorDays - 2);
    if (b.poorDays >= 90) { closeBuilding(city, b); continue; }
    const developed = neighbourhoods(city.size)[t.y * city.size + t.x].filter(id => isOperating(city.tiles[id].building)).length;
    const canUpgrade = b.tenure === 'formal' && (t.publicServices?.fireDamage??0)<15 && (b.level<3||(t.publicServices?.qualityOfLife??45)>=45) && b.level < 5 && supportsDensity(t, b.level + 1) && b.age >= 25 * b.level && b.occupancy >= 0.78 && t.landValue >= 38 + b.level * 6 && city.demand[b.type] >= 28 && developed >= 2 && (b.type === 'residential' || b.business!.closedAt === null && b.business!.profitability >= 50);
    b.upgradeProgress = clamp(b.upgradeProgress + (canUpgrade ? 2 + t.landValue / 50 + (localGovernance(city,t)?.effects.upgrade??0) : -0.5));
    if (b.upgradeProgress >= 100 && active < 3 && startUpgrade(b)) active++;
  }
}
export function developmentTick(city: City) {
  if (city.tick % 3 !== 0) return;
  const candidates: { tileId: number; score: number }[] = [];
  for (let id = 0; id < city.tiles.length; id++) {
    const t = city.tiles[id]; if (!t.zone || (t.infrastructure && !isDrainage(t.infrastructure.kind))) continue;
    const check = attractiveness(city, t); t.attractiveness = check.score;
    if (t.building) continue;
    t.progress = clamp(t.progress + (check.eligible ? 6 + check.score / 10 : -4));
    if (check.eligible && t.progress >= 30) candidates.push({ tileId: id, score: check.score });
  }
  candidates.sort((a, b) => b.score - a.score || stableHash(city.seed, a.tileId) - stableHash(city.seed, b.tileId));
  const previous = new Map(city.developmentQueue.map(entry => [entry.tileId, entry.queuedAt]));
  city.developmentQueue = candidates.slice(0, 24).map(c => ({ ...c, queuedAt: previous.get(c.tileId) ?? city.tick }));
  const active = city.tiles.filter(t => t.building && t.building.constructionState !== 'complete').length;
  // One start per evaluation and at most three active sites keeps development observable and clustered.
  if (active >= 3 || !city.developmentQueue.length) return;
  const next = city.developmentQueue.shift()!, t = city.tiles[next.tileId];
  t.building = createBuilding(t.zone!, next.tileId, city.seed, city.tick); t.terrain = 'land'; t.progress = 100;
}
export function updateClusters(city: City) {
  const old = [...city.clusters].sort((a, b) => a.id - b.id), used = new Set<number>();
  const available = new Set(city.tiles.flatMap((t, id) => isOperating(t.building) ? [id] : []));
  const neighbours = neighbourhoods(city.size), clusters: DevelopmentCluster[] = [];
  city.tiles.forEach(t => { t.clusterId = null; });
  while (available.size) {
    const first = available.values().next().value as number, tileIds: number[] = [], queue = [first]; available.delete(first);
    for (let at = 0; at < queue.length; at++) {
      const id = queue[at]; tileIds.push(id);
      for (const nid of neighbours[id]) if (available.delete(nid)) queue.push(nid);
    }
    const members = new Set(tileIds);
    const previous = old.filter(c => !used.has(c.id)).map(c => ({ c, overlap: c.tileIds.filter(tid => members.has(tid)).length })).filter(c => c.overlap > 0).sort((a, b) => b.overlap - a.overlap || a.c.id - b.c.id)[0]?.c;
    let id = previous?.id ?? Math.min(...tileIds);
    while (used.has(id)) id = (id + 1) % city.tiles.length;
    used.add(id);
    const average = (value: (t: Tile) => number) => tileIds.reduce((s, tid) => s + value(city.tiles[tid]), 0) / tileIds.length;
    const zones = (['residential', 'commercial', 'industrial'] as const).map(zone => ({ zone, count: tileIds.filter(tid => city.tiles[tid].zone === zone).length })).sort((a, b) => b.count - a.count);
    const cluster: DevelopmentCluster = { id, name: previous?.name ?? ['Unity Estate', 'Alafia Central', 'Harmony Quarter', 'Oke-Ayo', 'Riverside', 'New Market', 'Ire Gardens', 'Amani District'][stableHash(city.seed, id) % 8], tileIds,
      population: tileIds.reduce((s, tid) => s + city.tiles[tid].building!.occupants, 0),
      x: tileIds.reduce((s, tid) => s + city.tiles[tid].x, 0) / tileIds.length,
      y: tileIds.reduce((s, tid) => s + city.tiles[tid].y, 0) / tileIds.length,
      jobs: tileIds.reduce((s, tid) => s + city.tiles[tid].building!.jobs, 0), landValue: average(t => t.landValue),
      qualityOfLife: average(t=>t.publicServices?.qualityOfLife??45), satisfaction: average(t => t.building!.satisfaction), traffic: average(t => t.mobility.congestion),
      power: average(t => t.services.powerReliability), water: average(t => t.services.waterReliability), floodRisk: average(t => t.services.floodRisk), dominantZone: zones[0].zone };
    tileIds.forEach(tid => { city.tiles[tid].clusterId = id; }); clusters.push(cluster);
    if (tileIds.length >= 12) milestone(city, 'first-cluster', `${cluster.name} has emerged: ${tileIds.length} developed parcels form a neighbourhood.`);
  }
  city.clusters = clusters;
}
export function recordHistory(city: City) {
  for (const pop of [1000, 5000, 10000, 50000, 100000]) if (city.population >= pop) milestone(city, `population-${pop}`, `Population reached ${pop.toLocaleString('en-NG')}.`);
  if (city.treasury >= 1000000000) milestone(city, 'treasury-billion', 'Treasury exceeded ₦1B.');
  if (city.tick >= 30 && city.unemploymentRate > 15) milestone(city, 'unemployment-15', 'Unemployment exceeded 15%. Plan more viable employment areas.');
  if (city.tick % 30 === 0) {
    city.trends.push({ tick: city.tick, population: city.population, unemployment: city.unemploymentRate, landValue: city.averageLandValue,
      satisfaction: city.satisfaction, income: city.income, residentialDemand: city.demand.residential, commercialDemand: city.demand.commercial, industrialDemand: city.demand.industrial,
      gridReliability: city.infrastructure.power.reliability, waterReliability: city.infrastructure.water.reliability, floodIncidents: city.infrastructure.floodIncidents,
      generatorDependency: city.infrastructure.power.generatorDependency, peakPowerDemand: city.infrastructure.power.peakDemand, averageCommute: city.mobility.stats.averageCommute, congestion: city.mobility.stats.congestion, jobAccessibility: city.mobility.stats.jobAccessibility, transportRoutes: city.mobility.routes.length });
    city.trends = city.trends.slice(-120); updateClusters(city);
  }
}
