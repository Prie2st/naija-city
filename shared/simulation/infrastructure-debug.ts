import type { City } from '../types/city';
import { setWeather, updateFloods } from './weather';
import { updateInfrastructure, infrastructureEvents } from './infrastructure';
import { refreshCity, updateDemand } from './economy';
export type InfrastructureDebug = 'light-rain' | 'heavy-rain' | 'extreme-rain' | 'end-rain' | 'power-demand' | 'plant-failure' | 'restore-power' | 'water-demand' | 'water-shortage' | 'flood-tile' | 'clear-floods' | 'drainage-capacity' | 'damage-infrastructure' | 'repair-infrastructure';
export function infrastructureDebug(city: City, action: InfrastructureDebug, selected: number | null) {
  const i = city.infrastructure;
  if (action === 'light-rain' || action === 'heavy-rain' || action === 'extreme-rain') setWeather(city, action, 6);
  else if (action === 'end-rain') setWeather(city, 'clear', 8);
  else if (action === 'power-demand') i.debug.powerMultiplier *= 1.25;
  else if (action === 'water-demand') i.debug.waterMultiplier *= 1.25;
  else if (action === 'water-shortage') i.debug.waterUntil = city.tick + 30;
  else if (action === 'flood-tile') {
    const tile = selected === null ? null : city.tiles[selected];
    if (!tile || tile.terrain === 'water') return 'Inspect a land tile first, then open developer controls.';
    tile.services.floodDepth = 130; tile.services.floodStage = 'major'; tile.services.floodEvents++;
    i.floodIncidents++; if (tile.building) { tile.building.floodClosed = true; i.floodedProperties++; }
  } else if (action === 'clear-floods') {
    for (const t of city.tiles) { t.services.floodDepth = 0; t.services.floodStage = 'dry'; t.services.recovery = 0; if (t.building) t.building.floodClosed = false; }
  } else if (action === 'drainage-capacity') i.debug.drainageMultiplier = i.debug.drainageMultiplier === 1 ? 2 : 1;
  else if (action === 'plant-failure') {
    const plant = city.tiles.find(t => t.infrastructure && ['diesel', 'gas'].includes(t.infrastructure.kind));
    if (plant) plant.infrastructure!.failedUntil = city.tick + 30;
  } else if (action === 'restore-power') {
    city.tiles.forEach(t => { if (t.infrastructure && ['diesel', 'gas', 'solar', 'substation'].includes(t.infrastructure.kind)) { t.infrastructure.condition = 100; t.infrastructure.failedUntil = 0; } });
    i.debug.powerMultiplier = 1;
  } else if (action === 'damage-infrastructure' || action === 'repair-infrastructure') {
    city.tiles.forEach(t => { if (t.road) t.services.roadCondition = action === 'repair-infrastructure' ? 100 : 30; if (t.infrastructure) { t.infrastructure.condition = action === 'repair-infrastructure' ? 100 : 30; if (action === 'repair-infrastructure') t.infrastructure.failedUntil = 0; } });
    if (action === 'repair-infrastructure') { i.debug.waterUntil = 0; i.debug.waterMultiplier = 1; }
  }
  updateInfrastructure(city, false);
  // Debug actions do not advance floodwater or time; the next daily tick performs hydrology.
  if (action === 'clear-floods') { i.floodedTiles = 0; }
  refreshCity(city); updateDemand(city); infrastructureEvents(city);
  return `Developer action: ${action}. Rain and outages progress with simulation time.`;
}
