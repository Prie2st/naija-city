/** Deterministic QA fixture; imported only by tests/developer browser probes. */
import { applyTool, createCity, previewTool, refreshCity } from './engine';
import { createBuilding, setTypology } from './buildings';
import { initializeMobility, updateMobility } from './mobility';
import { initializeLiving } from './living-city';
import { publicServiceFixture } from './public-service-fixtures';
import { invalidateRoadGraph } from './road-network';
import { buildBrtCorridor, createTransitRoute, initializeTransit, placeTransitFacility } from './transit';
export function transitFixture(population = 900) {
  const c = createCity(1000, 731); c.treasury = 100000000000; c.weather.kind = 'clear'; c.weather.rainfall = 0; c.weather.remaining = 100;
  for (const t of c.tiles) { t.building = null; t.zone = null; t.road = false; t.roadClass = null; t.infrastructure = null; t.terrain = 'land'; t.services.floodDepth = 0; t.services.roadCondition = 100; t.services.powerReliability = 90; t.services.waterReliability = 90; }
  for (let x = 2; x <= 26; x++) { const t = c.tiles[160 + x]; t.road = true; t.roadClass = 'major'; }
  const home = c.tiles[130], job = c.tiles[154]; home.zone = 'residential'; home.building = createBuilding('residential', 130, c.seed, 0, true); setTypology(home.building, 5); home.building.maximumOccupancy = Math.max(900, population); home.building.occupants = population;
  job.zone = 'commercial'; job.building = createBuilding('commercial', 154, c.seed, 0, true); setTypology(job.building, 5); job.building.maximumJobs = Math.max(560, Math.floor(population * .45)); job.building.jobs = Math.floor(population * .45); job.building.business!.employees = job.building.jobs; job.building.business!.employeeCapacity = job.building.maximumJobs;
  c.infrastructure.revision++; c.clusters = []; refreshCity(c); initializeMobility(c); for(const t of c.tiles)if(t.road)t.roadClass='major';c.infrastructure.revision++;initializeLiving(c);refreshCity(c);initializeTransit(c);updateMobility(c,false,true); return c;
}
/**
 * QA network on the aggregate public-service city: drainage so the untended city
 * survives rainy seasons, a major north–south arterial with a BRT corridor, two
 * bus lines and a depot. Used by long-run, route-count and scale tests.
 */
export function transitNetworkFixture(population: 10000 | 100000 | 500000 = 10000) {
  const c = publicServiceFixture(population); c.treasury = 100000000000;
  for (let y = 1; y < 32; y += 6) for (let x = 1; x < 32; x += 6) if (previewTool(c, x, y, 'channel').status === 'valid') applyTool(c, x, y, 'channel');
  for (let y = 0; y < 32; y++) { const t = c.tiles[y * 32 + 17]; if (t.road) t.roadClass = 'major'; }
  c.infrastructure.revision++; invalidateRoadGraph(c);
  const place = (tiles: number[], kind: 'brt-station' | 'bus-stop') => tiles.filter(id => placeTransitFacility(c, id, kind) === '');
  const stations = place([1, 4, 7, 10, 13, 16, 19, 22, 25, 28].map(y => y * 32 + 17), 'brt-station');
  buildBrtCorridor(c, [stations[0], stations.at(-1)!]);
  const column = place([1, 4, 7, 10, 13, 16, 22, 25].map(y => y * 32 + 9), 'bus-stop'), row = place([3, 7, 12, 21, 28].map(x => 4 * 32 + x), 'bus-stop');
  // Dense fixtures have no vacant parcel: release one employer site for the depot.
  let depot = c.tiles.findIndex(t => !t.road && !t.building && !t.zone && !t.publicFacility && !t.infrastructure && c.tiles.some(r => r.road && Math.abs(r.x - t.x) + Math.abs(r.y - t.y) === 1));
  if (depot < 0) { depot = c.tiles.findIndex(t => t.building?.type === 'industrial' && c.tiles.some(r => r.road && Math.abs(r.x - t.x) + Math.abs(r.y - t.y) === 1)); c.tiles[depot].building = null; c.tiles[depot].zone = null; refreshCity(c); }
  placeTransitFacility(c, depot, 'bus-depot');
  const ids = (tiles: number[]) => tiles.map(id => c.transit.stops.find(s => s.tileId === id)!.id);
  createTransitRoute(c, 'brt', ids(stations), 8); createTransitRoute(c, 'bus', ids(column), 6); createTransitRoute(c, 'bus', ids(row), 4);
  updateMobility(c, false, true); return c;
}
