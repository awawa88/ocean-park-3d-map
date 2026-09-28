# Layout + look v4 — Andrew rejected layout_v3

Still does NOT read as the official map. Three remaining misses:

1. **Coastline still not accurate enough**
2. **Zones / landmarks still in the wrong spots**
3. **Looks like grey clay diorama, not the colorful illustrated map style**

Density city-blocks stay secondary. Fix silhouette + **illustrated-map look** first.

## Hard rule
- Original geometry + materials only.
- Do **NOT** bake / UV the official map image onto the islands for a shippable mesh (their IP).
- Official map may stay as a **hidden reference plane** for tracing only (as in v3).
- Optional: a temporary “align” scene layer that shows the ref plane for Andrew’s review screenshots is OK if labeled “reference only” and not in the export GLB materials.

## Look target (replace Tiny SF grey clay)
Match the **illustrated map language**, not Tiny SF pastel city:
- Bright zone path colors from the official legend (approximate, original mats):
  - Whiskers Harbour → warm orange / peach paths
  - Amazing Asian Animals → coral / red paths
  - Aqua City → cyan / light blue paths + lagoon water disk
  - Polar Adventure → icy white / pale blue
  - Thrill Mountain → yellow / gold
  - Rainforest → lush green
  - Marine World → pink / magenta / purple
- Land fill: soft park greens + pale path yellows (like the sheet), not grey clay slabs
- Water: bright map-teal, not dark slate
- Thick island edge: light stone / sandy wall so the diorama still reads in 3D
- Landmark toys oversized and colorful (aquarium wave-roof cue, panda pavilion, Hair Raiser orange loops, Ferris, Tower) — readable icons, not grey primitives
- Soft sun, matte, no PBR glass, no post

## Coastline accuracy
- Re-trace from `op_map_whole.png` AND `op_map_2026_hero.jpg`. Prefer the cleaner land mask; increase silhouette points if needed (~50–80 per island, still phone-safe).
- Waterfront must show **three clear lobes** + **circular Aqua City lagoon bite**.
- Summit must show **Polar hub + Thrill east + Rainforest south + narrow neck + long Marine World peninsula** with correct tip mass.
- Deliver `topdown_overlay` again; footprints should hug developed park land, not overshoot into ocean or undercut major lobes.

## Zone / landmark placement
Re-place empties by matching labels on `op_map_whole.png`:
| Empty | Spot on map |
|-------|-------------|
| poi_grand_aquarium | Aqua City, by lagoon / wave building |
| poi_giant_panda | Amazing Asian Animals mid-west lobe |
| poi_hair_raiser | Thrill Mountain coaster loops |
| poi_ferris_wheel | Marine World far tip |
| poi_cable_car_waterfront / _summit | ends of the long printed cable arc |
| poi_ocean_express_* | Aqua City ↔ hub near Polar/Rainforest |

Zone tints must sit under the correct label clusters, not floating as generic circles.

## Gap + cable (keep v3 intent, verify on overlay)
- Wide open water between Waterfront east and Summit west
- Cable = long arc over water to north Marine World / Summit cable station

## Deliverable
`/workspace/ocean-park-map/layout_v4/`
- GLB (no official map texture in materials)
- README
- Screens: phone 9:16, side_by_side, topdown_overlay, and one “beauty” three-quarter that shows the **colorful map look**
- Tris under 40k

## Success test
Someone who knows the official map should say “that’s Ocean Park’s map” from color + coastline alone, before reading labels — not “grey clay islands.”
