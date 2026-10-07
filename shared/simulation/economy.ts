import { safetyAt } from './safety';
import { taxRate, taxPressure, taxCompliance, localGovernance, rehouseDisplaced, debtService, fiscalSatisfaction } from './governance';
import { BALANCE } from './balance-config';
import { nationalEconomy } from './national-economy';
import { GOVERNANCE } from './governance-config';
import { publicWorkforce, updatePublicStaff, localServiceEffect } from './public-services';
import type { City, Tile, Zone } from '../types/city';
import { clamp, isOperating, roadAccess, stableHash } from './world';
import { sentimentFactors } from './activity';
import { effectiveServices } from './infrastructure';
import { floodDeclineDay } from './weather';

export function propertyValue(tile: Tile): number {
  const b = tile.building;
  if (!b) return 0;
  const base = b.type === 'residential' ? 10000000 : b.type === 'commercial' ? 8000000 : 18000000;
  const value = base * Math.pow(b.level, 1.4) * (0.65 + tile.landValue / 100) * (0.4 + b.occupancy * 0.6);
  return Math.round(value * (b.abandoned ? 0.35 : 1) * (1-(tile.publicServices?.fireDamage??0)*.006) * (1 - Math.min(0.3, tile.services.floodDepth * 0.002 + tile.services.recovery * 0.003)));
}
export function refreshCity(city: City) {
  let population = 0, housing = 0, jobs = 0, employed = 0, output = 0, land = 0, parcels = 0, abandonment = 0, buildings = 0, profit = 0, businessCount = 0;
  const taxes: Record<Zone, number> = { residential: 0, commercial: 0, industrial: 0 };
  for (const t of city.tiles) {
    if (t.terrain !== 'water' && t.terrain !== 'wetland') { land += t.landValue; parcels++; }
    const b = t.building; if (!b) continue;
    buildings++; if (b.abandoned) abandonment++;
    if (isOperating(b)) {
      b.occupants = Math.min(b.maximumOccupancy, Math.max(0, Math.floor(b.occupants)));
      b.jobs = Math.min(Math.floor(b.maximumJobs*(1-(t.publicServices?.fireDamage??0)*.006)), Math.max(0, Math.floor(b.jobs)));
      const closed = !!b.business && (b.business.closedAt !== null || b.floodClosed);
      if (closed) { b.jobs = 0; b.business!.employees = 0; }
      population += b.occupants; housing += b.maximumOccupancy; jobs += closed ? 0 : Math.floor(b.maximumJobs*(1-(t.publicServices?.fireDamage??0)*.006)); employed += b.jobs;
      if (b.business) { profit += b.business.profitability; businessCount++; }
      b.occupancy = b.type === 'residential' ? b.occupants / b.maximumOccupancy : b.jobs / b.maximumJobs;
    } else { b.occupants = 0; b.jobs = 0; b.occupancy = 0; }
    b.propertyValue = propertyValue(t);
    const tax = isOperating(b) ? b.type === 'residential' ? b.propertyValue * taxRate(city,'residential') / 100 * b.occupancy : b.propertyValue * 0.001 + b.monthlyEconomicOutput * taxRate(city,b.type) / 100 : 0;
    b.taxContribution = Math.round(tax * taxCompliance(city, b.type) * (b.tenure === 'informal' ? 0.3 : b.tenure === 'integrating' ? 0.3 + b.integrationProgress * 0.007 : 1)); taxes[b.type] += b.taxContribution;
    output += isOperating(b) ? b.monthlyEconomicOutput : 0;
  }
  city.population = population + (city.governance?.housing.displacedResidents ?? 0); city.housingCapacity = housing; city.occupiedHousing = population;
  city.vacantHousing = Math.max(0, housing - population); city.households = Math.ceil(city.population / 4);
  city.workforce = Math.floor(city.population * BALANCE.labour.workforceShare);
  const informal = city.living?.informal;
  if (informal) informal.employed = Math.min(informal.jobs, Math.max(0, city.workforce - employed - (city.publicServices?.employed??0)));
  city.jobs = jobs + (informal?.jobs ?? 0) + publicWorkforce(city);
  city.employed = Math.min(city.workforce, city.jobs, employed + (informal?.employed ?? 0) + (city.publicServices?.employed??0));
  if (city.employed - (informal?.employed ?? 0) - (city.publicServices?.employed??0) !== employed) distributeEmployees(city);
  city.unemployed = city.workforce - city.employed;
  city.unemploymentRate = city.workforce ? city.unemployed / city.workforce * 100 : 0;
  city.purchasingPower = clamp(35 + (city.workforce ? city.employed / city.workforce : 0.5) * 60 + (city.debug.economyUntil > city.tick ? 10 : 0) - city.infrastructure.power.generatorDependency * 0.08 - city.infrastructure.water.privateDependency * 0.03 - taxPressure(city,'residential')*6 - Math.max(0,(city.governance?.housing.costOfLiving??40)-40)*.08 - underemployment(city) * BALANCE.labour.underemploymentSpending);
  taxes.commercial += Math.round((informal?.output ?? 0) * 0.003);
  city.taxes = taxes; city.income = (city.transit?.finance.fares??0) + taxes.residential + taxes.commercial + taxes.industrial + (city.mobility?.costs.fares ?? 0);
  city.expenses = Object.entries(city.transit?.finance??{}).filter(([k])=>['bus','brt','stations','terminals','depots'].includes(k)).reduce((n,[,v])=>n+v,0) + (city.governance?.programCost??0) + Object.values(city.infrastructure.costs).reduce((sum, cost) => sum + cost, 0) + (city.mobility?.costs.buses ?? 0) + (city.mobility?.costs.administration ?? 0) + Object.values(city.publicServices?.costs??{}).reduce((a,b)=>a+b,0) + debtService(city);
  city.economicOutput = output + (informal?.output ?? 0); city.averageLandValue = parcels ? land / parcels : 0;
  const housingAvailability = housing ? clamp(city.vacantHousing / housing * 400) : 0;
  const success = city.tiles.filter(t => isOperating(t.building) && t.building!.occupancy >= 0.6).length;
  const economicHealth = (city.workforce ? city.employed / city.workforce * 100 : 50) * 0.6 + (businessCount ? profit / businessCount : 35) * 0.4;
  const vacancyPenalty = clamp((city.vacantHousing / Math.max(1, housing) - 0.35) * 40, 0, 20);
  const i = city.infrastructure;
  const resilience = (i.power.reliability - 70) * 0.09 + (i.water.reliability - 70) * 0.09 - Math.min(12, i.floodedTiles * 0.6) - i.power.generatorDependency * 0.04;
  const mobilityEffect = city.mobility ? (city.mobility.stats.jobAccessibility - 65) * 0.06 - Math.min(8, Math.max(0, city.mobility.stats.averageCommute - 15) * 0.18) : 0;
  const target = city.mobility ? clamp(26 + sentimentFactors(city).reduce((sum, f) => sum + f.value, 0), 15, 92) : clamp(26 + (100 - city.unemploymentRate) * 0.3 + housingAvailability * 0.1 + economicHealth * 0.12 + success / Math.max(1, buildings) * 12 - abandonment / Math.max(1, buildings) * 25 - vacancyPenalty + resilience + mobilityEffect, 15, 92);
  city.satisfaction = Math.round(clamp(target + Math.min(0,((city.governance?.housing.affordability??70)-70)*.08) - (city.governance?.clearanceShock??0) - (city.mobility ? 0 : fiscalSatisfaction(city)),15,92) * 10) / 10;
}
export function updateDemand(city: City) {
  const homes = city.population / Math.max(1, city.housingCapacity);
  const spareJobs = clamp((city.jobs - city.workforce) / Math.max(40, city.workforce), 0, 1);
  const businesses = city.tiles.flatMap(t => isOperating(t.building) && t.building!.business?.closedAt === null && !t.building!.floodClosed ? [t.building!] : []);
  const capacity = (type: Zone) => businesses.filter(b => b.type === type).reduce((s, b) => s + b.maximumJobs, 0);
  const commercial = capacity('commercial'), industrial = capacity('industrial');
  const occupancy = businesses.filter(b => b.type === 'commercial');
  const shopOccupancy = occupancy.length ? occupancy.reduce((s, b) => s + b.occupancy, 0) / occupancy.length : 0;
  const commerceNeed = Math.max(30, city.population * 0.22);
  const industryNeed = Math.max(30, city.workforce * 0.65);
  const growth = clamp(city.growth / Math.max(1, city.population) * 500, -10, 10);
  const boost = city.debug.demandUntil > city.tick ? city.debug.demandBoost : { residential: 0, commercial: 0, industrial: 0 };
  city.demand = {
    residential: Math.round(clamp(8 + homes * 38 + spareJobs * 40 + city.satisfaction * 0.2 - city.unemploymentRate * 0.35 - (1 - homes) * 25 + growth + boost.residential)),
    // Available workers beyond normal job-seeking encourage new firms, so neither jobs nor workers must exist first.
    commercial: Math.round(clamp(12 + (commerceNeed - commercial) / commerceNeed * 65 + shopOccupancy * 20 + city.purchasingPower * 0.15 + Math.max(0, city.unemploymentRate - BALANCE.labour.frictionalUnemployment * 100) * 0.35 + growth + boost.commercial)),
    industrial: Math.round(clamp(15 + city.unemploymentRate * 0.75 + (industryNeed - industrial) / industryNeed * 25 + city.purchasingPower * 0.12 + growth + boost.industrial)),
  };
  for(const z of ['residential','commercial','industrial'] as Zone[]) { const pressure = taxPressure(city,z); city.demand[z]=Math.round(clamp(city.demand[z]-pressure*(pressure > 0 ? BALANCE.taxes.demandPenalty : BALANCE.taxes.demandBonus))); }
}
export function distributeEmployees(city: City) {
  const employers = city.tiles.flatMap(t => isOperating(t.building) && t.building!.business?.closedAt === null && !t.building!.floodClosed ? [t.building!] : []);
  const spatial = city.mobility?.jobTargets;
  const weight = (b: typeof employers[number]) => spatial ? Math.min(b.maximumJobs, (spatial[b.id] ?? 0) + b.jobs * 0.1) : b.maximumJobs;
  const formal=Math.max(0,city.employed-(city.living?.informal.employed??0)), privateWeight=employers.reduce((sum,b)=>sum+weight(b),0), publicWeight=Object.values(city.publicServices?.jobTargets??{}).reduce((a,b)=>a+b,0);
  updatePublicStaff(city,Math.floor(formal*publicWeight/Math.max(1,privateWeight+publicWeight)));
  let remaining = Math.max(0, formal-(city.publicServices?.employed??0)), capacity = employers.reduce((s, b) => s + weight(b), 0);
  for (const b of employers) {
    const employees = Math.min(b.maximumJobs, Math.floor(remaining * weight(b) / Math.max(1, capacity)));
    remaining -= employees; capacity -= weight(b); b.jobs = employees;
    b.business!.employees = employees; b.business!.employeeCapacity = b.maximumJobs;
  }
}
export function labourAndMigration(city: City) {
  const target = Math.min(city.workforce, city.jobs, (city.mobility?.stats.reachableWorkers ?? city.jobs) + (city.living?.informal.jobs ?? 0));
  const gap = target - city.employed;
  city.employed += Math.sign(gap) * Math.min(Math.abs(gap), Math.max(1, Math.ceil(Math.abs(gap) * 0.16)));
  distributeEmployees(city);
  const previous = city.population;
  rehouseDisplaced(city);
  const homes = city.tiles.flatMap(t => isOperating(t.building) && t.building!.type === 'residential' ? [t] : []);
  let migration = migrationBalance(city);
  if (city.population === 0 && city.housingCapacity > 0 && city.jobs > 0) migration = 4;
  if (migration > 0) migration=Math.floor(migration*Math.min(1,(city.governance?.housing.affordability??100)/80));
  if (migration > 0) {
    // Occupied, valuable neighbourhoods fill first, rather than every house gaining residents at once.
    homes.sort((a, b) => b.landValue + (localGovernance(city,b)?.affordability??70)*.15 + b.building!.occupancy * 15 + b.mobility.accessibility * 0.1 - a.landValue - (localGovernance(city,a)?.affordability??70)*.15 - a.building!.occupancy * 15 - a.mobility.accessibility * 0.1 || a.y * city.size + a.x - b.y * city.size - b.x);
    for (const t of homes) {
      if (t.mobility.accessibility < 25) continue;
      const b = t.building!, arrived = Math.min(Math.max(1,Math.floor(migration*(localGovernance(city,t)?.migration??1)*Math.max(.85,1-Math.max(0,65-(safetyAt(city,t)?.publicSafety??75))*.003))),migration, b.maximumOccupancy - b.occupants);
      b.occupants += arrived; migration -= arrived; if (!migration) break;
    }
  } else if (migration < 0) {
    homes.sort((a, b) => a.building!.satisfaction - b.building!.satisfaction || a.landValue - b.landValue);
    for (const t of homes) { const departed = Math.min(-migration, t.building!.occupants); t.building!.occupants -= departed; migration += departed; if (!migration) break; }
  }
  city.growth = homes.reduce((s, t) => s + t.building!.occupants, 0) - previous;
}
/** Workers whose employer is temporarily closed by floodwater expect to return to work. */
export function suspendedJobs(city: City) {
  if (!BALANCE.labour.floodLayoffsCountAsEmployed) return 0;
  return city.tiles.reduce((sum, t) => sum + (isOperating(t.building) && t.building!.floodClosed && t.building!.business?.closedAt === null ? t.building!.maximumJobs : 0), 0);
}
/**
 * Unemployment residents weigh when judging the city. Workers at flood-closed firms expect to return,
 * and while floodwater blocks commutes residents judge the jobs the city has rather than the jobs they
 * can reach today, so a few days of flooded roads are not read as lost work.
 */
export function persistentUnemployment(city: City) {
  if (!city.workforce) return 0;
  const suspended = suspendedJobs(city);
  if (city.infrastructure.floodedTiles > 0) return clamp((city.workforce - city.jobs - suspended) / city.workforce * 100, 0, Math.max(0, city.unemployed - suspended) / city.workforce * 100);
  return Math.max(0, city.unemployed - suspended) / city.workforce * 100;
}
/** Rounds a fractional daily flow deterministically from the seed and day, so small towns are not forced to whole people per day. */
function roundFlow(city: City, value: number, salt: number) {
  const whole = Math.floor(value);
  return whole + (stableHash(city.seed + salt, city.tick) % 1000 / 1000 < value - whole ? 1 : 0);
}
/**
 * Bounded labour-market migration. Arrivals need housing and either spare jobs or room within normal
 * frictional unemployment; departures rise smoothly with low satisfaction and persistent unemployment.
 * Both can happen in the same city, and neither side requires the other to exist first.
 */
/** Satisfaction residents act on when moving: today's mood averaged with recent monthly readings, so a short shock is not a verdict. */
export function settledSatisfaction(city: City) {
  const recent = city.trends.slice(-BALANCE.labour.moodMonths);
  return (city.satisfaction + recent.reduce((sum, t) => sum + t.satisfaction, 0)) / (1 + recent.length);
}
export function migrationBalance(city: City) {
  const L = BALANCE.labour, mood = settledSatisfaction(city), unemployment = persistentUnemployment(city);
  const push = clamp((L.satisfactionPush - mood) / L.satisfactionPushRange, 0, 1) + clamp((unemployment - L.unemploymentPush) / L.unemploymentPushRange, 0, 1);
  // Migrants weigh their chance of work (expected income), so arrivals taper from normal frictional
  // unemployment to the level at which newcomers no longer expect to find work, instead of stopping dead.
  const prospects = clamp((L.migrantTolerance - unemployment) / (L.migrantTolerance - L.frictionalUnemployment * 100), 0, 1);
  const jobRoom = Math.max(0, city.jobs - city.workforce * (1 - L.migrantTolerance / 100));
  const arrivals = roundFlow(city, Math.min(city.vacantHousing, jobRoom / L.workforceShare, city.population * L.arrivalRate * (mood / 100) * prospects) * (1 - Math.min(1, push)), 7919);
  const departures = push > 0 ? roundFlow(city, city.population * L.departureRate * Math.min(1.5, push), 7927) : 0;
  return arrivals - Math.min(city.population, departures);
}
/** Job capacity of businesses currently trading, by zone. */
export function tradingCapacity(city: City) {
  let commercial = 0, industrial = 0;
  for (const t of city.tiles) if (isOperating(t.building) && t.building!.business?.closedAt === null && !t.building!.floodClosed) { if (t.zone === 'commercial') commercial += t.building!.maximumJobs; else if (t.zone === 'industrial') industrial += t.building!.maximumJobs; }
  return { commercial, industrial };
}
/** Customers (shops) or workers (industry) available per job of trading capacity, optionally after adding jobs. */
export function marketRatio(city: City, type: Zone, capacity: { commercial: number; industrial: number }, extraJobs = 0) {
  return type === 'commercial' ? clamp(city.population * 0.24 / Math.max(1, capacity.commercial + extraJobs), 0.1, 1.3) : clamp(city.workforce * 0.8 / Math.max(1, capacity.industrial + extraJobs), 0.15, 1.3);
}
/** Shops short of customers cut staff hours (and wages) rather than paying full shifts for idle counters. */
export function shopHours(type: Zone, market: number) {
  return type === 'commercial' ? clamp(market / BALANCE.labour.fullHoursMarket, BALANCE.labour.minimumHours, 1) : 1;
}
/** Full-time-equivalent work lost to shortened shop hours, as a share of the workforce. */
export function underemployment(city: City) {
  if (!city.workforce) return 0;
  const capacity = tradingCapacity(city), hours = shopHours('commercial', marketRatio(city, 'commercial', capacity));
  let jobs = 0;
  for (const t of city.tiles) if (isOperating(t.building) && t.building!.type === 'commercial' && t.building!.business?.closedAt === null) jobs += t.building!.jobs;
  return jobs * (1 - hours) / city.workforce;
}
export function operateBusinesses(city: City) {
  const economy = nationalEconomy(city), capacity = tradingCapacity(city);
  for (const t of city.tiles) {
    const b = t.building; if (!b || !isOperating(b)) continue;
    const service = effectiveServices(t), s = t.services;
    b.satisfaction = Math.round(clamp(city.satisfaction + (t.landValue - 50) * 0.2 + (service.power - 70) * 0.08 + (service.water - 70) * 0.08 - Math.min(25, s.floodDepth * 0.2) - b.generator * 0.05 - s.pollution * 0.06 - s.recovery * 0.1 + localServiceEffect(t).satisfaction, 5, 95));
    if (!b.business) continue;
    const business = b.business; business.age++;
    if (business.closedAt !== null) {
      b.jobs = 0; business.employees = 0; b.monthlyEconomicOutput = 0; business.economicOutput = 0;
      business.occupancy = 0; business.state = 'closed';
      // Reopening depends on customers (shops) or available workers (industry) for this firm, not on
      // city-wide purchasing power, which collapses precisely because the closure removed the jobs.
      const viable = city.tick - business.closedAt >= 20 && city.demand[b.type] >= 35 && roadAccess(city, t) && !b.floodClosed && service.power >= 25 && service.water >= 25 && t.mobility.accessibility >= 35 && marketRatio(city, b.type, capacity, b.maximumJobs) >= BALANCE.recovery.reopenMarket;
      business.reopenProgress = clamp(business.reopenProgress + (viable ? 5 : -2));
      if (business.reopenProgress >= 100) {
        business.closedAt = null; business.lossDays = 0; business.age = 0; business.reopenProgress = 0; business.generation++;
        business.name = `${['Alafia', 'Unity', 'Tosin', 'Amani', 'Nneka', 'Bello', 'Harmony', 'Grace'][(b.variant + business.generation) % 8]} ${b.type === 'industrial' ? 'Works' : /food|restaurant/i.test(b.subtype) ? 'Foods' : 'Stores'}`;
        business.state = 'opening'; business.profitability = 50; b.poorDays = 0; city.counters.businessesOpened++;
      }
      continue;
    }
    const market = marketRatio(city, b.type, capacity);
    const spend = b.type === 'commercial' ? 0.55 + city.purchasingPower / 150 : 0.8 + city.purchasingPower / 300;
    const local = 0.8 + t.landValue / 250;
    const demand = (0.85 + city.demand[b.type] / 100 * 0.3) * economy.business;
    const potential = b.jobs * (b.type === 'commercial' ? 120000 : 180000) * market * spend * local * demand;
    const productivity = b.floodClosed ? 0 : (0.5 + service.power / 200) * (0.65 + service.water / 285.7) * (1 - Math.min(0.65, s.floodDepth * 0.005)) * (1 - Math.min(0.15, s.recovery * 0.005));
    const mobilityProductivity = (1 - t.mobility.congestion * 0.0018) * (b.type === 'commercial' ? 1 + Math.min(0.3, t.mobility.footTraffic / 1800) : 1);
    const output = Math.round(potential * productivity * mobilityProductivity * (1-Math.max(0,65-(safetyAt(city,t)?.commercialSafety??75))*.0015-Math.min(.06,(safetyAt(city,t)?.shock??0)*.002)) * (1-Math.min(.4,(t.publicServices?.fireDamage??0)*.006)) * (1-Math.min(.1,localServiceEffect(t).penalty*.007)) * (1+((t.publicServices?.healthcare.quality??0)-50)*.0003+((t.publicServices?.qualityOfLife??45)-45)*.0003));
    city.infrastructure.economicLoss += Math.max(0, potential - output) / 30;
    const hours = shopHours(b.type, market);
    const adaptationCost = b.jobs * (b.generator * 100 + b.privateWater * 25) * city.infrastructure.fuelPrice;
    const policySupport=(localGovernance(city,t)?.effects.business??0)*(b.level<=2?1:.35);
    const additionalTax=output*(taxRate(city,b.type)-GOVERNANCE.taxes[b.type].base)/100*BALANCE.taxes.businessIncidence;
    const costs = Math.round(additionalTax + (1-policySupport)*((b.maximumJobs * (b.type === 'commercial' ? 30000 : 45000) + b.jobs * hours * (b.type === 'commercial' ? 40000 : 65000) + b.propertyValue * 0.002 + adaptationCost) * (city.debug.economyUntil > city.tick ? 0.7 : 1)));
    business.economicOutput = output; business.operatingCost = costs; business.netProfit = output - costs;
    business.profitability = Math.round(clamp(50 + (output - costs) / Math.max(1, output, costs) * 120));
    business.occupancy = b.jobs / b.maximumJobs;
    business.state = b.floodClosed ? 'closed' : business.age < 6 ? 'opening' : business.profitability < 45 ? 'struggling' : business.profitability >= 75 && b.occupancy >= 0.75 ? 'growing' : 'operating';
    b.monthlyEconomicOutput = output;
    // Losses while floodwater or clean-up depresses trade are temporary and do not count towards closure.
    const floodAffected = s.floodDepth >= 12 || s.recovery >= 5;
    business.lossDays = floodAffected || !floodDeclineDay(city) ? business.lossDays : !b.floodClosed && business.age > 10 && business.profitability < 35 ? business.lossDays + 1 : Math.max(0, business.lossDays - 2);
    if (business.lossDays >= 45) {
      business.closedAt = city.tick; business.state = 'closed'; business.employees = 0; business.occupancy = 0;
      b.jobs = 0; b.monthlyEconomicOutput = 0; business.economicOutput = 0; city.counters.businessesClosed++;
    }
  }
}
