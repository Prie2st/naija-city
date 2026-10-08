# City art pipeline

The renderer combines offline architectural sprites with procedural fallback artwork. Benchmark private buildings load packed PNG/JSON sheets from `architecture/`; remaining categories use the `city-materials` and native-resolution procedural atlases. Runtime gameplay requires no image service. The benchmark masters are generated art, not commissioned production assets.

## Scale, lighting and anchors

One visual tile represents approximately **24 m**, projected to a **48×24 px** diamond. The calibrated mobility simulation still uses its existing 120 m travel lengths. Buildings use roughly 8 px per storey, compounds occupy their own parcels, and vehicles use approximately 4.5/6/10 m car/minibus/bus lengths.

Use warm northwest daylight, a lighter left facade, shaded right facade, restrained glass and zinc highlights, and lower-right cast shadows. Contact shading is baked into frames; expensive dynamic lighting and fullscreen AO are absent. Future morning/evening/night art can replace the baked material palette without changing simulation state.

Frames occupy 128×128 atlas cells. Authoring origin is (64,96), scaled by 1.15. Runtime origin is (0.5,0.75); trimmed frames retain that untrimmed anchor. The atlas is 2048×2048, 16 MiB decoded RGBA, with 209 named frames. Transparent margins are trimmed before sprite submission. Ground, shadows, objects and interaction overlays have separate depths; buildings and vehicles sort by ground-contact screen Y.

## Modular authoring

- `environment-art.ts`: terrain, water, tropical vegetation, generators, tanks and pumps.
- `building-art.ts`: residential, commercial, industrial, construction and abandonment variants.
- `infrastructure-art.ts`: generation, distribution, water assets and drains.
- `roads.ts`: connected road geometry, shoulders, weathering, junction markings and wetness.
- `art-atlas.ts`: packing, frame naming and directional vehicle artwork.
- `world-art.ts` / `traffic-art.ts`: sprite reuse, culling, LOD and state-authoritative selection.

Replacement sheets can use terrain/, roads/, residential/, commercial/, industrial/, infrastructure/, vegetation/, vehicles/, props/ and weather/ groups. Keep the frame names from `art-atlas.ts`, preserve trim/origin metadata and preload the replacement under `city-materials`; the procedural fallback is skipped when that texture already exists. No save fields depend on artwork.

## Quality and verification

Low reduces vegetation and weather, removes cast shadows and uses aggressive LOD. Medium is the phone default; high adds close vegetation details. Tiny private props appear only at close zoom and only from actual generator/water adaptation state. Construction, flooding and traffic remain simulation-driven.

Visit `/graphics-check.html` during Vite development for isolated small/medium/dense fixtures, all levels/road classes/utilities, real aggregate routes, weather, flood recovery, save-format checks and frame-time measurements. The fixture page accesses no city storage and is not a production entry. Settings developer tools inspect bounds, anchors, depth, LOD, sprites, atlas use and performance. Physical Android hardware must still verify the 30 FPS target; desktop viewport resizing is not device emulation.

## Native-resolution masters and inspection

The resolution fix retains vector authoring but generates tight source frames at 4/6/8/9/12 samples per world unit. Quality caps source sampling at 6 (low), 9 (medium), or 12 (high), covering logical 6× zoom at each preset's maximum DPR. Detail is baked on demand, packed by height into 2048² pages with transparent gutters, reused, and uploaded once per changed page. Changing resolution/detail tier releases the previous tier. Caps are two/three/five detail pages; cache pressure uses pooled vector masters rather than enlarged prototype bitmaps. Vehicles use a separate 1024² sheet at 12× source sampling.

To replace procedural art, preload trimmed sheets under `city-master-{scale}-{medium|close}` (for example `city-master-12-close`). Use existing frame keys such as `building-residential-1-0`. Author at the named samples/world-unit scale, retain a 128×128-world-unit untrimmed cell with anchor `(64,96)`, and supply normal Phaser trim metadata. The runtime sets origin `(0.5,0.75)` and scales by `1/scale`. Missing professional frames use procedural masters. Load only the quality/detail sheets needed; no simulation fields reference artwork.

Canvas CSS size is separate from its backing buffer. DPR caps are 1/1.5/2; additional backing-pixel budgets protect oversized displays. Linear filtering and Canvas anti-aliasing remain; extra WebGL framebuffer multisampling is disabled because DPR provides supersampling. Static coordinates and vehicle movement retain fractional precision rather than introducing rounding jitter. Roads/drains are vector geometry and render at the current backing resolution. See `docs/render-resolution.md` for the audit and captured checks.

## Offline architectural sprites

`art/masters/` contains 22 transparent PNG source assets and two small offline-authored driveway culverts. Building masters are approximately 1254×1254; utility masters vary. Keep masters unchanged; edit placement metadata in `art/benchmark-source.json`. Run `python tools/art/build_atlases.py` with Pillow to regenerate these runtime files and `client/game/architecture-catalog.ts`.

`architecture/manifest.json` records footprint, anchor, visual height, level/variant, utility sockets, source dimensions and LOD availability. Property frames occupy 44 world pixels within the 48-pixel tile reference and include irregular soil/grass margins rather than raised square bases. Anchors identify ground contact; culling uses the recorded visual height. Source sampling matches supported maximum physical zoom without upscaling master images.

| Tier | Use | Pages | Decoded RGBA |
| --- | --- | --- | --- |
| 2 | Far city | 1 × 512² | 1 MiB |
| 6 | Medium / LOW close | 1 × 2048² | 16 MiB |
| 9 | MEDIUM close | 1 × 2048² | 16 MiB |
| 12 | HIGH close | 2 × 2048² | 32 MiB |

Sheets have two-pixel transparent gutters and linear filtering. Retain the small far sheet and one detailed tier; close sheets load lazily. These budgets are additional to existing terrain, vehicles, utilities and fallback atlases. Each property is one pooled sprite; tiny state-authoritative utility props and road/drain crossings are composed only at close LOD. Decorative architectural details are baked, not separate DOM or per-frame geometric objects.

Replacement professional art can keep manifest IDs/frame names and update metadata/masters without touching simulation or saves. PNG is used for alpha fidelity; no extra WebP decoder or runtime image-generation dependency is introduced. Prompts/provenance are in `art/generation-prompts.json`; review contact sheets and actual in-game captures in `docs/art-pass-2/`.
