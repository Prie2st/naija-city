import type { City } from '../types/city';
import type { UrbanChallenge } from '../types/governance';
import { feedEvent } from './living-city';
import { TRANSIT as C } from './transit-config';
export function transitChallenges(city: City, emit = true) {
  const detected: UrbanChallenge[] = [], previous = city.governance.challenges, t = city.transit;
  const add = (id: string, title: string, description: string, tileId: number | null, overlay: UrbanChallenge['overlay'], responses: string[], critical = false) => {
    const old = previous.find(c => c.id === id && !c.resolved);
    detected.push({ id, kind: 'transit-network', title, description, tileId, overlay, responses,
      causes: ['Actual trip demand, reachable stops, frequency, road reliability and fleet capacity'], severity: critical ? 'critical' : 'warning', districtId: null, timestamp: old?.timestamp ?? city.tick, resolved: false, resolvedAt: null });
  };
  for (const r of t.routes) {
    if (r.suspended) continue;
    if (r.status === 'no-depot') add(`transit-depot:${r.id}`, `${r.name}: fleet support missing`, 'Assigned vehicles lack reachable depot capacity.', r.path[0] ?? null, 'transit-network', ['Build a connected depot', 'Reduce fleet commitments']);
    if (r.status === 'disrupted') {
      const flooded = r.path.some(id => city.tiles[id].services.floodDepth >= 35) || r.stops.some(id => { const s = t.stops.find(s => s.id === id); return !!s && city.tiles[s.anchor].services.floodDepth >= 35; });
      add(`transit-disrupted:${r.id}`, `${r.name}: service disrupted${flooded ? ' by flooding' : ''}`, flooded ? 'Floodwater has cut stops or roads on this route. It reroutes where a dry road exists and recovers as the water recedes.' : 'Stops or the route path are unavailable. Alternative paths are used where feasible.', r.path[Math.floor(r.path.length / 2)] ?? null, 'transit-network', ['Restore flooded roads and drainage', 'Edit route stops', 'Build an alternative connection']);
    }
    if (r.crowding > 1.15 && r.demand > 50) add(`transit-crowded:${r.id}`, `${r.name}: passenger crowding`, `${Math.round(r.crowding * 100)}% demand/capacity. Waiting and alternatives matter.`, r.path[Math.floor(r.path.length / 2)] ?? null, 'transit-ridership', ['Add vehicles and depot capacity', 'Provide a parallel route', 'Upgrade a suitable corridor to BRT'], r.crowding > 2);
  }
  for (const s of t.stops) if (s.crowding > .85 && ['bus-terminal', 'transport-interchange', 'brt-station'].includes(s.kind)) add(`transit-hub:${s.id}`, `${s.name}: passenger handling pressure`, `${Math.round(s.crowding * 100)}% of handling capacity. Converging services increase local activity and road pressure.`, s.tileId, 'transit-ridership', ['Distribute transfers to another hub', 'Improve connected services', 'Provide additional passenger facilities']);
  const isolated = city.tiles.map((tile, id) => ({ tile, id })).filter(({ tile, id }) => (tile.building?.occupants ?? 0) > 100 && t.local[id].access < 15 && tile.mobility.accessibility < 45);
  if (isolated.length && t.routes.length) add('transit-desert', 'Homes lack useful transit access', `${isolated.length} occupied parcels have weak access to useful transit and employment.`, isolated[0].id, 'transit-accessibility', ['Improve first-mile connections', 'Integrate Danfo/Keke feeders', 'Connect homes to employment with a viable route']);
  if (t.finance.subsidy > Math.max(10000000, city.income * .5)) add('transit-subsidy', 'Transit subsidy pressure', `Monthly planned-network subsidy ₦${Math.round(t.finance.subsidy).toLocaleString()}. Construction affordability does not guarantee operating affordability.`, null, 'none', ['Review empty/duplicate service', 'Adjust fares or fleet frequency', 'Keep socially useful routes with an intentional subsidy']);
  // The single worst heavily used road link, with responses that move more people.
  let corridor = -1;
  for (let id = 0; id < city.tiles.length; id++) { const m = city.tiles[id].mobility; if (city.tiles[id].road && m.dailyTrips >= C.corridorTrips && m.congestion >= C.corridorCongestion && (corridor < 0 || m.congestion > city.tiles[corridor].mobility.congestion)) corridor = id; }
  if (corridor >= 0) {
    const m = city.tiles[corridor].mobility, flow = city.mobility.flows.find(f => f.id === m.majorFlow);
    add('transit-corridor', 'Major corridor congestion', `${Math.round(m.congestion)}% congestion${flow ? ` on the ${flow.originName} ↔ ${flow.destinationName} corridor` : ''}. Moving more people needs more than space for cars.`, corridor, 'traffic', ['Add dedicated BRT lanes on an avenue or major road', 'Upgrade the busiest junctions', 'Run a frequent bus route along the corridor', 'Upgrade the road or add a parallel link'], m.congestion >= 95);
  }
  // Home areas whose commuters mostly cannot reach work within the job-access threshold.
  const homes = new Map<number, { name: string; trips: number; within: number }>();
  for (const f of city.mobility.flows) if (f.purpose === 'work' && f.trips > 0) {
    const area = homes.get(f.origin) ?? { name: f.originName, trips: 0, within: 0 };
    area.trips += f.trips; if (f.minutes <= C.jobMinutes) area.within += f.trips; homes.set(f.origin, area);
  }
  const poor = [...homes.entries()].filter(([, a]) => a.trips >= C.jobAccessTrips && a.within / a.trips < C.jobAccessShare).sort((a, b) => a[1].within / a[1].trips - b[1].within / b[1].trips || a[0] - b[0])[0];
  if (poor) add('transit-job-access', 'Poor job accessibility', `Only ${Math.round(poor[1].within / poor[1].trips * 100)}% of commuters from ${poor[1].name} reach work within ${C.jobMinutes} minutes.`, poor[0], 'jobs-accessible', ['Connect these homes to job centres with a viable bus or BRT route', 'Improve feeder access to existing stations', 'Zone employment closer to these homes', 'Relieve congested links on the way'], poor[1].within / poor[1].trips < .25);
  const alive = new Set(detected.map(c => c.id));
  for (const old of previous) if (old.kind === 'transit-network' && !old.resolved && !alive.has(old.id)) { old.resolved = true; old.resolvedAt = city.tick; if (emit) feedEvent(city, `resolved:${old.id}`, `${old.title} has eased.`, old.tileId, 'notice'); }
  for (const c of detected) if (emit && !previous.some(old => old.id === c.id && !old.resolved)) feedEvent(city, c.id, `${c.title}: ${c.description}`, c.tileId, 'warning');
  city.governance.challenges = [...detected, ...previous.filter(c => c.kind !== 'transit-network' || c.resolved)].slice(0, 64);
}
