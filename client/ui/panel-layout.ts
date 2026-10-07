// Panel information architecture: what each panel shows first, and what sits in collapsible
// sections below. Presentation only — every number comes from existing city state.
import type { City, OfflineReport, Tile } from '../../shared/types/city';
import type { CityActivity } from '../../shared/types/living';
import { compactMoney, escapeHtml, inspectorHtml, statisticsHtml } from './panels';
import { transitInspector, transitSummary } from './transit-panels';
import { safetyInspector, safetySummary } from './safety-panels';
import { publicBudgets, publicInspector, publicOverlayButtons, publicSummary } from './public-service-panels';
import { infrastructureInspector, infrastructureOverlayButtons, infrastructureSummary } from './infrastructure-panels';
import { mobilityInspector, mobilitySummary } from './mobility-panels';
import { livingInspector, livingSummary } from './living-panels';
import { governanceInspector } from './governance-panels';

const pct = (v: number) => `${Math.round(v)}%`;
const row = (label: string, value: string | number) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
const sum = (values: Record<string, number> | undefined) => Object.values(values ?? {}).reduce((a, b) => a + b, 0);
/** "water-tower" → "Water tower"; raw state keys never reach the player in lower case. */
export const labelText = (key: string) => { const s = key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('-', ' ').replaceAll('_', ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };

/** Removes a fragment's leading <h3> so it can live under a section summary without repeating it. */
export function withoutLeadingHeading(html: string) { return html.replace(/^\s*<h3>[\s\S]*?<\/h3>/, ''); }
export function leadingHeading(html: string) { return html.match(/^\s*<h3>([\s\S]*?)<\/h3>/)?.[1].replace(/<[^>]+>/g, '') ?? ''; }
/** A collapsible panel section. `id` keeps its open/closed state across re-renders. */
export function collapsible(id: string, title: string, html: string, open = false, note = '') {
  return `<details class="panel-section" data-section="${id}"${open ? ' open' : ''}><summary><span>${title}</span>${note ? `<small>${note}</small>` : ''}</summary>${html}</details>`;
}
interface Figure { label: string; value: string; note?: string; tone?: 'good' | 'bad' }
export function keyFigures(figures: Figure[]) {
  return `<div class="key-figures">${figures.map(f => `<div class="key-figure${f.tone ? ` ${f.tone}` : ''}"><small>${escapeHtml(f.label)}</small><strong>${f.value}</strong>${f.note ? `<span>${f.note}</span>` : ''}</div>`).join('')}</div>`;
}

export function transportCosts(city: City) {
  const f = city.transit?.finance;
  return (f ? f.bus + f.brt + f.stations + f.terminals + f.depots : 0) + (city.mobility?.costs.buses ?? 0) + (city.mobility?.costs.administration ?? 0);
}

/** ECONOMY: money first — balance, where it comes from, where it goes. Transport finance is a sub-section. */
export function economyPanelHtml(city: City) {
  const balance = city.income - city.expenses;
  const fares = (city.transit?.finance.fares ?? 0) + (city.mobility?.costs.fares ?? 0);
  let html = keyFigures([
    { label: 'Treasury', value: compactMoney(city.treasury), tone: city.treasury < 0 ? 'bad' : undefined },
    { label: 'Monthly balance', value: `${balance >= 0 ? '+' : ''}${compactMoney(balance)}`, tone: balance < 0 ? 'bad' : 'good' },
    { label: 'Revenue / month', value: compactMoney(city.income) },
    { label: 'Expenses / month', value: compactMoney(city.expenses) },
  ]);
  if (balance < 0) html += `<p class="warning">${city.treasury <= 0 ? 'The treasury is in debt and spending still exceeds revenue.' : `Spending exceeds revenue by ${compactMoney(-balance)} a month. At this rate the treasury lasts about ${Math.max(0, Math.floor(city.treasury / -balance))} months.`}</p>`;
  html += `<h3>Where money comes from</h3><dl>${(['residential', 'commercial', 'industrial'] as const).map(z => row(`${labelText(z)} tax`, compactMoney(city.taxes[z]))).join('')}${row('Transport fares', compactMoney(fares))}${row('Total revenue', compactMoney(city.income))}</dl><button class="secondary" data-governance-tab="Taxes">Set tax rates · Govern ›</button>`;
  html += `<h3>Where money goes</h3><dl>${row('Utilities & infrastructure', compactMoney(sum(city.infrastructure.costs)))}${row('Public services', compactMoney(sum(city.publicServices?.costs)))}${row('Transport', compactMoney(transportCosts(city)))}${row('Governance programmes', compactMoney(city.governance?.programCost ?? 0))}${row('Total expenses', compactMoney(city.expenses))}</dl>`;
  const costs = { ...city.infrastructure.costs, ...city.publicServices.costs };
  html += collapsible('economy-budgets', 'Budgets & maintenance', `<label class="budget-label">Road maintenance <select data-budget="roads">${[0, 50, 100, 150].map(v => `<option value="${v}" ${city.infrastructure.maintenance.roads === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></label>${publicBudgets(city)}<button class="secondary" data-governance-tab="Budget">Infrastructure priorities · Govern ›</button>`);
  html += collapsible('economy-lines', 'Line-by-line costs', `<dl>${Object.entries(costs).map(([name, cost]) => row(`${labelText(name)} operations / maintenance`, compactMoney(cost))).join('')}</dl>`);
  html += collapsible('economy-transport', 'Transport finance', `<dl>${row('Public bus fares', compactMoney(city.mobility.costs.fares))}${row('Bus operations', compactMoney(city.mobility.costs.buses))}${row('Corridor administration', compactMoney(city.mobility.costs.administration))}</dl>${transitSummary(city)}`, false, compactMoney(transportCosts(city)) + ' / month');
  html += collapsible('economy-informal', 'Informal livelihoods', `<p>${city.living.informal.employed} workers · ${compactMoney(city.living.informal.output)} monthly output. Small formal tax contributions are included in commercial revenue.</p>`);
  return html + '<p class="hint">Taxes arrive automatically. Amounts are per 30-day month.</p>';
}

/** DATA: the city at a glance, then every detailed report in its own collapsible section. */
export function dataPanelHtml(city: City, lastReport: OfflineReport | null, activity: CityActivity) {
  const housingVacancy = city.vacantHousing / Math.max(1, city.housingCapacity) * 100;
  let html = keyFigures([
    { label: 'Population', value: city.population.toLocaleString(), note: `${city.growth >= 0 ? '+' : ''}${city.growth} / day` },
    { label: 'Jobs', value: city.jobs.toLocaleString(), note: `${pct(city.unemploymentRate)} unemployed`, tone: city.unemploymentRate >= 15 ? 'bad' : undefined },
    { label: 'Housing', value: `${pct(housingVacancy)} vacant`, note: `${city.vacantHousing.toLocaleString()} places free`, tone: housingVacancy < 5 ? 'bad' : undefined },
    { label: 'Satisfaction', value: pct(city.satisfaction), tone: city.satisfaction < 40 ? 'bad' : undefined },
    { label: 'Power', value: pct(city.infrastructure.power.reliability), note: 'reliability', tone: city.infrastructure.power.reliability < 70 ? 'bad' : undefined },
    { label: 'Water', value: pct(city.infrastructure.water.reliability), note: 'reliability', tone: city.infrastructure.water.reliability < 70 ? 'bad' : undefined },
    { label: 'Commute', value: `${city.mobility.stats.averageCommute.toFixed(1)} min`, note: 'average' },
    { label: 'Quality of life', value: pct(city.publicServices?.qualityOfLife ?? city.satisfaction) },
  ]);
  html += collapsible('data-growth', 'Growth & housing', statisticsHtml(city, lastReport), true);
  html += collapsible('data-maps', 'Map layers', `<div class="overlay-buttons"><button data-overlay="none">Normal</button><button data-overlay="land-value">Land value</button><button data-overlay="development">Development</button><button data-overlay="occupancy">Occupancy</button><button data-overlay="traffic">Traffic</button><button data-overlay="mobility">Mobility / routes</button></div>${infrastructureOverlayButtons()}${publicOverlayButtons()}`);
  html += collapsible('data-services', 'Services & quality of life', withoutLeadingHeading(publicSummary(city)));
  html += collapsible('data-utilities', 'Utilities & resilience', infrastructureSummary(city));
  html += collapsible('data-mobility', 'Mobility & traffic', mobilitySummary(city));
  html += collapsible('data-transit', 'Transit network', withoutLeadingHeading(transitSummary(city)), false, `${Math.round(city.transit.stats.ridership).toLocaleString()} daily boardings`);
  html += collapsible('data-safety', 'Safety', withoutLeadingHeading(safetySummary(city)));
  html += collapsible('data-life', 'Living city & City Feed', `<div id="living-content">${withoutLeadingHeading(livingSummary(city, activity))}</div>`);
  return html;
}

export type InspectorKind = 'stop' | 'facility' | 'infrastructure' | 'road' | 'building' | 'parcel' | 'land';
export function inspectorKind(city: City, t: Tile): InspectorKind {
  const id = t.y * city.size + t.x;
  if (city.transit?.stops.some(s => s.tileId === id)) return 'stop';
  if (t.publicFacility) return 'facility';
  if (t.infrastructure && !t.road && !t.building) return 'infrastructure';
  if (t.road) return 'road';
  if (t.building) return 'building';
  if (t.zone) return 'parcel';
  return 'land';
}
type SectionId = 'identity' | 'facility' | 'utilities' | 'services' | 'safety' | 'housing' | 'mobility' | 'transit' | 'life';
const ORDER: Record<InspectorKind, SectionId[]> = {
  stop: ['transit', 'mobility', 'utilities', 'safety', 'services', 'life', 'housing'],
  facility: ['facility', 'utilities', 'safety', 'mobility', 'life', 'housing', 'transit'],
  infrastructure: ['utilities', 'identity', 'safety', 'services', 'mobility', 'life', 'housing', 'transit'],
  road: ['mobility', 'transit', 'utilities', 'safety', 'life', 'identity', 'housing'],
  building: ['identity', 'utilities', 'services', 'safety', 'housing', 'mobility', 'life', 'transit'],
  parcel: ['identity', 'utilities', 'services', 'safety', 'housing', 'mobility', 'life', 'transit'],
  land: ['identity', 'utilities', 'services', 'safety', 'housing', 'mobility', 'life', 'transit'],
};
/** Order of inspector sections; the first is shown expanded, the rest collapse. */
export const inspectorOrder = (city: City, t: Tile) => ORDER[inspectorKind(city, t)];

/** Problems that change what the player should do with this tile, shown above everything else. */
export function tileWarnings(city: City, t: Tile) {
  const s = t.services, b = t.building, out: string[] = [];
  const occupied = !!b && b.constructionState === 'complete';
  if (b?.abandoned) out.push('Abandoned. The owners left; conditions here need to improve before anyone returns.');
  if (b?.floodClosed || s.floodDepth >= 35) out.push(`Flooded (${Math.round(s.floodDepth)} mm). Access and business are disrupted until the water drains.`);
  if (occupied && s.powerReliability < 35) out.push(`Unreliable power (${pct(s.powerReliability)}). Check generation and substation reach.`);
  if (occupied && s.waterReliability < 35) out.push(`Unreliable water (${pct(s.waterReliability)}). Check boreholes, towers and reach.`);
  if (t.publicFacility) { const f = city.publicServices.facilities.find(f => f.id === t.publicFacility); if (f && !f.active) out.push('This facility is switched off.'); else if (f && f.employeesAvailable < f.employeesRequired * 0.5) out.push(`Understaffed: ${f.employeesAvailable} of ${f.employeesRequired} staff.`); }
  return out.map(w => `<p class="warning">${escapeHtml(w)}</p>`).join('');
}

/** BUILDING / ROAD / SERVICE INSPECTOR: the selected thing first, related systems collapsed below. */
export function inspectorPanelHtml(city: City, t: Tile, activity: CityActivity) {
  const fragments: Record<SectionId, () => string> = {
    identity: () => (t.publicFacility ? '' : inspectorHtml(city, t)),
    facility: () => publicInspector(city, t),
    utilities: () => infrastructureInspector(city, t),
    services: () => (t.publicFacility ? '' : publicInspector(city, t)),
    safety: () => safetyInspector(city, t),
    housing: () => governanceInspector(city, t),
    mobility: () => mobilityInspector(city, t),
    transit: () => transitInspector(city, t),
    life: () => livingInspector(city, t, activity),
  };
  const titles: Record<SectionId, string> = { identity: 'Land & parcel', facility: 'Facility', utilities: 'Utilities', services: 'Public services', safety: 'Safety', housing: 'Housing & governance', mobility: 'Road & traffic', transit: t.road ? 'Transit & junctions' : 'Transit access', life: 'Local life' };
  const notes: Partial<Record<SectionId, string>> = { utilities: `Power ${pct(t.services.powerReliability)} · Water ${pct(t.services.waterReliability)}` };
  let html = tileWarnings(city, t);
  inspectorOrder(city, t).forEach((id, index) => {
    const fragment = fragments[id](); if (!fragment.trim()) return;
    const body = id === 'life' ? `<div id="living-content">${withoutLeadingHeading(fragment)}</div>` : fragment;
    if (index === 0) html += `<section class="inspector-primary" data-primary="${id}">${body}</section>`;
    else html += collapsible(`inspector-${id}`, titles[id], id === 'life' ? body : withoutLeadingHeading(body) || body, false, notes[id] ?? '');
  });
  return html;
}

/** SETTINGS (player): saving, help and display options only. Developer tools live in dev-panels.ts. */
export function settingsPanelHtml(graphicsQuality: string, rainQuality: string) {
  return `<div class="settings-actions"><button data-action="save">Save city</button><button data-action="load">Load saved city</button><button data-action="new">New city / reset</button><button data-action="intro">How to play</button></div><label class="budget-label">Graphics quality <select id="graphics-quality">${(['low', 'medium', 'high'] as const).map(q => `<option value="${q}" ${q === graphicsQuality ? 'selected' : ''}>${labelText(q)}</option>`).join('')}</select></label><label class="budget-label">Rain effects <select id="rain-quality">${(['normal', 'low', 'off'] as const).map(q => `<option value="${q}" ${q === rainQuality ? 'selected' : ''}>${labelText(q)}</option>`).join('')}</select></label><p class="hint">Your city saves on this device every 15 seconds. Each save is checked before it counts, and the last good save is kept as a backup. While you are away it keeps simulating for up to 24 real hours; long absences are simulated in coarser steps. Pause only affects active play.</p><p class="hint" id="save-status" role="status"></p>`;
}
