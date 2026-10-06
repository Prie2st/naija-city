import type { City, InfrastructureAsset, InfrastructureKind, TileServices, WeatherState } from '../types/city';
export interface InfrastructureDefinition { name: string; cost: number; capacity: number; radius: number; operatingCost: number; pollution: number; group: 'power' | 'water' | 'drainage' }
export const INFRASTRUCTURE: Record<InfrastructureKind, InfrastructureDefinition> = {
  diesel: { name: 'Small diesel plant', cost: 4000000, capacity: 3, radius: 0, operatingCost: 350000, pollution: 18, group: 'power' },
  gas: { name: 'Gas power plant', cost: 90000000, capacity: 25, radius: 0, operatingCost: 1400000, pollution: 9, group: 'power' },
  solar: { name: 'Solar farm', cost: 25000000, capacity: 8, radius: 0, operatingCost: 180000, pollution: 0, group: 'power' },
  substation: { name: 'Substation', cost: 3000000, capacity: 12, radius: 7, operatingCost: 45000, pollution: 0, group: 'power' },
  borehole: { name: 'Borehole', cost: 1000000, capacity: 180, radius: 4, operatingCost: 65000, pollution: 0, group: 'water' },
  'water-tower': { name: 'Water tower', cost: 5000000, capacity: 500, radius: 7, operatingCost: 60000, pollution: 0, group: 'water' },
  treatment: { name: 'Water treatment plant', cost: 65000000, capacity: 4500, radius: 10, operatingCost: 600000, pollution: 0, group: 'water' },
  'open-drain': { name: 'Open drainage', cost: 350000, capacity: 24, radius: 2, operatingCost: 10000, pollution: 0, group: 'drainage' },
  'engineered-drain': { name: 'Engineered drainage', cost: 1400000, capacity: 65, radius: 3, operatingCost: 25000, pollution: 0, group: 'drainage' },
  channel: { name: 'Major drainage channel', cost: 8000000, capacity: 180, radius: 5, operatingCost: 90000, pollution: 0, group: 'drainage' },
};
export const isInfrastructure = (tool: string): tool is InfrastructureKind => tool in INFRASTRUCTURE;
export const isDrainage = (kind: InfrastructureKind) => INFRASTRUCTURE[kind].group === 'drainage';
export function asset(kind: InfrastructureKind, seed: number, id: number, tick: number): InfrastructureAsset {
  return { id: `public-${seed}-${id}`, kind, condition: 100, builtAt: tick, failedUntil: 0, storedWater: 0 };
}
export function emptyServices(): TileServices {
  return { powerCoverage: 0, powerReliability: 0, waterCoverage: 0, waterReliability: 0, powerDemand: 0, waterDemand: 0,
    drainageCapacity: 0, runoff: 0, drainageQuality: 0, floodRisk: 0, floodDepth: 0, floodStage: 'dry', floodEvents: 0,
    recovery: 0, pollution: 0, elevation: 0, waterDistance: 0, roadCondition: 100 };
}
export function infrastructureState(): City['infrastructure'] {
  return { revision: 0, power: { supply: 0, demand: 0, peakDemand: 0, reserve: 0, reliability: 0, coverage: 0, generatorDependency: 0 },
    water: { production: 0, delivered: 0, demand: 0, coverage: 0, reliability: 0, privateDependency: 0, storage: 0 },
    costs: { power: 0, water: 0, drainage: 0, roads: 0 }, maintenance: { power: 100, water: 100, drainage: 100, roads: 100 },
    fuelPrice: 1, floodedTiles: 0, floodedProperties: 0, floodIncidents: 0, economicLoss: 0, recentEvents: [], alerts: [], lastEvents: {},
    debug: { powerMultiplier: 1, waterMultiplier: 1, drainageMultiplier: 1, waterUntil: 0 } };
}
export function weatherState(): WeatherState {
  return { kind: 'clear', rainfall: 0, remaining: 5, season: 'dry', hour: 12,
    climate: { rainyStart: 90, rainyEnd: 285, dryRainChance: 0.12, wetRainChance: 0.68, intensity: 1 } };
}
