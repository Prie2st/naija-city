import { describe, expect, it } from 'vitest';
import { advance, applyTool, catchUp, createCity, refreshCity, TICK_MS } from '../shared/simulation/engine';
import { createBuilding, setTypology } from '../shared/simulation/buildings';
import { initializeMobility, updateMobility, chooseModes, formalizeRoute, establishBus, changeBusFleet } from '../shared/simulation/mobility';
import { congestionFor, roadPath, invalidateRoadGraph, roadPerformance, ROADS } from '../shared/simulation/road-network';
import { decodeCity } from '../shared/simulation/save-format';
import { operateBusinesses } from '../shared/simulation/economy';
import { updateLandValues, attractiveness } from '../shared/simulation/development';
import { detectCityPulse, CityPulseTracker } from '../client/ui/city-pulse';
import { initializeLiving } from '../shared/simulation/living-city';
function corridor(length = 18, level = 5) {
  const c = createCity(1000, 123);
  for (const t of c.tiles) { t.terrain = 'land'; t.road = false; t.zone = null; t.building = null; t.infrastructure = null; t.services.floodDepth = 0; t.services.roadCondition = 100; }
  for (let x = 2; x <= 2 + length; x++) c.tiles[5 * 32 + x].road = true;
  const home = c.tiles[4 * 32 + 2], job = c.tiles[4 * 32 + 2 + length];
  home.zone = 'residential'; home.building = createBuilding('residential', 130, c.seed, 0, true); setTypology(home.building, level); home.building.occupants = home.building.maximumOccupancy;
  job.zone = 'commercial'; job.building = createBuilding('commercial', job.y * 32 + job.x, c.seed, 0, true); setTypology(job.building, level); job.building.jobs = Math.min(job.building.maximumJobs, Math.floor(home.building.occupants * 0.45));
  c.infrastructure.revision++; c.clusters = []; refreshCity(c); initializeMobility(c); refreshCity(c); initializeLiving(c); return c;
}
function mobilityDays(c: ReturnType<typeof createCity>, days: number) { for (let i = 0; i < days; i++) { c.tick++; updateMobility(c); } }
describe('aggregate mobility', () => {
  it('generates actual work/shopping flows with spatial employer targets and conserved mode totals', () => {
    const c = corridor(); expect(c.mobility.flows.some(f => f.purpose === 'work' && f.trips > 0)).toBe(true);
    expect(c.mobility.flows.some(f => f.purpose === 'shopping')).toBe(true);
    expect(Object.values(c.mobility.jobTargets).reduce((s, n) => s + n, 0)).toBeLessThanOrEqual(c.workforce);
    for (const f of c.mobility.flows) expect(Object.values(f.modes).reduce((s, n) => s + n, 0)).toBe(f.trips);
    expect(c.tiles.some(t => t.road && t.mobility.dailyTrips > 0)).toBe(true);
    expect(c.mobility.stats.modes.car).toBeGreaterThan(0); expect(c.mobility.stats.modes.okada).toBeGreaterThan(0);
  });
  it('routes deterministically around a blocked segment and disconnects inaccessible jobs', () => {
    const c = corridor(); expect(roadPath(c, 162, 180)?.path).toHaveLength(19);
    c.tiles[170].services.floodDepth = 95; updateMobility(c, false, true);
    expect(roadPath(c, 162, 180)).toBeNull(); expect(c.mobility.stats.reachableWorkers).toBe(0);
    expect(c.mobility.stats.jobAccessibility).toBe(0);
    for (let x = 9; x <= 11; x++) { c.tiles[6 * 32 + x].road = true; c.tiles[6 * 32 + x].roadClass = 'local'; }
    updateMobility(c, false, true); expect(roadPath(c, 162, 180)?.path).not.toContain(170); expect(c.mobility.stats.reachableWorkers).toBeGreaterThan(0);
  });
  it('explains weak access on isolated zoned roads before private construction', () => {
    const c = corridor(); const t = c.tiles[20 * 32 + 20], isolatedRoad = c.tiles[21 * 32 + 20];
    t.zone = 'residential'; isolatedRoad.road = true; isolatedRoad.roadClass = 'local';
    updateMobility(c, false, true);
    expect(t.mobility.accessibility).toBe(0);
    expect(attractiveness(c, t).factors.find(f => f.label.startsWith('Job accessibility'))!.value).toBeLessThan(0);
  });
  it('offers short walk trips without adding their trips to vehicle demand', () => {
    const c = corridor(2, 1), f = c.mobility.flows[0]; expect(f.modes.walk).toBeGreaterThan(0);
    const noRoad = corridor(1, 1); noRoad.tiles.filter(t => t.road).forEach(t => { t.road = false; t.roadClass = null; }); updateMobility(noRoad, false, true);
    expect(noRoad.mobility.stats.modes.walk).toBeGreaterThan(0); expect(noRoad.mobility.stats.modes.car).toBe(0);
    const wet = chooseModes(c, { ...f, trips: 100 }, 40); c.weather.rainfall = 65; const rain = chooseModes(c, { ...f, trips: 100 }, 40); expect(rain.walk).toBeLessThan(wet.walk);
  });
  it('degrades congestion progressively and upgrades roads while preserving adjacent buildings and drains', () => {
    expect(congestionFor(70, 140)).toBeLessThan(congestionFor(140, 140)); expect(congestionFor(150, 140)).toBeLessThan(60);
    const c = corridor(); const before = c.tiles[170].mobility.congestion, b = c.tiles[130].building;
    expect(applyTool(c, 10, 5, 'avenue')).toBe(''); expect(c.tiles[170].roadClass).toBe('avenue');
    expect(c.tiles[170].mobility.congestion).toBeLessThan(before); expect(c.tiles[130].building).toBe(b);
    expect(ROADS.major.upkeep).toBeGreaterThan(ROADS.local.upkeep);
  });
  it('creates organic Keke and Danfo only after sustained connected demand', () => {
    const c = corridor(); expect(c.mobility.routes).toHaveLength(0); mobilityDays(c, 12);
    expect(c.mobility.routes.some(r => r.mode === 'danfo')).toBe(true);
    expect(c.mobility.routes[0].ridership).toBeGreaterThan(0); expect(c.mobility.routes[0].vehicles).toBeGreaterThan(1);
    const k = corridor(6, 3); mobilityDays(k, 12); expect(k.mobility.routes.some(r => r.mode === 'keke')).toBe(true);
  });
  it('avoids duplicating an already-served informal corridor', () => {
    const c = createCity(1000, 731); c.weather.kind = 'clear'; c.weather.rainfall = 0;
    mobilityDays(c, 30);
    expect(c.mobility.routes.length).toBeGreaterThan(0);
    expect(c.mobility.routes.filter(r => r.mode === 'keke')).toHaveLength(1);
  });
  it('grows operators, computes real profit, formalizes without removing them and withdraws with weak demand', () => {
    const c = corridor(); mobilityDays(c, 24); const r = c.mobility.routes[0]; expect(r).toBeDefined();
    expect(r.netProfit).toBe(r.ridership * 220 - r.vehicles * 14000); expect(r.profitability).toBeGreaterThan(30);
    const reliability = r.reliability, treasury = c.treasury, fleet = r.vehicles;
    expect(formalizeRoute(c, r.id)).toBe(''); expect(r.formalized).toBe(true); expect(r.vehicles).toBe(fleet); expect(r.reliability).toBeGreaterThan(reliability); expect(c.treasury).toBeLessThan(treasury); expect(c.mobility.costs.administration).toBeGreaterThan(0);
    c.tiles[130].building!.occupants = 0; refreshCity(c); mobilityDays(c, 40); expect(c.mobility.routes).toHaveLength(0);
  });
  it('creates network-following bus routes, charges costs, bounds fleet and rejects disconnected plans', () => {
    const c = corridor(); expect(establishBus(c, [162, 170, 180])).toBe(''); const r = c.mobility.routes[0];
    expect(r.mode).toBe('bus'); expect(r.path).toContain(170); expect(c.mobility.costs.buses).toBe(3600000); expect(r.ridership).toBeGreaterThan(0);
    expect(changeBusFleet(c, r.id, 1)).toBe(''); expect(r.vehicles).toBe(3);
    c.tiles[170].services.floodDepth = 95; updateMobility(c, false, true); expect(r.reliability).toBe(0); expect(r.ridership).toBe(0);
    const treasury = c.treasury; expect(establishBus(c, [162, 180])).not.toBe(''); expect(c.treasury).toBe(treasury);
  });
  it('serves intermediate homes and jobs on a bus route with distant endpoints', () => {
    const c = corridor(10);
    for (let x = 0; x <= 31; x++) { const t = c.tiles[5 * 32 + x]; t.road = true; t.roadClass = 'local'; }
    updateMobility(c, false, true);
    expect(establishBus(c, [160, 191])).toBe('');
    expect(c.mobility.routes[0].ridership).toBeGreaterThan(0);
    expect(c.mobility.stats.modes.bus).toBeGreaterThan(0);
  });
  it('rain slows dirt roads and flooding reduces capacity, disrupts routes, then recovers', () => {
    const c = corridor(); c.tiles[170].roadClass = 'dirt'; const dry = roadPerformance(c, c.tiles[170]);
    c.weather.rainfall = 65; c.weather.kind = 'extreme-rain'; invalidateRoadGraph(c); const rain = roadPerformance(c, c.tiles[170]); expect(rain.speed).toBeLessThan(dry.speed); expect(rain.capacity).toBeLessThan(dry.capacity);
    c.weather.rainfall = 0; c.weather.kind = 'clear'; mobilityDays(c, 12); const route = c.mobility.routes[0];
    c.tiles[170].services.floodDepth = 95; updateMobility(c, false, true); expect(route.reliability).toBe(0);
    c.tiles[170].services.floodDepth = 0; updateMobility(c, false, true); expect(route.reliability).toBeGreaterThan(0);
    expect(c.mobility.routes).toHaveLength(1); // Recovery must not create a duplicate operator corridor.
  });
  it('transport customers change commercial output, land value and explainable attractiveness', () => {
    const c = corridor(), tile = c.tiles[148]; operateBusinesses(c); const baseline = tile.building!.monthlyEconomicOutput;
    tile.mobility.footTraffic = 600; operateBusinesses(c); expect(tile.building!.monthlyEconomicOutput).toBeGreaterThan(baseline);
    const other = decodeCity(JSON.parse(JSON.stringify(c))); other.tiles[148].mobility.footTraffic = 0;
    updateLandValues(c); updateLandValues(other); expect(tile.landValue).toBeGreaterThan(other.tiles[148].landValue);
    expect(attractiveness(c, tile).factors.some(f => f.label.includes('transport stops') && f.value > 0)).toBe(true);
  });
  it('groups route convergence into hubs with actual boarding activity', () => {
    const c = corridor(); mobilityDays(c, 12);
    const first = c.mobility.routes[0]; c.mobility.routes.push({ ...first, id: 'parallel-a', path: [...first.path], waypoints: [...first.waypoints] }, { ...first, id: 'parallel-b', path: [...first.path], waypoints: [...first.waypoints] });
    c.mobility.debug.demandMultiplier = 5; c.mobility.debug.until = 100;
    updateMobility(c, false, true); expect(c.mobility.stops.some(s => s.routes.length === 3)).toBe(true); expect(c.mobility.hubs.length).toBeGreaterThan(0);
  });
  it('detects, deduplicates and resolves spatial mobility Pulse warnings', () => {
    const c = corridor(); c.mobility.debug.loadMultiplier = 50; c.mobility.debug.until = 100; updateMobility(c, false, true);
    const tracker = new CityPulseTracker(); tracker.update(c); expect(tracker.active.filter(p => p.id === 'traffic-congestion')).toHaveLength(1);
    expect(detectCityPulse(c).find(p => p.id === 'traffic-congestion')?.tileId).not.toBeNull(); tracker.update(c); expect(tracker.history.filter(p => p.id === 'traffic-congestion')).toHaveLength(0);
    c.mobility.debug.loadMultiplier = 1; updateMobility(c, false, true); tracker.update(c); expect(tracker.history.some(p => p.id === 'traffic-congestion')).toBe(true);
  });
  it('round-trips v4, migrates v3 without losing infrastructure, and rejects damaged mobility', () => {
    const c = corridor(); mobilityDays(c, 12); expect(decodeCity(JSON.parse(JSON.stringify(c)))).toEqual(c);
    const old = JSON.parse(JSON.stringify(createCity(1000))); old.version = 3; delete old.mobility; old.tiles.forEach((t: any) => { delete t.mobility; delete t.roadClass; });
    const migrated = decodeCity(old); expect(migrated.version).toBe(9); expect(migrated.population).toBe(500); expect(migrated.tiles.filter(t => t.infrastructure)).toHaveLength(4);
    const bad = JSON.parse(JSON.stringify(c)); bad.mobility.routes[0].path = [162, 190]; expect(() => decodeCity(bad)).toThrow('damaged');
  });
  it('offline progression executes identical mobility, rainfall, routes and economy to active ticks', () => {
    const a = corridor(), b = decodeCity(JSON.parse(JSON.stringify(a))); advance(a, 60);
    const report = catchUp(b, 1000 + 60 * TICK_MS); a.lastSimulatedTimestamp = b.lastSimulatedTimestamp;
    expect(b).toEqual(a); expect(report.commuteAfter).toBe(b.mobility.stats.averageCommute); expect(report.routesAfter).toBe(b.mobility.routes.length);
  }, 30000);
});
