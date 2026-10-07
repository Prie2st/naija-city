// Headless "player" bots for long-run balance testing. Uses only public game actions
// (applyTool, setTax, togglePolicy, transit tools, funding/priority settings), never edits internals.
import { createCity, applyTool, step, previewTool } from '../../shared/simulation/engine';
import { setTax, togglePolicy, setPriority } from '../../shared/simulation/governance';
import * as governance from '../../shared/simulation/governance';
import { placeTransitFacility, createTransitRoute, editTransitRoute, buildBrtCorridor, improveJunction } from '../../shared/simulation/transit';
import { updateMobility } from '../../shared/simulation/mobility';
import { invalidateTransit } from '../../shared/simulation/transit-network';
import { isOperating } from '../../shared/simulation/world';
import type { City, Tool, Zone } from '../../shared/types/city';
import { POLICIES } from '../../shared/simulation/governance-config';
import type { PolicyId } from '../../shared/types/governance';
import { INFRASTRUCTURE } from '../../shared/simulation/infrastructure-config';
import { PUBLIC_SERVICES } from '../../shared/simulation/public-service-config';
import type { FacilityKind } from '../../shared/types/public-services';

export interface Strategy {
  name: string;
  mix: Record<Zone, number>;          // share of zoned parcels
  layout: 'mixed' | 'segregated';
  maxRadius: number;                  // how far from the centre the city may spread
  radiusStep: number;                 // how eagerly it expands
  road: 'road' | 'dirt-road';
  taxes: Record<Zone, number>;
  policies: PolicyId[];
  services: 0 | 1 | 2;                // 0 minimal, 1 standard, 2 generous
  funding: number;
  utilities: 'cheap' | 'standard' | 'premium';
  drainage: 'none' | 'reactive' | 'proactive';
  transit: boolean; brt: boolean; subsidy: number;
  car: boolean;                       // road upgrades and junctions
  stopAfter?: number;                 // stop all player actions after this tick (neglect test)
  utilityInfill?: boolean;            // when no free site exists, clear a low-rise home for utilities (experiment)
  zonesPerMonth: number;
}
const BASE: Strategy = { name: 'balanced', mix: { residential: .55, commercial: .2, industrial: .25 }, layout: 'mixed', maxRadius: 16, radiusStep: 1, road: 'road',
  taxes: { residential: .25, commercial: 3.5, industrial: 2.5 }, policies: [], services: 1, funding: 100, utilities: 'standard', drainage: 'reactive',
  transit: false, brt: false, subsidy: 0, car: false, zonesPerMonth: 6 };
export const STRATEGIES: Record<string, Strategy> = {
  balanced: BASE,
  'low-tax': { ...BASE, name: 'low-tax', taxes: { residential: .1, commercial: 1, industrial: 1 }, services: 0, funding: 75, zonesPerMonth: 8, policies: ['infill'] },
  'high-service': { ...BASE, name: 'high-service', taxes: { residential: .45, commercial: 5.5, industrial: 4.5 }, services: 2, funding: 125, utilities: 'premium', drainage: 'proactive',
    policies: ['green', 'waste', 'community-safety', 'street-lighting', 'drainage'] },
  car: { ...BASE, name: 'car', layout: 'segregated', car: true, maxRadius: 18 },
  transit: { ...BASE, name: 'transit', transit: true, brt: true, subsidy: 25, policies: ['transit', 'pedestrian'] },
  dense: { ...BASE, name: 'dense', maxRadius: 7, utilities: 'premium', drainage: 'proactive', policies: ['density', 'infill'], services: 1 },
  sprawl: { ...BASE, name: 'sprawl', layout: 'segregated', maxRadius: 20, radiusStep: 2, road: 'dirt-road', utilities: 'cheap', zonesPerMonth: 12 },
  industrial: { ...BASE, name: 'industrial', mix: { residential: .45, commercial: .1, industrial: .45 }, taxes: { residential: .25, commercial: 3.5, industrial: 1 }, services: 0,
    utilities: 'cheap', policies: ['industry'] },
  commercial: { ...BASE, name: 'commercial', mix: { residential: .45, commercial: .4, industrial: .15 }, services: 2, funding: 110, utilities: 'premium', drainage: 'proactive',
    policies: ['commerce', 'pedestrian', 'green'] },
  neglect: { ...BASE, name: 'neglect', stopAfter: 3600 },
  idle: { ...BASE, name: 'idle', stopAfter: 0 },
  starting: { ...BASE, name: 'starting', stopAfter: 0 },
};

const CX = 13, CY = 13;
const isRoadCol = (x: number) => x % 3 === 1, isRoadRow = (y: number) => y % 3 === 0;
function hash(x: number, y: number) { let n = Math.imul(x * 73856093 ^ y * 19349663, 2654435761); n ^= n >>> 15; return (n >>> 0) / 4294967295; }
// Civic reserve blocks (2x2) stay unzoned for utilities and services.
const blockOf = (x: number, y: number) => ({ bx: Math.floor((x - 2) / 3), by: Math.floor((y - 1) / 3) });
function civic(x: number, y: number) { if (x < 2) return true; const { bx, by } = blockOf(x, y); return (bx * 7 + by * 3) % 6 === 0; }
function zoneFor(s: Strategy, x: number, y: number): Zone {
  if (s.layout === 'segregated') {
    // Homes north/west, jobs in a southern/eastern employment belt, commerce on the central spine.
    if (Math.abs(x - CX) <= 2 || Math.abs(y - 15) <= 1) return hash(x, y) < .75 ? 'commercial' : 'residential';
    if (y >= 19 || x >= 20) return hash(x, y) < s.mix.industrial / (s.mix.industrial + s.mix.commercial * .5) ? 'industrial' : 'commercial';
    return 'residential';
  }
  const h = hash(x, y);
  return h < s.mix.residential ? 'residential' : h < s.mix.residential + s.mix.commercial ? 'commercial' : 'industrial';
}

export class Bot {
  city: City; s: Strategy; radius = 4; log: string[] = []; actions = 0; spent = 0;
  stops: number[] = []; depot = false; brtBuilt = false;
  constructor(s: Strategy, seed = 731) { this.s = s; this.city = createCity(0, seed); this.setup(); }
  // A prudent player: cheap actions whenever cash allows; capital items only with a runway
  // that covers the post-build monthly balance for two years (essentials: three months).
  afford(cost: number, monthly: number, essential = false) {
    const c = this.city, balance = c.income - c.expenses - monthly;
    if (cost < 1e6) return c.treasury >= cost;
    const runway = essential ? 3 * Math.max(0, -balance) + 5e6 : 24 * Math.max(0, -balance) + 10e6;
    return c.treasury - cost >= runway;
  }
  monthlyOf(tool: Tool) {
    const t = tool as string;
    return (INFRASTRUCTURE as any)[t]?.operatingCost ?? (PUBLIC_SERVICES as any)[t]?.monthlyCost ?? 0;
  }
  tool(x: number, y: number, tool: Tool, essential = false) {
    const before = this.city.treasury;
    const p = previewTool(this.city, x, y, tool); if (p.status !== 'valid') return false;
    if (tool !== 'bulldoze' && !this.afford(p.cost, this.monthlyOf(tool), essential)) return false;
    applyTool(this.city, x, y, tool); this.actions++; this.spent += before - this.city.treasury; return true;
  }
  reserve() { return Math.max(5e6, this.city.expenses * 1.5); }
  setup() {
    const c = this.city;
    for (const z of ['residential', 'commercial', 'industrial'] as Zone[]) setTax(c, z, this.s.taxes[z]);
    for (const g of Object.keys(c.publicServices.funding) as (keyof typeof c.publicServices.funding)[]) c.publicServices.funding[g] = this.s.funding;
    if (this.s.utilities === 'premium') for (const g of ['power', 'water', 'drainage', 'roads'] as const) setPriority(c, g, 'high');
    if (this.s.utilities === 'cheap') for (const g of ['power', 'water', 'roads'] as const) setPriority(c, g, 'low');
    c.transit.subsidyRate = this.s.subsidy;
  }
  run(ticks: number, onMonth?: (c: City) => void) {
    for (let i = 0; i < ticks; i++) {
      step(this.city);
      if (this.city.tick % 30 === 0) { if (this.s.stopAfter === undefined || this.city.tick < this.s.stopAfter) this.month(); onMonth?.(this.city); }
    }
  }
  inMap(x: number, y: number) { return x >= 0 && y >= 0 && x < 32 && y < 32; }
  t(x: number, y: number) { return this.city.tiles[y * 32 + x]; }
  dry(x: number, y: number) { const t = this.t(x, y); return t.terrain !== 'water' && t.terrain !== 'wetland'; }
  // A prudent player answers sustained debt (more than three months of spending) with higher taxes, up to
  // the 'high' rates, and eases back to the strategy's own rates once reserves cover a year. Low-tax never raises.
  taxes: Record<Zone, number> | null = null;
  fiscal() {
    const c = this.city, monthly = Math.max(1, c.expenses), zones = ['residential', 'commercial', 'industrial'] as Zone[];
    const ceiling: Record<Zone, number> = { residential: .45, commercial: 6, industrial: 5.5 }, step: Record<Zone, number> = { residential: .05, commercial: .5, industrial: .5 };
    this.taxes ??= { ...this.s.taxes };
    let next: Record<Zone, number> | null = null;
    if (this.s.name !== 'low-tax' && -c.treasury > 3 * monthly && c.income < c.expenses * 1.1) next = Object.fromEntries(zones.map(z => [z, Math.min(Math.max(ceiling[z], this.s.taxes[z]), this.taxes![z] + step[z])])) as Record<Zone, number>;
    else if (c.treasury > 12 * monthly) next = Object.fromEntries(zones.map(z => [z, Math.max(this.s.taxes[z], this.taxes![z] - step[z])])) as Record<Zone, number>;
    if (!next) return;
    for (const z of zones) if (Math.abs(next[z] - this.taxes[z]) > 1e-9 && setTax(c, z, +next[z].toFixed(2)) === '') { this.taxes[z] = +next[z].toFixed(2); this.log.push(`${c.tick}:tax:${z}:${this.taxes[z]}`); }
  }
  month() {
    this.fiscal();
    this.policies(); this.roads(); this.zoning(); this.power(); this.water(); this.drainage(); this.services();
    if (this.s.transit) this.transit();
    if (this.s.car) this.carRoads();
  }
  // Policies are enabled only while the budget can carry their per-resident cost, and wound down in deficit.
  policies() {
    const c = this.city;
    for (const id of this.s.policies) {
      const def = POLICIES.find(p => p.id === id)!, state = c.governance.policies.find(p => p.id === id && p.districtId === null);
      // Uses the game's own monthly estimate where it exists (8.2 prices policies by basis); older code charged per resident.
      const estimate = (governance as Record<string, unknown>).policyEstimate as ((city: City, id: PolicyId, district: null) => number) | undefined;
      const on = !!state?.enabled, cost = estimate ? estimate(c, id, null) : def.cost * c.population + 25000;
      const balance = c.income - c.expenses;
      if (!on && balance > cost * 1.2 && c.treasury > 20e6) { togglePolicy(c, id, null); this.policyLog.push(`${c.tick}:on:${id}`); }
      else if (on && balance < 0 && c.treasury < 50e6 && state!.strength >= 1) { togglePolicy(c, id, null); this.policyLog.push(`${c.tick}:off:${id}`); }
    }
  }
  policyLog: string[] = [];
  roads() {
    // Lay grid roads within the current radius, from the centre outward.
    const c = this.city, cells: [number, number][] = [];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if ((isRoadCol(x) || isRoadRow(y)) && Math.max(Math.abs(x - CX), Math.abs(y - CY)) <= this.radius + 1 && this.dry(x, y) && !this.t(x, y).road) cells.push([x, y]);
    cells.sort((a, b) => Math.hypot(a[0] - CX, a[1] - CY) - Math.hypot(b[0] - CX, b[1] - CY));
    let n = 0; for (const [x, y] of cells) { if (n >= 24) break; const t = this.t(x, y); if (t.building || t.zone || t.infrastructure || t.publicFacility) continue; if (this.tool(x, y, this.s.road)) n++; }
  }
  zoning() {
    const c = this.city;
    const empty: Record<Zone, number> = { residential: 0, commercial: 0, industrial: 0 };
    for (const t of c.tiles) if (t.zone && !t.building) empty[t.zone]++;
    const want = (z: Zone) => c.demand[z] >= 22 && empty[z] < 4 + Math.round(this.s.zonesPerMonth * this.s.mix[z]);
    const candidates: { x: number; y: number; z: Zone; d: number }[] = [];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (isRoadCol(x) || isRoadRow(y) || civic(x, y) || !this.dry(x, y)) continue;
      const t = this.t(x, y); if (t.zone || t.building || t.road || t.infrastructure || t.publicFacility) continue;
      const d = Math.max(Math.abs(x - CX), Math.abs(y - CY)); if (d > this.radius) continue;
      candidates.push({ x, y, z: zoneFor(this.s, x, y), d: Math.hypot(x - CX, y - CY) });
    }
    candidates.sort((a, b) => a.d - b.d);
    let placed = 0, blocked = 0;
    for (const cand of candidates) {
      if (placed >= this.s.zonesPerMonth) break;
      if (!want(cand.z)) { blocked++; continue; }
      if (this.tool(cand.x, cand.y, cand.z)) { placed++; empty[cand.z]++; }
    }
    // Grow the frontier when no suitable land remains inside it.
    const needed = (['residential', 'commercial', 'industrial'] as Zone[]).some(want);
    if (needed && candidates.filter(c => want(c.z)).length < 3 && this.radius < this.s.maxRadius) this.radius = Math.min(this.s.maxRadius, this.radius + this.s.radiusStep);
  }
  // With utility infill, a full map no longer blocks utilities: the lowest-rise home nearest the need is cleared.
  utilitySite(near: [number, number], maxDist: number, allowEdge = false): [number, number] | null {
    const free = this.freeSite(1, near, maxDist, allowEdge); if (free || !this.s.utilityInfill) return free;
    const c = this.city, homes = c.tiles.filter(t => t.building && t.building.type === 'residential' && t.building.level <= 2 && Math.hypot(t.x - near[0], t.y - near[1]) <= maxDist)
      .sort((a, b) => a.building!.level - b.building!.level || Math.hypot(a.x - near[0], a.y - near[1]) - Math.hypot(b.x - near[0], b.y - near[1]));
    const t = homes[0]; if (!t || !this.tool(t.x, t.y, 'bulldoze')) return null;
    return [t.x, t.y];
  }
  freeSite(size: number, near: [number, number], maxDist = 99, allowEdge = false): [number, number] | null {
    const c = this.city; let best: [number, number] | null = null, bestD = Infinity;
    for (let y = 0; y + size <= 32; y++) for (let x = 0; x + size <= 32; x++) {
      let ok = true, road = false;
      for (let dy = 0; dy < size && ok; dy++) for (let dx = 0; dx < size && ok; dx++) {
        const t = this.t(x + dx, y + dy);
        if (!this.dry(x + dx, y + dy) || t.road || t.building || t.zone || t.infrastructure || t.publicFacility || c.transit.stops.some(s => s.tileId === (y + dy) * 32 + x + dx)) ok = false;
        if (!allowEdge && !civic(x + dx, y + dy)) ok = false;
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx + ax, ny = y + dy + ay; if (this.inMap(nx, ny) && this.t(nx, ny).road) road = true; }
      }
      if (!ok || (!road && !allowEdge)) continue;
      const d = Math.hypot(x - near[0], y - near[1]); if (d < bestD && d <= maxDist) { bestD = d; best = [x, y]; }
    }
    return best;
  }
  centroid(filter: (t: City['tiles'][number]) => boolean): [number, number] | null {
    let sx = 0, sy = 0, n = 0; for (const t of this.city.tiles) if (filter(t)) { sx += t.x; sy += t.y; n++; }
    return n ? [Math.round(sx / n), Math.round(sy / n)] : null;
  }
  power() {
    const c = this.city, p = c.infrastructure.power;
    const margin = this.s.utilities === 'premium' ? 1.5 : this.s.utilities === 'standard' ? 1.25 : 1.05;
    if (p.supply < p.peakDemand * margin) {
      const essential = c.infrastructure.power.reliability < 60;
      const kind = this.s.utilities === 'cheap' ? 'diesel' : this.afford(90e6, 1.4e6, essential) ? 'gas' : 'diesel';
      const site = this.utilitySite([0, 31], 99, true); if (site) this.tool(site[0], site[1], kind, essential);
    }
    // Substations where buildings lack coverage.
    const weak = this.centroid(t => !!t.building && isOperating(t.building) && t.services.powerCoverage < (this.s.utilities === 'cheap' ? 40 : 70));
    if (weak) { const site = this.utilitySite(weak, 10); if (site) this.tool(site[0], site[1], 'substation', true); }
  }
  water() {
    const c = this.city, w = c.infrastructure.water;
    const margin = this.s.utilities === 'premium' ? 1.4 : this.s.utilities === 'standard' ? 1.2 : 1.02;
    if (w.production < w.demand * margin) {
      const kind = this.s.utilities !== 'cheap' && c.treasury > 120e6 && w.demand > 400 ? 'treatment' : 'borehole';
      const near = this.centroid(t => !!t.building) ?? [CX, CY];
      const site = this.utilitySite(near, 99); if (site) this.tool(site[0], site[1], kind, w.reliability < 60);
    }
    const weak = this.centroid(t => !!t.building && isOperating(t.building) && t.services.waterCoverage < (this.s.utilities === 'cheap' ? 40 : 70));
    if (weak) { const site = this.utilitySite(weak, 10); if (site) this.tool(site[0], site[1], this.s.utilities === 'cheap' ? 'borehole' : 'water-tower', true); }
  }
  drainage() {
    if (this.s.drainage === 'none') return;
    const c = this.city, threshold = this.s.drainage === 'proactive' ? 60 : 30;
    const kind = this.s.drainage === 'proactive' ? 'engineered-drain' : 'open-drain';
    const targets = c.tiles.filter(t => t.building && (t.services.drainageQuality < threshold || t.services.floodEvents > 0 && t.services.drainageQuality < threshold + 20)).sort((a, b) => b.services.floodRisk - a.services.floodRisk);
    let n = 0;
    for (const t of targets) {
      if (n >= 4) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = t.x + dx, y = t.y + dy; if (!this.inMap(x, y)) continue;
        const r = this.t(x, y); if (!r.road || r.infrastructure) continue;
        if (this.tool(x, y, kind, true)) { n++; break; }
      }
    }
  }
  services() {
    const c = this.city, lvl = this.s.services, st = c.publicServices.stats, pop = c.population;
    const fac = (k: FacilityKind) => c.publicServices.facilities.filter(f => f.subtype === k).length;
    const ratio = (g: 'education' | 'healthcare') => st[g].demand ? st[g].served / st[g].demand : 1;
    const target = lvl === 2 ? .9 : lvl === 1 ? .7 : .35;
    const home = this.centroid(t => !!t.building && t.building.type === 'residential' && t.building.occupants > 0) ?? [CX, CY];
    const under = (g: 'education' | 'healthcare' | 'parks') => this.centroid(t => !!t.building && t.building.occupants > 0 && t.publicServices[g].served < 50) ?? home;
    const build = (k: FacilityKind, near: [number, number]) => { const size = k === 'hospital' || k === 'secondary-school' || k === 'landfill' || k === 'neighborhood-park' || k === 'area-command' ? 2 : 1; const s = this.freeSite(size, near); return s ? this.tool(s[0], s[1], k) : false; };
    if (pop < 800) return;
    if (ratio('education') < target) build(fac('primary-school') <= fac('secondary-school') * 2 ? 'primary-school' : 'secondary-school', under('education'));
    if (ratio('healthcare') < target) build(lvl === 2 && pop > 6000 && fac('hospital') < Math.floor(pop / 15000) + 1 ? 'hospital' : 'phc', under('healthcare'));
    if (lvl >= 1 || pop > 5000) { if (fac('fire-station') < Math.ceil(pop / (lvl === 2 ? 12000 : 25000))) build('fire-station', home); }
    if (lvl >= 1 || c.safety.metrics.publicSafety < 55) { const cap = c.publicServices.facilities.filter(f => f.type === 'police').reduce((s, f) => s + f.capacity, 0); if (cap < (pop + c.jobs) * (lvl === 2 ? 1 : .6)) build(pop > 10000 ? 'police-station' : 'police-post', home); }
    const backlog = c.publicServices.waste.backlog / Math.max(1, pop);
    if (lvl >= 1 || backlog > .05) {
      if (!fac('landfill') || c.publicServices.facilities.some(f => f.subtype === 'landfill' && f.storedWaste > 800000) && fac('landfill') < 3) { const edge = this.freeSite(2, [2, 28]); if (edge) this.tool(edge[0], edge[1], 'landfill'); }
      if (c.publicServices.waste.generated > fac('waste-depot') * 80 || backlog > .02 && fac('waste-depot') < 8) build('waste-depot', home);
    }
    if (lvl >= 1) { const parks = c.publicServices.facilities.filter(f => f.type === 'parks').reduce((s, f) => s + f.capacity, 0); if (parks < pop * (lvl === 2 ? 1.2 : .6)) build(lvl === 2 ? 'neighborhood-park' : 'pocket-park', under('parks')); }
  }
  transit() {
    const c = this.city;
    if (c.population < 600) return;
    if (!this.depot && this.afford(60e6, 1.5e6)) { const s = this.freeSite(1, [CX, CY]); if (s && placeTransitFacility(c, s[1] * 32 + s[0], 'bus-depot') === '') this.depot = true; }
    if (c.population < 1500) return;
    // A cross-shaped trunk on the spine roads plus a ring, stops every 3 tiles.
    if (this.depot && c.tick % 180 === 0 && c.transit.routes.length < 10 && this.afford(72e6, 10.8e6)) {
      const lines = [ [...Array(32).keys()].map(y => [CX, y]), [...Array(32).keys()].map(x => [x, 15]), [...Array(32).keys()].map(y => [7, y]), [...Array(32).keys()].map(y => [19, y]), [...Array(32).keys()].map(x => [x, 9]), [...Array(32).keys()].map(x => [x, 21]) ];
      const line = lines[c.transit.routes.filter(r => !r.legacy).length % lines.length];
      const ids: string[] = [];
      for (const [x, y] of line.filter((_, i) => i % 3 === 0)) {
        if (!this.inMap(x, y) || !this.t(x, y).road) continue;
        const existing = c.transit.stops.find(s => s.tileId === y * 32 + x);
        if (existing) { ids.push(existing.id); continue; }
        if (placeTransitFacility(c, y * 32 + x, 'bus-stop') === '') ids.push(c.transit.stops.at(-1)!.id);
      }
      if (ids.length >= 3) createTransitRoute(c, 'bus', ids.slice(0, 16), 6);
    }
    for (const r of c.transit.routes.filter(r => !r.legacy && r.mode === 'bus')) if (r.crowding > 1.1 && r.vehicles < 40 && this.afford(24e6, 3.6e6)) editTransitRoute(c, r.id, { vehicles: r.vehicles + 2 });
    const depots = c.transit.stops.filter(s => s.kind === 'bus-depot').length;
    if (c.transit.stats.assignedFleet > depots * 55 && this.afford(60e6, 1.5e6)) { const s = this.freeSite(1, [CX, CY]); if (s) placeTransitFacility(c, s[1] * 32 + s[0], 'bus-depot'); }
    if (this.s.brt && !this.brtBuilt && c.population > 8000 && this.afford(150e6 + 8 * 42e6, 8 * 3.3e6)) {
      for (let x = 1; x <= 25; x++) if (this.t(x, 15).road && this.t(x, 15).roadClass !== 'avenue' && this.t(x, 15).roadClass !== 'major') this.tool(x, 15, 'avenue');
      // The longest contiguous avenue run through the centre column; gaps (wetland) would break the corridor.
      let lo = CX, hi = CX; const av = (x: number) => this.inMap(x, 15) && this.t(x, 15).road && ['avenue', 'major'].includes(this.t(x, 15).roadClass ?? '');
      while (av(lo - 1)) lo--; while (av(hi + 1)) hi++;
      const ends = av(CX) ? [...Array(hi - lo + 1).keys()].map(i => lo + i) : [];
      if (ends.length > 8 && buildBrtCorridor(c, [15 * 32 + ends[0], 15 * 32 + ends.at(-1)!]) === '') {
        const ids: string[] = [];
        for (const x of ends.filter((_, i) => i % 4 === 0)) if (placeTransitFacility(c, 15 * 32 + x, 'brt-station') === '') ids.push(c.transit.stops.at(-1)!.id); else { const e = c.transit.stops.find(s => s.tileId === 15 * 32 + x && s.kind === 'brt-station'); if (e) ids.push(e.id); }
        if (ids.length >= 2 && createTransitRoute(c, 'brt', ids, 8) === '') this.brtBuilt = true;
      }
    }
    invalidateTransit(c); updateMobility(c, false, true);
  }
  carRoads() {
    const c = this.city;
    // Upgrade the most congested roads; arterial spine to major roads.
    const congested = c.tiles.filter(t => t.road && t.mobility.congestion > 35).sort((a, b) => b.mobility.congestion - a.mobility.congestion).slice(0, 10);
    for (const t of congested) this.tool(t.x, t.y, t.roadClass === 'avenue' ? 'major-road' : 'avenue');
    if (c.tick % 90 === 0) {
      const junctions = c.tiles.filter(t => t.road && t.mobility.congestion > 30 && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => this.inMap(t.x + dx, t.y + dy) && this.t(t.x + dx, t.y + dy).road).length >= 3 && !c.transit.junctions[t.y * 32 + t.x]).slice(0, 3);
      for (const j of junctions) if (this.afford(12e6, 35000)) improveJunction(c, j.y * 32 + j.x, 'high-capacity');
    }
  }
}
