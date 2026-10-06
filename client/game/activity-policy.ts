import type { City } from '../../shared/types/city';
import type { CityActivity } from '../../shared/types/living';
import type { GraphicsQuality } from './visual-style';
export type VisualVehicle = 'car' | 'taxi' | 'okada' | 'keke' | 'danfo' | 'bus' | 'delivery' | 'truck' | 'fire-engine' | 'waste-truck' | 'police-car';
export interface VehiclePlan { key: string; mode: VisualVehicle; path: number[]; routeId: string | null; volume: number; transitMode?: 'bus' | 'brt'; color?: number }
export function agentCaps(quality: GraphicsQuality, zoom: number, width: number, height: number) {
  const area = Math.min(1, Math.max(0.3, width * height / 900000));
  const far = zoom < 0.6;
  return { vehicles: Math.ceil(({ low: 18, medium: 36, high: 72 }[quality]) * (far ? 0.2 : area)),
    pedestrians: zoom < 1.15 ? 0 : Math.ceil(({ low: 16, medium: 48, high: 96 }[quality]) * area * (zoom < 2.2 ? 0.4 : 1)) };
}
export function vehiclePlan(city: City, activity: CityActivity, visibleRoads: Set<number>, cap: number): VehiclePlan[] {
  const plans: VehiclePlan[] = [];
  const candidates: VehiclePlan[] = [];
  for(const i of city.safety?.incidents??[])if(i.status==='responding'&&i.response.path.length>=2&&i.response.path.some(id=>visibleRoads.has(id)))candidates.push({key:i.id,mode:'police-car',path:i.response.path,routeId:null,volume:100});
  for(const f of city.safety?.facilities??[])if(f.patrolEffectiveness>25&&f.patrolPath.length>=2&&f.patrolPath.some(id=>visibleRoads.has(id))&&city.tick%7<2)candidates.push({key:`patrol-${f.facilityId}`,mode:'police-car',path:f.patrolPath,routeId:null,volume:12});
  for(const f of city.publicServices?.fires??[])if(f.resolvedAt===null&&f.path.length>=2&&f.path.some(id=>visibleRoads.has(id)))candidates.push({key:f.id,mode:'fire-engine',path:f.path,routeId:null,volume:100});
  for (const r of city.mobility.routes) {
    const live = activity.transit[r.id];
    if (live?.activity && r.path.some(id => visibleRoads.has(id))) candidates.push({ key: r.id, mode: r.mode, path: r.path, routeId: r.id, volume: r.congestionImpact * live.activity });
  }
  for(const r of city.transit?.routes??[])if(!r.legacy&&r.status==='active'&&r.ridership>0&&r.path.some(id=>visibleRoads.has(id))){const live=activity.transit[r.id];if(live?.activity)candidates.push({key:r.id,mode:'bus',transitMode:r.mode,color:r.color,path:r.path,routeId:r.id,volume:r.ridership*live.activity*.05});}
  for (const f of activity.journeys) {
    if (f.path.length < 2 || !f.path.some(id => visibleRoads.has(id))) continue;
    for (const mode of ['car', 'okada'] as const) {
      const count = f.purpose === 'delivery' ? 0 : f[mode];
      if (count > 0) candidates.push({ key: `${f.flowId}-${mode}`, mode, path: f.path, routeId: null, volume: count });
    }
    if (f.freight > 0) candidates.push({ key: `${f.flowId}-freight`, mode: f.flowId.startsWith('waste-')?'waste-truck':city.tiles[f.origin].zone === 'industrial' ? 'truck' : 'delivery', path: f.path, routeId: null, volume: f.freight });
  }
  candidates.sort((a, b) => b.volume - a.volume || a.key.localeCompare(b.key));
  let policeCount=0;const policeCap=Math.max(1,Math.min(8,Math.floor(cap/6)));
  for(let i=0;i<candidates.length;i++)if(candidates[i].mode==='police-car'&&++policeCount>policeCap)candidates.splice(i--,1);
  // Reserve one representative for each actually available silhouette. Numerous feeder
  // routes must not monopolize a mobile pool and hide cars/freight on the same road.
  const modes = new Set<VisualVehicle>();
  for (const c of candidates) if (!modes.has(c.mode) && plans.length < cap) {
    modes.add(c.mode); plans.push({ ...c, key: `${c.key}:0` });
  }
  for (let round = 0; round < 8 && plans.length < cap; round++) for (const c of candidates) {
    const congestion = c.path.reduce((s, id) => s + (activity.roads[id]?.congestion ?? 0), 0) / c.path.length;
    const count = c.mode==='police-car'?1:Math.min(8, Math.ceil(Math.sqrt(c.volume) / 10 + congestion / 35));
    if (round >= count || plans.length >= cap) continue;
    if (round === 0 && plans.some(p => p.key === `${c.key}:0`)) continue;
    const mode = c.mode === 'car' && round % 4 === 2 ? 'taxi' : c.mode;
    plans.push({ ...c, key: `${c.key}:${round}`, mode });
  }
  // Daily roadside market deliveries produce real local road pressure too.
  for (const market of city.living.markets) if (plans.length < cap && market.jobs > 0) {
    const path = [...visibleRoads].filter(id => Math.abs(city.tiles[id].x - city.tiles[market.tileId].x) + Math.abs(city.tiles[id].y - city.tiles[market.tileId].y) <= 2);
    const a = path.find(id => path.some(other => Math.abs(city.tiles[id].x - city.tiles[other].x) + Math.abs(city.tiles[id].y - city.tiles[other].y) === 1));
    const b = a === undefined ? undefined : path.find(other => Math.abs(city.tiles[a].x - city.tiles[other].x) + Math.abs(city.tiles[a].y - city.tiles[other].y) === 1);
    if (a !== undefined && b !== undefined && activity.tiles[market.tileId].market > 0.4) plans.push({ key: `market-delivery:${market.id}`, mode: 'delivery', path: [a, b], routeId: null, volume: market.stalls });
  }
  return plans;
}
