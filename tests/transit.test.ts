import { transitFixture, transitNetworkFixture } from '../shared/simulation/transit-fixtures';
import { initializeLiving } from '../shared/simulation/living-city';
import { describe, expect, it } from 'vitest';
import { advance, applyTool, catchUp, createCity, refreshCity, TICK_MS } from '../shared/simulation/engine';
import { createBuilding, setTypology } from '../shared/simulation/buildings';
import { initializeMobility, updateMobility, establishBus } from '../shared/simulation/mobility';
import { createTransitRoute, placeTransitFacility, previewTransitRoute, editTransitRoute, prepareTransit, finishTransit, buildBrtCorridor, improveJunction, removeTransitFacility, initializeTransit, removeTransitRoute, transitPeriodLoads, transitOverlay } from '../shared/simulation/transit';
import { transitJourney, walkingReach, transitNetworkDiagnostics, invalidateTransit } from '../shared/simulation/transit-network';
import { TRANSIT, accessBand } from '../shared/simulation/transit-config';
import { districtMobility, personCapacity, transitReport } from '../shared/simulation/transit-metrics';
import { transitChallenges } from '../shared/simulation/transit-events';
import { createDistrict } from '../shared/simulation/governance';
import { roadPerformance, invalidateRoadGraph, ROADS } from '../shared/simulation/road-network';
import { decodeCity } from '../shared/simulation/save-format';
import { attractiveness, developmentTick, updateLandValues } from '../shared/simulation/development';
import { publicServiceFixture } from '../shared/simulation/public-service-fixtures';
import { cityActivity } from '../shared/simulation/activity';
import { vehiclePlan } from '../client/game/activity-policy';
import { transitPlanningPanel, transitInspector, transitReportHtml } from '../client/ui/transit-panels';
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
    const c = transitFixture(4000), r = route(c); const id = 131, tile = c.tiles[id]; tile.zone = 'residential';
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
  // The twenty-year run lives in transit-long-run.test.ts on a drained, populated city.
});

// Milestone 8 completion: behaviours the handoff spec requires that Codex's suite did not cover.
function stops(c: ReturnType<typeof createCity>, tiles: number[], kind: 'bus-stop' | 'brt-station' = 'bus-stop') {
  for (const id of tiles) expect(placeTransitFacility(c, id, kind)).toBe('');
  if (!c.transit.stops.some(s => s.kind === 'bus-depot')) expect(placeTransitFacility(c, 195, 'bus-depot')).toBe('');
  return tiles.map(id => c.transit.stops.find(s => s.tileId === id)!.id);
}
const totals = (c: ReturnType<typeof createCity>) => { for (const f of c.mobility.flows) expect(Object.values(f.modes).reduce((a, b) => a + b, 0)).toBe(f.trips); };
describe('Milestone 8 completion behaviours', () => {
  it('keeps riders on existing buses when a planned route joins the corridor', () => {
    const c = transitFixture(6000); expect(establishBus(c, [162, 186], 2)).toBe(''); updateMobility(c, false, true);
    const legacy = c.mobility.routes.find(r => r.mode === 'bus')!, before = legacy.ridership; expect(before).toBeGreaterThan(0);
    // A free planned route takes the bus share first; riders who chose the existing buses, and its overflow, must still reach them.
    expect(createTransitRoute(c, 'bus', stops(c, [163, 185]), 3)).toBe(''); const planned = c.transit.routes.find(r => !r.legacy)!; editTransitRoute(c, planned.id, { fare: 0 }); updateMobility(c, false, true);
    expect(transitJourney(c, 130, 154)!.legs.some(l => l.routeId === planned.id)).toBe(true);
    expect(legacy.ridership).toBeGreaterThanOrEqual(before * .9); totals(c);
  });
  it('gives a useful corridor meaningful ridership and an irrelevant one almost none', () => {
    const c = transitFixture(4000); const [a, b, x, y] = stops(c, [162, 186, 170, 178]);
    createTransitRoute(c, 'bus', [a, b], 6); createTransitRoute(c, 'bus', [x, y], 6); updateMobility(c, false, true);
    const [useful, useless] = c.transit.routes; expect(useful.ridership).toBeGreaterThan(1000); expect(useless.ridership).toBeLessThan(useful.ridership * .02); expect(useless.subsidy).toBeGreaterThan(0);
  });
  it('crowds a popular route with too few vehicles and relieves it with more service', () => {
    const c = transitFixture(6000); createTransitRoute(c, 'bus', stops(c, [162, 186]), 1); updateMobility(c, false, true); const r = c.transit.routes[0];
    const crowding = r.crowding, wait = r.wait, ridership = r.ridership; expect(crowding).toBeGreaterThan(1); expect(r.ridership).toBeLessThan(r.demand);
    expect(editTransitRoute(c, r.id, { vehicles: 12 })).toBe(''); updateMobility(c, false, true); updateMobility(c, false, true);
    expect(r.crowding).toBeLessThan(1); expect(r.wait).toBeLessThan(wait); expect(r.ridership).toBeGreaterThan(ridership); totals(c);
  });
  it('fills rush hours before the daily total, so crowding is felt at peak', () => {
    const c = transitFixture(7000); createTransitRoute(c, 'bus', stops(c, [162, 186]), 2); updateMobility(c, false, true); updateMobility(c, false, true);
    const r = c.transit.routes[0], load = transitPeriodLoads(c, r.id)!;
    expect(r.capacity).toBeGreaterThan(r.demand); expect(r.ridership).toBeLessThan(r.demand); expect(r.crowding).toBeGreaterThan(1);
    expect(load.riders[0]).toBeCloseTo(r.capacity * 4 / TRANSIT.serviceHours, 0); expect(load.demand[0]).toBeGreaterThan(load.riders[0]);
    expect(load.riders[1]).toBeGreaterThan(load.demand[1] * .99);
  });
  it('lets poor night safety modestly reduce evening ridership', () => {
    const run = (safety: number) => { const c = transitFixture(4000); const ids = stops(c, [162, 174, 186]); for (const s of c.transit.stops) c.safety.local[s.tileId].nightSafety = safety; createTransitRoute(c, 'bus', ids, 8); updateMobility(c, false, true); return { r: c.transit.routes[0], load: transitPeriodLoads(c, c.transit.routes[0].id)! }; };
    const safe = run(85), unsafe = run(15);
    expect(unsafe.load.riders[2]).toBeLessThan(safe.load.riders[2] * .8); expect(unsafe.load.riders[0]).toBeCloseTo(safe.load.riders[0], 0);
    expect(unsafe.r.ridership).toBeLessThan(safe.r.ridership); expect(unsafe.r.ridership).toBeGreaterThan(safe.r.ridership * .9);
  });
  it('carries walk → Danfo → BRT → walk journeys and keeps Danfo as a feeder', () => {
    const c = transitFixture(4000); for (let n = 0; n < 18; n++) { c.tick++; updateMobility(c); } const danfo = c.mobility.routes.find(r => r.mode === 'danfo')!;
    const ids = stops(c, [176, 186], 'brt-station'); expect(buildBrtCorridor(c, [176, 186])).toBe(''); expect(createTransitRoute(c, 'brt', ids, 6)).toBe(''); updateMobility(c, false, true);
    const journey = transitJourney(c, 130, 154)!; expect(journey.legs.map(l => l.mode)).toEqual(['danfo', 'brt']);
    expect(c.mobility.routes).toContain(danfo); expect(danfo.ridership).toBeGreaterThan(0); expect(c.transit.routes[0].ridership).toBeGreaterThan(0);
    expect(c.transit.transfers.some(t => t.from === danfo.id && t.to === c.transit.routes[0].id)).toBe(true); totals(c);
  });
  it('moves more people per hour on a BRT corridor than the general lanes it replaces, and beats buses in congestion', () => {
    const congested = () => { const c = transitFixture(6000); c.mobility.debug.loadMultiplier = 20; c.mobility.debug.until = c.tick + 30; updateMobility(c, false, true); return c; };
    const b = congested(), general = personCapacity(b, 170), ids = stops(b, [162, 174, 186], 'brt-station'); expect(buildBrtCorridor(b, [162, 186])).toBe(''); expect(createTransitRoute(b, 'brt', ids, 8)).toBe(''); updateMobility(b, false, true);
    const brt = b.transit.routes[0], corridor = personCapacity(b, 170);
    expect(corridor.general).toBeLessThan(general.general); expect(corridor.total).toBeGreaterThan(general.total * 2);
    const bus = congested(); createTransitRoute(bus, 'bus', stops(bus, [162, 174, 186]), 8); updateMobility(bus, false, true); const ordinary = bus.transit.routes[0];
    expect(brt.minutes).toBeLessThan(ordinary.minutes); expect(brt.reliability).toBeGreaterThan(ordinary.reliability); expect(brt.capacity).toBeGreaterThan(ordinary.capacity);
  });
  it('shortens commutes when a BRT corridor relieves a congested road, even at heavy load', () => {
    const evaluate = (c: ReturnType<typeof createCity>) => { for (let i = 0; i < 3; i++) { c.tick++; updateMobility(c, false, true); } return c.mobility.stats; };
    for (const population of [20000, 30000]) for (const load of [1, 8]) {
      const city = () => { const c = transitFixture(population); c.mobility.debug.loadMultiplier = load; c.mobility.debug.until = c.tick + 400; return c; };
      const without = evaluate(city()), b = city(), ids = stops(b, [162, 174, 186], 'brt-station');
      expect(buildBrtCorridor(b, [162, 186])).toBe(''); expect(createTransitRoute(b, 'brt', ids, 8)).toBe(''); const brt = evaluate(b);
      expect(brt.averageCommute).toBeLessThan(without.averageCommute - 1);
      expect(brt.modes.car + brt.modes.okada).toBeLessThan((without.modes.car + without.modes.okada) / 2);
    }
  });
  it('lets journeys slower than the road lose riders faster, so a slow route adds less commute time', () => {
    const run = (slower: number) => {
      const config = TRANSIT as { slowerSensitivity: number }, previous = config.slowerSensitivity; config.slowerSensitivity = slower;
      try { const c = transitFixture(4000); createTransitRoute(c, 'bus', stops(c, [162, 174, 186]), 2); updateMobility(c, false, true); updateMobility(c, false, true); return { commute: c.mobility.stats.averageCommute, riders: c.transit.routes[0].ridership }; }
      finally { config.slowerSensitivity = previous; }
    };
    const base = transitFixture(4000); updateMobility(base, false, true); updateMobility(base, false, true);
    const flat = run(TRANSIT.timeSensitivity), steep = run(TRANSIT.slowerSensitivity);
    expect(steep.riders).toBeLessThan(flat.riders * .85); expect(steep.riders).toBeGreaterThan(0);
    expect(steep.commute).toBeLessThan(flat.commute - .5); expect(steep.commute).toBeGreaterThan(base.mobility.stats.averageCommute);
  });
  it('keeps short trips on foot when transit takes several times longer than walking', () => {
    const base = transitNetworkFixture(10000);
    const run = (floor: number) => {
      const config = TRANSIT as { timeFloor: number }, previous = config.timeFloor; config.timeFloor = floor;
      try {
        const c = decodeCity(JSON.parse(JSON.stringify(base))); updateMobility(c, false, true);
        const slowShort = c.transit.demand.reduce((n, d) => { const f = c.mobility.flows.find(f => f.id === d.flowId)!; return n + (f.distance < 1.2 && d.minutes > 3 * f.distance / TRANSIT.walkingSpeed * 60 ? d.passengers : 0); }, 0);
        return { slowShort, riders: c.transit.demand.reduce((n, d) => n + d.passengers, 0), commute: c.mobility.stats.averageCommute };
      } finally { config.timeFloor = previous; }
    };
    const loose = run(.1), current = run(TRANSIT.timeFloor);
    expect(current.slowShort).toBeLessThan(loose.slowShort * .6); expect(current.riders).toBeGreaterThan(0); expect(current.commute).toBeLessThan(loose.commute);
  });
  it('moves commercial development toward useful stations', () => {
    const parcels = [200, 202, 204, 208, 210, 212, 214, 218];
    const grow = (transit: boolean) => {
      const c = transitFixture(20000); for (const id of parcels) c.tiles[id].zone = 'commercial';
      if (transit) { const ids = stops(c, [162, 174, 186], 'brt-station'); expect(buildBrtCorridor(c, [162, 186])).toBe(''); expect(createTransitRoute(c, 'brt', ids, 8)).toBe(''); }
      refreshCity(c); for (let i = 0; i < 40; i++) { c.tick++; updateMobility(c, true, true); } updateLandValues(c);
      const land = parcels.map(id => c.tiles[id].landValue), built: number[] = [];
      for (let i = 0; i < 60; i++) { c.tick++; developmentTick(c); for (const id of parcels) if (c.tiles[id].building && !built.includes(id)) built.push(id); }
      return { c, land, built };
    };
    const without = grow(false), brt = grow(true), served = parcels.filter(id => brt.c.transit.local[id].tod > 1);
    expect(served.length).toBeGreaterThan(1);
    for (const id of served) expect(brt.land[parcels.indexOf(id)]).toBeGreaterThan(without.land[parcels.indexOf(id)]);
    const first = (built: number[]) => built.slice(0, 3).filter(id => served.includes(id)).length;
    expect(first(brt.built)).toBeGreaterThan(first(without.built));
  });
  it('trades speed for walking coverage through station spacing', () => {
    const run = (tiles: number[]) => { const c = transitFixture(4000); createTransitRoute(c, 'bus', stops(c, tiles), 6); updateMobility(c, false, true); const covered = new Set(tiles.flatMap(id => [...walkingReach(c, id).keys()])); return { minutes: c.transit.routes[0].minutes, covered: covered.size }; };
    const sparse = run([162, 186]), dense = run([162, 165, 168, 171, 174, 177, 180, 183, 186]);
    expect(dense.minutes).toBeGreaterThan(sparse.minutes); expect(dense.covered).toBeGreaterThan(sparse.covered);
  });
  it('compares districts by transit access, job access, commute and mode share', () => {
    const c = transitFixture(4000); expect(createDistrict(c, [130, 131, 98, 99], 'Riverside')).toBe(''); createTransitRoute(c, 'bus', stops(c, [162, 174, 186]), 8); updateMobility(c, false, true);
    const [d] = districtMobility(c); expect(d.name).toBe('Riverside'); expect(d.trips).toBeGreaterThan(0); expect(d.commute).toBeGreaterThan(0); expect(d.modes.bus).toBeGreaterThan(0);
    expect(Object.values(d.modes).reduce((a, b) => a + b, 0)).toBe(d.trips); expect(d.sharedShare).toBeGreaterThan(0); expect(transitPlanningPanel(c, 'network', null)).toContain('Riverside');
  });
  it('raises located challenges for corridor congestion, poor job access and flood disruption', () => {
    const c = transitFixture(6000); c.mobility.debug.loadMultiplier = 30; c.mobility.debug.until = c.tick + 30; updateMobility(c, false, true);
    const corridor = c.governance.challenges.find(x => x.id === 'transit-corridor' && !x.resolved)!; expect(corridor.tileId).not.toBeNull(); expect(corridor.responses.length).toBeGreaterThanOrEqual(3);
    for (const f of c.mobility.flows) if (f.purpose === 'work') f.minutes = 70; transitChallenges(c);
    const jobs = c.governance.challenges.find(x => x.id === 'transit-job-access' && !x.resolved)!; expect(jobs.tileId).toBe(130); expect(jobs.description).toContain('45 minutes');
    const f = transitFixture(); createTransitRoute(f, 'bus', stops(f, [162, 174, 186]), 6); f.tiles[174].services.floodDepth = 100; f.infrastructure.revision++; f.tick++; updateMobility(f, true, true);
    expect(f.governance.challenges.some(x => x.title.includes('disrupted by flooding'))).toBe(true); expect(f.living.feed.some(e => e.text.includes('flooding'))).toBe(true);
  });
  it('records ridership and accessibility milestones once in history and the feed', () => {
    const c = transitFixture(30000), ids = stops(c, [162, 174, 186], 'brt-station'); expect(createDistrict(c, [130, 131, 162, 163], 'Unity')).toBe(''); expect(buildBrtCorridor(c, [162, 186])).toBe(''); expect(createTransitRoute(c, 'brt', ids, 30)).toBe('');
    for (let n = 0; n < 3; n++) { c.tick++; updateMobility(c, true, true); }
    expect(c.milestones).toContain('network-5000'); expect(c.milestones.some(m => m.startsWith('district-access-'))).toBe(true);
    expect(c.history.some(h => h.includes('Transit accessibility improved in Unity'))).toBe(true);
    const entries = c.history.length; c.tick++; updateMobility(c, true, true); expect(c.history.length).toBe(entries);
  });
  it('reports transit disruption and the busiest hub after time away', () => {
    const a = transitFixture(); route(a, 'brt'); const report = catchUp(a, a.lastSimulatedTimestamp + 30 * TICK_MS);
    expect(report.transitBusiestHub).toContain('BRT station'); expect(report.transitDisruptedAfter).toBe(0); expect(Number.isFinite(report.transitRecoveryAfter)).toBe(true);
  }, 60000);
  it('keeps default route names readable and unique after a route is retired', () => {
    const c = transitFixture(); const ids = stops(c, [162, 174, 186]);
    createTransitRoute(c, 'bus', ids, 1); createTransitRoute(c, 'bus', ids, 1); removeTransitRoute(c, c.transit.routes[0].id);
    createTransitRoute(c, 'bus', ids, 1); createTransitRoute(c, 'bus', ids, 1); expect(c.transit.routes.map(r => r.name).sort()).toEqual(['Bus 1', 'Bus 2', 'Bus 3']);
    updateMobility(c, false, true); expect(transitPlanningPanel(c, 'bus', null)).not.toContain('Line transit-');
  });
  it('makes road class matter for frontage, walking and upgrade works', () => {
    const c = transitFixture(); const shop = c.tiles[150], home = c.tiles[151]; shop.zone = 'commercial'; home.zone = 'residential';
    expect(attractiveness(c, shop).factors.find(f => f.label === 'Major road frontage')!.value).toBeGreaterThan(0);
    expect(attractiveness(c, home).factors.find(f => f.label === 'Major road frontage')!.value).toBeLessThan(0);
    for (const t of c.tiles) if (t.road) t.roadClass = 'local'; c.infrastructure.revision++; expect(attractiveness(c, shop).factors.some(f => f.label.includes('frontage'))).toBe(false);
    const before = c.treasury; applyTool(c, 10, 5, 'major-road'); expect(c.tiles[170].roadClass).toBe('major'); expect(c.treasury).toBeLessThan(before); expect(c.transit.works[170]).toBeGreaterThan(c.tick);
    expect(ROADS.major.walking).toBeLessThan(ROADS.local.walking);
  });
  it('shows accessibility in four bands and summarises diagnostics', () => {
    expect([accessBand(80), accessBand(50), accessBand(25), accessBand(5)]).toEqual(['Excellent', 'Good', 'Weak', 'Poor']);
    const c = transitFixture(4000); route(c); const values = new Set(c.transit.local.map((_, id) => transitOverlay(c, id, 'transit-accessibility'))); expect(values.size).toBeLessThanOrEqual(4);
    const report = transitReport(c); expect(report.routes[0].ridership).toBeGreaterThan(0); expect(report.trips.top.length).toBeGreaterThan(0); expect(report.routes[0].periods).toHaveLength(3);
    expect(transitReportHtml(c)).toContain('Transfer flows'); expect(transitInspector(c, c.tiles[170])).toContain('People capacity');
  });
});
