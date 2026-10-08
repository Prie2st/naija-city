# Game Specification

## Core philosophy

The player plans and governs; the city develops itself. Build roads and zone land. Private households and businesses evaluate conditions, construct buildings, fill capacity, expand, struggle, close and recover without manual placement or revenue collection.

## Current implemented milestone: 8

Planned bus/BRT services extend existing aggregate mobility through connected walking access, ordered stops, bounded transfers and generalized time/fare/reliability cost. Passenger demand comes from existing OD flows. Fleet/depot support, headway, crowding, fares, subsidies and road performance govern operation. Danfo/Keke remain organic and participate as feeders or competing services.

Dedicated BRT corridors require suitable roads and trade general-vehicle capacity for reliable person throughput. Stations, terminals, interchanges, depots, junction treatments and short construction disruption enable metropolitan planning. Actual useful access supports gradual, bounded development through existing organic rules. Network overlays, temporary inspectors, spatial challenges, district measures, daily rhythm and offline summaries expose effects.

Version 9 saves migrate versions 1–8 while preserving old storage keys and legacy public services. The architectural renderer, camera/DPR and all earlier systems remain authoritative. No rail, metro, individual passengers, detailed timetables or Milestone 9. See `docs/transit.md`.

## Milestone 7

Public safety is spatial and aggregate. Structural crime pressure is distinct from current safety, effective police response, lighting, prevention and decaying incident effects. No demographic identity, income band or informal tenure is a direct crime input. Broad non-graphic incidents depend on seeded risk and actual population/activity; one incident cannot collapse a neighborhood.

Police posts/stations/area commands reuse actual staffing, budgets, utilities, capacity and cached road access. Congestion/flooding/disconnection and response overload matter. Road-class lighting requires power. Four gradually effective programmes support lighting, community safety, commercial patrol and hub safety. Local business activity, land value, migration, satisfaction and QoL receive modest safety feedback. District metrics, temporary panels, City Pulse, history and offline summaries expose causes and responses.

Version 8 saves safely migrate previous versions and retain old storage keys. Renderer/DPR/camera and all previous gameplay remain intact. Milestone 7 scope ended here. Prisons, courts, criminal NPCs, violent visuals, oppressive enforcement, political policing remain excluded.

## Milestone 6

Governance extends the existing city with bounded, gradually effective residential/commercial/industrial taxation; paid citywide and district programmes; distinct governable district boundaries; indicative housing/rental affordability and cost-of-living estimates; environmental quality; infrastructure priorities; emergent challenges; approximate forecasts; outcome-based planning objectives; and bounded monthly histories.

All private development remains organic. Policies do not bypass housing capacity, job accessibility, road access, construction, utility or public-service requirements. Community upgrading, integration and supported formalization preserve informal livelihoods and depend on actual services. Clearance retains displaced residents until rehousing or gradual departure. District names/boundaries do not overwrite organic neighborhood identity.

Save version 7 migrates versions 1–6. Governance uses normal deterministic simulation ticks and offline replay. The existing renderer, architecture assets, camera/DPR and responsive HUD remain authoritative. Municipal controls use temporary panels/bottom sheets; charts render only when open. See `docs/governance.md` for model balance and limitations.

Milestone 5 public education, healthcare, fire response, waste collection/disposal and parks remain implemented. Elections, parties, loans and deep macroeconomics remain deferred. Public safety now follows the Milestone 7 section above.

## Earlier implemented milestones

Milestone 4.5 connects existing aggregate systems through a shared, normalized hourly activity snapshot. Morning work demand, evening return paths, business schedules, night activity, rainfall, utilities and actual transit pressure drive bounded representative pedestrians and vehicles. Rendering performs no citizen simulation or pathfinding. The five-second daily economy and offline architecture remain intact; hourly activity is not an hourly utility-dispatch model.

Business lifecycle includes sustained-loss closure and cooldown-based replacement businesses; economic closure removes employment/output/customer activity while flood closure remains temporary. Sampled households explain real concerns, satisfaction exposes its exact contributions, and developed clusters retain neighborhood names with local statistics. Suitable sustained demand produces small organic markets and modest informal employment; sustained housing pressure permits suitable informal compounds that integrate through actual public services. City Feed reports state transitions with deduplication/cooldowns; bounded recent reports, milestones and identities persist in version 5 saves. Existing versions 1–4 migrate safely with original browser keys retained.

Validation must cover all existing milestones plus rhythms, reverse commuting, weather/utility activity, stop waiting, business closure/reopening, neighborhood identity, markets, informal housing, employment conservation, save migration and deterministic chunked offline replay. Developer fixtures at 200/5,000/50,000/250,000 residents must demonstrate bounded agents and responsive desktop/mobile controls. No Milestone 5 systems, citizen RPG simulation, deep policy model or graphics pipeline redesign are included.

Slice 1 provides a deterministic 32×32 isometric map, local roads, residential/commercial/industrial zones, aggregate population, treasury, a five-second city-day clock, speed controls, local saves and bounded offline catch-up.

Slice 1.5 provides a full-viewport map, compact HUD, contextual toolbar panels and inspectors, secondary settings/debug controls, new-city introduction, seeded vegetation clusters and placement feedback.

Milestone 2 adds condition-driven 0–100 demand, explainable parcel attractiveness, a paced development queue, site preparation and construction, five private building levels per zone, capacity-constrained migration, statistical employment, land value, business performance, automatic taxes, satisfaction, redevelopment and recoverable abandonment. Names and building variants are deterministic. Residents and businesses are aggregate simulations.

Milestone 3 adds electricity, water, drainage and weather/flood resilience. Electricity requires generation and substations; water requires production and local distribution. Capacity, coverage, condition and demand determine reliability. Private generators, tanks and boreholes emerge gradually under unreliable service, carrying costs and pollution. Higher density requires increasingly reliable public services and drainage.

Seeded weather persists for several days, with configurable dry/rainy seasons. Rainfall generates runoff according to paving, density, vegetation, elevation and river proximity. Floodwater accumulates and recedes locally; major floods interrupt roads/businesses without destroying buildings. Drains materially change outcomes under comparable storms. Service quality and flood history affect investment, property values, output and satisfaction.

## Architecture and persistence

Milestone 3.5 adds adaptive developed-area Home framing, RES/COM/IND demand labels, explicit weather warnings, graduated rain/wet-road/flood presentation, more distinct private building uses and density levels, readable drainage, and state-authoritative backup props. City Pulse reads existing simulation state, groups connected flood areas, prioritizes problems/opportunities, resolves obsolete notices, and focuses affected tiles with relevant overlays. Pulse history and fading surface wetness are temporary presentation state; version 3 saves and simulation rules are unchanged.

Keep simulation in `shared/simulation/`, state in `shared/types/`, rendering in `client/game/`, management controls in `client/ui/` and `client/main.ts`, and interchangeable storage in `client/persistence/`. Simulation must not import Phaser or DOM APIs.

Save version 4 additionally persists road classes, aggregate OD demand, mobility metrics, informal/formal/bus routes, stops, hubs and route history. Versions 1–3 migrate with original keys retained. Visual vehicles are temporary renderer state. Version 3 persists all organic development and infrastructure state, including condition, adaptations, storage, weather, floodwater and history. Versions 1 and 2 migrate with their original storage keys retained. A small starter network supports the founding settlement and migration; expansion requires investment. Offline progression executes the same deterministic daily rules as active play, capped at 24 real hours. Browser catch-up yields between tick batches; the simulation remains independent of the DOM. Pause applies only to active play.

## Milestone 4 exclusions (historical; current scope above)

Do not implement BRT, rail, metro, ferries, airports, intercity transport, detailed parking, accidents, police enforcement, healthcare, education, crime/security, multiplayer, politics or server persistence. Keep the responsive game HUD and touch placement controls. Use single-tile redevelopment; multi-tile buildings and player-created districts remain future work. Stop after Milestone 4.

## Acceptance

A player extends roads, zones nearby land, and watches construction start gradually, residents arrive, businesses hire, land gain value and buildings rebuild into denser forms. Full housing limits migration; oversupply lowers demand; prolonged poor conditions allow closures and recovery. Inspectors explain these conditions. Save/reload and offline progression preserve construction, business and upgrade state.

Run simulation tests, production build and desktop/mobile browser checks before finishing a milestone. Test demand, attractiveness, construction, housing, migration, labour, land/property values, businesses, decline, taxes, save migration and deterministic offline progression.

Infrastructure acceptance: demand can exceed a finite starter network, resilience emerges privately, added generation/distribution restores service, drainage reduces flooding under a comparable storm, and reliable infrastructure unlocks actual higher-density redevelopment. Tests must cover capacity versus coverage, demand profiles, solar/weather, maintenance, shortages/recovery, runoff/flood recovery, economy/development integration and online/offline equivalence.

## Simplifications

One tick remains one city day. Electricity uses a representative six-hour load/solar sample that rotates between days; it is not an hourly dispatch model. Distribution uses radius coverage without individual cables/pipes. Hydrology uses local water balance rather than fluid flow between tiles. Elevation is seeded approximate terrain. Rain effects are bounded screen-space strokes with normal/low/off quality. Infrastructure calculations run on ticks; coverage reach is cached by layout revision.

## Milestone 4 acceptance

Aggregate residents statistically connect to reachable job locations and shops through a cached road graph. Work and shopping trips choose walking, cars, Okada and available shared services. Capacity, road class, congestion, weather and flooding affect journeys and accessibility. Repeated viable demand creates Keke/Danfo routes; operators expand, struggle and withdraw. Converging services create stops/hubs and passing customers. Formalization improves boarding/reliability while retaining private operators; government buses follow player-selected road waypoints and have capital, fare and operating budgets.

Mobility affects employment matching, satisfaction, commercial output, land value and explainable development scores. Traffic and mobility overlays, inspectors, Pulse actions, bounded representative vehicles and responsive Transport panels make consequences visible. Routing runs on simulation evaluations, never rendered frames; travelers remain aggregate. Offline progression and versioned saves preserve all simulation state.

Tests cover trip conservation, destination allocation, routing/detours, road upgrades/capacity, progressive congestion, walking/car/Okada choice, organic Keke/Danfo emergence, operator profit/growth/decline, hubs, bus governance, weather disruptions, business/development/land effects, Pulse resolution, migration and online/offline equivalence.

## Graphics upgrade acceptance

Rendering retains the existing isometric projection, simulation authority and version 4 saves. A separate 24 m visual reference establishes believable proportions without altering calibrated travel distances. Deterministic atlas artwork supports five private-building levels, material/roof variants, compounds, storefronts, yards, construction and abandonment. Road classes connect through coherent intersections; vegetation, terrain, water, drainage, utilities and representative transport share warm lighting and grounding.

The renderer uses one reusable 209-frame atlas, pooled sprites, view culling and zoom/quality detail limits. Private adaptations, traffic, construction and floods remain representations of actual simulation state. Quality/debug settings are presentation-only. Professional artwork can replace atlas frames without simulation changes. Physical mobile performance and final asset production remain validation/art tasks. Stop after this graphics upgrade; no Milestone 4.5 or 5 gameplay is introduced.

## Resolution and inspection rendering

Street inspection extends to logical 6× zoom without changing tile coordinates or simulation distances. The renderer separates CSS canvas size from backing-buffer size and caps DPR by graphics quality. Linear filtering uses native-resolution vector-master atlas tiers; close views never intentionally magnify prototype-resolution assets. A bounded cache uses vector rendering if a detailed frame cannot fit. Wheel and pinch focus, smooth zoom, panning, developed-area Home and responsive HUD behavior remain supported. No new gameplay or save-format changes are included.

## Locked visual direction: living architectural model

The target is a premium physical architectural masterplan model brought to life: approximately 85% architectural realism and 15% miniature readability. Earlier painted/illustrated sprites are legacy artwork, not the target. A 20 m visual tile, shared 45°/30° orthographic camera, dimensional floors, restrained materials and coherent soft daylight govern future source assets. Existing projection, 6× zoom, DPR, calibrated simulation distances, HUD and version 4 saves remain unchanged.

The approval benchmark contains bungalow/duplex properties; four-, eight- and fourteen-storey apartments; courtyard apartments; shops; modern commercial architecture; a warehouse; and three engineered street classes. An isolated dense block demonstrates four apartment buildings, shared courtyard, parking, paths, trees and street frontage. Blender sources render offline into high-resolution transparent masters, then bounded LOD atlases. Runtime Phaser composes assets; simulation remains authoritative. Do not convert the full library or begin Milestone 4.5/5 before visual approval. See `docs/architectural-model/art-direction.md`.

## Visual Lab: independent masterplan benchmark

`/visual-lab/` is a developer-only, simulation-independent composition study. It must not read city saves, population, demand or treasury, and must not change production assets before approval. Five districts share one architectural-model visual language. The priority district contains eight 6–12-storey apartment buildings arranged around connected courtyards, paths, parking, landscaping, streets and service yards.

Visual groups represent compounds, terraces and multi-building complexes independently from logical simulation units. Existing population, occupancy and economic calculations stay unchanged. Architectural sprites contain no opaque plot backgrounds; continuous public-realm geometry joins buildings to their streets. A 4.6×1.8 m sedan establishes scale: 3.1 m lanes, 6.4 m local streets, 12.4 m avenues, and a 21.4 m six-lane boulevard including a 2.8 m median. Parking bays are 2.6×5.2 m.

Actual Blender geometry renders offline into transparent 24-sample masters with the locked orthographic camera. Five articulated apartment forms, terraces, one bungalow, mixed-use architecture, four vegetation categories, six vehicle silhouettes and engineered utilities establish the benchmark. Phaser composes addressable sprites and batched public-realm surfaces; there are no AI scene backgrounds or runtime window objects. LOD, visible-page loading, culling and quality presets keep costs bounded. Production camera/DPR, UI, saves and all Milestone 1–4 systems remain unchanged.

Developer camera presets and clean frame exports support comparison with the approved architectural reference. The Lab is a static art study, not simulated transport or a new city progression mode. Physical Android performance and remaining interactive browser checks require validation. Stop at this benchmark; no mass conversion, Milestone 4.5 or Milestone 5.

## Previous Art Pass 2 benchmark (legacy)

Replace matching private-building visuals with six structurally distinct Level 1 residential assets, three Level 2 residential assets, four Level 1 shops, two industrial properties and two construction stages. Architectural sprites include roof/material detail, entrances, compound boundaries, fictional signage and ground integration. Separate generator/tank/pump sprites attach to manifest sockets only when existing simulation state requires them. Drain crossings require actual adjacent drainage and roads.

Offline high-resolution masters compile into bounded multi-resolution PNG atlases. Runtime Phaser composes sprites, with culling, lazy close-sheet loading and deterministic saved variants. Camera/DPR, HUD, simulation and version 4 persistence remain unchanged. Higher-level/private and other world assets remain procedural until benchmark quality is approved. Stop at this set; no Milestone 4.5 or additional gameplay.
