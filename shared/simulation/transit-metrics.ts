import type { City } from '../types/city';
import { MODES, modeCounts } from './mobility';
import { roadPerformance } from './road-network';
import { TRANSIT as C, TRANSIT_FACILITIES, TRANSIT_PERIODS, TRANSIT_VEHICLES } from './transit-config';
import { transitNetworkDiagnostics } from './transit-network';
import { transitPeriodLoads } from './transit';

/**
 * Approximate people per hour a road tile can move: general lanes at mixed
 * occupancy plus the scheduled capacity of planned services using the tile.
 * A dedicated corridor lowers general lanes but can raise the total.
 */
export function personCapacity(city: City, tileId: number) {
  const tile = city.tiles[tileId];
  if (!tile?.road) return { general: 0, transit: 0, total: 0, moved: 0 };
  const general = roadPerformance(city, tile).capacity * C.generalOccupancy;
  let transit = 0;
  for (const r of city.transit?.routes ?? []) if (r.status === 'active' && r.path.includes(tileId))
    transit += TRANSIT_VEHICLES[r.mode].passengers * 60 / Math.max(C.minHeadway, r.headway) * r.reliability / 100;
  return { general, transit, total: general + transit, moved: tile.mobility.dailyTrips * C.peakShare };
}

/** Per-district transit access, job access, commute quality and mode share. */
export function districtMobility(city: City) {
  return (city.governance?.districts ?? []).map(d => {
    const tiles = new Set(d.tiles), modes = modeCounts();
    let trips = 0, work = 0, commute = 0, within = 0;
    for (const f of city.mobility.flows) if (f.purpose !== 'delivery' && tiles.has(f.origin)) {
      trips += f.trips; for (const mode of MODES) modes[mode] += f.modes[mode];
      if (f.purpose === 'work') { work += f.trips; commute += f.minutes * f.trips; if (f.minutes <= C.jobMinutes) within += f.trips; }
    }
    const access = city.transit?.districts[d.id];
    return { id: d.id, name: d.name, access: access?.access ?? 0, jobs45: access?.jobs45 ?? 0, trips, modes,
      commute: work ? commute / work : 0, within45: work ? within / work * 100 : 0,
      sharedShare: trips ? (modes.bus + modes.brt + modes.danfo + modes.keke) / trips * 100 : 0 };
  });
}

/** Developer diagnostics: demand, boardings, transfers, mode share and capacity in one snapshot. */
export function transitReport(city: City) {
  const t = city.transit, m = city.mobility;
  const routeName = (id: string) => t.routes.find(r => r.id === id)?.name ?? (m.routes.some(r => r.id === id) ? `${m.routes.find(r => r.id === id)!.mode} ${id}` : id);
  const passengers = t.demand.reduce((n, d) => n + d.passengers, 0);
  const periods = (id: string) => { const load = transitPeriodLoads(city, id); return load ? load.riders.map(Math.round) : null; };
  return {
    trips: { daily: m.stats.dailyTrips, flows: m.flows.length,
      top: m.flows.filter(f => f.purpose !== 'delivery').sort((a, b) => b.trips - a.trips).slice(0, 5)
        .map(f => ({ from: f.originName, to: f.destinationName, purpose: f.purpose, trips: f.trips, minutes: f.minutes })) },
    journeys: { count: t.demand.length, passengers,
      transferShare: passengers ? t.demand.reduce((n, d) => n + (d.transfers ? d.passengers : 0), 0) / passengers * 100 : 0,
      minutes: passengers ? t.demand.reduce((n, d) => n + d.minutes * d.passengers, 0) / passengers : 0 },
    periods: TRANSIT_PERIODS.map(p => p.name),
    routes: [...t.routes].sort((a, b) => b.ridership - a.ridership).slice(0, 12).map(r => ({ name: r.name, mode: r.mode, status: r.status,
      ridership: r.ridership, demand: r.demand, capacity: r.capacity, crowding: r.crowding, reliability: r.reliability, headway: r.headway, periods: periods(r.id) })),
    stops: t.stops.filter(s => s.kind !== 'bus-depot').sort((a, b) => b.boardings - a.boardings).slice(0, 6)
      .map(s => ({ name: s.name, kind: TRANSIT_FACILITIES[s.kind].name, boardings: s.boardings, transfers: s.transfers, crowding: s.crowding })),
    transfers: [...t.transfers].sort((a, b) => b.passengers - a.passengers).slice(0, 6).map(f => ({ from: routeName(f.from), to: routeName(f.to), tileId: f.tileId, passengers: f.passengers })),
    modes: m.stats.modes, access: t.stats.access, jobs45: t.stats.jobs45, reliability: t.stats.reliability, throughput: t.stats.throughput,
    cache: transitNetworkDiagnostics(city),
  };
}
