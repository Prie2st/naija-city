import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalCityRepository } from '../client/persistence/storage';
import { createCity } from '../shared/simulation/engine';

function legacySave() {
  const city = createCity(1234);
  return { version: 1, name: city.name, size: city.size, seed: city.seed, tick: 24, treasury: city.treasury,
    population: 500, jobs: 120, income: 900000, expenses: 90000, lastSimulatedTimestamp: 1234, history: ['Original history'],
    tiles: city.tiles.map(t => ({ x: t.x, y: t.y, terrain: t.terrain, road: t.road, zone: t.zone, progress: 0,
      building: t.building ? { level: t.building.level, age: 24, occupants: t.building.occupants, jobs: t.building.jobs } : null })) };
}
describe('versioned local persistence boundary', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map(); vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  });
  it('returns no city for empty storage and round-trips complete state', () => {
    const repo = new LocalCityRepository(), c = createCity(1234); expect(repo.load()).toBeNull(); repo.save(c); expect(repo.load()).toEqual(c);
  });
  it('retains the untouched v4 backup when saving a migrated living city', () => {
    const old: any=JSON.parse(JSON.stringify(createCity(1234)));old.version=4;delete old.living;
    const raw=JSON.stringify(old);values.set('naija-city-v4',raw);
    const repo=new LocalCityRepository(),c=repo.load()!;expect(c.version).toBe(9);repo.save(c);
    expect(values.get('naija-city-v4')).toBe(raw);expect(repo.load()).toEqual(c);
  });
  it('migrates v1 without changing residents, map, treasury or timestamp and preserves the original key', () => {
    const raw = JSON.stringify(legacySave()); values.set('naija-city-v1', raw);
    const repo = new LocalCityRepository(), migrated = repo.load()!;
    expect(migrated.version).toBe(9); expect(migrated.population).toBe(500); expect(migrated.tick).toBe(24);
    expect(migrated.treasury).toBe(500000000); expect(migrated.lastSimulatedTimestamp).toBe(1234);
    expect(migrated.tiles.map(t => [t.road, t.zone, t.terrain])).toEqual(legacySave().tiles.map(t => [t.road, t.zone, t.terrain]));
    expect(migrated.tiles.find(t => t.building)?.building?.maximumOccupancy).toBeGreaterThan(100);
    repo.save(migrated); expect(values.get('naija-city-v1')).toBe(raw); expect(repo.load()).toEqual(migrated);
  });
  it('rejects malformed or unknown saves rather than passing invalid state to the renderer', () => {
    const repo = new LocalCityRepository(), c = createCity(); c.tiles[0].terrain = 'broken' as typeof c.tiles[0]['terrain']; repo.save(c);
    expect(() => repo.load()).toThrow('damaged'); values.set('naija-city-v6', '{bad json'); expect(() => repo.load()).toThrow();
    values.set('naija-city-v6', JSON.stringify({ ...createCity(), version: 99 })); expect(() => repo.load()).toThrow();
  });
  it('rejects damaged construction, duplicate IDs and missing economic state', () => {
    const repo = new LocalCityRepository();
    const c = createCity(); c.tiles.find(t => t.building)!.building!.constructionProgress = Infinity; repo.save(c); expect(() => repo.load()).toThrow();
    const other = createCity(); const buildings = other.tiles.filter(t => t.building); buildings[1].building!.id = buildings[0].building!.id;
    repo.save(other); expect(() => repo.load()).toThrow();
    const missing = createCity() as unknown as Record<string, unknown>; delete missing.demand;
    values.set('naija-city-v6', JSON.stringify(missing)); expect(() => repo.load()).toThrow();
  });
  it('migrates v2 with starter services while retaining the original economic city and backup', () => {
    const original = JSON.parse(JSON.stringify(createCity(1234)));
    original.version = 2; delete original.infrastructure; delete original.weather;
    for (const t of original.tiles) {
      delete t.infrastructure; delete t.services;
      if (t.building) { delete t.building.generator; delete t.building.privateWater; delete t.building.privateBorehole; delete t.building.floodClosed; }
    }
    const raw = JSON.stringify(original); values.set('naija-city-v2', raw);
    const repo = new LocalCityRepository(), migrated = repo.load()!;
    expect(migrated.version).toBe(9); expect(migrated.population).toBe(original.population);
    expect(migrated.treasury).toBe(original.treasury); expect(migrated.lastSimulatedTimestamp).toBe(1234);
    expect(migrated.tiles.filter(t => t.infrastructure)).toHaveLength(4);
    repo.save(migrated); expect(values.get('naija-city-v2')).toBe(raw); expect(repo.load()).toEqual(migrated);
  });
});
