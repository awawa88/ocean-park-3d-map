# Fidelity pass — match official Ocean Park interactive map

Continue this existing Vite + TypeScript + Three.js app in `/Users/andrewlam/Documents/Maps/ocean-park`.
Model: Grok 4.7. Keep the app booting at `http://127.0.0.1:5173/` (Vite may already be running).

## Goal
Make the 3D phone map look and feel **as close as possible** to the official interactive map:
https://map.oceanpark.com.hk/sc?scale=0.17&lang=en&list=false&category=attractions

Someone who knows that site must instantly recognize this as the same park map in 3D.

## Hard IP rule
- Original geometry + materials only.
- Do **NOT** bake / UV `refs/op_map_whole.png`, hero art, or any scraped official map tiles onto shippable meshes.
- Refs are for **tracing / alignment / color sampling** only. You may keep a hidden debug overlay for yourself while editing; ship without official textures.

## Must-fix (in priority order)

### 1. Silhouette = official coast
Open `refs/op_map_whole.png` and `refs/LAYOUT_BRIEF_v4.md`. Rebuild / retune island footprints in `src/generated/coast.ts` (or equivalent) until:
- **Waterfront LEFT**: three clear lobes — Whiskers north, Amazing Asian Animals mid-west, Aqua City south with **circular lagoon bite**.
- **Summit CENTER→RIGHT**: Polar hub + Thrill east + Rainforest south + neck + long **Marine World peninsula** with correct tip mass (Ferris at tip).
- Wide open water gap between Waterfront east and Summit west (~Waterfront width).
- Long **cable-car arc** over water; shorter Ocean Express Aqua City ↔ hub.
Compare against the official map silhouette; fix under/overshoot into ocean.

### 2. Illustrated-map color language (not grey clay / Tiny SF)
Match the official sheet’s zone path + land language with original mats:
- Whiskers Harbour → warm orange / peach paths
- Amazing Asian Animals → coral / red
- Aqua City → cyan / light blue + lagoon water disk
- Polar Adventure → icy white / pale blue
- Thrill Mountain → yellow / gold
- Rainforest → lush green
- Marine World → pink / magenta / purple
- Land fill: soft park greens + pale path yellows
- Water: bright map-teal
- Thick light sandy / stone island walls
Read `src/world.ts` and recolor / rebuild zone tints so zones sit under the correct label clusters.

### 3. Landmark toys (oversized, colorful, readable)
Place/fix distinctive toys that read from phone distance: Grand Aquarium wave-roof, panda pavilion, Hair Raiser orange loops, Ferris, Ocean Park Tower, cable gondolas, Ocean Express. Align to POI positions in `public/pois.json` / official map labels.

### 4. POI + UI parity (phone-first)
- Keep HTML chips (not 3D text). Whole park: Waterfront, Summit, Cable Car, Ocean Express only; zoom shows nearby.
- Bottom dock: Whole park, Waterfront, Summit, Locate me.
- Category feel can nod to the official Attraction filter without cloning their wait-time pins API.
- Search + fly-to must land on correct side (panda → Waterfront, Hair Raiser → Summit, Ferris → Marine tip).

### 5. GPS affine (keep working)
Per-island affine; debug paste lat,lng still works. Aquarium GPS must land Waterfront, not the gap/Summit. Do not break `npm run check`.

## Constraints
- Phone-first portrait; pinch / one-finger orbit pitch-locked / two-finger pan.
- Under ~40k tris; WebGL Three.js; no WebGPU/WASM required.
- Do not leave the app in a broken boot state. Fix any `Failed to start` / empty geometry / detached canvas issues before finishing.
- Prefer editing existing code over a full rewrite. Optional mesh: `assets/OP_Map_LayoutV4.glb` — fix footprints or rebuild procedurally; silhouette must match refs.

## Done when
1. `npm run build` (or `tsc --noEmit && vite build`) succeeds with PATH including local node if needed (`~/.local/node/bin`).
2. Dev server shows colorful islands that read as Ocean Park’s official map silhouette + zone colors.
3. Cable arc + lagoon + Marine tip are visually obvious.
4. GPS/walk checks still pass (`npm run check` if present).
5. Brief note in README: what changed in this fidelity pass.

Work until the silhouette + colors would pass the “that’s Ocean Park’s map” test. Do not stop at a plan — implement.
