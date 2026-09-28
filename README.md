# Ocean Park Hong Kong — 3D park map

A 3D version of the park's interactive map (map.oceanpark.com.hk), built with Vite, TypeScript and Three.js. It runs on phones and desktops.

The layout follows the official sheet. The Waterfront is on the low shelf by the main gate: Whiskers Harbour in orange, Amazing Asian Animals in red, Aqua City in cream around the lagoon. The Summit is the raised headland over the bay: Polar Adventure in ice blue, Thrill Mountain in yellow, the Rainforest, and Marine World in pink out to the Ferris Wheel. Brick Hill's forest rises to the south. The cable car runs from Aqua City up over the hillside and along the bay to Marine World. The Ocean Express runs through the hill.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (use the network URL on a phone)
npm run check      # data checks: GPS fit, zones, paths, lagoon, walk graph
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve dist/
```

## Using it

- **Overview.** On a wide screen, the overview matches the printed map: Waterfront on the left, Summit on the right. On a tall phone screen it turns a quarter so the park fills the height. The Waterfront and main gate are at the bottom, the Summit at the top, and the bay on the left. The compass always points to true north. Tap it to go back to the default orientation.
- **Moving around (like Apple Maps).**
  - Touch: drag with one finger to pan, with momentum. Pinch to zoom around your fingers, and twist two fingers to rotate. Slide two fingers up or down together to tilt. Double-tap to zoom in, and tap with two fingers to zoom out. To zoom one-handed, double-tap, hold, and drag up or down.
  - Mouse and trackpad: drag to pan. Right-drag, or ⌥/⌃/⌘-drag, to rotate (sideways) and tilt (up/down). Scroll or pinch to zoom at the cursor, and scroll sideways on a trackpad to pan. Double-click zooms in (⇧ to zoom out). Safari trackpad pinch-rotate works too.
  - Keyboard: arrow keys pan, + and − zoom, ⇧←/⇧→ rotate, ⇧↑/⇧↓ tilt.
  - Buttons: **2D/3D** switches between a flat top-down plan and the tilted view. The compass shows north; tap it to restore the default orientation.
- **Labels.** From far out you see the two sides and the seven zone banners in their legend colours. Zoom in and attraction pins appear. Overlapping labels are hidden, not stacked.
- **Search and select.** Search, or tap a pin or banner. The camera flies in, a ring pulses under the place, and a sheet opens in the zone's colour. With a GPS fix, a route is drawn along the paths, using the cable car or Ocean Express where it needs to.
- **Locate me** uses GPS. A precise fix is a blue pin snapped to the nearest walk. A rough fix (worse than about 35 m) names the zone instead.
- **GPS** opens the debug panel: paste `22.243171, 114.173586` to test a coordinate. URL shortcuts: `?view=waterfront|summit`, `?poi=hair-raiser`, `?gps=lat,lng`, `?selftest=1`.

## Attractions and escalators

The interactive map's feed (`src/data/attractions.json`) lists 37 attractions. The park sheet's legend has more, so `src/data/legend.json` adds the rest, traced from the sheet's numbered markers and the park's own reference points:

- Talking Tree, Whiskers Theatre, Village Station, Whiskers Village Activity Centre, Explorer R
- Bamboo Zone, Gator Marsh, Panda Village, Mark's Mine
- Ocean Square, Conservation Kiosk, Aqua City Lagoon, Applause Pavilion, Waterfront Plaza, the Marine Life Stranding Centre
- Summit Plaza, Rainforest Why Zone, Veterinary Centre

It also carries the five escalators: Thrill Mountain, the Grand Aquarium, Water World, the bus interchange, and the hotel/car park. Every place has its legend code (A1…H12) and a short description.

The app draws 64 places in total. Escalators are covered, striped moving walkways with animated steps (`src/scene/escalators.ts`). To regenerate the POIs, zones, paths and walk graph after editing the legend, run `npm run sync-map`.

## Dev feedback tool (dev server only)

Tap the red **DEV** button under the map controls.

- **3D map** freezes the current view.
- **Official map** shows the park's real interactive map. The dev server downloads its tiles from map.oceanpark.com.hk and saves the stitched sheet to `refs/op_sheet_2678.png`. **Update map** fetches the latest version, and **3D pins** overlays our positions on it.
- Draw with ✏️, drop numbered pins with 📍, and pan or zoom with ✋ (or pinch or scroll). Add a note, then press **Save for Claude**.

Each save writes `feedback/<time>.png` and `feedback/<time>.json` and adds a line to `feedback/FEEDBACK.md`. The JSON records, for every mark, the model x,z, the sheet pixel, the nearest attractions, and the camera. The official map and the tool are never part of `npm run build`.

## How the scene is built

| Layer | Source |
|---|---|
| Coastline and terrain | `scripts/trace_sheet.py` traces coarse class masks (sea, plaza, forest, road) from the reference sheet in `refs/`. It writes `public/ground-a.png`, `public/ground-b.png` and a coast signed-distance grid, `src/generated/ground-grid.ts`. Height is authored in `src/terrain.ts`: a Waterfront shelf, a Summit plateau with sea cliffs, and the hillside and Brick Hill. |
| Ground paint | A terrain shader in `src/scene/ground.ts` thresholds the masks into crisp grass, forest floor, zone-tinted plazas, roads, cliffs and beach at any zoom. |
| Water | An animated sea shader: depth tint from the coast distance, shore foam, swell and glints. The Aqua City lagoon is separate. |
| Paths | Every footpath from the interactive map's `path_lines.json`, smoothed and draped as ribbons in each zone's path colour (`src/scene/paths.ts`). |
| Landmarks | Original toy models for all 41 attractions (`src/scene/landmarks.ts`). Rides animate: the Ferris Wheel, tower cabin, carousels, swings, galleon, coaster trains and rafts. Static parts are merged into one mesh per material. |
| Transport | Cable car with twin ropes, pylons and animated gondolas. Ocean Express portals and train (`src/scene/transport.ts`). |
| Trees and buildings | Instanced forest, lawn trees and palms, plus shops and kiosks on the plazas, placed from the masks and kept clear of paths and attractions (`src/scene/vegetation.ts`). |

Rendering uses soft shadows that follow the camera, a sky dome with fog, and a room-environment light for the models. If frames run slow, the pixel ratio drops automatically. A full frame takes about 1 ms on an M-series Mac.

The reference sheet (`refs/op_sheet_2678.png`) is used for layout tracing only. No official artwork, colours or textures are copied onto the model. Every mask channel is a binary class, and all ground colours and models are original.

To re-trace after editing the script:

```bash
python3 scripts/trace_sheet.py   # needs Pillow
```

## GPS

Each side has its own affine transform from WGS84 to model space, fitted to the survey pins in `public/pois.json`. The Grand Aquarium control point lands on the Waterfront, on a path, not in the bay or on the Summit.

## Data

- `public/pois.json`: id, name, side, zone, category, lat, lng, position, blurb
- `public/walk.json`: walk graph along the major paths, plus `cable` and `ocean-express` edges
- `src/generated/paths.ts`: the path polylines those nodes follow
