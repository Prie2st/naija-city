import { safetyAt } from './safety';
import { localGovernance } from './governance';
import type { City, Tile } from '../types/city';
import type { FacilityKind, PublicServiceFacility, ServiceGroup } from '../types/public-services';
import { PUBLIC_SERVICES, SERVICE_BALANCE as B, SERVICE_GROUPS, QOL_WEIGHTS, publicServiceState, emptyPublicTile, fundingEffect } from './public-service-config';
import { facilityAnchors, serviceTravelMap, serviceReach, servicePath } from './public-service-access';
import { clamp, isOperating, stableHash } from './world';
import { maintainedCondition } from './infrastructure';
import { feedEvent } from './living-city';
import { milestone } from './development';

export function initializePublicServices(city: City) {
  city.publicServices = publicServiceState();
  for (const t of city.tiles) { t.publicFacility = null; t.publicServices = emptyPublicTile(); }
  updatePublicServices(city, false);
}
export function facilityFootprint(city: City, tileId: number, kind: FacilityKind): number[] {
  const side = PUBLIC_SERVICES[kind].footprint, x = tileId % city.size, y = Math.floor(tileId / city.size);
  if (x + side > city.size || y + side > city.size) return [];
  return Array.from({length: side * side}, (_, n) => (y + Math.floor(n / side)) * city.size + x + n % side);
}
export function makeFacility(city: City, location: number, kind: FacilityKind): PublicServiceFacility {
  const d = PUBLIC_SERVICES[kind], t = city.tiles[location];
  const neighborhood = city.clusters.map(c => ({c, distance: Math.hypot(c.x-t.x,c.y-t.y)})).sort((a,b) => a.distance-b.distance)[0];
  const prefix = neighborhood && neighborhood.distance < 8 ? neighborhood.c.name.replace(/Estate|Quarter|District|Central/g, '').trim() : ['Alafia','Unity','Harmony','Amani'][stableHash(city.seed,location)%4];
  return { id: `facility-${city.seed}-${location}-${city.tick}`, name: `${prefix} ${d.name}`, type: d.group, subtype: kind, location, tiles: facilityFootprint(city, location, kind), builtAt: city.tick,
    status: 'understaffed', capacity: d.capacity, effectiveCapacity: 0, currentUsage: 0, served: 0, coverageMinutes: d.minutes, averageAccess: 0, serviceQuality: 0, fundingLevel: 100,
    employeesRequired: d.staff, employeesAvailable: 0, powerRequired: d.power, waterRequired: d.water, powerReliability: 0, waterReliability: 0,
    monthlyOperatingCost: d.monthlyCost, maintenanceCondition: 100, storedWaste: 0, active: true };
}
export function publicWorkforce(city: City) { return city.publicServices?.facilities.reduce((s,f) => s + (f.active && (f.type==='parks'||facilityAnchors(city,f).length) ? f.employeesRequired : 0),0) ?? 0; }
export function updatePublicStaff(city: City, available: number) {
  const p=city.publicServices; if (!p) return;
  const facilities=p.facilities.filter(f => f.active && (f.type==='parks'||facilityAnchors(city,f).length));
  let capacity=facilities.reduce((s,f)=>s+(p.jobTargets[f.id] ?? f.employeesRequired),0), remaining=Math.max(0,Math.floor(available));
  for (const f of p.facilities) if (!facilities.includes(f)) f.employeesAvailable=0;
  for (const f of facilities) {
    const weight=p.jobTargets[f.id] ?? f.employeesRequired;
    f.employeesAvailable=Math.min(f.employeesRequired,Math.floor(remaining * weight / Math.max(1,capacity)));
    remaining-=f.employeesAvailable;capacity-=weight;
  }
  p.employed=p.facilities.reduce((s,f)=>s+f.employeesAvailable,0);
}
function operatingFacilities(city: City) {
  const p=city.publicServices, budgetRoom = city.treasury < 0 ? clamp(1 + city.treasury / Math.max(1000000, city.expenses*3),0.5,0.85) : 1;
  p.costs={police:0,education:0,healthcare:0,fire:0,waste:0,parks:0};
  for (const f of p.facilities) {
    const t=city.tiles[f.location], def=PUBLIC_SERVICES[f.subtype];
    f.fundingLevel=p.funding[f.type]*budgetRoom;
    f.powerReliability=t.services.powerReliability;f.waterReliability=t.services.waterReliability;
    const staffing=Math.min(1,f.employeesAvailable/Math.max(1,f.employeesRequired)), funding=fundingEffect(f.fundingLevel);
    const utility = (def.power ? 0.4+f.powerReliability/100*0.6 : 1) * (def.water ? 0.6+f.waterReliability/100*0.4 : 1);
    const connected = f.type==='parks' || facilityAnchors(city,f).length>0;
    const working=f.active && connected && t.services.floodDepth<90;
    if(!f.active||!connected)f.employeesAvailable=0;
    f.effectiveCapacity=working ? f.capacity*funding*staffing*utility*f.maintenanceCondition/100*(f.subtype==='waste-depot'?1+(localGovernance(city,city.tiles[f.location])?.effects.waste??0):1) : 0;
    if(f.subtype==='landfill')f.effectiveCapacity=Math.min(f.effectiveCapacity,Math.max(0,PUBLIC_SERVICES.landfill.wasteStorage!-f.storedWaste));
    f.serviceQuality=working ? clamp(100*funding*(0.3+staffing*0.7)*utility*f.maintenanceCondition/100) : 0;
    f.monthlyOperatingCost=f.active ? def.monthlyCost*(0.2+f.fundingLevel/100*0.8) : def.monthlyCost*0.12;
    f.currentUsage=0;f.served=0;f.averageAccess=0;p.costs[f.type]+=f.monthlyOperatingCost;
    f.status=!working ? 'inactive' : f.fundingLevel<75 ? 'underfunded' : staffing<0.7 ? 'understaffed' : utility<0.65 ? 'utility-disrupted' : f.subtype==='landfill'&&f.effectiveCapacity===0?'strained':'operating';
  }
  p.publicJobs=publicWorkforce(city);p.employed=p.facilities.reduce((s,f)=>s+f.employeesAvailable,0);
}
function demandAt(t: Tile, group: ServiceGroup, subtype?: FacilityKind) {
  const b=t.building, residents=isOperating(b)?b!.occupants:0, workers=isOperating(b)&&!b!.floodClosed&&b!.business?.closedAt===null?b!.jobs:0;
  if (group==='education') return residents*(subtype==='primary-school'?B.primaryRatio:B.secondaryRatio);
  if (group==='healthcare') return residents*B.healthcareVisits*(1+t.services.floodDepth/250+Math.max(0,(b?.level??1)-2)*0.02)+workers*0.01;
  if (group==='waste') return t.publicServices.wasteGenerated + Math.min(t.publicServices.uncollectedWaste/7,t.publicServices.wasteGenerated*1.5);
  if (group==='police') return residents + workers * 1.2 + t.mobility.footTraffic * .15;
  if (group==='fire') return residents + workers*0.8;
  return residents;
}
type WasteShare = { id: number; facilityId: string; served: number; quality: number };
const wasteShares = new WeakMap<City, WasteShare[]>();
function allocate(city: City, group: ServiceGroup, subtype?: FacilityKind) {
  const p=city.publicServices, facilities=p.facilities.filter(f=>f.type===group&&(!subtype||f.subtype===subtype)&&f.subtype!=='landfill');
  if(!facilities.length)return {demand:city.tiles.reduce((s,t)=>s+demandAt(t,group,subtype),0),capacity:0,usage:0,served:0,access:0,quality:0};
  const maps=new Map(facilities.map(f=>[f.id,serviceTravelMap(city,f)]));
  const allocations: { id:number; f:PublicServiceFacility; demand:number; access:number; minutes:number }[]=[];
  let demand=0, served=0, accessTotal=0, qualityTotal=0;
  for (let id=0;id<city.tiles.length;id++) {
    const t=city.tiles[id], amount=demandAt(t,group,subtype); demand+=amount;
    const choices=facilities.map(f=>({f,minutes:maps.get(f.id)![id],access:serviceReach(maps.get(f.id)![id],f.coverageMinutes)})).filter(c=>c.access>0&&c.f.active).sort((a,b)=>b.access-a.access).slice(0,4);
    const weight=choices.reduce((s,c)=>s+c.access*c.access*Math.max(1,c.f.effectiveCapacity),0);
    const coverage=t.publicServices[group];
    if (!choices.length) continue;
    coverage.access=Math.max(coverage.access,choices[0].access*100);
    if (!coverage.facilityId || choices[0].minutes < coverage.minutes) {coverage.facilityId=choices[0].f.id;coverage.minutes=choices[0].minutes;}
    accessTotal+=amount*choices[0].access;
    for (const c of choices) if (amount>0) {
      const share=amount*c.access*c.access*Math.max(1,c.f.effectiveCapacity)/weight;
      c.f.currentUsage+=share;c.f.averageAccess+=share*c.access;
      allocations.push({id,f:c.f,demand:share,access:c.access,minutes:c.minutes});
    }
  }
  for(const f of facilities){f.averageAccess=f.currentUsage?clamp(f.averageAccess/f.currentUsage*100):0;f.serviceQuality=clamp(f.serviceQuality*(.6+.4*Math.min(1,f.effectiveCapacity/Math.max(1,f.currentUsage)))*(.7+.3*f.averageAccess/100));}
  for (const a of allocations) {
    const ratio=Math.min(1,a.f.effectiveCapacity/Math.max(1,a.f.currentUsage));
    const reached=a.demand*ratio*a.access, t=city.tiles[a.id];a.f.served+=reached;served+=reached;qualityTotal+=reached*a.f.serviceQuality;
    const percent=reached/Math.max(0.001,demandAt(t,group,subtype))*100;
    if (subtype==='primary-school') t.publicServices.primary+=percent;
    else if (subtype==='secondary-school') t.publicServices.secondary+=percent;
    else t.publicServices[group].served+=percent;
    t.publicServices[group].quality+=percent*a.f.serviceQuality/100*(subtype==='primary-school'?.6:subtype==='secondary-school'?.4:1);
    if(group==='waste') wasteShares.get(city)!.push({id:a.id,facilityId:a.f.id,served:percent,quality:percent*a.f.serviceQuality/100});
  }
  // Unoccupied parcels expose prospective service quality, allowing services to
  // attract organic development without inventing users or consuming capacity.
  for(let id=0;id<city.tiles.length;id++)if(demandAt(city.tiles[id],group,subtype)===0){
    const t=city.tiles[id],best=facilities.reduce((score,f)=>Math.max(score,serviceReach(maps.get(f.id)![id],f.coverageMinutes)*f.serviceQuality*Math.min(1,f.effectiveCapacity/Math.max(1,f.currentUsage))),0);
    t.publicServices[group].quality+=best*(subtype==='primary-school'?.6:subtype==='secondary-school'?.4:1);
    if(subtype==='primary-school')t.publicServices.primary=best;else if(subtype==='secondary-school')t.publicServices.secondary=best;else t.publicServices[group].served=best;
  }
  return {demand,capacity:facilities.reduce((s,f)=>s+f.effectiveCapacity,0),usage:facilities.reduce((s,f)=>s+f.currentUsage,0),served,access:demand?accessTotal/demand*100:0,quality:served?qualityTotal/served:0};
}
function resetCoverage(city: City) {
  for (const t of city.tiles) {
    const s=t.publicServices;
    for (const g of SERVICE_GROUPS){const c=s[g];c.access=0;c.served=0;c.quality=0;c.minutes=0;c.facilityId=null;}
    s.primary=0;s.secondary=0;s.landfillPenalty=0;
    const b=t.building, active=isOperating(b);
    s.educationDemand=active ? b!.occupants*(B.primaryRatio+B.secondaryRatio):0;
    s.healthcareDemand=demandAt(t,'healthcare');
    s.wasteGenerated=active ? b!.occupants*B.residentialWaste + b!.jobs*(b!.type==='industrial'?B.industrialWaste:B.commercialWaste):0;
  }
}
function updateWaste(city: City, progress: boolean) {
  const p=city.publicServices, landfills=p.facilities.filter(f=>f.subtype==='landfill'&&f.active&&f.effectiveCapacity>0);
  const destinations=new Map(landfills.map(f=>[f.id,serviceTravelMap(city,f)])), remaining=new Map(landfills.map(f=>[f.id,Math.min(f.effectiveCapacity,(PUBLIC_SERVICES.landfill.wasteStorage!-f.storedWaste))]));
  let disposed=0;
  const ratios=new Map<string,number>();
  for (const depot of p.facilities.filter(f=>f.subtype==='waste-depot')) {
    const usable=landfills.filter(f=>Number.isFinite(destinations.get(f.id)![depot.location]) && destinations.get(f.id)![depot.location]<=PUBLIC_SERVICES.landfill.minutes);
    const offered=Math.min(depot.served,usable.reduce((s,f)=>s+(remaining.get(f.id)??0),0));
    const ratio=depot.served ? offered/depot.served:0;
    ratios.set(depot.id,ratio);
    depot.served*=ratio;
    if(!usable.length && depot.currentUsage>0) depot.status='strained';
    let amount=offered;
    for (const f of usable) {const used=Math.min(amount,remaining.get(f.id)??0);remaining.set(f.id,(remaining.get(f.id)??0)-used);amount-=used;f.currentUsage+=used;f.served+=used;disposed+=used;if(progress)f.storedWaste+=used;}
  }
  for(const t of city.tiles){t.publicServices.waste.served=0;t.publicServices.waste.quality=0;}
  for(const share of wasteShares.get(city)??[]){const s=city.tiles[share.id].publicServices.waste,ratio=ratios.get(share.facilityId)??0;s.served+=share.served*ratio;s.quality+=share.quality*ratio;}
  let generated=0,backlog=0;
  for (const t of city.tiles) {
    const s=t.publicServices;
    const collected=demandAt(t,'waste')*Math.min(1,s.waste.served/100);
    if(progress)s.uncollectedWaste=Math.max(0,s.uncollectedWaste+s.wasteGenerated-collected);
    generated+=s.wasteGenerated;backlog+=s.uncollectedWaste;
  }
  p.waste={generated,collected:disposed,backlog,disposalCapacity:landfills.reduce((s,f)=>s+f.effectiveCapacity,0),disposed:p.waste.disposed+(progress?disposed:0)};
  p.stats.waste.served=disposed;p.stats.waste.access=generated?clamp(disposed/generated*100):0;
  for (const landfill of p.facilities.filter(f=>f.subtype==='landfill')) for (const t of city.tiles) {
    const distance=Math.hypot(t.x-city.tiles[landfill.location].x,t.y-city.tiles[landfill.location].y);
    t.publicServices.landfillPenalty=Math.max(t.publicServices.landfillPenalty,Math.max(0,1-distance/5)*10);
  }
}
export function fireRisk(t: Tile) {
  const b=t.building;if(!b||!isOperating(b))return 0;
  // Risk follows density, industry and physical utilities, never income/surname.
  return clamp(5+b.level*3+(b.type==='industrial'?17:3)+(100-t.services.powerReliability)*0.08+b.generator*0.06+(b.tenure!=='formal'?3:0));
}
export function triggerFire(city: City, tileId: number) {
  const p=city.publicServices,t=city.tiles[tileId];
  if (!t?.building || !isOperating(t.building) || p.fires.some(f=>f.tileId===tileId&&f.resolvedAt===null) || p.fires.filter(f=>f.resolvedAt===null).length>=B.maxFires) return false;
  const best=p.facilities.filter(f=>f.type==='fire'&&f.active&&f.effectiveCapacity>0&&f.serviceQuality>10).map(f=>({f,path:servicePath(city,f,tileId)})).filter(x=>x.path).sort((a,b)=>a.path!.minutes/Math.max(.2,a.f.serviceQuality/100)-b.path!.minutes/Math.max(.2,b.f.serviceQuality/100))[0];
  const minutes=best ? 2+best.path!.minutes/Math.max(.2,best.f.serviceQuality/100):60;
  p.fires.push({id:`fire-${city.tick}-${tileId}`,tileId,startedAt:city.tick,age:0,intensity:18,damage:0,stationId:best?.f.id??null,responseMinutes:minutes,path:best?.path?.path??[],resolvedAt:null});
  p.fireCount++;milestone(city,'first-fire-incident','First fire incident: local access and response determine damage.');t.publicServices.fireActive=true;
  feedEvent(city,`fire:${tileId}`,`A fire was reported at ${t.building.name}. Estimated response ${Math.round(minutes)} minutes.`,tileId,'warning',30);
  return true;
}
function updateFires(city: City, progress: boolean) {
  const p=city.publicServices;
  for (const t of city.tiles) {t.publicServices.fireRisk=fireRisk(t);t.publicServices.fireActive=false;}
  if (!progress) {for(const f of p.fires)if(f.resolvedAt===null)city.tiles[f.tileId].publicServices.fireActive=true;return;}
  for (const t of city.tiles) t.publicServices.fireDamage=Math.max(0,t.publicServices.fireDamage-B.fireRecovery);
  const candidates=city.tiles.flatMap((t,id)=>t.publicServices.fireRisk>0?[{id,risk:t.publicServices.fireRisk}]:[]);
  const sum=candidates.reduce((s,c)=>s+c.risk,0);
  if (stableHash(city.seed+917,city.tick)%100000/100000<B.fireChance*Math.min(4,sum/1000)) {
    let pick=stableHash(city.seed+293,city.tick)/4294967295*sum;
    for (const c of candidates) {pick-=c.risk;if(pick<=0){triggerFire(city,c.id);break;}}
  }
  for (const f of p.fires) {
    if(f.resolvedAt!==null)continue;
    const t=city.tiles[f.tileId];if(!t.building){f.resolvedAt=city.tick;continue;}
    const dispatch=p.facilities.filter(s=>s.type==='fire'&&s.active&&s.effectiveCapacity>0&&s.serviceQuality>10).map(s=>({station:s,path:servicePath(city,s,f.tileId)})).filter(d=>d.path).sort((a,b)=>a.path!.minutes/Math.max(.2,a.station.serviceQuality/100)-b.path!.minutes/Math.max(.2,b.station.serviceQuality/100))[0];
    const station=dispatch?.station,path=dispatch?.path??null;f.stationId=station?.id??null;
    const response=path&&station!.active?2+path.minutes/Math.max(.2,station!.serviceQuality/100):60;
    f.responseMinutes=response;f.path=path?.path??[];f.age++;
    const control=path?clamp((32-response)/25,0.1,1)*station!.serviceQuality/100:0.06;
    f.intensity=clamp(f.intensity+14-control*40);
    const damage=Math.min(70-f.damage,Math.max(0,8+response*0.12-control*12));f.damage+=damage;
    t.publicServices.fireDamage=clamp(t.publicServices.fireDamage+damage,0,75);t.publicServices.fireActive=true;
    if(t.building.type==='residential'&&damage>0)t.building.occupants=Math.floor(t.building.occupants*(1-damage*0.003));
    if(f.intensity<=0||f.age>=5){f.resolvedAt=city.tick;t.publicServices.fireActive=false;p.containedFires++;milestone(city,'first-fire-contained','First fire contained. Damaged properties can recover without demolition.');feedEvent(city,`fire-contained:${f.id}`,`The fire at ${t.building.name} was contained. Repairs are progressing.`,f.tileId,'notice');}
  }
  p.fires=p.fires.filter(f=>f.resolvedAt===null||city.tick-f.resolvedAt<90).slice(-48);
  const resolved=p.fires.filter(f=>f.resolvedAt!==null);p.averageResponse=resolved.length?resolved.reduce((s,f)=>s+f.responseMinutes,0)/resolved.length:0;
}
export function localServiceEffect(t: Tile) {
  const s=t.publicServices;if(!s)return {benefit:0,penalty:0,satisfaction:0};
  const benefit=(s.education.quality*0.025+s.healthcare.quality*0.025+s.parks.quality*0.03);
  const wastePenalty=Math.min(9,s.uncollectedWaste/Math.max(.02,s.wasteGenerated)*0.15);
  return {benefit:Math.min(B.maxLandValueBonus,benefit),penalty:Math.min(B.maxLandValuePenalty,wastePenalty+s.landfillPenalty+s.fireDamage*0.12),satisfaction:benefit*0.65-wastePenalty*0.65-s.fireDamage*0.08};
}
function updateQualityOfLife(city: City, progress: boolean) {
  const p=city.publicServices, totals:Record<string,number>={Employment:0,Housing:0,Education:0,Healthcare:0,Power:0,Water:0,Mobility:0,Waste:0,Recreation:0,'Flood safety':0};
  const coefficients=QOL_WEIGHTS,keys=Object.keys(totals);
  let sum=0,weight=0;
  for (const t of city.tiles) {
    const s=t.publicServices,residents=isOperating(t.building)?t.building!.occupants:0;
    if(!t.building&&!t.zone&&!t.publicFacility&&city.tick%5!==0)continue;
    const values=[100-city.unemploymentRate,city.vacantHousing>0?75:40,s.education.quality,s.healthcare.quality,t.services.powerReliability,t.services.waterReliability,100-t.mobility.congestion,s.waste.quality,s.parks.quality,100-t.services.floodRisk];
    let structural=0;for(let k=0;k<values.length;k++){structural+=values[k]*coefficients[k];if(residents)totals[keys[k]]+=values[k]*residents;}
    const civic=localGovernance(city,t);
    const target=clamp(structural+((safetyAt(city,t)?.publicSafety??75)-75)*.06+(civic?Math.min(0,(civic.affordability-70)*.05)+(civic.environment-60)*.04:0)-Math.min(12,s.uncollectedWaste/Math.max(.02,s.wasteGenerated)*.1)-s.fireDamage*.1);
    if(progress)s.qualityOfLife+=(target-s.qualityOfLife)*B.qolRate;
    sum+=target*residents;weight+=residents;
  }
  p.qolTarget=weight?sum/weight:45;if(progress)p.qualityOfLife+=(p.qolTarget-p.qualityOfLife)*B.qolRate;
  for(const key of keys)totals[key]=weight?totals[key]/weight:0;p.breakdown=totals;
  for(const c of city.clusters)c.qualityOfLife=c.tileIds.reduce((s,id)=>s+city.tiles[id].publicServices.qualityOfLife,0)/c.tileIds.length;
}
function serviceEvents(city: City) {
  const p=city.publicServices,next:typeof p.previous={};
  for(const f of p.facilities){next[f.id]=f.status;if(p.previous[f.id]!==f.status&&f.status!=='operating')feedEvent(city,`service-status:${f.id}`,`${f.name}: ${f.status.replaceAll('-',' ')}. ${Math.round(f.currentUsage)} demand / ${Math.round(f.effectiveCapacity)} effective capacity.`,f.location,'warning',30);}
  for(const g of ['education','healthcare'] as const)if(p.stats[g].demand>0&&p.stats[g].served/p.stats[g].demand>=.9)milestone(city,`${g}-90`,`${g==='education'?'Education':'Healthcare'} access reached 90%.`);
  const poor=city.tiles.findIndex(t=>t.publicServices.uncollectedWaste>t.publicServices.wasteGenerated*14&&t.publicServices.wasteGenerated>0);
  if(poor>=0 && !p.previous.wasteBehind)feedEvent(city,'waste-behind','Waste collection is falling behind in a neighborhood. Check road access, depot and disposal capacity.',poor,'warning');
  next.wasteBehind=poor>=0?1:0;p.previous=next;
}
export function updatePublicServices(city: City, progress=true) {
  const p=city.publicServices;if(!p)return;
  if(progress)for(const f of p.facilities)f.maintenanceCondition=maintainedCondition(f.maintenanceCondition,p.funding[f.type]*(city.treasury<0?.7:1));
  operatingFacilities(city);
  if(!p.facilities.length){
    // Founding/migrated cities have no facilities. Avoid rebuilding thousands of
    // unchanged coverage records on every offline day.
    let residents=0,health=0,waste=0,backlog=0,workers=0;
    for(const t of city.tiles){const s=t.publicServices,b=t.building,active=isOperating(b);
      if(active){residents+=b!.occupants;workers+=b!.jobs;health+=demandAt(t,'healthcare');}
      for(const g of SERVICE_GROUPS){const a=s[g];if(a.facilityId||a.quality||a.access||a.served){a.access=0;a.served=0;a.quality=0;a.minutes=0;a.facilityId=null;}}
      s.primary=0;s.secondary=0;s.landfillPenalty=0;
      s.educationDemand=active?b!.occupants*(B.primaryRatio+B.secondaryRatio):0;s.healthcareDemand=active?demandAt(t,'healthcare'):0;
      s.wasteGenerated=active?b!.occupants*B.residentialWaste+b!.jobs*(b!.type==='industrial'?B.industrialWaste:B.commercialWaste):0;
      if(progress)s.uncollectedWaste+=s.wasteGenerated;waste+=s.wasteGenerated;backlog+=s.uncollectedWaste;
    }
    for(const g of SERVICE_GROUPS)p.stats[g]={demand:g==='education'?residents*.2:g==='healthcare'?health:g==='waste'?waste:g==='fire'?residents+workers*.8:g==='police'?residents+workers*1.2:residents,capacity:0,usage:0,served:0,access:0,quality:0};
    p.waste={generated:waste,collected:0,backlog,disposalCapacity:0,disposed:p.waste.disposed};
    updateFires(city,progress);updateQualityOfLife(city,progress);
    if(progress){serviceEvents(city);if(city.tick%30===0){p.history.push({tick:city.tick,education:0,healthcare:0,waste:0,parks:0,qualityOfLife:p.qualityOfLife,fires:p.fireCount});p.history=p.history.slice(-120);}}
    return;
  }
  resetCoverage(city);wasteShares.set(city,[]);
  const primary=allocate(city,'education','primary-school'),secondary=allocate(city,'education','secondary-school');
  const total=primary.demand+secondary.demand;
  p.stats.education={demand:total,capacity:primary.capacity+secondary.capacity,usage:primary.usage+secondary.usage,served:primary.served+secondary.served,access:total?(primary.access*primary.demand+secondary.access*secondary.demand)/total:0,quality:total?(primary.quality*primary.served+secondary.quality*secondary.served)/Math.max(1,primary.served+secondary.served):0};
  for(const t of city.tiles){const s=t.publicServices;s.primary=clamp(s.primary);s.secondary=clamp(s.secondary);s.education.served=(s.primary*B.primaryRatio+s.secondary*B.secondaryRatio)/(B.primaryRatio+B.secondaryRatio);}
  for(const g of ['healthcare','fire','waste','parks','police'] as const)p.stats[g]=allocate(city,g);
  updateWaste(city,progress);updateFires(city,progress);
  for(const f of p.facilities)if(f.status==='operating'){if(f.currentUsage>f.effectiveCapacity*1.03)f.status='overcrowded';else if(f.currentUsage>f.effectiveCapacity*.85||f.averageAccess>0&&f.averageAccess<55)f.status='strained';}
  updateQualityOfLife(city,progress);
  if(progress){serviceEvents(city);if(city.tick%30===0){p.history.push({tick:city.tick,education:p.stats.education.served/Math.max(1,p.stats.education.demand)*100,healthcare:p.stats.healthcare.served/Math.max(1,p.stats.healthcare.demand)*100,waste:p.stats.waste.access,parks:p.stats.parks.served/Math.max(1,p.stats.parks.demand)*100,qualityOfLife:p.qualityOfLife,fires:p.fireCount});p.history=p.history.slice(-120);}}
}
