import { describe, expect, it } from 'vitest';
import { createCity } from '../shared/simulation/engine';
import { CityPulseTracker, detectCityPulse } from '../client/ui/city-pulse';
import { cityFraming, developedBounds } from '../client/game/camera-framing';

describe('City Pulse presentation queries', () => {
  it('detects poor public services without mutating simulation or save state', () => {
    const c = createCity(0, 731); c.infrastructure.power.reliability = 20; c.infrastructure.water.reliability = 30;
    const before = JSON.stringify(c), pulse = detectCityPulse(c);
    expect(pulse.find(p => p.id === 'power-service')?.severity).toBe('critical');
    expect(pulse.find(p => p.id === 'water-service')?.overlay).toBe('water');
    expect(JSON.stringify(c)).toBe(before); expect(c.version).toBe(9);
  });
  it('groups adjacent flooded properties and chooses a relevant affected location', () => {
    const c = createCity(0, 731), home = c.tiles.find(t => t.building?.type === 'residential')!;
    for (const t of c.tiles.filter(t => Math.abs(t.x - home.x) + Math.abs(t.y - home.y) <= 1)) t.services.floodDepth = 130;
    const floods = detectCityPulse(c).filter(p => p.id.startsWith('flood-'));
    expect(floods).toHaveLength(1); expect(floods[0].severity).toBe('critical');
    expect(c.tiles[floods[0].tileId!].building).not.toBeNull(); expect(floods[0].tileIds).toHaveLength(5);
  });
  it('deduplicates repeated updates, preserves first occurrence and resolves recovered problems', () => {
    const c = createCity(0, 731), tracker = new CityPulseTracker(); c.infrastructure.power.reliability = 20;
    tracker.update(c); c.tick += 10; tracker.update(c);
    expect(tracker.active.filter(p => p.id === 'power-service')).toHaveLength(1);
    expect(tracker.active.find(p => p.id === 'power-service')!.timestamp).toBe(0);
    c.infrastructure.power.reliability = 99; c.infrastructure.power.reserve = 50; tracker.update(c);
    expect(tracker.active.some(p => p.id === 'power-service')).toBe(false);
    expect(tracker.history.find(p => p.id === 'power-service')?.resolved).toBe(true);
    tracker.update(c); expect(tracker.history.filter(p => p.id === 'power-service')).toHaveLength(1);
  });
  it('keeps flood identity through a changing boundary without duplicate history', () => {
    const c = createCity(0, 731), tracker = new CityPulseTracker(), home = c.tiles.find(t => t.building)!;
    home.services.floodDepth = 70; tracker.update(c); c.tick = 5;
    c.tiles[home.y * c.size + home.x - 1].services.floodDepth = 70; tracker.update(c);
    expect(tracker.active.filter(p => p.id.startsWith('flood-'))).toHaveLength(1);
    expect(tracker.active.find(p => p.id.startsWith('flood-'))!.timestamp).toBe(0);
    expect(tracker.history.filter(p => p.id.startsWith('flood-'))).toHaveLength(0);
  });
  it('shows actual demand opportunities, and removes them when demand falls', () => {
    const c = createCity(0, 731); c.demand.residential = 85;
    expect(detectCityPulse(c).find(p => p.id === 'demand-residential')?.type).toBe('opportunity');
    c.demand.residential = 20;
    expect(detectCityPulse(c).some(p => p.id === 'demand-residential')).toBe(false);
  });
  it('picks the worst serviced building rather than an arbitrary empty tile', () => {
    const c = createCity(0, 731), houses = c.tiles.filter(t => t.building);
    houses.forEach(t => { t.services.powerReliability = 90; }); houses[1].services.powerReliability = 5;
    c.infrastructure.power.reliability = 30;
    expect(detectCityPulse(c).find(p => p.id === 'power-service')!.tileId).toBe(houses[1].y * c.size + houses[1].x);
  });
});

describe('adaptive city framing', () => {
  it('frames a tiny settlement closely on desktop and phone', () => {
    const c = createCity(0, 731), bounds = developedBounds(c)!;
    expect(bounds.right - bounds.left).toBeLessThan(1000);
    expect(cityFraming(c, 1440, 900).zoom).toBeGreaterThan(1.15);
    // The starter highway is long. A genuinely tiny settlement has only local road stubs.
    c.tiles.forEach(t => { if (t.road && (Math.abs(t.x - 13) > 1 || Math.abs(t.y - 13) > 1)) t.road = false; });
    expect(cityFraming(c, 390, 844).zoom).toBeGreaterThan(0.9);
  });
  it('includes distant roads, zoning, infrastructure and the skyline as expansion occurs', () => {
    const c = createCity(0, 731), small = cityFraming(c, 390, 844);
    c.tiles[0].zone = 'residential'; c.tiles[31].road = true;
    const large = cityFraming(c, 390, 844), bounds = developedBounds(c)!;
    expect(large.zoom).toBeLessThan(small.zoom); expect(bounds.right).toBeGreaterThan(840 + 31 * 24);
    expect(bounds.top).toBeLessThan(0);
  });
  it('uses the original map-centred fallback when there is nothing to frame', () => {
    const c = createCity(0, 731); c.tiles.forEach(t => { t.building = null; t.road = false; t.zone = null; t.infrastructure = null; t.progress = 0; });
    expect(developedBounds(c)).toBeNull(); expect(cityFraming(c, 390, 844)).toEqual({x:840,y:355,zoom:0.9});
  });
  it('can fit a fully developed map on a narrow phone', () => {
    const c = createCity(0, 731); c.tiles.forEach(t => { t.road = true; });
    const bounds = developedBounds(c)!, frame = cityFraming(c, 390, 844);
    expect((bounds.right - bounds.left) * frame.zoom).toBeLessThanOrEqual(345.01);
    expect(frame.zoom).toBeLessThan(0.4);
  });
});
