import { describe, expect, it } from 'vitest';
import { advance, applyTool, catchUp, catchUpInChunks, createCity, previewTool, step, tileAt, TICK_MS } from '../shared/simulation/engine';
import { asset } from '../shared/simulation/infrastructure-config';
import { buildingPowerDemand, buildingWaterDemand, effectiveServices, maintainedCondition, supportsDensity, updateInfrastructure } from '../shared/simulation/infrastructure';
import { setWeather, updateFloods, updateWeather } from '../shared/simulation/weather';
import { attractiveness, updateBuildings, updateLandValues } from '../shared/simulation/development';
import { operateBusinesses, refreshCity } from '../shared/simulation/economy';
import { infrastructureDebug } from '../shared/simulation/infrastructure-debug';
import { decodeCity } from '../shared/simulation/save-format';
import type { City, InfrastructureKind } from '../shared/types/city';

function place(c: City, x: number, y: number, kind: InfrastructureKind) {
  const t = tileAt(c, x, y)!; t.infrastructure = asset(kind, c.seed, y * c.size + x, c.tick); c.infrastructure.revision++; return t;
}
function noServices(c: City) {
  c.tiles.forEach(t => { t.infrastructure = null; }); c.infrastructure.revision++; updateInfrastructure(c, false);
}
function robustServices(c: City) {
  place(c, 10, 8, 'gas'); place(c, 15, 12, 'substation'); place(c, 15, 18, 'substation');
  place(c, 10, 12, 'treatment'); place(c, 15, 18, 'substation'); place(c, 16, 18, 'water-tower');
  place(c, 13, 12, 'channel'); place(c, 13, 18, 'channel'); updateInfrastructure(c, false); updateFloods(c);
}
describe('capacity, distribution and private resilience', () => {
  it('uses occupancy, level, business hours and evening household loads', () => {
    const c = createCity(0), home = tileAt(c, 12, 10)!.building!, shop = tileAt(c, 14, 14)!.building!;
    expect(buildingPowerDemand(home, 18)).toBeGreaterThan(buildingPowerDemand(home, 12));
    expect(buildingPowerDemand(shop, 12)).toBeGreaterThan(buildingPowerDemand(shop, 0));
    const old = buildingPowerDemand(home, 12); home.level = 3; expect(buildingPowerDemand(home, 12)).toBeGreaterThan(old);
    home.occupants = 0; expect(buildingPowerDemand(home, 12)).toBe(0);
    expect(buildingWaterDemand(shop)).toBeGreaterThan(0);
  });
  it('does not confuse generation with distribution coverage', () => {
    const c = createCity(0); noServices(c); place(c, 10, 8, 'gas'); updateInfrastructure(c, false);
    expect(c.infrastructure.power.supply).toBe(25); expect(c.infrastructure.power.reliability).toBe(0);
    place(c, 13, 11, 'substation'); updateInfrastructure(c, false);
    expect(c.infrastructure.power.reliability).toBeGreaterThan(80);
    expect(tileAt(c, 2, 2)!.services.powerCoverage).toBe(0);
  });
  it('has local substation capacity constraints even with ample generation', () => {
    const c = createCity(0); robustServices(c); const before = c.infrastructure.power.reliability;
    c.infrastructure.debug.powerMultiplier = 100; updateInfrastructure(c, false);
    expect(c.infrastructure.power.reliability).toBeLessThan(before); expect(c.infrastructure.power.reserve).toBeLessThan(0);
    expect(tileAt(c, 14, 14)!.services.powerCoverage).toBeLessThan(100);
  });
  it('produces solar electricity according to daylight and weather', () => {
    const c = createCity(0); noServices(c); place(c, 10, 8, 'solar'); c.weather.hour = 12; updateInfrastructure(c, false);
    expect(c.infrastructure.power.supply).toBe(8); setWeather(c, 'heavy-rain'); updateInfrastructure(c, false);
    expect(c.infrastructure.power.supply).toBeCloseTo(1.6); c.weather.hour = 0; updateInfrastructure(c, false); expect(c.infrastructure.power.supply).toBe(0);
  });
  it('responds to fuel prices with higher diesel costs and lower effective supply', () => {
    const c = createCity(0), original = c.infrastructure.power.supply, cost = c.infrastructure.costs.power;
    c.infrastructure.fuelPrice = 3; updateInfrastructure(c, false);
    expect(c.infrastructure.power.supply).toBeLessThan(original); expect(c.infrastructure.costs.power).toBeGreaterThan(cost);
  });
  it('adopts generators gradually and reduces dependence after network recovery', () => {
    const c = createCity(0); noServices(c); const b = tileAt(c, 14, 14)!.building!;
    for (let n = 0; n < 30; n++) updateInfrastructure(c);
    const usage = b.generator; expect(usage).toBeGreaterThan(30); expect(effectiveServices(tileAt(c, 14, 14)!).power).toBeGreaterThan(0);
    robustServices(c); for (let n = 0; n < 30; n++) updateInfrastructure(c);
    expect(b.generator).toBeLessThan(usage); expect(c.infrastructure.power.reliability).toBeGreaterThan(80);
  });
  it('reduces business output and profits during power/water shortages', () => {
    const c = createCity(0); robustServices(c); operateBusinesses(c);
    const b = tileAt(c, 14, 14)!.building!, output = b.monthlyEconomicOutput, profit = b.business!.netProfit;
    noServices(c); operateBusinesses(c);
    expect(b.monthlyEconomicOutput).toBeLessThan(output); expect(b.business!.netProfit).toBeLessThan(profit);
  });
  it('needs both water production and local coverage; towers cannot create water', () => {
    const c = createCity(0); noServices(c); place(c, 13, 11, 'water-tower'); updateInfrastructure(c, false);
    expect(c.infrastructure.water.production).toBe(0); expect(c.infrastructure.water.reliability).toBe(0);
    place(c, 10, 8, 'borehole'); updateInfrastructure(c); expect(c.infrastructure.water.production).toBeGreaterThan(0);
    expect(c.infrastructure.water.reliability).toBeGreaterThan(50); expect(c.infrastructure.water.storage).toBeGreaterThan(0);
    const storage = c.infrastructure.water.storage; c.tiles.forEach(t => { if (t.infrastructure?.kind === 'borehole') t.infrastructure.failedUntil = 100; });
    updateInfrastructure(c); expect(c.infrastructure.water.storage).toBeLessThan(storage); expect(c.infrastructure.water.delivered).toBeGreaterThan(0);
    for (let n = 0; n < 20; n++) updateInfrastructure(c); expect(c.infrastructure.water.reliability).toBe(0);
  });
  it('provides local borehole reach and adopts private tanks under shortage', () => {
    const c = createCity(0); noServices(c); place(c, 12, 10, 'borehole'); updateInfrastructure(c, false);
    expect(tileAt(c, 12, 10)!.services.waterCoverage).toBe(100); expect(tileAt(c, 20, 20)!.services.waterCoverage).toBe(0);
    noServices(c); for (let n = 0; n < 35; n++) updateInfrastructure(c);
    const b = tileAt(c, 14, 14)!.building!, before = b.privateWater; expect(before).toBeGreaterThan(40); expect(b.privateBorehole).toBe(true);
    robustServices(c); for (let n = 0; n < 40; n++) updateInfrastructure(c); expect(b.privateWater).toBeLessThan(before);
  });
  it('places infrastructure with valid previews, charges capital and preserves roads under drains', () => {
    const c = createCity(0), before = c.treasury;
    expect(previewTool(c, 10, 10, 'gas').status).toBe('valid'); applyTool(c, 10, 10, 'gas'); expect(c.treasury).toBe(before - 90000000);
    expect(previewTool(c, 10, 10, 'gas').status).toBe('unchanged'); expect(previewTool(c, 12, 10, 'gas').status).toBe('invalid');
    applyTool(c, 13, 16, 'engineered-drain'); expect(tileAt(c, 13, 16)!.road).toBe(true);
    expect(tileAt(c, 13, 16)!.infrastructure?.kind).toBe('engineered-drain');
  });
});
describe('seeded weather and spatial flooding', () => {
  it('holds weather for several days and generates repeatable seasons/storms', () => {
    const a = createCity(0), b = createCity(0); setWeather(a, 'heavy-rain', 6); updateWeather(a); expect(a.weather.kind).toBe('heavy-rain');
    for (const c of [a, b]) { c.weather.remaining = 0; c.tick = 150; updateWeather(c); }
    expect(a.weather).toEqual(b.weather); expect(a.weather.season).toBe('rainy');
    a.tick = 20; updateWeather(a); expect(a.weather.season).toBe('dry');
  });
  it('produces more rain during rainy season across deterministic seeds', () => {
    let dry = 0, wet = 0;
    const c = createCity(0);
    for (let seed = 1; seed <= 60; seed++) {
      c.seed = seed; c.tick = 20; c.weather.remaining = 0; updateWeather(c); dry += c.weather.rainfall;
      c.tick = 160; c.weather.remaining = 0; updateWeather(c); wet += c.weather.rainfall;
    }
    expect(wet).toBeGreaterThan(dry * 2);
  });
  it('explains vulnerable low-lying paving and reduces runoff under vegetation', () => {
    const c = createCity(0), a = tileAt(c, 23, 16)!, b = tileAt(c, 22, 16)!;
    a.terrain = 'land'; b.terrain = 'vegetation'; a.road = true;
    b.services.elevation = a.services.elevation; b.services.waterDistance = a.services.waterDistance;
    setWeather(c, 'heavy-rain'); updateInfrastructure(c, false); updateFloods(c);
    expect(a.services.runoff).toBeGreaterThan(b.services.runoff); expect(a.services.floodRisk).toBeGreaterThan(b.services.floodRisk);
    expect(a.services.floodRisk).toBeGreaterThan(tileAt(c, 3, 3)!.services.floodRisk);
  });
  it('accumulates floods gradually and protects areas with adequate drainage during comparable storms', () => {
    const a = createCity(0), b = createCity(0);
    for (const c of [a, b]) { const t = tileAt(c, 23, 16)!; t.terrain = 'land'; t.road = true; setWeather(c, 'extreme-rain'); }
    place(b, 23, 16, 'channel'); updateInfrastructure(a, false); updateInfrastructure(b, false);
    for (let n = 0; n < 5; n++) { updateFloods(a); updateFloods(b); }
    expect(tileAt(a, 23, 16)!.services.floodDepth).toBeGreaterThan(90);
    expect(tileAt(b, 23, 16)!.services.floodDepth).toBe(0); expect(b.infrastructure.floodIncidents).toBeLessThan(a.infrastructure.floodIncidents);
  });
  it('recovers faster with drainage and retains temporary economic effects', () => {
    const a = createCity(0), b = createCity(0); for (const c of [a, b]) { tileAt(c, 14, 14)!.services.floodDepth = 150; setWeather(c, 'clear'); }
    place(b, 14, 14, 'engineered-drain'); updateInfrastructure(b, false);
    updateFloods(a); updateFloods(b); expect(tileAt(b, 14, 14)!.services.floodDepth).toBeLessThan(tileAt(a, 14, 14)!.services.floodDepth);
    expect(tileAt(a, 14, 14)!.services.recovery).toBeGreaterThan(0);
  });
  it('temporarily closes flooded businesses and reopens them after recovery', () => {
    const c = createCity(0), t = tileAt(c, 14, 14)!; t.services.floodDepth = 140; updateFloods(c); operateBusinesses(c);
    expect(t.building!.floodClosed).toBe(true); expect(t.building!.business!.state).toBe('closed'); expect(t.building!.monthlyEconomicOutput).toBe(0);
    expect(t.building!.abandoned).toBe(false); place(c, 14, 14, 'channel'); updateInfrastructure(c, false); updateFloods(c); operateBusinesses(c);
    expect(t.building!.floodClosed).toBe(false); expect(t.building!.monthlyEconomicOutput).toBeGreaterThan(0);
  });
});
describe('maintenance, density and offline integration', () => {
  it('deteriorates slowly and repairs with higher maintenance spending', () => {
    const c = createCity(0), plant = c.tiles.find(t => t.infrastructure?.kind === 'diesel')!.infrastructure!;
    c.infrastructure.maintenance.power = 0; for (let n = 0; n < 100; n++) updateInfrastructure(c);
    const worn = plant.condition; expect(worn).toBeLessThan(95); expect(worn).toBeGreaterThan(80);
    c.infrastructure.maintenance.power = 150; for (let n = 0; n < 100; n++) updateInfrastructure(c); expect(plant.condition).toBeGreaterThan(worn);
  });
  it('keeps normally maintained assets viable over a long offline horizon', () => {
    let normal = 100, deferred = 100;
    for (let n = 0; n < 17280; n++) { normal = maintainedCondition(normal, 100); deferred = maintainedCondition(deferred, 0); }
    expect(normal).toBeCloseTo(92); expect(deferred).toBe(0);
  });
  it('makes overbuilt infrastructure an actual treasury expense', () => {
    const c = createCity(0); place(c, 10, 8, 'gas'); place(c, 9, 8, 'gas'); updateInfrastructure(c, false); refreshCity(c);
    expect(c.expenses).toBeGreaterThan(c.income); const before = c.treasury; step(c); expect(c.treasury).toBeLessThan(before);
  });
  it('changes parcel attractiveness, land values and density eligibility with infrastructure quality', () => {
    const a = createCity(0), b = createCity(0); noServices(a); robustServices(b);
    for (const c of [a, b]) { applyTool(c, 12, 16, 'residential'); updateFloods(c); for (let n = 0; n < 8; n++) updateLandValues(c); }
    expect(attractiveness(b, tileAt(b, 12, 16)!).score).toBeGreaterThan(attractiveness(a, tileAt(a, 12, 16)!).score);
    expect(tileAt(b, 12, 16)!.landValue).toBeGreaterThan(tileAt(a, 12, 16)!.landValue);
    expect(supportsDensity(tileAt(a, 12, 10)!, 3)).toBe(false); expect(supportsDensity(tileAt(b, 12, 10)!, 3)).toBe(true);
  });
  it('prevents private generators and tanks alone from enabling high-rise density', () => {
    const c = createCity(0); noServices(c); const t = tileAt(c, 12, 10)!; t.building!.generator = 100; t.building!.privateWater = 100;
    t.services.drainageQuality = 100; expect(supportsDensity(t, 2)).toBe(true); expect(supportsDensity(t, 3)).toBe(false);
  });
  it('unlocks real organic redevelopment after public service and drainage investment', () => {
    const c = createCity(0); noServices(c); const t = tileAt(c, 12, 10)!, b = t.building!;
    b.level = 2; b.maximumOccupancy = 220; b.occupants = 220; b.occupancy = 1; b.age = 100; t.landValue = 90;
    c.demand.residential = 100;
    for (let n = 0; n < 40; n++) { c.tick++; updateBuildings(c); }
    expect(b.pendingLevel).toBeNull(); expect(b.upgradeProgress).toBe(0);
    robustServices(c); t.landValue = 90;
    for (let n = 0; n < 30; n++) { c.tick++; updateBuildings(c); }
    expect(b.pendingLevel).toBe(3); expect(b.constructionState).toBe('redevelopment');
    for (let n = 0; n < 20; n++) { c.tick++; updateBuildings(c); }
    expect(b.level).toBe(3); expect(b.maximumOccupancy).toBe(360);
  });
  it('simulates rainfall, flooding, outages and recovery identically online and offline', async () => {
    const a = createCity(0); setWeather(a, 'extreme-rain', 6); infrastructureDebug(a, 'plant-failure', null);
    const b = decodeCity(JSON.parse(JSON.stringify(a))), c = decodeCity(JSON.parse(JSON.stringify(a)));
    advance(a, 100); a.lastSimulatedTimestamp = 100 * TICK_MS;
    const report = catchUp(b, 100 * TICK_MS); let yields = 0;
    await catchUpInChunks(c, 100 * TICK_MS, async () => { yields++; });
    expect(b).toEqual(a); expect(c).toEqual(a); expect(yields).toBeGreaterThan(0);
    expect(report.floodIncidents).toBeGreaterThan(0); expect(report.economicLoss).toBeGreaterThan(0);
    expect(b.infrastructure.recentEvents.some(e => e.kind === 'rain')).toBe(true);
  }, 30000);
  it('round-trips complete v3 infrastructure, weather, adaptations and flood history', () => {
    const c = createCity(0); setWeather(c, 'heavy-rain'); advance(c, 15);
    expect(decodeCity(JSON.parse(JSON.stringify(c)))).toEqual(c);
    const bad = JSON.parse(JSON.stringify(c)); bad.tiles[0].services.floodDepth = -1; expect(() => decodeCity(bad)).toThrow();
  });
});
