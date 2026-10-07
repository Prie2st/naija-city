import { afterEach, describe, expect, it } from 'vitest';
import { advance, applyTool, applyToolBatch, beginToolBatch, createCity, endToolBatch, step, tileAt, toolBatchOpen } from '../shared/simulation/engine';
import { updateMobility } from '../shared/simulation/mobility';
import { MOBILITY } from '../shared/simulation/transit-config';
import { transitJourney } from '../shared/simulation/transit-network';
import { transitNetworkFixture } from '../shared/simulation/transit-fixtures';
import { decodeCity } from '../shared/simulation/save-format';
import { setPerfSink, type PerfChannel } from '../shared/simulation/perf-counters';
import type { City } from '../shared/types/city';

// Milestone 8.3: scheduling, batching and route-finding performance must not change outcomes.
const outcome = (c: City) => JSON.stringify({ tick: c.tick, population: c.population, treasury: c.treasury, mobility: c.mobility, transit: c.transit, roads: c.tiles.map(t => t.mobility) });
const counting = () => { const counts: Partial<Record<PerfChannel, number>> = {}; setPerfSink(channel => { counts[channel] = (counts[channel] ?? 0) + 1; }); return counts; };
afterEach(() => setPerfSink(null));

describe('traffic evaluation cadence', () => {
  const c = transitNetworkFixture(10000);
  advance(c, 6);
  it('evaluates traffic every third day and keeps the last result in between', () => {
    while (c.tick % MOBILITY.cadence !== MOBILITY.cadence - 1) step(c);
    const runs: number[] = [];
    for (let i = 0; i < 30; i++) { const revision = c.mobility.revision, flows = c.mobility.flows; step(c); if (c.mobility.revision !== revision) runs.push(c.tick); else expect(c.mobility.flows).toBe(flows); }
    // Every cadence day evaluates; a large resident or job swing may add an occasional extra run.
    for (let tick = c.tick - 29; tick <= c.tick; tick++) if (tick % MOBILITY.cadence === 0) expect(runs).toContain(tick);
    expect(runs.length).toBeLessThanOrEqual(13);
    expect(c.mobility.lastTick % MOBILITY.cadence).toBe(0);
  });
  it('re-evaluates at once when the road network changes between cadence days', () => {
    while (c.tick % MOBILITY.cadence === 0) step(c);
    const road = c.tiles.find(t => t.road && t.roadClass === 'local' && !c.transit.stops.some(s => s.tileId === t.y * c.size + t.x))!;
    const revision = c.mobility.revision, lastTick = c.mobility.lastTick;
    applyTool(c, road.x, road.y, 'avenue');
    expect(c.mobility.revision).toBe(revision + 1);
    // A tool's evaluation does not consume the days the next scheduled evaluation accounts for.
    expect(c.mobility.lastTick).toBe(lastTick);
    expect(c.tiles[road.y * c.size + road.x].mobility.capacity).toBeGreaterThan(140);
  });
  it('continues identically after a save and reload between cadence days', () => {
    while (c.tick % MOBILITY.cadence === 0) step(c);
    const reloaded = decodeCity(JSON.parse(JSON.stringify(c)));
    advance(c, 10); advance(reloaded, 10);
    expect(outcome(reloaded)).toBe(outcome(c));
  });
  it('reproduces the same transit journeys from a fresh cache', () => {
    const copy = JSON.parse(JSON.stringify(c)) as City;
    const plans = c.mobility.flows.slice(0, 60).map(f => JSON.stringify(transitJourney(c, f.origin, f.destination)));
    expect(plans.some(p => p !== 'null')).toBe(true);
    expect(copy.mobility.flows.slice(0, 60).map(f => JSON.stringify(transitJourney(copy, f.origin, f.destination)))).toEqual(plans);
  });
  it('reports traffic and transit search timings to a developer sink', () => {
    const counts = counting(); updateMobility(c, false, true); step(c);
    expect(counts.traffic).toBeGreaterThanOrEqual(1); expect(counts['transit-search']).toBeGreaterThanOrEqual(1); expect(counts['sim-day']).toBe(1);
  });
});

describe('batched tool strokes', () => {
  const stroke = Array.from({ length: 6 }, (_, i) => ({ x: 4 + i, y: 22 }));
  it('applies every tile at once but recomputes the city once per stroke', () => {
    const batched = createCity(0), single = createCity(0);
    const counts = counting();
    beginToolBatch(batched);
    for (const t of stroke) { expect(applyTool(batched, t.x, t.y, 'road')).toBe(''); expect(tileAt(batched, t.x, t.y)!.road).toBe(true); }
    expect(counts['tool-recompute'] ?? 0).toBe(0);
    expect(endToolBatch(batched)).toBe(true); expect(counts['tool-recompute']).toBe(1); expect(toolBatchOpen(batched)).toBe(false);
    for (const t of stroke) applyTool(single, t.x, t.y, 'road');
    expect(counts['tool-recompute']).toBe(1 + stroke.length);
    // Same tiles, cost and derived road state as painting tile by tile.
    expect(batched.treasury).toBe(single.treasury);
    expect(batched.tiles.map(t => [t.road, t.roadClass, t.zone, t.services.powerCoverage, t.mobility.capacity])).toEqual(single.tiles.map(t => [t.road, t.roadClass, t.zone, t.services.powerCoverage, t.mobility.capacity]));
    expect(batched.mobility.flows.length).toBe(single.mobility.flows.length);
  });
  it('reports the first error and settles a stroke left open before the next day', () => {
    const c = createCity(0);
    expect(applyToolBatch(c, [{ x: 31, y: 0 }, { x: 4, y: 24 }], 'road')).toContain('protected');
    expect(tileAt(c, 4, 24)!.road).toBe(true);
    const counts = counting();
    beginToolBatch(c); applyTool(c, 5, 24, 'road'); step(c);
    expect(counts['tool-recompute']).toBe(1); expect(c.tiles[24 * 32 + 5].mobility.capacity).toBeGreaterThan(0);
    expect(endToolBatch(c)).toBe(false);
  });
});
