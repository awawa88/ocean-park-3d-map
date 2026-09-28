# Build: Ocean Park Hong Kong phone-first 3D map (Grok 4.7)

Create a working Vite + TypeScript + Three.js web app in this folder (`~/Documents/Maps/ocean-park`). Phone-first portrait wayfinding map. Visitors use it at the park to find attractions.

## Visual / layout target
Someone who knows https://map.oceanpark.com.hk must immediately recognize this as a 3D version of that official illustrated map.

- **Waterfront LEFT**: three lobes — Whiskers Harbour (north, orange), Amazing Asian Animals (mid-west, coral/red, pandas), Aqua City (south, cyan + **circular lagoon**). Grand Aquarium by the lagoon.
- **Summit CENTER→RIGHT**: Polar hub (icy) + Thrill Mountain east (yellow, Hair Raiser orange loops) + Rainforest south (green trees) + neck + long **Marine World peninsula** (pink/magenta) with Ferris at the far tip and Ocean Park Tower.
- Wide water gap between sides (~Waterfront width). Long **cable-car arc** over open water to north Marine World. Shorter Ocean Express link Aqua City ↔ hub.
- **Illustrated-map colors** (not grey clay, not Tiny SF pastel city blocks). Soft park greens, pale path yellows, bright map-teal water, light sandy island walls.
- Original geometry/materials only. Do **NOT** bake `refs/op_map_whole.png` or hero art onto shippable meshes (IP). Refs are for LAYOUT alignment only.
- Optional start mesh: `assets/OP_Map_LayoutV4.glb` (may still miss Aqua City south / Rainforest / Marine tip — fix footprints so they match `refs/op_map_whole.png`). Or rebuild islands procedurally. Either way, coastline must hug the official outline.

## Phone UX
- Portrait, thin top bar (Ocean Park | side | search), bottom dock: Whole park, Waterfront, Summit, Locate me.
- Pinch zoom; one-finger orbit with pitch locked ~50° 3/4; two-finger pan; no right-drag; no page scroll while dragging.
- Labels = HTML chips. Whole park: only Waterfront, Summit, Cable Car, Ocean Express. Zoomed: ≤8 nearby. Tap → bottom sheet.
- Fly-ins are short eased curves.

## GPS
- Per-island affine lat/lng → model x,z. Two transforms (waterfront / summit).
- Blue “you are here” claims a **zone** only when accuracy is rough / indoor.
- Debug panel: paste lat,lng → show projected x,z + which transform.
- Control points (WGS84) to fit against hand-placed model pins:
  - Grand Aquarium 22.243171, 114.173586
  - Giant Panda Adventure 22.245764, 114.176740
  - Sea Life Carousel 22.246446, 114.175951
  - Balloons 22.242032, 114.176388
  - Cable Car Waterfront 22.248486, 114.176473
  - Ocean Express Waterfront 22.244679, 114.175554
  - Hair Raiser 22.237291, 114.173540
  - Ferris Wheel 22.230162, 114.171187
  - Arctic Blast 22.239032, 114.173744
  - The Rapids 22.236253, 114.172683
  - Cable Car Summit 22.233526, 114.171304
  - Ocean Express Summit 22.238810, 114.172447

## Data
`public/pois.json` with id, name, side, zone, category, lat, lng, position. Include the POIs from the locked list (Grand Aquarium, Old Hong Kong, Sea Life Carousel, Sloth and Friends, Giant Panda / Croco Land, Whiskers rides, Hair Raiser, The Flash, Whirly Bird, Arctic Blast, South Pole Spectacular, The Rapids, Expedition Trail, Ferris, Ocean Park Tower, Crazy Galleon, Shark Mystique, Sea Jelly, cable + OE stations). Walk graph per island + special cable/OE edges.

## Tech budget
- Vite + TS + Three.js (WebGL). No WebGPU, no WASM required.
- Instancing for trees/blocks. Under ~40k tris. One soft shadow or baked contact. No SSAO/DoF/reflections.
- iOS Safari friendly. PWA optional.

## Done when
1. `npm install && npm run dev` serves a phone-sized map.
2. Two colorful islands read as Ocean Park (left Waterfront, right Summit peninsula, cable arc).
3. Tap Hair Raiser / search “panda” flies correctly.
4. Debug GPS near aquarium lands on Waterfront, not the gap/Summit.
5. README with run instructions.

Read `refs/LAYOUT_BRIEF_v4.md` and look at `refs/op_map_whole.png` + `refs/layout_v4_beauty.png` before modeling. Build the app now; do not stop at a plan.
