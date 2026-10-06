export type ServiceGroup = 'education' | 'healthcare' | 'fire' | 'waste' | 'parks' | 'police';
export type FacilityKind = 'police-post' | 'police-station' | 'area-command' | 'primary-school' | 'secondary-school' | 'phc' | 'hospital' | 'fire-station' | 'waste-depot' | 'landfill' | 'pocket-park' | 'neighborhood-park' | 'city-park';
export type FacilityStatus = 'operating' | 'strained' | 'overcrowded' | 'understaffed' | 'utility-disrupted' | 'underfunded' | 'inactive';
export interface PublicServiceFacility {
  id: string; name: string; type: ServiceGroup; subtype: FacilityKind; location: number; tiles: number[]; builtAt: number;
  status: FacilityStatus; capacity: number; effectiveCapacity: number; currentUsage: number; served: number;
  coverageMinutes: number; averageAccess: number; serviceQuality: number; fundingLevel: number;
  employeesRequired: number; employeesAvailable: number; powerRequired: number; waterRequired: number;
  powerReliability: number; waterReliability: number; monthlyOperatingCost: number; maintenanceCondition: number;
  storedWaste: number; active: boolean;
}
export interface ServiceCoverage { access: number; served: number; quality: number; minutes: number; facilityId: string | null }
export interface LocalPublicServices {
  police: ServiceCoverage; education: ServiceCoverage; healthcare: ServiceCoverage; fire: ServiceCoverage; waste: ServiceCoverage; parks: ServiceCoverage;
  primary: number; secondary: number; educationDemand: number; healthcareDemand: number;
  wasteGenerated: number; uncollectedWaste: number; fireRisk: number; fireDamage: number;
  fireActive: boolean; qualityOfLife: number; landfillPenalty: number;
}
export interface ServiceStatistics { demand: number; capacity: number; usage: number; served: number; access: number; quality: number }
export interface FireIncident {
  id: string; tileId: number; startedAt: number; age: number; intensity: number; damage: number;
  stationId: string | null; responseMinutes: number; path: number[]; resolvedAt: number | null;
}
export interface PublicServiceState {
  revision: number; facilities: PublicServiceFacility[]; funding: Record<ServiceGroup, number>;
  costs: Record<ServiceGroup, number>; stats: Record<ServiceGroup, ServiceStatistics>;
  qualityOfLife: number; qolTarget: number; breakdown: Record<string, number>;
  publicJobs: number; employed: number; reachableJobs: number; jobTargets: Record<string, number>;
  waste: { generated: number; collected: number; backlog: number; disposalCapacity: number; disposed: number };
  fires: FireIncident[]; fireCount: number; containedFires: number; averageResponse: number;
  history: { tick: number; education: number; healthcare: number; waste: number; parks: number; qualityOfLife: number; fires: number }[];
  previous: Record<string, number | string>;
}
