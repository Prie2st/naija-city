import type { City } from '../types/city';
import { BALANCE } from './balance-config';
import { stableHash } from './world';

/**
 * A slow national economic backdrop, derived only from the seed and the day so saves and offline
 * catch-up stay deterministic without new saved state. Business demand rises and falls over a
 * decade-scale cycle, and fuel prices drift against it with a gentle long-term rise, so mature cities
 * keep meeting changing conditions instead of settling into one permanent state.
 */
export function nationalEconomy(city: Pick<City, 'seed' | 'tick'>) {
  const E = BALANCE.economy, years = city.tick / 360;
  const phase = (stableHash(city.seed, 5101) % 1000) / 1000 * Math.PI * 2, shortPhase = (stableHash(city.seed, 5107) % 1000) / 1000 * Math.PI * 2;
  const cycle = Math.sin(years / E.cycleYears * Math.PI * 2 + phase), short = Math.sin(years / E.shortYears * Math.PI * 2 + shortPhase);
  const business = 1 + cycle * E.cycleAmplitude + short * E.shortAmplitude;
  const fuel = Math.max(0.5, 1 - cycle * E.fuelAmplitude * 0.6 + short * E.fuelAmplitude * 0.4 + Math.min(E.fuelTrendMaximum, years * E.fuelTrendPerYear));
  return { business, fuel, cycle };
}
/** Applies the national fuel price for the day; called once per simulated day. */
export function updateNationalEconomy(city: City) {
  city.infrastructure.fuelPrice = Math.round(nationalEconomy(city).fuel * 1000) / 1000;
}
