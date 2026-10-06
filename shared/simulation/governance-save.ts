import type { City } from '../types/city';
import { GOVERNANCE as G, POLICIES, OBJECTIVES, emptyEffects } from './governance-config';

const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,min=0,max=1e15)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const numeric=(v:unknown,keys:string[],min=0,max=1e15)=>object(v)&&keys.every(k=>finite(v[k],min,max));
export function validGovernance(city: City): boolean {
  const g:Record<string,any>=city.governance;if(!object(g)||!object(g.taxes)||!object(g.priorities)||!object(g.housing))return false;
  for(const [z,b] of Object.entries(G.taxes))if(!object(g.taxes.target)||!object(g.taxes.effective)||!object(g.taxes.changedAt)||!finite(g.taxes.target[z],b.min,b.max)||!finite(g.taxes.effective[z],b.min,b.max)||!finite(g.taxes.changedAt[z],-G.cooldown,city.tick))return false;
  if(!['power','water','roads','drainage'].every(k=>['low','standard','high'].includes(g.priorities[k])))return false;
  if(!Array.isArray(g.districts)||g.districts.length>G.districtLimit||!Array.isArray(g.local)||g.local.length!==city.tiles.length)return false;
  const owned=new Set<number>(),ids=new Set<string>();
  for(const d of g.districts){if(!object(d)||typeof d.id!=='string'||ids.has(d.id)||typeof d.name!=='string'||d.name.length>60||!Array.isArray(d.tiles)||!d.tiles.length||!finite(d.createdAt,0,city.tick)||!Array.isArray(d.neighborhoodIds)||!d.neighborhoodIds.every((s:unknown)=>finite(s))||!object(d.metrics)||!Object.values(d.metrics).every(v=>finite(v)))return false;ids.add(d.id);
    for(const id of d.tiles){if(!Number.isInteger(id)||id<0||id>=city.tiles.length||owned.has(id)||g.local[id]?.districtId!==d.id)return false;owned.add(id);}
  }
  if(!finite(g.nextDistrictId,1,1e8)||!Array.isArray(g.policies)||g.policies.length>POLICIES.length*(G.districtLimit+1))return false;
  const policies=new Set<string>();for(const p of g.policies){const key=`${p.id}:${p.districtId}`;if(!object(p)||!POLICIES.some(d=>d.id===p.id)||policies.has(key)||p.districtId!==null&&!ids.has(p.districtId)||typeof p.enabled!=='boolean'||!finite(p.activationDate,0,city.tick+G.policyDelay)||!finite(p.changedAt,0,city.tick)||!finite(p.strength,0,1))return false;policies.add(key);}
  for(let id=0;id<g.local.length;id++){const l=g.local[id];if(!object(l)||l.districtId!==null&&(!ids.has(l.districtId)||!owned.has(id))||!numeric(l,['rent','income','costOfLiving','affordability','environment','pressure','floodEvents'])||!finite(l.migration,.35,1.2)||!object(l.effects)||!Object.keys(emptyEffects()).every(k=>finite(l.effects[k],-1,100)))return false;}
  if(!numeric(g.housing,['units','occupied','vacant','demand','pressure','averageRent','affordability','overcrowding','displacedResidents','displacedSince','rehoused','departed','costOfLiving','inequality'])||!Array.isArray(g.housing.incomeBands)||g.housing.incomeBands.length!==5||!g.housing.incomeBands.every(v=>finite(v)))return false;
  if(!Array.isArray(g.challenges)||g.challenges.length>G.challengeLimit||!g.challenges.every(c=>object(c)&&typeof c.id==='string'&&typeof c.kind==='string'&&typeof c.title==='string'&&typeof c.description==='string'&&['critical','warning','notice'].includes(c.severity)&&Array.isArray(c.causes)&&c.causes.every((v:unknown)=>typeof v==='string')&&Array.isArray(c.responses)&&c.responses.every((v:unknown)=>typeof v==='string')&&typeof c.resolved==='boolean'&&finite(c.timestamp,0,city.tick)&&(c.resolvedAt===null||finite(c.resolvedAt,0,city.tick))&&(c.districtId===null||ids.has(c.districtId))&&(c.tileId===null||Number.isInteger(c.tileId)&&c.tileId>=0&&c.tileId<city.tiles.length)&&typeof c.overlay==='string'))return false;
  return Array.isArray(g.history)&&g.history.length<=G.historyLimit&&g.history.every(s=>numeric(s,['tick','population','jobs','rent','affordability','qualityOfLife','revenue','expenses','congestion'])&&finite(s.reserves,-1e15))&&object(g.lastEvents)&&Object.values(g.lastEvents).every(v=>finite(v,0,city.tick))&&finite(g.programCost)&&finite(g.clearanceShock,0,20)&&finite(g.deficitDays)&&object(g.health)&&Object.values(g.health).every(v=>finite(v,0,100))&&numeric(g.forecast,['population','housingNeed','powerDemand','waterDemand'])&&finite(g.forecast.annualBalance,-1e15)&&(g.objective===null||g.objective in OBJECTIVES);
}
