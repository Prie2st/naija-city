import type { City } from '../types/city';
import type { PublicServiceFacility } from '../types/public-services';
import { adjacent, roadAnchor, roadGraph, roadPath, roadTravelTimes } from './road-network';

interface AccessCache { tileAnchors:Int32Array; signature: string; maps: Map<string, Float32Array>; rebuilds: number; milliseconds: number }
const caches = new WeakMap<City, AccessCache>();
const walkStamps=new WeakMap<City,{tick:number;revision:number;value:string}>();
function walkStamp(city:City){const old=walkStamps.get(city),revision=city.publicServices?.revision??0;if(old?.tick===city.tick&&old.revision===revision)return old.value;
  const value=city.tiles.map(t=>['water','wetland'].includes(t.terrain)||t.services.floodDepth>=35?'1':'0').join('');walkStamps.set(city,{tick:city.tick,revision,value});return value;}

export function facilityAnchors(city: City, facility: Pick<PublicServiceFacility, 'tiles'>) {
  const graph = roadGraph(city), ids = new Set<number>();
  for (const id of facility.tiles) for (const next of adjacent(city, id)) if (graph.components[next] >= 0) ids.add(next);
  return [...ids];
}
export function serviceTravelMap(city: City, facility: Pick<PublicServiceFacility, 'id' | 'tiles' | 'location' | 'type'>) {
  const signature = `${roadGraph(city).signature}|${city.publicServices?.revision ?? 0}|${walkStamp(city)}`;
  let cache = caches.get(city);
  if (!cache || cache.signature !== signature) { cache = { tileAnchors:Int32Array.from(city.tiles.map((_t,id)=>roadAnchor(city,id)??-1)), signature, maps: new Map(), rebuilds: cache?.rebuilds ?? 0, milliseconds: 0 }; caches.set(city, cache); }
  const key = `${facility.id}:${facility.location}:${facility.tiles.join(',')}`;
  const existing = cache.maps.get(key); if (existing) return existing;
  const started = performance.now(), times = new Float32Array(city.tiles.length).fill(Infinity);
  const anchors = facilityAnchors(city, facility);
  for (const source of anchors) {
    const distances = roadTravelTimes(city, source);
    city.tiles.forEach((_tile, id) => {
      const anchor = cache!.tileAnchors[id];
      if (anchor >= 0 && Number.isFinite(distances[anchor])) times[id] = Math.min(times[id], distances[anchor] + 2);
    });
  }
  // Parks can be reached on short dry-land footpaths even without a road. A small
  // bounded BFS avoids treating a river/compound barrier as a magic radius.
  if (facility.type === 'parks') {
    const queue = facility.tiles.map(id => [id, 0]), seen = new Set(facility.tiles);
    for (let i = 0; i < queue.length; i++) {
      const [id, steps] = queue[i]; times[id] = Math.min(times[id], steps * 1.8);
      if (steps >= 2) continue;
      for (const next of adjacent(city, id)) {
        const t = city.tiles[next];
        if (!seen.has(next) && !['water','wetland'].includes(t.terrain) && t.services.floodDepth < 35 && (!t.publicFacility || t.publicFacility === facility.id)) { seen.add(next); queue.push([next, steps + 1]); }
      }
    }
  }
  if (cache.maps.size >= 132) cache.maps.clear();
  cache.maps.set(key, times); cache.rebuilds++; cache.milliseconds += performance.now() - started;
  return times;
}
export function serviceReach(minutes: number, limit: number) {
  if (!Number.isFinite(minutes) || minutes > limit) return 0;
  return Math.max(0, Math.min(1, (limit - minutes) / Math.max(1, limit * 0.65)));
}
export function servicePath(city: City, facility: PublicServiceFacility, tileId: number) {
  const end = roadAnchor(city, tileId); if (end === null) return null;
  return facilityAnchors(city, facility).map(start => roadPath(city, start, end)).filter(p => p !== null).sort((a,b) => a!.minutes - b!.minutes)[0] ?? null;
}
export function serviceCacheDiagnostics(city: City) {
  const c = caches.get(city); return { maps: c?.maps.size ?? 0, rebuilds: c?.rebuilds ?? 0, milliseconds: c?.milliseconds ?? 0 };
}
