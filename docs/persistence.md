# Persistence and offline catch-up

Milestone 8.1 makes saves verified, bounded and compact, and keeps long absences from blocking the game. The city schema is still version 9; only the storage format changed.

## Versioning rule

**ANY CHANGE TO AUTHORITATIVE PERSISTED SCHEMA MUST REVIEW WHETHER A SAVE VERSION BUMP/MIGRATION IS REQUIRED.**

- Adding a field to a **derived** record listed in `shared/simulation/save-repair.ts` needs no version bump. Older saves get the default from a fresh city or the record's factory.
- Adding, renaming or reinterpreting **authoritative** state (anything a player built, chose or accumulated) needs a version bump, an explicit step in `decodeCityWithReport`, and a test that loads a save from before the change.
- Validators reject what they cannot trust. Never loosen a validator to accept a field that a migration should have filled.

## Storage layout

| Key | Contents |
|---|---|
| `naija-city-save-current` | Newest verified save |
| `naija-city-save-backup` | Last known-good save: the previous verified current, refreshed at most once a minute |
| `naija-city-save-quarantine` | One unreadable save kept for diagnosis; replaced on the next failure and freed first under storage pressure |
| `naija-city-v1` … `naija-city-v9` | Legacy plain-JSON saves. They are read for migration and removed once current and backup both hold verified saves. They are never removed after a load where no copy was readable. |

Each save is a text envelope with three lines: a magic line, a JSON header (`format`, `encoding`, `cityVersion`, `savedAt`, `length`, `checksum`), and the encoded city. The checksum is 32-bit FNV-1a, which detects truncation and damage before parsing.

## Writing a save (`client/persistence/storage.ts`)

1. **Validate** the in-memory city with the same rules a load applies (`validateCityState`). Encoding rejects `NaN` and `Infinity` and reports their path.
2. On the first write of a session and on manual saves, also **decode and validate the encoded text**.
3. **Preserve** the previous verified current as the backup, at most once a minute.
4. **Write** current. `setItem` replaces a value atomically, so a failed write leaves the previous copy intact.
5. **Read back** and compare. A mismatch restores the previous copy.
6. When current and backup are both verified, **remove the legacy keys**.

On `QuotaExceededError` the repository frees only space that is safe to free (the quarantine copy, and legacy copies older than the one the city came from), then retries once. `save()` never throws. It returns a `SaveResult` with `ok`, a `reason` (`storage-full`, `storage-unavailable`, `invalid-state` or `verify-failed`), detail text and timings. Failures are also logged to the console with the size of every key.

In the game, a failed save shows a warning that the city was **not** saved and that the last good save is kept. The warning repeats at most once a minute while autosave keeps retrying. Settings shows the last successful save time or the failure. "Saving works again" appears when a later save succeeds.

## Loading and recovery

Load tries current, then backup, then legacy keys from newest to oldest, and takes the first copy that decodes and validates. If an earlier copy failed, the result is marked `recovered`, the unreadable current is quarantined, and the game tells the player which save was restored. If copies exist but none is readable, `SaveLoadError` lists every problem. The game then starts a fresh city with autosave off, and legacy copies are protected from automatic cleanup.

## Encoding (`client/persistence/save-codec.ts`)

The codec is lossless and knows nothing about the schema. Arrays of same-shaped records (tiles and per-tile metrics) are stored column by column, so key names are written once. Columns use run-lengths where values repeat, or bit-exact little-endian float64 in base64 where that is shorter than decimal text. Arrays of records that are sometimes `null` carry a presence mask. Decoding produces exactly what `JSON.parse(JSON.stringify(city))` would. New fields, including Milestone 8 transport state, are packed automatically. A key starting with `$` falls back to plain-JSON encoding instead of failing.

Measured sizes (characters):

| City | Plain JSON (before) | Encoded (after) | Reduction |
|---|---|---|---|
| Starter city | 2,537,166 | 185,845 | 92.7% |
| Transit network, 10k | 3,124,005 | 490,727 | 84.3% |
| Transit network, 500k | 3,742,261 | 802,530 | 78.6% |

With the backup, a 500k city stores about 1.6 million characters in total, under a third of the 5,242,880-character localStorage quota measured in Chromium.

## Classification of persisted state

| Class | Examples | Persisted? |
|---|---|---|
| AUTHORITATIVE | Map, roads, zones, buildings and businesses; infrastructure assets and condition; weather and floodwater; treasury, counters, history, milestones; routes, stops, BRT corridors, junctions, works; facilities, funding, fires, waste backlog; taxes, policies, districts, challenges; incidents; markets, households, feed. Also smoothed values that carry memory between days: safety crime pressure, public and night safety, shock and recent incidents; governance rent; road condition, flood depth and flood events. | Yes. Never defaulted. A save missing them is rejected. |
| DERIVED | Per-tile coverage, reliability, demand and pollution; per-tile mobility; per-tile public-service access, served share and quality; safety model inputs, patrol and response; governance income, affordability, cost of living and effects; per-tile transit access; summary stats, metrics, health and forecasts; building occupancy, value and tax contribution. | Yes (see below). Missing fields get safe defaults. |
| CACHE | Road graphs, service travel maps, the transit graph, route period loads (module-level `WeakMap`s). | No |
| VISUAL-ONLY | Representative vehicles and pedestrians, hourly activity snapshots, City Pulse history, rain and wetness, camera. | No |

**Why derived state is still saved.** Most derived records are computed on a schedule (every 3, 5 or 30 days) from the state partway through a day. Rebuilding them at load gives different values until the next scheduled analysis, which would change gameplay. An exhaustive sweep over seven fixture states found about 30 fields that can be rebuilt exactly (for example power coverage, the police copy in tile services, building tax contribution, and some safety response fields). After encoding, they are only 4–10% of a save, and rebuilding them would mean running four subsystem passes on a copy at every load. The lossless encoding achieves the reduction without that risk. Dropping these fields remains possible later. The `derived state survives save and load with identical continued play` test checks the equivalence a rebuild would need to keep.

## Migration

- v1–v8 saves still migrate through the explicit chain in `save-format.ts`. Original legacy keys stay until two verified new-format copies exist.
- After the explicit patches, any validation failure first runs `repairDerivedState`, which only adds missing keys to the derived records above, then validates again. The defaults applied are returned (`decodeCityWithReport().repaired`) and logged.
- Missing authoritative top-level state is reported by name (`missing required state "treasury"`). Malformed or future versions get their own messages.

## Offline catch-up (`shared/simulation/engine.ts`)

Profiling a 500k transit city showed 187 ms per simulated day, 88% of it in the commuting and transit evaluation (`updateMobility`). Absences are capped at 24 real hours (17,280 days), as before. Replay is planned from the city's active load (residents plus jobs) and the absence:

| Load | Exact days | Coarse days | Aggregate |
|---|---|---|---|
| Below 5k | 360 | 240 | rest, in at most 24 evaluated days |
| 5k–50k | 120 | 120 | same |
| 50k–150k | 40 | 90 | same |
| 150k and above | 10 | 60 | same |

- **Exact:** every day replayed exactly as in active play, so short absences are identical to playing.
- **Coarse:** every day is replayed, but commuting and transit are re-evaluated every 15 days, plus a final forced evaluation.
- **Aggregate:** the remaining days are spread over at most 24 evaluated days aligned to month ends. Days in between carry the daily balance and tax revenue forward. Growth, services, safety, governance and transit advance on each evaluated day, with commuting re-evaluated every third one and on the last. No per-day events are generated, and monthly histories gain at most one entry per evaluated day.

The plan depends only on the city and the absence, so `catchUp` and the chunked `catchUpInChunks` give identical results. The chunked version yields to the browser at least every 40 ms and reports progress. The offline report says how many days were replayed exactly.

## Milestone 8 integration notes

- No transport file was changed. The codec packs any new transport fields automatically.
- If Milestone 8 adds **derived** transport fields (per-stop or per-tile metrics recomputed each evaluation), add their records to `repairDerivedState` so older v9 saves load.
- If it adds **authoritative** transport state (new player-built objects or accumulated values), bump the save version and add an explicit migration step, per the rule above.
- `step(city, mobility)` gained an optional mobility mode used only by offline replay. Active play calls `step(city)` unchanged.
