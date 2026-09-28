# Paths pass — major walkways / roads + GPS

Continue this Vite + TypeScript + Three.js app in `/Users/andrewlam/Documents/Maps/ocean-park`.
Model: Grok 4.7. Keep `http://127.0.0.1:5173/` booting (Vite may already be running).

## Goal
Make the **major walkways and roads** that are clearly visible on the official interactive map also visible on the 3D phone map, and make them **GPS-locatable**.

Official reference:
https://map.oceanpark.com.hk/sc?scale=0.17&lang=en&list=false&category=attractions

Also use `refs/op_map_whole.png` and `refs/op_map_2026_hero.jpg` for tracing. Do **NOT** bake official map textures onto shippable meshes (IP).

## What “major” means
Visible main arteries from the sheet — not every tiny spur:
- Primary pale-yellow / tan walk spines through each zone (Whiskers, Amazing Asian Animals, Aqua City, Polar, Thrill, Rainforest, Marine World)
- The clear loops/connectors between attractions that read as the main pedestrian network on the 2D map
- Any wider road-like strips that read as service/vehicle or broad plaza edges on the sheet (still original mats; keep them secondary to the yellow walk spines)
- Cable car and Ocean Express stay as special edges (already present)

Skip decorative footpaths that only clutter phone view.

## Must implement

### 1. Visible path mesh network
Today `src/world.ts` has a few `pathRibbon` zone stubs + pale spines. Replace/extend with a denser **major-path network** that follows the official sheet’s main walkways on both islands.
- Store polylines in something like `src/generated/paths.ts` or expand `public/walk.json` with geometry the scene can draw.
- Use existing `pathRibbon` / `ribbonGeometry` style: pale yellow primary walks, zone-tinted secondary where the sheet uses colored paths; slightly raised above island top so they read at phone distance.
- Keep under ~40k tris total scene; instance or merge where sensible.

### 2. GPS-locatable (same affine as POIs)
Paths must live in the **same model x,z space** as POIs and the per-island affine in `src/geo.ts`.
- Every major path vertex / walk node should be placeable from lat,lng via the waterfront or summit transform (or hand-fit in model space that already matches pins).
- Expand `public/walk.json` so the walk graph densifies along those major paths (nodes along spines + edges). Cross-island still only via `cable` / `ocean-express`.
- With a GPS (or pasted lat,lng) fix, the blue “you are here” should sit **on or next to** the nearest major path when the user is outdoors on those routes — snap the displayed position onto the nearest walk edge within a small threshold (e.g. a few meters in model space / ~15–25 m geographic), without claiming indoor rides.
- Routing (`routeToPoi`) should follow these major paths so the drawn route ribbon lies on the visible network.

### 3. Checks
- `npm run check` must still pass (affine, zones, walk graph). Add checks that:
  - major path polylines exist on both islands
  - a sample GPS near Grand Aquarium projects near a waterfront path node/edge
  - a sample GPS near Hair Raiser / Ferris projects near a summit path
  - route aquarium → hair raiser still uses cable/OE and walks along path nodes

### 4. Don’t break
- Boot must stay clean (no empty BufferGeometry `.count` crashes; canvas mounted before WebGL).
- Existing coast silhouette, zone colors, landmarks, UI chips, Locate-me zone fallback when accuracy is rough.
- Original materials only; no official map UV bake.

## Done when
1. Someone looking at the phone map can see the main walkway network the way they see it on map.oceanpark.com.hk (simplified, not 1:1 every spur).
2. Pasting a lat,lng on a known outdoor path lands the blue dot on that path network.
3. Choosing a destination draws a route that follows the visible paths (+ cable/OE when crossing).
4. `npm run check` passes; `npm run build` (or tsc + vite build) succeeds.
5. README notes the paths + GPS snap briefly.

Implement now; do not stop at a plan. Prefer editing existing files over a rewrite.
