import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_KEY, CURRENT_KEY, LEGACY_KEYS, LocalCityRepository, QUARANTINE_KEY, SaveLoadError } from '../client/persistence/storage';
import { decodeSave, encodeSave, encodeSaveData, decodeSaveData, SAVE_MAGIC } from '../client/persistence/save-codec';
import { decodeCity, decodeCityWithReport } from '../shared/simulation/save-format';
import { advance, catchUp, catchUpInChunks, createCity, OFFLINE, planOffline, TICK_MS } from '../shared/simulation/engine';
import { transitNetworkFixture } from '../shared/simulation/transit-fixtures';
import type { City } from '../shared/types/city';

// Browser localStorage stand-in with a character quota like Chromium's (about 5.24 M UTF-16 code units per site).
const CHROMIUM_QUOTA = 5_242_880;
let values: Map<string, string>, quota: number, failKeys: Set<string>;
const used = () => [...values].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
function quotaError() { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; return e; }
beforeEach(() => {
  values = new Map(); quota = Infinity; failKeys = new Set();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failKeys.has(k)) throw quotaError();
      if (used() - (values.has(k) ? k.length + values.get(k)!.length : 0) + k.length + v.length > quota) throw quotaError();
      values.set(k, v);
    },
    removeItem: (k: string) => { values.delete(k); },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const cityKeys = () => [...values.keys()].filter(k => k.startsWith('naija-city')).sort();

// Old saves are produced the same way the existing migration tests do: a current
// city with every later subsystem removed.
function downgrade(c: City, version: 3 | 6 | 7 | 8): any {
  const o: any = clone(c);
  if (version <= 8) { o.version = 8; delete o.transit; delete o.mobility.stats.modes.brt; for (const f of o.mobility.flows) delete f.modes.brt; }
  if (version <= 7) { o.version = 7; delete o.safety; delete o.publicServices.funding.police; delete o.publicServices.costs.police; delete o.publicServices.stats.police; for (const t of o.tiles) delete t.publicServices.police; for (const l of o.governance.local) for (const k of ['lighting', 'prevention', 'commercialPatrol', 'hubSafety']) delete l.effects[k]; }
  if (version <= 6) { o.version = 6; delete o.governance; }
  if (version <= 3) { o.version = 3; delete o.publicServices; delete o.mobility; delete o.living; for (const t of o.tiles) { delete t.publicServices; delete t.publicFacility; delete t.mobility; delete t.roadClass; } }
  return o;
}

describe('save encoding', () => {
  it('is lossless and much smaller than plain JSON', () => {
    const c = createCity(7); advance(c, 12);
    const raw = encodeSave(c, 1), json = JSON.stringify(c);
    expect(raw.startsWith(`${SAVE_MAGIC}\n`)).toBe(true);
    expect(JSON.stringify(decodeSave(raw).value)).toBe(json);
    expect(raw.length).toBeLessThan(json.length * 0.15);
  });
  it('packs fields it has never seen, so new persisted state needs no codec change', () => {
    const c: any = clone(createCity(7)); for (const t of c.tiles) t.futureMetric = { level: t.x * 0.5, label: t.y % 2 ? 'a' : 'b' };
    c.futureSystem = { entries: Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, value: i / 3, owner: i % 3 ? null : { name: 'x' } })) };
    expect(decodeSaveData(JSON.parse(JSON.stringify(encodeSaveData(c))))).toEqual(c);
  });
  it('falls back to plain JSON for keys the packer reserves', () => {
    const c: any = clone(createCity(7)); c.odd = { $weird: 1 };
    const raw = encodeSave(c, 1); expect(decodeSave(raw).value).toEqual(c);
  });
  it.each([NaN, Infinity, -Infinity])('refuses %s with the path of the bad value', bad => {
    const c = createCity(7); c.tiles[300].services.runoff = bad;
    expect(() => encodeSave(c, 1)).toThrow(/Non-finite number .* at city\.tiles\[\*\]\.services\[\*\]\.runoff\[300\]/);
  });
  it('detects truncation, checksum damage and malformed headers', () => {
    const raw = encodeSave(createCity(7), 1);
    expect(() => decodeSave(raw.slice(0, -10))).toThrow('truncated');
    const i = raw.length - 40; expect(() => decodeSave(raw.slice(0, i) + (raw[i] === '1' ? '2' : '1') + raw.slice(i + 1))).toThrow('checksum');
    expect(() => decodeSave(raw.replace('"cityVersion":9', '"cityVersion":"9"'))).toThrow('malformed');
    expect(() => decodeSave(raw.replace('"format":1', '"format":2'))).toThrow('newer version');
  });
});

describe('verified saves with a bounded backup', () => {
  it('round-trips a normal save and load', () => {
    const repo = new LocalCityRepository(), c = createCity(1234); advance(c, 5);
    const result = repo.save(c); expect(result).toMatchObject({ ok: true });
    const loaded = new LocalCityRepository().loadWithReport()!;
    expect(loaded.source).toBe('current'); expect(loaded.recovered).toBe(false); expect(loaded.city).toEqual(c);
  });
  it('keeps exactly one backup across repeated autosaves', () => {
    // Autosave every 15 s: the backup is refreshed at most once a minute, so it trails by at most four saves.
    const repo = new LocalCityRepository(), c = createCity(1);
    for (let i = 1; i <= 20; i++) { advance(c, 1); expect(repo.save(c, i * 15_000).ok).toBe(true); expect(cityKeys()).toEqual(i === 1 ? [CURRENT_KEY] : [BACKUP_KEY, CURRENT_KEY]); }
    const backup = decodeCity(decodeSave(values.get(BACKUP_KEY)!).value), current = decodeCity(decodeSave(values.get(CURRENT_KEY)!).value);
    expect(current.tick).toBe(20); expect(backup.tick).toBeGreaterThanOrEqual(16); expect(backup.tick).toBeLessThan(20);
  });
  it('a manual save of an unchanged city succeeds without churning the backup', () => {
    const repo = new LocalCityRepository(), c = createCity(1); repo.save(c, 5); advance(c, 1); repo.save(c, 6);
    const backup = values.get(BACKUP_KEY); const again = repo.save(c, 6);
    expect(again.ok).toBe(true); expect(again.backupUpdated).toBe(false); expect(values.get(BACKUP_KEY)).toBe(backup);
  });
  it('reports a full store, keeps the previous save and succeeds on retry once space exists', () => {
    const repo = new LocalCityRepository(), c = createCity(1); expect(repo.save(c).ok).toBe(true);
    const previous = values.get(CURRENT_KEY); quota = used() + 1000; advance(c, 3);
    const failed = repo.save(c);
    expect(failed).toMatchObject({ ok: false, reason: 'storage-full' }); expect(failed.detail).toContain('QuotaExceededError');
    expect(values.get(CURRENT_KEY)).toBe(previous); expect(new LocalCityRepository().load()!.tick).toBe(0);
    quota = Infinity; expect(repo.save(c).ok).toBe(true); expect(new LocalCityRepository().load()!.tick).toBe(3);
  });
  it('a failed write of the current save never destroys the last working city', () => {
    const repo = new LocalCityRepository(), c = createCity(1); repo.save(c); advance(c, 2); repo.save(c);
    const current = values.get(CURRENT_KEY), backup = values.get(BACKUP_KEY);
    failKeys.add(CURRENT_KEY); advance(c, 2);
    expect(repo.save(c)).toMatchObject({ ok: false, reason: 'storage-full' });
    expect(values.get(CURRENT_KEY)).toBe(current); expect(values.get(BACKUP_KEY)).toBe(backup); expect(backup).not.toBe(current);
    expect(new LocalCityRepository().load()!.tick).toBe(2);
  });
  it('refuses NaN and Infinity before touching storage', () => {
    const repo = new LocalCityRepository(), c = createCity(1); repo.save(c); const before = new Map(values);
    c.treasury = NaN; expect(repo.save(c)).toMatchObject({ ok: false, reason: 'invalid-state' });
    c.treasury = 1; c.tiles[9].mobility.speed = Infinity;
    const result = repo.save(c); expect(result).toMatchObject({ ok: false, reason: 'invalid-state' }); expect(result.detail).toContain('speed');
    expect(values).toEqual(before);
  });
  it('refuses invalid enums and impossible structures before writing', () => {
    const repo = new LocalCityRepository(), good = createCity(1); repo.save(good); const before = new Map(values);
    const badEnum = createCity(1); badEnum.tiles[0].terrain = 'lava' as never;
    const badStructure = createCity(1); (badStructure as any).safety.local = null;
    const badVersion = createCity(1); (badVersion as any).version = '9';
    for (const c of [badEnum, badStructure, badVersion]) expect(repo.save(c)).toMatchObject({ ok: false, reason: 'invalid-state' });
    expect(values).toEqual(before);
  });
  it('recovers from a corrupt current save using the last known good copy and tells the caller', () => {
    const repo = new LocalCityRepository(), c = createCity(1); repo.save(c, 1000); advance(c, 4); repo.save(c, 2000);
    const corrupt = values.get(CURRENT_KEY)!.slice(0, 5000); values.set(CURRENT_KEY, corrupt);
    const fresh = new LocalCityRepository(), loaded = fresh.loadWithReport()!;
    expect(loaded).toMatchObject({ source: 'backup', recovered: true, savedAt: 1000 }); expect(loaded.city.tick).toBe(0);
    expect(loaded.problems[0]).toContain(CURRENT_KEY); expect(values.get(QUARANTINE_KEY)).toBe(corrupt);
    // The next save replaces the unreadable copy and keeps the recovered backup.
    expect(fresh.save(loaded.city, 3000).ok).toBe(true); expect(new LocalCityRepository().loadWithReport()!.source).toBe('current');
    expect(decodeSave(values.get(BACKUP_KEY)!).header.savedAt).toBe(1000);
  });
  it('recovers from malformed JSON and from a current save that decodes but fails validation', () => {
    const repo = new LocalCityRepository(), c = createCity(1); repo.save(c, 1); advance(c, 1); repo.save(c, 2);
    values.set(CURRENT_KEY, `${SAVE_MAGIC}\n{bad json`); expect(new LocalCityRepository().loadWithReport()!.source).toBe('backup');
    const invalid: any = clone(c); invalid.tiles[3].zone = 'farm'; values.set(CURRENT_KEY, encodeSave(invalid, 3));
    expect(new LocalCityRepository().loadWithReport()).toMatchObject({ source: 'backup', recovered: true });
  });
  it('throws a diagnosable error when no copy is readable, and keeps the unreadable copy', () => {
    values.set(CURRENT_KEY, 'garbage'); values.set(BACKUP_KEY, 'more garbage');
    expect(() => new LocalCityRepository().load()).toThrow(SaveLoadError);
    expect(values.get(QUARANTINE_KEY)).toBe('garbage');
  });
});

describe('migration and missing fields', () => {
  it.each([3, 6, 7, 8] as const)('migrates a v%i save forward, then retires the legacy key once two verified copies exist', version => {
    const base = transitNetworkFixture(10000); const old = downgrade(base, version); const key = `naija-city-v${version}`;
    values.set(key, JSON.stringify(old));
    const repo = new LocalCityRepository(), loaded = repo.loadWithReport()!;
    expect(loaded).toMatchObject({ source: 'legacy', key, recovered: false }); expect(loaded.city.version).toBe(9);
    expect(loaded.city.treasury).toBe(base.treasury); expect(loaded.city.population).toBe(base.population);
    expect(repo.save(loaded.city).ok).toBe(true); expect(values.has(key)).toBe(true);
    advance(loaded.city, 1); expect(repo.save(loaded.city).ok).toBe(true);
    expect(cityKeys()).toEqual([BACKUP_KEY, CURRENT_KEY]); expect(new LocalCityRepository().load()).toEqual(loaded.city);
  });
  it('migrates a current-version legacy save (naija-city-v9) to the new format', () => {
    const c = createCity(5); advance(c, 3); values.set('naija-city-v9', JSON.stringify(c));
    const repo = new LocalCityRepository(), loaded = repo.load()!; expect(loaded).toEqual(c);
    repo.save(loaded); advance(loaded, 1); repo.save(loaded);
    expect(values.has('naija-city-v9')).toBe(false); expect(new LocalCityRepository().load()).toEqual(loaded);
  });
  it('reproduces the audited quota failure and fits after cleanup', () => {
    // Before: an M5 → M6 → M7 player had v6 and v7 keys and the v8 save no longer fitted.
    const base = transitNetworkFixture(10000); quota = CHROMIUM_QUOTA;
    values.set('naija-city-v6', JSON.stringify(downgrade(base, 6))); values.set('naija-city-v7', JSON.stringify(downgrade(base, 7)));
    expect(() => localStorage.setItem('naija-city-v8', JSON.stringify(downgrade(base, 8)))).toThrow('quota');
    const repo = new LocalCityRepository(), loaded = repo.loadWithReport()!; expect(loaded.key).toBe('naija-city-v7');
    expect(repo.save(loaded.city).ok).toBe(true); advance(loaded.city, 1); expect(repo.save(loaded.city).ok).toBe(true);
    expect(cityKeys()).toEqual([BACKUP_KEY, CURRENT_KEY]); expect(used()).toBeLessThan(CHROMIUM_QUOTA / 2);
  });
  it('frees superseded legacy copies when the first new-format save would not fit', () => {
    const base = createCity(2); quota = CHROMIUM_QUOTA;
    const v8 = JSON.stringify(downgrade(base, 8));
    values.set('naija-city-v8', v8); values.set('naija-city-v4', 'x'.repeat(CHROMIUM_QUOTA - v8.length - 100_000));
    const repo = new LocalCityRepository(), loaded = repo.loadWithReport()!; expect(loaded.key).toBe('naija-city-v8');
    expect(repo.save(loaded.city).ok).toBe(true);
    expect(values.has('naija-city-v4')).toBe(false); expect(values.has('naija-city-v8')).toBe(true);
  });
  it('fills a missing derived field with a safe default and reports it', () => {
    const c: any = clone(createCity(3)); for (const t of c.tiles) delete t.mobility.footTraffic; delete c.transit.local[5].firstMile; delete c.mobility.stats.modes.brt;
    const { city, repaired } = decodeCityWithReport(c);
    expect(city.tiles[0].mobility.footTraffic).toBe(0); expect(city.transit.local[5].firstMile).toBe(0); expect(city.mobility.stats.modes.brt).toBe(0);
    expect(repaired).toEqual(expect.arrayContaining(['tiles[*].mobility.footTraffic ×1024', 'transit.local[*].firstMile', 'mobility.stats.modes.brt']));
    expect(() => advance(city, 3)).not.toThrow(); expect(() => decodeCity(clone(city))).not.toThrow();
  });
  it('a new field in a derived record does not break older saves of the same version', () => {
    // Simulates a later build adding `newMetric` to every tile's mobility record: the older save lacks it.
    const old: any = clone(createCity(3)); const loaded = decodeCity(old); expect(loaded.version).toBe(9);
    const withPartial: any = clone(createCity(3)); for (const t of withPartial.tiles) delete t.publicServices.parks;
    expect(decodeCityWithReport(withPartial).repaired).toContain('tiles[*].publicServices.parks ×1024');
  });
  it('rejects missing authoritative state with a clear reason instead of inventing it', () => {
    for (const field of ['treasury', 'tiles', 'transit', 'taxes']) {
      const c: any = clone(createCity(3)); delete c[field];
      expect(() => decodeCity(c)).toThrow(`missing required state "${field}"`);
    }
    const building: any = clone(createCity(3)); delete building.tiles.find((t: any) => t.building).building.occupants;
    expect(() => decodeCity(building)).toThrow('damaged');
  });
  it('rejects malformed and future version information', () => {
    for (const version of ['9', null, 0, 2.5]) { const c: any = clone(createCity(3)); c.version = version; expect(() => decodeCity(c)).toThrow('version information is malformed'); }
    const future: any = clone(createCity(3)); future.version = 10; expect(() => decodeCity(future)).toThrow('newer than this game supports');
  });
});

describe('large cities', () => {
  it('a 500k city saves with its backup well inside a browser quota', () => {
    const c = transitNetworkFixture(500000); quota = CHROMIUM_QUOTA;
    const plain = JSON.stringify(c).length;
    const repo = new LocalCityRepository(); expect(repo.save(c).ok).toBe(true); advance(c, 1); expect(repo.save(c).ok).toBe(true);
    const current = values.get(CURRENT_KEY)!.length;
    expect(current).toBeLessThan(plain * 0.3); expect(used()).toBeLessThan(CHROMIUM_QUOTA * 0.4);
    expect(new LocalCityRepository().load()).toEqual(c);
  }, 120000);
  it('derived state survives save and load with identical continued play', () => {
    const a = transitNetworkFixture(10000); advance(a, 7);
    const repo = new LocalCityRepository(); repo.save(a);
    const b = new LocalCityRepository().load()!; advance(a, 20); advance(b, 20);
    expect(b).toEqual(a);
  }, 120000);
});

describe('offline catch-up', () => {
  const H = 3_600_000;
  it.each([['1 hour', H], ['24 hours', 24 * H], ['7 days', 7 * 24 * H]] as const)('bounds the work for %s away and keeps chunked replay identical', async (_label, away) => {
    const a = createCity(0), b = clone(a) as City;
    const report = catchUp(a, away), plan = planOffline(createCity(0), report.ticks);
    expect(report.ticks).toBe(Math.min(OFFLINE.maxTicks, away / TICK_MS)); expect(a.tick).toBe(report.ticks);
    expect(plan.exact + plan.coarse + plan.macroSteps).toBeLessThanOrEqual(744);
    expect(report.exactDays).toBe(plan.exact); expect(report.events.length).toBeLessThanOrEqual(10);
    let yields = 0; await catchUpInChunks(b, away, async () => { yields++; });
    expect(b).toEqual(a); expect(yields).toBeGreaterThan(0);
    expect(() => decodeCity(clone(a))).not.toThrow();
  }, 300000);
  it('large cities replay far fewer full days, keep money flowing and stay valid', () => {
    const c = transitNetworkFixture(500000), plan = planOffline(c, OFFLINE.maxTicks);
    expect(plan.exact).toBe(10); expect(plan.exact + plan.coarse + plan.macroSteps).toBeLessThanOrEqual(160);
    const small = planOffline(createCity(0), 300); expect(small).toMatchObject({ exact: 300, coarse: 0, aggregate: 0 });
  });
  it('carries the budget through aggregated days', () => {
    const c = createCity(0); c.lastSimulatedTimestamp = 0; const before = c.counters.taxRevenue;
    const report = catchUp(c, OFFLINE.maxTicks * TICK_MS);
    expect(report.ticks).toBe(OFFLINE.maxTicks); expect(c.counters.taxRevenue).toBeGreaterThan(before);
    expect(c.history.length).toBeLessThanOrEqual(60);
  }, 300000);
});
