import { MODES } from './mobility';
import { ROADS } from './road-network';
const record = (v: any): boolean => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: any, lo = 0, hi = Number.MAX_SAFE_INTEGER): boolean => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const tileId = (v: any) => finite(v, 0, 1023) && Number.isInteger(v);
const path = (v: any) => Array.isArray(v) && v.length <= 8192 && v.every(tileId) && v.every((id: number, i: number) => !i || Math.abs(id % 32 - v[i - 1] % 32) + Math.abs(Math.floor(id / 32) - Math.floor(v[i - 1] / 32)) === 1);
const numbers = (v: any, keys: string[]) => record(v) && keys.every(k => finite(v[k]));
export function validMobilitySave(c: any): boolean {
  const m = c.mobility;
  if (!record(m) || !finite(m.revision) || !finite(m.lastTick, -1) || !finite(m.sourcePopulation, -1) || !finite(m.sourceJobs, -1) || !record(m.stats) || !record(m.stats.modes) || !MODES.every(k => finite(m.stats.modes[k])) ||
    !numbers(m.stats, ['dailyTrips', 'averageCommute', 'averageSpeed', 'congestion', 'jobAccessibility', 'sharedCoverage', 'sharedUsage', 'reachableWorkers']) ||
    !numbers(m.costs, ['buses', 'administration', 'fares']) || !numbers(m.debug, ['demandMultiplier', 'loadMultiplier', 'until']) ||
    !record(m.jobTargets) || Object.keys(m.jobTargets).length > 1024 || !Object.values(m.jobTargets).every(v => finite(v)) ||
    !Array.isArray(m.corridors) || m.corridors.length > 128 || !m.corridors.every((r: any) => typeof r.id === 'string' && numbers(r, ['interest', 'lastSeen'])) ||
    !Array.isArray(m.history) || m.history.length > 40 || !m.history.every((h: any) => record(h) && finite(h.tick) && typeof h.text === 'string')) return false;
  if (!Array.isArray(m.flows) || m.flows.length > 768 || !m.flows.every((f: any) => record(f) && typeof f.id === 'string' && tileId(f.origin) && tileId(f.destination) && typeof f.originName === 'string' && typeof f.destinationName === 'string' && ['work', 'shopping', 'delivery', 'services'].includes(f.purpose) && numbers(f, ['trips', 'distance', 'minutes']) && path(f.path) && record(f.modes) && MODES.every(k => finite(f.modes[k])))) return false;
  if (!Array.isArray(m.routes) || m.routes.length > 64 || new Set(m.routes.map((r: any) => r.id)).size !== m.routes.length || !m.routes.every((r: any) => record(r) && typeof r.id === 'string' && ['keke', 'danfo', 'bus'].includes(r.mode) && tileId(r.origin) && tileId(r.destination) && typeof r.originName === 'string' && typeof r.destinationName === 'string' && path(r.path) && Array.isArray(r.waypoints) && r.waypoints.length >= 2 && r.waypoints.length <= 8 && r.waypoints.every(tileId) && numbers(r, ['demand', 'ridership', 'vehicles', 'capacity', 'averageSpeed', 'minutes', 'profitability', 'reliability', 'congestionImpact', 'age', 'poorDays', 'createdAt']) && finite(r.netProfit, -Number.MAX_SAFE_INTEGER) && finite(r.vehicles, 1, 80) && Number.isInteger(r.vehicles) && finite(r.reliability, 0, 100) && finite(r.profitability, 0, 100) && typeof r.formalized === 'boolean' && typeof r.suspended === 'boolean')) return false;
  const routeIds = new Set(m.routes.map((r: any) => r.id));
  for (const key of ['stops', 'hubs']) if (!Array.isArray(m[key]) || m[key].length > 1024 || !m[key].every((s: any) => record(s) && tileId(s.tileId) && finite(s.passengers) && Array.isArray(s.routes) && s.routes.every((id: any) => routeIds.has(id)) && (key === 'stops' ? typeof s.designated === 'boolean' : typeof s.name === 'string'))) return false;
  return c.tiles.every((t: any) => (t.road ? t.roadClass in ROADS : t.roadClass === null) && numbers(t.mobility, ['dailyTrips', 'vehicleFlow', 'capacity', 'effectiveCapacity', 'speed', 'congestion', 'accessibility', 'footTraffic', 'sharedCoverage']) && typeof t.mobility.majorFlow === 'string' && ['congestion', 'accessibility', 'sharedCoverage'].every(k => finite(t.mobility[k], 0, 100)));
}
