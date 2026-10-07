import { describe, expect, it } from 'vitest';
import { advance, createCity, step } from '../shared/simulation/engine';
import { distributeSubstationLoad, assetAgeFactor, maintainedCondition } from '../shared/simulation/infrastructure';
import { migrationBalance, persistentUnemployment, refreshCity, shopHours, underemployment } from '../shared/simulation/economy';
import { closeBuilding, updateBuildings } from '../shared/simulation/development';
import { debtService, fiscalFunding, fiscalStage, policyEstimate, taxCompliance } from '../shared/simulation/governance';
import { setWeather, updateWeather, updateFloods, floodSeverity } from '../shared/simulation/weather';
import { nationalEconomy } from '../shared/simulation/national-economy';
import { BALANCE } from '../shared/simulation/balance-config';
import { GOVERNANCE } from '../shared/simulation/governance-config';
import { isOperating } from '../shared/simulation/world';
import type { City } from '../shared/types/city';

const homes = (c: City) => c.tiles.filter(t => isOperating(t.building) && t.building!.type === 'residential');

describe('power distribution', () => {
  it('lets a second substation add capacity to an overloaded area and leaves single coverage unchanged', () => {
    const c = createCity(0), ids = [100, 101, 102, 103];
    const reset = () => { for (const t of c.tiles) t.services.powerCoverage = 0; for (const id of ids) c.tiles[id].services.powerDemand = 6; };
    const covered = ids.map(id => ({ id, strength: 1 }));
    reset(); distributeSubstationLoad(c, [{ covered, quality: 1, capacity: 12 }]);
    const one = c.tiles[100].services.powerCoverage;
    expect(one).toBeCloseTo(50, 5); // 12 MW against 24 MW of demand
    reset(); distributeSubstationLoad(c, [{ covered, quality: 1, capacity: 12 }, { covered, quality: 1, capacity: 12 }]);
    expect(c.tiles[100].services.powerCoverage).toBeCloseTo(100, 5);
  });
  it('lets underfunded upkeep wear assets down to a condition in proportion to funding, not to zero', () => {
    let reduced = 92, none = 92, restored = 40;
    for (let day = 0; day < 360 * 20; day++) { reduced = maintainedCondition(reduced, 60); none = maintainedCondition(none, 0); restored = maintainedCondition(restored, 100); }
    expect(reduced).toBeCloseTo(92 * 0.6, 1); expect(none).toBe(0); expect(restored).toBeCloseTo(92, 0);
  });
  it('raises operating costs gradually as assets age, up to a cap', () => {
    expect(assetAgeFactor({ tick: 0 }, 0)).toBe(1);
    expect(assetAgeFactor({ tick: 3600 }, 0)).toBeCloseTo(1 + 10 * BALANCE.ageing.yearlyGrowth, 5);
    expect(assetAgeFactor({ tick: 360 * 200 }, 0)).toBe(1 + BALANCE.ageing.maximum);
  });
});

describe('labour market and migration', () => {
  it('tapers arrivals with unemployment instead of stopping at full employment', () => {
    const c = createCity(0); refreshCity(c);
    const set = (jobs: number) => { c.jobs = jobs; c.employed = Math.min(c.workforce, jobs); c.unemployed = c.workforce - c.employed; c.unemploymentRate = c.unemployed / c.workforce * 100; c.vacantHousing = 400; c.satisfaction = 70; c.trends = []; };
    set(c.workforce); const full = migrationBalance(c);
    set(Math.round(c.workforce * 0.88)); const some = migrationBalance(c);
    set(Math.round(c.workforce * 0.75)); const none = migrationBalance(c);
    expect(full).toBeGreaterThan(0); expect(some).toBeGreaterThanOrEqual(0); expect(some).toBeLessThan(full); expect(none).toBeLessThanOrEqual(0);
  });
  it('does not force a whole departure every day when the push is small', () => {
    const c = createCity(0); refreshCity(c);
    let departed = 0;
    for (let day = 0; day < 100; day++) {
      c.tick = day; c.satisfaction = 40; c.trends = []; c.jobs = c.workforce; c.employed = c.workforce; c.unemployed = 0; c.vacantHousing = 0;
      departed -= Math.min(0, migrationBalance(c));
    }
    // A push of about 0.1 on 500 residents is about 0.3 departures a day, not 1.
    expect(departed).toBeGreaterThan(5); expect(departed).toBeLessThan(70);
  });
  it('treats workers at flood-closed firms as temporarily laid off', () => {
    const c = createCity(0); refreshCity(c);
    const shop = c.tiles.find(t => t.building?.type === 'commercial')!.building!;
    const before = persistentUnemployment(c);
    shop.floodClosed = true; refreshCity(c);
    expect(c.unemploymentRate).toBeGreaterThan(before + 20);
    expect(persistentUnemployment(c)).toBeLessThanOrEqual(before + 1);
  });
  it('lets shops short of customers cut hours instead of paying idle shifts', () => {
    expect(shopHours('commercial', 1.2)).toBe(1);
    expect(shopHours('commercial', 0.45)).toBe(BALANCE.labour.minimumHours);
    expect(shopHours('industrial', 0.3)).toBe(1);
    const c = createCity(0); refreshCity(c);
    expect(underemployment(c)).toBe(0); // 500 residents fully support the founding shop
    c.population = 300; expect(underemployment(c)).toBeGreaterThan(0.1);
  });
});

describe('recovery', () => {
  it('rehouses residents of an abandoned home and clears long-abandoned shells', () => {
    const c = createCity(0); refreshCity(c);
    const t = homes(c)[0], b = t.building!, residents = b.occupants;
    closeBuilding(c, b);
    expect(b.abandoned).toBe(true); expect(c.governance.housing.displacedResidents).toBe(residents);
    c.demand.residential = 0; c.tick += BALANCE.recovery.clearAbandonedAfter; updateBuildings(c);
    expect(t.building).toBeNull(); expect(t.zone).toBe('residential');
  });
  it('keeps the untouched starting town alive through its first years of floods', () => {
    for (const seed of [731, 1009]) {
      const c = createCity(0, seed); advance(c, 360 * 3);
      const shop = c.tiles.find(t => t.building?.type === 'commercial')!.building!;
      expect(c.population).toBeGreaterThan(300);
      expect(shop.abandoned).toBe(false);
    }
  }, 60000);
});

describe('municipal finance', () => {
  it('moves through fiscal stages with debt measured in months of spending', () => {
    const c = createCity(0); refreshCity(c);
    c.income = 12e6; c.expenses = 10e6; c.treasury = 5e6; expect(fiscalStage(c)).toBe('surplus');
    c.income = 10.2e6; expect(fiscalStage(c)).toBe('balanced');
    c.treasury = -1e6; expect(fiscalStage(c)).toBe('deficit');
    c.treasury = -40e6; expect(fiscalStage(c)).toBe('stress'); expect(fiscalFunding(c)).toBe(BALANCE.fiscal.stressFunding);
    c.treasury = -100e6; expect(fiscalStage(c)).toBe('severe'); expect(fiscalFunding(c)).toBe(BALANCE.fiscal.severeFunding);
  });
  it('charges interest on debt but caps it below revenue so recovery remains possible', () => {
    const c = createCity(0); refreshCity(c);
    c.income = 10e6; c.treasury = 5e6; expect(debtService(c)).toBe(0);
    c.treasury = -20e6; expect(debtService(c)).toBeCloseTo(20e6 * BALANCE.fiscal.interestRate, 3);
    c.treasury = -1e12; expect(debtService(c)).toBe(10e6 * BALANCE.fiscal.interestRevenueCap);
  });
  it('collects less of each extra tax point as rates rise, without a dominant extreme', () => {
    const c = createCity(0), t = GOVERNANCE.taxes.commercial;
    const revenue = (rate: number) => { c.governance.taxes.effective.commercial = rate; return rate * taxCompliance(c, 'commercial'); };
    expect(taxCompliance(c, 'commercial')).toBeLessThanOrEqual(1);
    const base = revenue(t.base), max = revenue(t.max);
    expect(max).toBeGreaterThan(base); expect(max / base).toBeLessThan(t.max / t.base * 0.75);
  });
  it('prices policies by what they serve: lighting by road, community programmes by resident', () => {
    const c = createCity(0); refreshCity(c);
    const roads = c.tiles.filter(t => t.road).length, residents = homes(c).reduce((s, t) => s + t.building!.occupants, 0);
    const admin = GOVERNANCE.effects.policyAdministration;
    expect(policyEstimate(c, 'street-lighting', null) - admin).toBeCloseTo(roads * 5000, 0);
    expect(policyEstimate(c, 'community-safety', null) - admin).toBeCloseTo(residents * 70, 0);
  });
});

describe('weather and floods', () => {
  it('tapers storm spells and keeps seasonal rainfall in a believable range', () => {
    const c = createCity(0); setWeather(c, 'extreme-rain', 6);
    const days = [c.weather.rainfall];
    for (let i = 0; i < 4; i++) { updateWeather(c); days.push(c.weather.rainfall); }
    expect(days[1]).toBeLessThan(days[0]); expect(days[4]).toBeLessThanOrEqual(days[1]);
    const year = createCity(0, 4242); let total = 0;
    for (let d = 0; d < 360; d++) { year.tick++; updateWeather(year); total += year.weather.rainfall; }
    expect(total).toBeGreaterThan(1200); expect(total).toBeLessThan(3200);
  });
  it('lets flood memory fade instead of penalizing land forever', () => {
    const c = createCity(0), t = c.tiles.find(t => t.terrain === 'land')!;
    t.services.floodEvents = 5; c.weather.rainfall = 0;
    for (let d = 0; d < 500; d++) updateFloods(c);
    expect(t.services.floodEvents).toBeLessThan(2.5); expect(t.services.floodEvents).toBeGreaterThan(0.5);
  });
  it('grades city flooding from nuisance to severe', () => {
    const c = createCity(0), developed = c.tiles.filter(t => t.building || t.road);
    expect(floodSeverity(c).level).toBe('none');
    developed[0].services.floodDepth = 20; expect(floodSeverity(c).level).toBe('nuisance');
    for (const t of developed.slice(0, Math.ceil(developed.length * 0.2))) t.services.floodDepth = 60;
    expect(floodSeverity(c).level).toBe('severe');
  });
});

describe('long-term evolution', () => {
  it('derives a deterministic national cycle from the seed and day', () => {
    const a = nationalEconomy({ seed: 731, tick: 3600 }), b = nationalEconomy({ seed: 731, tick: 3600 });
    expect(a).toEqual(b);
    const samples = Array.from({ length: 50 }, (_, y) => nationalEconomy({ seed: 731, tick: y * 360 }).business);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.08);
    expect(Math.max(...samples)).toBeLessThan(1.15); expect(Math.min(...samples)).toBeGreaterThan(0.85);
  });
  it('updates fuel prices from the national cycle each day', () => {
    const c = createCity(0); step(c);
    expect(c.infrastructure.fuelPrice).toBe(Math.round(nationalEconomy(c).fuel * 1000) / 1000);
  });
});
