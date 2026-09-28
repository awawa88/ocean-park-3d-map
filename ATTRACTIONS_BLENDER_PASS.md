# Attraction assets pass — Blender GLBs via Grok 4.7

Continue the Vite + TypeScript + Three.js app in `/Users/andrewlam/Documents/Maps/ocean-park`.
Model: Grok 4.7.

## Goal
Replace the current procedural Three.js landmark primitives with **phone-ready stylized GLBs** built in **Blender** for major attractions, so the map looks much closer to the illustrated official park map (toys, not photoreal).

Official look reference (layout/colors only — do NOT bake map art onto meshes):
https://map.oceanpark.com.hk/sc?scale=0.17&lang=en&list=false&category=attractions
Also `refs/op_map_whole.png`, `refs/op_map_2026_hero.jpg`.

## Blender on this Mac
Binary: `/Applications/Blender.app/Contents/MacOS/Blender` (also `~/.local/bin/blender`).
Use headless: `blender --background --python script.py` (or `-b -P`).
Export glTF 2.0 binary `.glb`. Y-up, apply transforms, reasonable origin at ground center of each toy.
Keep each asset low-poly and readable at phone distance (prefer under ~2–4k tris per landmark unless a hero piece needs more; total landmarks under ~25k tris).

## Build these major attractions (priority order)
Output under `assets/attractions/` (create the folder):
1. `grand-aquarium.glb` — white hall + cyan wave roof cue (Aqua City / lagoon)
2. `giant-panda-adventure.glb` — readable panda pavilion
3. `hair-raiser.glb` — orange coaster loops (Thrill Mountain)
4. `ferris-wheel.glb` — Ferris at Marine World tip
5. `ocean-park-tower.glb` — tower near Marine World
6. `cable-gondola.glb` — one gondola mesh to instance along the cable
7. `ocean-express-train.glb` — short train / station cue (optional if time)

Optional extras if turns remain: Sea Life Carousel, Shark Mystique, Crazy Galleon, Arctic Blast block.

## Style
- Cartoon / illustrated-map diorama toys (matte, saturated, soft bevels)
- Original materials only (Principled Base Color / Emission sparingly). **No official map textures.**
- Match the app’s zone color language where relevant (cyan aquarium, coral panda, orange coaster, pink Marine, ice Polar)
- Scale so they read oversized like map icons when placed at POI pins

## Wire into the app
- Load GLBs with Three.js GLTFLoader (add dependency if missing).
- In `src/world.ts` `addLandmarks`, place each GLB at the matching POI `position` (and y on island top). Keep procedural fallbacks only if a file is missing.
- Instance gondolas along the cable curve.
- Do not break coast, paths, GPS affine, walk graph, or boot.

## Checks
- Each GLB opens / exports cleanly; `npm run build` and `npm run check` pass.
- Dev server still boots at `http://127.0.0.1:5173/` with no WebGL start errors.
- README: short note that major attractions are Blender GLBs in `assets/attractions/`.

## Done when
Phone view shows distinct Blender-built toys for aquarium, panda, Hair Raiser, Ferris, and tower that clearly beat the old box/sphere primitives, pinned to the correct POIs.

Implement now. Prefer Blender Python scripts checked into `scripts/blender/` so assets can be regenerated.
