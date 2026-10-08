import type { City } from '../types/city';
const record = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
const n = (v: any, max = Number.MAX_SAFE_INTEGER) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const id = (v: any) => n(v, 1023) && Number.isInteger(v);
const str = (v: any) => typeof v === 'string' && v.length <= 500;
export function validLivingSave(c: City): boolean {
  const s = c.living;
  if (!record(s) || !record(s.informal) || !['jobs', 'employed', 'output', 'housingPressure', 'pressureDays'].every(k => n((s.informal as any)[k])) || s.informal.housingPressure > 100 || s.informal.employed > s.informal.jobs) return false;
  if (!Array.isArray(s.markets) || s.markets.length > 16 || new Set(s.markets.map(m => m.id)).size !== s.markets.length || !s.markets.every(m => record(m) && str(m.id) && id(m.tileId) && str(m.name) && n(m.age) && n(m.stalls, 10) && m.stalls >= 2 && Number.isInteger(m.stalls) && n(m.attraction, 100) && n(m.jobs) && n(m.output) && n(m.poorDays))) return false;
  if (new Set(s.markets.map(m => m.tileId)).size !== s.markets.length || s.informal.employed > c.workforce) return false;
  const homes = new Set(c.tiles.flatMap(t => t.building?.type === 'residential' ? [t.building.id] : []));
  if (!Array.isArray(s.households) || s.households.length > 12 || new Set(s.households.map(h => h.id)).size !== s.households.length || !s.households.every(h => record(h) && str(h.id) && str(h.surname) && homes.has(h.homeId) && n(h.size, 6) && h.size >= 2 && Number.isInteger(h.size))) return false;
  if (!Array.isArray(s.feed) || s.feed.length > 80 || !s.feed.every(e => record(e) && str(e.id) && n(e.tick, c.tick) && n(e.hour, 24) && str(e.kind) && str(e.text) && (e.tileId === null || id(e.tileId)) && ['notice', 'warning', 'opportunity'].includes(e.severity))) return false;
  if (!record(s.lastEvents) || Object.keys(s.lastEvents).length > 256 || !Object.values(s.lastEvents).every(v => n(v, c.tick)) || !record(s.previous) || Object.keys(s.previous).length > 4096 || !Object.values(s.previous).every(v => n(v) || str(v))) return false;
  if (!c.clusters.every(cluster => ['jobs', 'landValue', 'satisfaction', 'traffic', 'power', 'water', 'floodRisk'].every(k => n((cluster as any)[k])) && ['residential', 'commercial', 'industrial'].includes(cluster.dominantZone))) return false;
  return c.tiles.every(t => !t.building || ['formal', 'informal', 'integrating'].includes(t.building.tenure) && n(t.building.integrationProgress, 100) && (!t.building.business || n(t.building.business.lossDays) && (t.building.business.closedAt === null || n(t.building.business.closedAt, c.tick)) && n(t.building.business.reopenProgress, 100) && n(t.building.business.generation)));
}
