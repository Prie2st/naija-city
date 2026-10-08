# QA retest on the Milestone 8 integration branch

This is the integration retest that `/mnt/project-files/qa/RETEST_PLAN.md` describes. It compares the frozen pre-fix baseline with the integrated build of M8, M8.1, M8.2, M8.3 and M8.4.

- **Baseline:** commit `b345c7f`, frozen on 2026-10-07. `bash /mnt/project-files/qa/frozen/verify.sh` reports "Frozen baseline intact." before and after this retest. Nothing under the frozen baseline, its harness procedures or its numbers was changed.
- **Integrated build:** branch `claude/m8-integration-stabilization-wzgiv1`. The harness ran on `82f1e67`. The only later commit adds tests and fixture files, so simulation and client code are the same.
- **Harness:** the frozen scenarios in `/mnt/project-files/qa/harness/scenarios/`, run unchanged with `run.sh`. Results are in `/mnt/project-files/qa/results/integration-82f1e67/`. Supplementary diagnostics are in `/mnt/project-files/qa/results/supp-integration-82f1e67/`, with extra probes in its `probe-J/`, `K-plus/` and `manual/` folders.
- **Pass criteria** are the frozen ones, printed in each `SUMMARY.txt`. A FAIL against a criterion is reported as a FAIL even where the interpretation explains why it is acceptable.

## Summary

| Scenario | Baseline | Integrated | Status |
|---|---|---|---|
| A. Beginner city through floods | FAIL | PASS | FIXED |
| B. Regrowth after collapse | FAIL | PASS | FIXED |
| C. Weather at new-game start | FAIL | FAIL | IMPROVED |
| D. Policy cost and debt | FAIL | FAIL | IMPROVED |
| E. Police and safety | FAIL | PASS | FIXED (marginal) |
| F. Offline catch-up | FAIL | PASS | FIXED (time); long-absence outcome needs a design decision |
| G. Services | PASS | FAIL | REGRESSED against the criterion; see interpretation |
| H. Informal housing | PASS | PASS | IMPROVED |
| I. Affordability | FAIL | FAIL | UNCHANGED |
| J. Commutes and transit | FAIL | FAIL | IMPROVED (no collapse); bus part DEFERRED |
| K. Density levels 4–5 | FAIL | FAIL | UNCHANGED under the frozen setup; attainable with real utilities |
| S. Saves | PASS | PASS | UNCHANGED (still passing) |

## A. Beginner city through floods

- **BASELINE:** seeds 731 / 1 / 2024 peaked at 4,040 / 9,270 / 5,954 and ended at 4 / 9,270 / 856. 68 / 13 / 31 abandoned buildings. Two of three cities collapsed. Worst population left after a storm: 1%, 82% and 51%.
- **INTEGRATED RESULT:** peaks 13,300 / 14,679 / 12,220, and every city ends at its peak. 0 abandoned buildings on every seed. No storm reduced population (worst ratio after a storm 1.00). Seed 731 at day 720: 69 flooded tiles, maximum depth 95, 97% of roads usable.
- **DELTA:** end population +13,296 / +5,409 / +11,364. Abandonment −68 / −13 / −31.
- **STATUS:** FIXED.
- **INTERPRETATION:** M8.2's flood and recovery rebalance holds after integration. Storms still flood tiles and block roads, but they no longer start an abandonment cascade in an undrained city. Utilities are now the weak point of this layout (power 31%, water 10% at day 720 on seed 731), which matters for G and K.

## B. Regrowth after collapse

- **BASELINE:** cities forced down to 50 / 10 / 5 / 0 residents ended at 4 / 3 / 1 / 2. A naturally collapsed city stayed at 3. Nothing regrew.
- **INTEGRATED RESULT:** 50 → 10,745; 10 → 835; 5 → 830; 0 → 8 (peak 16). The "natural collapse" setup no longer collapses (13,300 at the hand-over) and grows to 23,960.
- **DELTA:** every non-zero start regrows past the 500-resident bar within 720 days.
- **STATUS:** FIXED.
- **INTERPRETATION:** the C-1 soft-lock is gone. A city with zero residents still does not restart on its own, which the criterion allows ("0 reported only"). The 10- and 5-resident cities regrow more slowly than the 50-resident one, as expected.

## C. Weather at new-game start

- **BASELINE:** 6 new cities all had seed 731 and one identical weather sequence. Each got an extreme storm on day 9 that flooded 305 tiles. 6 of 6 had an early catastrophe.
- **INTEGRATED RESULT:** still 1 distinct sequence (all seed 731; extreme weather on day 9). The worst early flood is 71 tiles, the first big flood comes on day 10, and 0 of 6 cities have an early catastrophe. Population on day 90 is 471 (was 440).
- **DELTA:** worst early flood −234 tiles; early catastrophes 6 → 0.
- **STATUS:** IMPROVED. The criterion still fails because every new game is identical.
- **INTERPRETATION:** the day-9 disaster is gone. The other half of H-1 remains: `client/main.ts` calls `createCity()` with no seed, so every new game is the same map with the same weather. Explicit seeds stay deterministic (save tests and S pass). Giving new games a random seed changes map identity and the player-facing opening, which is a product decision rather than an integration fix, so it is DEFERRED (see the gate report).

## D. Policy cost and debt

- **BASELINE:** one city-wide policy cost ₦93M a month against ₦26M of revenue (3.6× revenue). Extreme use reached −₦4.75B in a year. A forced −₦2B debt left population within the noise band (18,665, unchanged).
- **INTEGRATED RESULT:** one policy costs ₦4M a month against ₦31M of revenue (0.13×). Several policies cost ₦3M. Extreme use costs ₦15M a month and the treasury ends at +₦559M. A forced −₦2B debt ends at −₦1.81B with population 20,871, which is 309 below the solvent run and inside the noise band (20,408–21,180).
- **Supplementary X-D:** after the −₦2B shock with no action, the treasury recovers from −₦1,988M to −₦1,558M in 24 months, about ₦20M a month, and population reaches 24,460 against 24,620 solvent. Two policies end at 24,620 with −₦1,689M. Maximum taxes empty the city to 712 residents (satisfaction 15).
- **DELTA:** policy cost relative to revenue falls from 3.6× to 0.13×. Extreme-use debt goes from −₦4.75B to +₦559M.
- **STATUS:** IMPROVED. The criterion still fails on its third part, because debt does not change population beyond noise.
- **INTERPRETATION:** M8.2 fixed policy pricing, and a debt now recovers through ordinary surpluses. Debt still has almost no direct consequence for residents, and the deeper fiscal gap remains: a city in structural deficit has no restructuring path (see the long-run section of the gate report, where sprawl on seed 731 empties after 22 years of deficit). Maximum taxes are now the harsh lever. Both are recorded as DEFERRED.

## E. Police and safety

Reported separately, as Priest asked.

- **BASELINE:** strong police coverage raised public safety from 68.0 to 73.5 (+5.5). Response time fell from 60 to 28.6 minutes. Incidents fell from 296 to 284 (−4.1%).
- **INTEGRATED RESULT:** public safety 68.5 → 73.7 (+5.2). Response time 60 → 31.4 minutes. Incidents 335 → 315 (−6.0%). Serious incidents 15 → 14. Night safety 62.7 → 68.0. Weak coverage changes almost nothing (68.3 safety, 325 incidents).
- **DELTA:** safety gain −0.3 points; response 2.8 minutes slower than baseline's strong case; incident reduction +1.9 points.
- **STATUS:** FIXED, marginally. Safety clears the 5-point bar by 0.2 and incidents clear 5% by 1.0 point.
- **INTERPRETATION:** strong policing works without eliminating incidents. The margins are thin, so this is a pass, not a strong one. Police access stays low (8.6%) because one area command covers little of a 24k city.

## F. Offline catch-up

Three cities: an untouched new town (500 residents), a developed beginner city with drainage (6,798) and the healthy 720-day city (14,080). Wall-clock times are Node on an otherwise idle machine.

| City | Away | Baseline time | Integrated time | Baseline population after | Integrated population after | Baseline treasury change | Integrated treasury change |
|---|---|---:|---:|---|---|---:|---:|
| New town | 1 h | 3.9 s | 2.2 s | 500 → 0 | 500 → 452 | −₦14M | −₦7M |
| New town | 8 h | 14.3 s | 2.0 s | → 0 | → 452 | −₦127M | −₦57M |
| New town | 24 h | 41.7 s | 1.8 s | → 0 | → 452 | −₦385M | −₦239M |
| New town | 7 d | 41.0 s | 1.6 s | → 0 | → 452 | −₦385M | −₦239M |
| Developed | 1 h | 11.0 s | 1.6 s | 6,298 → 18,665 | 6,798 → 12,020 | +₦403M | +₦363M |
| Developed | 8 h | 63.4 s | 1.5 s | → 3,079 | → 12,100 | +₦820M | +₦3,144M |
| Developed | 24 h | 127.7 s | 1.4 s | → 0 | → 12,100 | −₦125M | +₦9,013M |
| Developed | 7 d | 120.9 s | 1.4 s | → 0 | → 12,100 | −₦125M | +₦9,013M |
| Large | 1 h | 14.6 s | 1.8 s | 13,202 → 6,895 | 14,080 → 18,654 | +₦471M | +₦558M |
| Large | 8 h | 58.3 s | 2.0 s | → 3,077 | → 18,794 | +₦675M | +₦4,550M |
| Large | 24 h | 120.5 s | 1.9 s | → 0 | → 18,794 | −₦324M | +₦13,144M |
| Large | 7 d | 129.5 s | 2.0 s | → 0 | → 18,794 | −₦324M | +₦13,144M |

Simulated time: 720 days (2 city years) for 1 hour, 5,760 (16 years) for 8 hours, and 17,280 (48 years, the cap) for 24 hours and 7 days.

- **BASELINE:** worst catch-up 129.5 s. Every city was empty after 24 hours away.
- **INTEGRATED RESULT:** worst 2.2 s. No city empties. Short catch-up still matches `advance` exactly (S, and M8.1's tests).
- **DELTA:** worst time −127 s (−98%). Population after 24 hours: 0 → 452 / 12,100 / 18,794.
- **STATUS:** FIXED against the criterion. The outcome needs Priest's attention (below).
- **INTERPRETATION:** M8.1's tiered replay makes catch-up fast, and M8.2's balance stops the collapses. Past the first 240–600 days, though, absences add money and calendar time but almost no growth: the developed city ends at 12,100 whether the player is away 8 hours or 7 days, against 24,620 in continuous play over the same days, while ₦9B accumulates. Priest accepted long-absence approximation for M8.1, so this is not a regression, but 16 to 48 city years passing while the city stands still is a design question. The gate report (section G) proposes the smallest change and leaves the decision to Priest.

## G. Services

Each service, one facility in the healthy 720-day city, compared with a 4-run noise band after 720 more days.

- **BASELINE:** PASS. The control city was collapsing (6,169–8,173 residents, from 14,080). Education, healthcare and fire each kept 2,000–3,000 more residents than the band and raised satisfaction and land value; their QoL was below the band. Parks were within the band on everything.
- **INTEGRATED RESULT:** FAIL. The control city no longer collapses (24,160–24,620). Per service:
  - **Education** (coverage 15%): satisfaction 54.8 and QoL 19.2, both above the band. Population and land value within it.
  - **Healthcare** (coverage 7%): satisfaction 52.5, below the band. Everything else within.
  - **Parks** (coverage 6%): satisfaction 52.8 and land value 31.1, below the band. Population and QoL within.
  - **Fire** (coverage 10%): satisfaction 52.6, below the band. Fire damage 209 against 279–286 in the controls (−26%).
- **Supplementary X-G:** QoL changes against the control are +0.3 (education), −0.2 (healthcare), −0.4 (parks) and −0.3 (fire). In the control's QoL breakdown, power is 16.6 and water 4.4 out of 100.
- **DELTA:** services that move an outcome above the band: 3 of 4 → 1 of 4.
- **STATUS:** REGRESSED against the criterion. Not a functional regression.
- **INTERPRETATION:** the baseline pass came from a collapsing control. Any help slowed the collapse, so every service looked strong. With a stable control, one facility covering 6–15% of a 24,000-person city barely moves city-wide averages, which is what M-1 described. QoL no longer falls when a service is added; it stays flat. The satisfaction dips for healthcare, parks and fire are under 1.7 points and come from running costs and taxes. Fire stations do their actual job (26% less fire damage). The utility collapse in this fixture (power 17, water 4) dominates QoL. Service strength is a tuning question for later work and is DEFERRED; the integration did not change service rules.

## H. Informal housing

- **BASELINE:** extreme pressure: 3 informal homes of 48 buildings, peak pressure 66. Moderate pressure: 0 of 78. Formal control: 0 of 147.
- **INTEGRATED RESULT:** extreme: 11 of 57 (19%), peak pressure 80. Moderate: 1 of 79, pressure 57. Formal control: 0 of 151, pressure 42.
- **DELTA:** extreme +8 informal homes; moderate +1; control unchanged.
- **STATUS:** IMPROVED (still PASS).
- **INTERPRETATION:** informality now responds to pressure in steps: none in a healthy formal city, a little under moderate pressure, and a lot under extreme pressure.

## I. Affordability

- **BASELINE:** high supply 93, constrained 83, high value 96, lower income 100. Spread 17 points, none below 80.
- **INTEGRATED RESULT:** high supply 92, constrained 89, high value 85, lower income 99. Spread 14 points, none below 80. Lowest local values: 70 / 81 / 68 / 94.
- **DELTA:** spread −3 points. The high-value city fell 11 points and the constrained city rose 6.
- **STATUS:** UNCHANGED (FAIL).
- **INTERPRETATION:** the ordering is now more plausible (the high-value city is least affordable), but city-wide affordability still sits at 85–99. Rent responds; incomes and the affordability cap flatten the result. M8.2 left rent and affordability for later. DEFERRED.

## J. Commutes and transit (corrected scenario)

- **BASELINE:** near-jobs commute 15.1 minutes; far-jobs 19.3 (+4.2). The far city shrank to 2,297 and its control to 1,282. With a bus route the far commute was 14.4 against 9.5 without.
- **INTEGRATED RESULT:** near 15.4 minutes; far 27.7 (+12.3). Every variant keeps all 5,060 residents. Far control 26.7 minutes; with the bus route 31.2 minutes, 948 daily bus riders, job access 78.9 against 95.6, satisfaction 55.0 against 56.7.
- **DELTA:** far-jobs penalty +4.2 → +12.3 minutes. Far city population 2,297 → 5,060. The bus still raises the far commute (+4.5 minutes, was +4.9).
- **STATUS:** IMPROVED. The criterion fails only on its bus half. That half is DEFERRED to the fare-savings modelling item Priest already deferred.
- **INTERPRETATION:** distance now matters strongly. The bus route on this corridor plans journeys of about 60 minutes with 2 buses and 48–52 minutes with 6, against 29–32 minutes by road (`tr/jdiag` in the gate report). By door-to-door time it is not competitive, and with M8's sensitivity of 2 and floor of 1/50, about 12% of commuters still pick it, because it is cheap. Their slower trips raise the average commute, and job access falls through its `min(1, 25 / commute)` factor. Making a cheap but slower trip count properly needs the deferred fare-savings item in transport cost of living.

### Probe J against M8 and M8.2 together

Evidence: `X-J-transit-repeat` (5 start days, 2 and 6 buses) and `probe-J/` (the frozen probe, variants none, depot, stops, 2-bus and 6-bus).

| # | Expectation | Result | Met |
|---|---|---|---|
| 1 | The fragile town survives and grows | All variants keep 5,060 residents (housing full) through day 900. Before: 1 of 5 runs collapsed on the baseline and 3 of 5 on M8 alone | Yes |
| 2 | A sensible 2-bus route does not collapse it | Lowest population 5,032, ends at 5,060; 524 riders | Yes |
| 3 | A 6-bus route may worsen congestion and commutes | Congestion 77.0 → 81.8; commute 26.2 → 30.8 minutes | Yes |
| 4 | Bad planning still has consequences | 6 buses: treasury ₦366M → ₦120M, expenses ₦17M against ₦12M income, job access 96 → 79 | Yes |
| 5 | No irreversible migration or business death spiral | 0 collapses in the 5 X-J runs (four 6-bus start days, one 2-bus) and the two probe runs; employment dips (2,277 → 1,933) and recovers to 2,270 | Yes |
| 6 | Useful BRT keeps its commute benefit | M8's 30k corridor: 12.4 → 9.9 minutes integrated (M8 alone 13.1 → 10.0); with 8× load 13.8 → 10.4 | Yes |
| 7 | Ridership follows door-to-door competitiveness, not cheap fares alone | A useful route carries 3,249 riders; a useless one 0. Fares from ₦0 to ₦800 cut riders only 18% (5,072 → 4,145). The slow, cheap J route still keeps about 12% of commuters | Mostly. Time decides whether a route works at all, but cheapness keeps a minority on slow routes (the deferred item) |
| 8 | Congestion and bus road load remain real | Congestion with no route 77.0, with 2 buses 78.2, with 6 buses 81.8; average speed 11.3 → 10.5 km/h with 6 buses. `TRANSIT` congestion and road-load settings are unchanged from M8 | Yes |

## K. Density levels 4–5

- **BASELINE:** levels at day 1,440: 50 / 82 / 39 / 0 / 0. Treasury −₦614M. Power 41%, water 27%.
- **INTEGRATED RESULT:** 38 / 84 / 47 / 0 / 0. Treasury +₦787M. Power 47%, water 26%. QoL 24.2.
- **Supplementary X-K:** all 47 level-3 buildings fail the utilities check (median power 55, water 32; level 4 needs 75 / 78) and the QoL ≥ 45 check (median 24).
- **K+ experiment (not part of the frozen harness):** the same beginner layout with deliberately oversupplied public utilities (4 gas plants, 9 substations, 2 treatment plants, 6 towers), 21 service facilities, the density policy and ₦3B extra. The first level-4 buildings appear by day 360 and level 5 by day 540, with QoL about 72 and power and water near 96. By day 720 the levels are 1 / 3 / 2 / 6 / 19. As the city grows to 35,380 by day 2,160 its utilities fall to power 52 and water 36, but the 9 level-4 and 20 level-5 buildings stay.
- **DELTA:** +8 level-3 buildings; still none at 4 or 5 in the frozen setup.
- **STATUS:** UNCHANGED under the frozen setup.
- **INTERPRETATION:** requirements were not lowered. Levels 4–5 are reachable when a player supplies utilities and services ahead of growth. The frozen K city does not, because its water capacity cannot keep up. Density is blocked by utilities and QoL, not by demand or land value. The year 8–12 population plateau in the long runs has the same cause.

## S. Saves

- **BASELINE:** PASS. Every state round-tripped identically, reloading every 20 days matched continuous play, and catch-up matched `advance`. The transport-heavy setup had a setup error ("Choose dry land.").
- **INTEGRATED RESULT:** PASS on all five states (mid-game 4,525, extreme debt 17,520, the former collapse case 13,300, developed 14,080, transport-heavy 14,919 with 2 routes). The same setup error appears, so the frozen transport-heavy save has its depot rejected and its routes have no service.
- **Further save checks in the integrated build** (gate report, section E):
  - Real saves written by `b345c7f`, M8 `175fd99`, M8.1, M8.2, M8.3 and M8.4, and synthetic v3, v6, v7 and v8 saves, all load with no repair. Routes, stops, corridors, treasury and tiles survive, 90 days of play stay finite and valid, and they re-save identically.
  - Two real pre-integration transit saves (a depot, 10 stops and 2 bus routes, one in M8's v9 format and one in M8.1's envelope) are now committed fixtures in `tests/integration-saves.test.ts`.
  - In the browser: a corrupted current save restores the older save with a notice and keeps the unreadable copy in quarantine. A full-storage failure shows "Your city was NOT saved" and keeps the last good save. Short catch-ups replay day by day.
- **DELTA:** none against the criterion.
- **STATUS:** UNCHANGED (still PASS).
- **INTERPRETATION:** M8.1's storage and the M8 transport state work together. The `Choose dry land.` setup error is a fault in the frozen harness, present in the baseline as well. A transport-heavy save with working routes was tested separately (above).

## Manual checks

| Item | Baseline | Integrated | Status |
|---|---|---|---|
| M-5 Solar output | Sampled hours 6/12/18/0 hit zero output 3 days in 4 | Unchanged: `weather.ts:12` still samples `[6, 12, 18, 0]` | UNCHANGED, DEFERRED |
| M-7 Replay after a failed load | First tab switch replays time already played | When autosave is off, hiding the tab sets `lastSimulatedTimestamp` to now (`client/main.ts:542`) | FIXED |
| M-8 Districts cannot be removed | No delete or edit | Still no delete, resize or reassign | UNCHANGED, DEFERRED (M8.4 lists district UX as deferred) |
| M-9 0% maintenance destroys the city | Healthy 14k city: 0 residents within 2 years at 0% and 50% (the 100% control also fell to 6,895) | 100%: 24,620; 50%: 24,460; 0%: 23,299 after 2 years | FIXED. 0% now costs about 5% of population and saves ₦1.6M a month; it may now be too mild |
| L-1 Slow painting | 15 ms–90 ms per tile | Batched drag (M8.3): a 25-tile drag is one settle (see performance) | FIXED |
| L-2 Fires always "contained" | `age >= 5` closes any fire | Unchanged (`public-services.ts:199`) | UNCHANGED |
| L-3 Challenge trimming | `slice(-64)` in safety | Unchanged (`safety.ts:135`) | UNCHANGED |
| L-4 Fuel price fixed | Always 1 | M8.2's national economy writes `fuelPrice` each day | FIXED |
| L-9 Offline report totals | `displacedResidents` reported as total | Unchanged | UNCHANGED |
| X-1 Stale README save versions | Versions 4–7 cited | Still present in historical milestone sections; current sections say v9 | UNCHANGED (history kept on purpose) |
| X-2 Day numbering | `Day ${tick}` vs `Day ${tick+1}` | Unchanged | UNCHANGED |
| X-4 Bundle warning | 1.67 MB chunk | Still warns | UNCHANGED |

L-5, L-6, L-7, L-8 and X-3 were not rechecked; no workstream touched them.

## Browser scripts

The five older browser scripts (`tools/check-governance-browser.cjs`, `check-living-browser.cjs`, `check-public-service-controls.cjs`, `check-public-services-browser.cjs`, `check-safety-browser.cjs`) hard-code a Windows Playwright path and read the old `naija-city-v6` save key. With the path patched, all five already fail on the M8 head `175fd99`, before any integration, so they are stale tooling rather than a regression. On the integrated build, governance and safety stop earlier at the Govern tab that M8.4 moved on purpose, and public services at the `[data-overlay="education"]` selector. `tools/check-transit-browser.cjs` passes on the integrated build, and the integration UX script (`/mnt/project-files/integration/ux/ux.cjs`, 90 checks at four screen sizes) covers the M8.4 and M8.1 behaviour. The stale scripts were not rewritten during the gate (deferred, report section O).
