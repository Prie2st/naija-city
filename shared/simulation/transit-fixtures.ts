/** Deterministic QA fixture; imported only by tests/developer browser probes. */
import { createCity, refreshCity } from './engine';
import { createBuilding, setTypology } from './buildings';
import { initializeMobility, updateMobility } from './mobility';
import { initializeLiving } from './living-city';
import { initializeTransit } from './transit';
export function transitFixture(population = 900) {
  const c = createCity(1000, 731); c.treasury = 100000000000; c.weather.kind = 'clear'; c.weather.rainfall = 0; c.weather.remaining = 100;
  for (const t of c.tiles) { t.building = null; t.zone = null; t.road = false; t.roadClass = null; t.infrastructure = null; t.terrain = 'land'; t.services.floodDepth = 0; t.services.roadCondition = 100; t.services.powerReliability = 90; t.services.waterReliability = 90; }
  for (let x = 2; x <= 26; x++) { const t = c.tiles[160 + x]; t.road = true; t.roadClass = 'major'; }
  const home = c.tiles[130], job = c.tiles[154]; home.zone = 'residential'; home.building = createBuilding('residential', 130, c.seed, 0, true); setTypology(home.building, 5); home.building.maximumOccupancy = Math.max(900, population); home.building.occupants = population;
  job.zone = 'commercial'; job.building = createBuilding('commercial', 154, c.seed, 0, true); setTypology(job.building, 5); job.building.maximumJobs = Math.max(560, Math.floor(population * .45)); job.building.jobs = Math.floor(population * .45); job.building.business!.employees = job.building.jobs; job.building.business!.employeeCapacity = job.building.maximumJobs;
  c.infrastructure.revision++; c.clusters = []; refreshCity(c); initializeMobility(c); for(const t of c.tiles)if(t.road)t.roadClass='major';c.infrastructure.revision++;initializeLiving(c);refreshCity(c);initializeTransit(c);updateMobility(c,false,true); return c;
}
