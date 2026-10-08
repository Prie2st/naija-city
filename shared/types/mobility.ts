export type RoadClass = 'dirt' | 'local' | 'avenue' | 'major';
export type TravelMode = 'walk' | 'car' | 'okada' | 'keke' | 'danfo' | 'bus' | 'brt';
export interface TileMobility {
  dailyTrips: number; vehicleFlow: number; capacity: number; effectiveCapacity: number; speed: number;
  congestion: number; accessibility: number; footTraffic: number; sharedCoverage: number; majorFlow: string;
}
export interface TravelFlow {
  id: string; origin: number; destination: number; originName: string; destinationName: string;
  purpose: 'work' | 'shopping' | 'delivery' | 'services'; trips: number; distance: number; minutes: number; path: number[];
  modes: Record<TravelMode, number>;
}
export interface TransportRoute {
  id: string; mode: 'keke' | 'danfo' | 'bus'; origin: number; destination: number; originName: string; destinationName: string;
  waypoints: number[]; path: number[]; demand: number; ridership: number; vehicles: number; capacity: number;
  averageSpeed: number; minutes: number; profitability: number; netProfit: number; reliability: number;
  congestionImpact: number; age: number; poorDays: number; formalized: boolean; suspended: boolean; createdAt: number;
}
export interface TransportStop { tileId: number; passengers: number; routes: string[]; designated: boolean }
export interface TransportHub { tileId: number; name: string; passengers: number; routes: string[] }
export interface MobilityState {
  revision: number; lastTick: number; sourcePopulation: number; sourceJobs: number; flows: TravelFlow[]; routes: TransportRoute[];
  corridors: { id: string; interest: number; lastSeen: number }[];
  stops: TransportStop[]; hubs: TransportHub[]; jobTargets: Record<string, number>;
  stats: { dailyTrips: number; averageCommute: number; averageSpeed: number; congestion: number; jobAccessibility: number;
    sharedCoverage: number; sharedUsage: number; reachableWorkers: number; modes: Record<TravelMode, number> };
  costs: { buses: number; administration: number; fares: number };
  history: { tick: number; text: string }[];
  debug: { demandMultiplier: number; loadMultiplier: number; until: number };
}
