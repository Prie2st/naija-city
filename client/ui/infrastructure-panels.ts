import { publicServicePanel } from './public-service-panels';
import type { City, Tile, InfrastructureKind } from '../../shared/types/city';
import { INFRASTRUCTURE } from '../../shared/simulation/infrastructure-config';
import { densityRequirements, effectiveServices } from '../../shared/simulation/infrastructure';
import { compactMoney, escapeHtml } from './panels';
const row = (label: string, value: string) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const pct = (value: number) => `${Math.round(value)}%`;
const number = (value: number) => value.toLocaleString('en-NG', { maximumFractionDigits: 2 });
export function infrastructureOverlayButtons() {
  return '<h3>Infrastructure overlays</h3><div class="overlay-buttons"><button data-overlay="power">Power</button><button data-overlay="water">Water</button><button data-overlay="drainage">Drainage</button><button data-overlay="flood-risk">Flood risk</button></div><p class="hint">Green: good service / low risk. Amber: weak or stressed. Red: no service / high risk. Inspect a tile to see the causes.</p>';
}
export function infrastructureSummary(city: City) {
  const i = city.infrastructure;
  return `<h3>Electricity</h3><dl>${row('Supply / demand', `${number(i.power.supply)} / ${number(i.power.demand)} MW`)}${row('Reserve margin', pct(i.power.reserve))}${row('Grid reliability', pct(i.power.reliability))}${row('Distribution coverage', pct(i.power.coverage))}${row('Generator dependence', pct(i.power.generatorDependency))}${row('Peak demand', `${number(i.power.peakDemand)} MW`)}</dl><h3>Water</h3><dl>${row('Production / demand', `${number(i.water.production)} / ${number(i.water.demand)} m³/day`)}${row('Water reliability', pct(i.water.reliability))}${row('Distribution coverage', pct(i.water.coverage))}${row('Stored water', `${number(i.water.storage)} m³`)}${row('Private adaptation', pct(i.water.privateDependency))}</dl><h3>Resilience</h3><dl>${row('Flooded tiles now', String(i.floodedTiles))}${row('Flood incidents', String(i.floodIncidents))}${row('Estimated lost output', compactMoney(i.economicLoss))}</dl>`;
}
export function servicePanel(city: City, group: string) {
  const i = city.infrastructure;
  let html = '<div class="service-tabs"><button data-service="education">Education</button><button data-service="healthcare">Healthcare</button><button data-service="police">Police</button><button data-service="fire">Emergency</button><button data-service="waste">Waste</button><button data-service="parks">Parks</button><button data-service="power">⚡ Power</button><button data-service="water">◉ Water</button><button data-service="drainage">≋ Drainage</button></div>';
  if(['education','healthcare','fire','waste','parks','police'].includes(group.slice(9)))return html+publicServicePanel(city,group.slice(9));
  if (group === 'services') return `${html}<p>Capacity, coverage and condition work together. Generation needs substations; water needs production and local reach. Drains can be added to roads and occupied parcels.</p>${publicServicePanel(city,"overview")}${infrastructureSummary(city)}`;
  const kind = group.slice(9) as 'power' | 'water' | 'drainage';
  html += `<p>${kind === 'power' ? 'Plants produce MW. Substations distribute within seven tiles. Solar produces during daylight and loses output in cloudy/rainy weather. Diesel is fuel-sensitive.' : kind === 'water' ? 'Boreholes serve four tiles; towers extend distribution and store 500 m³ of surplus water. Treatment supports larger areas. Production and coverage are both required.' : 'Runoff accumulates when rainfall exceeds absorption and local drain capacity. Add drainage along roads or parcels; higher density needs stronger drainage.'}</p>`;
  for (const [key, def] of Object.entries(INFRASTRUCTURE)) if (def.group === kind) {
    const unit = kind === 'power' ? 'MW' : kind === 'water' ? key === 'water-tower' ? 'm³ storage' : 'm³/day' : 'mm/day runoff';
    html += `<button class="tool" data-tool="${key}"><span>${kind === 'power' ? 'ϟ' : kind === 'water' ? '◉' : '≋'}</span><div><b>${def.name}</b><small>${compactMoney(def.cost)} · ${def.capacity} ${unit}${def.radius ? ` · reach ${def.radius} tiles` : ''}<br>${compactMoney(def.operatingCost)}/month at normal maintenance</small></div></button>`;
  }
  html += `<h3>Maintenance · ${i.maintenance[kind]}%</h3><label class="budget-label">${kind} budget <select data-budget="${kind}">${[0, 50, 100, 150].map(v => `<option value="${v}" ${i.maintenance[kind] === v ? 'selected' : ''}>${v}%${v === 150 ? ' · repair over time' : v === 100 ? ' · normal' : v === 0 ? ' · defer maintenance' : ' · reduced'}</option>`).join('')}</select></label><p class="hint">Condition deteriorates slowly. Reduced budgets accelerate wear; 150% repairs gradually. Fuel and operating costs continue even when maintenance is cut.</p>`;
  return html;
}
export function infrastructureInspector(city: City, t: Tile) {
  const s = t.services, b = t.building, effective = effectiveServices(t), a = t.infrastructure;
  let html = a ? `<h3>${INFRASTRUCTURE[a.kind].name}</h3><dl>${row('Condition', pct(a.condition))}${row('Status', a.failedUntil > city.tick ? 'Temporarily failed' : s.floodDepth >= 90 ? 'Inundated' : 'Operating')}${row('Age', `${city.tick - a.builtAt} days`)}${row('Base monthly cost', compactMoney(INFRASTRUCTURE[a.kind].operatingCost))}${a.kind === 'water-tower' ? row('Stored water', `${number(a.storedWater)} m³`) : ''}</dl>` : '';
  html += `<h3>Local infrastructure</h3><dl>${row('Power · public / effective', `${pct(s.powerReliability)} / ${pct(effective.power)}`)}${row('Power coverage', pct(s.powerCoverage))}${row('Power demand', `${number(s.powerDemand)} MW`)}${row('Generator usage', pct(b?.generator ?? 0))}${row('Water · public / effective', `${pct(s.waterReliability)} / ${pct(effective.water)}`)}${row('Water coverage', pct(s.waterCoverage))}${row('Water demand', `${number(s.waterDemand)} m³/day`)}${row(b?.privateBorehole ? 'Private borehole / tank usage' : 'Private tank usage', pct(b?.privateWater ?? 0))}${row('Drainage capacity', `${number(s.drainageCapacity)} mm/day`)}${row('Rain runoff', `${number(s.runoff)} mm/day`)}${row('Drainage', s.drainageCapacity === 0 ? 'None' : s.drainageQuality >= 80 ? 'Good' : s.drainageQuality >= 40 ? 'Stressed' : 'Poor')}${row('Flood risk', `${s.floodRisk} / 100 · ${s.floodRisk >= 65 ? 'HIGH' : s.floodRisk >= 35 ? 'MODERATE' : 'LOW'}`)}${row('Flood state', `${s.floodStage} · ${number(s.floodDepth)} mm`)}${row('Elevation', `${number(s.elevation)} m`)}${row('River distance', `${number(s.waterDistance)} tiles`)}${row('Previous flood events', String(s.floodEvents))}${row('Economic recovery', `${s.recovery} days`)}</dl><p class="hint">Low elevation, proximity to water and paving increase runoff risk. Vegetation absorbs rain. Public drains remove accumulated water; generators add cost, noise and local pollution.</p>`;
  if (b && b.level < 5) {
    const next = densityRequirements(b.level + 1);
    html += `<p class="hint">Level ${b.level + 1} needs power ≥${next.power}%, water ≥${next.water}% and drainage ≥${next.drainage}%. Level 3+ requires public services; private alternatives cannot enable towers alone.</p>`;
  }
  if (b?.floodClosed) html += '<p class="warning">Temporarily closed by major flooding. The business remains here and can reopen when water recedes.</p>';
  if (t.road) html += `<dl>${row('Road condition', pct(s.roadCondition))}${row('Road access', s.floodDepth >= 90 ? 'Blocked by major flood' : s.roadCondition < 20 ? 'Impassable from deferred maintenance' : 'Accessible')}</dl>`;
  return html;
}
export function weatherPanel(city: City) {
  return `<p>${escapeHtml(city.weather.kind.replaceAll('-', ' '))} · ${city.weather.season} season · ${city.weather.rainfall.toFixed(0)} mm/day.</p><p>Daily service sample: ${city.weather.hour}:00. Seasons and storms use the city seed. Infrastructure continues operating while you are away.</p>${city.infrastructure.alerts.map(a => `<p class="warning">${escapeHtml(a)}</p>`).join('')}<h3>Recent infrastructure events</h3><ul class="return-events">${city.infrastructure.recentEvents.slice(0, 8).map(e => `<li>Day ${e.tick + 1}: ${escapeHtml(e.text)}</li>`).join('')}</ul>`;
}
