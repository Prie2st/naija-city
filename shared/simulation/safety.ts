import type { City, Overlay, Tile } from '../types/city';
import type { CrimePressureModel, IncidentSeverity, SafetyAreaMetrics, SafetyIncidentType, SafetyMetrics } from '../types/safety';
import { SAFETY as B } from './safety-config';
import { clamp, neighbourhoods, stableHash, isOperating } from './world';
import { servicePath, serviceTravelMap, serviceReach } from './public-service-access';
import { localGovernance } from './governance';
import { feedEvent } from './living-city';
import { milestone } from './development';

const emptyMetrics = (): SafetyMetrics => ({ crimePressure:19, publicSafety:75, nightSafety:65, lighting:0, policeAccess:0, responseMinutes:60, communitySafety:50, capacity:0, demand:0, activeIncidents:0, incidents30Days:0 });
const emptyArea = (): SafetyAreaMetrics => ({ crimePressure:19, publicSafety:75, nightSafety:65, communitySafety:50, lighting:0, policeAccess:0, responseMinutes:60, commercialSafety:75, patrol:0, recentIncidents:0, shock:0, eveningActivity:1,
  model:{economicStress:0,employmentStress:0,housingStress:0,serviceStress:0,opportunity:0,community:50,visibility:0,patrol:0} });
export function initializeSafety(city: City) {
  city.safety = { local:city.tiles.map(emptyArea), facilities:[], incidents:[], metrics:emptyMetrics(), districts:{}, totalIncidents:0, seriousIncidents:0, resolvedIncidents:0, nextIncidentId:1, history:[], lastAnalysis:-B.analysisInterval, lightingPower:0, lightingCost:0 };
  updateSafety(city, false);
}
// Identity, income band, tenure and industry worker identity are deliberately absent.
export function crimePressure(model: CrimePressureModel, memory = 0) {
  const w=B.weights;
  const combinedStress=model.employmentStress*(B.structural.stressBase+model.housingStress/B.structural.housingInteraction+model.serviceStress/B.structural.serviceInteraction);
  return clamp(B.basePressure+combinedStress*w.employment+model.economicStress*B.structural.economic*(model.employmentStress+model.housingStress)/100+model.housingStress*w.housing+model.serviceStress*w.services+model.opportunity*w.opportunity+(100-model.visibility)*w.darkness-model.community*w.community-model.patrol*w.patrol+Math.min(12,memory*w.memory),5,85);
}
export function safetyAt(city: City, t: Tile) { return city.safety?.local[t.y*city.size+t.x]; }
export function lightingLevel(city: City, t: Tile) {
  const nearby=neighbourhoods(city.size)[t.y*city.size+t.x];
  const roads=t.road?[t]:nearby.filter(id=>Math.abs(city.tiles[id].x-t.x)+Math.abs(city.tiles[id].y-t.y)<=1&&city.tiles[id].road).map(id=>city.tiles[id]);
  return roads.reduce((best,road)=>{
    const effects=localGovernance(city,road)?.effects;
    const hub=city.mobility.stops.some(s=>s.tileId===road.y*city.size+road.x);
    const installed=clamp(B.lighting[road.roadClass??'local']+(effects?.lighting??0)+(hub?(effects?.hubSafety??0)*100:0));
    return Math.max(best,installed*road.services.powerReliability/100*road.services.roadCondition/100);
  },0);
}
export function roadLightingDemand(city: City, t: Tile) {
  if(!t.road)return 0;
  const installed=clamp(B.lighting[t.roadClass??'local']+(localGovernance(city,t)?.effects.lighting??0));
  return installed/100*B.lightingMW;
}
function aggregate(city: City, ids: number[]): SafetyMetrics {
  const out=emptyMetrics();const keys=['crimePressure','publicSafety','nightSafety','lighting','policeAccess','responseMinutes','communitySafety'] as const;
  let weight=0;for(const k of keys)out[k]=0;
  for(const id of ids){const t=city.tiles[id],a=city.safety.local[id],w=(t.building?.occupants??0)+(t.building?.jobs??0)*.5+t.mobility.footTraffic*.05;if(!w)continue;weight+=w;for(const k of keys)out[k]+=a[k]*w;out.demand+=(t.building?.occupants??0)+(t.building?.jobs??0)*1.2+t.mobility.footTraffic*.15;}
  for(const k of keys)out[k]=weight?out[k]/weight:emptyMetrics()[k];
  const set=new Set(ids),incidents=city.safety.incidents.filter(i=>set.has(i.location));
  out.activeIncidents=incidents.filter(i=>i.resolvedAt===null).length;out.incidents30Days=incidents.filter(i=>city.tick-i.startTime<30).length;
  out.capacity=city.publicServices.facilities.filter(f=>f.type==='police'&&set.has(f.location)).reduce((s,f)=>s+f.effectiveCapacity,0);
  return out;
}
function analyze(city: City, progress: boolean) {
  const state=city.safety,stations=city.publicServices.facilities.filter(f=>f.type==='police');
  const maps=new Map(stations.map(f=>[f.id,serviceTravelMap(city,f)]));
  state.facilities=stations.map(f=>{
    const activeIncidents=state.incidents.filter(i=>i.respondingUnit===f.id&&i.resolvedAt===null).length;
    const slots=B.responseSlots[f.subtype as keyof typeof B.responseSlots]*Math.min(1,f.effectiveCapacity/Math.max(1,f.capacity));
    const overload=Math.max(0,activeIncidents-slots);
    const allocation=clamp(f.effectiveCapacity/Math.max(1,f.currentUsage),0,1);
    const patrolEffectiveness=f.serviceQuality*allocation/(1+overload);
    const target=city.tiles.map((t,id)=>({id,minutes:maps.get(f.id)![id],demand:(t.building?.occupants??0)+(t.building?.jobs??0)+t.mobility.footTraffic})).filter(t=>t.minutes>2&&t.minutes<f.coverageMinutes&&t.demand>0).sort((a,b)=>b.demand-a.demand)[0];
    return {facilityId:f.id,activeIncidents,responseSlots:slots,patrolDemand:f.currentUsage,patrolEffectiveness,patrolPath:target&&patrolEffectiveness>20?servicePath(city,f,target.id)?.path??[]:[]};
  });
  const neighbors=neighbourhoods(city.size);
  const stops=new Set(city.mobility.stops.map(s=>s.tileId));
  const priorities=city.tiles.map((t,id)=>t.zone==='commercial'?(localGovernance(city,t)?.effects.commercialPatrol??0):stops.has(id)?(localGovernance(city,t)?.effects.hubSafety??0):0);
  const redistribution=new Map(stations.map(f=>{let total=0,target=0;city.tiles.forEach((t,id)=>{const demand=(t.building?.occupants??0)+(t.building?.jobs??0)*1.2+t.mobility.footTraffic*.15;const reachable=serviceReach(maps.get(f.id)![id],f.coverageMinutes);total+=demand*reachable;target+=demand*reachable*(1+priorities[id]);});return [f.id,total/Math.max(1,target)];}));
  city.tiles.forEach((t,id)=>{
    const a=state.local[id],g=localGovernance(city,t),p=t.publicServices;
    a.lighting=lightingLevel(city,t);
    let patrol=0,access=0,minutes=B.unservedMinutes as number;
    for(const f of stations){const reach=serviceReach(maps.get(f.id)![id],f.coverageMinutes),capacity=state.facilities.find(s=>s.facilityId===f.id)!;
      const adjusted=capacity.patrolEffectiveness*(1+priorities[id])*(redistribution.get(f.id)??1);
      patrol=Math.max(patrol,reach*adjusted);access=Math.max(access,reach*f.serviceQuality*Math.min(1,f.effectiveCapacity/Math.max(1,f.capacity)));
      if(reach>0&&capacity.responseSlots>.05)minutes=Math.min(minutes,B.dispatchMinutes+maps.get(f.id)![id]/Math.max(.2,f.serviceQuality/100)+Math.max(0,capacity.activeIncidents-capacity.responseSlots+1)*B.overloadMinutes);
    }
    a.policeAccess=clamp(access);a.patrol=clamp(patrol);a.responseMinutes=minutes;
    let commerce=0;for(const next of [id,...neighbors[id]]){const b=city.tiles[next].building;if(isOperating(b)&&b!.type==='commercial')commerce+=b!.occupancy;}
    const activity=clamp(commerce*20+t.mobility.footTraffic/12);
    const employment=clamp((100-city.unemploymentRate)*(.55+t.mobility.accessibility/220));
    const services=(p.education.quality+p.healthcare.quality+p.parks.quality+p.waste.quality)/4;
    const housing=clamp(100-(g?.pressure??city.governance.housing.pressure)*.55-city.governance.clearanceShock);
    const community=clamp(employment*B.community.employment+services*B.community.services+activity*B.community.activity+housing*B.community.housing+a.lighting*B.community.lighting+(g?.effects.prevention??0));
    a.communitySafety=community;
    a.model={economicStress:clamp(Math.max(0,50-city.purchasingPower)+Math.max(0,40-(t.building?.business?.profitability??50))*.5),employmentStress:100-employment,housingStress:100-housing,serviceStress:100-services,opportunity:activity,community,visibility:a.lighting,patrol:a.patrol};
    const target=crimePressure(a.model,a.recentIncidents)-(g?.effects.prevention??0)*.45;
    a.crimePressure=progress?a.crimePressure+(target-a.crimePressure)*B.smoothing:clamp(target);
    const safety=clamp(B.safety.base-a.crimePressure*B.safety.pressure+a.communitySafety*B.safety.community+a.patrol*B.safety.patrol-a.shock*B.safety.shock,B.safety.minimum,B.safety.maximum);
    const night=clamp(safety+(a.lighting-50)*B.night.lighting+activity*B.night.activity,B.night.minimum,B.safety.maximum);
    a.publicSafety=progress?a.publicSafety+(safety-a.publicSafety)*.25:safety;
    a.nightSafety=progress?a.nightSafety+(night-a.nightSafety)*.25:night;
    a.commercialSafety=clamp((a.publicSafety+a.nightSafety)/2);
    a.eveningActivity=clamp(1-Math.max(0,65-a.nightSafety)*.006-a.shock*.002,.65,1);
    p.police.quality=a.patrol;p.police.access=a.policeAccess;p.police.minutes=a.responseMinutes;
  });
  state.metrics=aggregate(city,city.tiles.map((_t,id)=>id));state.districts={};
  for(const d of city.governance.districts)state.districts[d.id]=aggregate(city,d.tiles);
  state.lastAnalysis=city.tick;
  city.governance.health['Public safety']=state.metrics.publicSafety;
  city.governance.health['Emergency response']=clamp(100-state.metrics.responseMinutes*1.2);
  if(progress){safetyChallenges(city);if(city.tick%30===0){state.history.push({...state.metrics,tick:city.tick});state.history=state.history.slice(-B.historyLimit);}}
}
function dispatch(city: City, location: number, excludeId?:string) {
  return city.publicServices.facilities.filter(f=>f.type==='police'&&f.active&&f.effectiveCapacity>0&&f.serviceQuality>10).map(f=>{
    const path=servicePath(city,f,location),slots=B.responseSlots[f.subtype as keyof typeof B.responseSlots]*Math.min(1,f.effectiveCapacity/f.capacity);
    const pending=city.safety.incidents.filter(i=>i.id!==excludeId&&i.respondingUnit===f.id&&i.resolvedAt===null),busy=pending.length;
    const available=pending.filter(i=>i.status==='responding').length<Math.max(.25,slots);
    return {f,path,available,minutes:path?B.dispatchMinutes+path.minutes/Math.max(.2,f.serviceQuality/100)+Math.max(0,busy-slots+1)*B.overloadMinutes:Infinity};
  }).filter(x=>x.path&&x.minutes<90).sort((a,b)=>a.minutes-b.minutes)[0];
}
export function triggerSafetyIncident(city: City, location: number, severity: IncidentSeverity='minor', type?: SafetyIncidentType) {
  const s=city.safety,t=city.tiles[location];
  if(!t||(!t.building&&!t.road&&!t.publicFacility)||s.incidents.filter(i=>i.resolvedAt===null).length>=B.maxActive||s.incidents.some(i=>i.location===location&&i.resolvedAt===null))return false;
  const assigned=dispatch(city,location),minutes=assigned?.minutes??B.unservedMinutes;
  const status=assigned?.available?'responding' as const:'waiting' as const;
  const incident={id:`safety-${city.seed}-${s.nextIncidentId++}`,type:type??(t.zone==='commercial'?'commercial':t.road?'public-space':'property'),location,severity,startTime:city.tick,status,responseRequired:true,respondingUnit:assigned?.f.id??null,responseTime:minutes,
    response:{requiredService:'police' as const,facilityId:assigned?.f.id??null,minutes,path:assigned?.path?.path??[],state:status},resolution:null,resolvedAt:null,impact:B.impact[severity]*(.5+Math.min(1,minutes/30)),districtId:city.governance.local[location].districtId,neighborhoodId:t.clusterId};
  s.incidents.push(incident);s.totalIncidents++;if(severity==='serious')s.seriousIncidents++;
  const near=[location,...neighbourhoods(city.size)[location]];
  for(const id of near){s.local[id].recentIncidents=clamp(s.local[id].recentIncidents+B.impact[severity]*(id===location?1:.3));s.local[id].shock=clamp(s.local[id].shock+incident.impact*(id===location?1:.25),0,30);}
  if(severity!=='minor')feedEvent(city,`safety-area:${Math.floor(t.x/4)}:${Math.floor(t.y/4)}`,`${severity==='serious'?'Serious':'Moderate'} ${incident.type.replace('-',' ')} incident near ${t.building?.name??'the street'}. ${assigned?`Response estimated at ${minutes.toFixed(1)} min.`:'No available road-connected police response.'}`,location,'warning',30);
  if(severity==='serious')milestone(city,'first-serious-safety','A serious safety incident required coordinated response. Prevention, capacity and road access all matter.');
  return true;
}
function safetyChallenges(city: City) {
  const s=city.safety,g=city.governance;
  const scopes=[{id:null as string|null,name:'City',m:s.metrics,ids:city.tiles.map((_t,id)=>id)},...g.districts.map(d=>({id:d.id,name:d.name,m:s.districts[d.id],ids:d.tiles}))];
  for(const scope of scopes){
    const focus=scope.ids.filter(id=>city.tiles[id].building).sort((a,b)=>s.local[a].nightSafety-s.local[b].nightSafety)[0]??null;
    const conditions=[{kind:'night-safety',active:scope.m.nightSafety<55,title:'Poor night safety',overlay:'night-safety' as Overlay}, {kind:'police-capacity',active:scope.m.demand>2000&&scope.m.capacity<scope.m.demand*.45,title:'Police capacity shortage',overlay:'police' as Overlay},{kind:'safety-response',active:scope.m.activeIncidents>0&&scope.m.responseMinutes>20,title:'Slow emergency response',overlay:'response-time' as Overlay},{kind:'safety-incidents',active:scope.m.incidents30Days>=5&&scope.m.publicSafety<65,title:'Repeated local incidents',overlay:'public-safety' as Overlay}];
    for(const c of conditions){const id=`${c.kind}:${scope.id??'city'}`,old=g.challenges.find(x=>x.id===id);
      if(!c.active){if(old&&!old.resolved){old.resolved=true;old.resolvedAt=city.tick;feedEvent(city,`safety-recovery:${id}`,`${c.title} improved in ${scope.name}.`,focus,'notice',180);milestone(city,'safety-recovery','A sustained safety challenge improved through city conditions and response.');}continue;}
      if(old){old.resolved=false;old.resolvedAt=null;old.tileId=focus;old.causes=[`Lighting ${Math.round(scope.m.lighting)}%`,`Police response ${scope.m.responseMinutes.toFixed(1)} min`,`Recent incidents ${scope.m.incidents30Days}`,`Community safety ${Math.round(scope.m.communitySafety)}%`];continue;}
      g.challenges.push({id,kind:c.kind,title:`${c.title} — ${scope.name}`,description:'Prevention and response need different investments.',causes:[`Lighting ${Math.round(scope.m.lighting)}%`,`Police response ${scope.m.responseMinutes.toFixed(1)} min`,`Recent incidents ${scope.m.incidents30Days}`,`Community safety ${Math.round(scope.m.communitySafety)}%`],responses:['Improve powered lighting','Provide reachable staffed police capacity','Improve road access and community services','Reduce persistent employment and housing stress'],severity:'warning',districtId:scope.id,tileId:focus,overlay:c.overlay,timestamp:city.tick,resolved:false,resolvedAt:null});
      feedEvent(city,`safety-challenge:${id}`,`${c.title} in ${scope.name}. Inspect lighting, roads, capacity and community conditions.`,focus,'warning',180);
    }
  }
  g.challenges=g.challenges.slice(-64);
}
export function updateSafety(city: City, progress=true) {
  if(!city.safety)return;
  const s=city.safety;
  const existing=new Set(city.publicServices.facilities.filter(f=>f.type==='police').map(f=>f.id));
  for(const i of s.incidents)if(i.respondingUnit&&!existing.has(i.respondingUnit)){i.respondingUnit=null;i.response.facilityId=null;i.response.path=[];if(i.resolvedAt===null){i.status='waiting';i.response.state='waiting';}}
  if(progress){
    for(const a of s.local){a.shock*=B.shockDecay;a.recentIncidents*=B.memoryDecay;}
    for(const i of s.incidents){if(i.resolvedAt!==null)continue;
      const assigned=dispatch(city,i.location,i.id);i.respondingUnit=assigned?.f.id??null;i.responseTime=assigned?.minutes??B.unservedMinutes;
      i.status=assigned?.available?'responding':'waiting';i.response={requiredService:'police',facilityId:i.respondingUnit,minutes:i.responseTime,path:assigned?.path?.path??[],state:i.status};
      const days=B.recoveryDays[i.severity]+(assigned?.available?0:2);
      if(city.tick-i.startTime>=days){for(const id of [i.location,...neighbourhoods(city.size)[i.location]])s.local[id].shock*=assigned?.available?1-clamp(1-i.responseTime/80,.2,.8)*.5:1;
        i.resolvedAt=city.tick;i.status='resolved';i.response.state='resolved';i.resolution=assigned?.available?(i.responseTime<B.promptResponse?'Resolved with prompt response':'Resolved after delayed response'):'Closed without dispatched response; local recovery continues';s.resolvedIncidents++;}
    }
    s.incidents=s.incidents.filter(i=>i.resolvedAt===null||city.tick-i.resolvedAt<B.incidentRetention).slice(-384);
  }
  if(!progress||city.tick-s.lastAnalysis>=B.analysisInterval)analyze(city,progress);
  // Lighting follows outages each day, while structural pressure remains periodic.
  s.lightingPower=0;s.lightingCost=0;
  for(const t of city.tiles){const a=s.local[t.y*city.size+t.x];const previous=a.lighting;a.lighting=lightingLevel(city,t);a.nightSafety=clamp(a.nightSafety+(a.lighting-previous)*.16,15,96);
    if(t.road){const demand=roadLightingDemand(city,t);s.lightingPower+=demand;s.lightingCost+=demand/B.lightingMW*B.lightingMonthlyCost;}}
  if(progress){
    const candidates=city.tiles.flatMap((t,id)=>isOperating(t.building)||t.road&&t.mobility.footTraffic>30?[{id,weight:((t.building?.occupants??0)+(t.building?.jobs??0)*.6+t.mobility.footTraffic*.15)*s.local[id].crimePressure/35}]:[]);
    const sum=candidates.reduce((n,c)=>n+c.weight,0),expected=sum*B.incidentChancePerResident;
    for(let n=0;n<Math.min(B.maxDailyIncidents,Math.ceil(expected));n++)if(stableHash(city.seed+191+n,city.tick)%100000/100000<Math.min(1,expected-n)){
      let target=stableHash(city.seed+931+n,city.tick)/4294967295*sum;
      for(const c of candidates){target-=c.weight;if(target<=0){const roll=stableHash(city.seed+791+n,city.tick)%100;const tile=city.tiles[c.id],vehicle=stableHash(city.seed+1021+n,city.tick+c.id)%100>80&&(tile.zone==='commercial'||tile.road&&tile.mobility.vehicleFlow>0);triggerSafetyIncident(city,c.id,roll<B.severityRoll.minor?'minor':roll<B.severityRoll.moderate?'moderate':'serious',vehicle?'vehicle':undefined);break;}}
    }
    s.metrics=aggregate(city,city.tiles.map((_t,id)=>id));
  }
}
export function safetyOverlayValue(city: City, t: Tile, overlay: Overlay) {
  const a=safetyAt(city,t);if(!a)return undefined;
  return overlay==='police-access'?a.policeAccess:overlay==='public-safety'?a.publicSafety:overlay==='crime-pressure'?100-a.crimePressure:overlay==='police'?a.patrol:overlay==='night-safety'?a.nightSafety:overlay==='lighting'?a.lighting:overlay==='response-time'?clamp(100-a.responseMinutes*2):overlay==='police-capacity'?t.publicServices.police.served:undefined;
}
