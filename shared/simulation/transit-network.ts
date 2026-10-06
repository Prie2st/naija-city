import type { City } from '../types/city';
import type { TransitDemand, TransitRoute, TransitStop } from '../types/transit';
import { roadAnchor, roadGraph, ROADS } from './road-network';
import { INFORMAL_SERVICE, TRANSIT, TRANSIT_FACILITIES } from './transit-config';
import { perfNow } from './perf-counters';

interface Node { id: string; tileId: number; kind: string }
// `at` and `line` are dense node/route indexes so searches key states by number, not string.
interface Edge { to: string; at: number; route: string; line: number; mode: 'bus' | 'brt' | 'danfo' | 'keke'; minutes: number; fare: number; wait: number; reliability: number }
interface NetworkCache {
  stamp: string; nodes: Map<string, Node>; edges: Map<string, Edge[]>; index: Map<string, number>; lines: number;
  catchments: Map<number, Map<string, number>>; searches: Map<number, Search>; transfers: Map<string, { id: string; at: number; minutes: number }[]>;
  // Dense per-node views of the graph for the search loop, and its reusable best-cost table.
  ids?: string[]; kinds?: string[]; byIndex?: Edge[][]; best?: Float64Array; touched?: number[]; pool?: StatePool;
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
  cache.ids = [...cache.nodes.keys()]; cache.kinds = cache.ids.map(id => cache.nodes.get(id)!.kind); cache.byIndex = cache.ids.map(id => cache.edges.get(id) ?? []);
  caches.set(city, cache); return cache;
}
function accessNodes(city: City, cache: NetworkCache, origin: number) {
  const previous = cache.catchments.get(origin); if (previous) return previous;
  const roads = walkingReach(city, origin), access = new Map<string, number>();
  for (const n of cache.nodes.values()) { const steps = roads.get(n.tileId); if (steps !== undefined) access.set(n.id, walkTime(city, n.tileId, steps)); }
  cache.catchments.set(origin, access); return access;
}
// A leg chain shared between states: each boarding adds one link, so relaxations
// never copy leg arrays. `to` of the newest leg lives on the state itself.
interface Leg { routeId: string; mode: Edge['mode']; from: string; prev: Leg | null; prevTo: string }
interface Settled { at: number; changes: number; cost: number; minutes: number; head: Leg | null; to: string; seq: number }
interface Search { formal: Settled[][] }
function legsOf(s: Settled): TransitDemand['legs'] {
  const legs: TransitDemand['legs'] = []; let to = s.to;
  for (let leg = s.head; leg; leg = leg.prev) { legs.push({ routeId: leg.routeId, mode: leg.mode, from: leg.from, to }); to = leg.prevTo; }
  return legs.reverse();
}
// Search states live in reusable typed columns (one row per pushed state) so the
// hot loop allocates nothing but new legs. The heap and relaxation order match the
// object-based search exactly, so settled states and tie-breaks are unchanged.
class StatePool {
  size = 0; cost = new Float64Array(1024); minutes = new Float64Array(1024); at = new Int32Array(1024); line = new Int32Array(1024);
  changes = new Int8Array(1024); formal = new Uint8Array(1024); to = new Int32Array(1024); head: (Leg | null)[] = []; heap = new Int32Array(1024);
  grow() {
    const n = this.cost.length * 2, f = <T extends Float64Array | Int32Array | Int8Array | Uint8Array>(a: T, b: T) => { b.set(a); return b; };
    this.cost = f(this.cost, new Float64Array(n)); this.minutes = f(this.minutes, new Float64Array(n)); this.at = f(this.at, new Int32Array(n)); this.line = f(this.line, new Int32Array(n));
    this.changes = f(this.changes, new Int8Array(n)); this.formal = f(this.formal, new Uint8Array(n)); this.to = f(this.to, new Int32Array(n)); this.heap = f(this.heap, new Int32Array(n));
  }
}
function search(city: City, origin: number, cache: NetworkCache): Search {
  const previous = cache.searches.get(origin); if (previous) return previous;
  const n = cache.index.size, lines = cache.lines, layers = TRANSIT.transfers + 1, size = n * lines * layers, limit = TRANSIT.jobMinutes * 2;
  // Dense best-cost table per graph; only touched slots are reset between searches.
  if (!cache.best || cache.best.length < size) { cache.best = new Float64Array(size).fill(Infinity); cache.touched = []; }
  const best = cache.best, touched = cache.touched!, kinds = cache.kinds!, edges = cache.byIndex!, ids = cache.ids!;
  for (const k of touched) best[k] = Infinity; touched.length = 0;
  const p = cache.pool ??= new StatePool(); p.size = 0; p.head.length = 0;
  const formal: Settled[][] = Array.from({ length: n }, () => []); let seq = 0, queued = 0;
  const integration = city.transit.integration, informalFactor = integration === 'support' ? .7 : .85;
  const push = (cost: number, minutes: number, at: number, line: number, changes: number, head: Leg | null, to: number, isFormal: boolean) => {
    const k = (at * lines + line) * layers + changes;
    if (cost >= best[k] || minutes > limit) return;
    if (best[k] === Infinity) touched.push(k);
    best[k] = cost;
    if (p.size === p.cost.length) p.grow();
    const s = p.size++;
    p.cost[s] = cost; p.minutes[s] = minutes; p.at[s] = at; p.line[s] = line; p.changes[s] = changes; p.formal[s] = isFormal ? 1 : 0; p.to[s] = to; p.head[s] = head;
    const heap = p.heap, costs = p.cost;
    let i = queued++; while (i > 0 && costs[heap[(i - 1) >> 1]] > cost) { heap[i] = heap[(i - 1) >> 1]; i = (i - 1) >> 1; } heap[i] = s;
  };
  const pop = () => {
    const heap = p.heap, costs = p.cost, top = heap[0], last = heap[--queued];
    if (queued) { const c = costs[last]; let i = 0; while (2 * i + 1 < queued) { let j = 2 * i + 1; if (j + 1 < queued && costs[heap[j + 1]] < costs[heap[j]]) j++; if (costs[heap[j]] >= c) break; heap[i] = heap[j]; i = j; } heap[i] = last; }
    return top;
  };
  for (const [id, minutes] of accessNodes(city, cache, origin)) push(minutes * TRANSIT.accessWeight, minutes, cache.index.get(id)!, 0, 0, null, -1, false);
  while (queued) {
    const s = pop(), at = p.at[s], line = p.line[s], changes = p.changes[s], cost = p.cost[s];
    if (best[(at * lines + line) * layers + changes] !== cost) continue;
    const minutes = p.minutes[s], head = p.head[s], to = p.to[s], isFormal = p.formal[s] === 1;
    cache.expanded++; seq++;
    // Only formal states can answer a journey query, so they are kept per node in settle order.
    if (isFormal) formal[at].push({ at, changes, cost, minutes, head, to: to < 0 ? '' : ids[to], seq });
    const kind = kinds[at];
    for (const edge of edges[at]) {
      // Line 0 is "not riding"; every route has its own line, so this matches comparing route ids.
      const boarding = line !== edge.line, next = changes + (boarding && line ? 1 : 0);
      if (next > TRANSIT.transfers) continue;
      let penalty = boarding && line ? kind === 'transport-interchange' ? TRANSIT.interchangePenalty : kind === 'bus-terminal' ? TRANSIT.terminalPenalty : TRANSIT.transferMinutes : 0;
      if(boarding&&line&&integration!=='neutral'&&(edge.mode==='danfo'||edge.mode==='keke'||kind==='informal'))penalty*=informalFactor;
      const wait = boarding ? edge.wait : 0, total = minutes + (edge.minutes + wait + penalty);
      const nextCost = cost + edge.minutes + wait * TRANSIT.waitWeight + penalty + (boarding ? edge.fare * TRANSIT.fareMinutes + (100 - edge.reliability) * TRANSIT.reliabilityMinutes : 0);
      // Reject before allocating: most relaxations lose.
      if (nextCost >= best[(edge.at * lines + edge.line) * layers + next] || total > limit) continue;
      push(nextCost, total, edge.at, edge.line, next, boarding ? { routeId: edge.route, mode: edge.mode, from: ids[at], prev: head, prevTo: to < 0 ? '' : ids[to] } : head, edge.at, isFormal || edge.mode === 'bus' || edge.mode === 'brt');
    }
    if (!line || changes >= TRANSIT.transfers) continue;
    // Walking transfers depend only on the graph, so they are shared by every search on it.
    const node = ids[at];
    let neighbours = cache.transfers.get(node);
    if (!neighbours) {
      const reach = walkingReach(city, cache.nodes.get(node)!.tileId, TRANSIT.transferWalkCells);
      neighbours = [...cache.nodes.values()].filter(n => n.id !== node && reach.has(n.tileId)).map(n => ({ id: n.id, at: cache.index.get(n.id)!, minutes: walkTime(city, n.tileId, reach.get(n.tileId)!) })); cache.transfers.set(node, neighbours);
    }
    for (const n of neighbours) push(cost + n.minutes * TRANSIT.accessWeight, minutes + n.minutes, n.at, line, changes, head, to, isFormal);
  }
  const result = { formal };
  if (cache.searches.size >= 128) cache.searches.clear(); cache.searches.set(origin, result); return result;
}
// Time spent answering journeys since the last take, for developer diagnostics.
let journeyMs = 0;
export function takeTransitSearchMs() { const ms = journeyMs; journeyMs = 0; return ms; }
export function transitJourney(city: City, origin: number, destination: number): Omit<TransitDemand, 'flowId' | 'passengers'> | null {
  if (!city.transit?.routes.length) return null;
  const started = perfNow();
  try { return journey(city, origin, destination); } finally { journeyMs += perfNow() - started; }
}
function journey(city: City, origin: number, destination: number): Omit<TransitDemand, 'flowId' | 'passengers'> | null {
  const cache = buildTransitGraph(city); cache.queries++;
  const arrival = accessNodes(city, cache, destination), found = search(city, origin, cache);
  // Visit only formal states at stops within walking reach of the destination, in the
  // order the search settled them, so ties resolve exactly as a full scan would.
  const candidates: { s: Settled; walk: number }[] = [];
  for (const [id, walk] of arrival) for (const s of found.formal[cache.index.get(id)!]) candidates.push({ s, walk });
  candidates.sort((a, b) => a.s.seq - b.s.seq);
  let result: Settled | null = null, total = Infinity, time = 0, fallback:Settled|null=null, fallbackCost=Infinity,fallbackTime=0;
  for (const { s, walk } of candidates) {
    const cost = s.cost + walk * TRANSIT.accessWeight;
    if(cost<fallbackCost){fallback=s;fallbackCost=cost;fallbackTime=s.minutes+walk;}
    if (cost >= total) continue;
    let free = true;
    for (let leg = s.head; leg && free; leg = leg.prev) { const route=city.transit.routes.find(r=>r.id===leg.routeId)??city.mobility.routes.find(r=>r.id===leg.routeId); free = !!route && route.capacity>route.ridership; }
    if (free) { result = s; total = cost; time = s.minutes + walk; }
  }
  if(!result){result=fallback;total=fallbackCost;time=fallbackTime;}
  return result ? { minutes: time, cost: total, transfers: result.changes, legs: legsOf(result) } : null;
}
/** Searches only serve one evaluation's queries; drop them so they are not held between days. */
export function releaseTransitSearches(city: City) { const c = caches.get(city); if (c) { c.searches.clear(); c.pool = undefined; } }
export function transitNetworkDiagnostics(city: City) {
  const c = caches.get(city); return { builds: c?.builds ?? 0, queries: c?.queries ?? 0, expanded: c?.expanded ?? 0, nodes: c?.nodes.size ?? 0, sources: c?.searches.size ?? 0 };
}
export function stationPenalty(stop: TransitStop) { return stop.kind === 'transport-interchange' ? TRANSIT.interchangePenalty : stop.kind === 'bus-terminal' ? TRANSIT.terminalPenalty : TRANSIT.transferMinutes; }
export function stopFacilityCapacity(stop: TransitStop) { return TRANSIT_FACILITIES[stop.kind].capacity * stop.condition / 100; }
