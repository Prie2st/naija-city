import { safetyAt } from './safety';
import type { Building, City } from '../types/city';
import type { CityActivity, SentimentFactor } from '../types/living';
import { clamp, isOperating } from './world';
import { roadPerformance, congestionFor, roadAnchor } from './road-network';
import { effectiveServices } from './infrastructure';
import { fiscalSatisfaction } from './governance';
import { persistentUnemployment } from './economy';

const unit = (n: number) => clamp(n, 0, 1);
const peak = (hour: number, center: number, width: number) => {
  const d = Math.min(Math.abs(hour - center), 24 - Math.abs(hour - center));
  return Math.exp(-d * d / (2 * width * width));
};
const gate = (hour: number, start: number, end: number) => unit((hour - start) / 1.5) * unit((end - hour) / 1.5);
export function dailyRhythm(hour: number, day = 0) {
  hour = ((hour % 24) + 24) % 24;
  const weekend = day % 7 >= 5, morning = peak(hour, 8, 1.35), evening = peak(hour, 17.5, 1.45);
  return { hour, weekend, morning, evening, commute: (morning + evening) * (weekend ? 0.58 : 1),
    shopping: 0.06 + gate(hour, 7, 23) * (0.55 + peak(hour, 13, 3) * 0.35 + peak(hour, 19, 2) * 0.45),
    traffic: 0.12 + (morning + evening) * (weekend ? 0.9 : 1.6) + gate(hour, 9, 22) * 0.55,
    period: hour < 5 || hour >= 23 ? 'night' as const : hour < 7 ? 'early morning' as const : hour < 10 ? 'morning rush' as const : hour < 16 ? 'daytime' as const : hour < 19 ? 'evening rush' as const : 'evening' as const,
    lighting: hour < 5 || hour >= 23 ? 'night' as const : hour < 10 ? 'morning' as const : hour < 17 ? 'midday' as const : 'evening' as const };
}
// Schedules govern current customer activity, not daily wages/output on every animation frame.
export function businessSchedule(b: Building, hour: number, day = 0) {
  if (!isOperating(b) || b.constructionState !== 'complete' || b.floodClosed || b.business?.closedAt !== null && b.business?.closedAt !== undefined) return 0;
  if (!b.business) return 0;
  if (b.type === 'industrial') return 0.3 + gate(hour, 5, 23) * 0.7;
  if (/office|bank|headquarters/i.test(b.subtype)) return gate(hour, 7, 19) * (day % 7 >= 5 ? 0.18 : 1);
  if (/food|restaurant/i.test(b.subtype)) return unit(0.08 + peak(hour, 8, 1.7) * 0.8 + peak(hour, 13, 2) * 0.65 + peak(hour, 19, 2) * 0.9);
  return gate(hour, 7, 22) * (0.65 + peak(hour, 13, 3) * 0.35);
}
export function pedestrianWeather(city: City) {
  return city.weather.kind === 'extreme-rain' ? 0.06 : city.weather.kind === 'heavy-rain' ? 0.22 : city.weather.kind === 'light-rain' ? 0.68 : 1;
}
export function sentimentFactors(city: City): SentimentFactor[] {
  const i = city.infrastructure, m = city.mobility.stats;
  const buildings = city.tiles.filter(t => t.building), active = buildings.filter(t => isOperating(t.building));
  const healthy = active.filter(t => t.building!.occupancy >= 0.6).length;
  const businesses = active.filter(t => t.building!.business);
  const profit = businesses.length ? businesses.reduce((s, t) => s + t.building!.business!.profitability, 0) / businesses.length : 35;
  const economic = (city.workforce ? city.employed / city.workforce * 100 : 50) * 0.6 + profit * 0.4;
  return [
    { label:'Local public services',value:city.tiles.reduce((sum,t)=>sum+(t.building?.occupants??0)*((t.publicServices?.education.quality??0)*.015+(t.publicServices?.healthcare.quality??0)*.02+(t.publicServices?.parks.quality??0)*.015-Math.min(5,(t.publicServices?.uncollectedWaste??0)/Math.max(.02,t.publicServices?.wasteGenerated??0)*.1)),0)/Math.max(1,city.population)},
    { label:'Public safety',value:((city.safety?.metrics.publicSafety??75)-75)*.055-city.tiles.reduce((n,t)=>n+(t.building?.occupants??0)*(safetyAt(city,t)?.shock??0)*.1,0)/Math.max(1,city.population) },
    { label: 'Employment', value: (100 - persistentUnemployment(city)) * 0.3 },
    { label: 'Available housing', value: (city.housingCapacity ? clamp(city.vacantHousing / city.housingCapacity * 400) : 0) * 0.1 },
    { label: 'Economic health', value: economic * 0.12 },
    { label: 'Occupied neighborhoods', value: healthy / Math.max(1, buildings.length) * 12 },
    { label: 'Abandoned property', value: -(buildings.length - active.length) / Math.max(1, buildings.length) * 25 },
    { label: 'Excess housing vacancy', value: -clamp((city.vacantHousing / Math.max(1, city.housingCapacity) - 0.35) * 40, 0, 20) },
    { label: 'Public power reliability', value: (i.power.reliability - 70) * 0.09 },
    { label: 'Public water reliability', value: (i.water.reliability - 70) * 0.09 },
    { label: 'Flood exposure', value: -Math.min(12, i.floodedTiles * 0.6) },
    { label: 'Generator costs', value: -i.power.generatorDependency * 0.04 },
    { label: 'Jobs accessible by transport', value: (m.jobAccessibility - 65) * 0.06 },
    { label: 'Commute and traffic delays', value: -Math.min(8, Math.max(0, m.averageCommute - 15) * 0.18) },
    { label:'Municipal finances', value: -fiscalSatisfaction(city) },
    { label:'Planned transit crowding',value:-Math.min(2,Math.max(0,(city.transit?.stats.crowding??0)-1)) },
    { label: 'Crowded shared transport', value: -Math.min(4, city.mobility.routes.reduce((sum, r) => sum + Math.max(0, r.demand * m.sharedUsage / 100 - r.capacity), 0) / Math.max(1, city.population) * 8) },
  ];
}

// Pure bounded aggregation. Called by the controller at 10 Hz; NEVER by Phaser's render loop.
// Daily OD paths and capacities are reused. There is no hourly pathfinding or citizen creation.
const pedestrianCache = new WeakMap<City, { revision: number; tick: number; paths: ReturnType<typeof pedestrianPaths> }>();
export function cityActivity(city: City, hour = 12): CityActivity {
  const rhythm = dailyRhythm(hour, city.tick), rain = pedestrianWeather(city);
  const roads: CityActivity['roads'] = {}, journeys: CityActivity['journeys'] = [];
  let pedestrian = 0, commerce = 0, occupied = 0, night = 0;
  const tiles = city.tiles.map(t => {
    const b = t.building, service = effectiveServices(t), active = b && isOperating(b) && b.constructionState === 'complete' && !b.floodClosed;
    const localCommercial = active && b.business ? businessSchedule(b, rhythm.hour, city.tick) * b.occupancy * (0.35 + b.business.profitability / 160) * (0.5 + service.power / 200) * (0.6 + service.water / 250) * (hour>=17||hour<6?safetyAt(city,t)?.eveningActivity??1:1) : 0;
    const home = active && b.type === 'residential' ? b.occupants : 0;
    const customerPotential = active ? Math.min(1, home / 500 + t.mobility.footTraffic / 700 + localCommercial * 0.65) : 0;
    const foot = unit(customerPotential * (0.08 + rhythm.shopping * 0.7 + rhythm.commute * 0.5) * rain * (1 - Math.min(1, t.services.floodDepth / 70)));
    pedestrian += foot; commerce += localCommercial;
    if (active) { occupied++; night += b.type === 'residential' ? b.occupancy : localCommercial; }
    return { pedestrian: foot, commercial: unit(localCommercial), commuter: unit(home / 500 * rhythm.commute), market: 0,
      jobsAccess: t.mobility.accessibility, commercialAccess: unit(t.mobility.footTraffic / Math.max(50, home * 0.2)) * 100, transitAccess: t.mobility.sharedCoverage };
  });
  for(const f of city.publicServices?.facilities??[]) {
    if(!f.active||f.served<=0||f.serviceQuality<=0)continue;
    const profile=f.type==='education'?gate(rhythm.hour,7,16)*(0.2+rhythm.commute*.8):f.type==='parks'?gate(rhythm.hour,6,20)*(0.2+rhythm.shopping*.8)*rain*(rhythm.hour>=17?safetyAt(city,city.tiles[f.location])?.eveningActivity??1:1):gate(rhythm.hour,7,19);
    for(const id of f.tiles)tiles[id].pedestrian=unit(f.served/Math.max(100,f.capacity)*profile*f.serviceQuality/100);
  }
  for (const f of city.mobility.flows) {
    const unavailable = (id: number) => {
      const b = city.tiles[id].building;
      return b && (!isOperating(b) || b.floodClosed || b.business && b.business.closedAt !== null);
    };
    if (unavailable(f.origin) || unavailable(f.destination)) continue;
    const industrial = city.tiles[f.destination].zone === 'industrial';
    const profile = f.purpose === 'work' ? 0.1 + rhythm.commute * 1.85 + (industrial ? 0.28 : 0) : f.purpose === 'shopping' ? rhythm.shopping : f.purpose==='services'?(city.publicServices?.facilities.find(a=>a.location===f.destination)?.type==='education'?gate(rhythm.hour,7,16)*(0.2+rhythm.commute):rhythm.shopping*rain): 0.12 + gate(rhythm.hour, 6, 20);
    const reverse = f.purpose === 'work' && rhythm.evening > rhythm.morning;
    const origin = reverse ? f.destination : f.origin, destination = reverse ? f.origin : f.destination;
    const path = reverse ? [...f.path].reverse() : f.path;
    const freight = f.purpose === 'delivery' ? f.trips * profile : 0;
    const car = freight ? 0 : f.modes.car * profile, okada = f.modes.okada * profile;
    const flow = (car / 1.4 + okada * 0.25 + freight * 1.5) * city.mobility.debug.loadMultiplier;
    journeys.push({ flowId: f.id, origin, destination, path, purpose: f.purpose, volume: f.trips * profile, car, okada, freight });
    for (const id of path) { roads[id] ??= { flow: 0, speed: 0, congestion: 0 }; roads[id].flow += flow; }
  }
  const transit: CityActivity['transit'] = {};
  for (const r of city.mobility.routes) {
    const profile = 0.1 + rhythm.commute * 1.65 + rhythm.shopping * 0.4;
    const available = r.ridership > 0 && !r.suspended && r.reliability > 0;
    const demand = r.demand * profile, hourlyCapacity = available ? r.capacity * 0.14 : 0;
    const wanted = demand * 0.14 * Math.max(0.2, city.mobility.stats.sharedUsage / 100);
    const waiting = r.reliability ? Math.max(0, wanted - hourlyCapacity) : wanted;
    transit[r.id] = { riders: Math.min(wanted, hourlyCapacity), utilization: hourlyCapacity ? Math.min(2, wanted / hourlyCapacity) : wanted ? 2 : 0, waiting, activity: available ? profile : 0 };
    if (r.reliability > 0 && !r.suspended && r.ridership > 0) for (const id of r.path) {
      roads[id] ??= { flow: 0, speed: 0, congestion: 0 }; roads[id].flow += r.congestionImpact * profile * city.mobility.debug.loadMultiplier;
    }
  }
  for(const r of city.transit?.routes.filter(r=>!r.legacy)??[]){
    const stops=r.stops.map(id=>city.transit.stops.find(s=>s.id===id)).filter(s=>!!s);
    const safety=stops.length?stops.reduce((n,s)=>n+s!.nightSafety,0)/stops.length:75;
    const profile=0.08+rhythm.commute*1.7+rhythm.shopping*.35;
    const night=hour>=18||hour<6?Math.max(.55,Math.min(1,safety/80)):1;
    const available=r.status==='active'&&r.ridership>0;
    const wanted=r.demand*profile*.14*night,capacity=available?r.capacity*.14*(hour<5||hour>=23?.3:1):0;
    transit[r.id]={riders:Math.min(wanted,capacity),waiting:Math.max(0,wanted-capacity),utilization:capacity?Math.min(2,wanted/capacity):wanted?2:0,activity:available?profile*night:0};
    if(available&&r.mode!=='brt')for(const id of r.path){roads[id]??={flow:0,speed:0,congestion:0};roads[id].flow+=r.availableVehicles*16*2.5*profile;}
  }
  for(const s of city.transit?.stops??[]){
    const amount=s.routes.reduce((n,id)=>n+(transit[id]?.riders??0)+(transit[id]?.waiting??0),0);
    if(s.boardings>0)tiles[s.tileId].pedestrian=unit(amount/Math.max(80,s.routes.length*80))*rain*(city.tiles[s.tileId].services.floodDepth>=35?0:1);
  }
  let weighted = 0, roadWeight = 0;
  for (const [key, r] of Object.entries(roads)) {
    const p = roadPerformance(city, city.tiles[Number(key)]);
    r.congestion = congestionFor(r.flow * 0.14, p.capacity); r.speed = p.speed * (1 - r.congestion * 0.007);
    weighted += r.congestion * r.flow; roadWeight += r.flow;
  }
  let commute = 0, commuters = 0;
  for (const f of city.mobility.flows.filter(f => f.purpose === 'work')) {
    const delay = f.path.length ? f.path.reduce((sum, id) => sum + 0.12 / Math.max(2, roads[id]?.speed ?? city.tiles[id].mobility.speed) * 60, 0) + 2 : f.minutes;
    const plan=city.transit?.demand.find(d=>d.flowId===f.id);
    const count = f.trips, served=plan?.passengers??0;
    // Reserved-lane riders do not inherit delays from parallel general lanes.
    const ordinary=Math.max(f.minutes,delay);
    commute += ordinary*(count-served)+(plan?.minutes??ordinary)*served; commuters += count;
  }
  for (const stop of city.mobility.stops) {
    const amount = stop.routes.reduce((s, id) => s + (transit[id]?.riders ?? 0) + (transit[id]?.waiting ?? 0), 0);
    tiles[stop.tileId].pedestrian = Math.max(tiles[stop.tileId].pedestrian, unit(amount / 80) * rain * (city.tiles[stop.tileId].services.floodDepth >= 35 ? 0 : 1));
  }
  for (const market of city.living?.markets ?? []) {
    const local = unit(market.attraction / 100 * rhythm.shopping) * rain * (city.tiles[market.tileId].services.floodDepth >= 35 ? 0 : 1);
    tiles[market.tileId].market = local; tiles[market.tileId].pedestrian = Math.max(tiles[market.tileId].pedestrian, local);
    for (const t of city.tiles) if (t.road && Math.abs(t.x - city.tiles[market.tileId].x) + Math.abs(t.y - city.tiles[market.tileId].y) <= 1) {
      roads[t.y * city.size + t.x] ??= { flow: 0, speed: t.mobility.speed, congestion: t.mobility.congestion };
    }
  }
  let network = pedestrianCache.get(city);
  if (!network || network.revision !== city.mobility.revision || network.tick !== city.tick) {
    network = { revision: city.mobility.revision, tick: city.tick, paths: pedestrianPaths(city) }; pedestrianCache.set(city, network);
  }
  return { hour: rhythm.hour, period: rhythm.period, weekend: rhythm.weekend, lighting: rhythm.lighting,
    pedestrianActivity: unit(tiles.reduce((sum, t) => sum + t.pedestrian, 0) / Math.max(1, occupied + city.mobility.stops.length)), vehicleActivity: unit((journeys.reduce((sum, j) => sum + j.car / 1.4 + j.okada * 0.25 + j.freight * 1.5, 0) + city.mobility.routes.reduce((sum, r) => sum + r.congestionImpact * (transit[r.id]?.activity ?? 0), 0)) / Math.max(400, city.population * 0.65)),
    commercialActivity: unit(commerce / Math.max(1, occupied)), commuterActivity: unit(rhythm.commute),
    nightActivity: unit(night / Math.max(1, occupied) * (1 - gate(rhythm.hour, 5, 23))),
    marketActivity: unit((city.living?.markets.length ?? 0) / 8 * rhythm.shopping * rain),
    averageCommute: commuters ? commute / commuters : 0, congestion: roadWeight ? weighted / roadWeight : 0,
    tiles, journeys, roads, transit, pedestrianNetwork: network.paths.filter(p => {
      const a=city.tiles[p.origin].building, b=city.tiles[p.destination].building;
      if ([a,b].some(b=>b && (!isOperating(b) || b.floodClosed || b.business && b.business.closedAt !== null))) return false;
      return p.purpose !== 'shopping' || tiles[p.destination].commercial > 0.05;
    }).map(p => p.purpose === 'work' && rhythm.evening > rhythm.morning ? {...p,origin:p.destination,destination:p.origin,path:[...p.path].reverse()} : p) };
}

// Shared entrance/road-edge graph links are read from already cached OD paths.
export function pedestrianPaths(city: City): CityActivity['pedestrianNetwork'] {
  const groups = new Map<number, typeof city.mobility.flows>();
  for (const f of city.mobility.flows) if (f.purpose !== 'delivery' && f.trips > 0 && f.path.length > 0 && f.path.length <= 16) {
    const t=city.tiles[f.origin], key=Math.floor(t.y/4)*8+Math.floor(t.x/4);
    const list=groups.get(key)??[]; list.push(f); groups.set(key,list);
  }
  const paths: CityActivity['pedestrianNetwork'] = [];
  const areas=[...groups.values()]; areas.forEach(g=>g.sort((a,b)=>b.trips-a.trips));
  // Spatial round-robin prevents the earliest 96 OD flows from hiding all activity
  // in later neighborhoods. Reuse existing routes, never pathfind visual agents.
  for(let round=0;round<4&&paths.length<96;round++) for(const group of areas) {
    const f=group[round]; if(f&&paths.length<96)paths.push({path:f.path,origin:f.origin,destination:f.destination,purpose:f.purpose});
  }
  for (const stop of city.mobility.stops.slice(0, 32)) {
    const home = city.tiles.findIndex(t => isOperating(t.building) && !t.building!.floodClosed && Math.abs(t.x - city.tiles[stop.tileId].x) + Math.abs(t.y - city.tiles[stop.tileId].y) <= 2);
    if (home >= 0) { const anchor = roadAnchor(city, home); if (anchor !== null && anchor === stop.tileId) paths.push({ path: [anchor], origin: home, destination: stop.tileId }); }
  }
  return paths;
}
