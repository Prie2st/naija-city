# Graphics validation

All 90 Vitest tests pass, including six graphics contracts. Production compilation/type checking succeeds. Vite retains the existing large Phaser bundle warning. No simulation or city-storage modules changed; live version 4 reload and exact dense-fixture save roundtrip preserve city state. Existing migration/offline regression tests pass.

## Visual checks

- Desktop 1280×720, tablet 768×1024, phone 390×844 and 430×932: inspected small/medium/dense fixtures and existing responsive HUD/settings.
- Fixtures cover all three private uses, levels 1–5, deterministic variants, construction, abandonment, four road classes, utilities/drains, actual route traffic and private adaptation state.
- Heavy/extreme rain produces wet roads, darkened plots, bounded rain strokes and translucent accumulating floodwater. Recovery clears rainfall and reduces accumulation through existing hydrology.
- Normal-game save/reload retains population/date and graphics preferences. Browser runtime error logs were empty.

## Host measurements

These are browser frame-time readings on the development computer, not physical Android benchmarks. Concurrent test games/builds caused lower readings; closing the second test game restored the isolated scene. Phone viewport resizing does not emulate mobile GPU/CPU limits.

| Scene / viewport | Quality | Observed FPS | Other observations |
| --- | --- | --- | --- |
| Small / desktop | High | 54–60 | Roughly 1,362 active sprites; redraw 4–10 ms |
| Medium / desktop | High | 48–56 | All levels, 72 representative vehicles |
| Small / 390×844 | High | ~60 | 1,053 active sprites |
| Medium / 390×844 | Medium | ~60 | 36 representative vehicles |
| Dense / 390×844 | Medium | 46–57 | Lower end during rain; redraw ~20 ms |
| Medium / 430×932 | Medium | ~55 | p95 frame ~28 ms |
| Medium/dense / tablet, concurrent build/test game | Medium | ~30 | Redraw 21–41 ms; contention affects results |
| Medium / tablet, isolated final check | High, close LOD | 57–60 | Redraw ~11 ms; p95 frame 18–22 ms |
| Dense rain/recovery / tablet, isolated | Low | 53–55 | Redraw ~19 ms; 36 representative vehicles |

Atlas: 209 trimmed frames, one 2048² texture, approximately 16 MiB decoded RGBA. Camera culling, sprite reuse, zoom LOD and bounded rain/vehicles limit work. Physical mid-range Android validation remains outstanding; the 30 FPS hardware target is not certified.

## Art limitations

Artwork remains procedural, with final professional assets replaceable through the atlas contract. Coastlines follow tile topology, most water highlights are static, and utilities are compressed single-tile representations. Cast shadows can be disabled; baked contact shadows remain. No dynamic lighting, free-camera 3D or new gameplay systems were added.
