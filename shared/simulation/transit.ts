import { transitChallenges } from './transit-events';
import type { City } from '../types/city';
import type { TransitAccessibility, TransitDemand, TransitFacilityKind, TransitMode, TransitNetwork, TransitRoute, TransitStop } from '../types/transit';
import { adjacent, roadAnchor, roadGraph, roadPath, roadPerformance, waypointPath, invalidateRoadGraph } from './road-network';
import { TRANSIT as C, TRANSIT_COLORS, TRANSIT_FACILITIES, TRANSIT_VEHICLES } from './transit-config';
import { invalidateTransit, transitJourney, walkingReach, stopFacilityCapacity } from './transit-network';
import { clamp } from './world';
import { localGovernance } from './governance';
import { feedEvent } from './living-city';

export const emptyTransitAccess = (): TransitAccessibility => ({ access: 0, demand: 0, ridership: 0, jobs45: 0, education: 0, healthcare: 0, commerce: 0, center: 0, firstMile: 0, lastMile: 0, tod: 0, throughput: 0 });
export function newTransitState(): TransitNetwork {
  return { revision: 0, nextId: 1, lastTick: -1, stops: [], routes: [], corridors: [], junctions: {}, works: {}, demand: [], transfers: [],
    local: Array.from({ length: 1024 }, emptyTransitAccess), districts: {},
    finance: { bus: 0, brt: 0, stations: 0, terminals: 0, depots: 0, fares: 0, subsidy: 0, recovery: 0 }, subsidyRate: 0, integration: 'neutral',
    stats: { ridership: 0, access: 0, jobs45: 0, wait: 0, reliability: 0, throughput: 0, crowding: 0, depotCapacity: 0, assignedFleet: 0, profile: 'No planned network' }, history: [] };
}
function record(city: City, key: string, text: string, tileId: number | null = null) {
  if (city.milestones.includes(key)) return;
  city.milestones.push(key); city.history.unshift(`Day ${city.tick + 1}: ${text}`); city.history = city.history.slice(0, 60);
  if (city.living) feedEvent(city, `transit:${key}`, text, tileId, 'notice');
}
function makeStop(city: City, tileId: number, kind: TransitFacilityKind, legacy = false): TransitStop {
  const id = `stop-${city.transit.nextId++}`;
  return { id, name: `${TRANSIT_FACILITIES[kind].name} ${city.transit.nextId - 1}`, kind, tileId, anchor: roadAnchor(city, tileId) ?? tileId, builtAt: city.tick,
    condition: 100, capacity: TRANSIT_FACILITIES[kind].capacity, routes: [], boardings: 0, transfers: 0, demand: 0, crowding: 0, accessibility: legacy ? 100 : 0, nightSafety: 75, lighting: 0 };
}
function makeRoute(city: City, mode: TransitMode, stops: string[], vehicles: number, legacy = false): TransitRoute {
  const sequence = city.transit.nextId++, id = `transit-${sequence}`;
  return { id, name: `${mode === 'brt' ? 'BRT' : 'Bus'} ${city.transit.routes.filter(r => r.mode === mode).length + 1}`, mode, color: TRANSIT_COLORS[sequence % TRANSIT_COLORS.length], stops, path: [],
    length: 0, vehicles, availableVehicles: 0, headway: 0, capacity: 0, ridership: 0, demand: 0, speed: 0, wait: 0, minutes: 0, reliability: 0,
    operatingCost: 0, fare: TRANSIT_VEHICLES[mode].fare, revenue: 0, subsidy: 0, crowding: 0, status: 'active', createdAt: city.tick, legacy, suspended: false, deadhead: 0, segmentLoads: [] };
}
export function initializeTransit(city: City) {
  city.transit = newTransitState();
  syncLegacyTransit(city);
  city.mobility.stats.modes.brt ??= 0;
  for (const flow of city.mobility.flows) flow.modes.brt ??= 0;
}
function syncLegacyTransit(city: City) {
  // Existing services are retained as adapters, including their IDs/fleets and
  // operating rules. They are not charged for a second fleet or a new depot.
  for (const r of city.mobility.routes.filter(r => r.mode === 'bus' && !city.transit.routes.some(t => t.id === r.id))) {
    const ids: string[] = [];
    for (const tileId of r.waypoints) {
      let stop = city.transit.stops.find(s => s.tileId === tileId);
      if (!stop) { stop = makeStop(city, tileId, 'bus-stop', true); city.transit.stops.push(stop); }
      ids.push(stop.id);
    }
    const route = makeRoute(city, 'bus', ids, r.vehicles, true);route.segmentLoads=Array(Math.max(0,ids.length-1)).fill(0);route.path=[...r.path];route.ridership=r.ridership;route.demand=r.demand;route.capacity=r.capacity;route.reliability=r.reliability;route.minutes=r.minutes;route.availableVehicles=r.vehicles;route.status=r.suspended?'suspended':r.reliability>0?'active':'disrupted';route.id = r.id; route.suspended = r.suspended; city.transit.routes.push(route);
  }
}
export function previewTransitFacility(city: City, tileId: number, kind: TransitFacilityKind) {
  const t = city.tiles[tileId], def = TRANSIT_FACILITIES[kind];
  const error = !t ? 'Choose a tile inside the region.' : city.transit.stops.length >= C.stopLimit ? 'Transit facility limit reached.' : ['water', 'wetland'].includes(t.terrain) ? 'Choose dry land.' :
    city.transit.stops.some(s => s.tileId === tileId) ? 'A transit facility already occupies this tile.' :
    def.onRoad && !t.road ? 'Select an existing road for this stop or station.' :
    kind === 'brt-station' && !['avenue', 'major'].includes(t.roadClass ?? '') ? 'BRT stations require an avenue or major road.' :
    !def.onRoad && (t.building || t.road || t.zone || t.publicFacility || t.infrastructure) ? 'Choose a clear parcel beside a road.' :
    roadAnchor(city, tileId) === null ? 'This facility needs an accessible road connection.' : city.treasury < def.cost ? 'Treasury too low for this facility.' : '';
  return { status: error ? 'invalid' as const : 'valid' as const, cost: error ? 0 : def.cost, reason: error || `${def.name}; ongoing cost ₦${def.monthly.toLocaleString()}/month.` };
}
export function placeTransitFacility(city: City, tileId: number, kind: TransitFacilityKind): string {
  const check = previewTransitFacility(city, tileId, kind); if (check.status === 'invalid') return check.reason;
  city.treasury -= check.cost; city.transit.stops.push(makeStop(city, tileId, kind)); city.tiles[tileId].terrain = 'land';
  invalidateTransit(city); record(city, `first-${kind}`, `First ${TRANSIT_FACILITIES[kind].name.toLowerCase()} opened. Actual access and service determine its usefulness.`, tileId); return '';
}
function brtPath(city: City, points: number[]): number[] | null {
  const lanes = new Set(city.transit.corridors), graph = roadGraph(city), path: number[] = [];
  for (let leg = 1; leg < points.length; leg++) {
    const start = points[leg - 1], end = points[leg];
    if (!lanes.has(start) || !lanes.has(end)) return null;
    const queue = [start], parent = new Map<number, number>([[start, -1]]);
    for (let i = 0; i < queue.length && !parent.has(end); i++) for (const next of graph.neighbours[queue[i]]) if (lanes.has(next) && !parent.has(next)) { parent.set(next, queue[i]); queue.push(next); }
    if (!parent.has(end)) return null;
    const segment = [end]; while (segment[0] !== start) segment.unshift(parent.get(segment[0])!);
    path.push(...segment.slice(leg === 1 ? 0 : 1));
  }
  return path.length ? path : null;
}
export function previewTransitRoute(city: City, mode: TransitMode, ids: string[]) {
  const stops = ids.map(id => city.transit.stops.find(s => s.id === id));
  if (ids.length < 2 || ids.length > C.stopRouteLimit || new Set(ids).size !== ids.length) return { error: 'Select 2–16 distinct stops in journey order.', path: [] as number[] };
  if (stops.some(s => !s || s.kind === 'bus-depot')) return { error: 'Select passenger stops, stations, terminals or interchanges.', path: [] as number[] };
  if (mode === 'brt' && stops.some(s => s!.kind === 'bus-stop')) return { error: 'BRT requires stations, terminals or interchanges.', path: [] as number[] };
  const points = stops.map(s => roadAnchor(city, s!.tileId)); if (points.some(p => p === null)) return { error: 'A stop has no accessible road connection.', path: [] as number[] };
  const path = mode === 'brt' ? brtPath(city, points as number[]) : waypointPath(city, points as number[])?.path;
  return { error: path ? '' : mode === 'brt' ? 'Stations need one connected dedicated BRT corridor.' : 'Stops need connected, accessible roads.', path: path ?? [] };
}
export function createTransitRoute(city: City, mode: TransitMode, ids: string[], vehicles = 2): string {
  const check = previewTransitRoute(city, mode, ids); if (check.error) return check.error;
  if (city.transit.routes.length >= C.routeLimit || !Number.isInteger(vehicles) || vehicles < 1 || vehicles > C.fleetLimit) return 'Route or fleet limit reached.';
  const cost = vehicles * TRANSIT_VEHICLES[mode].cost; if (city.treasury < cost) return 'Treasury too low to purchase this fleet.';
  const r = makeRoute(city, mode, [...ids], vehicles); r.path = check.path; city.transit.routes.push(r); city.treasury -= cost;
  invalidateTransit(city); record(city, `first-formal-${mode}`, `First planned ${mode.toUpperCase()} route opened. Fleet capacity, stops and demand now determine service.`, check.path[0]); return '';
}
export function editTransitRoute(city: City, id: string, changes: Partial<Pick<TransitRoute, 'name' | 'fare' | 'vehicles' | 'stops' | 'suspended'>>): string {
  const r = city.transit.routes.find(r => r.id === id); if (!r) return 'Choose a route.';
  if (changes.name !== undefined && (!changes.name.trim() || changes.name.trim().length > 80)) return 'Use a route name of 1–80 characters.';
  if (changes.fare !== undefined && (!Number.isFinite(changes.fare) || changes.fare < 0 || changes.fare > C.fareMaximum)) return `Fare must be between ₦0 and ₦${C.fareMaximum}.`;
  if (changes.vehicles !== undefined && (!Number.isInteger(changes.vehicles) || changes.vehicles < 1 || changes.vehicles > C.fleetLimit)) return `Assign 1–${C.fleetLimit} vehicles.`;
  if (changes.stops) { if(r.legacy&&changes.stops.length>8)return 'Legacy services support up to eight ordered stops.'; const check = previewTransitRoute(city, r.mode, changes.stops); if (check.error) return check.error; }
  const extra = Math.max(0, (changes.vehicles ?? r.vehicles) - r.vehicles), cost = extra * TRANSIT_VEHICLES[r.mode].cost;
  if (city.treasury < cost) return 'Treasury too low for additional vehicles.';
  city.treasury -= cost; Object.assign(r, changes); if (changes.name) r.name = changes.name.trim();
  if (r.legacy) { const old = city.mobility.routes.find(o => o.id === id); if (old) { old.vehicles = r.vehicles; old.suspended = r.suspended;if(changes.stops)old.waypoints=changes.stops.map(id=>city.transit.stops.find(s=>s.id===id)!.anchor); } }
  invalidateTransit(city); return '';
}
export function removeTransitRoute(city: City, id: string) {
  city.transit.routes = city.transit.routes.filter(r => r.id !== id); city.mobility.routes = city.mobility.routes.filter(r => r.id !== id); invalidateTransit(city);
}
export function removeTransitFacility(city: City, tileId: number) {
  const removed = city.transit.stops.filter(s => s.tileId === tileId).map(s => s.id);
  city.transit.stops = city.transit.stops.filter(s => s.tileId !== tileId);
  for (const r of city.transit.routes) if (r.stops.some(id => removed.includes(id))) { r.stops = r.stops.filter(id => !removed.includes(id)); r.status = 'disrupted'; }
  city.transit.corridors = city.transit.corridors.filter(id => id !== tileId); delete city.transit.junctions[tileId]; delete city.transit.works[tileId]; invalidateTransit(city);
}
export function buildBrtCorridor(city: City, points: number[], remove = false): string {
  const result = waypointPath(city, points); if (!result) return 'Choose connected corridor roads.';
  if (!remove && result.path.some(id => !['avenue', 'major'].includes(city.tiles[id].roadClass ?? ''))) return 'Dedicated BRT lanes require avenues or major roads throughout.';
  const newIds = result.path.filter(id => !city.transit.corridors.includes(id));
  const cost = remove ? 0 : newIds.length * C.corridorCost;
  if (city.treasury < cost) return 'Treasury too low for the corridor.';
  city.treasury -= cost;
  city.transit.corridors = remove ? city.transit.corridors.filter(id => !result.path.includes(id)) : [...new Set([...city.transit.corridors, ...result.path])].sort((a, b) => a - b);
  if (!remove) for (const id of newIds) city.transit.works[id] = city.tick + C.disruptionDays;
  city.infrastructure.revision++; invalidateRoadGraph(city); invalidateTransit(city); return '';
}
export function improveJunction(city: City, id: number, kind: 'signal' | 'high-capacity' | 'roundabout'): string {
  if (!city.tiles[id]?.road || adjacent(city, id).filter(n => city.tiles[n].road).length < 3) return 'Select a road junction with at least three connected arms.';
  if (city.transit.junctions[id] === kind) return 'This treatment is already installed.';
  const cost = kind === 'signal' ? C.signalCost : kind === 'high-capacity' ? C.junctionCost : C.roundaboutCost;
  if (city.treasury < cost) return 'Treasury too low for this junction.';
  city.treasury -= cost; city.transit.junctions[id] = kind; city.transit.works[id] = city.tick + C.disruptionDays;
  city.infrastructure.revision++; invalidateRoadGraph(city); invalidateTransit(city); return '';
}
export function prepareTransit(city: City, progress = false) {
  syncLegacyTransit(city);
  const t = city.transit; if (!t) return;
  const elapsed = progress ? Math.max(1, Math.min(3, city.tick - t.lastTick)) : 0;
  t.demand = []; t.transfers = [];
  const stationCrowding=new Map(t.stops.map(s=>[s.id,s.crowding]));
  for (const s of t.stops) {
    s.anchor = roadAnchor(city, s.tileId) ?? s.tileId;
    s.routes = []; s.boardings = 0; s.transfers = 0; s.demand = 0; s.crowding = 0;
    s.nightSafety = city.safety?.local[s.tileId]?.nightSafety ?? 75;
    s.lighting = (city.safety?.local[s.anchor]?.lighting ?? 0) * (.75 + city.tiles[s.tileId].services.powerReliability / 400);
    s.accessibility = city.tiles[s.anchor]?.road && city.tiles[s.anchor].services.floodDepth < 35 ? clamp(70 + s.lighting * .1 - city.weather.rainfall * .2 - Math.max(0, 60 - s.nightSafety) * .2) : 0;
    if (elapsed) s.condition = clamp(s.condition - .004 * elapsed, 50, 100);
  }
  const depots = t.stops.filter(s => s.kind === 'bus-depot' && s.accessibility > 0);
  const graph=roadGraph(city), capacities=new Map<number,number>(), fleets=new Map<number,number>();
  for(const depot of depots){const component=graph.components[depot.anchor];capacities.set(component,(capacities.get(component)??0)+Math.floor(depot.capacity*depot.condition/100));}
  const componentOf=(r:TransitRoute)=>{const first=t.stops.find(s=>s.id===r.stops[0]);return first?graph.components[first.anchor]:-1;};
  t.stats.depotCapacity=[...capacities.values()].reduce((n,v)=>n+v,0);t.stats.assignedFleet=t.routes.reduce((n,r)=>n+r.vehicles,0);
  for(const r of t.routes)if(!r.legacy&&!r.suspended){const component=componentOf(r);fleets.set(component,(fleets.get(component)??0)+r.vehicles);}
  const allocation=new Map<string,number>();
  for(const r of t.routes){const component=componentOf(r);allocation.set(r.id,r.legacy?r.vehicles:r.suspended?0:Math.floor(r.vehicles*Math.min(1,(capacities.get(component)??0)/Math.max(1,fleets.get(component)??0))));}
  const spare=new Map(capacities);
  for(const r of t.routes)if(!r.legacy){const component=componentOf(r);spare.set(component,(spare.get(component)??0)-allocation.get(r.id)!);}
  for(const r of t.routes)if(!r.legacy&&!r.suspended&&allocation.get(r.id)!<r.vehicles){const component=componentOf(r);if((spare.get(component)??0)>0){allocation.set(r.id,allocation.get(r.id)!+1);spare.set(component,spare.get(component)!-1);}}
  for (const r of t.routes) {
    const previousCrowding = r.crowding;
    const old = r.legacy ? city.mobility.routes.find(o => o.id === r.id) : undefined;
    if (old) { r.vehicles = old.vehicles; r.suspended = old.suspended; }
    r.ridership = 0; r.demand = 0; r.revenue = 0; r.segmentLoads = Array(Math.max(0, r.stops.length - 1)).fill(0);
    const stops = r.stops.map(id => t.stops.find(s => s.id === id)), points = stops.map(s => s?.anchor);
    const validStops = stops.length >= 2 && stops.every(s => s && s.accessibility > 0);
    const path = validStops ? r.mode === 'brt' ? brtPath(city, points as number[]) : waypointPath(city, points as number[])?.path : null;
    r.availableVehicles = allocation.get(r.id) ?? 0;
    r.status = r.suspended ? 'suspended' : !path ? 'disrupted' : !r.availableVehicles ? 'no-depot' : 'active';
    if (path) r.path = path;
    r.length = r.path.length * .12;
    const def = TRANSIT_VEHICLES[r.mode];
    const priority = r.path.reduce((n, id) => n + (localGovernance(city, city.tiles[id])?.effects.transit ?? 0), 0) / Math.max(1, r.path.length);
    let minutes = 0, quality = 0;
    for (const id of r.path) {
      const tile = city.tiles[id], p = roadPerformance(city, tile);
      const speed = r.mode === 'brt' ? Math.min(def.speed, (tile.roadClass === 'major' ? 50 : 38) * (.65 + tile.services.roadCondition * .0035) * Math.max(.15, 1 - tile.services.floodDepth / 100) * (1 - city.weather.rainfall / 500)) : Math.min(def.speed, p.speed * (1 - tile.mobility.congestion * .007) * (1 + priority * .2));
      minutes += .12 / Math.max(2, speed) * 60;
      quality += r.mode === 'brt' ? tile.services.roadCondition * (1 - Math.min(.9, tile.services.floodDepth / 100)) : tile.services.roadCondition * (1 - tile.mobility.congestion * .005);
    }
    r.minutes = minutes + r.stops.length * (r.mode === 'brt' ? C.brtDwell : C.stopDwell);
    r.speed = r.length / Math.max(1, r.minutes) * 60;
    const qualityAverage = quality / Math.max(1, r.path.length);
    r.reliability = r.status === 'active' ? clamp(qualityAverage - city.weather.rainfall * (r.mode === 'brt' ? .05 : .12) - Math.min(12, Math.max(0, previousCrowding - 1) * 6) + priority * 8) : 0;
    const nearestDepot = depots.map(s => roadPath(city, s.anchor, r.path[0])).filter(p => p !== null).sort((a, b) => a!.minutes - b!.minutes)[0];
    r.deadhead = nearestDepot?.minutes ?? 0;
    const cycle = Math.max(8, r.minutes * 2 + 6 + r.deadhead * .1);
    if(!r.legacy&&!nearestDepot&&r.status==='active'){r.status='no-depot';r.availableVehicles=0;r.reliability=0;}
    r.headway = r.availableVehicles ? Math.max(C.minHeadway, cycle / r.availableVehicles) : C.serviceHours * 60;
    r.wait = r.headway / 2 * (1+Math.min(1,Math.max(0,...r.stops.map(id=>(stationCrowding.get(id)??0)-1))*.2)) * (1 + (100 - r.reliability) / 100 + Math.min(2, Math.max(0, previousCrowding - 1) * .25));
    r.capacity = r.status === 'active' ? Math.floor(def.passengers * C.serviceHours * 60 / r.headway * r.reliability / 100) : 0;
    r.operatingCost = r.suspended ? 0 : r.vehicles * def.dailyCost * 30 * (1 + Math.min(.15, r.deadhead / 120));
    if (old) { r.path = [...old.path]; r.capacity = old.capacity; r.reliability = old.reliability; r.minutes = old.minutes; r.status = r.stops.length<2?'disrupted':old.suspended ? 'suspended' : old.reliability > 0 ? 'active' : 'disrupted'; r.operatingCost = old.suspended ? 0 : old.vehicles * def.dailyCost * 30; }
    for (const s of stops) if (s) s.routes.push(r.id);
  }
}
export function transitChoice(city: City, origin: number, destination: number) { return transitJourney(city, origin, destination); }
export function transitAvailable(city: City, plan: Omit<TransitDemand, 'flowId' | 'passengers'>): number {
  return Math.max(0, Math.min(...plan.legs.map(l => {
    const r = city.transit.routes.find(r => r.id === l.routeId) ?? city.mobility.routes.find(r => r.id === l.routeId);
    return r ? r.capacity - r.ridership : 0;
  })));
}
export function boardTransit(city: City, flowId: string, plan: Omit<TransitDemand, 'flowId' | 'passengers'>, wanted: number) {
  const riders = Math.max(0, Math.min(Math.floor(wanted), Math.floor(transitAvailable(city, plan))));
  const count = { wanted, riders };
  for (const leg of plan.legs) {
    const r = city.transit.routes.find(r => r.id === leg.routeId);
    if (r) {
      r.demand += wanted; if (r.legacy) { const old=city.mobility.routes.find(o=>o.id===r.id);if(old)old.ridership+=riders;} r.ridership += riders;
      const from = r.stops.indexOf(leg.from), to = r.stops.indexOf(leg.to);
      for (let i = Math.min(from, to); i < Math.max(from, to); i++) if (i >= 0) r.segmentLoads[i] += riders;
    } else { const informal = city.mobility.routes.find(r => r.id === leg.routeId); if (informal) informal.ridership += riders; }
    for(const id of [leg.from,leg.to]){const stop=city.transit.stops.find(s=>s.id===id);if(stop){stop.boardings+=riders/2;stop.demand+=wanted/2;}}
  }
  if (riders) city.transit.demand.push({ flowId, passengers: riders, ...plan });
  for (let i = 1; i < plan.legs.length && riders; i++) {
    const from = plan.legs[i - 1], to = plan.legs[i], stop = city.transit.stops.find(s => s.id === to.from);
    const tileId = stop?.tileId ?? Number(to.from.split(':').at(-1));
    const previous = city.transit.transfers.find(t => t.from === from.routeId && t.to === to.routeId && t.tileId === tileId);
    if (previous) previous.passengers += riders; else city.transit.transfers.push({ from: from.routeId, to: to.routeId, tileId, passengers: riders });
    if (stop) stop.transfers += riders;
  }
  return count;
}
export function finishTransit(city: City, progress = false) {
  const t = city.transit; if (!t) return;
  const finance = { bus: 0, brt: 0, stations: 0, terminals: 0, depots: 0, fares: 0, subsidy: 0, recovery: 0 };
  for (const r of t.routes) {
    const old = r.legacy ? city.mobility.routes.find(o => o.id === r.id) : undefined;
    if (old) { const direct = Math.max(0, old.ridership-r.ridership); r.ridership = old.ridership; for(const id of r.stops){const stop=t.stops.find(s=>s.id===id);if(stop){stop.boardings+=direct/Math.max(1,r.stops.length);stop.demand+=direct/Math.max(1,r.stops.length);}} r.demand = Math.max(r.demand, old.demand * city.mobility.stats.sharedUsage / 100); }
    r.crowding = r.capacity ? Math.min(10, r.demand / r.capacity) : r.demand ? 10 : 0;
    r.revenue = r.ridership * r.fare * (1 - t.subsidyRate / 100) * 30;
    r.subsidy = Math.max(0, r.operatingCost - r.revenue);
    if (!r.legacy) { finance[r.mode] += r.operatingCost; finance.fares += r.revenue; }
    if (!r.legacy && r.status === 'active') {
      const trips = Math.max(C.busRunsMinimum, C.serviceHours * 60 / Math.max(1, r.headway)) * (r.mode === 'brt' ? C.brtPce : C.busPce);
      const stopIndices=r.stops.map(s=>t.stops.find(stop=>stop.id===s)).map(s=>s?r.path.indexOf(s.anchor):-1);
      for (const [at,id] of r.path.entries()) {
        const segment=stopIndices.findIndex((end,i)=>i>0&&at>=stopIndices[i-1]&&at<=end)-1;
        city.tiles[id].mobility.dailyTrips += r.segmentLoads[Math.max(0,segment)]??0; city.tiles[id].mobility.sharedCoverage = Math.max(city.tiles[id].mobility.sharedCoverage, r.reliability);
        // Dedicated vehicles occupy reserved space, not general vehicle lanes.
        if (r.mode !== 'brt') city.tiles[id].mobility.vehicleFlow += trips;
      }
    }
    if (progress && r.ridership >= 1000) record(city, `route-1000:${r.id}`, `${r.name} now carries at least 1,000 daily passengers.`, r.path[0]);
  }
  for (const s of t.stops) {
    const def = TRANSIT_FACILITIES[s.kind], cost = def.monthly;
    if (s.kind === 'bus-depot') finance.depots += cost; else if (s.kind === 'bus-terminal' || s.kind === 'transport-interchange') finance.terminals += cost; else finance.stations += cost;
    s.crowding = s.kind === 'bus-depot' ? 0 : Math.min(10, (s.boardings + s.transfers) / Math.max(1, stopFacilityCapacity(s)));
    if (s.kind !== 'bus-depot') {
      city.tiles[s.tileId].mobility.footTraffic += s.boardings + s.transfers;
      if (s.kind === 'bus-terminal' || s.kind === 'transport-interchange') city.tiles[s.anchor].mobility.vehicleFlow += (s.boardings + s.transfers) * .025;
    }
  }
  if(t.integration!=='neutral')finance.terminals+=city.mobility.routes.filter(r=>r.mode!=='bus').reduce((n,r)=>n+r.vehicles*(t.integration==='support'?20000:10000),0);
  finance.stations += t.corridors.length * C.corridorMonthly + Object.keys(t.junctions).length * C.junctionMonthly;
  const expenses = finance.bus + finance.brt + finance.stations + finance.terminals + finance.depots;
  finance.subsidy = Math.max(0, expenses - finance.fares); finance.recovery = expenses ? finance.fares / expenses * 100 : 0; t.finance = finance;
  const oldLocal = t.local;
  t.local = Array.from({ length: city.tiles.length }, emptyTransitAccess);
  for (const s of t.stops.filter(s => s.kind !== 'bus-depot' && s.boardings > 0)) {
    const useful = s.routes.map(id => t.routes.find(r => r.id === id)).filter(r => r && r.status === 'active');
    const quality = useful.length ? Math.max(...useful.map(r => r!.reliability * Math.min(1, 10 / Math.max(1, r!.wait)) * Math.min(1, r!.ridership / Math.max(1, r!.capacity) * 3))) : 0;
    const reach = walkingReach(city, s.tileId);
    for (const [id, steps] of reach) {
      const ids = [id, ...adjacent(city, id).filter(n => !city.tiles[n].road && !['water', 'wetland'].includes(city.tiles[n].terrain) && city.tiles[n].services.floodDepth < 35)];
      for (const tileId of ids) {
        const local = t.local[tileId]; local.access = Math.max(local.access, quality * Math.max(.15, 1 - steps / (C.walkCells + 1)));
        local.firstMile = Math.max(local.firstMile, s.accessibility * Math.max(.15, 1 - steps / (C.walkCells + 1)));
        local.demand += s.demand / Math.max(1, reach.size); local.ridership += s.boardings / Math.max(1, reach.size);
      }
    }
  }
  for(const flow of city.mobility.flows)if(flow.purpose!=='delivery'){
    t.local[flow.origin].demand+=flow.trips;t.local[flow.destination].demand+=flow.trips;
    for(const id of flow.path)t.local[id].demand+=flow.trips;
  }
  for(const r of t.routes)for(const id of r.path)t.local[id].ridership+=r.ridership;
  const seenJobs = new Map<number, Set<number>>();
  for (const f of city.mobility.flows) {
    const local = t.local[f.origin], plan = t.demand.find(d => d.flowId === f.id);
    const minutes = plan ? Math.min(f.minutes, plan.minutes) : f.minutes;
    if (f.purpose === 'work' && minutes <= C.jobMinutes) {
      const seen = seenJobs.get(f.origin) ?? new Set<number>();
      if (!seen.has(f.destination)) { local.jobs45 += city.tiles[f.destination].building?.maximumJobs ?? city.publicServices.facilities.find(s => s.location === f.destination)?.employeesRequired ?? 0; seen.add(f.destination); seenJobs.set(f.origin, seen); }
    }
    if (plan) {
      if (f.purpose === 'shopping') local.commerce += plan.passengers;
      if (f.purpose === 'services') { const kind = city.publicServices.facilities.find(s => s.location === f.destination)?.type; if (kind === 'education') local.education += plan.passengers; if (kind === 'healthcare') local.healthcare += plan.passengers; }
      local.lastMile = Math.max(local.lastMile, t.local[f.destination].firstMile); local.center += plan.passengers;
    }
  }
  // Spread grouped OD measures to each home in its existing 4×4 mobility area.
  for (const [origin] of seenJobs) for (let id = 0; id < city.tiles.length; id++) if (Math.floor(city.tiles[id].x / 4) === Math.floor(city.tiles[origin].x / 4) && Math.floor(city.tiles[id].y / 4) === Math.floor(city.tiles[origin].y / 4) && city.tiles[id].zone === 'residential') t.local[id].jobs45 = Math.max(t.local[id].jobs45, t.local[origin].jobs45);
  for (let id = 0; id < t.local.length; id++) {
    const local = t.local[id];
    const target = Math.min(C.todMaximum, local.access / 100 * C.todMaximum * Math.min(1, local.ridership / 100));
    local.tod = progress ? (oldLocal[id]?.tod ?? 0) * (1 - C.todSmoothing) + target * C.todSmoothing : oldLocal[id]?.tod ?? 0;
    local.throughput = city.tiles[id].mobility.dailyTrips * C.peakShare;
  }
  const average = (ids: number[]) => {
    const result = emptyTransitAccess(), weight = ids.reduce((n, id) => n + (city.tiles[id].building?.occupants ?? 0), 0);
    for (const key of Object.keys(result) as (keyof TransitAccessibility)[]) result[key] = ids.reduce((n, id) => n + t.local[id][key] * (weight ? city.tiles[id].building?.occupants ?? 0 : 1), 0) / Math.max(1, weight || ids.length);
    return result;
  };
  t.districts = Object.fromEntries((city.governance?.districts ?? []).map(d => [d.id, average(d.tiles)]));
  const access = average(city.tiles.map((_, id) => id)), riders = t.routes.reduce((n, r) => n + r.ridership, 0);
  t.stats = { ...t.stats, ridership: riders, access: access.access, jobs45: access.jobs45,
    wait: riders ? t.routes.reduce((n, r) => n + r.wait * r.ridership, 0) / riders : 0,
    reliability: riders ? t.routes.reduce((n, r) => n + r.reliability * r.ridership, 0) / riders : 0,
    throughput: city.mobility.stats.dailyTrips * C.peakShare, crowding: riders ? t.routes.reduce((n, r) => n + r.crowding * r.ridership, 0) / riders : 0,
    profile: city.mobility.stats.congestion > 75 ? 'Congested metropolis' : access.access > 55 && city.mobility.stats.sharedUsage > 40 ? 'Transit-oriented city' : city.mobility.stats.jobAccessibility > 85 ? 'Highly connected city' : city.mobility.stats.modes.car > city.mobility.stats.dailyTrips * .5 ? 'Car-dependent city' : 'Mixed mobility city' };
  if (progress && city.tick % 30 === 0) { t.history.push({ tick: city.tick, ridership: riders, access: access.access, jobs45: access.jobs45, wait: t.stats.wait, subsidy: finance.subsidy }); t.history = t.history.slice(-C.historyLimit); }
  for (const id of Object.keys(t.works)) if (t.works[id] <= city.tick) delete t.works[id];

  t.lastTick = city.tick;
}
export function transitOverlay(city: City, tileId: number, name: string): number | undefined {
  const l = city.transit?.local[tileId]; if (!l) return;
  return name === 'transit-accessibility' ? l.access : name === 'transit-demand' ? clamp(l.demand / 10) : name === 'transit-ridership' ? clamp(l.ridership / 10) : name === 'jobs-accessible' ? clamp(l.jobs45 / Math.max(1, city.jobs) * 100) : name === 'transit-throughput' ? clamp(l.throughput / 20) : undefined;
}

/** Final city metrics are available only after general-road congestion is tallied. */
export function updateTransitCityMetrics(city: City, progress: boolean) {
  const t=city.transit,m=city.mobility.stats;
  t.stats.throughput=m.dailyTrips*C.peakShare;
  t.stats.profile=m.congestion>75?'Congested metropolis':t.stats.access>55&&m.sharedUsage>40?'Transit-oriented city':m.jobAccessibility>85?'Highly connected city':m.modes.car>m.dailyTrips*.5?'Car-dependent city':'Mixed mobility city';
  if(city.governance)transitChallenges(city,progress);
}
