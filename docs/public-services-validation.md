# Milestone 5 validation

Validated on 5 October 2026. Public services extend the existing aggregate
simulation, road graph, utilities, Living City activity and offline replay. The
Phaser architectural pipeline, camera, DPR, HUD and previous gameplay remain.

## Systems and architecture

- `shared/types/public-services.ts` defines serializable facilities, local
  coverage, demand, capacity, staffing, budgets, fire incidents, waste and QoL.
  `public-service-config.ts` contains the ten facility definitions and balance.
- `public-service-access.ts` builds bounded, cached road-travel maps using the
  existing Dijkstra source cache. Road classes, congestion and flood closures
  affect access. Parks also permit a two-step dry-land walk; rivers and blocked
  terrain interrupt it. Reach, sufficient capacity and service quality are
  separate values.
- `public-services.ts` allocates aggregate demand between reachable providers.
  Primary and secondary seats remain separate. Funding, actual staff, utilities,
  condition, crowding and travel cost determine delivered service. There are no
  citizen, pupil, patient or employee entities.
- Public jobs compete for the existing reachable workforce. Schools, healthcare
  and parks add actual aggregate service trips. Depots generate landfill delivery
  paths; fire engines use incident response paths. Representative pedestrians
  and vehicles retain the existing pooled, quality-limited rendering.
- Collection needs both a reachable depot and disposal capacity. Uncollected
  waste persists locally; overlapping depots cannot dispose of the same waste
  twice. Full landfills stop accepting waste. Nearby landfill land-value costs
  remain local.
- Seeded fires depend on density, industry and physical utility conditions.
  Response uses road travel, congestion and station quality. Incidents cause
  bounded damage, occupancy/output/value losses and gradual repairs; buildings
  are not deleted. Newly built stations can respond to existing incidents.
- Structural QoL combines employment, housing, education, healthcare, power,
  water, mobility, waste, recreation and flood safety. It converges gradually,
  independently of faster satisfaction. Parcels and named neighborhoods expose
  different local conditions. Services make bounded contributions to land value,
  organic attractiveness, higher-level upgrading and business performance.
- The existing Services sheet contains Education, Healthcare, Emergency, Waste,
  Parks, Power, Water and Drainage. Cards show build/monthly costs, capacity,
  staffing, footprint and role. Placement previews show the full footprint and
  expected road access. Inspectors explain capacity, usage, staffing, quality,
  funding, utilities, travel reach and cost, with suspend/reopen controls.
- Data contains six service/QoL overlays. Development-only diagnostics separate
  demand, capacity fulfillment, response, waste generation/collection and access.
  City Feed, household concerns, history and Welcome Back read actual outcomes.

## Balancing assumptions

These are configurable game values, not demographic or clinical forecasts.
Primary demand is 12% of residents, secondary demand 8%. Primary schools provide
1,200 seats; secondary schools provide 2,000. Healthcare uses estimated monthly
visits: 0.1 per resident, with modest worker, density and flood adjustments. PHCs
provide 500 visits/month; hospitals provide 8,000. All capacities are reduced by
staffing and operating conditions.

Waste uses daily tonnes: 0.00065 per resident, 0.0011 per commercial job and
0.0022 per industrial job. Depots collect up to 90 tonnes/day; landfills accept
600 tonnes/day and retain finite storage. Parks support 1,500 / 15,000 / 80,000
users over progressively larger footprints and access times. A fire station has
readiness capacity for 25,000 residents.

Funding ranges from 50% to 150%. Moving from 100% to 150% adds only 15% nominal
capacity, while increasing costs; it cannot substitute for staff or utilities.
Negative treasury reduces delivered funding without deleting facilities.
Suspended facilities release their workers and retain a small maintenance cost.
Condition deteriorates slowly. Positive service land-value contributions are
capped at eight points and combined service penalties at thirteen. QoL moves
2.5% toward its target per city day.

## Automated validation

`npm test`: **176 tests passed across 14 files**, including 41 new public-service
tests. Existing development, infrastructure, mobility, living-city, camera,
graphics and persistence suites pass. Tests cover demand, separate school seats,
overcrowding, connectivity, traffic delay, map reuse/invalidation, protected land,
footprints, utilities, staffing/employment conservation, funding, maintenance,
expenses, waste conservation and recovery, full landfills, parks/weather, local
QoL, cluster rebuilding, land value/attractiveness, fire response/damage/repair,
service journeys, stress fixtures, save validation and active/offline equivalence.

`npm run build` passed strict TypeScript checking and production compilation.
Vite retains the existing large Phaser bundle warning (about 1.54 MB before gzip).
The test script limits Vitest to one worker to avoid resource contention between
the existing heavy deterministic and asset suites on this Windows host.

Version 6 persists public facilities/names, budgets, local service outcomes,
staffing, waste, incidents/damage, QoL and bounded history. Versions 1–5 migrate;
version 5 keeps the previous city layout, buildings, utilities, mobility,
residents, treasury and timestamps while initializing empty public services.
Old localStorage keys remain untouched. Malformed references, duplicate
footprints and invalid funding are rejected. Visual vehicles remain unsaved.

## Browser and performance validation

`/public-service-check.html` is development-only, isolated from player storage and
excluded from the normal production entry. It provides 1,000 / 10,000 / 100,000 /
500,000 resident fixtures, overlays, facility focus, utility failure/recovery,
fires, backlog, progression, round trips and active/offline comparison.

`tools/check-public-services-browser.cjs` passed 20 fixture/viewport scenarios and
five normal-game UI checks. Save round trips preserved every field. One-month
offline replay exactly matched active simulation. Hospital effective capacity
fell from 7,219.2 to 1,920 during a total utility failure, then recovered when
utilities were restored. All eight Services tabs, funding, build selection,
six overlays, save version and horizontal overflow were checked. No page errors
were recorded.

`tools/check-public-service-controls.cjs` tests the actual normal-game controls:
map inspection, desktop placement, touch preview/confirmation, gradual hiring,
City Feed, suspension/reopening and save/reload. Checks run at 1440×900,
390×844 and 430×932. It also loads a version 5 fixture, checks the service-aware
Welcome Back report and verifies that saving version 6 retains the original key.
Generated screenshots and machine-readable results live in ignored
`.qa/public-services/`; neither script accesses the player's browser profile.

Measurements use headless host Chrome at about 4× inspection zoom, across all
four population fixtures. Each scenario has three settled samples:

| Viewport / quality | Effective DPR | FPS range | Redraw range | Initial ten access maps |
| --- | --- | --- | --- | --- |
| 1440×900 High | 1 | 43.4–60.1 | 1.4–6.8 ms | 7.6–14.0 ms |
| 1024×768 Medium | 1.5 | 58.7–60.0 | 1.8–7.7 ms | 7.0–11.6 ms |
| 390×844 Medium | 1.5 | 60.0 | 0.7–1.3 ms | 4.4–7.6 ms |
| 430×932 Medium | 1.5 | 58.7–60.0 | 0.7–5.1 ms | 5.7–9.9 ms |
| 390×844 Low | 1 | 60.0 | 0.6–2.5 ms | 2.9–10.9 ms |

Access-cache counts stayed at ten maps/ten builds through redraw sampling;
rendering did not rebuild them. Texture estimates remained approximately
77.25 / 65.25 / 55.25 MiB at High / Medium / Low. Some desktop samples ran while
automated tests were active, so the table includes transient host contention.
Viewport emulation does **not** certify physical mid-range Android performance.

## Intentional limits

- Public facilities reuse established architectural models, with service crests,
  park landscaping and state-driven fire/waste effects. Dedicated school,
  hospital, fire-station and landfill art remains a later asset task.
- Access and enrollment are statistical; facilities do not model catchment
  regulations, exam results, diseases, patient queues or detailed emergency fleets.
  Capacity is allocated among at most four reachable providers per parcel.
- Fire progression/repair uses daily aggregate ticks; minute response values are
  accessibility estimates. Unserved incidents are contained within five days to
  avoid destructive runaway fires. There is no physical fire spreading model.
- The map is still 32×32 and facilities are capped at 128. The 500,000-resident
  fixture deliberately raises QA housing capacities because the current map's
  ordinary level-five balance cannot accommodate that population. Production
  capacities and population calculations are unchanged.
- Offline replay uses the same daily rules in yielding batches, capped at the
  existing 24 real hours. No service vehicles are simulated offline.
- Broader capacity/fiscal tuning and physical-device performance remain future
  validation work. No crime, police, universities, politics or Milestone 6 systems
  are implemented.
