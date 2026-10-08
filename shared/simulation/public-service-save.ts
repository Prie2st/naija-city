import type { City } from '../types/city';
import { PUBLIC_SERVICES, SERVICE_GROUPS } from './public-service-config';
import { facilityFootprint } from './public-services';

const record = (x: unknown): x is Record<string, any> => !!x && typeof x==='object' && !Array.isArray(x);
const n = (x: unknown, max=Number.MAX_SAFE_INTEGER) => typeof x==='number' && Number.isFinite(x) && x>=0 && x<=max;
const value=(o:object,k:string)=>(o as Record<string,unknown>)[k];
const id = (x: unknown): x is number => n(x,1023) && Number.isInteger(x);
export function validPublicServices(c: City): boolean {
  const p=c.publicServices;
  if(!record(p)||!Array.isArray(p.facilities)||p.facilities.length>128||!record(p.funding)||!record(p.costs)||!record(p.stats)||!record(p.breakdown)||!record(p.jobTargets)||!record(p.previous)||!record(p.waste))return false;
  if(!['revision','publicJobs','employed','reachableJobs','fireCount','containedFires','averageResponse'].every(k=>n(value(p,k)))||!n(p.qualityOfLife,100)||!n(p.qolTarget,100)||!Object.values(p.breakdown).every(v=>n(v,100))||!Object.values(p.jobTargets).every(v=>n(v)))return false;
  if(!SERVICE_GROUPS.every(g=>n(p.funding[g],150)&&p.funding[g]>=50&&n(p.costs[g])&&record(p.stats[g])&&['demand','capacity','usage','served','access','quality'].every(k=>n(value(p.stats[g],k))))||!['generated','collected','backlog','disposalCapacity','disposed'].every(k=>n(value(p.waste,k))))return false;
  const occupied=new Map<number,string>(), ids=new Set<string>();
  for(const f of p.facilities){
    if(!record(f)||typeof f.id!=='string'||ids.has(f.id)||typeof f.name!=='string'||f.name.length>120||!Object.hasOwn(PUBLIC_SERVICES,f.subtype)||!id(f.location)||typeof f.active!=='boolean')return false;
    const d=PUBLIC_SERVICES[f.subtype];
    if(f.type!==d.group||!['operating','strained','overcrowded','understaffed','utility-disrupted','underfunded','inactive'].includes(f.status)||!Array.isArray(f.tiles))return false;
    const footprint=facilityFootprint(c,f.location,f.subtype);
    if(f.tiles.length!==d.footprint**2||f.tiles.some((v:number,i:number)=>v!==footprint[i]||occupied.has(v)))return false;
    if(!['builtAt','capacity','effectiveCapacity','currentUsage','served','coverageMinutes','averageAccess','serviceQuality','fundingLevel','employeesRequired','employeesAvailable','powerRequired','waterRequired','powerReliability','waterReliability','monthlyOperatingCost','maintenanceCondition','storedWaste'].every(k=>n(value(f,k))))return false;
    if(f.capacity!==d.capacity||f.employeesRequired!==d.staff||f.employeesAvailable>f.employeesRequired||f.maintenanceCondition>100||f.serviceQuality>100||f.powerReliability>100||f.waterReliability>100||f.fundingLevel>150)return false;
    ids.add(f.id);for(const v of f.tiles){const t=c.tiles[v];if(t.road||t.zone||t.building||t.infrastructure||['water','wetland'].includes(t.terrain))return false;occupied.set(v,f.id);}
  }
  if(Object.keys(p.jobTargets).some(key=>!ids.has(key)))return false;
  if(!c.tiles.every((t,i)=>{
    const s=t.publicServices;if(t.publicFacility!==(occupied.get(i)??null)||!record(s)||typeof s.fireActive!=='boolean')return false;
    if(!['primary','secondary','fireRisk','fireDamage','qualityOfLife','landfillPenalty'].every(k=>n(value(s,k),100))||!['educationDemand','healthcareDemand','wasteGenerated','uncollectedWaste'].every(k=>n(value(s,k))))return false;
    return SERVICE_GROUPS.every(g=>{const a=s[g];return record(a)&&['access','served','quality'].every(k=>n(value(a,k),100.00001))&&n(a.minutes)&&(a.facilityId===null||ids.has(a.facilityId));});
  }))return false;
  if(!Array.isArray(p.fires)||p.fires.length>48||!p.fires.every(f=>record(f)&&typeof f.id==='string'&&id(f.tileId)&&['startedAt','age','intensity','damage','responseMinutes'].every(k=>n(value(f,k)))&&(f.resolvedAt===null||n(f.resolvedAt))&&(f.stationId===null||p.facilities.some(a=>a.id===f.stationId&&a.type==='fire'))&&Array.isArray(f.path)&&f.path.length<=1024&&f.path.every((v:number,i:number)=>id(v)&&(i===0||Math.abs(c.tiles[v].x-c.tiles[f.path[i-1]].x)+Math.abs(c.tiles[v].y-c.tiles[f.path[i-1]].y)===1))))return false;
  return Array.isArray(p.history)&&p.history.length<=120&&p.history.every(h=>record(h)&&Object.values(h).every(v=>n(v)))&&Object.values(p.previous).every(v=>typeof v==='string'||n(v));
}
