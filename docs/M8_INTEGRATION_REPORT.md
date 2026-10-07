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
