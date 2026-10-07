import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { CURRENT_KEY, LocalCityRepository } from '../client/persistence/storage';
import { validateCityState } from '../shared/simulation/save-format';
import { advance } from '../shared/simulation/engine';

// Real saves written by the pre-integration builds, so the integrated game is checked against what
// players actually have on their devices, not against downgraded copies of a current city.
// Both are a drained 6k city with a depot, ten stops and two running bus routes (4 and 3 buses).
//   m8-175fd99:  plain-JSON v9 under naija-city-v9, written by the M8 head before integration.
//   m81-2c4de92: the compact verified envelope under naija-city-save-current, written by M8.1.
const fixture = (name: string) => gunzipSync(readFileSync(`tests/fixtures/${name}`)).toString('utf8');
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); }, key: (i: number) => [...values.keys()][i] ?? null, get length() { return values.size; } });
});
const transitShape = (c: any) => JSON.stringify([c.transit.stops.map((s: any) => [s.id, s.kind, s.tileId]), c.transit.routes.map((r: any) => [r.id, r.mode, r.stops, r.vehicles, r.fare, r.path]), c.transit.corridors, c.transit.junctions, c.transit.subsidyRate]);

describe('saves written before Milestone 8 integration', () => {
  for (const [name, key] of [['m8-175fd99-transit-v9.json.gz', 'naija-city-v9'], ['m81-2c4de92-transit-save-current.txt.gz', CURRENT_KEY]] as const) {
    it(`${name} loads with its transport intact and keeps playing`, () => {
      values.set(key, fixture(name));
      const loaded = new LocalCityRepository().loadWithReport()!;
      expect(loaded.key).toBe(key); expect(loaded.recovered).toBe(false); expect(loaded.repaired).toEqual([]);
      const c = loaded.city, before = transitShape(c);
      expect(c.version).toBe(9); expect(c.transit.routes).toHaveLength(2); expect(c.transit.stops.some(s => s.kind === 'bus-depot')).toBe(true);
      advance(c, 60);
      expect(validateCityState(c)).toBeNull();
      expect(transitShape(c)).toBe(before);
      expect(c.transit.stats.ridership).toBeGreaterThan(0);
      expect(new LocalCityRepository().save(c).ok).toBe(true);
      expect(JSON.stringify(new LocalCityRepository().load())).toBe(JSON.stringify(c));
    }, 120000);
  }
});
