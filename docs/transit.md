# Metropolitan transit — Milestone 8

## Architecture

`shared/types/transit.ts` defines routes, passenger facilities, depot support, transfer demand, local/district accessibility and finance. `transit.ts` manages assets and periodic service evaluation; `transit-network.ts` caches connected walking catchments and bounded-transfer searches. `transit-metrics.ts` derives person capacity per road, district mobility and the diagnostics report without storing anything. Existing aggregate OD generation, employment matching, road routing and organic operators remain in `mobility.ts`. The renderer reads paths and activity snapshots; no persistent passenger or visual vehicle entities are saved.

Build stops/stations, a connected depot, and then select passenger facilities in journey order through **Transport → Bus / BRT**. Routes can be named, priced, suspended, edited or retired. **Network** exposes integration, fare support, district access and mobility, and facility construction. Road inspectors offer junction treatments and show people moved and people capacity per hour. Construction purchases and monthly operation are separate commitments.

## Balance assumptions

The existing calibrated transport distance remains 120 m per simulation cell; visual architectural scale and camera/DPR are unchanged. Walking catchments traverse up to five connected dry-road cells plus the building entrance. A route accepts 2–16 stops; up to 200 planned routes and 256 facilities are supported. Network searches allow at most two transfers. Approximate service uses 16 operating hours/day, generalized walking/wait/fare/reliability cost and no detailed timetable.

Conventional buses carry 50 passengers; BRT vehicles carry 90. Frequency follows a round-trip cycle including dwell, layover and a modest depot deadhead effect, with a 1.5-minute minimum headway. Bus/BRT vehicles cost ₦12M/₦42M and operate at ₦60K/₦110K per day. Depots support 60 vehicles before condition/access reductions. These are configurable gameplay parameters, not empirical Nigerian transport estimates.

Dedicated lanes cost ₦1.8M per road segment and retain 72% of previous general-vehicle capacity. Avenue/major-road corridors and stations are required. Four-day works temporarily retain 60% capacity. Junctions model aggregate bottlenecks rather than traffic signals/lane-level turns. Roundabouts help moderate volumes and can underperform at very high volumes.

Passenger demand comes exclusively from existing work, shopping and service OD flows. Ridership and boardings differ when transfers are used. Low-demand routes still cost money; capacity-constrained service leaves some passengers using alternatives. Fares/support change generalized cost and municipal finances. Danfo/Keke can feed the shared graph and compete; existing organic profitability and withdrawal remain authoritative. A planned journey only takes the share of bus demand it wins; people choosing an existing bus keep using it, and planned-network overflow tries existing buses before falling back to car, walking or Okada.

Every mode is compared door to door. Car and Okada trips add three minutes for parking or hailing, and walking is the alternative for trips up to 1.2 km. A planned journey's price-based appeal is scaled by its door-to-door time against that alternative, between a fiftieth and double, so slow transit loses riders and a BRT that beats a congested road gains them. The time ratio is squared for journeys slower than the alternative, so a bus that takes twice as long as the road keeps a quarter of its appeal rather than half. On a 30,000-resident corridor a BRT line cuts the average work commute from 13.1 to 9.9 minutes, and from 15.8 to 10.6 minutes under heavy traffic. Mixed-traffic buses on a jammed road lengthen commutes slightly because they share the jam. Where transit is slower than an uncongested road, as on the 10,000-resident test city, cheaper fares still win some riders and the average commute rises by about 0.3 minutes.

### Time of day

`TRANSIT_PERIODS` splits the service day into rush hours (4 h), daytime (9 h) and evening (3 h). Each trip purpose spreads its riders differently: work trips concentrate in the rush, shopping and services in the daytime, and deliveries never use passenger services. Each period can only use its share of daily capacity, so a route that carries its daily demand comfortably can still turn riders away in the rush. Route and stop crowding is the busiest period's load. Evening demand falls by up to 25% when night safety at the stops used drops below 60, reaching the full loss at 20. Period loads are recomputed every evaluation and are not saved.

### Reliability, roads and throughput

Mixed-traffic buses lose one reliability point per route kilometre and BRT 0.3, capped at 10. A terminal or interchange at either end of a route adds four points of layover recovery. Road classes now differ for pedestrians (dirt 0.7, local 1, avenue 0.95, major 0.85 walking quality) and for frontage: avenues and major roads raise commercial and industrial land value, while major roads lower residential attractiveness. Person capacity per road counts general lanes at 1.5 people per vehicle plus the scheduled hourly capacity of active planned services on the tile, so a busy BRT corridor can move more people than the car lanes it replaced.

### Accessibility bands, events and challenges

Useful access is reported as Excellent (70+), Good (45+), Weak (20+) or Poor, and the accessibility overlay draws those four bands. City Feed and history record network boardings at 5,000, 20,000, 50,000 and 100,000; individual routes at 1,000 and 10,000; the best access band a district reaches; and the city reaching good access. Flooded routes are named as flood disruptions. Major corridor congestion (600+ daily trips at 80%+ congestion) and poor job accessibility (an origin with 120+ work trips where under half reach work within 45 minutes) are located urban challenges. Welcome Back reports farebox recovery before and after, the busiest hub's load and disrupted services.

Useful station access contributes bounded, smoothed development support up to eight points. Beside a busy BRT station on the test corridor it reaches 7.6 points and adds about three points of land value, so station-area commercial parcels move up the development queue. It cannot place buildings or bypass zoning, demand, construction, utilities, services or policy. Night safety and rainfall affect activity; flooded access disrupts routes or triggers real road detours.

## Persistence and limits

Version 9 adds planned transit state and safely migrates versions 1–8 while retaining original storage keys. Existing public buses are adapted with their identities, paths and fleets; migration does not charge for another fleet or depot. Those legacy services retain their earlier road-waypoint operation. New planned services require depot support. Paths, references, finite fares/capacities and bounded histories are validated. The Milestone 8 completion work added no saved fields: period loads, person capacity and district mobility are derived on demand, and milestones reuse the existing history and feed records.

Offline progression executes the same daily aggregate rules. Visual buses and waiting passengers regenerate only when rendering. Local accessibility is an approximate planning measure over existing grouped OD destinations, not an exhaustive individual travel survey. BRT and buses reuse the existing vehicle art with route color/line identity; dedicated production station/depot art remains future work.

Deferred modelling issue: transport cost of living follows commute minutes without fully counting fare savings, so a cheap but slower trip reads as wholly negative even when a traveller chooses it to save money.

Rail, metro, trams, ferries, airports, individual passengers, detailed timetables, driver staffing, breakdown micromanagement, manual signal timing and full-3D interchanges remain excluded. No Milestone 9 work is included.

## Validation

`tests/transit.test.ts` covers useful/useless routes, fleet support, capacity relief, fares, rush-hour limits, night safety, transfers including walk → Danfo → BRT, BRT person capacity, shorter commutes on a relieved corridor, journeys slower than the road or walking losing riders, station spacing, informal coexistence, station-area development, flood/safety effects, district mobility, challenges, milestones, Welcome Back, unique names, road consequences, migration and offline equivalence. `tests/transit-long-run.test.ts` runs a drained, populated city (`transitNetworkFixture`) for twenty years and checks 10/50/100/200-route networks and 100k/500k residents.

Measured on the development container (Node 22, one worker):

| Check | Result |
|---|---|
| One mobility evaluation, 10 / 50 / 100 / 200 routes, 152 facilities | 61–82 / 81–118 / 108–195 / 186–442 ms |
| Transit graph builds | One per evaluation; repeated journey queries reuse it |
| 100k residents | 114–142 ms per evaluation, 4.4 s per simulated month, ~20,000 daily boardings |
| 500k residents | 129–132 ms per evaluation, 4.4 s per simulated month, ~34,600 daily boardings |
| Twenty simulated years, 10k residents | Passes: no ridership runaway or collapse, BRT under half of trips, Danfo/Keke still running, subsidies bounded by costs, save growth under 25%, the last three years under 2.5× the time of the first three |

Journey searches key their states by number and share walking-transfer lookups across one graph, which cut a 100k-resident month from about 10.5 s to 4.4 s with identical results. Milestone 8.3 keeps search states in reusable typed columns with shared leg chains, and answers each journey only from states at stops near its destination in the original settle order, so results stay identical while a 140k-resident evaluation with 8 routes drops from about 240 to 120 ms (50 routes: 4.7 to 1.7 s). Traffic and transit now evaluate every third day (`MOBILITY.cadence`); tools and route edits still evaluate at once. `tools/check-transit-browser.cjs` drives route creation, stop selection, the route and stop inspectors, the Network tab, the accessibility overlay and the network view at 390×844, 430×932 and 1440×900 in an isolated browser profile. All three pass with no horizontal overflow and every panel inside the viewport. Start `npm run dev` first; `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `QA_URL` override the defaults, and screenshots go to `.qa/transit/`.
