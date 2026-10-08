// Developer/test fixtures use real building capacities and the existing mobility engine.
// They never load or write a player's save, and are not imported by the production entry.
import { createCity, refreshCity } from './engine';
import { createBuilding, setTypology } from './buildings';
import { initializeMobility, updateMobility } from './mobility';
import { initializeLiving } from './living-city';
import { operateBusinesses } from './economy';
import { emptyServices } from './infrastructure-config';
import type { Zone } from '../types/city';

export function livingFixture(population: 200 | 1000 | 5000 | 10000 | 50000 | 100000 | 250000 | 500000) {
  const city = createCity(0, 812);
  for (const t of city.tiles) {
    t.terrain = 'land'; t.road = false; t.roadClass = null; t.zone = null;
    t.building = null; t.infrastructure = null; t.services = emptyServices(); t.clusterId = null;
    t.services.powerReliability = 85; t.services.waterReliability = 85;
    t.services.drainageQuality = 80; t.landValue = 68;
    if (t.y % 3 === 1 || t.x % 8 === 1) { t.road = true; t.roadClass = population >= 50000 ? 'avenue' : 'local'; }
  }
  // Fixture construction replaces the starter assets: invalidate cached reach maps.
  city.infrastructure.revision++;
  city.clusters = []; city.living.informal.jobs = 0;
  const level = population === 200 ? 1 : population <= 5000 ? 2 : population <= 10000 ? 3 : population <= 100000 ? 4 : 5;
  const place = (id: number, type: Zone) => {
    const t = city.tiles[id]; t.zone = type; t.building = createBuilding(type, id, city.seed, 0, true);
    setTypology(t.building, level); return t.building;
  };
  const sites = city.tiles.flatMap((t, id) => !t.road ? [id] : []);
  let remaining = population;
  // Interleaving employers and homes keeps the dense fixture accessible without fake population.
  for (let i = 0; i < sites.length && remaining > 0; i++) {
    const b = place(sites[i], i % 3 === 2 ? (i % 6 === 2 ? 'commercial' : 'industrial') : 'residential');
    if (b.type === 'residential') { b.occupants = Math.min(remaining, b.maximumOccupancy); remaining -= b.occupants; }
    else { b.jobs = Math.floor(b.maximumJobs * 0.8); b.business!.age = 60; }
  }
  if (population === 200) { const b = place(sites[2], 'commercial'); b.jobs = 75; }
  refreshCity(city); initializeMobility(city); initializeLiving(city);
  operateBusinesses(city); refreshCity(city);
  for (let day = 0; day < 20; day++) { city.tick++; updateMobility(city); }
  initializeLiving(city);
  return city;
}

export function commuteFixture(length = 18) {
  const city = livingFixture(200);
  for (const t of city.tiles) { t.road = false; t.roadClass = null; t.zone = null; t.building = null; }
  for (let x = 2; x <= length + 2; x++) { const t = city.tiles[5 * 32 + x]; t.road = true; t.roadClass = 'local'; }
  for (const [id, type] of [[130, 'residential'], [130 + length, 'commercial']] as [number, Zone][]) {
    const t = city.tiles[id]; t.zone = type; t.building = createBuilding(type, id, city.seed, 0, true);
    setTypology(t.building, 5); t.building.occupants = t.building.maximumOccupancy;
    t.building.jobs = Math.min(t.building.maximumJobs, 400);
    if (t.building.business) t.building.business.age = 60;
  }
  city.tick = 0; refreshCity(city); initializeMobility(city); initializeLiving(city);
  operateBusinesses(city); refreshCity(city); return city;
}
