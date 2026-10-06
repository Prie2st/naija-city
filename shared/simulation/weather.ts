import type { City, Tile, WeatherKind } from '../types/city';
import { clamp, stableHash } from './world';
export const RAINFALL: Record<WeatherKind, number> = { clear: 0, cloudy: 0, 'light-rain': 8, 'heavy-rain': 32, 'extreme-rain': 65 };
export function setWeather(city: City, kind: WeatherKind, days = 4) {
  city.weather.kind = kind; city.weather.rainfall = RAINFALL[kind] * city.weather.climate.intensity; city.weather.remaining = days;
}
export function updateWeather(city: City) {
  const w = city.weather, day = city.tick % 360;
  w.season = day >= w.climate.rainyStart && day < w.climate.rainyEnd ? 'rainy' : 'dry';
  // A representative intraday load/solar sample rotates across days, retaining the existing daily clock.
  w.hour = [6, 12, 18, 0][city.tick % 4];
  if (--w.remaining > 0) return;
  const roll = stableHash(city.seed + 9187, city.tick) / 4294967295;
  const chance = w.season === 'rainy' ? w.climate.wetRainChance : w.climate.dryRainChance;
  const storm = stableHash(city.seed + 335, city.tick) / 4294967295;
  const kind = roll < chance ? storm > 0.9 ? 'extreme-rain' : storm > 0.5 ? 'heavy-rain' : 'light-rain' : storm > 0.55 ? 'cloudy' : 'clear';
  setWeather(city, kind, 3 + stableHash(city.seed + 194, city.tick) % 5);
}
export function initializeGeography(city: City) {
  const water = city.tiles.filter(t => t.terrain === 'water');
  for (const t of city.tiles) {
    let distance = city.size;
    for (const w of water) distance = Math.min(distance, Math.hypot(t.x - w.x, t.y - w.y));
    t.services.waterDistance = distance;
    t.services.elevation = t.terrain === 'water' ? 0 : t.terrain === 'wetland' ? 0.1 : Math.round((0.4 + distance * 0.22 + stableHash(city.seed, t.y * city.size + t.x) % 50 / 100) * 100) / 100;
  }
}
export function floodStage(depth: number): City['tiles'][number]['services']['floodStage'] {
  return depth >= 90 ? 'major' : depth >= 35 ? 'minor' : depth >= 12 ? 'waterlogged' : depth >= 2 ? 'wet' : 'dry';
}
export function floodIndicators(city: City, t: Tile) {
  const s = t.services;
  const paved = t.road ? 0.9 : t.building ? Math.min(0.96, 0.55 + t.building.level * 0.08) : t.publicFacility ? city.publicServices?.facilities.find(f=>f.id===t.publicFacility)?.type==='parks'?0.14:0.75 : t.infrastructure ? 0.65 : t.zone ? 0.2 : t.terrain === 'vegetation' ? 0.08 : 0.16;
  const vulnerability = clamp(1.35 - s.elevation * 0.12 + (s.waterDistance < 3 ? 0.45 : 0) + (t.terrain === 'wetland' ? 0.5 : 0), 0.45, 2);
  s.runoff = city.weather.rainfall * (0.18 + paved * 0.9) * vulnerability;
  const designRunoff = 32 * (0.18 + paved * 0.9) * vulnerability;
  s.drainageQuality = Math.round(clamp(s.drainageCapacity / Math.max(20, s.runoff, designRunoff) * 100));
  s.floodRisk = Math.round(clamp(18 + (5 - s.elevation) * 6 + (s.waterDistance < 4 ? 18 : 0) + paved * 22 + city.weather.rainfall * 0.4 - s.drainageCapacity * 0.6 + Math.min(12, s.floodEvents)));
}
export function refreshFloodIndicators(city: City) {
  for (const t of city.tiles) if (t.terrain !== 'water') floodIndicators(city, t);
}
export function updateFloods(city: City) {
  let flooded = 0, properties = 0;
  for (const t of city.tiles) {
    const s = t.services, oldStage = s.floodStage;
    if (t.terrain === 'water') continue;
    floodIndicators(city, t);
    const natural = (t.terrain === 'vegetation' ? 13 : 7) + s.elevation * 1.3;
    const discharge = natural + s.drainageCapacity;
    s.floodDepth = Math.round(clamp(s.floodDepth + s.runoff - discharge, 0, 220) * 10) / 10;
    s.floodStage = floodStage(s.floodDepth);
    if ((s.floodStage === 'minor' || s.floodStage === 'major') && oldStage !== 'minor' && oldStage !== 'major') {
      s.floodEvents++; city.infrastructure.floodIncidents++; if (t.building) properties++;
    }
    s.recovery = s.floodDepth >= 35 ? Math.min(30, s.recovery + 2) : Math.max(0, s.recovery - 1);
    if (s.floodDepth >= 35) flooded++;
    if (t.building) t.building.floodClosed = s.floodDepth >= 90;
  }
  city.infrastructure.floodedTiles = flooded; city.infrastructure.floodedProperties += properties;
}
