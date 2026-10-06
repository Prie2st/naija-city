// Save repair: fill in missing NON-authoritative fields with safe defaults.
//
// Persisted state falls into four classes (see docs/persistence.md):
//   AUTHORITATIVE  player decisions and accumulated history (map, buildings,
//                  treasury, routes, policies, incidents, smoothed values).
//                  Never invented here; if missing, the save is rejected.
//   DERIVED        per-tile metrics and summaries the simulation recomputes on
//                  its normal schedule (coverage, access, stats, forecasts).
//   CACHE          module-level graphs and travel maps; never persisted.
//   VISUAL-ONLY    vehicles, pedestrians, activity snapshots; never persisted.
//
// Only DERIVED records listed below may receive defaults. A new field added to
// one of these records therefore loads from older saves without a version bump.
// Any change to AUTHORITATIVE persisted state must review whether a save version
// bump and explicit migration step are required.
import type { City } from '../types/city';
import { createCity } from './engine';
import { emptyServices } from './infrastructure-config';
import { emptyMobilityTile } from './road-network';
import { emptyPublicTile } from './public-service-config';
import { newTransitState } from './transit';

type Plain = Record<string, any>;
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Adds keys that exist in the template but not in the target. Never overwrites. */
function fillMissing(target: Plain, template: Plain, path: string, filled: Map<string, number>) {
  for (const [k, v] of Object.entries(template)) {
    if (!(k in target) || target[k] === undefined) {
      target[k] = structuredClone(v);
      filled.set(`${path}.${k}`, (filled.get(`${path}.${k}`) ?? 0) + 1);
    } else if (isPlain(target[k]) && isPlain(v)) fillMissing(target[k], v, `${path}.${k}`, filled);
  }
}

let template: City | null = null;
const reference = () => template ??= createCity(0);

export interface RepairReport { filled: string[] }

/**
 * Repairs a decoded, version-current city in place. Returns the defaulted paths
 * (grouped, e.g. "tiles[*].mobility.footTraffic ×1024"). Structural problems are
 * left for the validators to reject.
 */
export function repairDerivedState(value: unknown): RepairReport {
  const filled = new Map<string, number>();
  if (!isPlain(value)) return { filled: [] };
  const c = value, ref = reference() as unknown as Plain;
  const perTile = (list: unknown, make: (i: number) => Plain, path: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry, i) => { if (isPlain(entry)) fillMissing(entry, make(i), path, filled); });
  };
  if (Array.isArray(c.tiles)) {
    const services = emptyServices(), mobility = emptyMobilityTile(), publicServices = emptyPublicTile();
    for (const t of c.tiles) {
      if (!isPlain(t)) continue;
      if (isPlain(t.services)) fillMissing(t.services, services, 'tiles[*].services', filled);
      if (isPlain(t.mobility)) fillMissing(t.mobility, mobility, 'tiles[*].mobility', filled);
      if (isPlain(t.publicServices)) fillMissing(t.publicServices, publicServices, 'tiles[*].publicServices', filled);
    }
  }
  const transitDefaults = newTransitState() as unknown as Plain;
  if (isPlain(c.safety)) {
    perTile(c.safety.local, i => ref.safety.local[i] ?? ref.safety.local[0], 'safety.local[*]');
    if (isPlain(c.safety.metrics)) fillMissing(c.safety.metrics, ref.safety.metrics, 'safety.metrics', filled);
  }
  if (isPlain(c.governance)) {
    perTile(c.governance.local, i => { const { districtId: _, ...rest } = ref.governance.local[i] ?? ref.governance.local[0]; return rest; }, 'governance.local[*]');
    for (const k of ['housing', 'health', 'forecast']) if (isPlain(c.governance[k])) fillMissing(c.governance[k], ref.governance[k], `governance.${k}`, filled);
  }
  if (isPlain(c.transit)) {
    perTile(c.transit.local, () => transitDefaults.local[0], 'transit.local[*]');
    for (const k of ['stats', 'finance']) if (isPlain(c.transit[k])) fillMissing(c.transit[k], transitDefaults[k], `transit.${k}`, filled);
  }
  if (isPlain(c.mobility)) {
    if (isPlain(c.mobility.stats)) fillMissing(c.mobility.stats, ref.mobility.stats, 'mobility.stats', filled);
    const modes = Object.fromEntries(Object.keys(ref.mobility.stats.modes).map(k => [k, 0]));
    if (Array.isArray(c.mobility.flows)) for (const f of c.mobility.flows) if (isPlain(f) && isPlain(f.modes)) fillMissing(f.modes, modes, 'mobility.flows[*].modes', filled);
  }
  if (isPlain(c.publicServices)) for (const k of ['stats', 'funding', 'costs']) if (isPlain(c.publicServices[k])) fillMissing(c.publicServices[k], ref.publicServices[k], `publicServices.${k}`, filled);
  if (isPlain(c.infrastructure)) for (const k of ['power', 'water']) if (isPlain(c.infrastructure[k])) fillMissing(c.infrastructure[k], ref.infrastructure[k], `infrastructure.${k}`, filled);
  return { filled: [...filled].map(([p, n]) => n > 1 ? `${p} ×${n}` : p) };
}

/** Top-level fields that can never be defaulted. */
export const AUTHORITATIVE_TOP_LEVEL = ['version', 'name', 'size', 'seed', 'tick', 'treasury', 'lastSimulatedTimestamp', 'tiles', 'history',
  'taxes', 'counters', 'milestones', 'developmentQueue', 'clusters', 'infrastructure', 'weather', 'mobility', 'living', 'publicServices', 'governance', 'safety', 'transit'];
export function missingAuthoritative(value: unknown): string | null {
  if (!isPlain(value)) return 'city';
  return AUTHORITATIVE_TOP_LEVEL.find(k => !(k in value) || value[k] === undefined || value[k] === null) ?? null;
}
