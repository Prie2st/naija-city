import type { TransitFacilityKind, TransitMode } from '../types/transit';
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
} as const;
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
