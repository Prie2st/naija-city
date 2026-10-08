export type TransitMode = 'bus' | 'brt';
export type TransitFacilityKind = 'bus-stop' | 'brt-station' | 'bus-terminal' | 'transport-interchange' | 'bus-depot';
export interface TransitStop {
  id: string; name: string; kind: TransitFacilityKind; tileId: number; anchor: number; builtAt: number;
  condition: number; capacity: number; routes: string[]; boardings: number; transfers: number;
  demand: number; crowding: number; accessibility: number; nightSafety: number; lighting: number;
}
export type TransitStation = TransitStop;
export type TransitHub = TransitStop;
export type TransitDepot = TransitStop;
export interface TransitRoute {
  id: string; name: string; mode: TransitMode; color: number; stops: string[]; path: number[];
  length: number; vehicles: number; availableVehicles: number; headway: number; capacity: number;
  ridership: number; demand: number; speed: number; wait: number; minutes: number; reliability: number;
  operatingCost: number; fare: number; revenue: number; subsidy: number; crowding: number;
  status: 'active' | 'suspended' | 'disrupted' | 'no-depot'; createdAt: number; legacy: boolean;
  suspended: boolean; deadhead: number; segmentLoads: number[];
}
export interface TransitTransfer { from: string; to: string; tileId: number; passengers: number }
export interface TransitDemand {
  flowId: string; passengers: number; minutes: number; cost: number; transfers: number;
  legs: { routeId: string; mode: 'bus' | 'brt' | 'danfo' | 'keke'; from: string; to: string }[];
}
export interface TransitAccessibility {
  access: number; demand: number; ridership: number; jobs45: number; education: number;
  healthcare: number; commerce: number; center: number; firstMile: number; lastMile: number;
  tod: number; throughput: number;
}
export interface TransitFinanceState {
  bus: number; brt: number; stations: number; terminals: number; depots: number;
  fares: number; subsidy: number; recovery: number;
}
export interface TransitNetwork {
  revision: number; nextId: number; lastTick: number; stops: TransitStop[]; routes: TransitRoute[];
  corridors: number[]; junctions: Record<string, 'signal' | 'high-capacity' | 'roundabout'>;
  works: Record<string, number>; demand: TransitDemand[]; transfers: TransitTransfer[];
  local: TransitAccessibility[]; districts: Record<string, TransitAccessibility>;
  finance: TransitFinanceState; subsidyRate: number; integration: 'neutral' | 'integrate' | 'support';
  stats: { ridership: number; access: number; jobs45: number; wait: number; reliability: number;
    throughput: number; crowding: number; depotCapacity: number; assignedFleet: number; profile: string };
  history: { tick: number; ridership: number; access: number; jobs45: number; wait: number; subsidy: number }[];
}
