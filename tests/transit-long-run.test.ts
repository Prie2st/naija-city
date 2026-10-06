import { describe, expect, it } from 'vitest';
import { advance } from '../shared/simulation/engine';
import { updateMobility } from '../shared/simulation/mobility';
import { createTransitRoute, placeTransitFacility } from '../shared/simulation/transit';
import { transitJourney, transitNetworkDiagnostics } from '../shared/simulation/transit-network';
import { transitNetworkFixture } from '../shared/simulation/transit-fixtures';
import { decodeCity } from '../shared/simulation/save-format';
import type { City } from '../shared/types/city';

// Milestone 8 long-run, route-count and population-scale checks on a living,
// drained city (homes, jobs, services, Danfo/Keke, a BRT corridor and buses).
const sharedShare = (c: City) => { const m = c.mobility.stats.modes, trips = Object.values(m).reduce((a, b) => a + b, 0); return { trips, brt: m.brt / Math.max(1, trips), informal: (m.danfo + m.keke) / Math.max(1, trips) }; };
function checkRoutes(c: City) {
  for (const r of c.transit.routes) {
    expect(Number.isFinite(r.ridership) && Number.isFinite(r.capacity) && Number.isFinite(r.revenue)).toBe(true);
    expect(r.ridership).toBeLessThanOrEqual(r.capacity); expect(r.crowding).toBeLessThanOrEqual(10);
    // Revenue is always fares actually paid: no exploit can create income without riders.
    expect(r.revenue).toBeCloseTo(r.ridership * r.fare * (1 - c.transit.subsidyRate / 100) * 30, 3);
  }
  const f = c.transit.finance, expenses = f.bus + f.brt + f.stations + f.terminals + f.depots;
  expect(f.subsidy).toBeLessThanOrEqual(expenses); expect(Number.isFinite(f.subsidy)).toBe(true);
}

describe('Milestone 8 long-run and scale behaviour', () => {
  it('runs twenty years without runaway, collapse, BRT dominance, Danfo loss or save growth', () => {
    const c = transitNetworkFixture(10000), population = c.population, years: { ridership: number; brt: number; informal: number; size: number; ms: number }[] = [];
    expect(c.transit.routes.every(r => r.status === 'active')).toBe(true);
    for (let year = 0; year < 20; year++) {
      const started = performance.now(); advance(c, 360); const ms = performance.now() - started;
      checkRoutes(c);
      const share = sharedShare(c), ridership = c.transit.routes.reduce((n, r) => n + r.ridership, 0);
      years.push({ ridership, brt: share.brt, informal: share.informal, size: JSON.stringify(c).length, ms });
      expect(ridership).toBeGreaterThan(0); expect(share.brt).toBeLessThan(.5);
      expect(c.transit.local.every(l => l.tod >= 0 && l.tod <= 8)).toBe(true);
      expect(transitNetworkDiagnostics(c).sources).toBeLessThanOrEqual(128); expect(c.transit.demand.length).toBeLessThanOrEqual(768);
    }
    expect(c.population).toBeGreaterThan(population * .5);
    expect(Math.max(...years.map(y => y.ridership))).toBeLessThan(years[0].ridership * 3);
    expect(years.at(-1)!.informal).toBeGreaterThan(0); expect(c.mobility.routes.some(r => r.mode === 'danfo' || r.mode === 'keke')).toBe(true);
    expect(years.at(-1)!.size).toBeLessThan(years[0].size * 1.25);
    expect(years.slice(-3).reduce((n, y) => n + y.ms, 0)).toBeLessThan(years.slice(0, 3).reduce((n, y) => n + y.ms, 0) * 2.5);
    expect(c.transit.history.length).toBeLessThanOrEqual(240); expect(decodeCity(JSON.parse(JSON.stringify(c)))).toEqual(c);
  }, 900000);

  for (const count of [10, 50, 100, 200]) it(`keeps a ${count}-route network bounded and cached`, () => {
    const c = transitNetworkFixture(10000);
    const roads = c.tiles.map((t, id) => ({ t, id })).filter(({ t }) => t.road && (t.x % 4 === 1) && !c.transit.stops.some(s => s.tileId === t.y * 32 + t.x)).map(({ id }) => id);
    for (const id of roads.slice(0, 120)) placeTransitFacility(c, id, 'bus-stop');
    const clear = c.tiles.map((t, id) => ({ t, id })).filter(({ t }) => !t.road && !t.building && !t.zone && !t.publicFacility && !t.infrastructure && !c.transit.stops.some(s => s.tileId === t.y * 32 + t.x));
    for (let n = 0; n < 8 && n < clear.length; n++) placeTransitFacility(c, clear[n * 3].id, 'bus-depot');
    const passenger = c.transit.stops.filter(s => s.kind === 'bus-stop').map(s => s.id);
    let seed = 7919; const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let tries = 0; c.transit.routes.length < count && tries < count * 20; tries++) {
      const length = 2 + Math.floor(next() * 4), picked = new Set<string>();
      while (picked.size < length) picked.add(passenger[Math.floor(next() * passenger.length)]);
      createTransitRoute(c, 'bus', [...picked], 1 + Math.floor(next() * 2));
    }
    expect(c.transit.routes.length).toBeGreaterThanOrEqual(count);
    const before = transitNetworkDiagnostics(c).builds, started = performance.now(); updateMobility(c, false, true); const ms = performance.now() - started;
    expect(transitNetworkDiagnostics(c).builds - before).toBeLessThanOrEqual(1); expect(ms).toBeLessThan(8000);
    // The graph is rebuilt at most once per mobility evaluation; repeated queries reuse it.
    transitJourney(c, c.transit.stops[0].tileId, c.transit.stops.at(-1)!.tileId); const built = transitNetworkDiagnostics(c).builds;
    for (const s of c.transit.stops.slice(0, 20)) transitJourney(c, s.tileId, c.transit.stops.at(-1)!.tileId); expect(transitNetworkDiagnostics(c).builds).toBe(built);
    checkRoutes(c); expect(c.transit.routes.reduce((n, r) => n + r.availableVehicles, 0)).toBeLessThanOrEqual(c.transit.stats.depotCapacity);
    expect(c.transit.routes.reduce((n, r) => n + r.ridership, 0)).toBeGreaterThan(0);
  }, 120000);

  for (const population of [100000, 500000] as const) it(`keeps a ${population.toLocaleString()}-resident transit city aggregate and bounded`, () => {
    const c = transitNetworkFixture(population); expect(c.population).toBe(population);
    const started = performance.now(); updateMobility(c, false, true); const ms = performance.now() - started;
    expect(ms).toBeLessThan(8000); expect(c.mobility.flows.length).toBeLessThanOrEqual(768); expect(c.transit.demand.length).toBeLessThanOrEqual(768); expect(c.transit.local).toHaveLength(1024);
    checkRoutes(c); expect(c.transit.routes.reduce((n, r) => n + r.ridership, 0)).toBeGreaterThan(0);
    advance(c, 30); checkRoutes(c); expect(Number.isFinite(c.treasury)).toBe(true);
  }, 240000);
});
