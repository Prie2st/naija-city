import type { City } from '../types/city';
import { formalizeRoute, updateMobility } from './mobility';
export const MOBILITY_DEBUG = ['Generate Commute Demand', 'Force Congestion', 'Spawn Informal Route', 'Increase Route Demand', 'Kill Route Demand', 'Formalize Selected Route', 'Spawn Keke Demand', 'Spawn Danfo Demand', 'Flood Road Segment', 'Clear Traffic'] as const;
export function mobilityDebug(city: City, action: string, target: number | null, routeId: string | null): string {
  const m = city.mobility;
  if (action === 'Formalize Selected Route') return formalizeRoute(city, routeId ?? '') || 'Corridor formalized.';
  if (action === 'Flood Road Segment') {
    const t = target === null ? city.tiles.find(t => t.road) : city.tiles[target];
    if (!t?.road) return 'Inspect a road first.';
    t.services.floodDepth = 95; t.services.floodStage = 'major';
  } else if (action === 'Force Congestion') { m.debug.loadMultiplier = 100; m.debug.until = city.tick + 60; }
  else if (action === 'Clear Traffic') { m.debug.demandMultiplier = 1; m.debug.loadMultiplier = 1; m.debug.until = 0; }
  else if (action === 'Kill Route Demand') { m.debug.demandMultiplier = 0; m.debug.until = city.tick + 60; }
  else if (['Increase Route Demand', 'Spawn Keke Demand', 'Spawn Danfo Demand'].includes(action)) { m.debug.demandMultiplier = 4; m.debug.until = city.tick + 60; }
  updateMobility(city, false, true);
  if (action === 'Spawn Informal Route') {
    if (!m.corridors.length) return 'No connected real travel demand yet. Add occupied homes and employment.';
    m.corridors.forEach(c => { c.interest = 12; }); updateMobility(city, false, true);
  }
  return `${action}: mobility recalculated. Visual vehicles remain representatives of real flows.`;
}
