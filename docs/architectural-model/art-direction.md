# Premium living architectural model

Locked target: a clean physical architectural masterplan model brought to life. Approximately 85% architectural realism, 15% miniature readability. Earlier illustrated PNGs and procedural primitives remain legacy assets, not the target.

## Source and scale

`tools/art/render_models.py` authors dimensional 3D geometry in Blender 4.4.1. Shared orthographic camera: 45° azimuth, 30° elevation, parallel verticals and a 2:1 ground projection. Shared plaster, concrete, dark glass, metal, paving and landscape materials; northwest daylight and sky fill. No Blender or runtime 3D dependency reaches the browser.

One visual tile is 20 m. Residential floors are 3.2 m; commercial floors are 3.8 m. The 48×24 projection, 6× zoom, DPR caps and calibrated 120 m simulation travel lengths are preserved. Occupancy remains aggregate: models illustrate density rather than one apartment per simulated household. No capacity rules changed.

Masters contain approximately 24 samples per world unit: twice maximum zoom × DPR. The tallest model is about 1.2K×2.1K pixels. `pack_models.py` trims transparency, records projected anchors, downsamples without upscaling, extrudes two-pixel gutters and packs atlases up to 2048 pixels per side. Windows are baked; the named `glass` source material prepares future lighting work.

## Benchmark scope

A–E: bungalow, duplex, four-, eight- and fourteen-storey apartments. F–I: shop row, modern commercial building, warehouse and U-shaped courtyard apartment. J–L: local street, avenue and major boulevard with fixed-orientation connection masks. Supporting construction, trees, vehicles, actual-state generators/tank/pump, drainage and public realm establish a coherent benchmark, rather than a full variant library.

The isolated Graphics QA page presents four apartment buildings around landscaping, paths, parking and surrounding avenues. Parked model cars are decorative representations, not a parking simulation. Moving vehicles require real flows/routes; utilities require real adaptation; construction and flooding remain authoritative.

## Runtime and limits

Phaser composes pooled sprites. FAR: 2 samples/world unit. MEDIUM and LOW close: 6. MEDIUM close: 9. HIGH close: 12. Detailed pages load lazily by visible frame; obsolete tiers release after sprites switch. Tall model metadata supplies culling and Home bounds. No runtime window geometry, dynamic object lighting or DOM props.

Legacy commercial L2/L4/L5, industrial L2–L5, dirt roads, mixed-class transitions, public utility facilities, water/shoreline and weather/overlay artwork remain outside this benchmark. Whole-library conversion requires visual approval.

The request mentions a second reference image, but its attachment contains only text. The benchmark follows the written direction; direct image comparison was unavailable.

## Rebuild

Run Blender in background with `--python tools/art/render_models.py -- --force`, then run `python tools/art/pack_models.py` with Pillow installed. Use `--only bungalow,duplex` for targeted renders; `--hero` generates the assembled physical block and editable `.blend` source. Repack after modifying masters. Keep simulation and HUD unchanged.
