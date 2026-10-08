import type { City } from '../types/city';
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const number=(v:unknown,max=1e15)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const tile=(v:unknown)=>number(v,1023)&&Number.isInteger(v);
const metrics=(v:unknown)=>object(v)&&['crimePressure','publicSafety','nightSafety','lighting','policeAccess','communitySafety'].every(k=>number(v[k],100))&&['responseMinutes','capacity','demand','activeIncidents','incidents30Days'].every(k=>number(v[k]));
export function validSafety(city: City) {
  const s:Record<string,any>=city.safety;if(!object(s)||!Array.isArray(s.local)||s.local.length!==1024||!metrics(s.metrics)||!object(s.districts))return false;
  const districtIds=new Set(city.governance.districts.map(d=>d.id));
  if(Object.entries(s.districts).some(([id,m])=>!districtIds.has(id)||!metrics(m)))return false;
  if(!s.local.every((a:Record<string,any>)=>object(a)&&['crimePressure','publicSafety','nightSafety','commercialSafety','communitySafety','lighting','policeAccess','patrol','recentIncidents','shock'].every(k=>number(a[k],100))&&number(a.responseMinutes)&&number(a.eveningActivity,1)&&object(a.model)&&['economicStress','employmentStress','housingStress','serviceStress','opportunity','community','visibility','patrol'].every(k=>number(a.model[k],100))))return false;
  if(!['totalIncidents','seriousIncidents','resolvedIncidents','nextIncidentId','lightingPower','lightingCost'].every(k=>number(s[k]))||!Number.isInteger(s.nextIncidentId)||s.nextIncidentId<1||!number(s.lastAnalysis,city.tick))return false;
  const stations=new Set(city.publicServices.facilities.filter(f=>f.type==='police').map(f=>f.id));
  const path=(p:unknown)=>Array.isArray(p)&&p.length<=1024&&p.every((v,i)=>tile(v)&&(i===0||Math.abs(city.tiles[v].x-city.tiles[p[i-1]].x)+Math.abs(city.tiles[v].y-city.tiles[p[i-1]].y)===1));
  if(!Array.isArray(s.facilities)||s.facilities.length>128||!s.facilities.every((f:Record<string,any>)=>object(f)&&stations.has(f.facilityId)&&['activeIncidents','responseSlots','patrolDemand','patrolEffectiveness'].every(k=>number(f[k]))&&path(f.patrolPath)))return false;
  if(!Array.isArray(s.incidents)||s.seriousIncidents>s.totalIncidents||s.resolvedIncidents>s.totalIncidents||s.nextIncidentId<=s.totalIncidents||s.incidents.length>s.totalIncidents)return false;
  const ids=new Set<string>();
  if(!Array.isArray(s.incidents)||s.incidents.length>384||!s.incidents.every((i:Record<string,any>)=>{
    if(!object(i)||typeof i.id!=='string'||ids.has(i.id)||!tile(i.location)||!['property','commercial','public-space','vehicle'].includes(i.type)||!['minor','moderate','serious'].includes(i.severity)||!['waiting','responding','resolved'].includes(i.status)||!number(i.startTime,city.tick)||!number(i.responseTime)||!number(i.impact,30)||typeof i.responseRequired!=='boolean'||i.respondingUnit!==null&&!stations.has(i.respondingUnit)||i.districtId!==null&&!districtIds.has(i.districtId)||i.neighborhoodId!==null&&!tile(i.neighborhoodId)||!object(i.response)||i.response.requiredService!=='police'||i.response.facilityId!==i.respondingUnit||i.response.state!==i.status||!number(i.response.minutes)||!path(i.response.path)||i.resolution!==null&&typeof i.resolution!=='string')return false;
    if(i.status==='resolved'? !number(i.resolvedAt,city.tick)||i.resolvedAt<i.startTime : i.resolvedAt!==null)return false;
    ids.add(i.id);return true;
  }))return false;
  return Array.isArray(s.history)&&s.history.length<=240&&s.history.every((h:Record<string,any>)=>metrics(h)&&number(h.tick,city.tick));
}
