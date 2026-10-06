# Naija City

A browser city-building game set in **Ilu Alafia**, a fictional Nigerian riverland settlement. The player plans and governs; the city develops itself.

## Development

Requires Node.js 20.19+ or 22.12+ and npm.

## Milestone 8: metropolitan transit

Formal buses and BRT share ordered stops, connected walking catchments, bounded transfers, real OD ridership, fleet/depot capacity, frequency, crowding and monthly finance. Danfo/Keke remain organic and can feed or compete with planned routes. Dedicated corridors trade general road capacity for reliable person throughput.

Use **Transport → Bus / BRT / Network** to place stops/stations/depots, create and govern services, inspect accessibility and compare districts. Junction treatments, temporary works, transit overlays, City Pulse, actual waiting activity and pooled representative buses expose consequences. Current saves are version 9 with versions 1–8 migrated and original keys retained. See [transit architecture, balance and validation](docs/transit.md). Rail/metro and Milestone 9 remain excluded.

## Milestone 7: public safety and emergency response

Spatial safety combines structural crime pressure, community prevention, powered road lighting, bounded recent incident memory and effective police response. Employment, stable housing, public services and active streets can support safe neighborhoods without extensive policing; income and informal tenure are never direct crime inputs.

Police posts, stations and area commands use existing public-service placement, real public-sector staff, funding, electricity, condition, operating costs and cached road access. Congestion, disconnection and flooding delay dispatch. Busy stations queue responses and lose patrol effectiveness. Four gradually implemented city/district programmes support lighting, community prevention, commercial patrol and transport-hub safety.

Use **Services → Police**, **Governance → Safety**, the safety Data overlays, or contextual incident inspectors. Serious incidents appear in City Pulse; the map and pooled vehicle layer display actual incidents/responses. Offline simulation uses identical deterministic rules and summarizes incidents and safety changes. Milestone 7 introduced version 8 saves; previous browser keys are retained.

See [safety balance and validation](docs/safety.md). `tools/check-safety-browser.cjs` checks isolated desktop/tablet/mobile controls and aggregate performance. No criminal NPCs, prisons, enforcement politics or graphics pipeline changes are included.

## Milestone 6: city governance, policies and urban challenges

Open **Economy → City governance** for municipal budgets, gradual bounded taxes, citywide/district policies, housing affordability, district comparison and development outlook. Policies influence actual private development, business performance, travel choices, maintenance and community integration. Contextual district selection works through two map taps. Clearing occupied housing retains displaced residents while they seek replacement homes.

Governance analysis runs on simulation ticks, independently of Phaser. Saves are version 7; versions 1–6 migrate with original keys retained. Offline progression applies the same policies, taxes, housing and challenge rules. Monthly histories and approximate forecasts support planning rather than quests. See [architecture, controls, balance and limitations](docs/governance.md). Run the isolated normal-UI browser checks with `node tools/check-governance-browser.cjs`.

Milestone 6 governance remains intact. Elections, parties and loans remain deferred. Rendering, camera, DPR, asset pipeline and the existing six-category HUD are preserved.

## Milestone 5: public services and Quality of Life

Services now includes Primary/Secondary Schools, Primary Health Centres, General Hospitals, Fire Stations, Waste Depots/Landfills and three sizes of park. Facilities require road access, actual public staff, reliable utilities, sufficient capacity and ongoing funding. Use contextual build cards and access previews, then inspect demand, delivered capacity, service quality and costs. Touch placement still previews before confirmation.

Public jobs draw from the existing reachable workforce. Schools and parks generate aggregate daytime activity; depots and fire incidents produce representative service vehicles on actual paths. Collection needs connected disposal capacity, so a depot alone cannot remove waste. Seeded fires cause bounded damage and gradual repair. Services influence local satisfaction, land value, business performance and organic development; no individual citizens or patients are simulated.

Data contains Education, Healthcare, Fire, Waste, Parks and Quality of Life overlays. QoL is a slower structural measure with a ten-component breakdown and neighborhood differences. Economy separates five public-service expenditure categories with 50–150% funding and diminishing gains above 100%. City Feed, household concerns, history and Welcome Back reflect real service outcomes.

`shared/types/public-services.ts` defines facility/local state; `public-service-config.ts` holds balance; `public-service-access.ts` caches road-aware maps; `public-services.ts` updates allocation, waste, incidents and QoL on simulation ticks. `client/ui/public-service-panels.ts` and `client/game/public-service-art.ts` integrate the existing UI/renderer without changing the architectural atlas, camera or DPR pipeline. Facility models currently reuse established artwork.

The isolated development page `/public-service-check.html` provides 1k/10k/100k/500k stress fixtures and failure/recovery controls. Browser scripts are `tools/check-public-services-browser.cjs` and `tools/check-public-service-controls.cjs`. See [validation, balancing and limitations](docs/public-services-validation.md). Milestone 5 introduced version 6; current saves use version 8. Versions 1–7 migrate with original storage keys retained. Universities and electoral politics remain deferred; public safety is described above.

## Milestone 4.5: the living city

The existing five-second city day now has a smooth representative hourly rhythm. The calendar shows the activity hour; weekday/weekend patterns, morning commuting, evening return trips and quieter nights drive current street activity. Daily economics, utility dispatch and deterministic offline ticks remain unchanged. This is an aggregate activity profile, not an hourly wage or energy dispatch simulation.

`shared/simulation/activity.ts` derives a read-only `CityActivity` snapshot at 10 Hz from occupied buildings, cached OD paths, road capacity, real transport routes, utility reliability and weather. Phaser reads this snapshot. Pooled pedestrians follow short cached road-edge/entrance links and gather at actual stops/markets; pooled vehicles include cars/taxi variants, Okada, Keke, Danfo, buses and industrial freight. Visual representatives never enter city saves. Far zoom hides pedestrians and reduces vehicles; quality and viewport area bound pools (desktop High: 72 vehicles/96 pedestrians; 390×844 Medium: 14/18).

Businesses now close after 45 sustained loss days following their initial opening period. Closed premises lose jobs, output and customers; viable conditions must persist after a cooldown before a replacement business opens. Flood closure remains temporary. Representative households explain genuine local concerns without adding population. Data/Transport contain activity, accessibility and exact satisfaction contributions; inspectors show business hours/activity, sampled households, stop waiting pressure and neighborhood statistics.

Developed clusters retain deterministic neighborhood identities as they grow. Suitable areas can form organic markets after sustained local interest. Markets add modest employment, output, passing customers and roadside pressure. An aggregate informal economy absorbs some unmet employment demand and contributes a lower formal tax rate. Sustained housing pressure can lead households to build informal compounds on suitable connected land. Reliable nearby power, water and drainage gradually integrate them; there is no expanded policy system.

City Feed is a temporary secondary panel opened from Data or Transport. It reports real transitions with cooldowns and a bounded 80-entry recent feed. Important milestones and neighborhood names persist. Welcome Back includes jobs, markets, business openings/closures, treasury and existing construction/transport/flood changes.

`/living-check.html` is a development-only, isolated QA harness for real-capacity cities at 200, 5,000, 50,000 and 250,000 residents. It never reads player storage and is not a production entry. Settings' Living city diagnostics expose hourly overrides and activity/network/neighborhood/market/business views only in development. Browser validation tooling is `tools/check-living-browser.cjs`; see `docs/living-city-validation.md` for measurements and limitations.

```sh
npm install
npm run dev     # Vite on http://localhost:5173
npm test        # Deterministic Vitest simulation and persistence tests
npm run lint    # Strict TypeScript checking
npm run build   # Type checking and production output in dist/
npm run preview # Serve the production build
```

For a phone, open the computer's LAN IP on port 5173 on the same network. The host firewall must permit access.

## Play

The map fills the viewport. The compact HUD shows population, treasury, calendar, satisfaction and residential/commercial/industrial demand. Drag to pan; pinch, scroll or use buttons to zoom. Tap buildings or zoned parcels to inspect them. Contextual panels close to restore map space; mobile inspectors are bottom sheets.

Open Roads or Zones, then select a tool. Desktop hover previews placement; touch users can tap to preview and press Build tile, or deliberately drag to paint. Done returns to exploration. Escape closes panels. Clearing costs ₦50,000 and removes occupants immediately.

Extend roads and zone a mix of homes and employment near existing development. Zoning never creates an instant building. Developers assess road access, demand, nearby development/employment, land value, occupancy and spare capacity. Inspector explanations identify barriers. Interest builds over repeated evaluations; the queue starts one parcel every three city days, with at most three active construction sites. Site preparation becomes visible construction, then a completed building. Residential/commercial construction takes nine days; industrial construction takes twelve.

Residents move into actual housing when jobs and satisfaction support migration. Hiring is gradual. Businesses earn output, pay operating costs, expand or struggle. Valuable, occupied neighbourhoods can progressively redevelop through five building levels. Ninety days of sustained poor conditions can cause abandonment; stronger conditions permit recovery. Nigerian-inspired typologies and fictional names are generated deterministically.

Economy shows automatic residential, commercial and industrial taxes, road upkeep and monthly balance. Data contains housing, employment, demand, land value, satisfaction, trends and milestones. Select Land Value, Development or Occupancy overlays there. Profitability is a normalized health score: 50 means break-even; the inspector also shows actual net profit.

Start with 500 residents, ₦500M, and a small diesel/substation/borehole/tower network. Pause/1×/2×/4× control active play; one city day takes five seconds at 1×. Settings contains Save, Load, New City, rain-effect quality and collapsible developer tools. Transport contains mobility overview, road hierarchy, informal corridor governance and public bus planning.

## Infrastructure and resilience

Services contains Power, Water and Drainage tools. Plants alone do not provide distribution: substations serve surrounding parcels. Diesel provides 3 MW with high fuel costs/pollution; gas provides 25 MW; solar provides up to 8 MW depending on daylight and weather. Buildings consume electricity according to occupancy, level, activity and a rotating representative time-of-day sample. Reserve, coverage, substation load and condition jointly determine local reliability.

Boreholes produce up to 180 m³/day locally. Treatment plants produce up to 4,500 m³/day. Towers extend coverage and store 500 m³ of surplus water; stored water can temporarily bridge shortages but is not new production. Poor public service gradually leads private properties to adopt generators, tanks and boreholes. These improve resilience while increasing costs/noise/pollution and reducing purchasing power. Dependencies gradually fall after service improves.

Open, engineered and major drains remove 24/65/180 mm/day of local runoff at full condition. Add them to roads, buildings or undeveloped parcels. Coverage decreases with distance; overlapping drains add capacity. Seeded elevation, river proximity, density, paving, vegetation and rainfall determine flood risk. Persistent storms create wet, waterlogged, minor and major flood stages. Major floods block roads and temporarily close businesses. Drainage accelerates recovery; temporary output losses persist after water recedes. No buildings are destroyed by storms.

Power, Water, Drainage and Flood Risk overlays show geographic service differences. Inspect parcels/buildings/facilities for actual capacity, reliability, condition, adaptation and flood causes. Weather and state-derived warnings appear in a compact chip; monthly infrastructure history is retained. Level 3+ redevelopment requires good public services, drainage and low flood risk; private generators alone cannot support towers.

Service menus offer 0/50/100/150% maintenance budgets. Normal upkeep settles at 92% condition so maintained assets stay viable during long absences; deferred upkeep accelerates deterioration, while 150% gradually repairs toward 100%. Road condition follows the same rule. Economy separates power operations, water operations, drainage upkeep and road maintenance. Overbuilding can create a monthly deficit. Rain effects support normal/low/off quality; mobile defaults to low and reduced-motion users default to off.

## Visual feedback and City Pulse

Home (or H) frames constructed roads, buildings, infrastructure and zoned/developing parcels with padding. Manual zoom remains available to explore the whole map. On narrow screens a long road corridor must zoom out to fit; truly small settlements frame closely.

RES, COM and IND show residential, commercial and industrial demand. Weather names, seasons and explicit warning counts appear together. The pulse button beside Settings opens **City Pulse**, a temporary problems/opportunities panel or mobile bottom sheet. Conditions come from existing services, connected flood patches, housing, jobs, business health, budgets, demand and recent monthly trends. Select an area notice to close the sheet, focus/select its tile and apply the relevant overlay. Non-spatial notices open Economy or Data. Resolved notices leave the active list and remain in a bounded session history.

Residential buildings show pitched roofs/compounds at low levels and balconies/towers at higher levels; shops use awnings/signage and larger commercial buildings use glass bands; industry uses broad sheds, shutters, loading crates and increasingly large plant details. Generators, tanks and private boreholes appear only when corresponding simulated dependence exists. Open drains, covered engineered drains and wide channels have distinct roadside profiles and connect to adjacent drains.

Light/heavy/extreme rain increases bounded screen-space strokes. Terrain and roads become wet, with small puddles, broad waterlogging and stronger flood coverage. Presentation wetness fades over seconds after rain ends; actual floodwater remains simulation-authoritative. Normal/low/off effects remain available. That visual pass added no simulation systems or save fields; camera and Pulse queries remain pure and covered by tests.

## Architecture

- `shared/types/`: serializable city and building state.
- `shared/simulation/`: deterministic demand, employment, economy, construction and development; no Phaser or DOM dependencies.
- `client/game/`: isometric Phaser renderer, atlas composition and camera controls.
- `art/`: architectural PNG masters, generation prompts and authoring metadata.
- `tools/art/`: offline atlas compiler; browser rendering does not author benchmark architecture.
- `client/ui/`: responsive styles and inspection/statistics presentation; `client/main.ts` wires controls.
- `client/persistence/`: replaceable `CityRepository` with localStorage implementation.
- `tests/`: Vitest `*.test.ts` rule, integration and migration tests.
- `public/`: web manifest groundwork.

Use two-space indentation, strict TypeScript, PascalCase classes and camelCase functions/variables. `.editorconfig` defines whitespace. No separate formatter or ESLint is configured. See `GAME_SPEC.md` for scope and `AGENTS.md` for contribution rules.

## Saves and limits

Version 6 saves retain organic development, infrastructure, weather/flood, mobility and Living City state, adding public facilities, budgets, staffing, service outcomes, waste, fires/repairs and QoL history. Versions 1–5 migrate with layout, residents, treasury and timestamps preserved; original storage keys remain as backups. Versions 1/2 receive starter services on available land without charging the treasury. Unknown/damaged schemas are rejected. New saves use `naija-city-v6`. Visual vehicles, pedestrians and hourly snapshots are never saved.

Autosave runs every 15 seconds and when the page hides. Returning executes the same daily rules as active play and summarizes growth, construction, business activity, taxes, reliability changes, floods and estimated lost private output. Catch-up yields between batches to keep the browser responsive and avoids saving incomplete replay state. Offline catch-up is capped at 24 real hours (17,280 city days); longer absences are explicitly truncated. Pause affects active play only. Saves belong to this browser/origin; clearing its storage removes them.

Milestone 3 retains aggregate residents, a 45% workforce estimate and estimated four-person households. Economy tuning and artwork are preliminary. Redevelopment remains single-tile; clusters prepare future districts. Distribution uses radius coverage, and hydrology uses independent local water balances rather than river routing or fluid dynamics. Daily electricity rotates a representative intraday sample; there is no hourly dispatch/battery model. Rain/weather/climate parameters are configurable approximations. The map remains 32×32; device time is not authoritative. Individual traveler simulation, BRT, rail, ferries, airports, crime/security, multiplayer, politics and server persistence remain deferred. There is no service worker yet.

## Milestone 4: mobility and the living street

Homes generate aggregate work/shopping trips, and connected employment destinations receive statistical worker assignments. Four-tile areas are separated by road component. Four-neighbour shortest paths use cached Dijkstra trees; road classes, maintenance, flooding and congestion change travel costs. A tile represents approximately 120 m. Daily vehicle equivalents use a 14% peak-hour factor; capacity is vehicles/hour. Congestion degrades speed progressively.

Roads now include dirt, local, avenue and major classes. Upgrade in place by selecting a higher road class; the price is the construction-cost difference and nearby parcels remain intact. Dirt roads lose more capacity/speed in rain.

Transport contains Overview, Roads, Informal and Bus. Walking, cars and Okada respond to distance, wealth, weather and travel cost. Repeated connected passenger demand supports organic Keke/Danfo corridors, fleets, fares/profit, boarding stops and converging hubs. Formalization recognizes private operators and improves boarding/reliability, with an administration budget. Bus planning selects start/optional waypoints/end on roads; buses have capital costs, fares, running costs, frequency and fleet controls. City Pulse focuses congested, disconnected and disrupted corridors.

Mobility updates periodically (every three city days, or when population/job capacity changes); no citizen entities or per-frame routing exist. Graph/source caches and bounded OD flows limit work. Employment still adjusts gradually. Travel quality, passenger foot traffic and congestion affect satisfaction, business productivity, explainable development scores and land value. Monthly mobility samples and meaningful route milestones extend existing history. Flooded routes reroute where possible; otherwise service degrades to zero until access returns.

The renderer uses quality/viewport-bounded vehicle and pedestrian pools. Distinct cars, taxi variants, Okada, Keke, Danfo, buses and freight read actual flows and route availability. Night reduces visible activity; far zoom reduces vehicles and hides pedestrians. Vehicles read current road speed, pause at actual transit stops and pause with active play. They are never saved or simulated offline.

Save version 5 retains original v1/v2/v3/v4 keys during migration. Existing older roads migrate as local roads; buildings, infrastructure, population, treasury and timestamps survive. Mobility, routes, stops, hubs, route history and monthly statistics persist. Offline catch-up uses the same daily simulation and reports changes to commuting, congestion, routes and local life.

Current simplifications: area-level statistical employment, calibrated placeholder fares/costs, implicit roadside stops/terminals, representative day-period traffic, single-tile roads, and no detailed schedules or traveler identities. Bus waypoints are capped at eight; fleets at 40 buses; aggregate routes at 64 and OD flows at 768. No BRT, rail, ferries or airports are included. Public services are described in the Milestone 5 section. Physical mid-range-phone FPS remains a device validation task.

## Graphics upgrade

The presentation uses a 24 m visual tile reference, without changing the existing 120 m mobility calibration. Nigerian-inspired compounds, pitched zinc/tile roofs, storefronts, industrial yards and five-level skylines share warm northwest daylight and contact shading. Deterministic materials, cleared plots, tropical vegetation, shoreline accents, connected road classes, utilities, construction and translucent flooding replace flat prototype shapes.

A single 2048×2048 procedural atlas contains 209 frames (16 MiB decoded). Trimmed, pooled sprites, camera culling, throttled redraws and three zoom detail levels bound rendering work. Vehicles continue to follow actual mobility flows; generators and private-water props read building state. Graphics never create simulation activity. Settings offers Low/Medium/High quality; developer controls expose anchors, depth, bounds, LOD and effect toggles. City saves remain version 4; quality preferences use a separate browser key.

See [asset pipeline](public/assets/README.md) for replacement-art contracts. The development-only `/graphics-check.html` page contains isolated small, medium and dense fixtures, weather/recovery controls, exact save roundtrips and rendering metrics; it does not load the player's city. Ninety automated tests pass. Desktop/tablet and 390×844/430×932 viewport checks covered buildings, roads, vehicles, infrastructure, rain/flooding and the existing HUD. Desktop-host phone-view measurements reached approximately 30–60 FPS across the tested scenes (53–60 FPS in the final isolated medium/dense checks); these do not certify physical Android performance.

Current art is procedural placeholder artwork, not commissioned production sprites. Shorelines retain the tile topology; water highlights are primarily static; utilities use compressed single-tile forms; baked contact shadows remain when cast shadows are disabled. No new gameplay systems or Milestone 4.5/5 features were added.

## Sharpness and inspection zoom

The camera now supports smooth 6× street inspection, pointer-centred wheel/trackpad zoom and midpoint-based pinch. Input coordinates remain in Phaser's backing-pixel space; camera zoom incorporates effective DPR while Home/LOD/HUD calculations use CSS-facing zoom. Drag panning works at close zoom. Selection outlines keep a constant screen width.

`game-config.ts` uses Phaser 3.90's NONE scaling with an explicit CSS size and resized backing buffer. Quality caps device DPR at 1 / 1.5 / 2 (Low / Medium / High), with additional pixel budgets for large displays. Linear filtering and anti-aliased vector authoring remain; no pixel-art CSS or integer rounding is applied. High-DPI supersampling replaces additional WebGL framebuffer multisampling.

`detail-atlas.ts` bakes resolution-independent masters into tight, padded atlas pages on demand. Source tiers reach 6 / 9 / 12 pixels per world unit, matching each preset's physical-pixel requirement at maximum zoom. Vehicles share a 12× master sheet. Close LOD reveals architectural roof/window/veranda detail. Cache overflow uses pooled vector masters rather than enlarged low-resolution sprites. Simulation and version 4 saves are unchanged.

Settings developer diagnostics report CSS/backing dimensions, native/effective DPR, logical zoom, FPS, visible sprites, texture memory estimates, LOD and overflow. The isolated graphics fixture adds exact zoom levels, canvas-size tests and synthetic wheel/touch checks. See [resolution audit](docs/render-resolution.md) and the [zoom screenshots](docs/sharpness/).

## Living architectural model: current visual target

The locked art direction is a high-end physical architectural masterplan model brought to life. The new benchmark uses actual Blender geometry rendered offline with a shared orthographic camera, 20 m visual tile, dimensional floors, restrained materials and daylight. It covers five residential heights, courtyard apartments, shops, a modern commercial building, warehouse and three street classes. This is an approval benchmark, not a full-library conversion.

`tools/art/render_models.py` generates high-resolution transparent masters; `tools/art/pack_models.py` produces padded 2/6/9/12-sample atlases and `model-catalog.ts`. Phaser lazily loads visible detail pages, composes pooled sprites and retains the existing zoom/DPR, HUD and save version. Construction, generators, tanks, drainage, flooding and moving vehicles still read actual simulation state.

Open `/graphics-check.html` and choose **Architectural urban block**, **Architectural low-density street**, or **Architectural benchmark A–I**. These isolated fixtures never access player saves. The urban block contains four apartments, landscaped public realm, parking, paths and continuous avenues. See [source specification and remaining legacy artwork](docs/architectural-model/art-direction.md) and [validation](docs/architectural-model/validation.md). Stop at this benchmark for visual approval; no Milestone 4.5/5 systems are introduced.

## Independent Visual Lab: masterplan composition

Open [Visual Lab](http://localhost:5173/visual-lab/) on the development server. This separate Phaser scene has no simulation, money, demand, storage or city-save dependency. It creates all five benchmarks immediately: a compound street, residential estate, eight-building courtyard district, mixed-use frontage and six-lane boulevard. The courtyard district is the initial focus; select **City model** to see the complete composition.

Five new 6–12-storey architectural forms use recessed facades, balconies, service cores, entrances and roof setbacks. Grounds are separate from building sprites: continuous sidewalks, curbs, drainage crossings, paths, parking and landscaping join buildings into blocks. One presentation group can contain many structures without creating population entities. This does not convert production city assets.

`tools/art/render_visual_lab.py` authors actual Blender geometry with the existing 45°/30° orthographic projection and 20 m scale reference. `tools/art/pack_visual_lab.py` compiles 41 transparent masters plus 38 lightweight shadows into padded 2/6/9/12-sample atlas tiers. The independent renderer loads visible detail pages lazily, culls tall assets and reuses pooled images. Buildings, trees, vehicles and utilities are selectable objects; roads have addressable corridor data. Production camera, DPR, HUD, simulation and save format remain unchanged.

Developer controls offer City model / District / Block / Street presets, quality and DPR tests, diagnostics, a reference preview, clean screenshot mode (**P**, tap or **Esc** to restore), and PNG frame export. The Lab entry is excluded from the normal Vite production entry and has a development-mode guard. Read [source, scale and validation](docs/visual-lab/README.md), or open the [reference comparison](http://localhost:5173/docs/visual-lab/comparison.html).

## Architectural benchmark: previous Art Pass 2 (legacy)

Matching private buildings now use transparent architectural sprites: six Level 1 residential forms, three Level 2 homes, four Level 1 shops, two Level 1 industrial properties and two low-rise construction stages. These have different footprints, roofs, entrances, compounds, materials and irregular ground edges. Saved building variants select artwork deterministically. Higher levels retain the previous procedural artwork.

Twenty-two high-resolution PNG masters were created with the built-in image generator. Exact prompts and source paths are in `art/generation-prompts.json`. `art/benchmark-source.json` defines anchors, visual heights, footprint descriptions, LOD tiers and utility sockets. Generators, tanks and pumps are separate sprites shown only from actual adaptation state; driveway culverts require an adjacent road with drainage. Compounds, gates, paving, planting and fictional shop signs are baked into the property artwork.

Rebuild runtime sheets with Python 3 and Pillow:

```sh
python tools/art/build_atlases.py
```

The compiler trims alpha, downsamples and packs 24 frames into 2/6/9/12-sample atlas tiers, plus contact/silhouette sheets. Phaser preloads the small city-view and medium sheets, lazily loads the required close tier, and releases obsolete detail tiers. Maximum zoom remains 6×; existing DPR, camera, simulation, HUD and version 4 saves are unchanged. See [benchmark validation and remaining artwork](docs/art-pass-2/validation.md).
