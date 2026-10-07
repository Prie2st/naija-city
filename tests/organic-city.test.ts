import { describe, expect, it } from 'vitest';
import { advance, applyTool, catchUp, createCity, step, tileAt, TICK_MS } from '../shared/simulation/engine';
import { createBuilding, setTypology, BUILDING_LIBRARY } from '../shared/simulation/buildings';
import { attractiveness, closeBuilding, developmentTick, finishConstruction, updateBuildings, updateLandValues } from '../shared/simulation/development';
import { operateBusinesses, propertyValue, refreshCity, updateDemand } from '../shared/simulation/economy';
import { debugAction } from '../shared/simulation/debug';
import { decodeCity } from '../shared/simulation/save-format';
import type { City, Zone } from '../shared/types/city';

function addBuilding(c: City, x: number, y: number, zone: Zone, occupied = 0) {
  const t = tileAt(c, x, y)!; t.terrain = 'land'; t.zone = zone;
  t.building = createBuilding(zone, y * c.size + x, c.seed, c.tick, true);
  if (zone === 'residential') t.building.occupants = occupied;
  refreshCity(c); updateDemand(c); return t;
}
export function growthScenario() {
  const c = createCity(0);
  // A growing city now needs the player's infrastructure investment as well as roads and zoning.
  applyTool(c, 10, 19, 'gas'); applyTool(c, 11, 19, 'treatment');
  applyTool(c, 13, 19, 'substation'); applyTool(c, 19, 19, 'substation');
  applyTool(c, 13, 21, 'channel'); applyTool(c, 20, 21, 'channel');
  for (let x = 5; x <= 22; x++) {
    applyTool(c, x, 21, 'road');
    if (!tileAt(c, x, 20)!.road) applyTool(c, x, 20, x <= 14 ? 'residential' : x <= 18 ? 'commercial' : 'industrial');
  }
  return c;
}
describe('condition-driven city demand', () => {
  it('raises residential interest for spare jobs and lowers it for excessive vacant housing', () => {
    const c = createCity(0), original = c.demand.residential;
    c.jobs = 1000; updateDemand(c); expect(c.demand.residential).toBeGreaterThan(original);
    const strong = c.demand.residential; c.housingCapacity = 3000; c.vacantHousing = 2500;
    updateDemand(c); expect(c.demand.residential).toBeLessThan(strong);
    c.unemploymentRate = 90; updateDemand(c); expect(c.demand.residential).toBeLessThan(strong);
  });
  it('uses population, purchasing power and commercial supply', () => {
    const c = createCity(0), original = c.demand.commercial;
    c.population = 1500; updateDemand(c); expect(c.demand.commercial).toBeGreaterThan(original);
    const strong = c.demand.commercial; c.purchasingPower = 0; updateDemand(c); expect(c.demand.commercial).toBeLessThan(strong);
    addBuilding(c, 12, 17, 'commercial'); addBuilding(c, 14, 17, 'commercial');
    expect(c.demand.commercial).toBeLessThan(strong);
  });
  it('uses workforce, unemployment and industrial capacity, with all values normalized', () => {
    const c = createCity(0), original = c.demand.industrial;
    addBuilding(c, 12, 17, 'industrial'); expect(c.demand.industrial).toBeLessThan(original);
    c.unemploymentRate = 90; updateDemand(c); expect(c.demand.industrial).toBeGreaterThan(40);
    for (const value of Object.values(c.demand)) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(100); }
  });
});
describe('private development lifecycle', () => {
  it('explains road, demand, employment, land value, neighbourhood occupancy and industry effects', () => {
    const c = createCity(0); applyTool(c, 12, 16, 'residential');
    const check = attractiveness(c, tileAt(c, 12, 16)!);
    expect(check.factors.map(f => f.label).join(' ')).toMatch(/road.*demand.*development.*employment.*Land value.*occupancy/i);
    addBuilding(c, 11, 16, 'industrial');
    expect(attractiveness(c, tileAt(c, 12, 16)!).factors.find(f => f.label.includes('industrial'))!.value).toBeLessThan(0);
    applyTool(c, 3, 3, 'residential'); expect(attractiveness(c, tileAt(c, 3, 3)!).eligible).toBe(false);
  });
  it('ranks neighbouring parcels and starts gradually, never every zoned tile at once', () => {
    const c = createCity(0);
    // Exercise queue ranking independently from storm closures and the resulting loss of jobs.
    c.weather.kind = 'clear'; c.weather.rainfall = 0; c.weather.remaining = 100;
    applyTool(c, 13, 17, 'engineered-drain'); applyTool(c, 11, 17, 'borehole'); applyTool(c, 15, 17, 'substation');
    for (const [x, y] of [[12, 16], [14, 16], [12, 18], [14, 18]]) applyTool(c, x, y, 'residential');
    debugAction(c, 'demand-residential'); debugAction(c, 'demand-residential');
    expect(c.tiles.filter(t => t.building).length).toBe(6); advance(c, 6);
    expect(c.tiles.filter(t => t.building).length).toBe(6);
    advance(c, 6);
    const sites = c.tiles.filter(t => t.building && t.building.openedAt === null);
    expect(sites.length).toBeGreaterThan(0); expect(sites.length).toBeLessThanOrEqual(3);
    expect(c.developmentQueue.length).toBeGreaterThan(0);
    expect(c.developmentQueue[0].score).toBeGreaterThanOrEqual(c.developmentQueue.at(-1)!.score);
  });
  it('shows site preparation then construction, with no residents or tax before opening', () => {
    const c = createCity(0), t = tileAt(c, 12, 16)!;
    t.zone = 'residential'; t.building = createBuilding('residential', 16 * 32 + 12, c.seed, 0);
    refreshCity(c); expect(t.building.constructionState).toBe('site-preparation'); expect(t.building.taxContribution).toBe(0);
    advance(c, 3); expect(t.building.constructionState).toBe('construction'); expect(t.building.occupants).toBe(0);
    advance(c, 6); expect(t.building.constructionState).toBe('complete'); expect(c.counters.buildingsOpened).toBe(1);
  });
  it('cancels queued parcels when cleared or converted to roads', () => {
    const c = createCity(0); applyTool(c, 12, 18, 'residential');
    c.developmentQueue = [{ tileId: 18 * 32 + 12, queuedAt: 0, score: 80 }];
    applyTool(c, 12, 18, 'bulldoze'); expect(c.developmentQueue).toHaveLength(0);
    c.tick = 3; developmentTick(c); expect(tileAt(c, 12, 18)!.building).toBeNull();
  });
  it('provides deterministic Nigerian typologies across all five levels', () => {
    for (const type of ['residential', 'commercial', 'industrial'] as Zone[]) {
      expect(BUILDING_LIBRARY[type]).toHaveLength(5);
      const a = createBuilding(type, 300, 731, 0), b = createBuilding(type, 300, 731, 0); expect(a).toEqual(b);
      for (let level = 1; level <= 5; level++) { setTypology(a, level); expect(a.subtype).toBeTruthy(); expect(a.maximumOccupancy + a.maximumJobs).toBeGreaterThan(0); }
    }
  });
});
describe('aggregate housing, migration and employment', () => {
  it('cannot exceed real housing and admits residents when jobs and homes are available', () => {
    const c = createCity(0);
    // Isolate housing/migration from the now employment-disrupting deterministic storm.
    c.weather.kind = 'clear'; c.weather.rainfall = 0; c.weather.remaining = 100;
    for (const t of c.tiles) if (t.building?.type === 'residential') t.building.occupants = t.building.maximumOccupancy;
    const factory = addBuilding(c, 12, 17, 'industrial'); setTypology(factory.building!, 3); refreshCity(c);
    const full = c.population; advance(c, 10); expect(c.population).toBe(full); expect(c.vacantHousing).toBe(0);
    addBuilding(c, 14, 17, 'residential'); advance(c, 10); expect(c.population).toBeGreaterThan(full);
    expect(c.population).toBeLessThanOrEqual(c.housingCapacity); expect(c.occupiedHousing + c.vacantHousing).toBe(c.housingCapacity);
  });
  it('matches employment gradually and can lose population under persistent poor conditions', () => {
    const c = createCity(0); addBuilding(c, 12, 17, 'industrial'); step(c);
    expect(c.employed).toBeGreaterThan(120); expect(c.employed).toBeLessThan(c.workforce);
    expect(c.unemployed).toBe(c.workforce - c.employed);
    debugAction(c, 'unemployment'); const population = c.population; step(c);
    expect(c.population).toBeLessThan(population); expect(c.satisfaction).toBeLessThan(85);
  });
});
describe('land, property, upgrades and business health', () => {
  it('values connected neighbourhoods over isolation and penalizes abandonment', () => {
    const c = createCity(0); for (let i = 0; i < 10; i++) updateLandValues(c);
    const connected = tileAt(c, 12, 13)!, isolated = tileAt(c, 2, 2)!;
    expect(connected.landValue).toBeGreaterThan(isolated.landValue);
    const old = connected.landValue;
    c.tiles.filter(t => t.building).forEach(t => closeBuilding(c, t.building!));
    for (let i = 0; i < 10; i++) updateLandValues(c);
    expect(connected.landValue).toBeLessThan(old);
  });
  it('derives property values from level, land, type and occupancy', () => {
    const c = createCity(0), t = tileAt(c, 12, 10)!; refreshCity(c);
    const original = propertyValue(t); t.landValue = 90; expect(propertyValue(t)).toBeGreaterThan(original);
    t.building!.occupancy = 0.1; const vacant = propertyValue(t); t.building!.occupancy = 1; expect(propertyValue(t)).toBeGreaterThan(vacant);
    const low = propertyValue(t); setTypology(t.building!, 3); expect(propertyValue(t)).toBeGreaterThan(low);
  });
  it('accumulates upgrade interest and rebuilds before increasing density', () => {
    const c = createCity(0), t = tileAt(c, 12, 10)!, b = t.building!;
    b.age = 30; b.occupants = b.maximumOccupancy; refreshCity(c); t.landValue = 90; c.demand.residential = 100;
    for (let i = 0; i < 30; i++) { c.tick++; updateBuildings(c); }
    expect(b.level).toBe(1); expect(b.pendingLevel).toBe(2); expect(b.constructionState).toBe('redevelopment');
    for (let i = 0; i < 20; i++) { c.tick++; updateBuildings(c); }
    expect(b.level).toBe(2); expect(b.maximumOccupancy).toBe(220); expect(b.redevelopmentCount).toBe(1);
    expect(c.counters.upgrades).toBe(1); expect(c.history.some(h => h.includes('Level 2 residential'))).toBe(true);
  });
  it('calculates business output, costs and profitability and taxes without collection', () => {
    const c = createCity(0), b = tileAt(c, 14, 14)!.building!;
    expect(b.business!.economicOutput).toBeGreaterThan(0); expect(b.business!.netProfit).toBe(b.business!.economicOutput - b.business!.operatingCost);
    const old = b.business!.profitability; b.jobs = 0; operateBusinesses(c); expect(b.business!.profitability).toBeLessThan(old);
    const before = c.treasury; step(c);
    expect(c.treasury - before).toBeCloseTo((c.income - c.expenses) / 30);
    expect(c.income).toBe(c.taxes.residential + c.taxes.commercial + c.taxes.industrial);
  });
  it('requires prolonged decline before abandoning and supports eventual recovery', () => {
    const c = createCity(0), t = tileAt(c, 14, 14)!, b = t.building!;
    b.business!.profitability = 0;
    for (let i = 0; i < 89; i++) { c.tick++; updateBuildings(c); }
    // Owners hold on for 90 days plus a per-building share of the spread, so a shared shock is staggered.
    expect(b.abandoned).toBe(false); let days = 89;
    while (!b.abandoned && days < 200) { c.tick++; updateBuildings(c); days++; }
    expect(b.abandoned).toBe(true); expect(days).toBeGreaterThanOrEqual(90); expect(days).toBeLessThanOrEqual(150);
    refreshCity(c); expect(b.taxContribution).toBe(0); expect(b.business!.state).toBe('closed');
    c.tick += 30; c.demand.commercial = 100; t.landValue = 70; updateBuildings(c);
    expect(b.constructionState).toBe('redevelopment'); finishConstruction(c, b); refreshCity(c);
    expect(b.abandoned).toBe(false); expect(c.counters.redevelopments).toBe(1); expect(c.counters.businessesOpened).toBe(1);
  });
});
describe('living city integration and persistence', () => {
  it('organically grows a neighbourhood with population, businesses, upgrades and meaningful history', () => {
    const c = growthScenario(); advance(c, 360);
    const summary = { population: c.population, buildings: c.counters.buildingsOpened, businesses: c.counters.businessesOpened, upgrades: c.counters.upgrades, abandoned: c.counters.businessesClosed };
    console.log('One-year organic scenario:', summary);
    expect(c.counters.buildingsOpened).toBeGreaterThan(3); expect(c.population).toBeGreaterThan(500);
    expect(c.counters.businessesOpened).toBeGreaterThan(0); expect(c.counters.upgrades).toBeGreaterThan(0);
    expect(c.clusters.some(cluster => cluster.tileIds.length >= 8)).toBe(true);
    expect(c.history.length).toBeLessThanOrEqual(60); expect(new Set(c.milestones).size).toBe(c.milestones.length);
    expect(c.population).toBeLessThanOrEqual(c.housingCapacity);
  }, 30000);
  it('keeps queue, construction, migration, profit, upgrades and offline results deterministic across save/reload', () => {
    const a = growthScenario(); advance(a, 30);
    const b = decodeCity(JSON.parse(JSON.stringify(a)));
    advance(a, 240); a.lastSimulatedTimestamp = 240 * TICK_MS;
    const report = catchUp(b, 240 * TICK_MS); expect(b).toEqual(a);
    expect(report.taxRevenue).toBeGreaterThan(0); expect(report.buildingsOpened).toBeGreaterThan(0);
    expect(report.populationAfter).toBe(b.population);
    const c = decodeCity(JSON.parse(JSON.stringify(b))); expect(c).toEqual(b);
  }, 30000);
});
