import { transitFixture } from '../shared/simulation/transit-fixtures';
import { initializeLiving } from '../shared/simulation/living-city';
import { describe, expect, it } from 'vitest';
import { advance, applyTool, catchUp, createCity, refreshCity, TICK_MS } from '../shared/simulation/engine';
import { createBuilding, setTypology } from '../shared/simulation/buildings';
import { initializeMobility, updateMobility, establishBus } from '../shared/simulation/mobility';
import { createTransitRoute, placeTransitFacility, previewTransitRoute, editTransitRoute, prepareTransit, finishTransit, buildBrtCorridor, improveJunction, removeTransitFacility, initializeTransit } from '../shared/simulation/transit';
import { transitJourney, walkingReach, transitNetworkDiagnostics, invalidateTransit } from '../shared/simulation/transit-network';
import { TRANSIT } from '../shared/simulation/transit-config';
import { roadPerformance, invalidateRoadGraph } from '../shared/simulation/road-network';
import { decodeCity } from '../shared/simulation/save-format';
import { attractiveness, updateLandValues } from '../shared/simulation/development';
import { publicServiceFixture } from '../shared/simulation/public-service-fixtures';
import { cityActivity } from '../shared/simulation/activity';
import { vehiclePlan } from '../client/game/activity-policy';
import { transitPlanningPanel, transitInspector } from '../client/ui/transit-panels';
import { detectCityPulse } from '../client/ui/city-pulse';


function route(c: ReturnType<typeof createCity>, mode: 'bus' | 'brt' = 'bus', points = [162, 174, 186], vehicles = 6) {
  for (const id of points) expect(placeTransitFacility(c, id, mode === 'brt' ? 'brt-station' : 'bus-stop')).toBe('');
  expect(placeTransitFacility(c, 195, 'bus-depot')).toBe('');
  if (mode === 'brt') expect(buildBrtCorridor(c, [162, 186])).toBe('');
  expect(createTransitRoute(c, mode, c.transit.stops.filter(s => s.kind !== 'bus-depot').map(s => s.id), vehicles)).toBe(''); updateMobility(c, false, true); return c.transit.routes[0];
}
describe('planned aggregate metropolitan transit', () => {
  it('shows OD demand even before a network exists', () => {
    const c=transitFixture(); expect(c.transit.routes).toHaveLength(0);
    expect(c.transit.local[130].demand).toBeGreaterThan(0);
  });
  it('preserves excess demand as crowding instead of suppressing it', () => {
    const c=transitFixture(100000),r=route(c,'bus',[162,186],1);
    expect(r.demand).toBeGreaterThan(r.capacity);expect(r.crowding).toBeGreaterThan(1);
    expect(r.ridership).toBeLessThanOrEqual(r.capacity);
    for(const f of c.mobility.flows)expect(Object.values(f.modes).reduce((a,b)=>a+b,0)).toBe(f.trips);
  });
  it('immediately resaves migrated buses and exposes newly created legacy services', () => {
    const c=transitFixture();establishBus(c,[162,186],2);updateMobility(c,false,true);
    expect(c.transit.routes[0].legacy).toBe(true);
    expect(decodeCity(JSON.parse(JSON.stringify(c))).transit.routes[0].id).toBe(c.mobility.routes[0].id);
  });
  it('starts without invented routes, passengers or expenses', () => { const c = createCity(1000); expect(c.transit.routes).toEqual([]); expect(c.transit.stats.ridership).toBe(0); expect(c.transit.finance.subsidy).toBe(0); });
  it('connects real origins/jobs with conserved mode totals and lower private demand', () => {
    const c = transitFixture(), baseline = c.mobility.stats.modes.car; const r = route(c);
    expect(r.ridership).toBeGreaterThan(0); expect(c.mobility.stats.modes.bus).toBeGreaterThan(0); expect(c.mobility.stats.modes.car).toBeLessThan(baseline);
    for (const f of c.mobility.flows) expect(Object.values(f.modes).reduce((a, b) => a + b, 0)).toBe(f.trips);
    expect(c.transit.demand.every(d => c.mobility.flows.some(f => f.id === d.flowId && d.passengers <= f.trips))).toBe(true);
  });
  it('never creates riders on an empty but well-equipped corridor', () => { const c = transitFixture(0); c.tiles[154].building!.jobs = 0; refreshCity(c); updateMobility(c, false, true); const r = route(c); expect(r.ridership).toBe(0); expect(r.operatingCost).toBeGreaterThan(0); expect(r.revenue).toBe(0); });
  it('requires actual accessible depot capacity', () => {
    const c = transitFixture(); for (const id of [162, 186]) placeTransitFacility(c, id, 'bus-stop'); createTransitRoute(c, 'bus', c.transit.stops.map(s => s.id), 3); updateMobility(c, false, true);
    expect(c.transit.routes[0].status).toBe('no-depot'); expect(c.transit.routes[0].ridership).toBe(0);
    placeTransitFacility(c, 195, 'bus-depot'); updateMobility(c, false, true); expect(c.transit.routes[0].status).toBe('active'); expect(c.transit.routes[0].ridership).toBeGreaterThan(0);
  });
  it('explains disconnected/duplicate/unreachable plans without charging', () => {
    const c = transitFixture(); const r = route(c), treasury = c.treasury;
    expect(previewTransitRoute(c, 'bus', [r.stops[0], r.stops[0]]).error).toContain('distinct');
    c.tiles[174].services.floodDepth = 100; invalidateRoadGraph(c); expect(createTransitRoute(c, 'bus', [r.stops[0], r.stops[2]])).toContain('connected'); expect(c.treasury).toBe(treasury);
  });
  it('uses connected walking catchments, not radius across a flood gap', () => {
    const c = transitFixture(); expect(walkingReach(c, 130).has(166)).toBe(true); c.tiles[164].services.floodDepth = 40; c.infrastructure.revision++; invalidateRoadGraph(c); expect(walkingReach(c, 130).has(166)).toBe(false);
  });
  it('additional fleet improves frequency/capacity at a real capital and operating cost', () => {
    const c = transitFixture(6000), r = route(c, 'bus', [162, 186], 1), headway = r.headway, capacity = r.capacity, cost = r.operatingCost, treasury = c.treasury;
    expect(editTransitRoute(c, r.id, { vehicles: 8 })).toBe(''); updateMobility(c, false, true); expect(r.headway).toBeLessThan(headway); expect(r.capacity).toBeGreaterThan(capacity); expect(r.operatingCost).toBeGreaterThan(cost); expect(c.treasury).toBe(treasury - 7 * 12000000);
  });
  it('fares affect actual choice/revenue and fare support increases budget pressure', () => {
    const c = transitFixture(), r = route(c); editTransitRoute(c, r.id, { fare: 2000 }); updateMobility(c, false, true); const expensive = r.ridership;
    editTransitRoute(c, r.id, { fare: 100 }); updateMobility(c, false, true); expect(r.ridership).toBeGreaterThan(expensive); expect(r.revenue).toBe(r.ridership * 100 * 30);
    c.transit.subsidyRate = 75; invalidateTransit(c); updateMobility(c, false, true); expect(r.revenue).toBe(r.ridership * 25 * 30); expect(c.transit.finance.subsidy).toBeGreaterThan(0);
  });
  it('supports ordered two-line transfers and chooses a better direct route', () => {
    const c = transitFixture(); for (const id of [162, 174, 186]) placeTransitFacility(c, id, 'bus-stop'); placeTransitFacility(c, 195, 'bus-depot');
    const ids = c.transit.stops.filter(s => s.kind === 'bus-stop').map(s => s.id); createTransitRoute(c, 'bus', ids.slice(0, 2), 8); createTransitRoute(c, 'bus', ids.slice(1), 8); updateMobility(c, false, true);
    const transfer = transitJourney(c, 130, 154)!; expect(transfer.transfers).toBe(1); expect(transfer.legs).toHaveLength(2); expect(c.transit.transfers.length).toBeGreaterThan(0);
    createTransitRoute(c, 'bus', [ids[0], ids[2]], 20); updateMobility(c, false, true); const direct = transitJourney(c, 130, 154)!; expect(direct.transfers).toBe(0); expect(direct.cost).toBeLessThan(transfer.cost);
  });
  it('makes BRT faster under congestion, reserves real road space and rejects dirt lanes', () => {
    const c = transitFixture(); for (const t of c.tiles.filter(t => t.road)) t.mobility.congestion = 85; const general = roadPerformance(c, c.tiles[170]).capacity; const r = route(c, 'brt');
    expect(c.transit.corridors).toContain(170); expect(roadPerformance(c, c.tiles[170]).capacity).toBeLessThan(general); expect(r.reliability).toBeGreaterThan(70); expect(r.ridership).toBeGreaterThan(0);
    c.tiles[170].roadClass = 'dirt'; expect(buildBrtCorridor(c, [162, 186])).toContain('avenues');
  });
  it('does not erase organic Danfo when formal service competes', () => {
    const c = transitFixture(4000); for (let n = 0; n < 18; n++) { c.tick++; updateMobility(c); } const informal = c.mobility.routes.find(r => r.mode === 'danfo')!; expect(informal).toBeDefined();
    route(c, 'brt'); expect(c.mobility.routes.some(r => r.id === informal.id)).toBe(true); expect(c.mobility.stats.modes.okada).toBeGreaterThan(0); expect(c.mobility.stats.modes.car).toBeGreaterThan(0);
  });
  it('reroutes conventional buses after flooding and recovers from disconnection', () => {
    const c = transitFixture(), r = route(c); c.tiles[174].services.floodDepth = 100; c.infrastructure.revision++; updateMobility(c, false, true); expect(r.status).toBe('disrupted'); expect(r.ridership).toBe(0);
    c.tiles[174].services.floodDepth = 0; c.infrastructure.revision++; updateMobility(c, false, true); expect(r.status).toBe('active');
    // A non-stop flooded segment can be bypassed using an actual parallel road.
    for (const x of [10, 11, 12]) { c.tiles[192 + x].road = true; c.tiles[192 + x].roadClass = 'local'; } c.tiles[171].services.floodDepth = 100; c.infrastructure.revision++; updateMobility(c, false, true); expect(r.path).not.toContain(171); expect(r.status).toBe('active');
  });
  it('bounds TOD support, explains it and does not bypass organic construction', () => {
    const c = transitFixture(), r = route(c); const id = 131, tile = c.tiles[id]; tile.zone = 'residential';
    for (let n = 0; n < 40; n++) { c.tick++; updateMobility(c, true, true); }
    expect(c.transit.local[id].tod).toBeGreaterThan(0); expect(c.transit.local[id].tod).toBeLessThanOrEqual(TRANSIT.todMaximum); expect(tile.building).toBeNull(); expect(attractiveness(c, tile).factors.some(f => f.label.includes('transit') && f.value > 0)).toBe(true);
    const other = decodeCity(JSON.parse(JSON.stringify(c))); other.transit.local[id].tod = 0; updateLandValues(c); updateLandValues(other); expect(tile.landValue).toBeGreaterThan(other.tiles[id].landValue); expect(r.ridership).toBeGreaterThan(0);
  });
  it('night safety reduces actual evening passenger activity and recovers', () => {
    const c = transitFixture(), r = route(c); for (const s of c.transit.stops) s.nightSafety = 20; const low = cityActivity(c, 19).transit[r.id].riders;
    for (const s of c.transit.stops) s.nightSafety = 85; expect(cityActivity(c, 19).transit[r.id].riders).toBeGreaterThan(low);
  });
  it('renders only real service plans using bounded vehicle pools', () => {
    const c = transitFixture(), r = route(c, 'brt'), activity = cityActivity(c, 8), roads = new Set(r.path); const plans = vehiclePlan(c, activity, roads, 18);
    expect(plans.length).toBeLessThanOrEqual(18); expect(plans.some(p => p.routeId === r.id && p.transitMode === 'brt')).toBe(true);
    editTransitRoute(c, r.id, { suspended: true }); updateMobility(c, false, true); expect(vehiclePlan(c, cityActivity(c, 8), roads, 18).some(p => p.routeId === r.id)).toBe(false);
  });
  it('exposes responsive route/stop inspectors and spatial Pulse warnings', () => {
    const c = transitFixture(), r = route(c); expect(transitPlanningPanel(c, 'bus', r.id)).toContain('Headway'); expect(transitInspector(c, c.tiles[162])).toContain('Boardings');
    c.tiles[174].services.floodDepth = 100; c.infrastructure.revision++; updateMobility(c, false, true); const warning = detectCityPulse(c).find(p => p.title.includes('service disrupted')); expect(warning?.tileId).not.toBeNull();
  });
  it('preserves legacy bus IDs/settings through v8 migration without new charges', () => {
    const c = transitFixture(); expect(establishBus(c, [162, 186], 2)).toBe(''); const old: any = JSON.parse(JSON.stringify(c)); old.version = 8; delete old.transit; delete old.mobility.stats.modes.brt; for (const f of old.mobility.flows) delete f.modes.brt;
    const migrated = decodeCity(old); expect(migrated.version).toBe(9); expect(migrated.treasury).toBe(c.treasury); expect(migrated.population).toBe(c.population); expect(migrated.lastSimulatedTimestamp).toBe(c.lastSimulatedTimestamp); expect(migrated.mobility.routes).toEqual(c.mobility.routes); expect(migrated.transit.routes[0].id).toBe(c.mobility.routes[0].id); expect(migrated.transit.routes[0].legacy).toBe(true);
  });
  it('round-trips v9 and rejects malformed stop references, paths and nonfinite fares', () => {
    const c = transitFixture(); route(c, 'brt'); expect(decodeCity(JSON.parse(JSON.stringify(c)))).toEqual(c);
    for (const change of [(v: any) => v.transit.routes[0].stops.push('missing'), (v: any) => v.transit.routes[0].path = [162, 190], (v: any) => v.transit.routes[0].fare = NaN]) { const v = JSON.parse(JSON.stringify(c)); change(v); expect(() => decodeCity(v)).toThrow('damaged'); }
  });
  it('suspension removes riders/fares while existing informal services remain', () => { const c = transitFixture(), r = route(c); editTransitRoute(c, r.id, { suspended: true }); updateMobility(c, false, true); expect(r.ridership).toBe(0); expect(r.revenue).toBe(0); expect(r.operatingCost).toBe(0); });
  it('facility demolition disrupts routes safely and preserves valid saves', () => { const c = transitFixture(), r = route(c); removeTransitFacility(c, 174); updateMobility(c, false, true); expect(r.stops).toHaveLength(2); expect(decodeCity(JSON.parse(JSON.stringify(c))).transit).toEqual(c.transit); });
  it('junction treatment costs money and road works expire without removing adjacent homes', () => {
    const c = transitFixture(); c.tiles[206].road = true; c.tiles[206].roadClass = 'local'; c.infrastructure.revision++; const home = c.tiles[130].building, treasury = c.treasury;
    expect(improveJunction(c, 174, 'signal')).toBe(''); expect(c.treasury).toBeLessThan(treasury); expect(c.transit.works[174]).toBe(c.tick + 4); expect(c.tiles[130].building).toBe(home); c.tick += 5; prepareTransit(c); finishTransit(c); expect(c.transit.works[174]).toBeUndefined();
  });
  it('online and offline transit/flooding/finance advance identically', () => {
    const a = transitFixture(); route(a, 'brt'); const b = decodeCity(JSON.parse(JSON.stringify(a))); advance(a, 60); const report = catchUp(b, 1000 + 60 * TICK_MS); a.lastSimulatedTimestamp = b.lastSimulatedTimestamp;
    expect(b).toEqual(a); expect(report.transitAfter).toBe(b.transit.stats.ridership); expect(report.transitJobsAfter).toBe(b.transit.stats.jobs45);
  }, 60000);
  for (const count of [10, 50, 100, 200]) it(`bounds/cache-routes a ${count}-line network`, () => {
    const c = transitFixture(5000), original = route(c, 'bus', [162, 174, 186], 1); for (let i = 1; i < count; i++) c.transit.routes.push({ ...structuredClone(original), id: `benchmark-${i}`, name: `Bus ${i + 1}` }); invalidateTransit(c); updateMobility(c, false, true);
    const first = transitJourney(c, 130, 154); expect(first).not.toBeNull(); const before = transitNetworkDiagnostics(c).builds; transitJourney(c, 130, 154); expect(transitNetworkDiagnostics(c).builds).toBe(before); expect(c.transit.routes).toHaveLength(count); expect(c.transit.routes.reduce((n, r) => n + r.availableVehicles, 0)).toBeLessThanOrEqual(c.transit.stats.depotCapacity);
  }, 60000);
  for (const population of [100000, 500000] as const) it(`keeps ${population} residents aggregate`, () => { const c = publicServiceFixture(population); updateMobility(c, false, true); expect(c.population).toBe(population); expect(c.mobility.flows.length).toBeLessThanOrEqual(768); expect(c.transit.local).toHaveLength(1024); }, 60000);
  it('remains finite and bounded over twenty simulated years', () => {
    const c = transitFixture(); route(c, 'brt'); advance(c, 7200); expect(Number.isFinite(c.treasury)).toBe(true); expect(c.transit.history.length).toBeLessThanOrEqual(240); expect(c.transit.routes.every(r => Number.isFinite(r.ridership) && r.ridership <= r.capacity && r.crowding <= 10)).toBe(true); expect(c.transit.local.every(l => l.tod <= 8)).toBe(true); expect(decodeCity(JSON.parse(JSON.stringify(c)))).toEqual(c);
  }, 240000);
});
