import type { FacilityKind, LocalPublicServices, PublicServiceState, ServiceGroup } from '../types/public-services';
export interface FacilityDefinition {
  name: string; group: ServiceGroup; cost: number; capacity: number; staff: number; monthlyCost: number;
  power: number; water: number; minutes: number; footprint: number; role: string; wasteStorage?: number;
}
export const SERVICE_GROUPS: ServiceGroup[] = ['education', 'healthcare', 'fire', 'waste', 'parks', 'police'];
export const PUBLIC_SERVICES: Record<FacilityKind, FacilityDefinition> = {
  'police-post': { name:'Police Post', group:'police', cost:8000000, capacity:6000, staff:12, monthlyCost:700000, power:.025, water:2, minutes:10, footprint:1, role:'Local patrol and one concurrent response' },
  'police-station': { name:'Police Station', group:'police', cost:32000000, capacity:30000, staff:48, monthlyCost:2800000, power:.09, water:8, minutes:20, footprint:1, role:'Neighborhood patrol and four concurrent responses' },
  'area-command': { name:'Area Command', group:'police', cost:110000000, capacity:100000, staff:150, monthlyCost:8500000, power:.3, water:24, minutes:30, footprint:2, role:'District coordination and ten concurrent responses; road access required' },
  'primary-school': { name: 'Primary School', group: 'education', cost: 12000000, capacity: 1200, staff: 28, monthlyCost: 1100000, power: 0.04, water: 9, minutes: 10, footprint: 1, role: 'Local primary seats · 12% of residents' },
  'secondary-school': { name: 'Secondary School', group: 'education', cost: 28000000, capacity: 2000, staff: 46, monthlyCost: 2000000, power: 0.08, water: 16, minutes: 18, footprint: 2, role: 'Secondary seats · 8% of residents' },
  phc: { name: 'Primary Health Centre', group: 'healthcare', cost: 15000000, capacity: 500, staff: 24, monthlyCost: 1600000, power: 0.1, water: 12, minutes: 12, footprint: 1, role: '500 monthly visits · basic local care' },
  hospital: { name: 'General Hospital', group: 'healthcare', cost: 140000000, capacity: 8000, staff: 180, monthlyCost: 12000000, power: 1.2, water: 140, minutes: 28, footprint: 2, role: '8,000 monthly visits · wider emergency access' },
  'fire-station': { name: 'Fire Station', group: 'fire', cost: 20000000, capacity: 25000, staff: 32, monthlyCost: 2100000, power: 0.06, water: 14, minutes: 14, footprint: 1, role: 'Emergency readiness for 25,000 residents' },
  'waste-depot': { name: 'Waste Collection Depot', group: 'waste', cost: 14000000, capacity: 90, staff: 38, monthlyCost: 2400000, power: 0.08, water: 3, minutes: 22, footprint: 1, role: '90 tonnes/day collection · needs reachable landfill' },
  landfill: { name: 'Landfill', group: 'waste', cost: 35000000, capacity: 600, staff: 30, monthlyCost: 2800000, power: 0.03, water: 2, minutes: 60, footprint: 2, role: '600 tonnes/day disposal · local land-value cost', wasteStorage: 1000000 },
  'pocket-park': { name: 'Pocket Park', group: 'parks', cost: 2500000, capacity: 1500, staff: 3, monthlyCost: 120000, power: 0.003, water: 1, minutes: 4, footprint: 1, role: 'Small nearby recreation space' },
  'neighborhood-park': { name: 'Neighborhood Park', group: 'parks', cost: 11000000, capacity: 15000, staff: 12, monthlyCost: 550000, power: 0.012, water: 5, minutes: 9, footprint: 2, role: 'Shared neighborhood recreation' },
  'city-park': { name: 'City Park', group: 'parks', cost: 35000000, capacity: 80000, staff: 30, monthlyCost: 1500000, power: 0.025, water: 14, minutes: 18, footprint: 3, role: 'Nine-tile destination park · local access still matters' },
};
export const SERVICE_BALANCE = {
  primaryRatio: 0.12, secondaryRatio: 0.08, healthcareVisits: 0.1,
  residentialWaste: 0.00065, commercialWaste: 0.0011, industrialWaste: 0.0022,
  fundingMinimum: 50, fundingMaximum: 150, maxFacilities: 128,
  fireChance: 0.012, fireRecovery: 0.45, qolRate: 0.025, maxFires: 24,
  maxLandValueBonus: 8, maxLandValuePenalty: 13,
};
export const isPublicService = (kind: string): kind is FacilityKind => Object.hasOwn(PUBLIC_SERVICES, kind);
export function fundingEffect(percent: number) { return percent <= 100 ? percent / 100 : 1 + (percent - 100) * 0.003; }
export function emptyPublicTile(): LocalPublicServices {
  const coverage = () => ({ access: 0, served: 0, quality: 0, minutes: 0, facilityId: null });
  return { police: coverage(), education: coverage(), healthcare: coverage(), fire: coverage(), waste: coverage(), parks: coverage(), primary: 0, secondary: 0,
    educationDemand: 0, healthcareDemand: 0, wasteGenerated: 0, uncollectedWaste: 0, fireRisk: 0, fireDamage: 0, fireActive: false, qualityOfLife: 45, landfillPenalty: 0 };
}
export function publicServiceState(): PublicServiceState {
  const stats = () => ({ demand: 0, capacity: 0, usage: 0, served: 0, access: 0, quality: 0 });
  return { revision: 0, facilities: [], funding: { police:100, education: 100, healthcare: 100, fire: 100, waste: 100, parks: 100 }, costs: { police:0, education: 0, healthcare: 0, fire: 0, waste: 0, parks: 0 },
    stats: { police:stats(), education: stats(), healthcare: stats(), fire: stats(), waste: stats(), parks: stats() }, qualityOfLife: 45, qolTarget: 45, breakdown: {}, publicJobs: 0, employed: 0, reachableJobs: 0, jobTargets: {},
    waste: { generated: 0, collected: 0, backlog: 0, disposalCapacity: 0, disposed: 0 }, fires: [], fireCount: 0, containedFires: 0, averageResponse: 0, history: [], previous: {} };
}

// Structural QoL weights sum to 1; unlike current sentiment this converges slowly.
export const QOL_WEIGHTS=[.17,.08,.10,.13,.10,.10,.08,.08,.08,.08] as const;
