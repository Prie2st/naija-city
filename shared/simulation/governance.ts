import type { City, Tile, Zone, Overlay } from '../types/city';
import type { District, DistrictMetrics, GovernanceState, LocalGovernance, ObjectiveId, PolicyBasis, PolicyId, Priority, UrbanChallenge } from '../types/governance';
import { GOVERNANCE as G, emptyEffects, POLICIES } from './governance-config';
import { clamp, isOperating, neighbourhoods } from './world';
import { BALANCE } from './balance-config';
import { isDrainage } from './infrastructure-config';

const zones: Zone[] = ['residential','commercial','industrial'];
const average = (values: number[], fallback = 50) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : fallback;
const metrics = (): DistrictMetrics => ({ population:0, households:0, housing:0, vacancy:0, jobs:0, employment:0, jobHousingBalance:0, affordability:70, rent:45000, landValue:0, qualityOfLife:50, power:0, water:0, drainage:0, congestion:0, environment:60, informalResidents:0, floodEvents:0, businesses:0 });
export function initializeGovernance(city: City) {
  const base = { residential:G.taxes.residential.base, commercial:G.taxes.commercial.base, industrial:G.taxes.industrial.base };
  city.governance = {
    taxes:{target:{...base},effective:{...base},changedAt:{residential:-G.cooldown,commercial:-G.cooldown,industrial:-G.cooldown}},
    policies:[], priorities:{power:'standard',water:'standard',roads:'standard',drainage:'standard'},districts:[],nextDistrictId:1,
    local:city.tiles.map(()=>({districtId:null,rent:45000,income:160000,affordability:70,costOfLiving:40,environment:60,migration:1,pressure:0,floodEvents:0,effects:emptyEffects()})),
    housing:{units:0,occupied:0,vacant:0,demand:0,pressure:0,averageRent:45000,affordability:70,overcrowding:0,displacedResidents:0,displacedSince:0,rehoused:0,departed:0,costOfLiving:40,inequality:0,incomeBands:[0,0,0,0,0]},
    challenges:[],history:[],lastEvents:{},programCost:0,clearanceShock:0,deficitDays:0,objective:null,health:{},forecast:{population:city.population,housingNeed:0,powerDemand:0,waterDemand:0,annualBalance:0},
  };
  analyzeGovernance(city, false);
}
export function localGovernance(city: City, tile: Tile): LocalGovernance | undefined { return city.governance?.local[tile.y*city.size+tile.x]; }
export function taxRate(city: City, zone: Zone) { return city.governance?.taxes.effective[zone] ?? G.taxes[zone].base; }
export function taxPressure(city: City, zone: Zone) { return (taxRate(city,zone)-G.taxes[zone].base)/(G.taxes[zone].max-G.taxes[zone].min); }
/** Share of assessed tax actually collected: avoidance and informality grow as rates rise above the base. */
export function taxCompliance(city: City, zone: Zone) {
  const t=G.taxes[zone], above=clamp((taxRate(city,zone)-t.base)/(t.max-t.base),0,1);
  return 1-BALANCE.taxes.complianceLoss*Math.pow(above,BALANCE.taxes.complianceExponent);
}
/**
 * Satisfaction effect of the tax burden. Without it, raising taxes on a mature, fully housed city cost
 * nothing (demand only steers new development), so maximum rates were close to free money.
 */
export function taxSatisfaction(city: City) {
  if(!city.governance)return 0;
  const T=BALANCE.taxes, side=(z: Zone)=>{const t=G.taxes[z],r=taxRate(city,z);return r>=t.base?-clamp((r-t.base)/(t.max-t.base),0,1):clamp((t.base-r)/(t.base-t.min),0,1)*T.reliefShare;};
  return side('residential')*T.residentBurden+(side('commercial')+side('industrial'))/2*T.businessBurden;
}
export type FiscalStage = 'surplus' | 'balanced' | 'deficit' | 'stress' | 'severe';
/** Municipal finance stage, from reserves or debt measured in months of spending and the monthly balance. */
export function fiscalStage(city: City): FiscalStage {
  const F=BALANCE.fiscal, monthly=Math.max(1,city.expenses), debt=Math.max(0,-city.treasury), balance=city.income-city.expenses;
  if(debt>monthly*F.severeMonths)return 'severe';
  if(debt>monthly*F.stressMonths)return 'stress';
  if(debt>0||balance<-monthly*.02)return 'deficit';
  return balance>monthly*.05?'surplus':'balanced';
}
/** Monthly interest on overdraft debt, capped as a share of revenue so a recovery path always remains. */
export function debtService(city: City) {
  if(city.treasury>=0)return 0;
  return Math.min(-city.treasury*BALANCE.fiscal.interestRate,Math.max(0,city.income)*BALANCE.fiscal.interestRevenueCap);
}
/** Share of chosen service and maintenance funding the city can actually pay for at its fiscal stage. */
export function fiscalFunding(city: City) {
  const stage=fiscalStage(city),F=BALANCE.fiscal;
  return stage==='severe'?F.severeFunding:stage==='stress'?F.stressFunding:1;
}
/** Satisfaction lost to delayed salaries and contractor payments. */
export function fiscalSatisfaction(city: City) {
  if(!city.governance)return 0;
  const stage=fiscalStage(city);return stage==='severe'?BALANCE.fiscal.severeSatisfaction:stage==='stress'?BALANCE.fiscal.stressSatisfaction:0;
}
export function setTax(city: City, zone: Zone, rate: number): string {
  const g=city.governance, bounds=G.taxes[zone];
  if (!Number.isFinite(rate)||rate<bounds.min||rate>bounds.max) return `Choose a rate between ${bounds.min}% and ${bounds.max}%.`;
  if (city.tick-g.taxes.changedAt[zone]<G.cooldown) return 'Tax decisions have a 30-day review period.';
  if(g.taxes.target[zone]===rate)return '';
  g.taxes.target[zone]=rate;g.taxes.changedAt[zone]=city.tick;
  governanceEvent(city,`tax-${zone}`,`${zone} tax target changed to ${rate}%. Effects phase in gradually.`,true);
  return '';
}
export function togglePolicy(city: City, id: PolicyId, districtId: string | null): string {
  const g=city.governance, def=POLICIES.find(p=>p.id===id);
  if(!def||districtId&&!g.districts.some(d=>d.id===districtId))return 'Unknown policy or district.';
  let p=g.policies.find(p=>p.id===id&&p.districtId===districtId);
  if(p&&city.tick-p.changedAt<G.cooldown)return 'Policies have a 30-day review period.';
  if(!p){p={id,districtId,enabled:false,activationDate:city.tick+G.policyDelay,changedAt:city.tick,strength:0};g.policies.push(p);}
  p.enabled=!p.enabled;p.changedAt=city.tick;p.activationDate=city.tick+G.policyDelay;
  governanceEvent(city,`policy-${id}-${districtId}`,`${def.name} ${p.enabled?'approved':'winding down'}${districtId?' in '+g.districts.find(d=>d.id===districtId)!.name:''}. Seven-day activation, gradual implementation.`,true);
  return '';
}
export function setPriority(city: City, group: keyof GovernanceState['priorities'], priority: Priority) { city.governance.priorities[group]=priority; }
export function maintenanceBudget(city: City, group: keyof GovernanceState['priorities'], tile?: Tile): number {
  const p=city.governance?.priorities[group]??'standard';
  return clamp((city.infrastructure.maintenance[group]+(p==='high'?G.maintenance.high:p==='low'?G.maintenance.low:0)+(group==='drainage'&&tile?(localGovernance(city,tile)?.effects.drainage??0):0))*fiscalFunding(city),0,G.maintenance.maximum);
}
export function createDistrict(city: City, ids: number[], name: string, neighborhoodIds: number[] = []): string {
  const g=city.governance;
  if(g.districts.length>=G.districtLimit)return 'District limit reached.';
  const tiles=[...new Set(ids)].filter(id=>Number.isInteger(id)&&city.tiles[id]&&city.tiles[id].terrain!=='water'&&city.tiles[id].terrain!=='wetland'&&!g.local[id].districtId).sort((a,b)=>a-b);
  if(!tiles.length)return 'Choose unassigned dry land.';
  const district:District={id:`district-${g.nextDistrictId++}`,name:name.trim().slice(0,60)||`District ${g.nextDistrictId-1}`,tiles,createdAt:city.tick,neighborhoodIds:[...neighborhoodIds],metrics:metrics()};
  g.districts.push(district);for(const id of tiles)g.local[id].districtId=district.id;
  analyzeGovernance(city,false);governanceEvent(city,`district-${district.id}`,`${district.name} established across ${tiles.length} governed parcels. Neighborhood identity is retained.`,true);return '';
}
export function adoptNeighborhood(city: City, clusterId: number): string {
  const c=city.clusters.find(c=>c.id===clusterId);if(!c)return 'Neighborhood no longer exists.';
  const members=city.tiles.flatMap((t,id)=>t.clusterId===clusterId?[id]:[]), nearby=neighbourhoods(city.size);
  return createDistrict(city,members.flatMap(id=>[id,...nearby[id]]),c.name,[c.id]);
}
export function renameDistrict(city: City, id: string, name: string) { const d=city.governance.districts.find(d=>d.id===id);if(d&&name.trim())d.name=name.trim().slice(0,60); }
export function displaceResidents(city: City, tile: Tile) {
  const b=tile.building;if(!b||!b.occupants)return;
  const h=city.governance.housing;
  if(!h.displacedResidents)h.displacedSince=city.tick;
  h.displacedResidents+=b.occupants;city.governance.clearanceShock=clamp(city.governance.clearanceShock+G.displacement.shock,0,G.displacement.shockMaximum);
  governanceEvent(city,'clearance',`${b.occupants} residents displaced from ${b.name}. They remain in the city while seeking housing.`,true);
}
export function rehouseDisplaced(city: City) {
  const h=city.governance?.housing;if(!h?.displacedResidents)return;
  const homes=city.tiles.filter(t=>isOperating(t.building)&&t.building!.type==='residential'&&t.mobility.accessibility>=25);
  homes.sort((a,b)=>(localGovernance(city,b)?.affordability??50)-(localGovernance(city,a)?.affordability??50));
  let budget=Math.max(4,Math.ceil(h.displacedResidents*G.displacement.rehouseRate));
  for(const t of homes){const b=t.building!,n=Math.min(b.maximumOccupancy-b.occupants,h.displacedResidents,budget);b.occupants+=n;h.displacedResidents-=n;h.rehoused+=n;budget-=n;if(!budget||!h.displacedResidents)break;}
  if(h.displacedResidents&&city.tick-h.displacedSince>G.displacementDepartureDelay){const n=Math.min(h.displacedResidents,Math.max(1,Math.ceil(h.displacedResidents*G.displacement.departureRate)));h.displacedResidents-=n;h.departed+=n;}
}
export function governanceEvent(city: City, key: string, text: string, force=false) {
  const g=city.governance;if(!force&&city.tick-(g.lastEvents[key]??-180)<180)return;
  g.lastEvents[key]=city.tick;city.history.unshift(`Day ${city.tick}: ${text}`);city.history=city.history.slice(0,60);
  if(city.living){city.living.feed.unshift({id:`governance-${key}-${city.tick}`,tick:city.tick,hour:city.weather.hour,kind:'governance',text,tileId:null,severity:'notice'} as typeof city.living.feed[number]);city.living.feed=city.living.feed.slice(0,80);}
}
/** Units a policy's cost scales with on one tile: residents, streets, jobs, drains, depots or stops. */
export function policyUnits(city: City, tile: Tile, basis: PolicyBasis) {
  const b=tile.building, active=isOperating(b);
  switch(basis){
    case 'residents': return b?.occupants??0;
    case 'informal-residents': return b&&b.tenure!=='formal'?b.occupants:0;
    case 'roads': return tile.road?1:0;
    case 'commercial-jobs': return active&&b!.type==='commercial'?b!.maximumJobs:0;
    case 'industrial-jobs': return active&&b!.type==='industrial'?b!.maximumJobs:0;
    case 'business-jobs': return active&&b!.business?b!.maximumJobs:0;
    case 'commercial-buildings': return active&&b!.type==='commercial'?1:0;
    case 'drains': return tile.infrastructure&&isDrainage(tile.infrastructure.kind)?1:0;
    case 'waste-depots': return tile.publicFacility&&city.publicServices?.facilities.find(f=>f.id===tile.publicFacility)?.subtype==='waste-depot'&&city.publicServices.facilities.find(f=>f.id===tile.publicFacility)!.location===tile.y*city.size+tile.x?1:0;
    case 'stops': return city.transit?.stops.some(s=>s.tileId===tile.y*city.size+tile.x)||city.mobility?.stops.some(s=>s.tileId===tile.y*city.size+tile.x)?1:0;
  }
}
export const POLICY_BASIS_LABEL: Record<PolicyBasis,string>={residents:'resident','informal-residents':'informal resident',roads:'street tile','commercial-jobs':'commercial job','industrial-jobs':'industrial job','business-jobs':'business job','commercial-buildings':'commercial building',drains:'drainage asset','waste-depots':'waste depot',stops:'transport stop'};
/** Monthly cost of a policy at full strength across a scope (the whole city or one district). */
export function policyEstimate(city: City, id: PolicyId, districtId: string | null) {
  const def=POLICIES.find(p=>p.id===id)!,ids=districtId?city.governance.districts.find(d=>d.id===districtId)?.tiles??[]:city.tiles.map((_,n)=>n);
  return G.effects.policyAdministration+ids.reduce((sum,n)=>sum+def.cost*policyUnits(city,city.tiles[n],def.basis),0);
}
function compilePolicies(city: City) {
  const g=city.governance;
  if(!g.policies.length){g.programCost=0;return;}
  const scopes=new Map<string|null,typeof g.policies>();
  for(const p of g.policies){const list=scopes.get(p.districtId)??[];list.push(p);scopes.set(p.districtId,list);}
  // Programmes the city cannot pay for during severe fiscal stress deliver less.
  const delivery=fiscalStage(city)==='severe'?BALANCE.fiscal.severePolicyEffect:1;
  const compiled=new Map<string|null,ReturnType<typeof emptyEffects>>();
  const strengths=new Map<string|null,number[]>();
  for(const scope of [null,...g.districts.map(d=>d.id)]){
    const effects=emptyEffects(),levels:number[]=[];
    for(const def of POLICIES){const strength=Math.max(0,...(scopes.get(null)??[]).filter(p=>p.id===def.id).map(p=>p.strength),...(scope?(scopes.get(scope)??[]).filter(p=>p.id===def.id).map(p=>p.strength):[]));
      for(const [k,v] of Object.entries(def.effects))effects[k as keyof typeof effects]+=v*strength*delivery;
      levels.push(strength);
    }compiled.set(scope,effects);strengths.set(scope,levels);
  }
  g.programCost=0;
  for(let id=0;id<city.tiles.length;id++){
    const l=g.local[id],t=city.tiles[id];l.effects=compiled.get(l.districtId)??compiled.get(null)!;
    const levels=strengths.get(l.districtId)??strengths.get(null)!;
    // Each policy is charged on what it actually serves here (see POLICIES basis), not a flat per-resident fee.
    for(let n=0;n<POLICIES.length;n++)if(levels[n]>0)g.programCost+=levels[n]*POLICIES[n].cost*policyUnits(city,t,POLICIES[n].basis);
  }
  // A small administration cost also makes unoccupied policy areas cost something.
  g.programCost+=g.policies.reduce((s,p)=>s+p.strength*G.effects.policyAdministration,0);
}
export function updateGovernance(city: City) {
  const g=city.governance;
  for(const z of zones)g.taxes.effective[z]+=(g.taxes.target[z]-g.taxes.effective[z])*G.taxSmoothing;
  for(const p of g.policies){if(city.tick<p.activationDate&&p.enabled)continue;p.strength=clamp(p.strength+(p.enabled?1:-1)/G.policyRamp,0,1);}
  g.clearanceShock=Math.max(0,g.clearanceShock-G.displacement.shockRecovery);compilePolicies(city);
  if(city.tick%G.analysisInterval===0)analyzeGovernance(city);
}
export function analyzeGovernance(city: City, progress=true) {
  const g=city.governance,h=g.housing;compilePolicies(city);
  h.units=Math.ceil(city.housingCapacity/4);h.occupied=Math.ceil(city.occupiedHousing/4);h.vacant=Math.max(0,h.units-h.occupied);
  h.demand=Math.ceil((city.population+Math.max(0,city.jobs-city.workforce)*.4+Math.max(0,city.growth)*30)/4);
  h.pressure=clamp((h.demand/Math.max(1,h.units)-.8)*160+h.displacedResidents/Math.max(4,city.population)*100);
  const nbs=neighbourhoods(city.size);let weight=0,rent=0,afford=0,col=0;h.incomeBands=[0,0,0,0,0];
  for(let id=0;id<city.tiles.length;id++){
    const t=city.tiles[id],l=g.local[id],b=t.building;
    // Unused land has no household or business. Refresh its contextual estimates monthly;
    // developed/zoned land and streets still receive the five-day analysis.
    if(progress&&city.tick%30!==0&&!b&&!t.zone&&!t.road&&!t.publicFacility)continue;
    const employment=city.workforce?city.employed/city.workforce:.5;
    const income=G.incomeMinimum+(b?.level??1)*G.housing.incomeLevel+t.landValue*G.housing.incomeLand+employment*G.housing.incomeEmployment*(.5+t.mobility.accessibility/200);
    const targetRent=clamp((G.housing.baseRent+t.landValue*G.housing.landRent+(b?.level??1)*G.housing.levelRent)*(G.housing.scarcityBase+h.pressure/100)*(1+l.effects.rent)*(b?.tenure==='informal'?G.housing.informalRent:b?.tenure==='integrating'?G.housing.informalRent+b.integrationProgress*G.housing.integrationRent:1),G.rentMinimum,G.rentMaximum);
    l.rent=progress?l.rent+(targetRent-l.rent)*G.rentSmoothing:targetRent;l.income=income;
    l.affordability=clamp(income*G.affordableShare/Math.max(1,l.rent)*100);
    const transport=6000+city.mobility.stats.averageCommute*450, utilities=6500+(b?.generator??0)*110;
    const taxes=Math.max(0,(taxRate(city,'residential')-G.taxes.residential.base))*30000;
    l.costOfLiving=clamp((l.rent+transport+utilities+taxes)/income*100);
    let industry=0,green=0;
    for(const neighborId of nbs[id]){const neighbor=city.tiles[neighborId];if(neighbor.zone==='industrial'&&isOperating(neighbor.building))industry++;if(neighbor.terrain==='vegetation'||!neighbor.building&&!neighbor.road)green++;}
    l.environment=clamp(65+green*.5-industry*5-t.services.pollution*.25-t.mobility.congestion*.1-(t.publicServices?.uncollectedWaste??0)*2-t.services.floodDepth*.12+(t.publicServices?.parks.access??0)*.12+l.effects.environment);
    l.migration=clamp(.65+l.affordability/200+(t.publicServices?.qualityOfLife??50)/500-l.costOfLiving/300,.35,1.2);
    l.pressure=clamp(city.demand[t.zone??'residential']*.55+t.landValue*.25+t.mobility.accessibility*.1+(l.effects[t.zone??'residential'])-taxPressure(city,t.zone??'residential')*12-t.services.floodRisk*.15);
    l.floodEvents=t.services.floodEvents;
    if(b?.type==='residential'&&isOperating(b)){const w=Math.max(1,b.occupants);weight+=w;rent+=l.rent*w;afford+=l.affordability*w;col+=l.costOfLiving*w;h.incomeBands[Math.min(4,Math.floor((income-90000)/35000))]+=b.occupants;}
  }
  if(weight){h.averageRent=rent/weight;h.affordability=afford/weight;h.costOfLiving=col/weight;}
  h.overcrowding=clamp((h.pressure-65)*.65+(60-h.affordability)*.5+h.displacedResidents/Math.max(1,city.population)*100);
  const incomes=g.local.filter((_,id)=>city.tiles[id].building?.occupants).map(l=>l.income);h.inequality=clamp((Math.max(0,...incomes)-Math.min(...incomes,Infinity))/Math.max(1,average(incomes))*100,0,100);
  for(const d of g.districts)d.metrics=districtMetrics(city,d.tiles);
  const budget=city.income-city.expenses;
  if(progress)g.deficitDays=budget<0?g.deficitDays+G.analysisInterval:Math.max(0,g.deficitDays-G.analysisInterval*2);
  const condition=average(city.tiles.flatMap(t=>t.infrastructure?[t.infrastructure.condition]:t.road?[t.services.roadCondition]:[]));
  const environment=average(g.local.filter((_,id)=>!!city.tiles[id].building).map(l=>l.environment));
  g.health={growth:clamp(50+city.growth/Math.max(1,city.population)*3000),economy:clamp(city.purchasingPower),employment:100-city.unemploymentRate,housing:clamp(100-h.pressure*.7),affordability:h.affordability,infrastructure:(city.infrastructure.power.reliability+city.infrastructure.water.reliability)/2,mobility:clamp(city.mobility.stats.jobAccessibility-city.mobility.stats.congestion*.2),quality:clamp(city.publicServices.qualityOfLife+(h.affordability-70)*.06+(environment-60)*.06),environment,fiscal:clamp(55+budget/Math.max(1,city.expenses)*25+Math.min(20,city.treasury/Math.max(1,city.expenses)*2)-g.deficitDays*.03),resilience:clamp(condition*.2+(city.infrastructure.power.reliability+city.infrastructure.water.reliability)*.2+average(city.tiles.filter(t=>t.building).map(t=>t.services.drainageQuality))*.2+Math.max(0,Math.min(10,city.treasury/Math.max(1,city.expenses))))};
  const recent=g.history.slice(-3), growth=recent.length>=2?(city.population-recent[0].population)/Math.max(1,city.tick-recent[0].tick):city.growth;
  const predicted=Math.max(0,Math.min(city.population*1.5+100,city.population+growth*90));
  g.forecast={population:Math.round(predicted),housingNeed:Math.ceil(predicted/4),powerDemand:city.infrastructure.power.demand*predicted/Math.max(1,city.population),waterDemand:city.infrastructure.water.demand*predicted/Math.max(1,city.population),annualBalance:budget*12};
  detectChallenges(city,progress);
  if(progress&&city.tick%30===0){g.history.push({tick:city.tick,population:city.population,jobs:city.jobs,rent:h.averageRent,affordability:h.affordability,qualityOfLife:g.health.quality,revenue:city.income,expenses:city.expenses,congestion:city.mobility.stats.congestion,reserves:city.treasury});g.history=g.history.slice(-G.historyLimit);}
}
export function districtMetrics(city: City, ids: number[]): DistrictMetrics {
  const m=metrics(),tiles=ids.map(id=>city.tiles[id]),developed=tiles.filter(t=>t.building),locals=ids.filter(id=>city.tiles[id].building).map(id=>city.governance.local[id]);
  for(const t of developed){const b=t.building!;if(!isOperating(b))continue;m.population+=b.occupants;m.housing+=b.maximumOccupancy;m.jobs+=b.maximumJobs;m.employment+=b.jobs;if(b.tenure!=='formal')m.informalResidents+=b.occupants;if(b.business?.closedAt===null)m.businesses++;}
  m.households=Math.ceil(m.population/4);m.vacancy=Math.max(0,m.housing-m.population);m.jobHousingBalance=m.jobs/Math.max(1,m.population*.45);
  m.affordability=average(locals.map(l=>l.affordability),70);m.rent=average(locals.map(l=>l.rent),45000);m.environment=average(locals.map(l=>l.environment),60);
  m.landValue=average(developed.map(t=>t.landValue),22);m.qualityOfLife=average(developed.map(t=>t.publicServices.qualityOfLife));m.power=average(developed.map(t=>t.services.powerReliability),0);m.water=average(developed.map(t=>t.services.waterReliability),0);m.drainage=average(developed.map(t=>t.services.drainageQuality),0);m.congestion=average(tiles.filter(t=>t.road).map(t=>t.mobility.congestion),0);m.floodEvents=tiles.reduce((s,t)=>s+t.services.floodEvents,0);return m;
}
function detectChallenges(city: City,emit=true) {
  const g=city.governance, detected:UrbanChallenge[]=[], h=g.housing;
  const add=(kind:string,title:string,value:number,threshold:number,description:string,causes:string[],responses:string[],overlay:Overlay,districtId:string|null=null,tileId:number|null=null)=>{
    const id=`${kind}:${districtId??'city'}`,old=g.challenges.find(c=>c.id===id&&!c.resolved);
    if(value<(old?threshold*.9:threshold))return;
    detected.push({id,kind,title,description,causes,responses,severity:value>threshold*1.35?'critical':'warning',districtId,tileId,overlay,timestamp:old?.timestamp??city.tick,resolved:false,resolvedAt:null});
  };
  add('housing','Housing pressure',h.pressure,65,`${h.demand} households seek ${h.units} available units; ${h.displacedResidents} residents are displaced.`,['Job and population growth','Insufficient connected housing capacity'],['Zone connected residential land','Support infill or affordable housing','Improve services to enable density'],'development-pressure');
  add('affordability','Housing affordability',100-h.affordability,40,`Housing affordability is ${Math.round(h.affordability)}; indicative household rent ${Math.round(h.averageRent)} naira/month.`,['Land values and housing scarcity','Household earnings'],['Expand housing supply','Target affordable housing support','Improve employment accessibility'],'affordability');
  add('employment','Unemployment',city.unemploymentRate,25,`${Math.round(city.unemploymentRate)}% of the workforce is seeking work.`,['Accessible jobs','Business performance'],['Zone employment near homes','Support firms','Improve shared transport'],'mobility');
  add('commute','Long commutes',city.mobility.stats.averageCommute,30,`${Math.round(city.mobility.stats.averageCommute)} minute average commute.`,['Distance between homes and jobs','Congestion and route availability'],['Support existing transit','Provide bus routes','Encourage nearby jobs'],'mobility');
  add('traffic','Congested corridors',city.mobility.stats.congestion,65,`${Math.round(city.mobility.stats.congestion)}% average congestion.`,['Travel demand exceeds road capacity'],['Improve shared travel','Upgrade bottlenecks','Reduce long trips'],'traffic');
  const stage=fiscalStage(city);
  add('fiscal-stress',stage==='severe'?'Severe fiscal stress':'Fiscal stress',stage==='severe'?2:stage==='stress'?1:0,1,`Debt ${Math.round(Math.max(0,-city.treasury)/1e6)}M naira (${(Math.max(0,-city.treasury)/Math.max(1,city.expenses)).toFixed(1)} months of spending); interest ${Math.round(debtService(city)/1e6)}M naira/month. ${stage==='severe'?'Services and maintenance run at reduced funding and programmes deliver less.':'Services and maintenance are partly funded.'}`,['Spending exceeds revenue','Debt interest compounds the deficit'],['Raise revenue gradually','Pause programmes the city cannot afford','Protect essential maintenance'],'none');
  add('budget','Persistent budget deficit',g.deficitDays,60,`Monthly balance ${Math.round(city.income-city.expenses)} naira; ${g.deficitDays} deficit days.`,['Operating commitments exceed revenue'],['Review policy costs','Adjust taxes gradually','Reduce excess spending without abandoning maintenance'],'none');
  for(const [kind,service] of [['school',city.publicServices.stats.education],['health',city.publicServices.stats.healthcare]] as const)add(kind,kind==='school'?'School overcrowding':'Healthcare overload',service.demand?100-service.served/service.demand*100:0,45,'Service demand exceeds effective capacity.',['Capacity, staffing, utilities and road access'],['Inspect existing facilities','Improve staffing budgets and access','Add capacity where needed'],kind==='school'?'education':'healthcare');
  add('waste','Waste backlog',city.publicServices.waste.backlog/Math.max(1,city.population)*100,1,'Uncollected waste is accumulating.',['Collection and disposal capacity'],['Improve existing collection','Check depot and disposal access','Target collection policy'],'waste');
  for(const [id,name,tiles] of [[null,'City',city.tiles.map((_,id)=>id)],...g.districts.map(d=>[d.id,d.name,d.tiles])] as [string|null,string,number[]][]){
    const occupied=tiles.filter(id=>isOperating(city.tiles[id].building));if(!occupied.length)continue;
    const district=id?g.districts.find(d=>d.id===id):undefined;
    if(district&&district.metrics.housing>0){
      const homes=occupied.filter(tileId=>city.tiles[tileId].building?.type==='residential');
      const focus=homes.sort((a,b)=>g.local[a].affordability-g.local[b].affordability)[0]??occupied[0];
      add('affordability',`${name}: housing costs`,100-district.metrics.affordability,40,`Local affordability ${Math.round(district.metrics.affordability)}; indicative rent ${Math.round(district.metrics.rent)} naira/month.`,['Local land and housing costs','Earnings and access to employment'],['Target district housing support','Add connected homes','Improve job accessibility'],'affordability',id,focus);
    }
    const worst=(key:'powerReliability'|'waterReliability'|'floodDepth')=>occupied.reduce((a,b)=>key==='floodDepth'?city.tiles[a].services[key]>city.tiles[b].services[key]?a:b:city.tiles[a].services[key]<city.tiles[b].services[key]?a:b);
    const power=average(occupied.map(id=>city.tiles[id].services.powerReliability)),water=average(occupied.map(id=>city.tiles[id].services.waterReliability));
    add('power',`${name}: unreliable power`,100-power,50,'Generation and distribution both determine reliable electricity.',['Capacity, coverage and asset condition'],['Expand generation and substations','Prioritize power maintenance'],'power',id,worst('powerReliability'));
    add('water',`${name}: water shortage`,100-water,50,'Water supply and distribution limit development and household wellbeing.',['Production, local coverage and condition'],['Extend water infrastructure','Prioritize water maintenance'],'water',id,worst('waterReliability'));
    add('flood',`${name}: flood exposure`,occupied.filter(id=>city.tiles[id].services.floodDepth>20).length,1,'Developed properties are waterlogged or flooded.',['Rainfall, vulnerable terrain and drainage'],['Add drainage at vulnerable locations','Prioritize drain maintenance'],'flood-risk',id,worst('floodDepth'));
  }
  for(const old of g.challenges.filter(c=>!c.resolved)){if(old.kind!=='transit-network'&&!old.kind.startsWith('safety-')&&!['night-safety','police-capacity'].includes(old.kind)&&!detected.some(c=>c.id===old.id)){old.resolved=true;old.resolvedAt=city.tick;if(emit)governanceEvent(city,`resolved-${old.id}`,`${old.title} has eased.`);}}
  for(const c of detected)if(emit&&!g.challenges.some(old=>old.id===c.id&&!old.resolved))governanceEvent(city,`challenge-${c.id}`,`${c.title}: ${c.description}`);
  g.challenges=[...detected,...g.challenges.filter(c=>!c.resolved&&(c.kind==='transit-network'||c.kind.startsWith('safety-')||['night-safety','police-capacity'].includes(c.kind))),...g.challenges.filter(c=>c.resolved)].slice(0,G.challengeLimit);
}
export function governanceOverlayValue(city: City, tile: Tile, overlay: string): number | undefined {
  const l=localGovernance(city,tile);if(!l)return undefined;
  return overlay==='affordability'?l.affordability:overlay==='environment'?l.environment:overlay==='development-pressure'?l.pressure:overlay==='housing-pressure'?100-city.governance.housing.pressure:overlay==='cost-of-living'?100-l.costOfLiving:overlay==='migration-pressure'?l.migration/1.2*100:overlay==='district-policy'?Math.min(100,Object.values(l.effects).reduce((s,v)=>s+Math.abs(v),0)*5):overlay==='infrastructure-condition'?tile.infrastructure?.condition??tile.services.roadCondition:undefined;
}
export function objectiveProgress(city: City, id: ObjectiveId): number {
  const g=city.governance;
  return clamp(id==='affordable'?(g.housing.affordability+100-g.housing.pressure)/2:id==='commercial'?city.tiles.filter(t=>isOperating(t.building)&&t.zone==='commercial').reduce((s,t)=>s+t.building!.jobs,0)/Math.max(1,city.workforce)*200:id==='industrial'?city.tiles.filter(t=>isOperating(t.building)&&t.zone==='industrial').reduce((s,t)=>s+t.building!.jobs,0)/Math.max(1,city.workforce)*200:id==='transit'?(city.mobility.stats.sharedCoverage+city.mobility.stats.jobAccessibility)/2:id==='resilient'?g.health.resilience:g.health.quality);
}
