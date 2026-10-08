# Public safety — Milestone 7

## Model and boundaries

`shared/simulation/safety.ts` updates spatial prevention/pressure every five simulation days; lighting, incident dispatch, local memory and recovery update daily. There are 1,024 aggregate areas, independent of population. No citizen, officer or criminal entities exist. `safety-config.ts`, `public-service-config.ts` and `governance-config.ts` contain balancing parameters.

Crime pressure combines employment/access stress, housing instability, service gaps, economic strain, incident opportunity and visibility. Employment stress interacts with other stresses. Community services, stable housing, active commercial streets, lighting and effective patrol stabilize areas. Income, demographic identity, informal tenure and industrial worker identity are not inputs. Activity adds both opportunity and natural prevention.

Seeded incidents have an approximate base rate of 0.000018 per exposed resident/day, adjusted by pressure; 80% minor, 17% moderate and 3% serious. Generation is capped at four incidents/day and 24 active incidents. An active location cannot generate a duplicate. Pressure remains above zero in successful cities; consequences remain bounded and decay. These are gameplay parameters, not empirical Nigerian crime estimates.

## Facilities and response

Posts/stations/area commands support 6k/30k/100k readiness demand with 12/48/150 public jobs and 1/4/10 nominal response slots. Staffing, diminishing-return funding, utilities, condition, actual demand and road access reduce effective capacity. Assigned incidents consume slots; excess demand waits and reduces patrol. Commercial/hub priority reallocates existing patrol rather than inventing officers.

Dispatch uses existing cached road paths, including classes, congestion, flooding and disconnection. Prompt response reduces impact and speeds recovery. Incidents close within a bounded period even without dispatch; unresolved local effects recover gradually. Fire retains its existing damage model; `emergency-coordination.ts` exposes a shared incident/response read model. Healthcare retains its existing staffed, road-aware visit model; no new medical incident system is added.

## Lighting, economics and presentation

Road classes establish installed lighting (4/32/68/88). Public electricity and road condition determine delivered visibility. Programmes improve lighting/prevention gradually through the existing seven-day delay and 21-day ramp. Lighting adds power demand and maintenance expenditure to road costs. This is aggregate representative demand, not hourly electrical dispatch.

Safety modestly affects evening commerce, business output, land value, attractiveness, migration, satisfaction and structural QoL. Recent shocks can influence sentiment sooner. No single incident abandons a property. Police facilities reuse the existing architectural atlas; dedicated police-building artwork remains a placeholder. A small generic vehicle variant uses the existing high-resolution baked vehicle atlas without logos. Actual response/patrol plans feed the bounded pooled vehicle renderer; no vehicles persist or simulate offline. Night lamps read powered lighting and use a single culled graphics batch.

Governance → Safety and Services → Police use temporary responsive panels. Safety, pressure, lighting, night safety, effective patrol/capacity and response overlays expose separate concepts. Significant incidents and sustained challenges enter City Pulse/Feed with spatial focus and cooldowns. Minor incidents remain inspectable without feed spam. District safety and monthly histories are bounded; active warnings resolve when conditions improve.

## Persistence and validation

Version 8 persists safety aggregates, district metrics, facilities, meaningful recent incidents, response paths and histories. Versions 1–7 migrate; original local-storage keys remain untouched. Older city finances, population, roads and timestamps are retained. New safety fields are initialized without creating incidents or advancing time. Malformed current saves are rejected.

`tests/safety.test.ts` covers prevention, mandatory informal-community neutrality, road access, staffing, overload, congestion/flood disruption, lighting/outages, policies, business activity, representative vehicles, migration, malformed saves, seeded offline equivalence, 100k/500k aggregates and a 20-year simulation.

## Validation results

All 239 tests across 16 files passed. Production TypeScript checking/build passed; Vite retains the existing large-bundle warning. Browser checks covered new cities, police funding/inspectors, overlays, City Pulse focus, save/reload, v7 migration with the original key retained, and 40 days of offline progression. Desktop, tablet, 390×844 and 430×932 checks reported no runtime errors or horizontal overflow.

On this host, safety simulation averaged 3.66 ms/day at 100k residents and 3.79 ms/day at 500k; complete simulation ticks averaged 50.26 and 68.47 ms respectively. Both fixtures retain 1,024 aggregate areas, rather than creating citizen entities. Dense rendering measurements in isolated headless Chrome contexts:

| Fixture / viewport | Quality / effective DPR | City view FPS | Close view FPS |
| --- | --- | --- | --- |
| 100k / 1440×900 | High / 1 | 57.6 | 48.9 |
| 500k / 390×844 | Medium / 1.5 | 59.7 | 58.7 |
| 500k / 430×932 | Low / 1 | 60.0 | 60.0 |

Close views used approximately 4× zoom. Normal-game tablet checks measured 45.4 FPS at 768×1024, Medium/DPR 1.5. These are desktop-host browser measurements, not physical Android benchmarks. QA scripts use isolated storage and never overwrite the player's save. Reports/screenshots are generated under ignored `.qa/safety/` by `tools/check-safety-browser.cjs` and `tools/check-safety-dense.cjs`.

## Intentionally deferred

No prisons, courts, individual criminals/officers, gang systems, weapons, violent visuals, surveillance, political enforcement, corruption, elections or Milestone 8. No graphics, camera or DPR redesign. Facility-specific artwork, hourly dispatch and medical incident vehicles remain future work. Physical Android performance requires device testing; emulated browser viewports are not a hardware guarantee.
