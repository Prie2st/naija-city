import { transitInspector, transitReportHtml, transitSummary } from './ui/transit-panels';
import { TRANSIT_FACILITIES, TRANSIT_OVERLAYS } from '../shared/simulation/transit-config';
import { previewTransitRoute, createTransitRoute, editTransitRoute, removeTransitRoute, buildBrtCorridor, improveJunction } from '../shared/simulation/transit';
import { invalidateTransit, transitNetworkDiagnostics } from '../shared/simulation/transit-network';
import { safetyInspector, safetySummary, SAFETY_OVERLAYS } from './ui/safety-panels';
import { triggerSafetyIncident, updateSafety } from '../shared/simulation/safety';
import { governancePanel, governanceInspector, GOVERNANCE_OVERLAYS } from './ui/governance-panels';
import { setTax, togglePolicy, setPriority, createDistrict, adoptNeighborhood, renameDistrict, analyzeGovernance } from '../shared/simulation/governance';
import type { PolicyId, Priority, ObjectiveId } from '../shared/types/governance';
import type { Zone } from '../shared/types/city';
import { PUBLIC_SERVICES, SERVICE_GROUPS, isPublicService } from '../shared/simulation/public-service-config';
import { updatePublicServices, triggerFire, makeFacility } from '../shared/simulation/public-services';
import { serviceTravelMap, serviceCacheDiagnostics } from '../shared/simulation/public-service-access';
import { publicSummary, publicBudgets, publicInspector, publicOverlayButtons, publicServicePanel } from './ui/public-service-panels';
import { mobilitySummary, transportPanel, mobilityInspector } from './ui/mobility-panels';
import { establishBus, formalizeRoute, updateMobility, changeBusFleet } from '../shared/simulation/mobility';
import { ROADS, waypointPath } from '../shared/simulation/road-network';
import { MOBILITY_DEBUG, mobilityDebug } from '../shared/simulation/mobility-debug';
import Phaser from 'phaser';
import { CityScene } from './game/CityScene';
import { gameConfig } from './game/game-config';
import type { GraphicsQuality } from './game/visual-style';
import { LocalCityRepository, type LoadResult, type SaveResult } from './persistence/storage';
import { advance, applyTool, catchUpInChunks, COSTS, createCity, previewTool, refreshCity, TICK_MS, tileAt } from '../shared/simulation/engine';
import type { Tool, Overlay, OfflineReport } from '../shared/types/city';
import { debugAction, type DebugAction } from '../shared/simulation/debug';
import { compactMoney, demandHtml, inspectorHtml, money, offlineHtml, statisticsHtml } from './ui/panels';
import './ui/style.css';
import { INFRASTRUCTURE } from '../shared/simulation/infrastructure-config';
import { updateInfrastructure } from '../shared/simulation/infrastructure';
import { infrastructureDebug, type InfrastructureDebug } from '../shared/simulation/infrastructure-debug';
import { infrastructureInspector, infrastructureSummary, infrastructureOverlayButtons, servicePanel, weatherPanel } from './ui/infrastructure-panels';
import { CityPulseTracker, pulseHtml } from './ui/city-pulse';
import { cityActivity } from '../shared/simulation/activity';
import { livingSummary, livingInspector, feedHtml, activityTime } from './ui/living-panels';

async function startGame() {

const repo = new LocalCityRepository();
let city = createCity(), tool: Tool = 'inspect', speed = 1, selected: number | null = null, accumulator = 0;
let preview: { x: number; y: number } | null = null;
let openPanel: string | null = null, showIntro = true, autosaveEnabled = true;
let overlay: Overlay = 'none', lastReport: OfflineReport | null = null, transitReportOpen = false;
let debugTarget: number | null = null;
let transportTab = 'overview', selectedRoute: string | null = null, busDraft: number[] | null = null;
let transitDraft:string[]|null=null, transitMode:'bus'|'brt'='bus', editingTransit:string|null=null, corridorDraft:number[]|null=null;
let governanceTab='Overview', districtId:string|null=null, districtDraft:number[]|null=null;
let catchingUp = false;
let saveFailingSince: number | null = null, lastSaveWarning = 0, recoveryNotice: string | null = null;
function recoveryText(loaded: LoadResult) {
  const when = loaded.savedAt ? ` from ${new Date(loaded.savedAt).toLocaleString()}` : '';
  return `Your latest save could not be read, so the ${loaded.source === 'backup' ? 'backup save' : 'older saved city'}${when} was restored. The unreadable copy is kept for diagnosis.`;
}
const pulse = new CityPulseTracker();
async function runCatchUp(target = city) {
  catchingUp = true;
  const app = document.getElementById('app')!;
  app.inert = true;
  const progress = document.createElement('div');
  progress.className = 'offline-progress';
  progress.setAttribute('role', 'status');
  progress.textContent = 'Your city kept living. Replaying the time away…';
  document.body.append(progress);
  try { return await catchUpInChunks(target, Date.now(), async (done, total) => { progress.textContent = `Your city kept living. Replaying the time away… ${Math.floor(done / Math.max(1, total) * 100)}%`; await new Promise<void>(resolve => setTimeout(resolve, 0)); }); }
  finally { catchingUp = false; app.inert = false; progress.remove(); }
}
let rainQuality: 'normal' | 'low' | 'off' = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : innerWidth < 600 ? 'low' : 'normal';
let graphicsQuality: GraphicsQuality = innerWidth < 600 ? 'medium' : 'high';
try { const q=localStorage.getItem('naija-city-graphics-quality'); if(q==='low'||q==='medium'||q==='high')graphicsQuality=q; } catch { /* Storage is optional for graphics preferences. */ }
let noticeTimer: ReturnType<typeof setTimeout>;
let initialMessage = 'Welcome, Governor. Extend the road and zone land beside it.';
try {
  const loaded = repo.loadWithReport(), saved = loaded?.city;
  if (loaded?.recovered) recoveryNotice = recoveryText(loaded);
  if (saved) {
    city = saved; showIntro = false;
    document.querySelector('#app')!.innerHTML = '<div class="loading-city glass" role="status">Your city kept living.<br>Simulating infrastructure, weather and development…</div>';
    const report = await runCatchUp();
    if (report.ticks) lastReport = report;
    initialMessage = recoveryNotice ?? (report.ticks ? `Welcome back · ${report.ticks} city days progressed. ${report.population.toLocaleString()} new residents; treasury change ${money(report.revenue)}. Catch-up is limited to 24 hours.` : 'Welcome back to Ilu Alafia.');
  }
} catch {
  autosaveEnabled = false;
  initialMessage = 'Saved city could not be read. Your old save is retained until you explicitly save.';
}

const toolButton = (value: Tool, label: string, description: string, icon: string) => `<button class="tool ${value}" data-tool="${value}" aria-pressed="${tool === value}"><span>${icon}</span><div><b>${label}</b><small>${description}</small></div></button>`;
const categories = [['roads', '╋', 'Roads'], ['zones', '▧', 'Zones'], ['services', '⌂', 'Services'], ['transport', '⇄', 'Transport'], ['economy', '₦', 'Economy'], ['data', '▥', 'Data']];
let activity = cityActivity(city, 6), activityHourOverride: number | null = null;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="world" aria-label="City map"><div id="game"></div></main>
  <header class="hud glass" aria-label="City statistics">
    <div class="city-name"><span class="brand-mark">N↗</span><div><small>NAIJA CITY</small><strong id="city-name"></strong></div></div>
    <div class="stat"><small>POPULATION</small><strong id="population"></strong></div>
    <div class="stat treasury"><small>TREASURY</small><strong id="treasury"></strong></div>
    <div class="stat calendar"><small>CITY CALENDAR</small><strong id="date"></strong></div>
    <div class="stat satisfaction"><small>SATISFACTION</small><strong id="satisfaction"></strong></div>
    <div class="hud-actions"><button id="pulse-chip" aria-label="City Pulse" aria-expanded="false"><span>◉</span><b id="pulse-count">0</b></button><button class="icon-button" id="settings" aria-label="Settings" aria-expanded="false">⚙</button></div>
  </header>
  <button id="demand-chip" class="demand-chip glass" aria-label="Residential, Commercial and Industrial demand. Open statistics"><span class="residential" title="Residential demand">RES <b id="demand-r"></b><i><em id="demand-bar-r"></em></i></span><span class="commercial" title="Commercial demand">COM <b id="demand-c"></b><i><em id="demand-bar-c"></em></i></span><span class="industrial" title="Industrial demand">IND <b id="demand-i"></b><i><em id="demand-bar-i"></em></i></span></button>
  <button id="weather-chip" class="weather-chip glass" aria-label="Weather and infrastructure events"></button>
  <div id="overlay-legend" class="overlay-legend glass" hidden><strong id="overlay-name"></strong><span><b id="legend-low">Low</b><i></i><b id="legend-high">High</b></span><button id="clear-overlay" aria-label="Close data overlay">×</button></div>
  <div class="camera-controls glass" aria-label="Map camera"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="home" aria-label="Frame developed city" title="Home · frame developed city">⌖</button></div>
  <div class="clock glass" aria-label="Simulation speed"><button data-speed="0" aria-label="Pause" aria-pressed="false">Ⅱ</button><button data-speed="1" aria-pressed="true">1×</button><button data-speed="2" aria-pressed="false">2×</button><button data-speed="4" aria-pressed="false">4×</button></div>
  <div id="notice" class="notice" role="status" hidden></div>
  <div id="placement" class="placement glass" hidden><div><strong id="tool-name"></strong><small id="placement-description"></small></div><button id="commit" hidden>Build tile</button><button id="explore" aria-label="Exit construction mode">Done</button></div>
  <section id="panel" class="panel glass" aria-labelledby="panel-title" hidden><div class="panel-heading"><div><small id="panel-kicker"></small><h2 id="panel-title"></h2></div><button id="close-panel" class="icon-button" aria-label="Close panel">×</button></div><div id="panel-content"></div></section>
  <nav class="toolbar glass" aria-label="Game tools">${categories.map(([value, icon, label]) => `<button data-category="${value}" aria-expanded="false" aria-controls="panel"><span>${icon}</span><b>${label}</b></button>`).join('')}</nav>
  <dialog id="intro"><span class="eyebrow">ILU ALAFIA · YOUR FIRST CHAPTER</span><h1>A city of its own.</h1><p>You plan and govern. Your city develops itself.</p><ol><li>Extend roads and zone homes, shops and workshops.</li><li>Balance housing and jobs; watch private construction.</li><li>Provide power, water and drainage as the city grows.</li></ol><p class="intro-controls">Drag to explore · scroll or pinch to zoom.<br>Inspect parcels to learn why they develop or wait.<br>On touch, preview a tile and confirm, or drag to paint.</p><button id="start" class="primary">Let's build a city <span>↗</span></button></dialog>`;

const panel = document.getElementById('panel')!;
const content = document.getElementById('panel-content')!;
const intro = document.querySelector<HTMLDialogElement>('#intro')!;
function message(text: string, duration = 6000) {
  const el = document.getElementById('notice')!; el.textContent = text; el.hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { el.hidden = true; }, duration);
}
const scene = new CityScene(() => city, () => tool, (x, y, paint) => {
  if(transitDraft&&!paint){const stop=city.transit.stops.find(s=>s.tileId===y*city.size+x&&s.kind!=='bus-depot');if(!stop){message('Tap an existing passenger stop/station. Place stops from Transport first.');return;}if(transitDraft.length>=16){message('Up to sixteen ordered stops.');return;}if(!transitDraft.includes(stop.id))transitDraft.push(stop.id);scene.setSelected({x,y});scene.setRoutePreview(transitDraft.map(id=>city.transit.stops.find(s=>s.id===id)!.anchor));renderPlacement();return;}
  if(corridorDraft&&!paint){const t=tileAt(city,x,y);if(!t?.road){message('Tap an avenue or major road.');return;}corridorDraft.push(y*city.size+x);if(corridorDraft.length>8)corridorDraft.shift();scene.setRoutePreview(corridorDraft);renderPlacement();return;}
  if(districtDraft&&!paint){const id=y*city.size+x;if(!city.tiles[id])return;districtDraft.push(id);if(districtDraft.length>2)districtDraft.shift();const ids=districtArea();scene.setServicePreview(ids);scene.setSelected({x,y});renderPlacement();return;}
  if (busDraft && !paint) {
    const tile = tileAt(city, x, y);
    if (!tile?.road) { message('Select a road tile for the bus stop.'); return; }
    const id = y * city.size + x;
    if (busDraft.length >= 8) { message('Up to eight stops. Finish or undo your plan.'); return; }
    if (busDraft.at(-1) !== id) busDraft.push(id);
    scene.setSelected({ x, y }); scene.setRoutePreview(busDraft); renderPlacement(); return;
  }
  if (paint) {
    const error = applyTool(city, x, y, tool);
    if (error) message(error);
    scene.redraw(); renderUI(); renderPlacement();
    return;
  }
  const t = tileAt(city, x, y);
  if (t && (city.transit.stops.some(s=>s.tileId===y*city.size+x) || t.publicFacility || t.building || t.zone || t.road || t.infrastructure || city.living.markets.some(m => m.tileId === y * city.size + x) || overlay !== 'none')) {
    debugTarget = y * city.size + x;
    selected = y * city.size + x; scene.setSelected({ x, y }); displayPanel('inspector');
  } else closePanel();
}, (x, y) => {
  preview = tileAt(city, x, y) ? { x, y } : null;
  renderPlacement();
});
scene.setGraphicsQuality(graphicsQuality);
new Phaser.Game(gameConfig(scene, graphicsQuality));
// Development-only probe for browser QA (tap a tile, focus the camera). Vite removes it from builds.
if (import.meta.env.DEV) Object.assign(window, { naijaQA: { tileScreen: (x: number, y: number) => scene.tileScreen(x, y), focusTile: (x: number, y: number) => scene.focusTile(x, y), city: () => city } });

function clearSelection() { selected = null; scene.setSelected(null); }
function closePanel() {
  openPanel = null; panel.hidden = true; scene.setServicePreview([]); clearSelection(); syncCategories();
}
function syncCategories() {
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.category === openPanel || b.dataset.category === 'services' && openPanel?.startsWith('services-'))));
  document.getElementById('settings')!.setAttribute('aria-expanded', String(openPanel === 'settings'));
  document.getElementById('pulse-chip')!.setAttribute('aria-expanded', String(openPanel === 'pulse'));
}
function displayPanel(category: string) {
  if (category !== 'inspector') clearSelection();
  openPanel = category; panel.hidden = false; renderPanel(); syncCategories();
}
function renderPanel() {
  if (!openPanel) return;
  let title = '', kicker = 'GOVERNOR’S DESK', html = '';
  if (openPanel === 'roads') {
    title = 'Connect your city'; kicker = 'ROADS';
    html = transportPanel(city, 'roads', null) + toolButton('bulldoze', 'Clear tile', money(COSTS.bulldoze), '×');
  } else if (openPanel === 'zones') {
    title = 'Make room to grow'; kicker = 'ZONING';
    html = `${demandHtml(city)}<p>Zone land, then watch. Demand and local conditions attract developers; construction takes 9–12 days after queueing.</p>${toolButton('residential', 'Residential', `Homes & compound housing · ${money(COSTS.residential)}`, '⌂')}${toolButton('commercial', 'Commercial', `Shops & businesses · ${money(COSTS.commercial)}`, '▤')}${toolButton('industrial', 'Industrial', `Workshops & factories · ${money(COSTS.industrial)}`, '▥')}`;
  } else if (openPanel.startsWith('services')) {
    title = openPanel === 'services' ? 'Infrastructure' : openPanel.slice(9); kicker = 'SERVICES & RESILIENCE'; html = servicePanel(city, openPanel);
  } else if (openPanel === 'weather') {
    title = 'Weather & warnings'; kicker = 'RESILIENCE'; html = weatherPanel(city);
  } else if (openPanel === 'pulse') {
    title = 'City Pulse'; kicker = 'PROBLEMS & OPPORTUNITIES'; html = pulseHtml(pulse);
  } else if (openPanel === 'transport') {
    title = 'The living street'; kicker = 'TRANSPORT'; html = transportPanel(city, transportTab, selectedRoute);
  } else if(openPanel==='governance'){title='City governance';kicker='PLAN & GOVERN';html=governancePanel(city,governanceTab,districtId);
  } else if (openPanel === 'economy') {
    title = 'City treasury'; kicker = 'ECONOMY';
    const costs = {...city.infrastructure.costs,...city.publicServices.costs};
    html = transitSummary(city) + `<p>Taxes arrive automatically. Infrastructure has fuel, operating and maintenance costs. Rates are per 30-day month.</p><dl><div><dt>Treasury</dt><dd>${money(city.treasury)}</dd></div>${(['residential', 'commercial', 'industrial'] as const).map(z => `<div><dt>${z} tax</dt><dd>${compactMoney(city.taxes[z])}</dd></div>`).join('')}<div><dt>Monthly revenue</dt><dd>${compactMoney(city.income)}</dd></div>${Object.entries(costs).map(([name, cost]) => `<div><dt>${name} operations / maintenance</dt><dd>${compactMoney(cost)}</dd></div>`).join('')}<div><dt>Public bus fares</dt><dd>${compactMoney(city.mobility.costs.fares)}</dd></div><div><dt>Bus operations</dt><dd>${compactMoney(city.mobility.costs.buses)}</dd></div><div><dt>Corridor administration</dt><dd>${compactMoney(city.mobility.costs.administration)}</dd></div><div><dt>Monthly expenses</dt><dd>${compactMoney(city.expenses)}</dd></div><div class="net"><dt>Monthly balance</dt><dd>${compactMoney(city.income - city.expenses)}</dd></div><div><dt>Monthly private output</dt><dd>${compactMoney(city.economicOutput)}</dd></div></dl><label class="budget-label">Road maintenance <select data-budget="roads">${[0, 50, 100, 150].map(v => `<option value="${v}" ${city.infrastructure.maintenance.roads === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></label>`;
  } else if (openPanel === 'data') {
    title = 'Your city’s story'; kicker = 'DATA';
    html = transitSummary(city) + safetySummary(city) + publicOverlayButtons() + publicSummary(city) + infrastructureOverlayButtons() + statisticsHtml(city, lastReport) + infrastructureSummary(city) + mobilitySummary(city) + '<button data-overlay="traffic">Traffic</button><button data-overlay="mobility">Mobility / routes</button>';
    html += `<div id="living-content">${livingSummary(city, activity)}</div>`;
  } else if (openPanel === 'feed') {
    title = 'City Feed'; kicker = 'PLACES & PEOPLE'; html = feedHtml(city);
  } else if (openPanel === 'settings') {
    title = 'City settings'; kicker = 'SAVE & PLAY';
    const transitDebugHtml=`<h3>Transit diagnostics</h3>${TRANSIT_OVERLAYS.map(o=>`<button data-overlay="${o}">${o}</button>`).join('')}${['demand','crowding','congestion','flood','cache','report'].map(a=>`<button data-transit-debug="${a}">${a}</button>`).join('')}${transitReportOpen?transitReportHtml(city):''}`;
    const debugTools: [DebugAction, string][] = [['demand-residential', 'Increase Residential Demand'], ['demand-commercial', 'Increase Commercial Demand'], ['demand-industrial', 'Increase Industrial Demand'], ['development', 'Force Development Tick'], ['complete', 'Complete Construction'], ['upgrade', 'Force Building Upgrade'], ['close-business', 'Force Business Closure'], ['unemployment', 'Create Unemployment'], ['boost', 'Boost Economy'], ['month', 'Advance 1 Month'], ['year', 'Advance 1 Year']];
    const infraTools: [InfrastructureDebug, string][] = [['light-rain', 'Trigger Light Rain'], ['heavy-rain', 'Trigger Heavy Rain'], ['extreme-rain', 'Trigger Extreme Rain'], ['end-rain', 'End Rain'], ['power-demand', 'Set Power Demand +25%'], ['plant-failure', 'Cause Power Plant Failure'], ['restore-power', 'Restore Power Infrastructure'], ['water-demand', 'Set Water Demand +25%'], ['water-shortage', 'Cause Water Shortage'], ['flood-tile', 'Flood Selected Tile'], ['clear-floods', 'Clear Flooding'], ['drainage-capacity', 'Set Drainage Capacity · 1× / 2×'], ['damage-infrastructure', 'Damage Infrastructure'], ['repair-infrastructure', 'Repair Infrastructure']];
    html = `<div class="settings-actions"><button data-action="save">Save city</button><button data-action="load">Load saved city</button><button data-action="new">New city / reset</button><button data-action="intro">How to play</button></div><label class="budget-label">Graphics quality <select id="graphics-quality">${(['low', 'medium', 'high'] as const).map(q => `<option value="${q}" ${q === graphicsQuality ? 'selected' : ''}>${q}</option>`).join('')}</select></label><label class="budget-label">Rain effects <select id="rain-quality">${(['normal', 'low', 'off'] as const).map(q => `<option value="${q}" ${q === rainQuality ? 'selected' : ''}>${q}</option>`).join('')}</select></label><p class="hint">Version 9 saves are compact and verified, with one backup copy. Versions 1–8 migrate automatically. Autosave: 15 seconds. Offline catch-up: 24 real hours, with long absences approximated. Pause only affects active play.</p><p class="hint" id="save-status" role="status"></p><details${transitReportOpen?' open':''}><summary>Developer controls</summary>${transitDebugHtml}<div class="debug-tools">${debugTools.map(([action, label]) => `<button class="secondary" data-debug="${action}">${label}</button>`).join('')}${MOBILITY_DEBUG.map(action => `<button class="secondary" data-mobility-debug="${action}">${action}</button>`).join('')}<button data-mobility-view="od">Show OD Demand</button><button data-mobility-view="graph">Show Road Graph</button><button data-mobility-view="capacity">Show Segment Capacity</button><button data-action="vehicle-count">Show Representative Vehicle Count</button>${(['bounds','anchors','depth','lod','shadows','props','vegetation','weather'] as const).map(v => `<button data-graphics-toggle="${v}">Toggle ${v === 'bounds' ? 'tile bounds' : v === 'anchors' ? 'object anchors' : v === 'depth' ? 'depth order' : v === 'lod' ? 'LOD level' : v === 'weather' ? 'weather effects' : v}</button>`).join('')}<button data-action="graphics-count">Show sprite / visible object count</button><button data-action="graphics-count">Show texture atlas usage / performance</button>${infraTools.map(([action, label]) => `<button class="secondary" data-infra-debug="${action}">${label}</button>`).join('')}${(['development', 'land-value', 'occupancy', 'power', 'water', 'drainage', 'flood-risk'] as Overlay[]).map(o => `<button class="secondary" data-overlay="${o}">Show ${o.replaceAll('-', ' ')} overlay</button>`).join('')}<button class="secondary" data-overlay="none">Clear infrastructure overlays</button></div><p class="hint">Flood Selected Tile uses the last inspected tile${debugTarget === null ? ' (none yet)' : ` (${debugTarget % city.size}, ${Math.floor(debugTarget / city.size)})`}. These actions change the saved simulation.</p></details>`;
  } else if (openPanel === 'offline') {
    title = 'Welcome back'; kicker = 'YOUR CITY KEPT LIVING'; html = lastReport ? offlineHtml(lastReport) : '<p>No offline changes yet.</p>';
  } else if (openPanel === 'inspector') {
    const t = selected === null ? null : city.tiles[selected];
    if (!t) { closePanel(); return; }
    kicker = `TILE ${t.x}, ${t.y}`;
    title = t.publicFacility ? city.publicServices.facilities.find(f=>f.id===t.publicFacility)!.name : t.building ? t.building.name : t.infrastructure ? INFRASTRUCTURE[t.infrastructure.kind].name : t.road ? ROADS[t.roadClass ?? 'local'].name : t.zone ? `${t.zone} parcel` : 'Land & resilience';
    html = transitInspector(city, city.tiles[selected!]) + safetyInspector(city,t) + publicInspector(city,t) + (t.publicFacility?'':inspectorHtml(city, t)) + infrastructureInspector(city, t) + mobilityInspector(city, t);
    html += `<div id="living-content">${livingInspector(city, t, activity)}</div>`;
    html += `<button class="secondary" data-tool="bulldoze">Clear tool · ${money(COSTS.bulldoze)}</button>`;
  }
  document.getElementById('panel-title')!.textContent = title;
  if (openPanel === 'transport' && transportTab === 'overview') html += `<div id="living-content">${livingSummary(city, activity)}</div>`;
  if (openPanel === 'economy' || openPanel === 'data' || openPanel === 'settings') html = '<button data-governance-tab="Overview">City governance · budget, policies & districts</button>'+html;
  if (openPanel === 'inspector' && selected!==null) html+=governanceInspector(city,city.tiles[selected]);
  if (openPanel === 'economy') html += publicBudgets(city);
  if (openPanel === 'economy') html += `<h3>Informal livelihoods</h3><p>${city.living.informal.employed} workers · ${compactMoney(city.living.informal.output)} monthly output. Small formal tax contributions are included in commercial revenue.</p>`;
  if (openPanel === 'settings') {
    if(import.meta.env.DEV)html+=`<details><summary>Safety diagnostics</summary><div class="debug-tools">${SAFETY_OVERLAYS.map(o=>`<button data-overlay="${o}">Show ${o.replaceAll('-',' ')}</button>`).join('')}${['minor','moderate','serious'].map(v=>`<button data-safety-debug="${v}">Force ${v} incident at selected tile</button>`).join('')}</div><p>Seeded incident generation · ${city.safety.totalIncidents} total · ${city.safety.seriousIncidents} serious · ${city.safety.resolvedIncidents} resolved · ${city.safety.metrics.incidents30Days} during the last 30 days.</p></details>`;
    if(import.meta.env.DEV)html+=`<details><summary>Governance diagnostics</summary><div class="debug-tools">${GOVERNANCE_OVERLAYS.map(o=>`<button data-overlay="${o}">${o.replaceAll('-',' ')}</button>`).join('')}<button data-governance-tab="Housing">Housing supply / affordability / income</button><button data-governance-tab="Budget">Spending and maintenance</button></div></details>`;
    if(import.meta.env.DEV)html+=`<details><summary>Public service diagnostics</summary><div class="debug-tools">${["education-demand","education-capacity","healthcare-demand","healthcare-capacity","fire-response","waste-generation","waste-collection","park-access","quality-of-life","accessibility","clear"].map(v=>`<button data-public-view="${v}">Show ${v.replaceAll("-"," ")}</button>`).join("")}${['education','healthcare','fire','waste','parks','quality-of-life'].map(o=>`<button data-overlay="${o}">Show ${o}</button>`).join('')}${[['fire','Trigger selected building fire'],['waste','Increase selected waste backlog'],['staff','Fill facility staff for testing'],['repair','Repair facilities'],['access','Show cached service access diagnostics']].map(([a,n])=>`<button data-public-debug="${a}">${n}</button>`).join('')}</div><p class="hint">Education shows seats, healthcare shows visit demand, fire shows response reach, waste shows collection and parks show recreation. Inspector exposes capacity separately.</p></details>`;

    if (import.meta.env.DEV) html += `<details><summary>Living city diagnostics</summary><label class="budget-label">Activity hour <select id="activity-hour"><option value="auto" ${activityHourOverride === null ? 'selected' : ''}>Simulation clock</option>${[0,6,8,13,17,20].map(h => `<option value="${h}" ${activityHourOverride === h ? 'selected' : ''}>${activityTime(h)}</option>`).join('')}</select></label><div class="debug-tools">${[['activity','Show activity scores'],['network','Show pedestrian network'],['od','Show commuter OD'],['traffic','Show vehicle flow'],['mobility','Show transit demand'],['neighborhoods','Show neighborhood boundaries'],['business','Show business health'],['markets','Show market attraction'],['informal','Show informal housing pressure']].map(([view,label])=>`<button data-living-view="${view}">${label}</button>`).join('')}<button data-action="living-count">Representative agent diagnostics</button><button data-living-view="clear">Clear living diagnostics</button></div></details>`;
  }
  document.getElementById('panel-kicker')!.textContent = kicker;
  content.innerHTML = html; if (openPanel === 'settings') renderSaveStatus();
  document.querySelectorAll<HTMLButtonElement>('[data-overlay]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.overlay === overlay)));
  if (openPanel === 'data') document.getElementById('journal')!.replaceChildren(...city.history.slice(0, 6).map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
}
function renderUI() {
  const set = (id: string, value: string) => { document.getElementById(id)!.textContent = value; };
  set('city-name', city.name); set('population', city.population.toLocaleString()); set('treasury', compactMoney(city.treasury));
  set('date', `D${city.tick % 30 + 1} · M${Math.floor(city.tick / 30) + 1} · ${activityTime(activity.hour)}`);
  set('satisfaction', `${Math.round(city.satisfaction)}%`);
  pulse.update(city);
  set('pulse-count', String(pulse.active.length));
  document.getElementById('pulse-chip')!.setAttribute('aria-label', `City Pulse · ${pulse.active.length} active problems and opportunities`);
  document.getElementById('pulse-chip')!.dataset.severity = pulse.active[0]?.severity ?? 'none';
  const weather = document.getElementById('weather-chip')!;
  const warnings = city.infrastructure.alerts.length;
  weather.innerHTML = `<span>${city.weather.kind.replaceAll('-', ' ')} • ${city.weather.season} season</span><small>${warnings ? `${warnings} infrastructure/weather warning${warnings === 1 ? '' : 's'}` : 'No active weather warnings'}</small>`;
  weather.setAttribute('aria-label', `${city.weather.kind.replaceAll('-', ' ')}, ${city.weather.season} season. ${warnings} infrastructure and weather warnings. Open details.`);
  for (const [short, zone] of [['r', 'residential'], ['c', 'commercial'], ['i', 'industrial']] as const) {
    set(`demand-${short}`, String(city.demand[zone]));
    document.getElementById(`demand-bar-${short}`)!.style.width = `${city.demand[zone]}%`;
  }
  if (['governance', 'inspector', 'economy', 'data', 'zones', 'weather', 'services', 'pulse', 'transport', 'feed'].includes(openPanel ?? '') || openPanel?.startsWith('services-')) renderPanel();
}

function districtArea():number[]{if(!districtDraft?.length)return [];const a=city.tiles[districtDraft[0]],b=city.tiles[districtDraft.at(-1)!];return city.tiles.flatMap((t,id)=>t.x>=Math.min(a.x,b.x)&&t.x<=Math.max(a.x,b.x)&&t.y>=Math.min(a.y,b.y)&&t.y<=Math.max(a.y,b.y)?[id]:[]);}
function renderPlacement() {
  const el = document.getElementById('placement')!; el.hidden = tool === 'inspect' && !busDraft && !transitDraft && !corridorDraft;
  if(transitDraft){const check=previewTransitRoute(city,transitMode,transitDraft);document.getElementById('tool-name')!.textContent=`${transitMode.toUpperCase()} · ${transitDraft.length} stops`;document.getElementById('placement-description')!.textContent=check.error||'Tap more stops, or complete the service. Depot capacity is required.';const b=document.getElementById('commit')!;b.hidden=!!check.error;b.textContent=editingTransit?'Update route':'Complete route';return;}
  if(corridorDraft){document.getElementById('tool-name')!.textContent='Dedicated BRT corridor';document.getElementById('placement-description')!.textContent='Tap corridor start, optional waypoints, then end. ₦1.8M per new road segment.';const b=document.getElementById('commit')!;b.hidden=corridorDraft.length<2;b.textContent='Build dedicated lanes';return;}
  if(districtDraft){el.hidden=false;document.getElementById('tool-name')!.textContent='District boundary';document.getElementById('placement-description')!.textContent=`Tap two corners · ${districtArea().length} tiles selected`;const b=document.getElementById('commit')!;b.hidden=districtDraft.length<2;b.textContent='Create district';return;}
  if (busDraft) {
    const valid = busDraft.length >= 2 && waypointPath(city, busDraft);
    document.getElementById('tool-name')!.textContent = `Bus plan · ${busDraft.length} stops`;
    document.getElementById('placement-description')!.textContent = valid ? 'Tap more roads for waypoints, or establish the service.' : 'Tap start and end roads on one connected network.';
    const commit = document.getElementById('commit')!; commit.hidden = !valid; commit.textContent = 'Establish · ₦24M+'; return;
  }
  if (tool === 'inspect') return;
  const names = { road: 'Local road', 'dirt-road': 'Dirt road', avenue: 'Avenue', 'major-road': 'Major road', residential: 'Residential zone', commercial: 'Commercial zone', industrial: 'Industrial zone', bulldoze: 'Clear tile', ...Object.fromEntries(Object.entries(TRANSIT_FACILITIES).map(([k,d])=>[k,d.name])), ...Object.fromEntries(Object.entries(INFRASTRUCTURE).map(([k, d]) => [k, d.name])),...Object.fromEntries(Object.entries(PUBLIC_SERVICES).map(([k,d])=>[k,d.name])) } as Record<Exclude<Tool, 'inspect'>, string>;
  document.getElementById('tool-name')!.textContent = names[tool];
  const check = preview ? previewTool(city, preview.x, preview.y, tool) : null;
  el.dataset.status = check?.status ?? 'valid';
  const reached=preview&&isPublicService(tool)&&check?.status==='valid'?serviceTravelMap(city,makeFacility(city,preview.y*city.size+preview.x,tool)):null;
  scene.setServicePreview(reached?city.tiles.flatMap((_t,id)=>reached[id]<PUBLIC_SERVICES[tool as keyof typeof PUBLIC_SERVICES].minutes?[id]:[]):[]);
  const estimate=reached?city.tiles.reduce((sum,t,id)=>sum+(reached[id]<PUBLIC_SERVICES[tool as keyof typeof PUBLIC_SERVICES].minutes?(t.building?.occupants??0):0),0):null;
  document.getElementById('placement-description')!.textContent = check ? `${check.reason} ${estimate!==null?`${estimate.toLocaleString()} residents in travel reach. `:""}${check.cost ? money(check.cost) : ''}` : 'Tap to preview and confirm, or drag to paint.';
  const commit = document.getElementById('commit')!; commit.hidden = !preview || check?.status !== 'valid'; commit.textContent = 'Build tile';
}
function chooseTool(next: Tool) {
  transitDraft=null;corridorDraft=null;editingTransit=null;districtDraft=null;scene.setServicePreview([]);busDraft = null; scene.setRoutePreview(null); tool = next; preview = null; closePanel(); scene.clearPreview(); renderPlacement();
}
function setOverlay(next: Overlay) {
  overlay = next;scene.setPublicServiceDebug(null); scene.setDebugVisual(null); scene.setOverlay(next);
  const legend = document.getElementById('overlay-legend')!; legend.hidden = next === 'none';
  document.getElementById('overlay-name')!.textContent = next === 'transit-accessibility' ? 'transit access · poor, weak, good, excellent' : next.replaceAll('-', ' ');
  document.getElementById('legend-low')!.textContent = next === 'transit-accessibility' ? 'Poor' : next === 'jobs-accessible' ? 'Few jobs' : next === 'crime-pressure' ? 'High pressure' : next === 'response-time' ? 'Slow / none' : next === 'mobility' ? 'Routes / stops' : ['housing-pressure','cost-of-living'].includes(next) ? 'High burden' : next === 'traffic' ? 'Busy' : next === 'flood-risk' ? 'High risk' : ['power', 'water', 'drainage'].includes(next) ? 'None' : 'Low';
  document.getElementById('legend-high')!.textContent = next === 'transit-accessibility' ? 'Excellent' : next === 'jobs-accessible' ? 'Many jobs' : next === 'crime-pressure' ? 'Low pressure' : next === 'response-time' ? 'Prompt' : next === 'mobility' ? 'Hubs' : ['housing-pressure','cost-of-living'].includes(next) ? 'Low burden' : next === 'traffic' ? 'Free flow' : next === 'flood-risk' ? 'Low risk' : ['power', 'water', 'drainage'].includes(next) ? 'Good' : 'High';
  renderPanel();
}
function save(silent = false) {
  city.lastSimulatedTimestamp = Date.now();
  const result = repo.save(city, Date.now(), { fullVerify: !silent });
  if (result.ok) {
    autosaveEnabled = true;
    if (saveFailingSince !== null) message('Saving works again. Your city is saved on this device.', 8000);
    else if (!silent) message('City saved on this device.');
    saveFailingSince = null; lastSaveWarning = 0;
  } else {
    // A failed write never replaces the last good copy, so the warning says so and saving retries on the next autosave.
    saveFailingSince ??= Date.now();
    if (!silent || Date.now() - lastSaveWarning > 60000) { lastSaveWarning = Date.now(); message(saveFailureText(result), 20000); }
  }
  if (openPanel === 'settings') renderSaveStatus();
  return result.ok;
}
function saveFailureText(result: SaveResult) {
  const why = result.reason === 'storage-full' ? 'browser storage for this site is full' : result.reason === 'storage-unavailable' ? 'browser storage is unavailable (private browsing or blocked site data)' : result.reason === 'invalid-state' ? 'the city failed a safety check before writing' : 'the written save could not be verified';
  return `⚠ Your city was NOT saved: ${why}. Your last good save is kept and saving will retry automatically.`;
}
function renderSaveStatus() {
  const el = document.getElementById('save-status'); if (!el) return;
  const last = repo.lastSuccessAt ? new Date(repo.lastSuccessAt).toLocaleTimeString() : null;
  el.textContent = saveFailingSince !== null && repo.lastSave && !repo.lastSave.ok ? `${saveFailureText(repo.lastSave)}${last ? ` Last successful save: ${last}.` : ''}` : last ? `Last saved ${last}.` : 'Not saved yet this session.';
}
document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(b => b.onclick = () => { const category = b.dataset.category!; if (openPanel === category) closePanel(); else displayPanel(category); });
document.getElementById('settings')!.onclick = () => openPanel === 'settings' ? closePanel() : displayPanel('settings');
document.getElementById('pulse-chip')!.onclick = () => openPanel === 'pulse' ? closePanel() : displayPanel('pulse');
document.getElementById('demand-chip')!.onclick = () => displayPanel('data');
document.getElementById('weather-chip')!.onclick = () => displayPanel('weather');
document.getElementById('close-panel')!.onclick = closePanel;
document.getElementById('clear-overlay')!.onclick = () => setOverlay('none');
document.getElementById('explore')!.onclick = () => chooseTool('inspect');
document.getElementById('commit')!.onclick = () => {
  if(transitDraft){const error=editingTransit?editTransitRoute(city,editingTransit,{stops:transitDraft}):createTransitRoute(city,transitMode,transitDraft);if(error){message(error);return;}transitDraft=null;editingTransit=null;scene.setRoutePreview(null);updateMobility(city,false,true);refreshCity(city);scene.redraw();renderPlacement();renderUI();message('Route ready. Actual trips, depot capacity and fares determine ridership.');return;}
  if(corridorDraft){const error=buildBrtCorridor(city,corridorDraft);if(error){message(error);return;}corridorDraft=null;scene.setRoutePreview(null);updateMobility(city,false,true);refreshCity(city);scene.redraw();renderPlacement();renderUI();message('Dedicated lanes built. General road capacity is reduced during and after works.');return;}
  if(districtDraft){const error=createDistrict(city,districtArea(),`District ${city.governance.nextDistrictId}`);if(error){message(error);return;}districtId=city.governance.districts.at(-1)!.id;chooseTool('inspect');governanceTab='Districts';displayPanel('governance');scene.redraw();return;}
  if (busDraft) { const error = establishBus(city, busDraft); if (error) { message(error); return; } chooseTool('inspect'); transportTab = 'bus'; displayPanel('transport'); refreshCity(city); scene.redraw(); renderUI(); message('Public bus service established.'); return; }
  if (preview) { const error = applyTool(city, preview.x, preview.y, tool); if (error) message(error); scene.redraw(); renderUI(); renderPlacement(); }
};
content.addEventListener('click', async event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
  if(button.dataset.governanceTab){governanceTab=button.dataset.governanceTab;displayPanel('governance');return;}
  if(button.dataset.policy){message(togglePolicy(city,button.dataset.policy as PolicyId,button.dataset.policyScope||null)||'Policy decision recorded; implementation is gradual.');renderPanel();return;}
  if(button.dataset.adopt){message(adoptNeighborhood(city,Number(button.dataset.adopt))||'Neighborhood adopted; its existing identity is preserved.');districtId=city.governance.districts.at(-1)?.id??null;renderPanel();return;}
  if(button.dataset.district){districtId=button.dataset.district;governanceTab='Districts';displayPanel('governance');return;}
  if(button.dataset.districtPolicy){districtId=button.dataset.districtPolicy;governanceTab='Policies';displayPanel('governance');return;}
  if(button.hasAttribute('data-district-draw')){chooseTool('inspect');districtDraft=[];renderPlacement();message('Tap two corners to choose a district area. Drag to pan; no precise tracing needed.');return;}
  if(button.dataset.districtFocus){const d=city.governance.districts.find(d=>d.id===button.dataset.districtFocus);if(d){closePanel();scene.setServicePreview(d.tiles);const t=city.tiles[d.tiles[Math.floor(d.tiles.length/2)]];scene.focusTile(t.x,t.y);}return;}
  if(button.dataset.challenge){const c=city.governance.challenges.find(c=>c.id===button.dataset.challenge);if(c){closePanel();setOverlay(c.overlay);if(c.tileId!==null){selected=c.tileId;scene.setSelected(city.tiles[c.tileId]);scene.focusTile(city.tiles[c.tileId].x,city.tiles[c.tileId].y);}else{governanceTab=c.kind==='budget'?'Budget':c.kind==='housing'||c.kind==='affordability'?'Housing':'Overview';displayPanel('governance');}}return;}
  if(button.dataset.clearCommunity){const d=city.governance.districts.find(d=>d.id===button.dataset.clearCommunity);if(d){const tiles=d.tiles.filter(id=>city.tiles[id].building?.tenure!=='formal'&&city.tiles[id].building);const residents=tiles.reduce((s,id)=>s+city.tiles[id].building!.occupants,0);if(!confirm(`Clear ${tiles.length} informal properties? ${residents} residents will be displaced and need replacement housing. Clearance costs ${money(tiles.length*COSTS.bulldoze)}. Consider community upgrading instead.`))return;if(city.treasury<tiles.length*COSTS.bulldoze){message('Insufficient treasury for clearance.');return;}for(const id of tiles){const t=city.tiles[id];applyTool(city,t.x,t.y,'bulldoze');}analyzeGovernance(city,false);scene.redraw();renderUI();}return;}
  if(button.dataset.action==='economy'){displayPanel('economy');return;}
  if(button.dataset.serviceFocus){const id=Number(button.dataset.serviceFocus),t=city.tiles[id];closePanel();selected=id;debugTarget=id;scene.setSelected(t);scene.focusTile(t.x,t.y);displayPanel('inspector');return;}
  if(button.dataset.safetyFocus){const id=Number(button.dataset.safetyFocus);closePanel();selected=id;debugTarget=id;scene.setSelected(city.tiles[id]);scene.focusTile(city.tiles[id].x,city.tiles[id].y);displayPanel('inspector');return;}
  if(button.dataset.safetyDebug){if(debugTarget!==null){triggerSafetyIncident(city,debugTarget,button.dataset.safetyDebug as 'minor'|'moderate'|'serious');updateSafety(city,false);renderUI();scene.redraw();}return;}
  if(button.dataset.serviceActive){const f=city.publicServices.facilities.find(f=>f.id===button.dataset.serviceActive);if(f){f.active=!f.active;updatePublicServices(city,false);updateSafety(city,false);updateMobility(city,false,true);refreshCity(city);renderUI();scene.redraw();}return;}
  if(button.dataset.publicView&&import.meta.env.DEV){const view=button.dataset.publicView;closePanel();setOverlay('none');scene.setPublicServiceDebug(view==='clear'?null:view);message(`Public service diagnostic: ${view.replaceAll('-',' ')}. Green indicates larger values; inspect tiles for capacity and demand.`,10000);return;}
  if(button.dataset.publicDebug&&import.meta.env.DEV){const action=button.dataset.publicDebug;
    if(action==='fire')message(debugTarget!==null&&triggerFire(city,debugTarget)?'Fire incident triggered.':'Inspect an occupied private building first.');
    if(action==='waste'&&debugTarget!==null)city.tiles[debugTarget].publicServices.uncollectedWaste+=10;
    if(action==='staff')for(const f of city.publicServices.facilities)f.employeesAvailable=f.employeesRequired;
    if(action==='repair')for(const f of city.publicServices.facilities)f.maintenanceCondition=100;
    if(action==='access')message(JSON.stringify(serviceCacheDiagnostics(city)),14000);
    updatePublicServices(city,false);updateSafety(city,false);refreshCity(city);scene.redraw();renderUI();return;}
  if (button.hasAttribute('data-feed-tile')) { const value=button.dataset.feedTile; if(value){const t=city.tiles[Number(value)]; closePanel(); selected=Number(value); scene.setSelected(t); scene.focusTile(t.x,t.y); } return; }
  if (button.dataset.livingView) { const view=button.dataset.livingView; closePanel(); if(view==='od'){scene.setDebugVisual('od');setOverlay('mobility');scene.setDebugVisual('od');} else if(view==='traffic'||view==='mobility')setOverlay(view); else scene.setLivingDebug(view==='clear'?null:view); return; }
  if (button.dataset.graphicsToggle) { const key=button.dataset.graphicsToggle as 'bounds'|'anchors'|'depth'|'lod'|'shadows'|'props'|'vegetation'|'weather'; const enabled=scene.toggleGraphics(key); message(`${key}: ${enabled ? 'on' : 'off'}. ${scene.graphicsSummary()}`, 14000); return; }
  if (button.dataset.pulse) {
    const item = pulse.active.find(p => p.id === button.dataset.pulse); if (!item) return;
    closePanel(); tool = 'inspect'; renderPlacement();
    if (item.tileId !== null) {
      const tile = city.tiles[item.tileId];
      const route = city.mobility.routes.find(r => item.id.includes(r.id)); selectedRoute = route?.id ?? selectedRoute; scene.setFocusedRoute(route?.id ?? null);
      setOverlay(item.overlay); selected = item.tileId; debugTarget = item.tileId;
      scene.setSelected({ x: tile.x, y: tile.y }); scene.focusTile(tile.x, tile.y);
      message(`${item.title} · Tile ${tile.x}, ${tile.y}`, 5000);
    } else if(item.id.startsWith('governance-')) {
      governanceTab=item.id.includes('budget')?'Budget':item.id.includes('housing')||item.id.includes('affordability')?'Housing':'Overview';
      displayPanel('governance');
    } else displayPanel(item.id === 'budget' ? 'economy' : 'data');
    return;
  }
  if(button.dataset.transitRoute){selectedRoute=button.dataset.transitRoute;transportTab=city.transit.routes.find(r=>r.id===selectedRoute)?.mode??'bus';displayPanel('transport');const detail=panel.querySelector('.route-detail');if(detail)panel.scrollTop+=detail.getBoundingClientRect().top-panel.getBoundingClientRect().top-12;return;}
  if(button.dataset.transitFocus){const r=city.transit.routes.find(r=>r.id===button.dataset.transitFocus);if(r?.path.length){closePanel();setOverlay('transit-network');scene.setFocusedRoute(r.id);const t=city.tiles[r.path[Math.floor(r.path.length/2)]];scene.focusTile(t.x,t.y);}return;}
  if(button.dataset.transitStop){const s=city.transit.stops.find(s=>s.id===button.dataset.transitStop);if(s){closePanel();selected=s.tileId;scene.setSelected(city.tiles[selected]);scene.focusTile(city.tiles[selected].x,city.tiles[selected].y);displayPanel('inspector');}return;}
  if(button.dataset.junction){message(improveJunction(city,selected??-1,button.dataset.junction as 'signal'|'high-capacity'|'roundabout')||'Junction construction started.');updateMobility(city,false,true);refreshCity(city);scene.redraw();renderUI();return;}
  if(button.dataset.transitFleet||button.hasAttribute('data-transit-suspend')||button.hasAttribute('data-transit-remove')){const r=city.transit.routes.find(r=>r.id===selectedRoute);if(!r)return;if(button.hasAttribute('data-transit-remove')){removeTransitRoute(city,r.id);selectedRoute=null;}else message(editTransitRoute(city,r.id,button.dataset.transitFleet?{vehicles:r.vehicles+Number(button.dataset.transitFleet)}:{suspended:!r.suspended})||'Service updated.');updateMobility(city,false,true);refreshCity(city);scene.redraw();renderUI();return;}
  if(button.hasAttribute('data-transit-edit')){const r=city.transit.routes.find(r=>r.id===selectedRoute);if(r){chooseTool('inspect');editingTransit=r.id;transitMode=r.mode;transitDraft=[];closePanel();renderPlacement();}return;}
  if(button.dataset.transitDebug){const action=button.dataset.transitDebug;const r=city.transit.routes.find(r=>r.id===selectedRoute)||city.transit.routes[0];if(action==='crowding'&&r){r.demand=Math.max(100,r.capacity*3);r.crowding=3;}else if(action==='congestion'){city.mobility.debug.loadMultiplier=20;city.mobility.debug.until=city.tick+30;updateMobility(city,false,true);}else if(action==='flood'&&selected!==null){city.tiles[selected].services.floodDepth=100;city.infrastructure.revision++;updateMobility(city,false,true);}else if(action==='demand'){city.mobility.debug.demandMultiplier=5;city.mobility.debug.until=city.tick+30;updateMobility(city,false,true);}else if(action==='report'){transitReportOpen=!transitReportOpen;renderPanel();return;}else message(JSON.stringify(transitNetworkDiagnostics(city)),14000);scene.redraw();renderUI();return;}
  if (button.dataset.transportTab) { transportTab = button.dataset.transportTab; displayPanel('transport'); return; }
  if (button.dataset.route) { selectedRoute = button.dataset.route; transportTab = city.mobility.routes.find(r => r.id === selectedRoute)?.mode === 'bus' ? 'bus' : 'informal'; displayPanel('transport'); return; }
  if (button.dataset.routeFocus) { const r = city.mobility.routes.find(r => r.id === button.dataset.routeFocus); if (r) { closePanel(); setOverlay('mobility'); scene.setFocusedRoute(r.id); const t = city.tiles[r.path[Math.floor(r.path.length / 2)]]; if (t) scene.focusTile(t.x, t.y); } return; }
  if (button.dataset.flow) { const f = city.mobility.flows.find(f => f.id === button.dataset.flow); if (f) { closePanel(); setOverlay('mobility'); const t = city.tiles[f.origin]; scene.focusTile(t.x, t.y); scene.setSelected(t); } return; }
  if (button.dataset.formalize) { message(formalizeRoute(city, button.dataset.formalize) || 'Corridor formalized. Designated stops improve boarding and reliability.'); refreshCity(city); scene.redraw(); renderUI(); return; }
  if (button.dataset.fleet) { message(changeBusFleet(city, selectedRoute ?? '', Number(button.dataset.fleet)) || 'Bus fleet updated.'); refreshCity(city); scene.redraw(); renderUI(); return; }
  if (button.hasAttribute('data-bus-suspend')) { const r = city.mobility.routes.find(r => r.id === selectedRoute); if (r) { r.suspended = !r.suspended; updateMobility(city, false, true); refreshCity(city); scene.redraw(); renderUI(); } return; }
  if (button.dataset.mobilityView) { closePanel(); setOverlay(button.dataset.mobilityView === 'capacity' ? 'traffic' : 'mobility'); scene.setDebugVisual(button.dataset.mobilityView as 'od' | 'graph' | 'capacity'); return; }
  if (button.dataset.mobilityDebug) { message(mobilityDebug(city, button.dataset.mobilityDebug, debugTarget, selectedRoute)); refreshCity(city); scene.redraw(); renderUI(); return; }
  if (button.dataset.tool) { chooseTool(button.dataset.tool as Tool); return; }
  if (button.dataset.overlay) { setOverlay(button.dataset.overlay as Overlay); return; }
  if (button.dataset.service) { displayPanel(`services-${button.dataset.service}`); return; }
  if (button.dataset.infraDebug) { message(infrastructureDebug(city, button.dataset.infraDebug as InfrastructureDebug, debugTarget)); updateMobility(city, false, true); refreshCity(city); scene.redraw(); renderUI(); return; }
  if (button.dataset.debug) { message(debugAction(city, button.dataset.debug as DebugAction, debugTarget)); scene.redraw(); renderUI(); renderPlacement(); return; }
  switch (button.dataset.action) {
    case 'transit-plan': chooseTool('inspect');transitMode=button.dataset.transitMode==='brt'?'brt':'bus';transitDraft=[];closePanel();renderPlacement();message('Tap existing stops/stations in journey order.');break;
    case 'brt-corridor': chooseTool('inspect');corridorDraft=[];closePanel();renderPlacement();break;
    case 'city-feed': displayPanel('feed'); break;
    case 'living-count': message(scene.graphicsSummary(),20000); break;
    case 'graphics-count': message(scene.graphicsSummary(), 20000); break;
    case 'vehicle-count': message(`${scene.representativeVehicleCount} representative vehicles (bounded pool; none saved).`); break;
    case 'bus-build': chooseTool('inspect'); busDraft = []; setOverlay('mobility'); renderPlacement(); message('Tap road tiles: start, optional waypoints, then end.'); break;
    case 'save': save(); break;
    case 'load':
      try {
        const loaded = repo.loadWithReport(); if (!loaded) { message('No saved city on this device yet.'); break; }
        // Catch up a separate object so a failure leaves the open city untouched.
        message('Your city kept living. Calculating offline changes…', 60000); const r = await runCatchUp(loaded.city);
        city = loaded.city; pulse.reset(); accumulator = 0; lastTime = performance.now(); chooseTool('inspect');
        scene.redraw(); renderUI(); if (r.ticks) { lastReport = r; displayPanel('offline'); } message(loaded.recovered ? recoveryText(loaded) : `City loaded · ${r.ticks} days progressed while away.`, loaded.recovered ? 15000 : 6000);
      } catch { message('Could not load this save. Your current city is still open.'); }
      break;
    case 'new':
      if (!confirm('Start a new city? This replaces the saved city on this device.')) break;
      city = createCity(); pulse.reset(); debugTarget = null; lastReport = null; accumulator = 0; lastTime = performance.now(); chooseTool('inspect'); setOverlay('none'); scene.home(); scene.redraw(); renderUI(); save(true); intro.showModal(); break;
    case 'intro': closePanel(); intro.showModal(); break;
    case 'advance': advance(city, 30); scene.redraw(); renderUI(); renderPlacement(); message('Developer control: advanced 30 city days.'); break;
    case 'zones': displayPanel('zones'); break;
    case 'last-return': displayPanel('offline'); break;
  }
});
content.addEventListener('change', event => {
  const input = event.target as HTMLSelectElement;
  if(input.dataset.transitName||input.dataset.transitFare){message(editTransitRoute(city,input.dataset.transitName??input.dataset.transitFare!,input.dataset.transitName?{name:input.value}:{fare:Number(input.value)})||'Route updated.');updateMobility(city,false,true);refreshCity(city);renderUI();return;}
  if(input.hasAttribute('data-transit-subsidy')||input.hasAttribute('data-transit-integration')){if(input.hasAttribute('data-transit-subsidy'))city.transit.subsidyRate=Number(input.value);else city.transit.integration=input.value as 'neutral'|'integrate'|'support';invalidateTransit(city);updateMobility(city,false,true);refreshCity(city);renderUI();return;}
  if(input.dataset.tax){message(setTax(city,input.dataset.tax as Zone,Number(input.value))||'Tax target recorded. Effective rate adjusts over time.');renderPanel();return;}
  if(input.dataset.priority){setPriority(city,input.dataset.priority as keyof typeof city.governance.priorities,input.value as Priority);updateInfrastructure(city,false);refreshCity(city);analyzeGovernance(city,false);renderPanel();return;}
  if(input.hasAttribute('data-policy-district')){districtId=input.value||null;renderPanel();return;}
  if(input.dataset.districtName){renameDistrict(city,input.dataset.districtName,input.value);renderPanel();return;}
  if(input.hasAttribute('data-objective')){city.governance.objective=(input.value||null) as ObjectiveId|null;renderPanel();return;}
  if (input.id === 'activity-hour') { activityHourOverride=input.value==='auto'?null:Number(input.value); updateActivity(); return; }
  if (input.id === 'graphics-quality') { graphicsQuality=input.value as GraphicsQuality; scene.setGraphicsQuality(graphicsQuality); try { localStorage.setItem('naija-city-graphics-quality',graphicsQuality); } catch { /* Optional preference. */ } return; }
  if (input.id === 'rain-quality') { rainQuality = input.value as typeof rainQuality; scene.setRainQuality(rainQuality); return; }
  if(input.dataset.publicBudget){city.publicServices.funding[input.dataset.publicBudget as keyof typeof city.publicServices.funding]=Number(input.value);updatePublicServices(city,false);updateSafety(city,false);refreshCity(city);renderUI();scene.redraw();}
  if (input.dataset.budget) {
    city.infrastructure.maintenance[input.dataset.budget as keyof typeof city.infrastructure.maintenance] = Number(input.value);
    updateInfrastructure(city, false); refreshCity(city); renderUI();
  }
});
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.onclick = () => {
  speed = Number(b.dataset.speed); scene.setSimulationSpeed(speed);
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(el => el.setAttribute('aria-pressed', String(el === b)));
});
document.getElementById('zoom-in')!.onclick = () => scene.zoom(1.2);
document.getElementById('zoom-out')!.onclick = () => scene.zoom(0.8);
document.getElementById('home')!.onclick = () => scene.home();
document.getElementById('start')!.onclick = () => intro.close();
intro.addEventListener('close', () => { lastTime = performance.now(); message('Extend the road. Open Zones to plan the neighbourhood.'); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !intro.open) chooseTool('inspect'); });
let lastTime = performance.now();
let lastActivityPanel = 0;
function updateActivity() {
  const elapsed = document.hidden || intro.open || catchingUp ? 0 : Math.max(0, performance.now() - lastTime) * speed;
  const hour = activityHourOverride ?? (6 + (accumulator + elapsed) / TICK_MS * 24) % 24;
  activity = cityActivity(city, hour); scene.setActivity(activity);
  document.getElementById('date')!.textContent = `D${city.tick % 30 + 1} · M${Math.floor(city.tick / 30) + 1} · ${activityTime(activity.hour)}`;
  const living = document.getElementById('living-content');
  if (living && performance.now() - lastActivityPanel >= 500) {
    lastActivityPanel = performance.now();
    const open = Array.from(living.querySelectorAll('details')).map(d => d.open), scroll = content.scrollTop;
    living.innerHTML = openPanel === 'inspector' && selected !== null ? livingInspector(city, city.tiles[selected], activity) : livingSummary(city, activity);
    living.querySelectorAll('details').forEach((d,i) => { d.open = open[i] ?? d.open; }); content.scrollTop = scroll;
  }
}
setInterval(() => { if (!document.hidden && !catchingUp) updateActivity(); }, 100);
setInterval(() => {
  if (document.hidden || intro.open || catchingUp) { lastTime = performance.now(); return; }
  const now = performance.now(); accumulator += Math.min(now - lastTime, 10000) * speed; lastTime = now;
  const ticks = Math.floor(accumulator / TICK_MS);
  if (ticks > 0) { accumulator -= ticks * TICK_MS; advance(city, ticks); updateActivity(); scene.redraw(); renderUI(); renderPlacement(); }
}, 250);
setInterval(() => { if (!document.hidden && autosaveEnabled && !catchingUp) save(true); }, 15000);
document.addEventListener('visibilitychange', async () => {
  if (catchingUp) return;
  if (document.hidden) { if (autosaveEnabled) save(true); else city.lastSimulatedTimestamp = Date.now(); }
  else { const r = await runCatchUp(); lastTime = performance.now(); accumulator = 0; scene.redraw(); renderUI(); renderPlacement(); if (r.ticks) { lastReport = r; chooseTool('inspect'); displayPanel('offline'); } }
});
if(import.meta.env.DEV)Object.assign(window,{transitQA:{
  snapshot:()=>({ready:scene.sys.isActive(),tick:city.tick,population:city.population,transit:city.transit,mobility:city.mobility.stats,graphics:scene.graphicsSummary(),agents:scene.agentDiagnostics,overlay}),
  setCity:(value:typeof city)=>{city=value;speed=0;scene.setSimulationSpeed(0);showIntro=false;if(intro.open)intro.close();pulse.reset();chooseTool('inspect');updateActivity();scene.home();scene.redraw();renderUI();},
  focus:(id:number)=>{const t=city.tiles[id];scene.focusTile(t.x,t.y);},
  point:(id:number)=>{const c=scene.cameras.main,x=840+(id%32-Math.floor(id/32))*24,y=(id%32+Math.floor(id/32))*12+12;return {x:((x-c.scrollX-c.width/2)*c.zoom+c.width/2)/scene.displayDpr,y:((y-c.scrollY-c.height/2)*c.zoom+c.height/2)/scene.displayDpr};},
  advance:(days:number)=>{advance(city,days);updateActivity();scene.redraw();renderUI();},
  city:()=>city
}});
window.addEventListener('pagehide', () => { if (autosaveEnabled && !catchingUp) save(true); });
scene.setRainQuality(rainQuality);
scene.setActivity(activity);
renderUI(); if (showIntro) intro.showModal(); else if (lastReport) displayPanel('offline'); else message(initialMessage, 10000);
}
startGame().catch(error => { document.querySelector('#app')!.textContent = `Could not start the city: ${String(error)}`; });
