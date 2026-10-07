import { describe, expect, it } from 'vitest';
import { advance, applyTool, catchUp, COSTS, createCity, roadAccess, step, tileAt, TICK_MS } from '../shared/simulation/engine';
import { debugAction } from '../shared/simulation/debug';

describe('preserved playable city contracts', () => {
  it('starts with the specified settlement', () => {
    const c = createCity(0); expect(c.tiles).toHaveLength(1024); expect(c.population).toBe(500);
    expect(c.treasury).toBe(500000000); expect(c.jobs).toBeGreaterThan(0);
  });
  it('charges once for roads and rejects water or occupied tiles', () => {
    const c = createCity(0); expect(applyTool(c, 10, 10, 'road')).toBe('');
    expect(c.treasury).toBe(500000000 - COSTS.road); applyTool(c, 10, 10, 'road');
    expect(c.treasury).toBe(500000000 - COSTS.road);
    expect(applyTool(c, 31, 0, 'road')).toContain('protected'); expect(applyTool(c, 12, 10, 'road')).toContain('Clear');
  });
  it('rejects unaffordable construction', () => {
    const c = createCity(0); c.treasury = 0; expect(applyTool(c, 10, 10, 'road')).toContain('low'); expect(tileAt(c, 10, 10)!.road).toBe(false);
  });
  it('requires road access and develops through timed construction rather than instant zoning', () => {
    const c = createCity(0); applyTool(c, 10, 10, 'residential'); advance(c, 20); expect(tileAt(c, 10, 10)!.building).toBeNull();
    applyTool(c, 11, 10, 'road'); expect(roadAccess(c, tileAt(c, 10, 10)!)).toBe(true);
    debugAction(c, 'demand-residential'); advance(c, 9);
    expect(tileAt(c, 10, 10)!.building?.openedAt ?? null).toBeNull();
    // Demand reacts to traffic results, which refresh every third day, so allow one cadence of slack.
    advance(c, 18); expect(tileAt(c, 10, 10)!.building?.constructionState).toBe('complete');
  });
  it('creates job capacity and collects tax automatically', () => {
    const c = createCity(0); applyTool(c, 14, 17, 'commercial'); applyTool(c, 12, 17, 'industrial');
    advance(c, 45); expect(c.jobs).toBeGreaterThan(120);
    const treasury = c.treasury; step(c); expect(c.treasury - treasury).toBeCloseTo((c.income - c.expenses) / 30);
  });
  it('retains displaced residents when a home is cleared', () => {
    const c = createCity(0); applyTool(c, 12, 10, 'bulldoze'); expect(c.population).toBe(500); expect(c.occupiedHousing).toBe(400); expect(c.governance.housing.displacedResidents).toBe(100);
  });
  it('produces identical online and offline states', () => {
    const a = createCity(0), b = createCity(0);
    for (const c of [a, b]) { applyTool(c, 14, 17, 'commercial'); applyTool(c, 12, 17, 'residential'); }
    advance(a, 300); a.lastSimulatedTimestamp = 300 * TICK_MS; catchUp(b, 300 * TICK_MS);
    expect(b).toEqual(a); expect(JSON.parse(JSON.stringify(b))).toEqual(b);
  }, 30000);
  it('ignores negative elapsed time and caps long offline periods', () => {
    const c = createCity(10000); expect(catchUp(c, 9000).ticks).toBe(0);
    expect(catchUp(c, 1000 * 86400000).ticks).toBe(17280);
  }, 240000);
});
