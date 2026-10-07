import type { City, Overlay, Tile } from '../../shared/types/city';
import { compactMoney, escapeHtml } from './panels';
/** Simulation text prints raw naira amounts ("-9414265 naira"); show them the way the HUD does ("₦-9.4M"). */
export const readableMoney = (text: string) => text.replace(/(-?\d{4,}) naira/g, (_, n: string) => compactMoney(Number(n)));

export interface CityPulse {
  id: string; type: 'problem' | 'opportunity'; severity: 'critical' | 'warning' | 'notice' | 'opportunity';
  title: string; description: string; tileId: number | null; tileIds: number[]; overlay: Overlay;
  timestamp: number; resolved: boolean;
}
const severityOrder = { critical: 0, warning: 1, notice: 2, opportunity: 3 };

// Presentation queries only: no writes to city state and no simulation rules here.
export function detectCityPulse(city: City): CityPulse[] {
  const pulses: CityPulse[] = [], developed = city.tiles.filter(t => t.building && !t.building.abandoned);
  const idOf = (t: Tile) => t.y * city.size + t.x;
  const location = (tiles: Tile[], score: (t: Tile) => number) => [...tiles].sort((a, b) => score(b) - score(a) || idOf(a) - idOf(b))[0];
  const add = (id: string, severity: CityPulse['severity'], title: string, description: string, overlay: Overlay = 'none', tile?: Tile, tileIds: number[] = []) => {
    pulses.push({ id, type: severity === 'opportunity' ? 'opportunity' : 'problem', severity, title, description,
      tileId: tile ? idOf(tile) : null, tileIds: tileIds.length ? tileIds : tile ? [idOf(tile)] : [], overlay, timestamp: city.tick, resolved: false });
  };
  for(const c of city.governance.challenges.filter(c=>!c.resolved&&['night-safety','police-capacity','safety-response','safety-incidents'].includes(c.kind)))add(c.id,c.severity,c.title,c.causes.join(' · '),c.overlay,c.tileId===null?undefined:city.tiles[c.tileId]);
  for(const i of city.safety.incidents.filter(i=>i.resolvedAt===null&&i.severity==='serious').slice(0,2))add(i.id,'warning','Safety response in progress',`${i.type.replace('-',' ')} incident · ${i.responseTime.toFixed(1)} min estimated response.`,'police',city.tiles[i.location]);
  const civic=city.publicServices;
  if(civic){for(const g of ['education','healthcare','waste','parks'] as const){const s=civic.stats[g],percent=s.served/Math.max(1,s.demand)*100;if(s.demand>0&&percent<45)add(`public-${g}`,'warning',g==='parks'?'Recreation access':`${g[0].toUpperCase()+g.slice(1)} service gap`,`${Math.round(percent)}% of demand served. Check travel reach, staff, capacity, funding and utilities.`,g,location(developed,t=>100-t.publicServices[g].quality));}
    for(const fire of civic.fires.filter(f=>f.resolvedAt===null).slice(0,3))add(fire.id,'critical','Fire response needed',`Response estimated at ${Math.round(fire.responseMinutes)} minutes. Damage is limited and repairable.`,'fire',city.tiles[fire.tileId]);}
  const p = city.infrastructure.power, w = city.infrastructure.water;
  if (developed.length && p.reliability < 70) add('power-service', p.reliability < 35 ? 'critical' : 'warning', 'Unreliable electricity', `${Math.round(p.reliability)}% grid reliability. Check generation and substation reach; private generators add costs.`, 'power', location(developed, t => 100 - t.services.powerReliability));
  else if (p.demand > 0 && p.reserve < 15) add('power-capacity', p.reserve < 0 ? 'critical' : 'warning', 'Power capacity near its limit', `${p.supply.toFixed(1)} MW supply for ${p.demand.toFixed(1)} MW demand. Expand generation before the next surge.`, 'power', location(developed, t => t.services.powerDemand));
  if (developed.length && w.reliability < 70) add('water-service', w.reliability < 35 ? 'critical' : 'warning', 'Water shortage', `${Math.round(w.reliability)}% public water reliability. Production, storage and local coverage all matter.`, 'water', location(developed, t => 100 - t.services.waterReliability));
  else if (w.demand > 0 && w.production < w.demand * 1.1) add('water-capacity', 'warning', 'Water reserve is tight', 'Production is approaching demand. Tower storage can only bridge shortages temporarily.', 'water', location(developed, t => t.services.waterDemand));

  // Eight-connected flood patches also group diagonally neighbouring properties.
  const remaining = new Set(city.tiles.flatMap((t, id) => t.terrain !== 'water' && t.services.floodDepth >= 35 ? [id] : []));
  const patches: { ids: number[]; affected: Tile[]; focus: Tile }[] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as number, ids = [first]; remaining.delete(first);
    for (let at = 0; at < ids.length; at++) {
      const t = city.tiles[ids[at]];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = t.x + dx, y = t.y + dy, id = y * city.size + x;
        if (x >= 0 && y >= 0 && x < city.size && y < city.size && remaining.delete(id)) ids.push(id);
      }
    }
    const affected = ids.map(id => city.tiles[id]).filter(t => t.building || t.road || t.infrastructure || t.zone);
    if (affected.length) patches.push({ ids, affected, focus: location(affected, t => (t.building ? 300 : t.road ? 200 : 100) + t.services.floodDepth)! });
  }
  patches.sort((a, b) => b.affected.length - a.affected.length || idOf(a.focus) - idOf(b.focus));
  for (const patch of patches.slice(0, 6)) {
    const properties = patch.affected.filter(t => t.building).length, roads = patch.affected.filter(t => t.road).length;
    const facilities = patch.affected.filter(t => t.infrastructure).length, parcels = patch.affected.filter(t => t.zone && !t.building).length;
    const cluster = city.clusters.find(c => c.tileIds.includes(idOf(patch.focus)));
    add(`flood-${Math.min(...patch.ids)}`, patch.affected.some(t => t.services.floodDepth >= 90) ? 'critical' : 'warning', `Flooding · ${cluster?.name ?? `Tile ${patch.focus.x}, ${patch.focus.y}`}`,
      `${properties} properties, ${roads} road tiles${facilities ? `, ${facilities} public facilities` : ''}${parcels ? `, ${parcels} zoned parcels` : ''} affected. Inspect drainage and accumulated water.`, 'drainage', patch.focus, patch.ids);
  }
  if (city.weather.rainfall >= 32) {
    const vulnerable = developed.filter(t => t.services.floodRisk >= 65 && t.services.floodDepth < 35);
    if (vulnerable.length) add('storm-risk', 'warning', 'Heavy rain over vulnerable development', `${vulnerable.length} properties have high flood risk. Drainage can change the outcome.`, 'flood-risk', location(vulnerable, t => t.services.floodRisk));
    else if (!patches.length) add('heavy-rain', 'notice', 'Heavy rain', 'A sustained storm is active. Watch low-lying areas and drainage.', 'flood-risk');
  }
  if (city.unemploymentRate >= 15) add('unemployment', city.unemploymentRate >= 35 ? 'critical' : 'warning', 'High unemployment', `${Math.round(city.unemploymentRate)}% of the workforce is unemployed. Viable commercial and industrial zones create jobs.`, 'occupancy', location(developed.filter(t => t.zone === 'industrial' || t.zone === 'commercial'), t => t.building!.maximumJobs - t.building!.jobs));
  if (city.housingCapacity > 0 && city.vacantHousing / city.housingCapacity < 0.05) add('housing', 'warning', 'Housing is nearly full', `${city.vacantHousing} vacant housing places remain. Make room for residential development.`, 'occupancy', location(developed.filter(t => t.zone === 'residential'), t => t.building!.occupancy));
  for (const zone of ['commercial', 'industrial'] as const) {
    const businesses = city.tiles.filter(t => t.building?.type === zone && t.building.openedAt !== null);
    const struggling = businesses.filter(t => t.building!.abandoned || (t.building!.business!.profitability < 40 && t.building!.poorDays >= 15));
    const capacity = businesses.reduce((s, t) => s + t.building!.maximumJobs, 0), jobs = businesses.reduce((s, t) => s + t.building!.jobs, 0);
    if (zone === 'commercial' && capacity > 0 && jobs / capacity < 0.4 && businesses.some(t => t.building!.age > 20)) add('commercial-vacancy', 'warning', 'Commercial space is underused', 'Many shop and office jobs remain vacant. Check demand, workforce and local services.', 'occupancy', location(businesses, t => 1 - t.building!.occupancy));
    if (zone === 'industrial' && struggling.length) add('industrial-decline', 'warning', 'Industrial businesses are struggling', `${struggling.length} workshops or factories face prolonged poor conditions.`, 'occupancy', location(struggling, t => t.building!.poorDays));
  }
  // The governance 'Persistent budget deficit' challenge already covers a long deficit; show one card, not two.
  if (city.income < city.expenses && !city.governance?.challenges.some(c => !c.resolved && c.kind === 'budget')) add('budget', city.treasury < city.expenses * 3 ? 'critical' : 'warning', 'Monthly budget deficit', 'Operating and maintenance expenses exceed tax revenue. Check the Economy and Services budgets.');
  for (const [zone, label] of [['residential', 'Residential'], ['commercial', 'Commercial'], ['industrial', 'Industrial']] as const) if (city.demand[zone] >= 65) {
    const parcels = city.tiles.filter(t => t.zone === zone && !t.building && !t.road);
    add(`demand-${zone}`, 'opportunity', `Strong ${label.toLowerCase()} demand`, `${city.demand[zone]}/100 demand. Well-connected, serviced parcels can attract private investment.`, 'development', location(parcels.length ? parcels : developed.filter(t => t.zone === zone), t => t.attractiveness));
  }
  if (city.jobs > city.workforce * 1.15 && city.unemploymentRate < 10) add('workers', 'opportunity', 'Employers need more workers', 'Job capacity exceeds the workforce. Serviced housing can welcome new residents.', 'occupancy', location(developed.filter(t => t.zone !== 'residential'), t => t.building!.maximumJobs - t.building!.jobs));
  const cluster = [...city.clusters].filter(c => c.tileIds.length >= 6 && c.tileIds.some(id => city.tiles[id].building && city.tick - city.tiles[id].building!.openedAt! < 30)).sort((a, b) => b.tileIds.length - a.tileIds.length)[0];
  if (cluster) add('cluster-growth', 'opportunity', `${cluster.name} is emerging`, `${cluster.tileIds.length} developed parcels now form a neighbourhood. Private construction is changing the skyline.`, 'land-value', city.tiles[cluster.id], cluster.tileIds);
  const previous = [...city.trends].reverse().find(s => city.tick - s.tick >= 20 && city.tick - s.tick <= 60);
  if (previous && city.averageLandValue - previous.landValue >= 6) add('land-growth', 'opportunity', 'Land values are rising', 'Average land value has risen by at least 6 points since the recent monthly sample.', 'land-value', location(developed, t => t.landValue));
  if (previous && ((p.reliability >= 80 && p.reliability - previous.gridReliability >= 15) || (w.reliability >= 80 && w.reliability - previous.waterReliability >= 15))) add('services-improved', 'opportunity', 'Infrastructure investment is working', 'Public service reliability has improved substantially. Private backup dependence can now decline.', p.reliability - previous.gridReliability >= 15 ? 'power' : 'water', location(developed, t => t.services.powerReliability + t.services.waterReliability));
  const roads = city.tiles.filter(t => t.road && t.mobility.dailyTrips > 0);
  const bottleneck = location(roads, t => t.mobility.congestion);
  if (bottleneck && bottleneck.mobility.congestion >= 65) add('traffic-congestion', bottleneck.mobility.congestion >= 85 ? 'critical' : 'warning', 'Congested travel corridor', `Road demand is exceeding comfortable capacity. Upgrade a bottleneck, provide a parallel road or improve shared transport. Average commute ${city.mobility.stats.averageCommute.toFixed(1)} min.`, 'traffic', bottleneck);
  const isolated = developed.filter(t => t.zone === 'residential' && t.mobility.accessibility < 35 && t.building!.occupants > 0);
  if (isolated.length) add('job-access', 'warning', 'Homes have poor employment access', `${isolated.length} occupied residential parcels have weak access to job locations. Connected roads and nearby employment matter.`, 'mobility', location(isolated, t => 100 - t.mobility.accessibility));
  for (const r of city.mobility.routes.slice(0, 8)) {
    const tile = city.tiles[r.path[Math.floor(r.path.length / 2)]];
    if (!tile) continue;
    if (r.reliability < 35) add(`route-disruption-${r.id}`, 'warning', 'Transport corridor disrupted', `${r.originName} ↔ ${r.destinationName}: ${Math.round(r.reliability)}% reliability. Check flooded roads, condition and congestion.`, 'mobility', tile, r.path);
    else if (!r.formalized && r.age < 15 && r.ridership > 0) add(`route-emerged-${r.id}`, 'opportunity', `Organic ${r.mode} corridor emerged`, `Private operators now connect ${r.originName} ↔ ${r.destinationName}. ${Math.round(r.ridership)} daily passengers. Inspect it in Transport.`, 'mobility', tile, r.path);
    else if (!r.formalized && r.ridership >= 100 && r.profitability >= 50) add(`route-formalize-${r.id}`, 'opportunity', 'A corridor is ready for formalization', `${r.originName} ↔ ${r.destinationName} has a sustained passenger base. Recognized stops can improve reliability and boarding.`, 'mobility', tile, r.path);
  }
  if (city.mobility.hubs.length) { const hub = city.mobility.hubs[0]; add('transport-hub', 'opportunity', 'An organic transport hub is active', `${hub.routes.length} routes converge at ${hub.name}. Passenger activity can support nearby shops.`, 'mobility', city.tiles[hub.tileId]); }
  for(const c of city.governance?.challenges.filter(c=>!c.resolved)??[]){if(['power','water','flood','traffic','employment','school','health','waste','commute'].includes(c.kind))continue;add(`governance-${c.id}`,c.severity,c.title,readableMoney(c.description),c.overlay,c.tileId!==null?city.tiles[c.tileId]:undefined);}
  return pulses.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.id.localeCompare(b.id));
}

export class CityPulseTracker {
  active: CityPulse[] = [];
  history: CityPulse[] = [];
  private identity: string | null = null;
  update(city: City) {
    const identity = `${city.seed}:${city.name}`;
    if (identity !== this.identity) { this.active = []; this.history = []; this.identity = identity; }
    const next = detectCityPulse(city), old = new Map(this.active.map(p => [p.id, p]));
    const matched = new Set<string>();
    for (const p of next) {
      // Keep a growing/receding flood patch's timestamp even when its boundary changes.
      const previous = old.get(p.id) ?? (p.id.startsWith('flood-') ? this.active.find(a => !matched.has(a.id) && a.id.startsWith('flood-') && a.tileIds.some(id => p.tileIds.includes(id))) : undefined);
      if (previous) { p.timestamp = previous.timestamp; matched.add(previous.id); }
    }
    for (const p of this.active) if (!matched.has(p.id)) this.history.unshift({ ...p, resolved: true });
    this.history = this.history.slice(0, 40); this.active = next;
  }
  reset() { this.identity = null; this.active = []; this.history = []; }
}

export function pulseHtml(tracker: CityPulseTracker) {
  const cards = tracker.active.map(p => `<button class="pulse-card ${p.severity}" data-pulse="${escapeHtml(p.id)}"><small>${p.severity} · Day ${p.timestamp + 1}</small><b>${escapeHtml(p.title)}</b><span>${escapeHtml(p.description)}</span><em>${p.tileId !== null ? 'Find this area ↗' : p.id === 'budget' ? 'Review economy ↗' : p.id.startsWith('governance-') ? 'Open Govern ↗' : 'Review city data ↗'}</em></button>`).join('');
  return `<p>Problems and opportunities from your city’s current conditions. Select an item to investigate.</p>${cards || '<p class="pulse-empty">No pressing problems or strong opportunities right now. Keep watching your city.</p>'}${tracker.history.length ? `<details><summary>Recently resolved · ${tracker.history.length}</summary>${tracker.history.slice(0, 6).map(p => `<p>Resolved · ${escapeHtml(p.title)}</p>`).join('')}</details>` : ''}`;
}
