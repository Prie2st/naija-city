import type { City } from '../types/city';
import type { UrbanChallenge } from '../types/governance';
import { feedEvent } from './living-city';
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
    if (r.status === 'disrupted') add(`transit-disrupted:${r.id}`, `${r.name}: service disrupted`, 'Stops or the route path are unavailable. Alternative paths are used where feasible.', r.path[Math.floor(r.path.length / 2)] ?? null, 'transit-network', ['Restore flooded roads and drainage', 'Edit route stops', 'Build an alternative connection']);
    if (r.crowding > 1.15 && r.demand > 50) add(`transit-crowded:${r.id}`, `${r.name}: passenger crowding`, `${Math.round(r.crowding * 100)}% demand/capacity. Waiting and alternatives matter.`, r.path[Math.floor(r.path.length / 2)] ?? null, 'transit-ridership', ['Add vehicles and depot capacity', 'Provide a parallel route', 'Upgrade a suitable corridor to BRT'], r.crowding > 2);
  }
  for (const s of t.stops) if (s.crowding > .85 && ['bus-terminal', 'transport-interchange', 'brt-station'].includes(s.kind)) add(`transit-hub:${s.id}`, `${s.name}: passenger handling pressure`, `${Math.round(s.crowding * 100)}% of handling capacity. Converging services increase local activity and road pressure.`, s.tileId, 'transit-ridership', ['Distribute transfers to another hub', 'Improve connected services', 'Provide additional passenger facilities']);
  const isolated = city.tiles.map((tile, id) => ({ tile, id })).filter(({ tile, id }) => (tile.building?.occupants ?? 0) > 100 && t.local[id].access < 15 && tile.mobility.accessibility < 45);
  if (isolated.length && t.routes.length) add('transit-desert', 'Homes lack useful transit access', `${isolated.length} occupied parcels have weak access to useful transit and employment.`, isolated[0].id, 'transit-accessibility', ['Improve first-mile connections', 'Integrate Danfo/Keke feeders', 'Connect homes to employment with a viable route']);
  if (t.finance.subsidy > Math.max(10000000, city.income * .5)) add('transit-subsidy', 'Transit subsidy pressure', `Monthly planned-network subsidy ₦${Math.round(t.finance.subsidy).toLocaleString()}. Construction affordability does not guarantee operating affordability.`, null, 'none', ['Review empty/duplicate service', 'Adjust fares or fleet frequency', 'Keep socially useful routes with an intentional subsidy']);
  const alive = new Set(detected.map(c => c.id));
  for (const old of previous) if (old.kind === 'transit-network' && !old.resolved && !alive.has(old.id)) { old.resolved = true; old.resolvedAt = city.tick; if (emit) feedEvent(city, `resolved:${old.id}`, `${old.title} has eased.`, old.tileId, 'notice'); }
  for (const c of detected) if (emit && !previous.some(old => old.id === c.id && !old.resolved)) feedEvent(city, c.id, `${c.title}: ${c.description}`, c.tileId, 'warning');
  city.governance.challenges = [...detected, ...previous.filter(c => c.kind !== 'transit-network' || c.resolved)].slice(0, 64);
}
