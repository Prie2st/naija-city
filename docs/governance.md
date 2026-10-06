# Milestone 6: city governance

## Controls

Open **Economy → City governance** (also available in Data and Settings). The existing contextual desktop panel and mobile bottom sheet contain Overview, Budget, Taxes, Policies, Districts, Housing and Development. No additional permanent HUD is introduced.

Residential tax is a monthly percentage of occupied property value; commercial and industrial rates apply to business output, retaining their existing property component. Targets have bounded ranges and a 30-day review period. Effective rates approach targets gradually. Higher taxes increase the immediate revenue calculation but reduce purchasing power, profitability, demand and investment as effective rates rise.

Policies activate after seven simulation days, ramp over 21 days and wind down gradually. Changing a decision requires 30 days. Citywide and district copies of the same policy use the stronger implementation rather than multiplying benefits. Programmes have resident-based monthly costs and administration costs. They guide existing private investment; road access, construction, occupancy, jobs, utilities and public-service requirements remain authoritative.

## Districts and community strategy

Adopt a named organic neighborhood or tap two corners to select a rectangular area. Protected land and already assigned parcels are excluded. Governable district boundaries are separate from organically evolving neighborhood identity. Names and boundaries persist; districts compare housing, employment locations, services, congestion, affordability and environmental quality.

Informal community upgrading funds existing drainage maintenance, collection efficiency and environmental improvement. Integration and supported formalization accelerate the existing gradual tenure transition only when real road, power, water and drainage conditions are adequate. Formal tenure increases property-tax participation and indicative housing costs. These programmes do not create utility coverage: the player still builds missing infrastructure.

Clearance explicitly reports affected residents and construction cost before committing. Displaced residents remain in aggregate population and workforce, outside occupied housing. They seek vacant accessible housing before new migration fills it. After 90 days without replacement housing, departures occur gradually and are recorded. Clearance causes a temporary satisfaction penalty. There is no individual homelessness/lease simulation.

## Simulation integration

`shared/types/governance.ts` defines serializable municipal state. `governance-config.ts` centralizes rates, timing, housing, maintenance, displacement and policy balance. `governance.ts` evaluates policies/taxes daily and local housing, district metrics, environment, challenges and forecasts every five days. Existing economy, development, mobility, infrastructure, living-city and public-service modules read bounded modifiers. Rendering reads precomputed values; no citizen objects, new route searches per frame or additional map DOM nodes are created.

Housing units derive from existing resident capacity using four residents per household. Indicative rent depends on land value, level, housing scarcity, tenure and housing support, with smoothing and bounds. Income estimates use existing employment, level and land values. Cost of living includes housing, travel, backup utilities and tax pressure. Five aggregate income bands and a simple dispersion indicator communicate differences; these are game estimates, not Nigerian housing forecasts or a real Gini coefficient.

Environment responds to local industry, traffic, waste, flooding, parks and green space. It affects local QoL and land value. Maintenance priorities adjust existing funding and operating costs; deterioration remains slow. Severely neglected infrastructure can suffer short deterministic failures. Pedestrian priority trades some local vehicle capacity for walking attractiveness; transit priority improves existing shared-route efficiency and weighted mode choice. Waste support cannot bypass staffing, road access or disposal capacity.

## Challenges, outlook and history

Challenges use real thresholds, hysteresis, grouped city/district locations and cooldowns. They explain contributing systems and several responses. Active problems resolve when conditions improve; meaningful transitions reach history. City Pulse retains its established service/mobility/flood warnings and adds housing, affordability and fiscal challenges.

The 90-day outlook extrapolates recent trends with bounds. Budget outlook annualizes the current balance. Both are labeled approximate. Objectives score actual city outcomes and provide planning direction, without quests or rewards. Monthly population, jobs, housing costs, affordability, QoL, revenue, expenses and congestion retain 240 samples; charts are composed only when the relevant panel opens.

## Persistence and limits

Version 7 saves use `naija-city-v7`; versions 1–6 migrate and older storage keys remain untouched. Version 6 receives neutral municipal settings and retains every pre-existing field. Policy activation, tax smoothing, district boundaries, displacement, local housing, challenges and histories round-trip. The normal simulation tick handles offline governance with the existing 24-real-hour catch-up limit. Welcome Back includes meaningful rent, affordability, displacement and governance history changes.

District boundaries initially remain fixed; they do not automatically annex growing neighborhoods. Employment is aggregate/spatial, not a household-by-household wage ledger. Rental support is an indicative household-cost subsidy rather than an individual payment system. Forecasts are intentionally simple. There are no elections, police/crime, loans, detailed macroeconomics or Milestone 7 systems.

## Validation

Run `npm test`, `npm run build` and `git diff --check`. `tests/governance.test.ts` covers taxation, policy timing/costs, district isolation, housing pressure, affordability, environmental effects, displacement/rehousing, integration prerequisites, maintenance, deficit recovery, challenge resolution, save validation, offline equivalence and 20 simulated years. The long run checks actual housing/workforce limits, bounded prices and histories, and a valid final save.

`node tools/check-governance-browser.cjs` uses isolated Chrome contexts to check the normal UI at 1440×900, 768×1024, 390×844 and 430×932, including touch selection, naming, tax changes, policy activation, overlays and v6 migration/offline replay. It writes ignored screenshots and measured simulation timings under `.qa/governance/`. Physical Android performance requires device testing; headless desktop Chrome measurements cannot establish a mid-range Android FPS guarantee.

### Recorded checks

The first complete regression run passed 210 tests; two further transport-policy checks brought the suite to 212. The focused governance suite passed all 36 tests, including 20 years with a positive final treasury and bounded housing, prices, histories and a valid save.

Normal-UI checks passed all seven governance views at 1440×900, 768×1024, 390×844 and 430×932. Each context created two districts through drawing/adoption, renamed one, persisted a residential tax target of 0.5% (effective 0.4795% after a month), activated housing support to full strength, and displayed the affordability overlay without horizontal overflow. Version 6 migration progressed 41 days and retained the original key unchanged.

Small-city simulation measurements ranged from 7.2–12.9 ms/day in isolated Chrome. `tools/check-governance-performance.cjs` measured the actual renderer with an environmental overlay: desktop HIGH 53.6 FPS / 15.5 ms redraw; 390×844 MEDIUM 56.6 FPS / 14.0 ms redraw; 430×932 LOW 57.6 FPS / 13.4 ms redraw. Backing buffers were respectively 1440×900, 585×1266 and 430×932, preserving the existing DPR caps. Texture estimates were 55.25 MiB HIGH and 29.25 MiB mobile. These host-dependent small-city measurements are not physical Android or dense-city guarantees.
