import type { City } from '../types/city';
import type { TransitDemand, TransitRoute, TransitStop } from '../types/transit';
import { roadAnchor, roadGraph, ROADS } from './road-network';
import { INFORMAL_SERVICE, TRANSIT, TRANSIT_FACILITIES } from './transit-config';

interface Node { id: string; tileId: number; kind: string }
// `at` and `line` are dense node/route indexes so searches key states by number, not string.
interface Edge { to: string; at: number; route: string; line: number; mode: 'bus' | 'brt' | 'danfo' | 'keke'; minutes: number; fare: number; wait: number; reliability: number }
interface State { node: string; at: number; route: string; line: number; changes: number; cost: number; minutes: number; legs: TransitDemand['legs']; formal: boolean }
interface NetworkCache {
  stamp: string; nodes: Map<string, Node>; edges: Map<string, Edge[]>; index: Map<string, number>; lines: number;
  catchments: Map<number, Map<string, number>>; searches: Map<number, State[]>; transfers: Map<string, { id: string; at: number; minutes: number }[]>;
  builds: number; queries: number; expanded: number;
}
const caches = new WeakMap<City, NetworkCache>();
// Walking uses connected dry roads plus the building entrance. It cannot jump a
// river, disconnected street or flooded footway merely because a stop is nearby.
export function walkingReach(city: City, tileId: number, limit: number = TRANSIT.walkCells): Map<number, number> {
  const anchor = roadAnchor(city, tileId), found = new Map<number, number>();
  if (anchor === null || city.tiles[tileId].services.floodDepth >= 35) return found;
  const graph = roadGraph(city), queue: number[] = [anchor]; found.set(anchor, anchor === tileId ? 0 : 1);
  for (let at = 0; at < queue.length; at++) {
    const id = queue[at], steps = found.get(id)!;
    if (steps >= limit) continue;
    for (const next of graph.neighbours[id]) if (!found.has(next) && city.tiles[next].services.floodDepth < 35) {
      found.set(next, steps + 1); queue.push(next);
    }
  }
  return found;
}
function walkTime(city: City, id: number, steps: number) {
  const quality = ROADS[city.tiles[id].roadClass ?? 'local'].walking;
  return steps * TRANSIT.walkMinutes / quality * (1 + city.weather.rainfall / 160);
}
export function invalidateTransit(city: City) { caches.delete(city); if (city.transit) city.transit.revision++; }
export function buildTransitGraph(city: City) {
  const t = city.transit;
  const stamp = `${t.revision}:${city.mobility.revision}:${roadGraph(city).signature}:${city.weather.kind}:${t.routes.map(r => `${r.id}:${r.status}:${r.headway.toFixed(1)}:${r.fare}:${Math.round(r.reliability)}:${r.crowding.toFixed(1)}`).join('|')}`;
  const old = caches.get(city); if (old?.stamp === stamp) return old;
  const cache: NetworkCache = { stamp, nodes: new Map(), edges: new Map(), index: new Map(), lines: 1, catchments: new Map(), searches: new Map(), transfers: new Map(), builds: (old?.builds ?? 0) + 1, queries: old?.queries ?? 0, expanded: old?.expanded ?? 0 };
  for (const s of t.stops) if (s.kind !== 'bus-depot' && city.tiles[s.anchor]?.road && city.tiles[s.anchor].services.floodDepth < 35) cache.nodes.set(s.id, { id: s.id, tileId: s.anchor, kind: s.kind });
  const add = (id: string, edge: Omit<Edge, 'at' | 'line'>) => { const list = cache.edges.get(id) ?? []; list.push({ ...edge, at: -1, line: -1 }); cache.edges.set(id, list); };
  const serve = (r: Pick<TransitRoute, 'id' | 'mode' | 'stops' | 'minutes' | 'fare' | 'wait' | 'reliability' | 'status'>) => {
    if (r.status !== 'active' || r.reliability <= 0) return;
    const stops = r.stops.filter(id => cache.nodes.has(id));
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i];
      const original = t.routes.find(route => route.id === r.id), aIndex = original?.path.indexOf(cache.nodes.get(a)!.tileId) ?? -1, bIndex = original?.path.indexOf(cache.nodes.get(b)!.tileId) ?? -1;
      const fraction = original && aIndex >= 0 && bIndex >= 0 ? Math.abs(bIndex - aIndex) / Math.max(1, original.path.length - 1) : 1 / Math.max(1, stops.length - 1);
      const minutes = Math.max(.3, r.minutes * fraction);
      const edge = { route: r.id, mode: r.mode, minutes, fare: r.fare * (1 - t.subsidyRate / 100), wait: r.wait, reliability: r.reliability };
      add(a, { ...edge, to: b }); add(b, { ...edge, to: a });
    }
  };
  for (const r of t.routes) serve(r);
  // Informal services are graph edges too, so a real Danfo/Keke can feed a formal
  // line. Their existing demand, growth, profitability and withdrawal stay intact.
  for (const r of city.mobility.routes) if (r.mode !== 'bus' && !r.suspended && r.reliability > 0 && r.path.length >= 2) {
    const ids = r.path.filter((_, i) => i === 0 || i === r.path.length - 1 || i % 5 === 0).map(tileId => {
      const id = `informal:${r.id}:${tileId}`; cache.nodes.set(id, { id, tileId, kind: 'informal' }); return id;
    });
    for (let i = 1; i < ids.length; i++) {
      const edge = { route: r.id, mode: r.mode, minutes: r.minutes / (ids.length - 1), fare: INFORMAL_SERVICE[r.mode].fare, wait: INFORMAL_SERVICE[r.mode].wait, reliability: r.reliability };
      add(ids[i - 1], { ...edge, to: ids[i] }); add(ids[i], { ...edge, to: ids[i - 1] });
    }
  }
  // Bound parallel duplicate edges; preserve the best service per mode/stop pair.
  for (const [id, edges] of cache.edges) {
    const groups=new Map<string,Edge[]>();
    for(const e of edges){const key=`${e.to}:${e.mode}`,list=groups.get(key)??[];list.push(e);groups.set(key,list);}
    cache.edges.set(id,[...groups.values()].flatMap(list=>list.sort((a,b)=>(a.minutes+a.wait*TRANSIT.waitWeight+a.fare*TRANSIT.fareMinutes)-(b.minutes+b.wait*TRANSIT.waitWeight+b.fare*TRANSIT.fareMinutes)).slice(0,3)));
  }
  for (const id of cache.nodes.keys()) cache.index.set(id, cache.index.size);
  const lines = new Map<string, number>([['', 0]]);
  for (const edges of cache.edges.values()) for (const e of edges) {
    if (!lines.has(e.route)) lines.set(e.route, lines.size);
    e.at = cache.index.get(e.to)!; e.line = lines.get(e.route)!;
  }
  cache.lines = lines.size;
  caches.set(city, cache); return cache;
}
function accessNodes(city: City, cache: NetworkCache, origin: number) {
  const previous = cache.catchments.get(origin); if (previous) return previous;
  const roads = walkingReach(city, origin), access = new Map<string, number>();
  for (const n of cache.nodes.values()) { const steps = roads.get(n.tileId); if (steps !== undefined) access.set(n.id, walkTime(city, n.tileId, steps)); }
  cache.catchments.set(origin, access); return access;
}
function search(city: City, origin: number, cache: NetworkCache): State[] {
  const previous = cache.searches.get(origin); if (previous) return previous;
  const queue: State[] = [], best = new Map<number, number>(), settled: State[] = [];
  const key = (at: number, line: number, changes: number) => (at * cache.lines + line) * (TRANSIT.transfers + 1) + changes;
  const push = (s: State) => {
    const k = key(s.at, s.line, s.changes);
    if (s.cost >= (best.get(k) ?? Infinity) || s.minutes > TRANSIT.jobMinutes * 2) return;
    best.set(k, s.cost); queue.push(s);
    let i = queue.length - 1; while (i > 0 && queue[(i - 1) >> 1].cost > s.cost) { queue[i] = queue[(i - 1) >> 1]; i = (i - 1) >> 1; } queue[i] = s;
  };
  const pop = () => { const top = queue[0], last = queue.pop()!; if (queue.length) { let i = 0; while (2 * i + 1 < queue.length) { let j = 2 * i + 1; if (j + 1 < queue.length && queue[j + 1].cost < queue[j].cost) j++; if (queue[j].cost >= last.cost) break; queue[i] = queue[j]; i = j; } queue[i] = last; } return top; };
  for (const [id, minutes] of accessNodes(city, cache, origin)) push({ node: id, at: cache.index.get(id)!, route: '', line: 0, changes: 0, cost: minutes * TRANSIT.accessWeight, minutes, legs: [], formal: false });
  while (queue.length) {
    const s = pop();
    if (best.get(key(s.at, s.line, s.changes)) !== s.cost) continue;
    settled.push(s); cache.expanded++;
    const kind = cache.nodes.get(s.node)!.kind;
    for (const edge of cache.edges.get(s.node) ?? []) {
      const boarding = s.route !== edge.route, changes = s.changes + (boarding && s.route ? 1 : 0);
      if (changes > TRANSIT.transfers) continue;
      let penalty = boarding && s.route ? kind === 'transport-interchange' ? TRANSIT.interchangePenalty : kind === 'bus-terminal' ? TRANSIT.terminalPenalty : TRANSIT.transferMinutes : 0;
      if(boarding&&s.route&&city.transit.integration!=='neutral'&&(edge.mode==='danfo'||edge.mode==='keke'||kind==='informal'))penalty*=city.transit.integration==='support'?.7:.85;
      const wait = boarding ? edge.wait : 0, minutes = s.minutes + (edge.minutes + wait + penalty);
      const cost = s.cost + edge.minutes + wait * TRANSIT.waitWeight + penalty + (boarding ? edge.fare * TRANSIT.fareMinutes + (100 - edge.reliability) * TRANSIT.reliabilityMinutes : 0);
      // Reject before copying legs: most relaxations lose, and the copies dominated large-city searches.
      if (cost >= (best.get(key(edge.at, edge.line, changes)) ?? Infinity) || minutes > TRANSIT.jobMinutes * 2) continue;
      // Legs are never mutated after creation, so states share unchanged leg objects.
      const legs = boarding ? [...s.legs, { routeId: edge.route, mode: edge.mode, from: s.node, to: edge.to }] : [...s.legs.slice(0, -1), { ...s.legs[s.legs.length - 1], to: edge.to }];
      push({ node: edge.to, at: edge.at, route: edge.route, line: edge.line, changes, minutes, cost, legs, formal: s.formal || edge.mode === 'bus' || edge.mode === 'brt' });
    }
    if (!s.route || s.changes >= TRANSIT.transfers) continue;
    // Walking transfers depend only on the graph, so they are shared by every search on it.
    let neighbours = cache.transfers.get(s.node);
    if (!neighbours) {
      const reach = walkingReach(city, cache.nodes.get(s.node)!.tileId, TRANSIT.transferWalkCells);
      neighbours = [...cache.nodes.values()].filter(n => n.id !== s.node && reach.has(n.tileId)).map(n => ({ id: n.id, at: cache.index.get(n.id)!, minutes: walkTime(city, n.tileId, reach.get(n.tileId)!) })); cache.transfers.set(s.node, neighbours);
    }
    for (const n of neighbours) push({ ...s, node: n.id, at: n.at, minutes: s.minutes + n.minutes, cost: s.cost + n.minutes * TRANSIT.accessWeight });
  }
  if (cache.searches.size >= 128) cache.searches.clear(); cache.searches.set(origin, settled); return settled;
}
export function transitJourney(city: City, origin: number, destination: number): Omit<TransitDemand, 'flowId' | 'passengers'> | null {
  if (!city.transit?.routes.length) return null;
  const cache = buildTransitGraph(city); cache.queries++;
  const arrival = accessNodes(city, cache, destination);
  let result: State | null = null, total = Infinity, time = 0, fallback:State|null=null, fallbackCost=Infinity,fallbackTime=0;
  for (const s of search(city, origin, cache)) {
    if (!s.formal) continue; const walk = arrival.get(s.node); if (walk === undefined) continue;
    const cost = s.cost + walk * TRANSIT.accessWeight;
    if(cost<fallbackCost){fallback=s;fallbackCost=cost;fallbackTime=s.minutes+walk;}
    if (cost >= total) continue;
    const free=s.legs.every(l=>{const route=city.transit.routes.find(r=>r.id===l.routeId)??city.mobility.routes.find(r=>r.id===l.routeId);return route&&route.capacity>route.ridership;});
    if (free) { result = s; total = cost; time = s.minutes + walk; }
  }
  if(!result){result=fallback;total=fallbackCost;time=fallbackTime;}
  return result ? { minutes: time, cost: total, transfers: result.changes, legs: result.legs } : null;
}
export function transitNetworkDiagnostics(city: City) {
  const c = caches.get(city); return { builds: c?.builds ?? 0, queries: c?.queries ?? 0, expanded: c?.expanded ?? 0, nodes: c?.nodes.size ?? 0, sources: c?.searches.size ?? 0 };
}
export function stationPenalty(stop: TransitStop) { return stop.kind === 'transport-interchange' ? TRANSIT.interchangePenalty : stop.kind === 'bus-terminal' ? TRANSIT.terminalPenalty : TRANSIT.transferMinutes; }
export function stopFacilityCapacity(stop: TransitStop) { return TRANSIT_FACILITIES[stop.kind].capacity * stop.condition / 100; }
