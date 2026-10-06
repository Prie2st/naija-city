# Rendering resolution audit

## Cause of the previous blur

The live game measured 1280×720 CSS pixels and a 1280×720 backing buffer on a DPR 1 browser. No CSS transform or pixel-art image rendering was present. Phaser 3.90 RESIZE used the parent size directly, with no DPR strategy; this version does not support fixing game resolution with a generic config multiplier.

The prototype atlas used 128² cells with artwork baked at just 1.15 samples/world unit, then scaled back to world size. Transparent cell area did not represent usable image detail. Maximum camera zoom was 2.8×. Linear filtering (Phaser's default with antialias enabled) enlarged actual roof/window/vehicle samples by approximately 2.4× at that zoom. A DPR 2 screen would additionally lack sufficient backing pixels. Fractional coordinates were not the primary cause; rounding them would introduce movement jitter.

| Category | Previous approximate usable source size | Close master at HIGH / 6× | Maximum CSS display reference |
| --- | --- | --- | --- |
| Terrain | 55×28 px | roughly 600×320 px, plus decal margins | 288×144 px tile |
| Roads / drains | Vector geometry | Rendered directly to backing buffer | Road class width × camera zoom |
| Residential | roughly 50×35–115 px parcel | roughly 600×420–1,300 px | Roof ~160–210 px wide; parcel ~288 px |
| Commercial | roughly 50×30–110 px | roughly 600×360–1,260 px | Parcel ~288 px wide |
| Industrial | roughly 50×30–65 px | roughly 600×360–750 px | Parcel ~288 px wide |
| Trees | roughly 25–40×30–45 px | roughly 300–480×360–540 px | ~130–230 px wide |
| Vehicles | roughly 5–14 px body length | 12 samples/world unit, ~36–170 px body | Car ~30 px, bus ~75 px length |
| Infrastructure | roughly 50×30–65 px | roughly 600×360–780 px | Single-tile facility |

These are approximate visible-art bounds, not atlas-cell dimensions. The vector masters can be rebaked at arbitrary source resolution; native coverage at 6× is verified automatically for each quality cap.

## Corrected pipeline

- Logical camera zoom spans map-wide framing through 6× inspection. Wheel/trackpad zoom retains pointer focus; pinch uses its midpoint; buttons interpolate smoothly. Input and physical camera dimensions incorporate DPR, while Home/LOD/UI use CSS-facing zoom.
- Canvas CSS dimensions and backing dimensions are separate. LOW/MEDIUM/HIGH cap native DPR at 1/1.5/2, with 2.5M/4.5M/8.4M backing-pixel budgets. Resizing preserves the world centre and recalculates input mapping.
- Anti-aliased Canvas vector authoring and linear texture filtering remain. No nearest-neighbour CSS and no indiscriminate pixel snapping. Extra WebGL framebuffer multisampling is disabled; high-DPI supersampling supplies smooth diagonals.
- Detail source tiers reach 6/9/12 samples/world unit. Tight, padded 2048² atlas pages are generated on demand, sorted by height, cached, uploaded in batches and capped at 2/3/5 pages. Tier changes release obsolete pages. Overflow uses pooled vector masters instead of magnified prototype sprites.
- Vehicles share a small 1024² master sheet at 12× sampling. Camera culling limits high detail to visible parcels. Estimated texture budgets include the 16 MiB base atlas, 4 MiB vehicle atlas and active detail pages; framebuffer/driver memory is additional.
- Professional preloaded master sheets can replace individual frames through the contract in `public/assets/README.md` without simulation changes.

## Validation

All requested zoom views were captured at effective DPR 2: [0.5×](sharpness/zoom-05.jpg), [1×](sharpness/zoom-10.jpg), [1.5×](sharpness/zoom-15.jpg), [2×](sharpness/zoom-20.jpg), [2.5×](sharpness/zoom-25.jpg), [3×](sharpness/zoom-30.jpg), [6×](sharpness/zoom-60.jpg). Every captured view reported zero atlas fallbacks. Roof seams, eaves, window frames, verandas, compounds, tanks, road edges and a representative vehicle remained readable at street zoom.

Backing sizes verified with the isolated fixture:

| CSS size | Quality / test DPR input | Backing size |
| --- | --- | --- |
| 1920×1080 | HIGH / 2 | 3840×2160 |
| 1440×900 | HIGH / 2 | 2880×1800 |
| 1280×720 | HIGH / 1 and 2 | 1280×720 and 2560×1440 |
| 768×1024 | MEDIUM / 2 | 1152×1536 |
| 430×932 | MEDIUM / 2 | 645×1398 |
| 390×844 | MEDIUM / 2 | 585×1266 |
| 390×844 | LOW / 2 | 390×844 |

The actual browser viewport override was checked at 390×844. Other sizes were additionally verified using explicit fixture canvas-parent dimensions. DPR 2 uses a synthetic input to the same production render policy; the physical test display reports DPR 1. This verifies buffer sizing and source coverage, not physical high-DPI hardware performance.

Native wheel-event focus drift measured 0.11 world pixels. Synthetic touch events traversed Phaser's touch input: pinch changed 3× to 5.14×; a 60 CSS-pixel single-finger drag moved 20 world pixels at 3×. Mouse drag, developed-area Home, rain effects and an exact version 4 save roundtrip were also checked. Simulation/storage/offline migration regression tests remain intact.

The normal game saved through Settings and reloaded the same city/date/population successfully on an isolated test origin. Its HUD, zoom buttons and Home were also checked at a real 430×932 viewport; [mobile HUD after reload](sharpness/mobile-hud-save-reload.jpg). No runtime errors were logged in that check. Existing save version 4 remains unchanged.

The final full suite passed all 97 tests with `npm test -- --maxWorkers=1`, using the default test timeout. An earlier slow run exceeded the existing seasonal-weather test's five-second limit; the final run completed in 28 seconds without assertion failures. Production type-checking and Vite build passed; Vite still reports its large Phaser bundle advisory.

## Performance and limitations

Removing redundant framebuffer multisampling improved the initial DPR 1 scene from roughly 40 to 56 FPS. Tested phone MEDIUM/LOW close views reported approximately 55–60 FPS. HIGH synthetic DPR 2 desktop checks were substantially more expensive: approximately 24–57 FPS across the sampled zoom/size sequence, including atlas generation and screenshot activity. These host readings are not Android certification. First-use tier baking can hitch; physical Android and real DPR 2 hardware remain validation tasks.

Art remains procedural. Source resolution and asset-replacement contracts are improved, but this pass does not produce final commissioned architectural artwork. Draw-call counters are unavailable through the current diagnostics. No gameplay, simulation, storage format, Milestone 4.5 or Milestone 5 systems changed.
