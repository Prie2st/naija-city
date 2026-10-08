import { describe, expect, it } from 'vitest';
import { cityActivity, businessSchedule, dailyRhythm, sentimentFactors } from '../shared/simulation/activity';
import { commuteFixture, livingFixture } from '../shared/simulation/living-fixtures';
import { initializeLiving, updateLiving, feedEvent, updateLivingFeed, householdSamples, informalSuitability, marketAttraction } from '../shared/simulation/living-city';
import { updateMobility } from '../shared/simulation/mobility';
import { advance, createCity, catchUpInChunks, refreshCity, TICK_MS, applyTool } from '../shared/simulation/engine';
import { operateBusinesses } from '../shared/simulation/economy';
import { updateClusters, attractiveness } from '../shared/simulation/development';
import { createBuilding } from '../shared/simulation/buildings';
import { decodeCity } from '../shared/simulation/save-format';
import { agentCaps, vehiclePlan } from '../client/game/activity-policy';
import { clamp } from '../shared/simulation/world';

describe('state-driven daily activity', () => {
  it('raises morning traffic, reverses the evening commute and remains quiet at night without mutating saves', () => {
    const c = commuteFixture(), before = JSON.stringify(c);
    const morning = cityActivity(c, 8), evening = cityActivity(c, 17.5), night = cityActivity(c, 2);
    expect(morning.vehicleActivity).toBeGreaterThan(night.vehicleActivity * 4);
    const m = morning.journeys.find(f => f.purpose === 'work')!, e = evening.journeys.find(f => f.flowId === m.flowId)!;
    expect(e.origin).toBe(m.destination); expect(e.path).toEqual([...m.path].reverse());
    expect(night.vehicleActivity).toBeGreaterThan(0); expect(JSON.stringify(c)).toBe(before);
    expect(dailyRhythm(7.99).commute).toBeCloseTo(dailyRhythm(8.01).commute, 2);
    expect(dailyRhythm(8, 5).commute).toBeLessThan(dailyRhythm(8, 1).commute);
  });
  it('derives commute pressure from real jobs, distance, congestion and transit', () => {
    const close = commuteFixture(2), far = commuteFixture(18);
    expect(far.mobility.stats.averageCommute).toBeGreaterThan(close.mobility.stats.averageCommute);
    const free = cityActivity(far, 8); far.mobility.debug.loadMultiplier = 40;
    expect(cityActivity(far, 8).averageCommute).toBeGreaterThan(free.averageCommute);
    far.mobility.debug.loadMultiplier = 1;
    const cars = far.mobility.stats.modes.car;
    for (let i = 0; i < 20; i++) { far.tick++; updateMobility(far); }
    expect(far.mobility.routes.some(r => r.mode === 'danfo')).toBe(true);
    expect(far.mobility.stats.modes.car).toBeLessThan(cars);
    expect(cityActivity(far, 8).transit[far.mobility.routes[0].id].riders).toBeGreaterThan(0);
    far.tiles[148].building!.business!.closedAt = far.tick; refreshCity(far); updateMobility(far, false, true);
    expect(far.mobility.flows.filter(f => f.purpose === 'work')).toHaveLength(0);
  });
  it('reduces pedestrians in rain, closes flood activity and restores it when water recedes', () => {
    const c = commuteFixture(6), dry = cityActivity(c, 13);
    c.weather.kind = 'heavy-rain'; c.weather.rainfall = 42;
    expect(cityActivity(c, 13).pedestrianActivity).toBeLessThan(dry.pedestrianActivity * 0.3);
    const shop = c.tiles[136].building!; shop.floodClosed = true;
    expect(cityActivity(c, 13).tiles[136].commercial).toBe(0);
    shop.floodClosed = false; c.weather.kind = 'clear';
    expect(cityActivity(c, 13).tiles[136].commercial).toBeGreaterThan(0);
    const before = cityActivity(c, 13).tiles[136].commercial;
    c.tiles[136].services.powerReliability = 0; c.tiles[136].services.waterReliability = 0;
    expect(cityActivity(c, 13).tiles[136].commercial).toBeLessThan(before);
  });
  it('gives offices, food shops and industry distinct operating schedules', () => {
    const b = createBuilding('commercial', 10, 1, 0, true);
    b.subtype = 'Office building'; expect(businessSchedule(b, 13, 1)).toBeGreaterThan(businessSchedule(b, 13, 6));
    expect(businessSchedule(b, 2)).toBe(0); b.subtype = 'Food shop'; expect(businessSchedule(b, 19)).toBeGreaterThan(businessSchedule(b, 3));
    b.type = 'industrial'; expect(businessSchedule(b, 2)).toBeGreaterThan(0);
    b.business!.closedAt = 0; expect(businessSchedule(b, 13)).toBe(0);
  });
});

describe('business lifecycle and city identity', () => {
  it('closes only after sustained losses and hosts a new fictional business after sustained recovery', () => {
    const c = commuteFixture(6), t = c.tiles[136], b = t.building!;
    b.jobs = 0; b.business!.age = 60; b.business!.lossDays = 0; c.purchasingPower = 0;
    for (let i = 0; i < 44; i++) { c.tick++; operateBusinesses(c); }
    expect(b.business!.closedAt).toBeNull(); c.tick++; operateBusinesses(c);
    expect(b.business!.state).toBe('closed'); refreshCity(c);
    expect(c.jobs).toBe(0); expect(b.monthlyEconomicOutput).toBe(0); expect(cityActivity(c, 13).tiles[136].commercial).toBe(0);
    // A successor firm needs enough customers to trade from these premises, not just city-wide demand.
    const oldName = b.business!.name; c.demand.commercial = 80; c.purchasingPower = 80; t.mobility.accessibility = 90; c.population = Math.ceil(b.maximumJobs / 0.24);
    for (let i = 0; i < 38; i++) { c.tick++; operateBusinesses(c); }
    expect(b.business!.closedAt).not.toBeNull(); c.tick++; operateBusinesses(c);
    expect(b.business!.state).toBe('opening'); expect(b.business!.name).not.toBe(oldName); expect(c.counters.businessesOpened).toBe(1);
    b.jobs = 100; refreshCity(c); operateBusinesses(c); expect(b.monthlyEconomicOutput).toBeGreaterThan(0);
  });
  it('keeps flood closures temporary instead of counting economic closures', () => {
    const c = commuteFixture(6), b = c.tiles[136].building!; b.floodClosed = true;
    for (let i = 0; i < 60; i++) { c.tick++; operateBusinesses(c); }
    expect(b.business!.closedAt).toBeNull(); expect(c.counters.businessesClosed).toBe(0);
  });
  it('removes closed competitors from active commercial capacity and immediate customer journeys', () => {
    const c=commuteFixture(6), t=c.tiles[135];t.zone='commercial';t.building=createBuilding('commercial',135,c.seed,0,true);t.building.jobs=100;
    refreshCity(c);operateBusinesses(c);const before=c.tiles[136].building!.monthlyEconomicOutput;
    t.building.business!.closedAt=c.tick;refreshCity(c);operateBusinesses(c);
    expect(c.tiles[136].building!.monthlyEconomicOutput).toBeGreaterThan(before);
    c.tiles[136].building!.business!.closedAt=c.tick;
    expect(cityActivity(c,13).journeys.filter(f=>f.destination===136)).toHaveLength(0);
  });
  it('preserves neighborhood identity through expansion and save/reload, with useful aggregate statistics', () => {
    const c = createCity(0), old = c.clusters[0];
    const t = c.tiles[11 * 32 + 12]; t.zone = 'residential'; t.terrain = 'land'; t.building = createBuilding('residential', 364, c.seed, 0, true);
    t.building.occupants = 100; refreshCity(c); updateClusters(c);
    const expanded = c.clusters.find(g => g.tileIds.includes(old.tileIds[0]))!;
    expect(expanded.name).toBe(old.name); expect(expanded.id).toBe(old.id); expect(expanded.population).toBeGreaterThan(old.population);
    expect(decodeCity(JSON.parse(JSON.stringify(c))).clusters).toEqual(c.clusters);
    expect(expanded.power).toBeGreaterThan(0);
  });
  it('uses sampled households to explain genuine utility, job and flood concerns without adding population', () => {
    const c = commuteFixture(6), pop = c.population, samples = householdSamples(c); expect(samples).toHaveLength(1);
    c.tiles[130].services.floodDepth = 95; expect(householdSamples(c)[0].concern).toMatch(/Floodwater/);
    expect(c.population).toBe(pop); expect(c.living.households.length).toBeLessThanOrEqual(12);
    applyTool(c, 2, 4, 'bulldoze'); expect(c.living.households).toHaveLength(0);
    expect(() => decodeCity(JSON.parse(JSON.stringify(c)))).not.toThrow();
  });
  it('explains the exact satisfaction target rather than inventing mood modifiers', () => {
    const c = createCity(0); refreshCity(c);
    expect(c.satisfaction).toBeCloseTo(clamp(26 + sentimentFactors(c).reduce((s, f) => s + f.value, 0), 15, 92), 1);
  });
  it('records transitions with cooldowns and bounded history, without repeated popup spam', () => {
    const c = commuteFixture(6); updateLivingFeed(c); updateLivingFeed(c); expect(c.living.feed).toHaveLength(0);
    c.tiles[136].building!.business!.closedAt = 0; updateLivingFeed(c); updateLivingFeed(c);
    expect(c.living.feed.filter(e => e.kind === 'close')).toHaveLength(1);
    for (let i = 0; i < 100; i++) { c.tick++; feedEvent(c, `event:${i}`, `Actual event ${i}`); }
    expect(c.living.feed).toHaveLength(80); expect(new Set(c.living.feed.map(e => e.id)).size).toBe(80);
  });
});

describe('organic markets and informal development', () => {
  it('waits for sustained suitable conditions, creates modest market jobs/output and declines when isolated', () => {
    const c = commuteFixture(6); c.population = 900; c.purchasingPower = 80;
    c.tiles.filter(t => t.road).forEach(t => { t.roadClass = 'avenue'; });
    const candidate = c.tiles[131]; expect(marketAttraction(c, candidate)).toBeGreaterThan(55);
    c.tick = 5; updateLiving(c); expect(c.living.markets).toHaveLength(0);
    for (let i = 0; i < 3; i++) { c.tick += 5; updateLiving(c); }
    expect(c.living.markets).toHaveLength(1); expect(c.living.informal.jobs).toBeGreaterThan(0);
    expect(c.living.informal.output).toBeGreaterThan(0); const market = c.living.markets[0];
    c.tiles[market.tileId].infrastructure = { id: 'blocked', kind: 'gas', condition: 100, builtAt: 0, failedUntil: 0, storedWater: 0 };
    c.tick += 5; updateLiving(c); expect(c.living.markets).toHaveLength(0);
    c.tiles[131].terrain = 'water'; expect(marketAttraction(c, c.tiles[131])).toBe(0);
  });
  it('responds to sustained housing pressure on suitable land and integrates only with real public services', () => {
    const c = commuteFixture(6); c.demand.residential = 100;
    const t = c.tiles[131]; t.services.floodRisk = 0;
    expect(informalSuitability(c, t)).toBeGreaterThan(45);
    t.services.floodRisk = 95; expect(informalSuitability(c, t)).toBeLessThan(45); t.services.floodRisk = 0;
    for (let i = 0; i < 29; i++) { c.tick++; updateLiving(c); }
    expect(c.tiles.some(t => t.building?.tenure === 'informal')).toBe(false);
    c.tick++; updateLiving(c); const site = c.tiles.find(t => t.building?.tenure === 'informal')!;
    expect(site).toBeDefined(); expect(site.road).toBe(false); expect(site.infrastructure).toBeNull();
    const b = site.building!; b.constructionState = 'complete'; b.openedAt = c.tick; site.services.powerReliability = 0;
    c.tick++; updateLiving(c); expect(b.integrationProgress).toBe(0);
    site.services.powerReliability = 85; site.services.waterReliability = 85; site.services.drainageQuality = 80;
    for (let i = 0; i < 100; i++) { c.tick++; updateLiving(c); }
    expect(b.tenure).toBe('formal'); expect(b.integrationProgress).toBe(100);
    t.road = true; expect(informalSuitability(c, t)).toBe(0);
  });
  it('keeps total employment and tax accounting consistent with the aggregate informal economy', () => {
    const c = commuteFixture(6); c.tiles[136].building!.jobs = 10; refreshCity(c);
    for (let i = 0; i < 15; i++) { c.tick++; updateLiving(c); refreshCity(c); }
    expect(c.living.informal.output).toBeGreaterThan(0);
    expect(c.employed).toBe(c.tiles.reduce((sum, t) => sum + (t.building?.jobs ?? 0), 0) + c.living.informal.employed);
    expect(c.employed + c.unemployed).toBe(c.workforce); expect(c.employed).toBeLessThanOrEqual(c.workforce);
    expect(c.taxes.commercial).toBeGreaterThan(c.tiles[136].building!.taxContribution);
  });
  it('clears real market stalls immediately through existing road/clear tools', () => {
    const c=commuteFixture(6), id=131;c.living.markets.push({id:'actual-market',tileId:id,name:'Unity Market',age:20,stalls:3,attraction:80,jobs:6,output:270000,poorDays:0});
    expect(applyTool(c,3,4,'bulldoze')).toBe('');expect(c.living.markets).toHaveLength(0);
    expect(decodeCity(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });
});

describe('living saves, replay and presentation budgets', () => {
  it('migrates v4 without modifying original simulation state and rejects malformed living data', () => {
    const old: any = JSON.parse(JSON.stringify(createCity(1000))); old.version = 4; delete old.living;
    old.tiles.forEach((t: any) => { if (t.building) { delete t.building.tenure; delete t.building.integrationProgress; if (t.building.business) for (const k of ['lossDays', 'closedAt', 'reopenProgress', 'generation']) delete t.building.business[k]; } });
    const migrated = decodeCity(JSON.parse(JSON.stringify(old)));
    expect(migrated.version).toBe(9); expect(migrated.mobility).toEqual(old.mobility); expect(migrated.infrastructure).toEqual(old.infrastructure);
    expect(migrated.population).toBe(old.population); expect(migrated.treasury).toBe(old.treasury); expect(migrated.clusters.map(c => c.name)).toEqual(old.clusters.map((c: any) => c.name));
    const bad = JSON.parse(JSON.stringify(migrated)); bad.living.households[0].homeId = 'missing'; expect(() => decodeCity(bad)).toThrow('damaged');
    const badFeed = JSON.parse(JSON.stringify(migrated)); badFeed.living.feed = [{ tileId: -1 }]; expect(() => decodeCity(badFeed)).toThrow('damaged');
  });
  it('advances markets, households, businesses and history identically offline, including chunked replay', async () => {
    const active = createCity(1000), offline = decodeCity(JSON.parse(JSON.stringify(active)));
    advance(active, 80); active.lastSimulatedTimestamp = 1000 + 80 * TICK_MS;
    const report = await catchUpInChunks(offline, active.lastSimulatedTimestamp, async () => {});
    expect(offline).toEqual(active); expect(report.jobsAfter).toBe(offline.jobs); expect(report.marketsAfter).toBe(offline.living.markets.length);
    expect(decodeCity(JSON.parse(JSON.stringify(offline)))).toEqual(offline);
  }, 30000);
  it.each([200, 5000, 50000, 250000] as const)('uses real capacity at %i residents and bounded representative agents', population => {
    const c = livingFixture(population); expect(c.population).toBe(population);
    const a = cityActivity(c, 8), visible = new Set(c.tiles.flatMap((t, id) => t.road ? [id] : []));
    const caps = agentCaps('medium', 3, 390, 844); const plans = vehiclePlan(c, a, visible, caps.vehicles);
    expect(plans.length).toBeLessThanOrEqual(caps.vehicles); expect(a.pedestrianNetwork.length).toBeLessThanOrEqual(128);
    expect(c.living.households.length).toBeLessThanOrEqual(12);
    for (const p of plans) for (let i = 1; i < p.path.length; i++) {
      const x = c.tiles[p.path[i]], y = c.tiles[p.path[i - 1]]; expect(Math.abs(x.x - y.x) + Math.abs(x.y - y.y)).toBe(1);
    }
    expect(agentCaps('high', 0.5, 1440, 900).pedestrians).toBe(0);
  }, 30000);
});
