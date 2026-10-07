import { prepareTransit, finishTransit, updateTransitCityMetrics, transitChoice, boardTransit } from './transit';
import { localGovernance } from './governance';
import { facilityAnchors } from './public-service-access';
import type { City, Tile } from '../types/city';
import type { MobilityState, TravelFlow, TravelMode, TransportRoute } from '../types/mobility';
import { adjacent, emptyMobilityTile, roadAnchor, roadGraph, roadPath, roadPerformance, congestionFor, ROADS, waypointPath, invalidateRoadGraph } from './road-network';
import { clamp, isOperating } from './world';
import { INFORMAL_SERVICE, TRANSIT, TRANSIT_VEHICLES } from './transit-config';

export const MODES: TravelMode[] = ['walk', 'car', 'okada', 'keke', 'danfo', 'bus', 'brt'];
export const modeCounts = (): Record<TravelMode, number> => ({ walk: 0, car: 0, okada: 0, keke: 0, danfo: 0, bus: 0, brt: 0 });
export function newMobilityState(): MobilityState {
  return { revision: 0, lastTick: -1, sourcePopulation: -1, sourceJobs: -1, flows: [], routes: [], corridors: [], stops: [], hubs: [], jobTargets: {},
    stats: { dailyTrips: 0, averageCommute: 0, averageSpeed: 0, congestion: 0, jobAccessibility: 50, sharedCoverage: 0, sharedUsage: 0, reachableWorkers: 0, modes: modeCounts() },
    costs: { buses: 0, administration: 0, fares: 0 }, history: [], debug: { demandMultiplier: 1, loadMultiplier: 1, until: 0 } };
}
export function initializeMobility(city: City, evaluate = true) {
  city.mobility = newMobilityState();
  city.trends = city.trends.map(s => ({ ...s, averageCommute: 0, congestion: 0, jobAccessibility: 0, transportRoutes: 0 }));
  for (const t of city.tiles) { t.roadClass = t.road ? 'local' : null; t.mobility = emptyMobilityTile(); }
  if (evaluate) updateMobility(city, false, true);
}
const distance = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function areaName(city: City, tileId: number, employment: boolean) {
  const facility=city.publicServices?.facilities.find(f=>f.location===tileId);if(facility)return facility.name;
  const t = city.tiles[tileId], cluster = city.clusters.find(c => c.tileIds.includes(tileId));
  return `${cluster?.name ?? ['Unity', 'Ire', 'Alafia', 'Ayo'][(Math.floor(t.x / 4) + Math.floor(t.y / 4)) % 4]} ${employment ? t.zone === 'industrial' ? 'Works' : 'Market' : 'Homes'} (${Math.floor(t.x / 4)},${Math.floor(t.y / 4)})`;
}
interface Area { facilityId?: string; id: number; anchor: number | null; tiles: number[]; capacity: number; residents: number; wealth: number }
function areas(city: City, residential: boolean): Area[] {
  const groups = new Map<string, Area>(), graph = roadGraph(city);
  city.tiles.forEach((t, id) => {
    const b = t.building;
    if (!isOperating(b) || (b!.type === 'residential') !== residential || b!.floodClosed || b!.business?.closedAt !== null && b!.business?.closedAt !== undefined) return;
    const anchor = roadAnchor(city, id), component = anchor === null ? `isolated-${id}` : graph.components[anchor];
    const key = `${Math.floor(t.x / 4)}:${Math.floor(t.y / 4)}:${component}:${residential ? 'homes' : b!.type}`;
    let area = groups.get(key);
    if (!area) { area = { id, anchor, tiles: [], capacity: 0, residents: 0, wealth: 0 }; groups.set(key, area); }
    area.tiles.push(id); area.capacity += residential ? Math.floor(b!.occupants * 0.45) : b!.maximumJobs;
    area.residents += b!.occupants; area.wealth += t.landValue + b!.level * 8;
  });
  if(!residential) for(const f of city.publicServices?.facilities??[])if(f.active){const anchor=facilityAnchors(city,f)[0]??null;groups.set(f.id,{id:f.location,facilityId:f.id,anchor,tiles:f.tiles,capacity:f.employeesRequired,residents:0,wealth:45});}
  return [...groups.values()].map(a => ({ ...a, wealth: a.wealth / a.tiles.length })).slice(0, residential?128:256);
}
function connection(city: City, origin: Area, destination: Area) {
  const cells = distance(city.tiles[origin.id], city.tiles[destination.id]);
  if (origin.anchor !== null && destination.anchor !== null) {
    const result = roadPath(city, origin.anchor, destination.anchor);
    if (result) return { path: result.path, minutes: result.minutes + 2, distance: Math.max(0.12, (result.path.length + 1) * 0.12) };
  }
  // Nearby jobs remain walkable even without roads, but never across protected water or flooded land.
  if (cells <= 2) {
    const start = origin.id, end = destination.id, queue = [[start]], seen = new Set([start]);
    for (let i = 0; i < queue.length; i++) {
      const path = queue[i]; if (path.at(-1) === end) return { path: [], minutes: cells * 1.8 + 2, distance: cells * 0.12 };
      if (path.length > 2) continue;
      for (const next of adjacent(city, path.at(-1)!)) if (!seen.has(next) && !['water', 'wetland'].includes(city.tiles[next].terrain) && city.tiles[next].services.floodDepth < 35) { seen.add(next); queue.push([...path, next]); }
    }
  }
  return null;
}
export function chooseModes(city: City, flow: TravelFlow, wealth: number): Record<TravelMode, number> {
  const rain = city.weather.rainfall / 65, km = flow.distance, counts = modeCounts();
  if (!flow.path.length) { counts.walk = flow.trips; return counts; }
  const policy=localGovernance(city,city.tiles[flow.origin])?.effects;
  const weights: Record<TravelMode, number> = {
    walk: km <= 1.2 ? (1.2 - km) * 5 * (1 - rain * 0.7)*(1+(policy?.walking??0)) : 0,
    car: (0.2 + wealth / 80) / (1 + flow.minutes / 25), okada: (1.5 - wealth / 180) * (1 - rain * 0.6) * (1 + Math.min(0.6, flow.minutes / 50)), keke: 0, danfo: 0, bus: 0, brt: 0,
  };
  for (const route of servingRoutes(city, flow)) {
    const free = Math.max(0, route.capacity - route.ridership);
    const fare = routeFare(city, route);
    const wait = route.mode === 'bus' ? Math.max(3, route.minutes * 2 / Math.max(1, route.vehicles)) : 4;
    weights[route.mode] += Math.min(4, free / Math.max(1, flow.trips) * 4) * route.reliability / 100 * (700 / (fare + (route.minutes + wait) * 12))*(1+(policy?.transit??0));
  }
  const transit = city.transit?.routes.some(r=>!r.legacy) ? transitChoice(city,flow.origin,flow.destination) : null;
  const plannedMode = transit?.legs.some(l=>l.mode==='brt') ? 'brt' : 'bus';
  const planned = transit ? TRANSIT.baseChoice * 35 / Math.max(8, transit.cost) * (transit.legs.every(l=>(city.transit.routes.find(r=>r.id===l.routeId)?.capacity??city.mobility.routes.find(r=>r.id===l.routeId)?.capacity??0)>0)?1:0) * (1+(policy?.transit??0)) : 0;
  // Travellers compare door-to-door time: the road trip plus hailing or parking, or walking for short trips.
  const privateMinutes = flow.minutes + Math.min(TRANSIT.carAccess, TRANSIT.okadaWait), walkMinutes = km / 4 * 60;
  const alternative = km <= 1.2 ? Math.min(privateMinutes, walkMinutes) : privateMinutes;
  // Journeys slower than the alternative lose riders faster than quicker ones gain them.
  const ratio = transit ? alternative / Math.max(1, transit.minutes) : 0;
  const competitive = transit ? Math.min(TRANSIT.timeCeiling, Math.max(TRANSIT.timeFloor, ratio ** (ratio < 1 ? TRANSIT.slowerSensitivity : TRANSIT.timeSensitivity))) : 0;
  weights[plannedMode] += planned * competitive;
  const sum = Object.values(weights).reduce((s, w) => s + w, 0);
  let remaining = flow.trips;
  for (const mode of MODES.filter(m => m !== 'okada')) { counts[mode] = Math.floor(flow.trips * weights[mode] / sum); remaining -= counts[mode]; }
  counts.okada = remaining;
  let boarded = 0, overflow = 0;
  if (transit) {
    // Only the planned-network share boards the planned journey. Riders who chose an
    // existing bus service keep it, and planned overflow tries those buses next.
    boarded = boardTransit(city, flow.id, transit, Math.min(counts[plannedMode], Math.floor(flow.trips * planned * competitive / sum)), flow.purpose).riders;
    if (plannedMode === 'brt') { overflow = counts.brt - boarded; counts.brt = boarded; }
  }
  for (const mode of ['keke', 'danfo', 'bus'] as const) {
    let riders = counts[mode] - (mode===plannedMode ? boarded : 0);
    for (const route of servingRoutes(city, flow).filter(r => r.mode === mode)) { const accepted = Math.min(riders, Math.max(0, Math.floor(route.capacity - route.ridership))); route.ridership += accepted; riders -= accepted; }
    counts[mode] -= riders;
    if (transit && mode === plannedMode) overflow += riders; else counts.okada += riders;
  }
  // Travellers turned away by full planned services fall back to their own alternatives.
  const fallback = weights.car + weights.okada + weights.walk;
  if (overflow && fallback > 0) { const car = Math.floor(overflow * weights.car / fallback), walk = Math.floor(overflow * weights.walk / fallback); counts.car += car; counts.walk += walk; counts.okada += overflow - car - walk; }
  else counts.okada += overflow;
  return counts;
}
function routeFare(city: City, route: TransportRoute) {
  if (route.mode !== 'bus') return INFORMAL_SERVICE[route.mode].fare;
  return (city.transit?.routes.find(r => r.id === route.id)?.fare ?? TRANSIT_VEHICLES.bus.fare) * (1 - (city.transit?.subsidyRate ?? 0) / 100);
}
function routeServes(city: City, route: TransportRoute, flow: TravelFlow) {
  if (!route.path.length || !flow.path.length) return false;
  return route.path.some(id => distance(city.tiles[id], city.tiles[flow.origin]) <= 3) &&
    route.path.some(id => distance(city.tiles[id], city.tiles[flow.destination]) <= 3) &&
    flow.path.filter(id => route.path.includes(id)).length >= flow.path.length * 0.7;
}
function servingRoutes(city: City, flow: TravelFlow) {
  return city.mobility.routes.filter(r => !r.suspended && r.reliability > 0 && routeServes(city, r, flow));
}

function event(city: City, key: string, text: string, once = true) {
  if (once && city.milestones.includes(key)) return;
  if (once) city.milestones.push(key);
  city.history.unshift(`Day ${city.tick + 1}: ${text}`); city.history = city.history.slice(0, 60);
  city.mobility.history.unshift({ tick: city.tick, text }); city.mobility.history = city.mobility.history.slice(0, 40);
}
function routeFor(city: City, flow: TravelFlow, mode: TransportRoute['mode']): TransportRoute {
  return { id: `${mode}-${city.tick}-${flow.id}`, mode, origin: flow.origin, destination: flow.destination, originName: flow.originName, destinationName: flow.destinationName,
    waypoints: [flow.path[0], flow.path.at(-1)!], path: [...flow.path], demand: flow.trips, ridership: 0, vehicles: mode === 'bus' ? 2 : 1,
    capacity: 0, averageSpeed: 0, minutes: flow.minutes, profitability: 50, netProfit: 0, reliability: 70, congestionImpact: 0,
    age: 0, poorDays: 0, formalized: mode === 'bus', suspended: false, createdAt: city.tick };
}
export function updateMobility(city: City, progress = true, force = false) {
  const m = city.mobility;
  if (!force && city.tick % 3 !== 0 && m.lastTick >= 0 && m.sourcePopulation === city.population && m.sourceJobs === city.jobs) return;
  const elapsed = progress ? Math.max(1, Math.min(3, city.tick - m.lastTick)) : 0;
  invalidateRoadGraph(city);
  if (m.debug.until <= city.tick) { m.debug.demandMultiplier = 1; m.debug.loadMultiplier = 1; }
  for (const t of city.tiles) { const old = t.mobility.congestion; t.mobility = emptyMobilityTile(); t.mobility.congestion = old; }
  if(city.publicServices)city.publicServices.jobTargets={};
  const homes = areas(city, true), employers = areas(city, false), remaining = new Map(employers.map(a => [a.id, a.capacity]));
  const flows: TravelFlow[] = [], targets: Record<string, number> = {}; let reachableWorkers = 0, totalWorkers = 0, accessSum = 0;
  for (const home of homes) {
    totalWorkers += home.capacity;
    const destinations = employers.map(a => ({ area: a, route: connection(city, home, a) })).filter(a => a.route).sort((a, b) => a.route!.minutes - b.route!.minutes || a.area.id - b.area.id).slice(0, 8);
    let workers = home.capacity, reached = 0;
    // Allocate in rounds so nearer employers are preferred without one destination absorbing every commuter.
    for (let pass = 0; pass < 2 && workers > 0; pass++) for (const { area, route } of destinations) {
      const available = remaining.get(area.id)!;
      const allocated = Math.min(workers, available, Math.ceil(home.capacity * (pass ? 1 : 0.5) * Math.min(1, 25 / route!.minutes)));
      if (!allocated) continue;
      remaining.set(area.id, available - allocated); workers -= allocated; reached += allocated; reachableWorkers += allocated;
      if(area.facilityId) {const p=city.publicServices;p.jobTargets[area.facilityId]=(p.jobTargets[area.facilityId]??0)+allocated;}
      else for (const id of area.tiles) { const b = city.tiles[id].building!; targets[b.id] = (targets[b.id] ?? 0) + allocated * b.maximumJobs / area.capacity; }
      const id = `${home.id}-${area.id}-work`, old = flows.find(f => f.id === id);
      const trips = allocated * 2;
      if (old) old.trips += trips;
      else flows.push({ id, origin: home.id, destination: area.id, originName: areaName(city, home.id, false), destinationName: areaName(city, area.id, true), purpose: 'work', trips, ...route!, modes: modeCounts() });
    }
    const access = home.capacity ? reached / home.capacity * 100 : destinations.length ? 70 : 0;
    accessSum += access * home.capacity;
    for (const id of home.tiles) city.tiles[id].mobility.accessibility = access;
    const shops = destinations.filter(a => city.tiles[a.area.id].zone === 'commercial').slice(0, 3);
    for (const { area, route } of shops) flows.push({ id: `${home.id}-${area.id}-shopping`, origin: home.id, destination: area.id, originName: areaName(city, home.id, false), destinationName: areaName(city, area.id, true), purpose: 'shopping', trips: Math.ceil(home.residents * 0.28 / shops.length * city.purchasingPower / 75), ...route!, modes: modeCounts() });
  }
  for(const home of homes) for(const f of (city.publicServices?.facilities??[]).filter(f=>f.active&&f.served>0&&['education','healthcare','parks'].includes(f.type)).sort((a,b)=>distance(city.tiles[home.id],city.tiles[a.location])-distance(city.tiles[home.id],city.tiles[b.location])).slice(0,3)) {
    const dest=employers.find(a=>a.facilityId===f.id);if(!dest)continue;const link=connection(city,home,dest);if(!link)continue;
    const trips=Math.ceil(Math.min(home.residents*(f.type==='education'?.12:f.type==='healthcare'?.007:.035),f.served*.1));
    flows.push({id:`service-${home.id}-${f.id}`,origin:home.id,destination:f.location,originName:areaName(city,home.id,false),destinationName:f.name,purpose:'services',trips,...link,modes:modeCounts()});
  }
  for(const depot of (city.publicServices?.facilities??[]).filter(f=>f.subtype==='waste-depot'&&f.served>0)) {
    const source=employers.find(a=>a.facilityId===depot.id);if(!source)continue;
    for(const landfill of (city.publicServices?.facilities??[]).filter(f=>f.subtype==='landfill'&&f.served>0).slice(0,2)){const dest=employers.find(a=>a.facilityId===landfill.id),link=dest?connection(city,source,dest):null;if(link)flows.push({id:`waste-${depot.id}-${landfill.id}`,origin:depot.location,destination:landfill.location,originName:depot.name,destinationName:landfill.name,purpose:'delivery',trips:Math.max(1,Math.ceil(Math.min(depot.served,landfill.served)/8)),...link,modes:modeCounts()});}
  }
  const matched = reachableWorkers ? Math.min(1, city.employed / reachableWorkers) : 0;
  for (const flow of flows) flow.trips = Math.round(flow.trips * (flow.purpose === 'work' ? matched : 1) * m.debug.demandMultiplier);
  m.flows = flows.slice(0, 768); m.jobTargets = targets;
  if(city.publicServices)city.publicServices.reachableJobs=Object.values(city.publicServices.jobTargets).reduce((a,b)=>a+b,0);
  // Operating industry sends aggregate deliveries to reachable shops; no truck entity is simulated.
  for (const source of employers.filter(a => city.tiles[a.id].zone === 'industrial').slice(0, 32)) {
    for (const destination of employers.filter(a => city.tiles[a.id].zone === 'commercial').sort((a, b) => distance(city.tiles[source.id], city.tiles[a.id]) - distance(city.tiles[source.id], city.tiles[b.id])).slice(0, 2)) {
      const link = connection(city, source, destination);
      const workers = source.tiles.reduce((sum, id) => sum + city.tiles[id].building!.jobs, 0);
      if (link && workers > 0 && m.flows.length < 768) m.flows.push({ id: `${source.id}-${destination.id}-delivery`, origin: source.id, destination: destination.id, originName: areaName(city, source.id, true), destinationName: areaName(city, destination.id, true), purpose: 'delivery', trips: Math.ceil(workers * 0.08), ...link, modes: modeCounts() });
    }
  }
  const corridors = new Map<string, TravelFlow>();
  for (const f of m.flows) if (f.path.length >= 2 && f.purpose !== 'delivery') { const id = `${f.origin}-${f.destination}`; const previous = corridors.get(id); if (previous) previous.trips += f.trips; else corridors.set(id, { ...f }); }
  for (const [id, flow] of corridors) {
    let interest = m.corridors.find(c => c.id === id);
    if (!interest) { interest = { id, interest: 0, lastSeen: city.tick }; m.corridors.push(interest); }
    const mode = flow.path.length >= 8 && flow.trips >= 260 ? 'danfo' : flow.path.length <= 16 && flow.trips >= 85 ? 'keke' : null;
    interest.interest = Math.max(0, interest.interest + (mode ? elapsed : -elapsed)); interest.lastSeen = city.tick;
    const feeder = m.routes.find(r => r.mode === 'keke' && r.origin === flow.origin && r.destination === flow.destination);
    if (feeder && mode === 'danfo' && interest.interest >= 18 && progress) { feeder.mode = 'danfo'; event(city, 'first-danfo', `Growing passenger demand evolved a Keke feeder into a Danfo corridor: ${flow.originName} ↔ ${flow.destinationName}.`); }
    if (mode && interest.interest >= 9 && m.routes.length < 64 && !m.routes.some(r => (r.mode !== 'bus' && r.origin === flow.origin && r.destination === flow.destination) || (routeServes(city, r, flow) && !r.suspended && r.reliability >= 35 && (r.mode !== 'bus' || r.capacity >= flow.trips * 0.6)))) {
      const route = routeFor(city, flow, mode); m.routes.push(route);
      event(city, `first-${mode}`, `First organic ${mode === 'danfo' ? 'Danfo' : 'Keke'} corridor: ${flow.originName} ↔ ${flow.destinationName}.`);
      event(city, route.id, `Private operators opened ${flow.originName} ↔ ${flow.destinationName} (${mode}).`, false);
    }
  }
  m.corridors = m.corridors.filter(c => city.tick - c.lastSeen <= 30).sort((a, b) => b.interest - a.interest || a.id.localeCompare(b.id)).slice(0, 128);
  for (const route of m.routes) {
    const path = waypointPath(city, route.waypoints);
    if (path) { route.path = path.path; route.minutes = path.minutes + (route.formalized ? 3 : 6); }
    const demand = [...corridors.values()].filter(f => routeServes(city, route, f)).reduce((s, f) => s + f.trips, 0);
    const previousRidership = route.ridership;
    route.demand = demand; route.age += elapsed; route.ridership = 0;
    const tripCapacity = route.mode === 'keke' ? 36 : route.mode === 'danfo' ? 112 : 400;
    if (route.mode !== 'bus' && elapsed) {
      const target = Math.min(80, Math.max(1, Math.ceil(Math.max(previousRidership * 1.15, demand * 0.15) / (tripCapacity * 0.75))));
      if (route.poorDays >= 9 && route.vehicles > 1) route.vehicles--;
      route.vehicles += Math.sign(target - route.vehicles) * Math.min(2, Math.abs(target - route.vehicles));
    }
    const roadQuality = path ? route.path.reduce((s, id) => s + (100 - city.tiles[id].mobility.congestion * 0.5) * city.tiles[id].services.roadCondition / 100, 0) / route.path.length : 0;
    route.reliability = route.suspended ? 0 : clamp(roadQuality - (route.formalized ? 2 : 12) - city.weather.rainfall * 0.16);
    route.capacity = Math.floor(route.vehicles * tripCapacity * route.reliability / 100 * (route.formalized ? 1.2 : 1)*(1+route.path.reduce((s,id)=>s+(localGovernance(city,city.tiles[id])?.effects.transit??0),0)/Math.max(1,route.path.length)*.5));
    route.averageSpeed = path ? route.path.length * 0.12 / Math.max(1, route.minutes) * 60 : 0;
  }
  prepareTransit(city,progress);
  const largestRoadFlow = new Map<number, number>();
  const modeTotals = modeCounts(); let trips = 0, commute = 0, workTrips = 0;
  for (const f of m.flows) {
    const home = homes.find(h => h.id === f.origin);
    if (f.purpose === 'delivery') { f.modes = modeCounts(); f.modes.car = f.trips; }
    else f.modes = chooseModes(city, f, home?.wealth ?? 45);
    for (const mode of MODES) modeTotals[mode] += f.modes[mode];
    const walkingTime = f.distance / 4 * 60 * (1 + city.weather.rainfall / 100);
    const journey=city.transit?.demand.find(d=>d.flowId===f.id);
    const plannedTrips=journey?.passengers??0;
    const plannedTime=journey?.minutes??f.minutes;
    const sharedWait = (f.modes.keke + f.modes.danfo + f.modes.bus + f.modes.brt - plannedTrips) * 4;
    f.minutes = f.trips ? (f.modes.walk * walkingTime + (f.trips - f.modes.walk - plannedTrips) * f.minutes + plannedTrips * plannedTime + sharedWait + f.modes.car * TRANSIT.carAccess + f.modes.okada * TRANSIT.okadaWait) / f.trips : f.minutes;
    trips += f.trips; if (f.purpose === 'work') { commute += f.minutes * f.trips; workTrips += f.trips; }
    const pce = (f.purpose === 'delivery' ? f.trips * 1.5 : f.modes.car / 1.4 + f.modes.okada * 0.25) * m.debug.loadMultiplier;
    for (const id of f.path) {
      const t = city.tiles[id]; t.mobility.dailyTrips += Math.max(0,f.trips-(journey?.passengers??0)); t.mobility.vehicleFlow += pce;
      if (f.trips > (largestRoadFlow.get(id) ?? 0)) { t.mobility.majorFlow = f.id; largestRoadFlow.set(id, f.trips); }
    }
    city.tiles[f.destination].mobility.footTraffic += f.purpose === 'shopping' ? f.trips : f.modes.walk;
  }
  for (const market of city.living?.markets ?? []) {
    const t = city.tiles[market.tileId]; t.mobility.footTraffic += market.stalls * market.attraction * 0.6;
    const anchor = roadAnchor(city, market.tileId);
    if (anchor !== null && market.jobs > 0) { city.tiles[anchor].mobility.vehicleFlow += market.stalls * market.attraction * 0.15; city.tiles[anchor].mobility.dailyTrips += market.stalls * market.attraction * 0.5; }
  }
  m.costs = { buses: 0, administration: 0, fares: 0 };
  for (const route of m.routes) {
    const dailyCost = route.vehicles * (route.mode === 'keke' ? 5000 : route.mode === 'danfo' ? 14000 : 60000);
    const fare = routeFare(city, route);
    route.netProfit = route.ridership * fare - dailyCost;
    route.profitability = clamp(50 + route.netProfit / Math.max(1, dailyCost, route.ridership * fare) * 100);
    route.poorDays = route.profitability < 30 ? route.poorDays + elapsed : Math.max(0, route.poorDays - elapsed * 2);
    route.congestionImpact = route.reliability ? route.vehicles * 16 * (route.mode === 'keke' ? 0.6 : route.mode === 'danfo' ? 1 : 2.5) + route.ridership * (route.formalized ? 0.04 : 0.16) : 0;
    for (const id of route.path) { city.tiles[id].mobility.vehicleFlow += route.congestionImpact * m.debug.loadMultiplier; city.tiles[id].mobility.sharedCoverage = Math.max(city.tiles[id].mobility.sharedCoverage, route.reliability); }
    if (route.mode === 'bus' && !route.suspended) { m.costs.buses += dailyCost * 30; m.costs.fares += route.ridership * fare * 30; }
    else if (route.formalized) m.costs.administration += 40000 + route.vehicles * 3000;
  }
  for (const r of m.routes.filter(r => r.mode !== 'bus' && r.poorDays >= 30)) event(city, `closed-${r.id}`, `Weak demand closed the ${r.originName} ↔ ${r.destinationName} ${r.mode} corridor.`, false);
  m.routes = m.routes.filter(r => r.mode === 'bus' || r.poorDays < 30);
  const stops = new Map<number, { tileId: number; passengers: number; routes: string[]; designated: boolean }>();
  for (const r of m.routes) if (r.ridership && r.reliability) {
    const ids = r.path.filter((id, i) => i === 0 || i === r.path.length - 1 || (i % 5 === 0 && (r.formalized || adjacent(city, id).filter(next => city.tiles[next].road).length >= 3)));
    for (const id of ids) { const stop = stops.get(id) ?? { tileId: id, passengers: 0, routes: [], designated: false }; stop.passengers += r.ridership / Math.max(1, ids.length); stop.routes.push(r.id); stop.designated ||= r.formalized; stops.set(id, stop); }
  }
  m.stops = [...stops.values()]; m.hubs = m.stops.filter(s => s.routes.length >= 3 && s.passengers >= 180).map(s => ({ ...s, name: `${areaName(city, s.tileId, true)} Junction` }));
  if (m.hubs.length) event(city, 'first-hub', `An organic transport hub emerged at ${m.hubs[0].name}.`);
  finishTransit(city,progress);
  let speedSum = 0, congestionSum = 0, roadWeight = 0;
  for (const t of city.tiles) if (t.road) {
    const p = roadPerformance(city, t), def = ROADS[t.roadClass ?? 'local'];
    t.mobility.capacity = def.capacity; t.mobility.effectiveCapacity = p.capacity;
    t.mobility.congestion = congestionFor(t.mobility.vehicleFlow * 0.14, p.capacity);
    t.mobility.speed = p.speed * (1 - t.mobility.congestion * 0.007);
    const weight = t.mobility.dailyTrips; speedSum += t.mobility.speed * weight; congestionSum += t.mobility.congestion * weight; roadWeight += weight;
  }
  const jobsByComponent = new Map<number, number>(), workersByComponent = new Map<number, number>(), graph = roadGraph(city);
  for (const a of employers) if (a.anchor !== null) { const key = graph.components[a.anchor]; jobsByComponent.set(key, (jobsByComponent.get(key) ?? 0) + a.capacity); }
  for (const a of homes) if (a.anchor !== null) { const key = graph.components[a.anchor]; workersByComponent.set(key, (workersByComponent.get(key) ?? 0) + a.capacity); }
  for (const t of city.tiles) if (!t.road) {
    const roads = adjacent(city, t.y * city.size + t.x).map(id => city.tiles[id]).filter(r => r.road);
    t.mobility.congestion = roads.length ? roads.reduce((s, r) => s + r.mobility.congestion, 0) / roads.length : 0;
    t.mobility.sharedCoverage = roads.length ? Math.max(...roads.map(r => r.mobility.sharedCoverage)) : 0;
    const nearby = m.stops.filter(s => distance(t, city.tiles[s.tileId]) <= 2);
    t.mobility.footTraffic += nearby.reduce((s, stop) => s + stop.passengers / 4, 0);
    if (!t.building && t.zone === 'residential') { const anchor = roadAnchor(city, t.y * city.size + t.x), key = anchor === null ? -1 : graph.components[anchor], jobs = jobsByComponent.get(key) ?? 0; t.mobility.accessibility = jobs ? clamp(55 + jobs / Math.max(45, workersByComponent.get(key) ?? 0) * 40 - t.mobility.congestion * 0.3) : 0; }
    if (t.zone !== 'residential') t.mobility.accessibility = roads.length ? Math.min(100, 65 + t.mobility.sharedCoverage * 0.35 - t.mobility.congestion * 0.25) : 0;
  }
  const averageCommute = workTrips ? commute / workTrips : 0;
  m.stats = { dailyTrips: trips, averageCommute, averageSpeed: roadWeight ? speedSum / roadWeight : 0, congestion: roadWeight ? congestionSum / roadWeight : 0,
    jobAccessibility: totalWorkers ? accessSum / totalWorkers * Math.min(1, 25 / Math.max(1, averageCommute)) : 50,
    sharedCoverage: totalWorkers ? homes.reduce((sum, h) => sum + h.capacity * (h.tiles.some(id => city.tiles[id].mobility.sharedCoverage >= 35) ? 1 : 0), 0) / totalWorkers * 100 : 0, sharedUsage: trips ? (modeTotals.keke + modeTotals.danfo + modeTotals.bus + modeTotals.brt) / trips * 100 : 0, reachableWorkers, modes: modeTotals };
  if(city.transit)updateTransitCityMetrics(city,progress);
  if (m.stats.congestion >= 70) event(city, 'first-congestion', 'A major corridor has become congested. Road capacity and travel alternatives now matter.');
  if (averageCommute > 30) event(city, 'commute-30', 'Average commute exceeded 30 minutes.');
  m.lastTick = city.tick; m.sourcePopulation = city.population; m.sourceJobs = city.jobs; m.revision++;
}
export function formalizeRoute(city: City, id: string): string {
  const route = city.mobility.routes.find(r => r.id === id);
  if (!route || route.mode === 'bus' || route.formalized) return 'Choose an informal route.';
  if (route.age < 6 || route.ridership < 40) return 'This corridor needs a sustained passenger base before formalization.';
  const cost = 2000000 + route.path.length * 30000;
  if (city.treasury < cost) return 'Treasury too low to formalize this corridor.';
  city.treasury -= cost; route.formalized = true;
  event(city, 'first-formalized', `First formalized corridor: ${route.originName} ↔ ${route.destinationName}. Private operators remain.`);
  updateMobility(city, false, true); return '';
}
export function establishBus(city: City, points: number[], vehicles = 2): string {
  if (points.length < 2 || points.length > 8 || points[0] === points.at(-1)) return 'Select distinct start and end roads, with up to six waypoints.';
  if (!Number.isInteger(vehicles) || vehicles < 1 || vehicles > 40 || city.mobility.routes.length >= 64) return 'Bus fleet or route limit reached.';
  const result = waypointPath(city, points); if (!result) return 'These stops need a connected, accessible road path.';
  const cost = vehicles * 12000000 + points.length * 300000;
  if (city.treasury < cost) return 'Treasury too low for buses and designated stops.';
  const flow: TravelFlow = { id: `${points.join('-')}-${city.mobility.revision}`, origin: points[0], destination: points.at(-1)!, originName: areaName(city, points[0], false), destinationName: areaName(city, points.at(-1)!, true), purpose: 'work', trips: 0, distance: result.path.length * 0.12, ...result, modes: modeCounts() };
  const route = routeFor(city, flow, 'bus'); route.vehicles = vehicles; route.waypoints = [...points]; city.mobility.routes.push(route); city.treasury -= cost;
  event(city, 'first-bus', `First public bus service: ${route.originName} ↔ ${route.destinationName}.`);
  updateMobility(city, false, true); return '';
}
export function changeBusFleet(city: City, id: string, change: number): string {
  const r = city.mobility.routes.find(r => r.id === id && r.mode === 'bus'); if (!r) return 'Select a public bus route.';
  if (r.vehicles + change < 1 || r.vehicles + change > 40) return 'Assign between 1 and 40 buses.';
  if (change > 0 && city.treasury < change * 12000000) return 'Treasury too low for another bus.';
  if (change > 0) city.treasury -= change * 12000000;
  r.vehicles += change; updateMobility(city, false, true); return '';
}
