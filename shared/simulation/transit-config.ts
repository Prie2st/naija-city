import type { TransitFacilityKind, TransitMode } from '../types/transit';
/** Traffic and transit are evaluated every `cadence` days. A relative swing in residents
 * or jobs above `recheckShare` re-evaluates early; tools and route edits always do. */
export const MOBILITY = { cadence: 3, recheckShare: .05 } as const;
export const TRANSIT = {
  routeLimit: 200, stopLimit: 256, stopRouteLimit: 16, fleetLimit: 100, transfers: 2,
  walkCells: 5, walkMinutes: 1.8, walkingSpeed: 4, jobMinutes: 45, serviceHours: 16,
  waitWeight: 1.7, accessWeight: 1.25, fareMinutes: .015, transferMinutes: 5,
  reliabilityMinutes: .08, stopDwell: .5, brtDwell: .3, peakShare: .14,
  minHeadway: 1.5, depotVehicles: 60, depotCost: 60000000, depotMonthly: 1500000,
  corridorCost: 1800000, corridorMonthly: 16000, roadCapacityShare: .72,
  disruptionDays: 4, disruptionCapacity: .6, todMaximum: 8, todSmoothing: .08,
  interchangePenalty: 2, terminalPenalty: 3.5, transferWalkCells: 2,
  busPce: 2.5, brtPce: 3, busRunsMinimum: 4, historyLimit: 240,
  signalCost: 4000000, junctionCost: 12000000, roundaboutCost: 8000000,
  junctionMonthly: 35000, fareMaximum: 3000, baseChoice: 4,
  // Poor night safety removes up to this share of evening transit trips.
  eveningSafetyThreshold: 60, eveningSafetyRange: 40, eveningSafetyLoss: .25,
  // Long mixed-traffic routes accumulate delay; terminals give layover recovery.
  busLengthReliability: 1, brtLengthReliability: .3, lengthReliabilityMaximum: 10, layoverReliability: 4,
  // People carried per general-lane vehicle (cars, Okada, Keke and Danfo mixed).
  generalOccupancy: 1.5,
  // Door-to-door minutes added to private trips: finding parking, or hailing and waiting for an Okada.
  carAccess: 3, okadaWait: 3,
  // How strongly planned-transit appeal follows its time against the private or walking alternative, and its bounds.
  // Journeys slower than the alternative use the steeper exponent, so slow buses do not keep most of their riders;
  // the floor lets a journey many times slower than walking keep only a sliver of its price-based appeal.
  timeSensitivity: 1, slowerSensitivity: 2, timeFloor: .02, timeCeiling: 2,
  networkMilestones: [5000, 20000, 50000, 100000], routeMilestones: [1000, 10000],
  corridorCongestion: 80, corridorTrips: 600, jobAccessShare: .5, jobAccessTrips: 120,
} as const;
/** The 16-hour service day. Each purpose's shares sum to 1; hours sum to serviceHours. */
export const TRANSIT_PERIODS = [
  { id: 'rush', name: 'Rush hours', hours: 4, evening: false, share: { work: .42, shopping: .12, services: .3, delivery: 0 } },
  { id: 'day', name: 'Daytime', hours: 9, evening: false, share: { work: .43, shopping: .63, services: .62, delivery: 1 } },
  { id: 'evening', name: 'Evening', hours: 3, evening: true, share: { work: .15, shopping: .25, services: .08, delivery: 0 } },
] as const;
/** Useful-access bands shown by the accessibility overlay and inspectors. */
export const TRANSIT_ACCESS_BANDS = [{ name: 'Excellent', minimum: 70 }, { name: 'Good', minimum: 45 }, { name: 'Weak', minimum: 20 }, { name: 'Poor', minimum: 0 }] as const;
export const accessBand = (access: number) => TRANSIT_ACCESS_BANDS.find(b => access >= b.minimum)!.name;
/** Privately operated services keep their own fares and typical waits. */
export const INFORMAL_SERVICE = { keke: { fare: 180, wait: 4 }, danfo: { fare: 220, wait: 4 } } as const;
export const TRANSIT_VEHICLES: Record<TransitMode, { passengers: number; cost: number; dailyCost: number; fare: number; speed: number }> = {
  bus: { passengers: 50, cost: 12000000, dailyCost: 60000, fare: 160, speed: 38 },
  brt: { passengers: 90, cost: 42000000, dailyCost: 110000, fare: 220, speed: 48 },
};
export const TRANSIT_FACILITIES: Record<TransitFacilityKind, { name: string; cost: number; monthly: number; capacity: number; onRoad: boolean }> = {
  'bus-stop': { name: 'Bus stop', cost: 300000, monthly: 12000, capacity: 3500, onRoad: true },
  'brt-station': { name: 'BRT station', cost: 18000000, monthly: 450000, capacity: 24000, onRoad: true },
  'bus-terminal': { name: 'Bus terminal', cost: 35000000, monthly: 950000, capacity: 42000, onRoad: false },
  'transport-interchange': { name: 'Transport interchange', cost: 95000000, monthly: 2400000, capacity: 90000, onRoad: false },
  'bus-depot': { name: 'Bus depot', cost: TRANSIT.depotCost, monthly: TRANSIT.depotMonthly, capacity: TRANSIT.depotVehicles, onRoad: false },
};
export const TRANSIT_COLORS = [0x256d8b, 0xa95842, 0x6556a1, 0x39775b, 0xb28a35, 0x8c547d];
export const TRANSIT_OVERLAYS = ['transit-network', 'transit-accessibility', 'transit-demand', 'transit-ridership', 'jobs-accessible', 'transit-throughput'] as const;
export const isTransitFacility = (kind: string): kind is TransitFacilityKind => Object.hasOwn(TRANSIT_FACILITIES, kind);
