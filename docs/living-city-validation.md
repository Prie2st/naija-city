# Milestone 4.5 validation

Validated on 5 October 2026. This milestone preserves the existing simulation,
Phaser renderer, camera/DPR controls and architectural asset pipeline. It adds
aggregate living-city behavior and bounded representations, without Milestone 5.

## Architecture and scope

- `shared/simulation/activity.ts` produces read-only activity snapshots at 10 Hz.
  Smooth weekday/weekend profiles use actual occupancy, jobs, cached OD paths,
  transit, business schedules, utilities and weather. Work journeys reverse in
  the evening; rain reduces optional pedestrian activity.
- `living-city.ts` maintains sampled households, stable neighborhood identities,
  meaningful feed transitions, organic markets and modest informal employment
  and housing. Samples reference existing residents rather than adding people.
- Businesses lose jobs, output and customers after sustained economic closure.
  Viable premises can reopen after a cooldown. Flood closures remain temporary.
- `traffic-art.ts` and `city-life-art.ts` consume activity snapshots using pooled
  images. Short pedestrian links are cached outside rendering. Vehicles follow
  real flows/routes, including freight and stop pauses. Neither pool is saved.
- Data, Transport and inspectors explain activity, accessibility, household
  concerns, satisfaction contributions, business state and neighborhood health.
  City Feed is contextual; the existing HUD and toolbar remain intact.

## Automated checks

`npm test`: **135 tests passed across 13 files**. Coverage includes commuter
peaks/reversal, journey matching, congestion, Danfo pressure, business schedules,
closure/reopening, temporary flood closure, household references, stable names,
sentiment, feed bounds/deduplication, suitable market formation and removal,
informal housing/integration, employment/tax invariants, save validation/migration
and deterministic active/offline equivalence. Existing development,
infrastructure, mobility, camera, graphics and persistence suites also pass.

`npm run lint` and `npm run build` passed. Vite retains the existing large-chunk
warning for the Phaser application bundle; there are no TypeScript/build errors.

Version 5 persists lifecycle, neighborhoods, samples, markets, informal state and
bounded feed history. Versions 1–4 migrate; malformed state is rejected. The
browser check seeds a version 4 save before application startup, runs offline
catch-up, checks the Welcome Back jobs/events report, saves version 5 and verifies
that the original version 4 storage value remains unchanged.

## Browser checks

Isolated Chrome contexts were used, never the player's browser profile/storage.
`tools/check-living-browser.cjs` exercises real-capacity fixtures at **200,
5,000, 50,000 and 250,000 residents**, morning/evening/night, rain/flood recovery,
power disruption, sustained market emergence, save round trips and identical
offline replay. Normal game checks cover a new city, all six toolbar categories,
City Feed focus/navigation, Save/Load, reload and horizontal overflow.

`tools/check-living-extra.cjs` checks clipped close-view street activity, bounded
pools, a route created through the existing public-bus API, tablet presentation
and version 4 migration. No runtime errors were recorded. Screenshots and JSON
diagnostics are generated under ignored `.qa/living-city/`.

### Rendering measurements

Host Chrome with its default graphics backend, at approximately 3.7–4× street
zoom. These are viewport/DPR emulation measurements, not physical Android results.

| Viewport / quality | Backing buffer | Population range | Observed FPS | Vehicle / pedestrian pool caps |
| --- | --- | --- | --- | --- |
| 1440×900 High, DPR 1 | 1440×900 | 200–250,000 | 49.8–59.7 | 72 / 96 |
| 390×844 Medium, DPR 2 | 585×1266 | 200–250,000 | 57.8–60.0 | 14 / 18 |
| 430×932 Medium, DPR 2 | 645×1398 | 200–250,000 | 55.7–60.0 | 17 / 22 |
| 390×844 Low, DPR 2 | 390×844 | 200–250,000 | 60.0 | 8 / 6 |
| 768×1024 Medium, DPR 2 | 1152×1536 | 5,000 | 60.0 | 32 / 42 |
| 1440×900 High, DPR 2 | 2880×1800 | 250,000 | 40.6–41.5 | 72 / 96 |

The final targeted phone runs reached 60 FPS with active street vehicles and
pedestrians. Pool allocation remained bounded despite population increases.
Dense desktop High/DPR 2 had about 30 ms p95 frame time in the final sample;
an earlier run averaged about 31 FPS. Quality settings remain important.
Texture estimates were approximately 39–101 MiB depending on quality and loaded
detail pages. Existing first-use detail-atlas baking can cause 40–170 ms redraw
spikes; settled redraws were generally much shorter.

## Intentional limits

- One city day still takes five seconds at 1×. Hourly activity is a representative
  profile; economics and utilities retain daily simulation/dispatch sampling.
- Pedestrian paths approximate roadsides, entrances and stop links. Agents do not
  represent individual people, queue exactly or perform detailed collision AI.
- Lighting state prepares future day/night presentation; this milestone adds no
  full lighting overhaul. Small pedestrian/stall/freight artwork extends the
  existing asset system rather than replacing architecture assets.
- Informal employment, market viability and housing are aggregate approximations.
  Informal compounds remain single-tile and integrate through basic services;
  deep governance policies and future-service trips remain deferred.
- Physical mid-range Android performance still needs device testing. Desktop High
  at DPR 2 is not a guaranteed 60 FPS mode for dense scenes. Cold atlas spikes and
  the existing production bundle size remain optimization opportunities.

No education, healthcare, waste, crime, politics, BRT, rail or Milestone 5 systems
were introduced.
