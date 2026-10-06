# Art Pass 2: architectural benchmark

## Scope and pipeline

The previous building renderer baked walls, roof polygons, window marks and square plot geometry from `building-art.ts`. This pass replaces matching frames with offline-authored architectural PNG sprites. Simulation files, save fields, HUD and successful camera/DPR behavior are unchanged.

The benchmark contains six L1 residential forms (modest, L-shaped, shared compound, unfinished, modern and weathered), three L2 forms (duplex, courtyard bungalow and flats), four L1 shops (provisions, barber, food and phone repair), two L1 industrial yards and two construction stages. Different roof structures, balconies/verandas, entrances, walls, yards and materials provide variation beyond recolouring.

Twenty-two transparent master assets were generated using the built-in imagegen tool. Exact prompts and saved master paths are in [generation-prompts.json](../../art/generation-prompts.json). No image-generation service is needed by the game. Building masters are about 1254²; transparent crops have sufficient native pixels for the exported 528-pixel-wide HIGH property frames. Two small concrete drain-crossing sprites are authored offline by the atlas compiler.

`tools/art/build_atlases.py` uses Pillow to trim transparent margins, downsample and pack PNG/Phaser JSON sheets. The manifest/generated catalog records anchors, footprint descriptions, visual heights, level/variant, utility sockets and LOD availability. Source PNGs remain unchanged. Each property is one pooled sprite with baked architectural/environment detail; close-only generator/tank/pump props read actual building adaptation state. Construction chooses foundation below 45% and shell afterward. Abandonment darkens matching sprites; it does not invent occupants or utility use.

The 24 m visual reference and 48×24 world diamond remain. Properties occupy 44 world pixels, leaving street-edge space. Plot boundaries use irregular earth/grass margins, compound walls and driveway openings rather than raised square pedestals. Utility sockets are specific to each form and checked inside yard/service areas. Road/drain crossings appear only with actual adjacent infrastructure.

## Resolution and memory

Maximum logical zoom remains **6×**. Existing linear filtering, fractional motion and DPR caps of 1 / 1.5 / 2 remain. Source tiers are 2 / 6 / 9 / 12 samples per world unit. The far 512² sheet is 1 MiB; LOW/medium tier and MEDIUM close use one 2048² sheet (16 MiB); HIGH close uses two (32 MiB). Only the far sheet and current detailed tier remain loaded after composition. Terrain, vehicles and procedural fallback textures add their existing memory cost.

Close atlases load lazily and initially use the already-loaded medium sheet until completion triggers a redraw. No high-resolution master is downloaded individually during gameplay. The compiler rejects upscaling and exports silhouette/contact sheets from actual asset alpha.

## Validation

- Full suite: **101 tests passed across 10 files**. New contracts cover structural selections, deterministic reload, construction/adaptation authority, PNG/frame dimensions, sampling/gutters, sockets, lazy loading and detail-tier eviction.
- `npm run lint` and `npm run build` passed. The build retains the existing Phaser bundle-size advisory. Node 22 type definitions are a development-only addition for atlas file validation; no new runtime package was added.
- The isolated version 4 fixture round trip preserved every simulation field. Existing migration/offline tests passed. The normal game loaded the founding city; its HUD, responsive toolbar and pause control were checked. No user save was replaced with a benchmark fixture.
- All 17 property frames were inspected at maximum zoom, including material/roof detail, Level 2 forms, shop signs, industrial yards and foundation/shell construction. Actual backup state ON/OFF was checked, then yard socket positions were corrected. Construction/abandoned-state tests suppress private adaptations.
- Desktop 1280×720, tablet 768×1024 and phone 390×844 / 430×932 captures were inspected. HIGH synthetic DPR 2 produced a 2560×1440 desktop buffer. MEDIUM at 390×844 used 585×1266; LOW at 430×932 used 430×932. Maximum logical zoom remained 6×. No captured close view enlarged a prototype-resolution building sprite.
- Heavy/extreme rain and accumulated floodwater remained visible around compounds and across roads. New property sprites retained their materials and roof readability under wetness tint. No browser console errors were observed during the checks.

Desktop-host performance samples included 34.7 FPS for the 390×844 MEDIUM benchmark (1.8 ms redraw), 35.4 FPS for tablet MEDIUM (2.7 ms redraw), 60.0 FPS for the warmed dense 390×844 MEDIUM scene (4.1 ms redraw), and 33.9 FPS for dense LOW (1.7 ms redraw). Texture estimates were 53 MiB in those close MEDIUM/LOW scenes, including fallback/terrain/vehicle textures. Samples varied with host load; tests/builds running concurrently produced lower readings. First atlas-tier baking/loading caused a roughly 400 ms one-time hitch. These measurements do not certify physical Android hardware, a native DPR 2 display or an uninterrupted minimum frame rate.

Desktop HIGH at synthetic DPR 2 and 6× inspection used approximately 85 MiB of decoded textures and measured 21.3–29.7 FPS in the final host checks (5.0–8.3 ms CPU redraw). At DPR 1, the same 1280×720 HIGH view measured 49.8 FPS with 2.8 ms CPU redraw. HIGH/DPR 2 did not demonstrate a sustained 30 FPS floor on this host. MEDIUM is the practical preset for constrained hardware; HIGH/DPR 2 needs further GPU/device profiling. The camera/DPR system was intentionally preserved.

Captures: [desktop street](street-high-dpr2.jpg), [actual adaptations](adaptations-high-dpr2.jpg), [shop fronts](shops-high-dpr2.jpg), [construction](construction-high-dpr2.jpg), [Level 2 tablet](tablet-level2-medium.jpg), [390 MEDIUM](mobile-390-medium.jpg), [430 LOW](mobile-430-low.jpg), [mobile HUD](game-hud-390.jpg), [flood layering](flooded-benchmark-high.jpg). Review all assets in [the contact sheet](benchmark-library.jpg) and [actual alpha silhouettes](silhouettes.jpg).

## Remaining procedural artwork

Residential L3–5, commercial L2–5, industrial L2–5, their higher-level construction, terrain, vegetation, public infrastructure, roads/drains and vehicles retain the previous procedural masters. This avoids expanding the benchmark into an entire city library. Existing simulation-driven flooding, representative transport and utility functionality remain in place.

The benchmark is generated placeholder production art, with baked directional shading and fixed property orientation. Public facilities and terrain therefore still have a simpler visual language. Dedicated abandoned-building masters, full five-stage construction sequences, independently interchangeable roof/fence modules, arbitrary facade rotations and higher-level professional art remain future art work. Baked contact/compound shading remains when cast-shadow options are disabled. No new gameplay, socioeconomic model or Milestone 4.5 work was added.
