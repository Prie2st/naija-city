# Metropolitan transit — Milestone 8

## Architecture

`shared/types/transit.ts` defines routes, passenger facilities, depot support, transfer demand, local/district accessibility and finance. `transit.ts` manages assets and periodic service evaluation; `transit-network.ts` caches connected walking catchments and bounded-transfer searches. Existing aggregate OD generation, employment matching, road routing and organic operators remain in `mobility.ts`. The renderer reads paths and activity snapshots; no persistent passenger or visual vehicle entities are saved.

Build stops/stations, a connected depot, and then select passenger facilities in journey order through **Transport → Bus / BRT**. Routes can be named, priced, suspended, edited or retired. **Network** exposes integration, fare support, district access and facility construction. Road inspectors offer junction treatments. Construction purchases and monthly operation are separate commitments.

## Balance assumptions

The existing calibrated transport distance remains 120 m per simulation cell; visual architectural scale and camera/DPR are unchanged. Walking catchments traverse up to five connected dry-road cells plus the building entrance. A route accepts 2–16 stops; up to 200 planned routes and 256 facilities are supported. Network searches allow at most two transfers. Approximate service uses 16 operating hours/day, generalized walking/wait/fare/reliability cost and no detailed timetable.

Conventional buses carry 50 passengers; BRT vehicles carry 90. Frequency follows a round-trip cycle including dwell, layover and a modest depot deadhead effect, with a 1.5-minute minimum headway. Bus/BRT vehicles cost ₦12M/₦42M and operate at ₦60K/₦110K per day. Depots support 60 vehicles before condition/access reductions. These are configurable gameplay parameters, not empirical Nigerian transport estimates.

Dedicated lanes cost ₦1.8M per road segment and retain 72% of previous general-vehicle capacity. Avenue/major-road corridors and stations are required. Four-day works temporarily retain 60% capacity. Junctions model aggregate bottlenecks rather than traffic signals/lane-level turns. Roundabouts help moderate volumes and can underperform at very high volumes.

Passenger demand comes exclusively from existing work, shopping and service OD flows. Ridership and boardings differ when transfers are used. Low-demand routes still cost money; capacity-constrained service leaves some passengers using alternatives. Fares/support change generalized cost and municipal finances. Danfo/Keke can feed the shared graph and compete; existing organic profitability and withdrawal remain authoritative.

Useful station access contributes bounded, smoothed development support up to eight points. It cannot place buildings or bypass zoning, demand, construction, utilities, services or policy. Night safety and rainfall affect activity; flooded access disrupts routes or triggers real road detours.

## Persistence and limits

Version 9 adds planned transit state and safely migrates versions 1–8 while retaining original storage keys. Existing public buses are adapted with their identities, paths and fleets; migration does not charge for another fleet or depot. Those legacy services retain their earlier road-waypoint operation. New planned services require depot support. Paths, references, finite fares/capacities and bounded histories are validated.

Offline progression executes the same daily aggregate rules. Visual buses and waiting passengers regenerate only when rendering. Local accessibility is an approximate planning measure over existing grouped OD destinations, not an exhaustive individual travel survey. BRT and buses reuse the existing vehicle art with route color/line identity; dedicated production station/depot art remains future work.

Rail, metro, trams, ferries, airports, individual passengers, detailed timetables, driver staffing, breakdown micromanagement, manual signal timing and full-3D interchanges remain excluded. No Milestone 9 work is included.

## Validation

Deterministic tests and isolated browser checks cover useful/useless routes, fleet support, fares, transfers, BRT capacity tradeoffs, informal coexistence, station-area development, flood/safety effects, migration, offline equivalence and large networks. Measured results are added after validation completes.
