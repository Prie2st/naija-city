# Naija City: Balance Retest (Milestone 8.2)

Date: 2026-10-07. Branch `claude/project-thread-dlaiq4`, based on the Milestone 8 head `1333a37` (door-to-door commute rebalance). The simulation changes are commits `24a6040`, `09c682f` and `91271a5`. Save version 9 is unchanged and no saved fields were added. This report compares BEFORE and AFTER for the 15 issues in the balance audit (project file `balance/BALANCE_AUDIT.md`, 2026-10-06).

## Summary

The simulation is now recoverable, and its archetypes diverge. It does not yet keep evolving: population still plateaus once a city's footprint is housed.

- **Survival.**
  - 30 of 30 archetype runs (10 archetypes × 3 seeds) are alive at year 20, against 20 of 30 before.
  - Car, sprawl and industrial cities, which all collapsed before, survive on every seed.
  - The untouched starting town lives 20 years instead of dying within its first year.
- **Recovery.**
  - The QA flood and collapse-recovery scenarios (A and B) now pass.
  - Floods, power cuts, out-migration and business closures recover within 10–60 days.
  - A budget shock of 18 months' spending is repaid in about 6 years, with population held.
- **Money.**
  - Stable cities no longer pile up endless reserves. Year-50 reserves fell from ₦6.4B to ₦1.5B (balanced) and from ₦15.2B to ₦0.8B (high-service).
  - Debt moves through fiscal stages with real costs, and interest is capped so repayment stays possible.
- **Levers.**
  - Maximum taxes now bring 1.45× income for −15 satisfaction. Before, they brought 2.5× almost free.
  - Policies cost 2–10% of what they did.
  - Low maintenance wears assets down instead of emptying the city.
- **Power.** Substations share load, and power reliability at year 20 is 46–75% (was 27–40%).
- **Still open, and deferred to the combined Milestone 8 stabilization gate.**
  - Population plateaus at year 8–12 in every archetype.
  - One sprawl run (seed 731) collapses at year 32 after 25 years of deficit.
  - Crime, rent, informality and waste were not addressed.
  - The transit issues (9 and 10) belong to Milestone 8.

Of the 15 audit issues: 4 FIXED (2, 5, 6, 8), 5 IMPROVED (1, 3, 4, 7, 11), 2 DEFERRED to Milestone 8 (9, 10) and 4 UNCHANGED (12–15). The starting-town death handed over by Milestone 8.1 is FIXED; long offline absences are IMPROVED.

**Validation:** 313 tests pass (19 test files), and `npm run lint`, `npm run build` and `git diff --check` are clean.

## Method

- **Harness.** `tools/balance/` (committed) drives the real simulation headlessly through public player actions only: `applyTool`, `setTax`, `togglePolicy`, `setPriority`, service funding and the transit tools. It extends the audit's bot with ten archetypes: starting, balanced, low-tax, high-service, industrial, commercial, dense, sprawl, car and transit. 1 tick = 1 day, 1 year = 360 ticks, and metrics are sampled every 30 days.
- **The bot plays like a prudent mayor.** Two behaviours were added to the audit's bot, and BEFORE and AFTER both use them:
  - It reads each policy's cost estimate before enacting it, where the game provides one (AFTER only; BEFORE falls back to the old per-resident cost).
  - When debt passes 3 months of spending and income is below 1.1× expenses, it raises taxes one step at a time, up to residential 0.45, commercial 6 and industrial 5.5. It eases back towards its strategy's own rates once reserves pass 12 months of spending. The low-tax archetype never raises taxes.

  For archetypes that never go into debt, both behaviours do nothing.
- **BEFORE code.**
  - `1333a37` (Milestone 8 head) for car, transit, industrial and sprawl, the archetypes the fiscal rule affects.
  - `4db32b5` (the commit before the commute rebalance) for the rest.

  A control run of the balanced city on both commits agrees within 1.5%: 38,320 against 37,780 people at year 20. The audit's own numbers (commit `b345c7f`, older bot) agree with this BEFORE.
- **AFTER code.** `91271a5`.
- **Seeds.** Every archetype ran 50 years on seed 731, and 20 years on seeds 1009 and 4242.
- **Single-change experiments.** A balanced city is grown to year 8 and saved. One change is applied, and the city is played on for 8 more years. Results are compared at year 16 against an unchanged control from the same snapshot. There were 18 variants, each run on BEFORE (`1333a37`) and AFTER. The bot holds taxes fixed in these runs, so each one measures a single lever.
- **Recovery tests.** A balanced city is grown for 8 years and played until the rainy season, then replayed with and without each of 5 shocks, on seeds 731 and 1009.
  - Recovery means population and employment within 5% of the unshocked control, and satisfaction within 3 points, held for 60 days.
  - For the budget shock, the treasury must also be back above zero.
- **QA scenarios.** The QA thread's harness was copied and scenarios A, B, D, J and K were run against `91271a5`. Nothing was written into `qa/`.

### Limitations

- The bot never bulldozes to make room for services or utilities, except in the `utility-infill` experiment. Health, education and power coverage are therefore lower than a skilled player would get.
- Each 30-day sample is taken at the same simulated hour. Year 50 falls in a wet season, so satisfaction and mode share at year 50 read a few points lower than the dry-season level.
- The QA offline scenario (F) measures Milestone 8.1's catch-up code. Balance conclusions here use continuous play.
- The Milestone 8.3 work (traffic every third day) is not on this branch; see Integration notes.

## What changed and why

| Root cause (audit issue) | Change | Where |
|---|---|---|
| Coverage took the strongest single substation, so building more never added capacity (5) | Substations split the load of the tiles they jointly reach, so a second substation adds distribution capacity | `distributeSubstationLoad` in `shared/simulation/infrastructure.ts` |
| Migrants stopped arriving the moment jobs were full, which froze growth. Departures switched on at a cliff (1, 6) | Harris–Todaro-style prospects: arrivals taper between 6% and 20% unemployment, departures ramp up smoothly, and fractional flows round deterministically instead of truncating to zero | `migrationBalance` and `roundFlow` in `shared/simulation/economy.ts` |
| Distant employers starved because commuters only considered the 8 nearest employment areas (6) | Commuters consider 14 | `commuteDestinations` in `shared/simulation/mobility.ts` |
| Shops with too few customers closed outright, which cascaded into job losses (6, 7) | Shops shorten hours (down to 60%) and cut wages, which lowers residents' spending instead of closing the shop | `shopHours` and `underemployment` in `shared/simulation/economy.ts` |
| Flood layoffs and blocked commutes read as permanent unemployment and triggered departures (6, 8) | While flooded, departures read structural unemployment (workforce minus jobs), not temporary layoffs | `persistentUnemployment` in `shared/simulation/economy.ts` |
| Every building counted down to abandonment on the same shared shock, so whole districts emptied on one day, residents vanished, and shells needed land value ≥ 25 to redevelop (7) | Owners hold on for 90–150 days (deterministic per building), decline counts 1 day in 4 while the city is flooded, residents of abandoned homes are rehoused, shells clear after 240 days, the neighbour drag is capped at −18, and redevelopment uses attractiveness | `shared/simulation/development.ts`, `floodDeclineDay` in `shared/simulation/weather.ts` |
| Storm days repeated the peak intensity for up to a week (about 3× realistic seasonal rainfall), and flood memory never faded (8) | Storm spells taper by ×0.55 per day. Flood memory has a half-life of about a year. Vegetation and wetland absorb runoff. Floods are graded nuisance, significant or severe | `shared/simulation/weather.ts` |
| Debt was unbounded with no stages, and service erosion was ad hoc (3) | Fiscal stages (surplus, balanced, deficit, stress, severe). Interest is 1.2% a month, capped at 30% of revenue. Funding falls to 85% under stress and 60% under severe stress. Policies run at half effect under severe stress. Satisfaction falls under stress | `fiscalStage`, `debtService` and `fiscalFunding` in `shared/simulation/governance.ts` |
| Underfunded upkeep wore every asset towards zero at any shortfall, so a stressed city lost power and water entirely (3) | Assets settle at a condition in proportion to the funding: worn and failure-prone, but recoverable | `maintainedCondition` in `shared/simulation/infrastructure.ts` |
| Maximum business tax was nearly free money (4) | Collection loses up to 40% at the maximum rate (avoidance and informality). Demand responds asymmetrically. Firms bear part of the tax as a cost | `taxCompliance` in `shared/simulation/governance.ts` |
| A mature, fully housed city could raise every tax to the maximum with no downside, because rates only steered demand for new development (4) | Households feel the tax burden in their satisfaction: up to −10 at the maximum residential rate, and up to −6 at maximum business rates (passed on through prices). Cuts below the base win back 30% of that as goodwill | `taxSatisfaction` in `shared/simulation/governance.ts` |
| Every policy was charged per resident city-wide, so most cost more than the city's revenue (4) | Each policy is priced per unit of what it serves (residents, street tiles, business jobs, drains, depots or stops), and the panel shows the estimate | `policyUnits` and `policyEstimate`, and `basis` in `shared/simulation/governance-config.ts` |
| Stable cities had flat costs forever (1, 2) | Assets cost up to 45% more to run as they age (1.2% a year). A deterministic national cycle (11-year and 4.3-year waves) moves business demand and fuel prices | `assetAgeFactor` in `shared/simulation/infrastructure.ts`, `shared/simulation/national-economy.ts` |
| Reloading a save or offline catch-up gave different results from continuous play | The road-graph cache keys on the same bucketed values its costs use | `graphSpeed` in `shared/simulation/road-network.ts` |

All the tuning values for these loops are in `shared/simulation/balance-config.ts`. [balance.md](balance.md) lists them by group.

## Results: long runs

### Strategy outcomes, seed 731

Each cell is population / treasury / satisfaction / unemployment % / power reliability %, at the end of the year shown.

| Strategy | Code | Year 5 | Year 20 | Year 50 | Peak population | Lowest treasury |
|---|---|---|---|---|---|---|
| starting | before | 0 / ₦462M / 23 / 0.0 / 0 | 0 / ₦341M / 23 / 0.0 / 0 | 0 / ₦99M / 15 / 0.0 / 0 | 440 (yr 0.1) | ₦99M |
| starting | after | 443 / ₦484M / 72 / 34.2 / 87 | 372 / ₦403M / 69 / 24.0 / 87 | 5 / ₦55M / 15 / 100.0 / 90 | 488 (yr 0.1) | ₦55M |
| balanced | before | 26,980 / ₦11M / 67 / 3.5 / 37 | 37,780 / ₦1.8B / 65 / 2.6 / 27 | 37,491 / ₦6.4B / 52 / 1.2 / 25 | 37,780 (yr 9.8) | ₦0M |
| balanced | after | 28,820 / ₦71M / 72 / 3.5 / 71 | 46,855 / ₦-180M / 66 / 3.2 / 46 | 46,856 / ₦1.5B / 52 / 3.4 / 50 | 46,860 (yr 8.2) | ₦-415M |
| low-tax | before | 12,960 / ₦-19M / 67 / 4.0 / 31 | 12,960 / ₦-139M / 61 / 9.1 / 32 | 5,840 / ₦-1.1B / 36 / 0.9 / 74 | 13,320 (yr 6.1) | ₦-1.1B |
| low-tax | after | 22,180 / ₦0M / 64 / 7.7 / 23 | 43,223 / ₦-71M / 71 / 4.3 / 33 | 43,132 / ₦-5.3B / 48 / 6.8 / 13 | 43,260 (yr 17.8) | ₦-5.3B |
| high-service | before | 27,480 / ₦21M / 64 / 4.6 / 43 | 40,080 / ₦4.5B / 66 / 3.7 / 30 | 40,080 / ₦15.2B / 61 / 4.6 / 32 | 40,080 (yr 8.9) | ₦5M |
| high-service | after | 31,940 / ₦17M / 66 / 7.4 / 71 | 49,580 / ₦3.6B / 64 / 5.0 / 48 | 49,580 / ₦840M / 48 / 5.2 / 48 | 49,606 (yr 12.2) | ₦5M |
| industrial | before | 23,000 / ₦7M / 57 / 4.0 / 21 | 0 / ₦-4.2B / 23 / 0.0 / 0 | 0 / ₦-13.4B / 15 / 0.0 / 0 | 25,000 (yr 5.5) | ₦-13.4B |
| industrial | after | 25,780 / ₦6M / 66 / 5.3 / 28 | 30,760 / ₦70M / 62 / 1.7 / 27 | 30,787 / ₦682M / 43 / 1.0 / 30 | 30,949 (yr 43.3) | ₦-251M |
| commercial | before | 27,220 / ₦11M / 66 / 7.4 / 59 | 40,220 / ₦2.3B / 65 / 3.0 / 40 | 40,131 / ₦8.6B / 54 / 3.7 / 39 | 40,220 (yr 7.8) | ₦0M |
| commercial | after | 29,160 / ₦15M / 73 / 0.8 / 75 | 41,060 / ₦196M / 74 / 0.2 / 69 | 41,056 / ₦603M / 68 / 0.0 / 71 | 41,060 (yr 8.1) | ₦-306M |
| dense | before | 18,020 / ₦43M / 72 / 0.0 / 46 | 18,380 / ₦3M / 71 / 1.2 / 47 | 18,880 / ₦-19M / 57 / 5.8 / 45 | 18,880 (yr 46.2) | ₦-57M |
| dense | after | 20,839 / ₦62M / 69 / 3.9 / 75 | 20,840 / ₦-132M / 64 / 2.8 / 74 | 20,840 / ₦541M / 49 / 2.6 / 75 | 20,840 (yr 5.2) | ₦-200M |
| sprawl | before | 22,209 / ₦5M / 54 / 19.2 / 49 | 0 / ₦-3.6B / 23 / 0.0 / 0 | 0 / ₦-13.1B / 15 / 0.0 / 0 | 24,810 (yr 6.3) | ₦-13.1B |
| sprawl | after | 25,483 / ₦11M / 59 / 11.6 / 60 | 25,458 / ₦260M / 50 / 14.8 / 58 | 0 / ₦-14.1B / 21 / 0.0 / 0 | 25,999 (yr 6.2) | ₦-14.1B |
| car | before | 21,738 / ₦6M / 60 / 24.1 / 69 | 6,170 / ₦-1.0B / 37 / 29.5 / 91 | 0 / ₦-15.8B / 15 / 0.0 / 0 | 32,256 (yr 7.9) | ₦-15.8B |
| car | after | 30,660 / ₦9M / 71 / 11.6 / 85 | 35,280 / ₦495M / 65 / 0.7 / 70 | 35,271 / ₦28M / 47 / 3.3 / 69 | 35,374 (yr 29.3) | ₦-352M |
| transit | before | 25,880 / ₦20M / 69 / 2.1 / 43 | 38,040 / ₦100M / 65 / 1.2 / 29 | 37,672 / ₦972M / 52 / 2.2 / 31 | 38,180 (yr 8.1) | ₦-252M |
| transit | after | 28,498 / ₦91M / 72 / 1.6 / 73 | 48,431 / ₦365M / 66 / 4.5 / 51 | 48,295 / ₦41M / 53 / 2.9 / 52 | 48,431 (yr 11.8) | ₦-335M |

### Other readings, seed 731, year 20

| Strategy | Code | Jobs | Water % | QoL | Land value | Rent ₦ | Crime | Walk % | Car % | Okada % | Transit % | Commute min | Res / Com / Ind level | Abandoned | Informal |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| starting | before | 0 | 0 | 45.0 | 6.3 | 21,708 | 19.0 | 0 | 0 | 0 | 0 | 0.0 | 0 / 0 / 0 | 6 | 0 |
| starting | after | 127 | 92 | 34.2 | 10.0 | 35,592 | 41.0 | 23 | 6 | 13 | 59 | 7.7 | 1 / 1 / 0 | 0 | 0 |
| balanced | before | 19,201 | 57 | 27.2 | 43.5 | 65,753 | 40.7 | 30 | 15 | 18 | 37 | 6.9 | 2.19 / 2.17 / 2.24 | 11 | 0 |
| balanced | after | 23,380 | 48 | 30.2 | 55.0 | 71,435 | 40.7 | 30 | 20 | 21 | 29 | 8.2 | 2.63 / 2.43 / 2.51 | 1 | 0 |
| low-tax | before | 5,945 | 89 | 27.6 | 19.4 | 64,955 | 44.8 | 27 | 15 | 17 | 41 | 7.1 | 2.41 / 2.33 / 2.3 | 9 | 6 |
| low-tax | after | 20,649 | 60 | 29.0 | 59.3 | 68,237 | 41.9 | 25 | 22 | 25 | 28 | 8.5 | 2.11 / 2.2 / 2.08 | 0 | 18 |
| high-service | before | 20,628 | 49 | 36.6 | 56.5 | 75,022 | 38.9 | 27 | 17 | 17 | 39 | 7.1 | 2.25 / 2.21 / 2.14 | 5 | 0 |
| high-service | after | 23,314 | 53 | 49.5 | 62.9 | 81,243 | 32.1 | 24 | 24 | 21 | 31 | 8.4 | 2.75 / 2.63 / 1.81 | 1 | 0 |
| industrial | before | 0 | 0 | 45.0 | 5.2 | 21,429 | 19.0 | 0 | 0 | 0 | 0 | 0.0 | 0 / 0 / 0 | 233 | 0 |
| industrial | after | 16,498 | 44 | 26.3 | 46.0 | 61,944 | 39.4 | 36 | 21 | 28 | 16 | 7.8 | 2.17 / 1.92 / 1.34 | 16 | 0 |
| commercial | before | 20,298 | 72 | 41.5 | 52.5 | 77,390 | 42.0 | 30 | 17 | 17 | 36 | 7.1 | 2.74 / 2.14 / 2.28 | 36 | 0 |
| commercial | after | 23,728 | 56 | 52.4 | 69.0 | 88,853 | 38.9 | 34 | 18 | 14 | 34 | 7.9 | 2.77 / 1.44 / 2.72 | 5 | 2 |
| dense | before | 9,518 | 93 | 33.2 | 30.6 | 75,385 | 40.7 | 26 | 17 | 16 | 42 | 6.9 | 2.53 / 2.65 / 2.59 | 1 | 7 |
| dense | after | 10,811 | 54 | 34.0 | 31.8 | 79,111 | 39.3 | 23 | 15 | 13 | 49 | 8.0 | 3.04 / 2.89 / 2.76 | 0 | 0 |
| sprawl | before | 6 | 0 | 45.0 | 5.2 | 27,067 | 19.0 | 0 | 0 | 0 | 0 | 0.0 | 0 / 0 / 0 | 170 | 0 |
| sprawl | after | 11,961 | 60 | 31.4 | 46.7 | 70,869 | 44.6 | 16 | 24 | 35 | 26 | 15.6 | 2.56 / 1.38 / 1.37 | 5 | 0 |
| car | before | 2,615 | 92 | 37.6 | 11.3 | 60,698 | 39.8 | 25 | 11 | 12 | 51 | 6.6 | 3.44 / 2.22 / 2 | 205 | 0 |
| car | after | 18,988 | 69 | 36.7 | 50.0 | 79,867 | 37.7 | 8 | 14 | 11 | 67 | 7.7 | 3.17 / 1.93 / 1.5 | 15 | 0 |
| transit | before | 18,608 | 58 | 26.6 | 43.6 | 66,058 | 40.4 | 31 | 15 | 17 | 37 | 7.7 | 2.21 / 2.21 / 2.22 | 13 | 0 |
| transit | after | 24,466 | 51 | 30.0 | 56.0 | 72,099 | 41.3 | 32 | 17 | 18 | 34 | 8.4 | 2.7 / 2.61 / 2.45 | 1 | 0 |

### Multiple seeds

Population at year 5 and year 20 (and year 50 for seed 731), before → after. Collapsed means below 100 residents.

| Strategy | Seed 731 y5 | Seed 731 y20 | Seed 731 y50 | Seed 1009 y5 | Seed 1009 y20 | Seed 4242 y5 | Seed 4242 y20 |
|---|---|---|---|---|---|---|---|
| starting | **0** → 443 | **0** → 372 | **0** → **5** | **0** → 441 | **0** → 345 | **0** → 424 | **0** → 368 |
| balanced | 26,980 → 28,820 | 37,780 → 46,855 | 37,491 → 46,856 | 25,960 → 28,200 | 38,180 → 46,928 | 25,020 → 29,040 | 39,080 → 43,267 |
| low-tax | 12,960 → 22,180 | 12,960 → 43,223 | 5,840 → 43,132 | 12,780 → 12,420 | **0** → 12,420 | 9,240 → 15,580 | 5,000 → 15,760 |
| high-service | 27,480 → 31,940 | 40,080 → 49,580 | 40,080 → 49,580 | 28,760 → 31,340 | 40,946 → 46,420 | 28,160 → 30,556 | 40,806 → 48,911 |
| industrial | 23,000 → 25,780 | **0** → 30,760 | **0** → 30,787 | 20,360 → 16,540 | **0** → 29,095 | 8,520 → 26,060 | **0** → 32,160 |
| commercial | 27,220 → 29,160 | 40,220 → 41,060 | 40,131 → 41,056 | 27,580 → 31,295 | 34,500 → 48,923 | 27,240 → 30,280 | 34,960 → 40,760 |
| dense | 18,020 → 20,839 | 18,380 → 20,840 | 18,880 → 20,840 | 17,660 → 18,340 | 18,046 → 18,340 | 17,340 → 21,000 | 17,340 → 21,000 |
| sprawl | 22,209 → 25,483 | **0** → 25,458 | **0** → **0** | 9,767 → 25,400 | **0** → 24,231 | 3,416 → 27,799 | **0** → 28,245 |
| car | 21,738 → 30,660 | 6,170 → 35,280 | **0** → 35,271 | 25,617 → 30,225 | 953 → 41,765 | 25,740 → 30,840 | 29,529 → 32,854 |
| transit | 25,880 → 28,498 | 38,040 → 48,431 | 37,672 → 48,295 | 25,300 → 28,360 | 37,540 → 46,880 | 23,740 → 28,700 | 38,180 → 44,306 |

Alive at year 20: 20 of 30 runs before, 30 of 30 after.

### Trajectories, seed 731

Population by year, before → after.

| Strategy | y1 | y2 | y3 | y5 | y8 | y10 | y15 | y20 | y30 | y40 | y50 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| starting | 85 → 453 | 0 → 451 | 0 → 449 | 0 → 443 | 0 → 437 | 0 → 415 | 0 → 369 | 0 → 372 | 0 → 2 | 0 → 2 | 0 → 5 |
| balanced | 5,207 → 5,832 | 10,578 → 11,900 | 16,180 → 17,600 | 26,980 → 28,820 | 37,700 → 46,399 | 37,780 → 46,853 | 37,735 → 46,855 | 37,780 → 46,855 | 37,500 → 46,856 | 37,500 → 46,856 | 37,491 → 46,856 |
| low-tax | 5,563 → 5,857 | 11,560 → 12,016 | 12,600 → 15,180 | 12,960 → 22,180 | 13,320 → 40,099 | 13,304 → 41,420 | 12,960 → 41,680 | 12,960 → 43,223 | 12,560 → 43,186 | 9,080 → 43,132 | 5,840 → 43,132 |
| high-service | 5,142 → 6,000 | 11,798 → 12,360 | 17,200 → 18,020 | 27,480 → 31,940 | 39,970 → 49,400 | 40,064 → 49,480 | 40,080 → 49,580 | 40,080 → 49,580 | 40,080 → 49,580 | 40,080 → 49,580 | 40,080 → 49,580 |
| industrial | 5,413 → 5,618 | 10,100 → 10,980 | 14,720 → 16,040 | 23,000 → 25,780 | 0 → 30,460 | 0 → 30,540 | 0 → 30,760 | 0 → 30,760 | 0 → 30,760 | 0 → 30,715 | 0 → 30,787 |
| commercial | 5,818 → 5,759 | 12,480 → 12,460 | 17,160 → 18,060 | 27,220 → 29,160 | 40,220 → 40,920 | 40,208 → 41,060 | 40,220 → 41,059 | 40,220 → 41,060 | 40,175 → 41,060 | 40,139 → 41,060 | 40,131 → 41,056 |
| dense | 5,359 → 5,997 | 11,420 → 12,160 | 16,060 → 18,420 | 18,020 → 20,839 | 18,200 → 20,840 | 18,196 → 20,832 | 18,379 → 20,840 | 18,380 → 20,840 | 18,520 → 20,840 | 18,520 → 20,840 | 18,880 → 20,840 |
| sprawl | 4,516 → 6,606 | 10,130 → 13,019 | 15,038 → 19,675 | 22,209 → 25,483 | 20,365 → 25,999 | 0 → 25,941 | 0 → 25,458 | 0 → 25,458 | 0 → 25,216 | 0 → 3 | 0 → 0 |
| car | 3,978 → 5,777 | 8,414 → 13,377 | 13,595 → 19,500 | 21,738 → 30,660 | 32,256 → 35,140 | 31,312 → 35,140 | 16,583 → 35,140 | 6,170 → 35,280 | 0 → 35,332 | 0 → 35,337 | 0 → 35,271 |
| transit | 5,208 → 5,832 | 11,119 → 11,560 | 16,560 → 17,020 | 25,880 → 28,498 | 38,100 → 46,334 | 38,040 → 48,254 | 38,040 → 48,431 | 38,040 → 48,431 | 38,040 → 48,361 | 37,900 → 48,304 | 37,672 → 48,295 |

Treasury (₦M) and satisfaction by decade, after, seed 731. This shows whether mature cities keep changing.

| Strategy | y10 | y20 | y30 | y40 | y50 |
|---|---|---|---|---|---|
| starting | ₦461M · sat 69 · car 6% | ₦403M · sat 69 · car 6% | ₦300M · sat 42 · car 0% | ₦180M · sat 34 · car 0% | ₦55M · sat 15 · car 0% |
| balanced | ₦-11M · sat 66 · car 19% | ₦-180M · sat 66 · car 20% | ₦1.0B · sat 66 · car 19% | ₦1.3B · sat 58 · car 20% | ₦1.5B · sat 52 · car 38% |
| low-tax | ₦5M · sat 69 · car 21% | ₦-71M · sat 71 · car 22% | ₦-1.1B · sat 58 · car 26% | ₦-3.0B · sat 59 · car 25% | ₦-5.3B · sat 48 · car 46% |
| high-service | ₦613M · sat 64 · car 24% | ₦3.6B · sat 64 · car 24% | ₦4.7B · sat 64 · car 24% | ₦3.7B · sat 64 · car 25% | ₦840M · sat 48 · car 38% |
| industrial | ₦-106M · sat 62 · car 21% | ₦70M · sat 62 · car 21% | ₦405M · sat 62 · car 21% | ₦281M · sat 61 · car 20% | ₦682M · sat 43 · car 39% |
| commercial | ₦155M · sat 75 · car 19% | ₦196M · sat 74 · car 18% | ₦996M · sat 72 · car 19% | ₦1.3B · sat 73 · car 19% | ₦603M · sat 68 · car 34% |
| dense | ₦30M · sat 69 · car 15% | ₦-132M · sat 64 · car 15% | ₦220M · sat 65 · car 15% | ₦394M · sat 60 · car 15% | ₦541M · sat 49 · car 26% |
| sprawl | ₦-99M · sat 47 · car 24% | ₦260M · sat 50 · car 24% | ₦-498M · sat 46 · car 24% | ₦-6.5B · sat 22 · car 0% | ₦-14.1B · sat 21 · car 0% |
| car | ₦-147M · sat 63 · car 14% | ₦495M · sat 65 · car 14% | ₦1.0B · sat 59 · car 14% | ₦798M · sat 61 · car 13% | ₦28M · sat 47 · car 25% |
| transit | ₦53M · sat 66 · car 17% | ₦365M · sat 66 · car 17% | ₦153M · sat 63 · car 17% | ₦533M · sat 64 · car 17% | ₦41M · sat 53 · car 38% |

Year 50 falls in a wet season, so every archetype reads lower on satisfaction (by 10–15 points) and higher on car share at year 50. The BEFORE runs show the same dip, so it is a sampling artefact rather than late decline.

### Archetype divergence

Before, every surviving city converged on QoL 27–42 and transit share 36–42%, and four of the ten archetypes collapsed. After, all ten are alive at year 20 and they differ in recognisable ways:
- **commercial** has the best QoL (52), satisfaction (74) and rent (₦88,853);
- **high-service** has the lowest crime (32) and a QoL of 49.5, with reserves of ₦3.6B at year 20;
- **car** has the fewest walkers (8%) and the most shared transport (67%, all danfo and keke, since the bot builds no buses);
- **sprawl** has the longest commutes (15.6 min against 7.7–8.5 elsewhere) and the most okada use (35%);
- **dense** has the highest building levels (3.04 residential);
- **low-tax** grows fast but carries the debt;
- **industrial** has the lowest QoL (26) and rent (₦61,944).

## Results: recovery tests

A balanced city is grown for 8 years and played into the rainy season. Each shock is then compared against an unshocked control from the same snapshot. "Recovered" means population and employment within 5% of the control, and satisfaction within 3 points, held for 60 days.

| Shock | Code | Recovered, seed 731 / 1009 | Worst point (seed 731) | Notes |
|---|---|---|---|---|
| Major flood (5 days of extreme rain) | before | 20 / 10 days | Employment 12,526 of 17,099 (−27%) | The control season shows the same employment dip, from flood layoffs |
| | after | 20 / 10 days | Employment 19,607 of 20,218 (−3%) | Flood layoffs are temporary and blocked commutes no longer count as lost work |
| Power disruption (every plant and substation off for 60 days) | before | 60 / 60 days | n/a | Recovers as soon as power returns |
| | after | 60 / 60 days | n/a | Same |
| Worker shortage (a quarter of residents leave) | before | 20 / 30 days | Population −10% / −15% | |
| | after | 20 / 30 days | Population −12% / −13% | |
| Business decline (a third of businesses close) | before | 50 / 50 days | Employment −26% | |
| | after | 50 / 50 days | Employment −24% | |
| Budget deficit (a bill of 18 months of spending: ₦1.1B before, ₦1.6B after) | before | 1,380 / 1,270 days | Population up to 1.7% below the control. Satisfaction averaged 0.6 points below it | Debt carried no interest and almost no penalty |
| | after | Debt repaid after about 6 years / 1,960 days. Satisfaction not within 3 points inside 6 years | Population held at ≥ 99% of the control. Satisfaction averaged 13.5 / 10.4 points below the control | The city pays interest and runs at 60% services under severe stress, and the bot raises taxes (with their satisfaction cost) until the debt is repaid |

The budget shock is now a real setback that a city works off over about 5–6 years, rather than a free overdraft. Population holds throughout.

The QA harness tests recovery from collapse directly. Its scenario B passes after the change: cities forced down to 50, 10 and 5 residents end at 11,118, 612 and 664, and a naturally collapsed city recovers from 14,039 to 23,800. A city with 0 residents stays at 9, and QA reports that case only. Before the change, every case ended at 1–4 residents.

## Results: single-change experiments

The balanced city is grown to year 8, one change is applied, and the city is played on to year 16. Each value is the difference from that codebase's own control at year 16. The bot holds taxes fixed in these runs.

| Change | Code | Income / expenses / policy cost ₦M/mo | Treasury | Population | Satisfaction | Power / water % | Unemployment pts |
|---|---|---|---:|---:|---:|---|---:|
| control (absolute) | before | 77.6 / 63.7 / 0 | ₦1.43B | 38314 | 65.2 | 31.7 / 59.4 | 4% |
| control (absolute) | after | 105 / 94.5 / 0 | ₦-0.05B | 46847 | 65.8 | 46.6 / 48.3 | 4.7% |
| tax-max | before | +115 / 0 / 0.0 | +11.01B | +6 | -3.0 | +2 / +4 | +3.7 |
| tax-max | after | +47 / -1 / 0.0 | +4.48B | +6 | -15.4 | +10 / +7 | +5.1 |
| tax-high | before | +73 / 0 / 0.0 | +6.28B | +1 | -0.2 | +0 / +0 | -1.3 |
| tax-high | after | +52 / -1 / 0.0 | +4.87B | -38 | -9.6 | +3 / +3 | +1.2 |
| tax-biz-max | before | +103 / 0 / 0.0 | +9.70B | +281 | -1.1 | +0 / +1 | +1.0 |
| tax-biz-max | after | +48 / -1 / 0.0 | +4.05B | -7 | -4.7 | +5 / +3 | +0.6 |
| tax-min | before | -49 / -11 / 0.0 | -3.58B | +6 | -2.3 | +3 / +5 | +6.9 |
| tax-min | after | -71 / -14 / 0.0 | -4.79B | +3 | -9.5 | -27 / -33 | +5.1 |
| funding-50 | before | -1 / -11 / 0.0 | +0.94B | -4 | -0.7 | +2 / +2 | +2.6 |
| funding-50 | after | -5 / -22 / 0.0 | +1.91B | -2 | -1.2 | +7 / +5 | +4.3 |
| funding-150 | before | +1 / +11 / 0.0 | -1.05B | 0 | +0.3 | +1 / +0 | -0.5 |
| funding-150 | after | -19 / +8 / 0.0 | -1.54B | +4 | -14.6 | -27 / -33 | +5.5 |
| maint-low | before | -76 / -2 / 0.0 | -1.31B | -36831 | -29.9 | +0 / -27 | -0.6 |
| maint-low | after | -10 / +0 / 0.0 | -0.20B | -10 | -3.6 | -11 / -16 | +2.6 |
| maint-high | before | -0 / +3 / 0.0 | -0.08B | 0 | +0.5 | +4 / +15 | +3.4 |
| maint-high | after | +5 / +3 / 0.0 | -0.02B | +1123 | +1.3 | +10 / +13 | +0.7 |
| policy-affordable | before | -3 / +188 / 199.3 | -18.05B | -4 | -2.0 | +2 / +3 | +4.6 |
| policy-affordable | after | -21 / -3 / 9.4 | -0.91B | +3 | -15.5 | -25 / -33 | +8.0 |
| policy-density | before | -2 / +73 / 84.3 | -7.13B | -4 | -1.8 | +1 / +3 | +4.2 |
| policy-density | after | -6 / +5 / 2.4 | -0.25B | +5 | -1.7 | -6 / -9 | +1.3 |
| policy-drainage | before | -0 / +35 / 46.0 | -3.42B | -1 | -1.5 | +1 / +1 | +2.4 |
| policy-drainage | after | -8 / -1 / 3.8 | -0.30B | 0 | -5.0 | -10 / -14 | +2.7 |
| policy-street-lighting | before | +1 / +12 / 11.5 | -1.18B | 0 | -0.6 | +0 / +0 | +1.6 |
| policy-street-lighting | after | -6 / +6 / 2.0 | -0.24B | +1 | -2.0 | -7 / -10 | +1.5 |
| no-drain | before | -0 / -0 / 0.0 | -0.05B | -1 | 0.0 | -0 / -1 | -0.3 |
| no-drain | after | +1 / -1 / 0.0 | +0.04B | +7 | +0.3 | +2 / +2 | -0.2 |
| drain-proactive | before | -0 / +1 / 0.0 | +0.10B | +240 | -1.0 | +0 / +0 | +2.0 |
| drain-proactive | after | -2 / -0 / 0.0 | +0.04B | +9 | -0.6 | +4 / +3 | +2.0 |
| road-upgrade | before | +7 / +3 / 0.0 | -0.43B | +2 | -0.2 | -1 / -2 | -1.2 |
| road-upgrade | after | +7 / +2 / 0.0 | +0.20B | +7 | -0.4 | +0 / -0 | -0.5 |
| utility-infill | before | -12 / -1 / 0.0 | -1.44B | -8370 | -3.7 | +11 / +31 | -1.0 |
| utility-infill | after | +1 / +3 / 0.0 | -0.16B | -89 | +2.4 | +17 / +10 | -0.2 |
| transit-net | before | +28 / +46 / 0.0 | -1.14B | -220 | -1.5 | +1 / +1 | +1.8 |
| transit-net | after | +2 / +0 / 0.0 | -0.01B | +8 | +0.2 | +1 / +1 | -1.0 |

What this shows:
- **Taxes are no longer free money.**
  - Before, maximum taxes multiplied income by 2.5 for a 3-point satisfaction cost.
  - After, they multiply it by 1.45: collection falls as rates rise. They also cost 15 satisfaction points and 5 points of unemployment.
  - Minimum taxes run the city into severe fiscal stress within 8 years, and power and water reliability fall by about 30 points.
  - The population does not move in either direction within 8 years, because the city is fully housed (see remaining issues).
- **Policies are affordable and priced by what they serve.**
  - Affordable housing fell from ₦199M a month to ₦9.4M, density from ₦84M to ₦2.4M, drainage from ₦46M to ₦3.8M, and street lighting from ₦11.5M to ₦2.0M.
  - Their measured effects are still small, and this control runs at break-even, so in these runs even a cheap policy drifts the city into debt.
- **Service funding is still a weak lever.**
  - At 50%, funding saves ₦22M a month at a small cost: −1.2 satisfaction and +4.3 points of unemployment. That is close to free, as before.
  - At 150%, a city without the revenue for it goes into fiscal stress and ends with worse utilities. Overspending now has consequences.
- **Maintenance is a real trade-off.**
  - Low maintenance no longer collapses the city (before, it fell from 38,314 to 1,483 people). It costs about ₦10M a month in lost output, 11 points of power reliability and 16 of water.
  - High maintenance adds 1,123 residents and 10–13 points of reliability for ₦3M a month.
- **Utilities are no longer capped by the formula.** Clearing homes for utilities (`utility-infill`) raises power reliability by 17 points without losing population. Before, the same action lost 8,370 residents.
- **Drainage changes are small over 8 years in both codebases**, because existing drains stay in place. The QA flood scenario (below) is the stronger flood test.
- **Transit (`transit-net`).** BEFORE built 2 routes carrying 5,054 riders, at a cost of ₦45.5M a month against ₦28.4M in fares. So buses are no longer profitable at the Milestone 8 head. AFTER could not afford the depot at its year-8 snapshot (₦19M treasury), so that row measures nothing. Transit balance belongs to Milestone 8.

## Results: QA scenarios

These are the QA thread's scenarios, copied to this thread's scratchpad and run against `91271a5`. Baseline results are from `qa/results/baseline-b345c7f/BASELINE.md`.

| Scenario | Baseline | After | Detail after |
|---|---|---|---|
| A-flood (no drainage, 720 days, 3 seeds) | FAIL: 4 / 856 / 9,270 residents | **PASS** | 14,039 / 14,560 / 12,880 residents and no abandonment. Power 31% and water 10% show the cost of neglect |
| B-recovery | FAIL: every case ended at 1–4 | **PASS** | See recovery tests above |
| D-policy | FAIL: one policy cost 3.8× income; all of them reached −₦4.75B in a year | FAIL (2 of 3 checks now pass) | One policy costs ₦4M a month against ₦31M income, and extreme use ends the year at +₦553M. Still failing: a forced −₦2B debt does not move population beyond the noise band within 3 years (20,589 against 20,300–20,497) |
| J-commute | FAIL: far jobs +4.2 min | FAIL (half now passes) | Far jobs now add 12.6 min (15.1 → 27.7). Still failing: a bus route raises the far commute to 32.8 min. That is transit code, owned by Milestone 8 |
| K-density | FAIL: no level 4/5 building | FAIL | Levels [35, 79, 49, 0, 0]. Level 3+ needs QoL ≥ 45 and reliable power and water, and the scenario city reaches QoL 24 with water at 29% |

## Audit issues

| # | Issue | Verdict | Evidence and reason |
|---|---|---|---|
| 1 | Every city freezes after year 8–10 | **IMPROVED** | Cities grow 2–30% larger before levelling off (balanced 37,780 → 46,855, high-service 40,080 → 49,580, transit 38,040 → 48,431), and decades now differ in finances and satisfaction (decade table). But **population still plateaus at year 8–12** in every archetype. Housing fills the footprint, and further growth needs density upgrades that require QoL ≥ 45 plus power and water. Deferred: a density or redevelopment progression is a gameplay feature, not a balance value |
| 2 | Infinite money in stable cities | **FIXED** | Year-50 reserves fell from ₦6.4B to ₦1.5B (balanced), ₦15.2B to ₦0.8B (high-service) and ₦8.6B to ₦0.6B (commercial). Treasuries now rise and fall across decades, driven by asset ageing, the national cycle and tax compliance. No money is deleted: higher costs arrive through upkeep |
| 3 | Unbounded debt, no stages, no recovery path | **IMPROVED** | Fiscal stages with visible consequences: funding falls to 85% and then 60%, policies run at half effect, and satisfaction drops. Interest is capped at 30% of revenue so repayment stays possible. The budget shock is repaid in about 5–6 years with population held. But a player who never raises taxes (low-tax) still accumulates debt without limit (−₦5.3B at year 50), and nothing forces a restructuring. Deferred: bankruptcy or administration is out of scope (no deep national finance) |
| 4 | Dominant fiscal levers; policies unaffordable no-ops | **IMPROVED** | Maximum taxes went from ×2.5 income for free to ×1.45 for −15 satisfaction. Policies now cost 2–10% of what they did. Overspending on services now leads to fiscal stress. Still open: maximum taxes do not cost population within 8 years in a fully housed city, policy effects remain small, and halving service funding is still nearly free |
| 5 | Permanent power ceiling | **FIXED** (formula) / IMPROVED (outcome) | Substations share load, so a second one adds capacity (`tests/balance.test.ts`). Power reliability at year 20 rose from 27–40% to 46–75% across archetypes (dense 47 → 74, commercial 40 → 69). The remaining ceiling is siting: the bot cannot find free land, and `utility-infill` reaches 64% |
| 6 | Segregated or car layouts collapse from labour starvation | **FIXED** | Car, sprawl and industrial cities all collapsed before (0 by year 10–20). After, they survive on all 3 seeds at year 20. Car city unemployment at year 20 went from 29.5% to 0.7% |
| 7 | Abandonment cascade, no recovery | **IMPROVED** | Abandoned buildings at year 20 in surviving cities fell from 1–36 to 0–16. Residents are rehoused, shells clear, and QA B-recovery passes. One run still cascades: sprawl on seed 731 empties between years 31 and 34 (see remaining issues) |
| 8 | Flooding is dominant and can be fatal | **FIXED** | QA A-flood passes. A major-flood shock costs 3% of employment instead of 27%. Undrained cities survive but are visibly worse off: in QA A, water reaches 10%, land value 25 and QoL 21. Rainfall falls in a believable 1,200–3,200 mm a year (test). Floods still matter: wet seasons cost 10–15 satisfaction points |
| 9 | Buses profitable and instantly dominant | **DEFERRED** (Milestone 8) | Transit code belongs to Milestone 8. At its head, the `transit-net` experiment runs at 62% fare recovery, so buses are no longer profitable. Mode-choice code was not edited here |
| 10 | Road upgrades boost paratransit, not cars | **DEFERRED** (Milestone 8) | `road-upgrade` changes the car share very little in either codebase, and walking falls about 10 points. Mode choice belongs to Milestone 8 |
| 11 | QoL stuck in a narrow band | **IMPROVED** | The spread across archetypes at year 20 widened from 27–42 to 26–52, through utilities, fiscal stress and services. The QoL formula itself was not changed, and QoL within one city is still flat over time |
| 12 | Crime is inert | **UNCHANGED** | Crime is 32–45 across archetypes (was 39–45). High-service is lowest at 32. Not addressed in this pass |
| 13 | Housing prices are flat | **UNCHANGED** | Rent now differs more between archetypes (₦62k–₦89k against ₦61k–₦77k), but it stays flat within a city once it is full. Not addressed |
| 14 | Informal development only appears when failing | **UNCHANGED** | Informal buildings appear in a large low-tax city under fiscal stress (18 at year 20) and in a few others (0–2). Not addressed |
| 15 | Waste backlog unbounded, effects capped | **UNCHANGED** | Not addressed. The waste policy is now priced per depot |
| — | Starting town dies within a year (handed over by Milestone 8.1) | **FIXED** (with a known limit) | The untouched town survives 20 years on all 3 seeds (345–372 residents), against death within about 13 months before. It empties around year 25–30 once its only shop closes after a flood, with no player action. A balance test covers the first 3 years on 2 seeds |
| — | Long offline absences empty cities (handed over by Milestone 8.1) | **IMPROVED** | Continuous play now survives decades, and offline catch-up runs the same daily rules. QA's F scenario still measures 8.1's catch-up code (see Integration notes) |

## Config values changed

All of these are in `shared/simulation/balance-config.ts` (new), unless marked otherwise.

| Value | Before | After |
|---|---|---|
| Arrivals at full employment | Stopped dead | Taper from 6% to 20% unemployment (`frictionalUnemployment`, `migrantTolerance`) |
| Departures | Switched on at a satisfaction threshold | Ramp up from satisfaction 42 (range 22) and unemployment 35% (range 50), 0.6% a day at full push |
| Mood used for moving decisions | Today | Today averaged with the last 2 months (`moodMonths`) |
| Commute destinations considered | 8 | 14 |
| Shop hours | Full or closed | 60–100%, by customers per job (`fullHoursMarket` 0.9, `minimumHours` 0.6) |
| Days of decline before abandonment | Fixed | 90 + 0–60 per building. Counts 1 day in 4 while the city is flooded |
| Abandoned neighbour drag on land value | −7 each, uncapped | −6 each, capped at −18 |
| Redevelopment of abandoned shells | Land value ≥ 25 | Attractiveness ≥ 46. Cleared after 240 days |
| Firm reopening and expansion | n/a | Reopen at a market ratio of 0.55. Expand only above 0.85 |
| Storm decay | Peak repeated up to 7 days | ×0.55 per day, down to light rain |
| Flood memory | Permanent counter | Half-life of about a year (`floodMemoryDecay` 1/500) |
| Tax compliance | 100% | Up to −40% at the maximum rate (exponent 1.4) |
| Tax burden on satisfaction | None | Up to −10 (residential) and −6 (business) at the maximum. Cuts win back 30% |
| Fiscal stages | None | Stress at 3 months of debt, severe at 9. Funding 85% and 60%. Policies at 50% under severe stress |
| Debt interest | None | 1.2% a month, capped at 30% of revenue |
| Asset ageing | None | +1.2% upkeep a year, up to +45% |
| National cycle | None | 11-year (±7%) and 4.3-year (±3%) business waves. Fuel price moves against them with a slow upward trend |
| Policy costs (`governance-config.ts`) | ₦300–5,200 per resident city-wide | Per unit of basis: for example street lighting ₦5,000 per street tile, affordable housing ₦200 per resident, drainage ₦40,000 per drain |

## Tests and build

- **New:** `tests/balance.test.ts` has 19 tests:
  - substation sharing;
  - the maintenance equilibrium;
  - asset ageing;
  - the arrival taper and fractional departures;
  - flood layoffs;
  - shop hours and underemployment;
  - rehousing and shell clearing;
  - the starting town alive after 3 years (seeds 731 and 1009);
  - fiscal stages and the debt interest cap;
  - tax compliance and the tax burden;
  - policy pricing by basis;
  - storm tapering and annual rainfall;
  - flood memory decay and flood severity;
  - the national cycle and fuel price.
- **Updated:** `tests/infrastructure.test.ts` (storm spells now taper), `tests/living-city.test.ts` (a reopening needs enough customers) and `tests/organic-city.test.ts` (abandonment between 90 and 150 days).
- **Results:** 313 tests pass in 19 files (294 on the Milestone 8 head). `npm run lint` and `npm run build` succeed, and `git diff --check` is clean.

## Files changed

- **Simulation (shared/):** `shared/simulation/activity.ts`, `shared/simulation/balance-config.ts`, `shared/simulation/development.ts`, `shared/simulation/economy.ts`, `shared/simulation/engine.ts`, `shared/simulation/governance-config.ts`, `shared/simulation/governance.ts`, `shared/simulation/infrastructure.ts`, `shared/simulation/mobility.ts`, `shared/simulation/national-economy.ts`, `shared/simulation/public-services.ts`, `shared/simulation/road-network.ts`, `shared/simulation/weather.ts`, `shared/types/governance.ts`
- **UI (client/):** `client/ui/governance-panels.ts`, `client/ui/infrastructure-panels.ts`
- **Tests:** `tests/balance.test.ts`, `tests/infrastructure.test.ts`, `tests/living-city.test.ts`, `tests/organic-city.test.ts`
- **Balance harness (tools/balance/):** `tools/balance/.gitignore`, `tools/balance/bot.ts`, `tools/balance/build.sh`, `tools/balance/det-check.ts`, `tools/balance/exp-report.mjs`, `tools/balance/exp.ts`, `tools/balance/power-check.ts`, `tools/balance/rain-check.ts`, `tools/balance/report.mjs`, `tools/balance/run.ts`, `tools/balance/shock.ts`, `tools/balance/start-diag.ts`
- **Documentation:** `README.md`, `docs/BALANCE_RETEST.md`, `docs/balance.md`

## Known remaining issues

1. **Population plateaus at year 8–12.** Every archetype stops growing once its footprint is housed. Finances, satisfaction and mode share keep moving, but population does not. Level 3+ buildings need QoL ≥ 45 with reliable power and water, which few cities reach. The bot cannot clear land for services or utilities, so a skilled player would go further. This needs a redevelopment or density progression, which is gameplay work.
2. **A fully housed city's population barely reacts to conditions.** Departures only begin below satisfaction 42. Maximum taxes, a debt of −₦5B or water at 15% lower satisfaction by 10–15 points, but in most runs that stays above 42, so nobody leaves.
3. **One late cascade remains: sprawl on seed 731.**
   - The city runs a structural deficit for 25 years. The bot raises taxes to the high rates, which costs satisfaction, and fiscal stress follows.
   - In the wet season of year 31.5 satisfaction falls to 31 and the city empties within about 2.5 years.
   - Two alternatives were tested on this run:
     - Slower departures (0.3% a day) turn the collapse into an oscillation: the city falls to 6,700 and rebounds to 18,000, while debt still grows.
     - A 6-month mood window only delays the collapse by 2 years.
   - Neither was adopted. A proper fix is a recovery path for a city in structural deficit, such as austerity choices or restructuring. Sprawl survives on seeds 1009 and 4242 (20-year runs).
4. **Debt is bounded in cost but not in size.** A player who never raises taxes (low-tax) reaches −₦5.3B by year 50, under severe stress with power at 13%, and nothing forces a restructuring.
5. **The starting town dies around year 25–30** if the player never acts, once its only shop closes after a flood.
6. **Low-tax outcomes are sensitive to the seed.** Seed 731 reaches 43,000 people while 1009 and 4242 stay at 12,000–16,000, because a small satisfaction gain from low taxes tips its growth.
7. **QoL, crime, rent, informality and waste are largely unchanged within a city** (issues 11–15).
8. **QA D-policy and K-density still fail.** D-policy fails because debt does not cost population within 3 years. K-density fails because there are no level 4/5 buildings (see item 1).
9. **QA J-commute: adding a bus route raises the far commute.** Transit belongs to Milestone 8. This branch shows no collapse in that scenario (5,060 residents with and without the route).

## Integration notes

On 2026-10-07 Priest accepted this branch for integration. The open items in "Known remaining issues" (the year 8–12 plateau, the late sprawl collapse, and crime, rent and waste) are deferred to the combined Milestone 8 stabilization gate, because transport, accessibility, commuting and TOD may change their behaviour. No further balance changes are planned on this branch.

### Trial merges

Each trial merge was run locally on 2026-10-07 and was not pushed. Every branch shares the base `1333a37`. The rows that add 8.3, 8.1 or 8.4 were run on the Milestone 8 head `75905b3`.

| Merged onto this branch (`1a593bf`) | Textual conflicts | Result |
|---|---|---|
| Milestone 8 head `175fd99` (PR #1) | None. Both sides touch `shared/simulation/mobility.ts` in different places and git merges them automatically | 315 tests pass, type check clean, production build succeeds. At the earlier head `75905b3`: 314 pass |
| + Milestone 8.3 `9a70d3e` (PR #3) | 3 conflicts, all "keep both sides": the import lines at the top of `shared/simulation/engine.ts` and of `shared/simulation/mobility.ts`, and the new milestone sections in `README.md` | 321 tests pass |
| Milestone 8 + Milestone 8.1 `2c4de92` (PR #2) | None with this branch | 348 of 349 pass. The one failure is 8.1's "large cities replay far fewer full days" test hitting the default 5 s timeout. It also takes 5.0–5.6 s on 8.1's own branch, and it passes in isolation in both trees, so it needs an explicit timeout rather than a code change |
| Milestone 8 + Milestone 8.4 `9677e1b` (branch only) | None. Both sides touch `client/ui/governance-panels.ts` and `client/ui/infrastructure-panels.ts`, and git merges them automatically; this branch's fiscal-stage, policy-estimate and flood-event rows survive | 343 tests pass, production build succeeds |

Milestones 8.1 and 8.3 conflict with each other, not with this branch: in `step()` in `shared/simulation/engine.ts` and in `save()` in `client/main.ts`. Milestones 8.1 and 8.4 also conflict in `client/main.ts`.

### Files most likely to need attention

- **`shared/simulation/engine.ts`.** This branch adds one import and one call (`updateNationalEconomy`) after `updateGovernance`. Milestone 8.1 rewrites `step()` and Milestone 8.3 adds perf counters and tool batches there. Keep the call once per simulated day, including coarse offline days.
- **`shared/simulation/mobility.ts`.** This branch changes one line, `slice(0, 8)` to `slice(0, BALANCE.labour.commuteDestinations)`, and adds one import. Milestone 8 and 8.3 edit the same file elsewhere.
- **`README.md`.** Every branch adds a milestone section near the top. Keep all of them.
- **`client/ui/governance-panels.ts` and `client/ui/infrastructure-panels.ts`.** Milestone 8.4 restyles these panels. These merge automatically, but check that the Budget tab still shows the fiscal stage and the policy cost estimates.

### Behaviour to recheck after integration

- **Milestone 8 transit.** These results were measured on `1333a37`. The Milestone 8 head has since added `TRANSIT.slowerSensitivity` (`75905b3`) and lowered `timeFloor` to keep short trips on foot (`175fd99`), so transit and walking shares here may shift a little after integration.
- **Milestone 8.3 (traffic every third day).** The flood-unemployment and flood-decline rules read the daily `floodedTiles`, not traffic, so they should be unaffected. Employment comes from commute assignment in `mobility.ts`, so under 8.3 the employment that drives migration and shop hours can be up to 2 days old. After integration, rerun `tools/balance` for 20 years to confirm.
- **Milestone 8.1 (offline catch-up).** The road-graph cache now keys on its bucketed inputs, so save/reload and continuous play give identical results (`tools/balance/det-check.ts`). The catch-up algorithm belongs to 8.1. Its coarse and aggregate days should still apply the daily rules this branch changed: national economy, fiscal stages, flood decline and asset ageing.
- **Saves.** No saved fields were added. Version 9 saves load unchanged.

## Reproducing

```bash
bash tools/balance/build.sh
cd tools/balance
node dist/run.mjs balanced 50 731 out/balanced-731.json   # archetype, years, seed
node dist/exp.mjs make-base 8 8 731 && node dist/exp.mjs tax-max 8 8 731
node dist/shock.mjs 731 8 6 > out/shock-731.json
node report.mjs before=<dir> after=<dir> --years 5,20,50 --seeds 731
node exp-report.mjs before=<dir> after=<dir>
```

Full tables, with all 30 metrics for every run and seed, are in the project file `balance/retest-data/full-tables.md`.
