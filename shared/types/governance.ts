import type { Overlay, Zone } from './city';

export type Priority = 'low' | 'standard' | 'high';
export type PolicyId = 'street-lighting' | 'community-safety' | 'commercial-patrol' | 'hub-safety' | 'density' | 'affordable' | 'infill' | 'commerce' | 'industry' | 'business' | 'transit' | 'pedestrian' | 'drainage' | 'waste' | 'green' | 'integration' | 'community-upgrade' | 'formalization';
/** What a policy's monthly cost scales with; cost is naira per unit per month at full strength. */
export type PolicyBasis = 'residents' | 'informal-residents' | 'roads' | 'commercial-jobs' | 'industrial-jobs' | 'business-jobs' | 'commercial-buildings' | 'drains' | 'waste-depots' | 'stops';
export interface PolicyDefinition {
  id: PolicyId; name: string; category: string; description: string;
  scope: 'both'; cost: number; basis: PolicyBasis; requirements: string; effects: Partial<PolicyEffects>;
}
export interface PolicyEffects { lighting:number; prevention:number; commercialPatrol:number; hubSafety:number; residential: number; commercial: number; industrial: number; upgrade: number; rent: number; business: number; transit: number; walking: number; drainage: number; environment: number; integration: number; waste: number }
export interface PolicyState { id: PolicyId; districtId: string | null; enabled: boolean; activationDate: number; changedAt: number; strength: number }
export interface HousingMarketState {
  units: number; occupied: number; vacant: number; demand: number; pressure: number; averageRent: number; affordability: number; overcrowding: number;
  displacedResidents: number; displacedSince: number; rehoused: number; departed: number; costOfLiving: number; inequality: number; incomeBands: number[];
}
export interface LocalGovernance { districtId: string | null; rent: number; income: number; affordability: number; costOfLiving: number; environment: number; migration: number; pressure: number; floodEvents: number; effects: PolicyEffects }
export interface DistrictMetrics { population: number; households: number; housing: number; vacancy: number; jobs: number; employment: number; jobHousingBalance: number; affordability: number; rent: number; landValue: number; qualityOfLife: number; power: number; water: number; drainage: number; congestion: number; environment: number; informalResidents: number; floodEvents: number; businesses: number }
export interface District { id: string; name: string; tiles: number[]; createdAt: number; neighborhoodIds: number[]; metrics: DistrictMetrics }
export interface UrbanChallenge { id: string; kind: string; title: string; description: string; causes: string[]; responses: string[]; severity: 'critical' | 'warning' | 'notice'; districtId: string | null; tileId: number | null; overlay: Overlay; timestamp: number; resolved: boolean; resolvedAt: number | null }
export interface GovernanceSample { tick: number; population: number; jobs: number; rent: number; affordability: number; qualityOfLife: number; revenue: number; expenses: number; congestion: number; reserves: number }
export type ObjectiveId = 'affordable' | 'commercial' | 'industrial' | 'transit' | 'resilient' | 'quality';
export interface GovernanceState {
  taxes: { target: Record<Zone, number>; effective: Record<Zone, number>; changedAt: Record<Zone, number> };
  policies: PolicyState[]; priorities: Record<'power' | 'water' | 'roads' | 'drainage', Priority>;
  districts: District[]; nextDistrictId: number; local: LocalGovernance[]; housing: HousingMarketState;
  challenges: UrbanChallenge[]; history: GovernanceSample[]; lastEvents: Record<string, number>;
  programCost: number; clearanceShock: number; deficitDays: number; objective: ObjectiveId | null;
  health: Record<string, number>; forecast: { population: number; housingNeed: number; powerDemand: number; waterDemand: number; annualBalance: number };
}
