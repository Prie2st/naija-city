# Milestone 8 Integration & Stabilization Report

Integration branch: `claude/m8-integration-stabilization-wzgiv1`, started from the M8 head `175fd99`.

This report was written in stages. Sections A and the pre-integration inventory were committed before any branch was merged, as the gate requires. Later sections were filled in after integration.

## A. Integrated branches and exact SHAs

Heads verified with `git fetch origin` on 2026-10-07 at 14:25 UTC, before integrating.

| Workstream | PR | Branch | Verified head | Base (merge-base with M8) | Commits on top of base |
|---|---|---|---|---|---|
| M8 transport | #1 | `claude/project-thread-v9t12a` | `175fd99` Keep short trips on foot when transit is far slower | `b345c7f` | 4 since b345c7f (`4db32b5`, `1333a37`, `75905b3`, `175fd99`) |
| M8.1 saves and offline | #2 (draft) | `claude/project-thread-vxkbs9` | `2c4de92` Use compact base64 float columns and encode before validating saves | `1333a37` | 4 (`63836a4`, merge `0008945`, `60a9edd`, `2c4de92`) |
| M8.2 balance | #4 | `claude/project-thread-dlaiq4` | `16b68ef` Record the trial merge onto the latest Milestone 8 head | `1333a37` | 6 (`24a6040`, `09c682f`, `91271a5`, `1a593bf`, `5c9791e`, `16b68ef`) |
| M8.3 performance | #3 (draft) | `claude/project-thread-9buyln` | `9a70d3e` Speed up transit search, honour the three-day traffic cadence and batch drag painting | `1333a37` | 1 |
| M8.4 UX | none | `claude/project-thread-9cl92x` | `9677e1b` Stabilize UX for panels, touch building and governance access | `1333a37` | 1 |

All reported SHAs match: M8.1 `2c4de92`, M8.3 `9a70d3e` and M8.4 `9677e1b` are the branch heads. M8.2's head `16b68ef` adds only documentation on top of the accepted code commit `91271a5`/`1a593bf`/`5c9791e`.

**Transit time floor.** The brief says the M8 floor went from 1/10 to 1/15. The code at `175fd99` says `timeFloor: .02` (1/50) in `shared/simulation/transit-config.ts:25`, with `slowerSensitivity: 2`. The integration keeps the code value; nothing was changed.

`main` is still `00a41ac Initial commit`. Nothing has been merged into it or into PR #1.

## Pre-integration inventory

### Working tree and M8 base

- Working tree clean on the integration branch at `175fd99` before any merge.
- `npm test` on M8 `175fd99`: 296 tests in 18 files pass (406 s with `--maxWorkers=1`).
- `npm run build` on M8 `175fd99`: passes (type check plus Vite build, 10 s; only the existing chunk-size warning).

### Ancestry

Every workstream branched from M8 commit `1333a37`. M8 has since gained `75905b3` (slower journeys lose riders faster, `TRANSIT.slowerSensitivity`) and `175fd99` (time floor `.1` to `.02`). No workstream contains those two commits, except that M8.1's merge `0008945` brought M8 up to `1333a37` only. Starting from `175fd99` and merging each workstream into it therefore keeps the newest transport code; merging M8 into a workstream branch first would not be needed.

### Files changed by more than one workstream (since `1333a37`)

| File | Changed by |
|---|---|
| `shared/simulation/engine.ts` | M8.1 (offline planner, `step(city, mobility)`), M8.2 (`updateNationalEconomy` in `step`), M8.3 (tool batches, `settleToolBatch` in `step`, perf counters) |
| `shared/simulation/mobility.ts` | M8 (`slowerSensitivity` in `chooseModes`), M8.2 (`BALANCE.labour.commuteDestinations`), M8.3 (three-day cadence with 5% swing recheck, `lastTick` only moves on progress) |
| `shared/simulation/transit-config.ts` | M8 (`slowerSensitivity`, `timeFloor`), M8.3 (`MOBILITY` cadence block) |
| `client/main.ts` | M8.1 (save results, recovery notice, chunked catch-up progress), M8.3 (drag batches, `settleToolBatch` in `save()`, `?perf` overlay), M8.4 (panel hierarchy, Welcome Back, Settings via `settingsPanelHtml`, gestures) |
| `client/game/CityScene.ts` | M8.3 (perf monitor, batched drag), M8.4 (touch gesture policy, Draw mode) |
| `client/ui/style.css` | M8.3 (perf overlay), M8.4 (panels, bottom sheets) |
| `client/ui/governance-panels.ts`, `client/ui/infrastructure-panels.ts` | M8.2 (policy cost basis text), M8.4 (panel headers) |
| `docs/transit.md` | M8, M8.3 |
| `README.md` | M8.1, M8.2, M8.3, M8.4 |

Pairwise dry merges (`git merge-tree`): every workstream merges into M8 `175fd99` without conflict on its own. Between workstreams: M8.1 × M8.3 conflict in `engine.ts` and `client/main.ts`; M8.1 × M8.4 in `client/main.ts` and `README.md`; M8.3 × M8.4 in `client/main.ts`, `CityScene.ts` and `style.css`; M8.2 × M8.3 in `engine.ts`, `mobility.ts` and `README.md`. M8.2 × M8.1 and M8.2 × M8.4 are clean.

### Schema and persisted state changes

- **M8 after `1333a37`:** configuration only (`TRANSIT.slowerSensitivity`, `timeFloor`). No persisted field added. Transit state has been in v9 since `b345c7f`; `4db32b5` and `1333a37` added only `OfflineReport` fields, which are not saved.
- **M8.1:** no city schema change (still v9). New storage envelope and keys (`naija-city-save-current`, `-backup`, `-quarantine`), validation (`validateCityState`), derived-state repair (`save-repair.ts`), `OfflineReport.exactDays` (not saved).
- **M8.2:** no persisted field added. `PolicyDefinition.basis` is configuration. The national economy is derived from seed and day and writes the existing `infrastructure.fuelPrice` each day.
- **M8.3:** no persisted field added. Tool batches and perf counters are module-level `WeakMap`/module state, never saved. It changes when `mobility.lastTick` and `transit.lastTick` move (only on daily progress), which affects saved values but not their shape.
- **M8.4:** presentation only; no simulation or save change.

### Tests that may conflict

- M8.2 edits expectations in `tests/infrastructure.test.ts`, `tests/living-city.test.ts` and `tests/organic-city.test.ts`, and adds `tests/balance.test.ts`.
- M8.3 edits `tests/simulation.test.ts` and adds `tests/performance.test.ts`.
- M8.1 edits `tests/storage.test.ts` and adds `tests/save-reliability.test.ts`. The M8.2 thread saw one M8.1 test (large-city offline) exceed Vitest's 5 s default timeout once balance changes were present.
- M8.4 adds `tests/ux-stabilization.test.ts`.
- M8's `tests/transit.test.ts` (slower-bus regression) was written against pre-M8.2 balance and pre-M8.3 cadence; both may move its numbers.

### Shared simulation functions touched by several workstreams

- `step()` (M8.1 mobility mode, M8.2 national economy, M8.3 tool-batch settle and timing).
- `updateMobility()` (M8 mode choice, M8.2 destination count, M8.3 cadence). M8.1's offline replay calls it with `'skip'`/`'force'` and assumes the old cadence check.
- `prepareTransit()`/`finishTransit()` (M8.3 `lastTick` rule) under M8.1's coarse offline replay.
- The offline catch-up (`catchUp`, `catchUpInChunks`) uses `step()`, so it inherits M8.2's balance and M8.3's cadence.

## B. Merge order and ancestry

All four workstreams branched from M8 `1333a37`, but M8 has moved on to `175fd99` since (slower-journey sensitivity and the 1/50 time floor). The integration branch therefore starts at `175fd99` and merges each workstream into it with ordinary merge commits. No workstream is rebased, and no workstream's copy of M8 can replace the newer transport code, because each merge only brings in that branch's own changes since `1333a37`.

| Step | Commit | What it merged | Conflicts | Checks after the step |
|---|---|---|---|---|
| 0 | `0a67b8c` | Inventory (this report, sections A and pre-integration) | none | — |
| 1 | `cf6270f` | M8.2 balance, PR #4 `16b68ef` | none | type check, balance/infrastructure/living/organic/transit tests, `git diff --check`, transport files unchanged against `175fd99` |
| 2 | `11b1425` | M8.3 performance, PR #3 `9a70d3e` | `engine.ts`, `mobility.ts` imports; README | type check, performance/simulation/transit tests, `git diff --check` |
| 3 | `6bdf4bf` | M8.1 saves and offline, PR #2 `2c4de92` | `engine.ts` `step()`; `client/main.ts` `save()`; README | type check, save-reliability/storage/simulation/performance tests (55 of 56 passed; the one failure is below), `git diff --check` |
| 4 | `b937d6a` | M8.4 UX, branch `9677e1b` | `client/main.ts`, `CityScene.ts`, `style.css`, `panel-layout.ts`, `welcome-back.ts`, README | type check, ux-stabilization/save-reliability/performance tests, `git diff --check`, browser checks |
| 5 | `82f1e67` | Test timeout for M8.1's 500k offline-plan test | — | full suite |
| 6 | `26a9c89` | Tests that load real pre-integration transit saves | — | full suite |

M8.2 went first because it touches no client code and merges cleanly. M8.3 went before M8.1 so that `step()` and `save()` could be resolved once with all three owners present, and M8.4 went last because it is presentation over the other three.

After every step the transport files (`transit*.ts`, `mobility.ts`, `transit-config.ts`) were compared with `175fd99`. The only differences are M8.3's search, cadence and `MOBILITY` block and M8.2's destination-count setting. `TRANSIT.slowerSensitivity` (2) and `timeFloor` (.02) are unchanged.

## C. Conflicts encountered

| File | Between | Kind |
|---|---|---|
| `shared/simulation/engine.ts` imports | M8.2 × M8.3 | Additive: national economy beside perf counters |
| `shared/simulation/mobility.ts` imports | M8.2 × M8.3 | Additive: `BALANCE` beside transit-search release and perf |
| `shared/simulation/engine.ts` `step()` | M8.1 × M8.2 × M8.3 | Semantic (section D) |
| `client/main.ts` `save()` | M8.1 × M8.3 | Semantic |
| `client/main.ts` catch-up, start-up message, Settings, painting | M8.1 × M8.3 × M8.4 | Semantic |
| `client/game/CityScene.ts` pointer-up and stroke hooks | M8.3 × M8.4 | Semantic |
| `client/ui/style.css` | M8.3 × M8.4 | Additive: perf overlay beside sheets |
| `client/ui/panel-layout.ts`, `welcome-back.ts` | M8.1 wording × M8.4 layout | Semantic (no textual conflict; M8.4's new Settings had dropped M8.1's status line) |
| `README.md` | all four | Additive milestone sections |

No conflict was resolved by taking one side's whole file.

## D. Semantic conflict resolutions

- **`step()`** (`shared/simulation/engine.ts`). One simulated day now: settles any open tool batch (M8.3), advances the tick, runs governance, then the national economy (M8.2), weather, infrastructure, floods, refresh, then mobility with M8.1's offline mode (`'normal' | 'skip' | 'force'`), and records the day's time (M8.3). Active play always uses `'normal'`, which follows M8.3's three-day cadence. M8.1's coarse replay uses `'skip'` and `'force'`, and its tests still pass under the cadence.
- **`save()`** (`client/main.ts`). M8.1's verified repository write, its failure warning and recovery text, plus M8.3's `settleToolBatch(city)` before the timestamp, so a save taken mid-stroke keeps every painted tile.
- **Catch-up.** M8.4's single card and progress bar now drive M8.1's `catchUpInChunks` on the target city. "Load saved city" still catches up a separate object, as M8.1 needs.
- **Start-up message.** M8.1's recovery notice takes priority over M8.4's Welcome Back line, and is shown again for 20 seconds after an offline report opens (M8.1's `60a9edd` behaviour).
- **Settings.** M8.4's `settingsPanelHtml` carries M8.1's save explanation (verification, backup, 24-hour cap, coarser long absences) and the `#save-status` line that M8.1's `renderSaveStatus()` fills. Developer controls stay development-only (M8.4). M8.3's performance diagnostics appear in development builds or with `?perf`.
- **Painting.** M8.4's `build()` and stroke summary run inside M8.3's tool batch. The batch opens on the first painted tile and settles when the last pointer lifts or the window loses focus. `CityScene` keeps M8.4's `onStrokeEnd(tiles)` for construction feedback and gains `onPointersReleased` for M8.3's settle.
- **Welcome Back.** M8.4's layout, plus one line from M8.1's report saying how many days were replayed exactly when a long absence used coarser steps.

The browser checks in section M exercise each of these.

## E. Final architecture

- **Simulation** (`shared/simulation/`, no DOM or Phaser): M8 transport (`transit*.ts`, `mobility.ts`), M8.2's balance settings (`balance-config.ts`) and national economy, M8.3's transit-search speedups and three-day mobility cadence, M8.1's offline planner (`planOffline`, `catchUp`, `catchUpInChunks`) and validators (`validateCityState`, `save-repair.ts`).
- **Persistence** (`client/persistence/`): M8.1's verified envelope storage with current, backup and quarantine keys and the lossless column codec.
- **Client** (`client/`): M8.4's panel hierarchy, bottom sheets, gesture policy, Welcome Back and dev-only panels, carrying M8.1's save notices and M8.3's batched painting and `?perf` overlay.
- **Tools**: M8.2's headless balance harness (`tools/balance/`). The integration gate's own scripts live outside the repository (`/mnt/project-files/integration/`).

## F. Save schema and migrations

**Decision: no schema change. The city stays at version 9.** Nothing authoritative was added by any workstream after `b345c7f`, which already saved M8's transport state as v9.

M8 transport state (`TransitNetwork`, `shared/types/transit.ts`):

| Field | Class |
|---|---|
| `stops` (id, kind, tile, anchor, built day, condition, capacity, served routes) | AUTHORITATIVE |
| `routes` (mode, stops, path, vehicles, fare, status, suspended, legacy, created day) | AUTHORITATIVE |
| `corridors`, `junctions`, `works`, `subsidyRate`, `integration`, `nextId`, `revision`, `history` | AUTHORITATIVE |
| `lastTick` | AUTHORITATIVE (cadence state; M8.3 only moves it on daily progress) |
| Per-stop and per-route results (boardings, transfers, demand, crowding, ridership, headway, wait, minutes, reliability, revenue, subsidy, segment loads) | DERIVED, saved, refreshed on the next evaluation |
| `demand`, `transfers`, `local`, `districts`, `finance`, `stats` | DERIVED, saved; `local`, `stats` and `finance` are default-filled by `repairDerivedState` if missing |
| Transit graph, route period loads | CACHE, module-level, never saved |
| Buses and riders drawn on the map | VISUAL-ONLY, never saved |

Migration evidence (scripts in `/mnt/project-files/integration/saves/`):

- **Real saves** written by the `b345c7f`, M8 `175fd99`, M8.1, M8.2, M8.3 and M8.4 builds, each a transit city with a depot, stops and two routes, load in the integrated build with no repair. Stops, routes, corridors, treasury and tiles are preserved. 90 days of play stay finite and valid, and the city re-saves and reloads identically.
- **Synthetic v3, v6, v7 and v8 saves** (downgraded from a `b345c7f` city through the inverse of each migration) load through the explicit migration chain with the same checks.
- **Committed fixtures.** `tests/integration-saves.test.ts` loads a real M8 `175fd99` v9 save and a real M8.1 envelope save (`tests/fixtures/*.gz`), expects no repair, preserves the transport shape, plays 60 days with riders, and round-trips.
- **Browser.** A corrupted `naija-city-save-current` recovers the older save with a notice and quarantines the unreadable copy; a full storage quota shows the "NOT saved" warning (section M).

The persistence contract is `docs/persistence.md` (M8.1). It already covers the transport fields above; the integration added nothing to it.

## G. Offline behavior

**Mapping.** One city day is 5 real seconds (`TICK_MS = 5000`, `shared/simulation/engine.ts:26`), so one real hour is 720 days, two city years of 360 days. Offline time is capped at 24 real hours (`OFFLINE.maxTicks = 17280`).

| Real time away | City days | City years |
|---|---:|---:|
| 1 hour | 720 | 2 |
| 8 hours | 5,760 | 16 |
| 24 hours | 17,280 | 48 |
| 7 days | 17,280 (capped) | 48 |

**Is it intentional?** The clock and the cap are. `GAME_SPEC.md:41` specifies "a five-second city-day clock" and "bounded offline catch-up", and the spec's Milestone 3 text says "Offline progression executes the same deterministic daily rules as active play, capped at 24 real hours." The README (Saves and limits) and `docs/persistence.md` state the same cap. Nothing discusses what 48 years means for play. M8.1 kept the cap and made replay approximate past a few hundred days, which no longer matches the spec's "same deterministic daily rules" for long absences. Priest accepted that approximation for M8.1. The README sentence that still said "executes the same daily rules" now says long absences use coarser steps.

**What actually happens.** M8.1 replays the first 120–360 days exactly (by city size), the next 120–240 coarsely, and folds the rest into at most 24 evaluated days that carry money forward. Catch-up against continuous play over the same days (`/mnt/project-files/integration/offline/compare.json`):

| City | Away | Catch-up time | Population before → after catch-up | Continuous play | Treasury after catch-up | Continuous |
|---|---|---:|---|---:|---:|---:|
| Developed (6,798) | 1 h | 2.4 s | 6,798 → 12,020 | 21,180 | ₦654M | ₦722M |
| Developed | 8 h | 1.8 s | → 12,100 | 24,620 | ₦3.4B | ₦6.0B |
| Developed | 24 h | 1.6 s | → 12,100 | 24,620 | ₦9.3B | ₦17.2B |
| Large (14,080) | 1 h | 2.3 s | 14,080 → 18,654 | 24,620 | ₦1.0B | ₦1.1B |
| Large | 8 h | 2.0 s | → 18,794 | 24,620 | ₦5.0B | ₦6.4B |
| Large | 24 h | 2.1 s | → 18,794 | 24,620 | ₦13.6B | ₦17.6B |

Catch-up times above were measured while other simulations shared the machine; QA F below has idle-machine times. Continuous play for 24 hours' worth of days takes about 310 s in Node.

QA F on an idle machine (`docs/BUG_RETEST.md`, F): every catch-up takes 1.4–2.2 s (baseline up to 129.5 s). An untouched 500-person town comes back at 452 after any absence (baseline: 0). The baseline emptied every city after 24 hours; the integrated build empties none.

**Consequences.**
- The calendar and treasury jump by up to 48 years, but the city itself only develops for the exact and coarse window (240–600 days). Past roughly 8 months away, more absence adds money, not growth: the developed city ends at 12,100 whether the player is away 8 hours or 24.
- Money keeps accumulating through the aggregate days, so a long absence returns ₦5–13B to a city that continuous play would have spent differently. Debts would grow the same way.
- Nothing dramatic is lost: no abandonment during catch-up in these cities. A city in structural deficit would come back 48 years deeper in debt.
- Short absences are exact. M8.1's tests (`tests/save-reliability.test.ts`) and QA S confirm catch-up matches `advance` inside the exact window.

**Is it suitable for a persistent city game?** Not as it stands, in my judgement. Every overnight absence advances 16 city years, more than the whole growth arc (cities plateau by year 8–12), and the city does not really live through those years. Players cannot tell which happened. This is a product decision rather than an integration defect, the behaviour is what M8.1 was accepted with, and it does not block Milestone 8.

**Smallest change, proposed, not made.** Lower `OFFLINE.maxTicks` in `shared/simulation/engine.ts` from 17,280 to a span the replay covers well, for example 360 days (one city year). One constant, no save change, no new code. Every absence over 30 minutes would then return the same year of exact plus coarse replay, which keeps catch-up under a few seconds. Slowing the offline clock relative to active play is the alternative, but it is a design change to time itself. Either should be Priest's decision before Milestone 9 adds systems (loans, elections) that would otherwise run 48 years unseen.

## H. M8 transport completion

Transport code is M8's `175fd99` plus M8.3's search and cadence changes, which M8.3 showed give the same answers. Each feature was checked for whether it exists and whether it changes play, using `tests/transit.test.ts` (all pass in the integrated build), the measurements in `/mnt/project-files/integration/transport/` (integrated and M8 builds side by side), the 20-year bus city in section J, QA J and probe J, and the browser workflow (`tools/check-transit-browser.cjs`, passing at 390, 430 and 1440 wide).

| Feature | Exists | Produces meaningful gameplay | Evidence |
|---|---|---|---|
| Route creation, validation | Yes | Yes | Disconnected, duplicate and unreachable plans are explained and not charged; browser workflow creates a route by tapping stops |
| Route editing, deletion, suspension | Yes | Yes | Suspension removes riders and fares, informal services stay; demolishing a facility disrupts routes safely |
| Stops, stations, hubs | Yes | Yes | Walking catchments follow connected streets, not a radius over a flood gap; station spacing trades speed for coverage |
| Depot | Yes | Yes | Routes need reachable depot capacity; with none, status is `no-depot` and nobody rides |
| Capacity, frequency, crowding | Yes | Yes | 1 → 12 buses: wait 10.1 → 0.8 min, crowding 1.1 → 0.3, riders 1,932 → 5,262, cost ₦1.8M → ₦21.7M a month |
| Rush hour | Yes | Yes | Peaks fill before the daily total, so crowding shows at peak |
| Service hours | Yes | Partly | A fixed 16-hour day (`TRANSIT.serviceHours`); there is no player control |
| Fares | Yes | **Partly** | Fares move ridership (₦0 → ₦800: 5,072 → 4,145 riders) but riders do not feel the money in cost of living, so a ₦3,000 maximum fare is close to free revenue (section N) |
| Subsidy, route finance | Yes | Yes | Fare support raises riders and the city's operating bill; the 20-year bus city pays ₦17–19M a month in subsidy; an oversized fleet costs ₦54M a month and drives a deficit |
| Transfers, first/last mile, feeders, Danfo | Yes | Yes | Walk → Danfo → BRT → walk journeys; Danfo stays as a feeder and is not erased when formal service competes |
| Route formalization | Legacy buses migrate | Limited | Existing bus services migrate with their IDs; informal routes do not become formal ones |
| BRT and dedicated lanes | Yes | Yes | 30k corridor: commute 12.4 → 9.9 min, car and okada trips 36,296 → 6,650, people moved per hour 1,275 → 3,336, while general lanes drop 1,275 → 551 |
| Congestion, bus road load | Yes | Yes | Probe J: 6 buses raise congestion 77.0 → 81.8 and commute 26.2 → 30.8 min |
| Transit and job accessibility | Yes | Yes | Useful route 3,249 riders, useless 0; job access falls when transit commutes are slow (QA J) |
| TOD, commercial effects | Yes | Yes, bounded | Commercial development moves toward useful stations without bypassing construction |
| Flood disruption | Yes | Yes | Buses reroute after flooding and recover from disconnection |
| Safety, lighting | Yes | Yes, modest | Poor night safety cuts evening ridership modestly and recovers |
| Representative vehicles | Yes | Visual | Bounded pools show real services only |
| Inspectors, overlays, district comparison | Yes | Yes | Route and stop inspectors (browser check), four accessibility bands, district access and mode share, located challenges |
| Offline progression | Yes | Yes | Online and offline transit, flooding and finance advance identically inside the exact window; the offline report lists disruption and the busiest hub |
| Save/load | Yes | Yes | Section F |

**Summary.** The transport loop is complete and changes play: routes need depots and demand, capacity and frequency trade against cost, BRT gives real commute and throughput gains, bad routes cost money and commute time without the old irreversible spiral (probe J). Two parts are thin: fares do not reach household costs (deferred modelling item, with the exploit noted in section N), and service hours are fixed. Rail, metro, airports and ferries are out of scope.

**Long-run use.** The M8.2 bot's transit strategy never affords a ₦60M depot while it is growing, so its "transit" and "transit-dense" archetypes ran on Danfo and Keke only. To test formal transit over decades, the QA healthy city was given 3 bus routes (12 buses) and played 20 years against an identical no-bus control and an oversized 28-bus fleet (`/mnt/project-files/integration/balance/trlong-*.json`):

| 20-year average | No buses | 12 buses | 28 buses |
|---|---:|---:|---:|
| Daily riders | 0 | 1,354 | 1,458 |
| Bus share of trips | 0% | 4.9% | 7.3% |
| Commute (min) | 11.4 | 12.6 | 13.4 |
| Congestion | 70.3 | 72.4 | 62.9 |
| Satisfaction | 50.0 | 48.8 | 39.5 |
| Transit cost (₦M a month) | 0 | 24.1 | 53.8 |
| Population at year 20 | 24,620 | 24,580 | 3,414 |
| Treasury at year 20 | ₦7.8B | ₦3.0B | −₦8.4B |

The 12-bus network is affordable and survives, but in this layout it adds a little commute time rather than saving it, because the routes run on the same congested grid. The 28-bus fleet costs more than the city's tax income for 20 years. The city repeatedly empties and refills (24,400 → 10,932 → 23,538 → 3,414) as fiscal stress cuts utility funding. It is a consequence of bad planning, not the old migration spiral, but the city has no way out of the deficit (section N).

## I. QA baseline comparison

Full detail is in `docs/BUG_RETEST.md`. Against the frozen `b345c7f` baseline:

| Scenario | Baseline | Integrated | Status |
|---|---|---|---|
| A flood | 2 of 3 seeds collapse (4,040 → 4) | 3 of 3 survive at their peak, 0 abandoned | FIXED |
| B recovery | nothing regrows | 50 → 10,745; 10 → 835; 5 → 830 | FIXED |
| C weather | identical games, 305-tile day-9 flood | still identical; worst early flood 71 tiles | IMPROVED |
| D policy/debt | one policy 3.6× revenue; −₦4.75B a year | 0.13× revenue; debt recovers; no population effect | IMPROVED |
| E police | +5.5 safety, −4.1% incidents | +5.2 safety, response 60 → 31 min, −6.0% incidents | FIXED (marginal) |
| F offline | up to 129.5 s; every city empty after 24 h | 1.4–2.2 s; no city empties; long absences add money, not growth | FIXED (time); design question |
| G services | pass on a collapsing control | 1 of 4 services moves outcomes on a stable control | REGRESSED against the criterion only |
| H informal | 3 / 0 / 0 | 11 / 1 / 0 (extreme / moderate / control) | IMPROVED |
| I affordability | 93 / 83 / 96 / 100 | 92 / 89 / 85 / 99 | UNCHANGED |
| J commute | far town shrinks; bus +4.9 min | no collapse; far +12.3 min; bus +4.5 min | IMPROVED; bus part DEFERRED |
| K density | 0 at L4–L5 | 0 at L4–L5; attainable with real utilities | UNCHANGED |
| S saves | PASS | PASS | UNCHANGED |

All 8 probe J expectations hold, the seventh with the deferred fare-savings caveat.

## J. Long-duration balance

**Setup.** M8.2's headless bot (`tools/balance/`) plays through public actions only. It ran unchanged with its ten strategies plus three added for this gate (`/mnt/project-files/integration/balance/extend.ts`): flood-prone (balanced with no drainage), services-heavy (twice the services at 125% funding) and transit-dense (dense with bus, BRT, 25% fare support and density, infill, transit and pedestrian policies). Every strategy ran 50 years on seed 731 and 20 years on seeds 1009 and 4242: 36 runs, all on the integrated build. Per-month rows with every metric the gate lists are in `/mnt/project-files/integration/balance/runs/`.

One limitation matters: the bot's transit strategies never afford a ₦60M depot while they grow, so "transit" and "transit-dense" ran on Danfo and Keke only, as they did for M8.2. Formal transit over 20 years is covered by the bus-city test in section H.

### 50 years, seed 731

| Strategy | Pop yr 10 | Pop yr 20 | Pop yr 30 | Pop yr 50 | Peak | Treasury yr 50 ₦M | Lowest ₦M | Sat | QoL | Power % | Water % | Commute | Unemp % | Vacancy % | Res lvl | Informal |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| balanced | 46,891 | 46,900 | 46,900 | 46,900 | 46,900 | 983 | -497 | 47.4 | 28.5 | 53.2 | 53.9 | 10.4 | 2.6 | 0 | 2.63 | 0 |
| car | 40,314 | 40,460 | 40,400 | 36,886 | 40,630 | -2,593 | -2,593 | 32.6 | 23.9 | 35.4 | 22.3 | 8.7 | 15.2 | 1.6 | 3.27 | 0 |
| commercial | 38,172 | 38,600 | 38,600 | 38,600 | 38,600 | 890 | -324 | 56.4 | 33 | 54.3 | 55.8 | 9.5 | 0.6 | 0 | 2.66 | 1 |
| dense | 20,900 | 20,900 | 20,900 | 20,900 | 20,900 | 563 | -252 | 50 | 35.5 | 73.2 | 56.9 | 9.1 | 0.6 | 0 | 3.02 | 1 |
| flood-prone | 34,696 | 34,860 | 34,860 | 34,860 | 34,860 | -50 | -434 | 51 | 31.4 | 70.1 | 62.3 | 9.9 | 3.1 | 0 | 1.91 | 5 |
| high-service | 49,040 | 49,010 | 48,932 | 48,886 | 49,040 | -1,571 | -1,701 | 37 | 26.5 | 32.1 | 20.6 | 10.1 | 4.7 | 0.6 | 2.72 | 0 |
| industrial | 30,560 | 30,560 | 30,640 | 30,717 | 30,766 | 750 | -246 | 43.4 | 28.2 | 36.1 | 44 | 9.6 | 2.4 | 0 | 2.14 | 3 |
| low-tax | 15,914 | 15,940 | 15,940 | 15,940 | 15,940 | -3,432 | -3,432 | 45.3 | 17.4 | 15.2 | 11.4 | 12.3 | 7 | 0 | 2.74 | 7 |
| services-heavy | 52,260 | 52,260 | 52,340 | 52,340 | 52,340 | 1,320 | -572 | 48.2 | 28.7 | 56.6 | 52.7 | 10.6 | 3.2 | 0 | 2.84 | 0 |
| sprawl | 27,470 | 27,280 | 20,984 | 0 | 27,480 | -17,104 | -17,104 | 20.8 | 45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| transit | 45,562 | 45,546 | 45,527 | 45,371 | 46,017 | -4,655 | -4,655 | 32.4 | 21.8 | 24 | 17.8 | 11.7 | 10.6 | 0.1 | 2.59 | 0 |
| transit-dense | 21,280 | 21,280 | 21,280 | 21,280 | 21,280 | 274 | -206 | 51.4 | 34.1 | 79 | 59.7 | 9.8 | 1 | 0 | 3.09 | 1 |

Values are at year 50 unless the column says otherwise. "Lowest" is the lowest treasury in the run. Low-tax and flood-prone also end in deficit (low-tax by design: its tax rates do not cover its services).

### 20 years, seeds 1009 and 4242

| Strategy | Seed | Pop yr 20 | M8.2 pop yr 20 | Treasury ₦M | M8.2 treasury ₦M | Lowest treasury ₦M | Sat | QoL | Power % | Water % | Commute | Unemp % | Afford | Abandoned | Informal | Res lvl |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| balanced | 1009 | 46,900 | 46,928 | 1,803 | 1,922 | 6 | 68.9 | 37.5 | 50 | 54 | 8.1 | 2.9 | 91.1 | 0 | 0 | 2.66 |
| balanced | 4242 | 43,040 | 43,267 | -77 | 374.9 | -77 | 66 | 29.9 | 46 | 46 | 8.1 | 2.8 | 93.2 | 3 | 0 | 2.39 |
| car | 1009 | 44,322 | 41,765 | 274 | -241.7 | 3 | 66.9 | 51 | 66 | 60 | 7.5 | 4.1 | 85 | 6 | 0 | 3.63 |
| car | 4242 | 34,398 | 32,854 | 472 | 377.7 | -224 | 61.6 | 38.5 | 76 | 80 | 7.5 | 16 | 82.9 | 9 | 0 | 3.15 |
| commercial | 1009 | 47,549 | 48,923 | 844 | 426.9 | 0 | 71.6 | 47 | 65 | 60 | 8.5 | 2.4 | 85.3 | 4 | 0 | 3.13 |
| commercial | 4242 | 37,374 | 40,760 | 223 | 658 | -1 | 72.7 | 51.2 | 62 | 56 | 8.3 | 0.6 | 83.2 | 7 | 2 | 2.55 |
| dense | 1009 | 20,720 | 18,340 | 10 | -157 | 7 | 70 | 34.3 | 78 | 62 | 8.1 | 1.2 | 89.2 | 0 | 2 | 2.89 |
| dense | 4242 | 21,180 | 21,000 | 336 | 178.9 | 5 | 70.8 | 34.9 | 78 | 57 | 8.1 | 0.7 | 89.7 | 0 | 0 | 3.08 |
| flood-prone | 1009 | 35,363 | — | 161 | — | -163 | 75.8 | 33.9 | 83 | 78 | 8.2 | 1.6 | 95.6 | 0 | 10 | 1.87 |
| flood-prone | 4242 | 35,280 | — | 29 | — | -90 | 72.4 | 39.7 | 67 | 47 | 7.8 | 3.4 | 93.1 | 0 | 5 | 1.96 |
| high-service | 1009 | 47,110 | 46,420 | 2,234 | 2,157 | 5 | 62.6 | 47 | 50 | 51 | 8.3 | 5 | 86.1 | 3 | 0 | 2.65 |
| high-service | 4242 | 48,040 | 48,911 | 2,092 | 3,087 | 5 | 63 | 45.7 | 45 | 50 | 8.2 | 5.1 | 85 | 1 | 0 | 2.66 |
| industrial | 1009 | 31,785 | 29,095 | -48 | 557.3 | -159 | 59.6 | 32.7 | 33 | 43 | 8.1 | 3 | 95.5 | 14 | 4 | 2.18 |
| industrial | 4242 | 30,850 | 32,160 | 159 | 141.7 | -138 | 63.5 | 27.8 | 43 | 37 | 7.7 | 0.8 | 96.1 | 11 | 1 | 2.17 |
| low-tax | 1009 | 12,780 | 12,420 | -904 | -848.9 | -904 | 58.2 | 19.3 | 11 | 39 | 10 | 5.3 | 97.7 | 0 | 9 | 2.38 |
| low-tax | 4242 | 15,800 | 15,760 | -909 | -779.8 | -909 | 57 | 17 | 15 | 11 | 10 | 3.2 | 98.8 | 0 | 14 | 2.51 |
| services-heavy | 1009 | 50,780 | — | 2,077 | — | 5 | 70.9 | 42.9 | 48 | 50 | 8.4 | 3.3 | 87.5 | 2 | 0 | 2.77 |
| services-heavy | 4242 | 40,380 | — | 1,328 | — | 2 | 72.1 | 44.6 | 50 | 43 | 8.1 | 1 | 84.7 | 2 | 0 | 2.29 |
| sprawl | 1009 | 21,834 | 24,231 | -605 | -508.7 | -605 | 37.8 | 23 | 42 | 42 | 16.7 | 16.6 | 95.7 | 13 | 0 | 2.5 |
| sprawl | 4242 | 25,547 | 28,245 | 215 | 358.7 | -153 | 50.3 | 33.8 | 51 | 58 | 17 | 15.2 | 86.4 | 8 | 3 | 2.4 |
| transit | 1009 | 45,859 | 46,880 | -284 | -33.1 | -374 | 59.8 | 31 | 45 | 55 | 8.2 | 3.3 | 93.7 | 1 | 0 | 2.61 |
| transit | 4242 | 44,139 | 44,306 | 470 | -235 | 5 | 71.8 | 47.4 | 54 | 42 | 8.2 | 3.1 | 84.9 | 0 | 0 | 2.46 |
| transit-dense | 1009 | 20,920 | — | -166 | — | -166 | 66.6 | 33.1 | 76 | 60 | 7.9 | 0.2 | 90 | 0 | 1 | 3.02 |
| transit-dense | 4242 | 21,320 | — | 133 | — | 5 | 69.8 | 34.9 | 80 | 55 | 8.2 | 2.6 | 89.2 | 0 | 0 | 3.09 |

All 24 twenty-year runs survive. Population at year 20 is within 10% of M8.2's run for every strategy and seed except dense on 1009 (+13%).

### Findings

- **Year 8–12 plateau: confirmed, and it is density, not land.** By year 10 every one of the eleven surviving 50-year cities is within 2% of its peak, and most never grow again. At year 50 housing vacancy is 0–1.6% while residential demand is still 34–66, so people want to come. The bot's footprint is fully built (its radius stops at 16 tiles; 7 for dense) and buildings stop upgrading: QoL is 17–36 against the 45 that level 4 needs, and public power and water are 11–79% against 75 / 78. K+ (`docs/BUG_RETEST.md`, K) shows levels 4–5 appear when utilities and services are oversupplied, so the plateau is the same utilities-and-QoL gate.
- **Map saturation.** Partly. The 32×32 map is mostly built in the wide strategies (roads 375–424 tiles), and the compact ones (dense, low-tax, transit-dense) stop at 148–155 road tiles because their footprint is fixed. Neither can grow without density.
- **Jobs/housing deadlock: not back.** Unemployment at year 50 is 0–5% in most strategies. The exceptions are car (15%) and transit (11%), both in late fiscal decline.
- **Sprawl collapse: still there, around year 30.** Sprawl on seed 731 runs a deficit from year 22. Its waste backlog grows from year 2 (147,000 by the end), water reliability falls from 50% to 23% between years 24 and 29, satisfaction from 47 to 25, and the city empties between years 29 and 33 (M8.2 alone: 31–34). It never recovers: population 0 from year 38, treasury −₦17.1B. Sprawl on seeds 1009 and 4242 survives 20 years, but 1009 is already at −₦605M, satisfaction 38 and 16.6% unemployment.
- **Recovery.** A small or emptied city with a solvent treasury and working drainage regrows (QA B: from 50, 10 and 5 residents). A city in structural deficit cannot: nothing makes the deficit shrink, so the decline continues. This is M8.2's open item, unchanged.
- **Late-decade finances.** Car, high-service and transit end 50 years in deficit (−₦1.6B to −₦4.7B) with utilities decayed to 20–35%. M8.2 alone ended those three positive. The cause was traced by rerunning transit for 50 years on each merge step (`/mnt/project-files/integration/balance/bisect/`): M8.2 alone and M8 + M8.2 give identical results (48,295 residents, ₦41M), and the change appears exactly at the M8.3 merge, after which M8.1 and M8.4 change nothing (bit-identical). M8.3's every-third-day traffic evaluation is accepted behaviour; over decades it nudges cities whose treasuries hover near zero onto a different path. Against M8.2, year-50 treasuries are worse in 3 strategies (car, high-service, transit), better in 2 (commercial, low-tax) and similar in 3, and sprawl collapses in both. So the cadence is not systematically harmful, but it exposes the same fragility: no restructuring path, and utilities that decay unless the player reinvests.
- **Low-tax on seed 731** ends at 15,940, against 43,132 for M8.2. M8.2 already recorded that low-tax is seed-sensitive (1009 and 4242 stay at 12,000–16,000); here seed 731 lands with the other two.
- **Utilities block progression.** Yes, in every strategy (above). It is the main reason cities stop changing.
- **Does transport change M8.2's conclusions?** Not materially. At 20 years every run is within about 10% of M8.2 and every city survives. At 50 years the differences come from M8.3's cadence, not M8's transport. A working 12-bus network costs ₦24M a month and leaves the city as healthy as the no-bus control; an oversized one drives a permanent deficit (section H).
- **Strategies still produce different cities.** At year 50: 15,940 (low-tax) to 52,340 (services-heavy) residents; commutes 8.7–12.3 min (sprawl 17 at year 20); residential level 1.91 (flood-prone) to 3.27 (car); informal buildings 0–7 (up to 14 at year 20); treasuries from −₦4.7B to +₦1.3B. Nothing was tuned during integration.

## K. Performance

Both builds were measured on the same machine in alternating runs, so the comparison is between M8.3's accepted head `9a70d3e` and the integrated build, not against the numbers in M8.3's report (which came from a different, less loaded container). The scripts, snapshots recipe and raw output are in `/mnt/project-files/integration/perf/` (`perf2.log`, `drag.log`). Snapshots were built once with the M8.3 bundle and loaded by both builds; each run is 30 simulated days with M8.3's own perf channels.

### Simulation, traffic and transit search (milliseconds)

| City | Active routes | Sim-day mean (M8.3 → integrated) | Sim-day p95 | Sim-day max | Traffic evaluation mean | Transit search mean |
|---|---:|---|---|---|---|---|
| 13k | 0 | 40.1 → 42.5 | 99 → 97 | 128 → 99 | 25 → 28 | 0 → 0 |
| 13k | 4 | 50.1 → 44.5 | 111 → 96 | 128 → 113 | 58 → 52 | 22 → 18 |
| 155k | 0 | 40.3 → 38.7 | 84 → 100 | 107 → 120 | 40 → 43 | 0 → 0 |
| 155k | 1 | 58.2 → 54.4 | 141 → 125 | 156 → 142 | 84 → 75 | 28 → 25 |
| 155k | 4 | 69.8 → 76.3 | 202 → 173 | 208 → 249 | 117 → 123 | 50 → 56 |
| 155k | 8 | 79.5 → 84.2 | 207 → 217 | 249 → 253 | 149 → 154 | 84 → 83 |
| 155k | 25 | 309.6 → 319.1 | 997 → 987 | 1,085 → 1,152 | 828 → 848 | 727 → 740 |
| 155k | 50 | 819.9 → 851.6 | 2,466 → 2,703 | 2,579 → 2,893 | 2,352 → 2,449 | 2,233 → 2,324 |

Traffic ran on 10–11 of 30 days in both builds, so M8.3's three-day cadence survives integration. Every difference is within about 10% and goes both ways, which is run-to-run noise on this machine. Ridership differs between the builds on the same snapshot because the integrated build has M8's newer slower-journey sensitivity and time floor (`175fd99`), so the two builds are not doing identical transit work; the costs are still the same.

Against M8.3's own report: its absolute numbers (no buses 40 ms, 8 routes 61 ms, 25 routes 189 ms, 50 routes 618 ms per day) were taken on a quieter machine. Here M8.3's own build gives 40, 80, 310 and 820 ms, and the integrated build matches it. The 25- and 50-route cases are dominated by the transit search on traffic days (about 0.7 s and 2.3 s each, one day in three), which M8.3 already listed as a deferred spike.

### Drag painting (road tool, one stroke)

| Tiles | 13k city, 4 routes (M8.3 → integrated) | 155k city, 8 routes |
|---:|---|---|
| 1 | 126 → 145 ms | 262 → 313 ms |
| 10 | 143 → 131 ms | 263 → 257 ms |
| 25 | 129 → 166 ms | 267 → 273 ms |

Each painted tile costs under 1 ms in both builds; the rest is the single settle when the stroke ends. A 25-tile drag stays one settle of 0.1–0.3 s, against 6.5 s before M8.3. The browser check (section M) confirms the batch is settled after every stroke, mouse or touch.

### Frame times

Headless Chromium here renders WebGL in software (SwiftShader), so frame times say nothing about phones or desktop GPUs. For the record, the `?perf` overlay on a new city over 30 s gave: 390×844, mean 31 ms, p95 33, p99 50, max 117, 17 stutters over 50 ms in 600 frames; 1440×900, mean 124 ms, p95 150, p99 200, max 550, every frame over 50 ms. Real frame rates need the device checklist (section L).

No Web Worker was added. Nothing was optimized during the gate.

## L. Mobile and responsive validation

**No physical phones or tablets were available to this session.** No real-device results are reported, and none should be inferred from the checks below. The device checklist from M8.3 (`/mnt/project-files/perf/REAL_DEVICE_TEST_CHECKLIST.md`) still needs a person with a mid-range Android phone, a recent Android phone or iPhone, and a desktop browser.

What was checked in headless Chromium with touch emulation (section M): 390×844 and 430×932 at 3× pixel density, and 820×1180 at 2×, with touch input; 1440×900 with a mouse. Map taps, touch drags through the Chrome DevTools protocol, Draw mode, panels, bottom sheets, overlays, transit route creation, catch-up and autosave failure were exercised. GPU frame rate, thermal behaviour, real rain and traffic rendering cost and sustained play on hardware were not.

## M. UX regression validation

Script: `/mnt/project-files/integration/ux/ux.cjs` (Playwright, headless Chromium), against the integrated development server and a production build (`vite build` + `vite preview`). Screenshots and results are in the same folder. 390×844 and 430×932 ran as phones (touch, 3× density), 820×1180 as a touch tablet (2×), 1440×900 with a mouse.

| Check | 390×844 | 430×932 | 820×1180 | 1440×900 |
|---|---|---|---|---|
| Economy opens on treasury, monthly balance and revenue | Pass | Pass | Pass | Pass |
| Data opens on population, jobs, housing and satisfaction | Pass | Pass | Pass | Pass |
| Inspector opens on the tapped building, scrolled to the top | Pass | Pass | Pass | Pass |
| Govern is a toolbar button and opens Govern | Pass | Pass | Pass | Pass |
| Switching panels resets scroll; a same-panel refresh keeps it | Pass | Pass | Pass | Pass |
| Bottom sheet: peek → full → peek | Pass | Pass | — | — |
| Choosing a map layer shrinks the sheet; the legend stays visible above the panel | Pass | Pass | Pass | Pass |
| No horizontal overflow | Pass | Pass | Pass | Pass |
| Touch drag with a road tool and no Draw spends ₦0 and builds nothing | Pass | Pass | Pass | — |
| First tap previews ("Tap again to build"), second tap builds one tile | Pass | Pass | Pass | — |
| Draw mode drag paints 5–6 tiles with one summary ("Built 5 tiles · ₦1.3M") | Pass | Pass | Pass | — |
| Mouse drag builds directly (6 tiles, ₦1.5M); no Draw button for a mouse | — | — | — | Pass |
| M8.3 tool batch is settled after every stroke | Pass | Pass | Pass | Pass |
| Settings shows the save explanation and "Last saved" status | Pass | Pass | Pass | Pass |
| Full storage: "Your city was NOT saved…" notice, the same text in Settings, notice fits on screen | Pass | — | — | Pass |
| Corrupted current save: recovery notice, older save restored, unreadable copy quarantined | Pass | — | Pass | Pass |
| Catch-up card appears and fits; Welcome Back opens afterwards, readable (span, coarse-step line, font ≥ 12 px) | Pass | — | Pass | Pass |
| Production build: no developer controls, no QA hooks on `window` | Pass | — | — | Pass |
| Production `?perf`: frame-time overlay shown, Performance diagnostics in Settings | Pass | — | — | Pass |

The first run had 85 of 90 checks passing. The 5 failures were faults in the check script (an observer attached before the page existed, and a toggle the script switched off), not in the game; after fixing the script, those 22 checks were rerun and pass. No console errors or page errors occurred.

`tools/check-transit-browser.cjs` (M8) also passes on the integrated build at 390, 430 and 1440 wide.

**Older browser scripts.** `tools/check-governance-browser.cjs`, `check-living-browser.cjs`, `check-public-service-controls.cjs`, `check-public-services-browser.cjs` and `check-safety-browser.cjs` hard-code a Windows Playwright path and read the old `naija-city-v6` save key. With the paths patched, all five also fail on the M8 head `175fd99` (districts not persisting, clinic not found in `naija-city-v6`, feed button missing), so they were already stale before integration. On the integrated build two of them stop earlier, at selectors M8.4 moved on purpose (Governance tabs now open from Govern, not Economy). They are listed under deferred issues; they were not rewritten during the gate.

Seen in screenshots, not fixed (M8.4 polish scope): on a 390-wide phone the notice banner overlaps the camera buttons' right edge.

## N. Known remaining issues

Found or confirmed during the gate and not fixed, because each is either a design decision, outside the gate's scope, or already deferred by its owner:

1. **Fares are almost free money.** Riders do not feel fares in cost of living (the deferred M8 modelling item). On the QA healthy city with 3 routes, raising every fare from the default to the ₦3,000 maximum roughly doubles city income (₦45M → ₦94M a month) and ends 3 years with ₦2.44B instead of ₦0.6B, with no change in population, satisfaction or cost of living; riders fall 1,212 → 589. The same happens on M8 `175fd99`, so it is not an integration regression. `/mnt/project-files/integration/balance/trfare.ts`, `trlong-bus-fare*.json`.
2. **Offline time scale.** Every hour away is 2 city years and the cap is 48 years, but the city only develops for the first 240–600 replayed days; the rest adds money (section G). Proposed change, not made: lower `OFFLINE.maxTicks`.
3. **No way out of a structural deficit.** Sprawl still empties around year 30 on seed 731 and never recovers (treasury −₦17.1B at year 50). An oversized 28-bus fleet keeps a city in deficit for 20 years and the population swings between 24,000 and 3,400. Car, high-service and transit end 50 years in deficit. Nothing lets a player restructure debt or shrink costs automatically (section J).
4. **Growth stops at year 8–12** because buildings cannot pass the level 4 utilities and QoL check, not because of land or demand (section J, QA K).
5. **QA G**: only one of four services moves long-term outcomes on a stable city. **QA I**: affordability still spans less than 15 points. **QA C**: every new city still gets the same weather. **QA K**: no level 4–5 buildings under the QA conditions.
6. **0% infrastructure maintenance** now costs a city only about 5% of its population over 2 years (QA M-9). It may be too mild.
7. **M8.3's three-day traffic cadence changes 50-year outcomes** compared with M8.2 alone (better in some strategies, worse in others). It is accepted behaviour with identical short-run results, but M8.2's 50-year tables no longer reproduce exactly on the integrated build.
8. **Transit search spikes** of about 0.7 s (25 routes) and 2.3 s (50 routes) on the days traffic is evaluated in a 155k city. Already deferred by M8.3.
9. **Transport gaps**: service hours are fixed at 16; informal routes never formalize; the balance bot never builds a depot, so archetype runs do not exercise formal buses.
10. **Brief versus code**: the brief says M8's time floor went from 1/10 to 1/15; the code at `175fd99` uses 1/50 (`transit-config.ts:25`). The integration keeps the code.
11. **Small UI issue**: on a 390-wide phone the notice banner overlaps the right edge of the camera buttons.
12. **Older browser scripts are stale** (section M).

## O. Deferred issues

Nothing deferred by a workstream was solved during the gate. Status after integration:

| From | Item | After integration |
|---|---|---|
| M8 | Transport cost of living counts commute minutes, not fare savings | Still deferred. Now also an exploit (N1). Recommended before Milestone 9 |
| M8.1 | Long offline progression is approximate | Measured (section G). Needs a decision (N2) |
| M8.1 | localStorage stays synchronous; no export, import or cloud backup; a hard crash can lose about the newest minute | Unchanged |
| M8.1 | Review transport persistence against the final M8 schema | Done in section F: no change needed, v9 holds |
| M8.1 | M8.3 route caching may speed catch-up | Catch-up takes 1.4–2.2 s on the integrated build (QA F) |
| M8.2 | Year 8–12 plateau; year-32 sprawl collapse; crime, rent and waste | Plateau and sprawl collapse confirmed (N3, N4). Crime, rent and waste unchanged; sprawl's waste backlog reaches 147,000 |
| M8.3 | Traffic recalculation spikes at 25–50 routes | Unchanged (N8) |
| M8.3 | Real-device phone performance | Not done; no devices (section L) |
| M8.3 | Interaction with M8.1 catch-up and final M8 transit; combined performance | Done: identical costs (section K), catch-up works under the cadence |
| M8.3 | Web Worker | Not approved, not added |
| M8.4 | Onboarding and first view, Undo, a unified Map Layers entry, zoning-valid areas, long Services/Transport/Governance content, district drawing, native confirm dialogs, minor polish | Unchanged |
| M8.4 | Long-offline behaviour and offline city collapse | No city empties after any absence now (QA F); the time scale is N2 |
| QA supplementary | Utilities block density | Confirmed (N4) |
| Gate | Older `tools/check-*-browser.cjs` scripts | Stale since before integration; need rewriting for M8.4's panels and M8.1's save keys |
| Gate | Real-device checklist | `/mnt/project-files/perf/REAL_DEVICE_TEST_CHECKLIST.md` |

## P. Tests and build status

Run on the final branch state (2026-10-07), with `--maxWorkers=1` as the repository's `npm test` script sets:

| Check | Result |
|---|---|
| `npm test` | 388 tests in 23 files pass (391 s). M8 alone had 296 |
| `npm run lint` (`tsc --noEmit`) | Pass |
| `npm run build` | Pass. Vite warns that one chunk is over 500 kB, as it did before integration (QA X-4) |
| `git diff --check` | Clean |
| Frozen QA baseline (`bash /mnt/project-files/qa/frozen/verify.sh`) | "Frozen baseline intact." |

Tests come from each workstream's own head unchanged, except:

- **Modified:** `tests/save-reliability.test.ts`, "large cities replay far fewer full days, keep money flowing and stay valid" (M8.1). It builds a 500k transit city and took 5.7 s against vitest's default 5 s limit once M8.2's and M8.3's work shared the machine. It now has the same explicit 60 s timeout as the tests next to it (`82f1e67`). No assertion changed.
- **Added:** `tests/integration-saves.test.ts` (`26a9c89`), which loads a real v9 save written by the M8 `175fd99` build and a real envelope save written by the M8.1 `2c4de92` build, checks transit state survives, and checks continued play matches between a loaded and an unsaved copy. Fixtures are in `tests/fixtures/`.

## Q. Main-branch merge recommendation

**Recommendation: safe to merge into `main` after Priest's review.**

- The branch is one coherent version. Each workstream's accepted behaviour is present and checked together: M8's transport (transit tests, probe J), M8.1's saves and catch-up (save tests, QA S and F, browser notices), M8.2's balance (archetypes within 10% at 20 years, QA A and B fixed), M8.3's performance (same costs as its accepted head) and M8.4's UX (90 browser checks at four sizes).
- No conflict was settled by dropping one side, and no accepted behaviour was reverted (section D).
- Saves from M8 and M8.1 builds load without change (section F).
- Tests, type check and build pass (section P).

How to merge: merge this PR into `main` with a merge commit, so each workstream's commits stay in history. It contains everything in PR #1 (M8), PR #2 (M8.1), PR #3 (M8.3) and PR #4 (M8.2) and the M8.4 branch, so those can then be closed as included rather than merged one by one. After merging, Priest's local folder needs `git fetch origin && git reset origin/main` (and the stale `.git\index.lock` removed, as noted for PR #1).

The open issues in section N do not block the merge: none is a regression introduced by integration, and each is either already deferred or a design decision.

## R. Milestone 9 readiness

**Not ready.** Milestone 9 should not start until these are settled, in this order:

1. **Decide the offline time scale** (section G). Milestone 9's loans and elections would otherwise run up to 48 city years unseen on every overnight absence. Smallest change: lower `OFFLINE.maxTicks`.
2. **Make fares count in household costs** (N1). Loans and budgets built on top of a free-revenue fare lever would be unbalanced from the start.
3. **Run the real-device checklist** on at least one mid-range Android phone (section L).

Recommended but not blocking: a way out of structural deficits (N3), since loans will make debt more common.

## Decision

The integrated branch is safe to merge into `main` after Priest's review (section Q).

MILESTONE 8 GATE: PASS

MILESTONE 9: NOT READY
