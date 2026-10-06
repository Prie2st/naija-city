import { TRANSIT } from './transit-config';
import { localGovernance } from './governance';
import type { City, Tile, Tool } from '../types/city';
import type { RoadClass, TileMobility } from '../types/mobility';
// walking: pedestrian comfort multiplier (wide arterials are slower to cross).
// frontage: development appeal for each adjoining zone (arterial noise versus visibility).
type Frontage = Record<'residential' | 'commercial' | 'industrial', number>;
export const ROADS: Record<RoadClass, { name: string; cost: number; upkeep: number; capacity: number; speed: number; walking: number; frontage: Frontage }> = {
  dirt: { name: 'Dirt road', cost: 80000, upkeep: 2400, capacity: 55, speed: 12, walking: .7, frontage: { residential: -2, commercial: -3, industrial: -2 } },
  local: { name: 'Local road', cost: 250000, upkeep: 3000, capacity: 140, speed: 25, walking: 1, frontage: { residential: 0, commercial: 0, industrial: 0 } },
  avenue: { name: 'Avenue', cost: 800000, upkeep: 12600, capacity: 420, speed: 40, walking: .95, frontage: { residential: 1, commercial: 4, industrial: 2 } },
  major: { name: 'Major road', cost: 1800000, upkeep: 25500, capacity: 850, speed: 55, walking: .85, frontage: { residential: -5, commercial: 5, industrial: 4 } },
};
const ROAD_RANK: RoadClass[] = ['dirt', 'local', 'avenue', 'major'];
/** The busiest road class a parcel faces; upgrades change its development appeal. */
export function roadFrontage(city: City, tile: Tile): RoadClass | null {
  let best: RoadClass | null = null;
  for (const id of adjacent(city, tile.y * city.size + tile.x)) { const road = city.tiles[id]; if (road.road && (!best || ROAD_RANK.indexOf(road.roadClass ?? 'local') > ROAD_RANK.indexOf(best))) best = road.roadClass ?? 'local'; }
  return best;
}
export function frontageEffect(city: City, tile: Tile) {
  const road = roadFrontage(city, tile); return road && tile.zone ? { road, value: ROADS[road].frontage[tile.zone] } : null;
}
export function roadTool(tool: Tool): RoadClass | null {
  return ({ road: 'local', 'dirt-road': 'dirt', avenue: 'avenue', 'major-road': 'major' } as Record<string, RoadClass>)[tool] ?? null;
}
export function emptyMobilityTile(): TileMobility {
  return { dailyTrips: 0, vehicleFlow: 0, capacity: 0, effectiveCapacity: 0, speed: 0, congestion: 0, accessibility: 50, footTraffic: 0, sharedCoverage: 0, majorFlow: '' };
}
export function adjacent(city: City, id: number): number[] {
  const x = id % city.size, y = Math.floor(id / city.size);
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < city.size && b < city.size).map(([a, b]) => b * city.size + a);
}
export function roadPerformance(city: City, tile: Tile) {
  const def = ROADS[tile.roadClass ?? 'local'], s = tile.services;
  const accessible = tile.road && s.floodDepth < 90 && s.roadCondition >= 20;
  const rain = city.weather.rainfall / 65, dirt = tile.roadClass === 'dirt';
  const resilience = Math.max(0.08, (0.65 + s.roadCondition * 0.0035) * (1 - Math.min(0.8, s.floodDepth / 115)) * (1 - rain * (dirt ? 0.55 : 0.15)));
  const id=tile.y*city.size+tile.x, lanes=city.transit?.corridors.includes(id)?TRANSIT.roadCapacityShare:1;
  const construction=(city.transit?.works[id]??0)>city.tick?TRANSIT.disruptionCapacity:1;
  const arms=tile.road?adjacent(city,id).filter(n=>city.tiles[n].road).length:0, treatment=city.transit?.junctions[id];
  const junction=arms<3?1:treatment==='high-capacity'?1.08:treatment==='signal'?.97:treatment==='roundabout'?(tile.mobility.vehicleFlow<def.capacity*5?1.04:.85):.84;
  return { accessible, capacity: accessible ? def.capacity * resilience * lanes * construction * junction * (1 - (tile.roadClass==='major'||tile.roadClass==='avenue'?0:(localGovernance(city,tile)?.effects.walking??0)*.4)) : 0, speed: accessible ? def.speed * resilience : 0 };
}
export function congestionFor(peakVehicles: number, capacity: number) {
  if (!capacity) return peakVehicles ? 100 : 0;
  const ratio = peakVehicles / capacity;
  return Math.min(100, 100 * ratio * ratio / (1 + ratio * ratio));
}
interface Graph { key: string; signature: string; neighbours: number[][]; components: number[]; costs: number[]; paths: Map<number, { distance: number[]; parent: number[] }> }
const cache = new WeakMap<City, Graph>();
export function invalidateRoadGraph(city: City) { const previous = cache.get(city); if (previous) previous.key = ''; }
export function roadGraph(city: City): Graph {
  const key = `${city.tick}:${city.infrastructure.revision}`;
  const cached = cache.get(city); if (cached?.key === key) return cached;
  // Signature includes flood/condition/congestion buckets: route caches never survive changed access.
  const signature = `${city.transit?.revision??0}|${JSON.stringify(city.transit?.works??{})}|${city.weather.kind}|${city.governance?.policies.map(p=>`${p.id}:${p.districtId}:${Math.round(p.strength*5)}`).join(',')}|` + city.tiles.filter(t => t.road).map(t => `${t.y * city.size + t.x}:${t.roadClass}:${Math.floor(t.services.floodDepth / 10)}:${Math.floor(t.services.roadCondition / 5)}:${Math.floor(t.mobility.congestion / 10)}`).join(',');
  const previous = cache.get(city); if (previous?.signature === signature) { previous.key = key; return previous; }
  const n = city.tiles.length, neighbours = Array.from({ length: n }, () => [] as number[]), components = Array(n).fill(-1), costs = Array(n).fill(Infinity);
  for (let id = 0; id < n; id++) {
    const p = roadPerformance(city, city.tiles[id]); if (!p.accessible) continue;
    costs[id] = 0.12 / Math.max(2, p.speed * (1 - city.tiles[id].mobility.congestion * 0.007)) * 60;
    neighbours[id] = adjacent(city, id).filter(next => roadPerformance(city, city.tiles[next]).accessible);
  }
  let component = 0;
  for (let id = 0; id < n; id++) if (Number.isFinite(costs[id]) && components[id] === -1) {
    const queue = [id]; components[id] = component;
    for (let i = 0; i < queue.length; i++) for (const next of neighbours[queue[i]]) if (components[next] === -1) { components[next] = component; queue.push(next); }
    component++;
  }
  const graph = { key, signature, neighbours, components, costs, paths: new Map() }; cache.set(city, graph); return graph;
}
export function roadAnchor(city: City, id: number): number | null {
  const graph = roadGraph(city);
  return [id, ...adjacent(city, id)].find(next => graph.components[next] >= 0) ?? null;
}
export function roadPath(city: City, start: number, end: number): { path: number[]; minutes: number } | null {
  const graph = roadGraph(city);
  if (graph.components[start] < 0 || graph.components[start] !== graph.components[end]) return null;
  let tree = graph.paths.get(start);
  if (!tree) {
    const distance = Array(city.tiles.length).fill(Infinity), parent = Array(city.tiles.length).fill(-1);
    // Binary heap keeps each source search O((roads + edges) log roads).
    const heap: [number, number][] = [];
    const push = (item: [number, number]) => { heap.push(item); let i = heap.length - 1; while (i && heap[(i - 1) >> 1][0] > item[0]) { heap[i] = heap[(i - 1) >> 1]; i = (i - 1) >> 1; } heap[i] = item; };
    const pop = () => { const first = heap[0], last = heap.pop()!; if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child++; if (heap[child][0] >= last[0]) break; heap[i] = heap[child]; i = child; } heap[i] = last; } return first; };
    distance[start] = 0; push([0, start]);
    while (heap.length) {
      const [cost, id] = pop(); if (cost !== distance[id]) continue;
      for (const next of graph.neighbours[id]) {
        const candidate = cost + (graph.costs[id] + graph.costs[next]) / 2;
        if (candidate < distance[next]) { distance[next] = candidate; parent[next] = id; push([candidate, next]); }
      }
    }
    tree = { distance, parent }; if (graph.paths.size >= 128) graph.paths.clear(); graph.paths.set(start, tree);
  }
  const path = [end]; while (path[0] !== start) { const p = tree.parent[path[0]]; if (p < 0) return null; path.unshift(p); }
  return { path, minutes: tree.distance[end] + graph.costs[start] };
}
export function waypointPath(city: City, points: number[]) {
  const path: number[] = []; let minutes = 0;
  for (let i = 1; i < points.length; i++) { const leg = roadPath(city, points[i - 1], points[i]); if (!leg) return null; path.push(...leg.path.slice(i === 1 ? 0 : 1)); minutes += leg.minutes; }
  return path.length ? { path, minutes } : null;
}
// Reuse one cached Dijkstra source tree for aggregate public-service accessibility.
export function roadTravelTimes(city: City, source: number): readonly number[] {
  roadPath(city, source, source);
  return roadGraph(city).paths.get(source)?.distance ?? [];
}
