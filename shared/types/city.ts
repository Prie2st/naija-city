import type { TransitNetwork, TransitFacilityKind } from './transit';
import type { SafetyState } from './safety';
import type { GovernanceState } from './governance';
import type { RoadClass, TileMobility, MobilityState } from './mobility';
import type { LivingState } from './living';
import type { FacilityKind, LocalPublicServices, PublicServiceState } from './public-services';
export type Terrain = 'land' | 'water' | 'wetland' | 'vegetation';
export type Zone = 'residential' | 'commercial' | 'industrial';
export type InfrastructureKind = 'diesel' | 'gas' | 'solar' | 'substation' | 'borehole' | 'water-tower' | 'treatment' | 'open-drain' | 'engineered-drain' | 'channel';
export type Tool = 'inspect' | 'road' | 'dirt-road' | 'avenue' | 'major-road' | Zone | 'bulldoze' | InfrastructureKind | FacilityKind | TransitFacilityKind;
export type Overlay = 'transit-network' | 'transit-accessibility' | 'transit-demand' | 'transit-ridership' | 'jobs-accessible' | 'transit-throughput' | 'police-access' | 'public-safety' | 'crime-pressure' | 'police' | 'night-safety' | 'lighting' | 'police-capacity' | 'response-time' | 'none' | 'land-value' | 'development' | 'occupancy' | 'power' | 'water' | 'drainage' | 'flood-risk' | 'traffic' | 'mobility' | 'education' | 'healthcare' | 'fire' | 'waste' | 'parks' | 'quality-of-life' | 'affordability' | 'environment' | 'development-pressure' | 'housing-pressure' | 'cost-of-living' | 'migration-pressure' | 'district-policy' | 'infrastructure-condition';
export type WeatherKind = 'clear' | 'cloudy' | 'light-rain' | 'heavy-rain' | 'extreme-rain';
export interface InfrastructureAsset { id: string; kind: InfrastructureKind; condition: number; builtAt: number; failedUntil: number; storedWater: number }
export interface TileServices {
  powerCoverage: number; powerReliability: number; waterCoverage: number; waterReliability: number;
  powerDemand: number; waterDemand: number; drainageCapacity: number; runoff: number; drainageQuality: number;
  floodRisk: number; floodDepth: number; floodStage: 'dry' | 'wet' | 'waterlogged' | 'minor' | 'major';
  floodEvents: number; recovery: number; pollution: number; elevation: number; waterDistance: number; roadCondition: number;
}
export interface InfrastructureState {
  revision: number;
  power: { supply: number; demand: number; peakDemand: number; reserve: number; reliability: number; coverage: number; generatorDependency: number };
  water: { production: number; delivered: number; demand: number; coverage: number; reliability: number; privateDependency: number; storage: number };
  costs: { power: number; water: number; drainage: number; roads: number };
  maintenance: { power: number; water: number; drainage: number; roads: number };
  fuelPrice: number; floodedTiles: number; floodedProperties: number; floodIncidents: number; economicLoss: number;
  recentEvents: { tick: number; kind: string; text: string }[]; alerts: string[]; lastEvents: Record<string, number>;
  debug: { powerMultiplier: number; waterMultiplier: number; drainageMultiplier: number; waterUntil: number };
}
export interface WeatherState {
  kind: WeatherKind; rainfall: number; remaining: number; season: 'dry' | 'rainy'; hour: number;
  climate: { rainyStart: number; rainyEnd: number; dryRainChance: number; wetRainChance: number; intensity: number };
}
export type ConstructionState = 'site-preparation' | 'construction' | 'complete' | 'redevelopment';
export interface Business {
  name: string; state: 'opening' | 'operating' | 'growing' | 'struggling' | 'closed';
  employees: number; employeeCapacity: number; economicOutput: number;
  operatingCost: number; netProfit: number; profitability: number; occupancy: number; age: number;
  lossDays: number; closedAt: number | null; reopenProgress: number; generation: number;
}
export interface Building {
  id: string; name: string; type: Zone; subtype: string; variant: number; level: number; age: number;
  constructionState: ConstructionState; constructionProgress: number; openedAt: number | null;
  occupants: number; maximumOccupancy: number; occupancy: number;
  jobs: number; maximumJobs: number; propertyValue: number; monthlyEconomicOutput: number;
  taxContribution: number; satisfaction: number; upgradeProgress: number; pendingLevel: number | null;
  abandoned: boolean; poorDays: number; abandonedAt: number | null; redevelopmentCount: number;
  business: Business | null;
  generator: number; privateWater: number; privateBorehole: boolean; floodClosed: boolean;
  tenure: 'formal' | 'informal' | 'integrating'; integrationProgress: number;
}
export interface Tile {
  x: number; y: number; terrain: Terrain; road: boolean; roadClass: RoadClass | null; mobility: TileMobility; zone: Zone | null;
  building: Building | null; progress: number; landValue: number; attractiveness: number; clusterId: number | null;
  infrastructure: InfrastructureAsset | null; services: TileServices;
  publicFacility: string | null; publicServices: LocalPublicServices;
}
export interface DevelopmentQueueEntry { tileId: number; score: number; queuedAt: number }
export interface DevelopmentCluster {
  id: number; name: string; tileIds: number[]; population: number; x: number; y: number;
  jobs: number; landValue: number; satisfaction: number; traffic: number; power: number; water: number; floodRisk: number;
  dominantZone: Zone;
  qualityOfLife?: number;
}
export interface CityCounters { buildingsOpened: number; businessesOpened: number; businessesClosed: number; upgrades: number; redevelopments: number; taxRevenue: number }
export interface TrendSample { tick: number; population: number; unemployment: number; landValue: number; satisfaction: number; income: number; residentialDemand: number; commercialDemand: number; industrialDemand: number; gridReliability: number; waterReliability: number; floodIncidents: number; generatorDependency: number; peakPowerDemand: number; averageCommute: number; congestion: number; jobAccessibility: number; transportRoutes: number }
export interface City {
  version: 9; name: string; size: number; seed: number; tick: number;
  treasury: number; population: number; jobs: number; income: number; expenses: number;
  lastSimulatedTimestamp: number; tiles: Tile[]; history: string[];
  demand: Record<Zone, number>; taxes: Record<Zone, number>;
  households: number; housingCapacity: number; occupiedHousing: number; vacantHousing: number;
  workforce: number; employed: number; unemployed: number; unemploymentRate: number;
  growth: number; satisfaction: number; purchasingPower: number; averageLandValue: number; economicOutput: number;
  developmentQueue: DevelopmentQueueEntry[]; clusters: DevelopmentCluster[];
  counters: CityCounters; milestones: string[]; trends: TrendSample[];
  debug: { demandBoost: Record<Zone, number>; demandUntil: number; economyUntil: number };
  infrastructure: InfrastructureState; weather: WeatherState; mobility: MobilityState;
  living: LivingState;
  publicServices: PublicServiceState;
  governance: GovernanceState;
  safety: SafetyState;
  transit: TransitNetwork;
}
export interface OfflineReport {
  transitBefore:number; transitAfter:number; transitAccessBefore:number; transitAccessAfter:number; transitJobsBefore:number; transitJobsAfter:number;
  safetyBefore:number; safetyAfter:number; safetyIncidents:number; seriousSafetyIncidents:number; policeResponseBefore:number; policeResponseAfter:number;
  rentBefore: number; rentAfter: number; affordabilityBefore: number; affordabilityAfter: number; displacedResidents: number;
  ticks: number; awayMs: number; simulatedMs: number; population: number; populationBefore: number; populationAfter: number;
  revenue: number; taxRevenue: number; buildingsOpened: number; businessesOpened: number; businessesClosed: number; upgrades: number; events: string[];
  commuteBefore: number; commuteAfter: number; congestionBefore: number; congestionAfter: number; routesBefore: number; routesAfter: number;
  gridBefore: number; gridAfter: number; waterBefore: number; waterAfter: number; floodIncidents: number; floodProperties: number; economicLoss: number;
  jobsBefore: number; jobsAfter: number; marketsBefore: number; marketsAfter: number;
  educationBefore: number; educationAfter: number; healthcareBefore: number; healthcareAfter: number;
  wasteBefore: number; wasteAfter: number; qolBefore: number; qolAfter: number; firesContained: number;
}
