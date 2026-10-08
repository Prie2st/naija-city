# Visual Lab — architectural masterplan benchmark

## Open and evaluate

Start `npm run dev`, then open `http://localhost:5173/visual-lab/`. The entry exists only on the development server and is not linked from gameplay. **City model** displays all five districts; district buttons frame individual studies. **Block** and **Street** inspect the apartment complex. Wheel/pinch and drag use the existing camera policy, up to 6×.

**Reference** shows the user-supplied masterplan image. [Comparison](comparison.html) places it beside an actual Phaser district export. **P** hides controls, diagnostics and selection; **Esc** or a tap restores controls. **Export frame** downloads the rendered world as a PNG at backing-buffer resolution. Screenshot exports contain the world, not DOM controls.

## Composition

- A: eight compound properties along a narrow local street; one bungalow source, without new variants.
- B: four three-home terrace groups plus a shared apartment block, gardens and parking.
- C: eight buildings using five forms: linear six-storey, L-shaped eight-storey, U-shaped eight-storey, ten-storey tower and twelve-storey stepped apartments. Courtyards, paths, benches, parking, planting, entrances and service yards fill the public realm.
- D: three mixed-use buildings with articulated retail frontage, upper floors and a planted plaza.
- E: a six-lane boulevard, planted median, crossings, sidewalks, lamps and six correctly scaled transport silhouettes.

These are presentation fixtures. There is no city entity, development tick or save access. Vehicles are static model elements, not invented traffic. A visual group can contain multiple buildings without changing population. Production conversion is deliberately deferred.

## Source pipeline and scale

`tools/art/render_visual_lab.py` uses actual Blender 4.4 geometry in metres. Facades contain piers/spandrels and recessed glazing, projecting balconies, service cores and setbacks. Shared northwest daylight, neutral plaster/concrete, charcoal and muted glazing keep the library coherent. Buildings contain no square ground artwork. Ground, streets, parking, vegetation and shadows are composed separately.

Locked camera: 45° azimuth, 30° elevation; ground projects at 1.2 / 0.6 world pixels per metre. Floors are approximately 3.15 m. The 20 m logical-tile reference does not constrain Lab building counts or footprints. The existing game camera and DPR helpers are reused without modification.

Car reference: sedan 4.6×1.8 m, SUV 4.8×1.98 m, Keke 2.7×1.4 m, Danfo 5.1×1.9 m, bus 12×2.55 m, Okada 2.1×0.8 m. Parking bays are 2.6×5.2 m. Local carriageways measure 6.4 m; avenues 12.4 m; boulevard 21.4 m including its 2.8 m median. Sidewalks are continuous 2.4 m strips.

Regenerate with Blender and Python/Pillow:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.4\blender.exe' --background --factory-startup --python tools/art/render_visual_lab.py
python tools/art/pack_visual_lab.py
```

Use `-- --only linear-6 --force` for targeted source renders. The Python source defines every editable model; `art/visual-lab/linear-6-source.blend` also provides a native source example. Masters live in `art/visual-lab/masters/`; the manifest and atlases live in `public/assets/visual-lab/`.

## Runtime budget

There are 41 new object masters and 38 separate contact/cast-shadow frames. Building masters range from approximately 600×530 to 1956×1853 pixels and retain about 24 samples per world unit. Nothing is upscaled during packing. Atlases are at most 2048² with two-pixel extruded gutters and linear filtering.

| Tier | Pages | Full decoded library |
| --- | ---: | ---: |
| 2 | 6 | 2.2 MiB |
| 6 | 6 | 17.8 MiB |
| 9 | 6 | 34.6 MiB |
| 12 | 8 | 53.3 MiB |

Far pages remain resident. Detail pages load for visible objects; obsolete tiers release after visible sprites switch. LOW omits shadows, some vegetation and close props; MEDIUM/HIGH retain additional detail. Public-realm geometry is batched and rebuilt only at detail transitions. No windows or map props become DOM nodes. Initial asset loading and GPU upload can briefly hitch.

## Validation and limits

- 113 automated tests across 12 files passed; new checks cover district composition, addressability, eight-building density, scale, camera presets, simulation independence and atlas bounds/native resolution.
- TypeScript and the production build passed. The pre-existing large Phaser bundle warning remains.
- The earlier live 1440×900 HIGH/DPR 2 preview used a 2880×1800 backing buffer, around 60 FPS after loading, 444 visible sprites and about 20 MiB resident textures at 2.86×.
- The earlier 390×844 MEDIUM/DPR 1 preview recorded about 60 FPS, 385 visible sprites and 2.2 MiB textures at 0.95×. These are desktop-host viewport measurements, not physical Android certification.
- `dense-district-dpr2.png` and `mobile-390.png` are actual Phaser exports recorded before the final minor tree grading/shadow and lane-alignment refinements. They are not rendered image backgrounds.
- The browser connection ended during final review. Remaining interactive Street/maximum-zoom, 430×932, tablet, LOW and touch checks are not marked passed. Source sampling covers maximum zoom × DPR, but final on-device art/performance review remains necessary.

All normal-game assets, HUD, simulation, save version and offline progression remain intact. This benchmark uses baked 3D art and simplified batched ground/road surfaces; it is not commissioned final production art. Tree crowns share four sources; shadows use lightweight projected footprints rather than a dynamic lighting engine. No later milestone systems are included.
