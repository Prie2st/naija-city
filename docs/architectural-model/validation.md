# Architectural benchmark validation

## Scope and implementation

The new target is a premium physical architectural model, with 85% architectural realism and 15% miniature readability. The A–L benchmark is implemented: bungalow, duplex, four/eight/fourteen-storey apartments, shop row, modern commercial building, warehouse, courtyard apartment, local street, avenue and major boulevard. The isolated urban block contains four apartments, shared landscaping, parking, paths, street frontage and surrounding roads.

Blender 4.4.1 generates actual dimensional geometry using one orthographic camera and shared lighting/materials. Editable source: `art/model/benchmark-source.blend`; reproducible authoring: `tools/art/render_models.py`. No runtime 3D engine was introduced. `tools/art/pack_models.py` exports 96 frames, projected anchors, sockets and 2/6/9/12-sample atlas tiers, with extruded gutters and maximum 2048-pixel pages. Masters use approximately 24 samples per world unit; the fourteen-storey master is 1173×2120 pixels.

One visual tile represents 20 m. The accepted 48×24 projection, 6× camera limit, smoothing, pointer/pinch controls and DPR caps are preserved. Simulation travel lengths and all gameplay rules remain calibrated as before. Detailed pages load by visible frame. Obsolete tiers release only after visible pooled sprites stop referencing them; a regression test covers quality changes while vehicles still hold old frames.

## Automated checks

- Full suite: **107 tests passed across 11 files** (`npm test -- --maxWorkers=1`).
- After the final test-only type annotation, all six architectural tests passed again.
- Production build: **passed**, including strict TypeScript checking. Vite retains its existing large-bundle warning (approximately 1.46 MB uncompressed main JavaScript).
- `git diff --check`: passed; only the repository's normal LF/CRLF notice appeared.
- Existing migration, malformed-save, construction, infrastructure, mobility and deterministic offline tests passed. Save format remains version 4; no new simulation fields or visual vehicles are persisted.

## Browser checks

The isolated `/graphics-check.html` page never reads or writes the player's save. Version 4 round trips preserved every field, including a dense fixture with 21 organically generated routes. All five residential heights, both construction stages, three rendered road classes and legacy dirt/mixed transitions were inspected. Moving representatives use real mobility flows/routes; private generator/tank/pump props were checked with actual building adaptation ON and OFF. Flood accumulation, recession and lingering wetness were checked with the existing weather simulation.

Wheel focus drift measured **0.099 world pixels**; synthetic touch pinch reached **6×**, and touch dragging moved the camera **10 world pixels**. Developed-bounds Home, LOW/MEDIUM/HIGH transitions and DPR 1/2 backing buffers worked without runtime errors after the atlas fix. The existing mobile HUD and toolbar remain intact.

## Measured rendering

Measurements use the desktop host with responsive viewport and DPR inputs, after export/test processes became idle. They are samples from the in-game frame diagnostics, not Android benchmarks.

| View / quality | CSS size | Backing size | Zoom | FPS sample |
| --- | --- | --- | --- | --- |
| Urban block / MEDIUM | 390×844 | 585×1266 | 3× | 57.8 |
| Urban block / LOW | 430×932 | 430×932 | 3× | 60.0 |
| Dense mixed city / LOW | 430×932 | 430×932 | 0.35× | 54.0 |
| Low-density street / MEDIUM | 768×1024 | 1152×1536 | 4× | 53.5 |
| Urban block / HIGH, DPR 1 | 1280×720 | 1280×720 | 4× | 54.4 |
| Urban block / HIGH, test DPR 2 | 1280×720 | 2560×1440 | 4× | 38.4 |

The dense fixture reached 25,964 residents, 31,289 daily trips and 21 routes, with a 36-representative vehicle pool. Far LOD hides individual vehicles. World redraw samples were approximately 0.7–3.5 ms for close benchmark views and 13.4 ms for the dense far view. Benchmark texture estimates were approximately 33 MiB LOW, 43 MiB MEDIUM and 55 MiB HIGH, including legacy fallback textures. The entire HIGH model library is bounded at 56 MiB; pages are loaded lazily. Draw-call counters are unavailable in the current diagnostics.

## Review images

- [Live urban block](urban-block.png)
- [Urban block at DPR 2](urban-block-dpr2.png)
- [Street at 6× / DPR 2](street-max6-dpr2.png)
- [All building levels and construction](benchmark-all-levels-dpr2.png)
- [Tablet utility adaptations](tablet-adaptations.png)
- [Rain and flooding](rain-flood.png)
- [390-pixel mobile view](mobile-390-medium.png)
- [430-pixel Home view](mobile-430-low-home.png)
- [Offline asset contact sheet](benchmark-library.jpg)

## Limitations and stopping point

This is the quality benchmark, not a completed city-wide library. Commercial L2/L4/L5, industrial L2–L5, public utility facilities, dirt/mixed-class transitions, water/shorelines and weather/overlay artwork retain legacy rendering. Residential forms have benchmark-level variation only; construction uses a generic foundation/shell. Parking cars and landscaping are decorative public-realm artwork, not new simulation systems. Generator/water adaptations and moving traffic remain authoritative.

Shadows and windows are baked; shadow toggles cannot independently remove the baked lighting. No physical Android or native DPR 2 display was available. HIGH at forced DPR 2 and extreme rain had lower frame rates during resource contention; the browser checks do not establish a hardware-wide 30 FPS guarantee. The requested second reference image was absent: the attachment contained only text, so direct image comparison was unavailable.

The benchmark stops here for visual review. No Milestone 4.5/5 systems or full-library conversion were added.
