import type { Building, Zone } from '../types/city';
import { stableHash } from './world';
export const BUILDING_LIBRARY: Record<Zone, string[][]> = {
  residential: [
    ['Modest bungalow', 'Compound house', 'Small detached house'],
    ['Larger bungalow', 'Duplex', 'Small flats'],
    ['Low-rise apartments', 'Dense compound housing'],
    ['Mid-rise apartments', 'Modern estate apartments'],
    ['Dense urban apartments', 'Residential tower'],
  ],
  commercial: [
    ['Provision kiosk', 'Barber shop', 'Food shop', 'Phone repair shop'],
    ['Row of shops', 'Mini-mart', 'Restaurant', 'Fashion shop', 'Electronics shop'],
    ['Supermarket', 'Bank', 'Office building', 'Retail building'],
    ['Shopping complex', 'Hotel', 'Large office'],
    ['Mall', 'Corporate headquarters', 'Commercial tower'],
  ],
  industrial: [
    ['Mechanic workshop', 'Small workshop', 'Small warehouse'],
    ['Warehouse', 'Production workshop'],
    ['Factory', 'Logistics facility'],
    ['Large factory', 'Industrial warehouse complex'],
    ['Major industrial complex'],
  ],
};
const prefixes = ['Alafia', 'Akin & Sons', 'Nneka', 'Adeola', 'Ifeoma', 'Bello', 'Unity', 'Amani', 'Olu & Co', 'Sade'];
const residentialNames = ['Unity Court', 'Alafia Compound', 'Ayo Gardens', 'Ire House', 'Ife Court', 'Amaka Place', 'Ola Residence'];
const businessSuffixes = { commercial: ['Trading', 'Stores', 'Enterprises', 'Corner', 'Commerce'], industrial: ['Works', 'Manufacturing', 'Workshop', 'Industries', 'Logistics'] };
export function capacities(type: Zone, level: number) {
  const homes = [140, 220, 360, 580, 900], commercial = [120, 180, 270, 390, 560], industrial = [150, 230, 350, 520, 760];
  return { occupants: type === 'residential' ? homes[level - 1] : 0, jobs: type === 'residential' ? 0 : (type === 'commercial' ? commercial : industrial)[level - 1] };
}
export function setTypology(b: Building, level: number) {
  b.level = level;
  const list = BUILDING_LIBRARY[b.type][level - 1]; b.subtype = list[b.variant % list.length];
  const cap = capacities(b.type, level); b.maximumOccupancy = cap.occupants; b.maximumJobs = cap.jobs;
  if (b.business) b.business.employeeCapacity = cap.jobs;
}
export function createBuilding(type: Zone, tileId: number, seed: number, tick: number, completed = false): Building {
  const variant = stableHash(seed, tileId);
  const name = type === 'residential' ? `${residentialNames[variant % residentialNames.length]} ${1 + tileId % 19}` : `${prefixes[variant % prefixes.length]} ${businessSuffixes[type][(variant >>> 4) % businessSuffixes[type].length]}`;
  const b: Building = {
    id: `parcel-${seed}-${tileId}`, name, type, subtype: '', variant, level: 1, age: 0,
    constructionState: completed ? 'complete' : 'site-preparation', constructionProgress: completed ? 100 : 0,
    openedAt: completed ? tick : null, occupants: 0, maximumOccupancy: 0, occupancy: 0, jobs: 0, maximumJobs: 0,
    propertyValue: 0, monthlyEconomicOutput: 0, taxContribution: 0, satisfaction: 60, upgradeProgress: 0,
    pendingLevel: null, abandoned: false, poorDays: 0, abandonedAt: null, redevelopmentCount: 0,
    generator: 0, privateWater: 0, privateBorehole: false, floodClosed: false,
    tenure: 'formal', integrationProgress: 0,
    business: type === 'residential' ? null : { name, state: 'opening', employees: 0, employeeCapacity: 0,
      economicOutput: 0, operatingCost: 0, netProfit: 0, profitability: 50, occupancy: 0, age: 0,
      lossDays: 0, closedAt: null, reopenProgress: 0, generation: 0 },
  };
  setTypology(b, 1); return b;
}
