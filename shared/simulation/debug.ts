import type { City } from '../types/city';
import { advance, step } from './engine';
import { closeBuilding, finishConstruction, startUpgrade } from './development';
import { distributeEmployees, refreshCity, updateDemand } from './economy';
import { isOperating } from './world';
export type DebugAction = 'demand-residential' | 'demand-commercial' | 'demand-industrial' | 'development' | 'complete' | 'upgrade' | 'close-business' | 'unemployment' | 'boost' | 'month' | 'year';
export function debugAction(city: City, action: DebugAction, selected: number | null = null): string {
  const target = selected === null ? null : city.tiles[selected]?.building;
  if (action.startsWith('demand-')) {
    const zone = action.slice(7) as 'residential' | 'commercial' | 'industrial';
    city.debug.demandBoost[zone] = Math.min(100, city.debug.demandBoost[zone] + 35); city.debug.demandUntil = city.tick + 90;
  } else if (action === 'development') step(city);
  else if (action === 'complete') city.tiles.forEach(t => { if (t.building && t.building.constructionState !== 'complete') finishConstruction(city, t.building); });
  else if (action === 'upgrade') {
    const b = target ?? city.tiles.find(t => isOperating(t.building) && t.building!.level < 5 && t.building!.constructionState === 'complete')?.building;
    if (!b || !startUpgrade(b)) return 'Choose a completed, occupied property below Level 5.';
  } else if (action === 'close-business') {
    const b = target?.business ? target : city.tiles.find(t => isOperating(t.building) && t.building!.business)?.building;
    if (!b) return 'No operating business to close.'; closeBuilding(city, b);
  } else if (action === 'unemployment') { city.employed = Math.floor(city.employed * 0.3); distributeEmployees(city); }
  else if (action === 'boost') { city.debug.economyUntil = city.tick + 90; city.treasury += 25000000; }
  else if (action === 'month') advance(city, 30);
  else if (action === 'year') advance(city, 360);
  refreshCity(city); updateDemand(city);
  return `Developer action: ${action}. Temporary boosts last 90 city days.`;
}
