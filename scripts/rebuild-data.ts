import { readFileSync, writeFileSync } from "node:fs";
import { buildWalkGraph } from "../src/generated/paths";
import { fitAffine, fitSide } from "../src/geo";
import type { Affine } from "../src/geo";
import type { Poi, Side } from "../src/types";

/** Attractions on the official sheet that the first POI list left out. Positions sit on the new paths. */
const EXTRA: Poi[] = [
  { id: "toto-the-loco", name: "Toto the Loco", side: "waterfront", zone: "Whiskers Harbour", category: "ride", lat: 0, lng: 0, blurb: "Mini train through the kids' harbour.", position: [-18.2, -6.4] },
  { id: "castle-of-redd", name: "Castle of Redd", side: "waterfront", zone: "Whiskers Harbour", category: "ride", lat: 0, lng: 0, blurb: "Play castle on the orange Whiskers paths.", position: [-20.2, -5.4] },
  { id: "jungle-of-giants", name: "Jungle of Giants", side: "waterfront", zone: "Whiskers Harbour", category: "ride", lat: 0, lng: 0, blurb: "Rope-and-tree playground beside the harbour.", position: [-19.8, -3.6] },
  { id: "little-meerkat", name: "Little Meerkat and Giant Tortoise Adventure", side: "waterfront", zone: "Whiskers Harbour", category: "animal", lat: 0, lng: 0, blurb: "Meerkats and tortoises on the Whiskers paths.", position: [-17.3, -3.9] },
  { id: "whiskers-herbal-valley", name: "Whiskers Herbal Valley", side: "waterfront", zone: "Whiskers Harbour", category: "exhibit", lat: 0, lng: 0, blurb: "Herb garden at the south edge of Whiskers Harbour.", position: [-16.4, -3.8] },
  { id: "gator-marsh", name: "Gator Marsh", side: "waterfront", zone: "Amazing Asian Animals", category: "animal", lat: 0, lng: 0, blurb: "Chinese alligator marsh on the coral paths.", position: [-20.4, 0.4] },
  { id: "panda-village", name: "Panda Village", side: "waterfront", zone: "Amazing Asian Animals", category: "animal", lat: 0, lng: 0, blurb: "Otters and birds beside the panda pavilion.", position: [-18.2, 0.8] },
  { id: "eco-herbal-trail", name: "Eco-Herbal Trail", side: "waterfront", zone: "Amazing Asian Animals", category: "exhibit", lat: 0, lng: 0, blurb: "Shaded herbal walk through Amazing Asian Animals.", position: [-17.4, 1.4] },
  { id: "dive-into-local-diversity", name: "Dive Into Local Diversity", side: "waterfront", zone: "Amazing Asian Animals", category: "exhibit", lat: 0, lng: 0, blurb: "Hong Kong freshwater life, west of the panda pavilion.", position: [-20.8, -1.5] },
  { id: "sichuan-treasures", name: "Hong Kong Jockey Club Sichuan Treasures", side: "waterfront", zone: "Aqua City", category: "animal", lat: 0, lng: 0, blurb: "Sichuan pandas and snub-nosed monkeys near Old Hong Kong.", position: [-17.4, 4.6] },
  { id: "north-pole-encounter", name: "North Pole Encounter", side: "summit", zone: "Polar Adventure", category: "animal", lat: 0, lng: 0, blurb: "Walrus and seal habitat in the icy hub.", position: [8.2, 0.8] },
  { id: "rev-booster", name: "Rev Booster", side: "summit", zone: "Thrill Mountain", category: "ride", lat: 0, lng: 0, blurb: "Spinning ride on the yellow thrill plaza.", position: [12.2, -4.2] },
  { id: "bumper-blaster", name: "Bumper Blaster", side: "summit", zone: "Thrill Mountain", category: "ride", lat: 0, lng: 0, blurb: "Bumper cars beside the coaster loops.", position: [13.4, -3.2] },
  { id: "reptile-territory", name: "Reptile Territory", side: "summit", zone: "Rainforest", category: "animal", lat: 0, lng: 0, blurb: "Reptile house on the rainforest loop.", position: [12.6, 6.3] },
  { id: "flying-swing", name: "Flying Swing", side: "summit", zone: "Marine World", category: "ride", lat: 0, lng: 0, blurb: "Swing ride on the pink Marine World paths.", position: [19.2, -1.2] },
  { id: "wild-twister", name: "Wild Twister", side: "summit", zone: "Marine World", category: "ride", lat: 0, lng: 0, blurb: "Spinning arms near the Ocean Park Tower.", position: [20.8, -2.6] },
  { id: "pacific-pier", name: "Pacific Pier", side: "summit", zone: "Marine World", category: "animal", lat: 0, lng: 0, blurb: "Seals and sea lions along the peninsula.", position: [18.2, 0.2] },
  { id: "dolphin-explorations", name: "Dolphin Explorations", side: "summit", zone: "Marine World", category: "animal", lat: 0, lng: 0, blurb: "Dolphin and sea lion encounter on the peninsula.", position: [16.8, -0.6] },
  { id: "talking-tree", name: "Talking Tree", side: "waterfront", zone: "Whiskers Harbour", category: "exhibit", lat: 0, lng: 0, blurb: "A talking tree on the Whiskers paths.", position: [-15.2, -6.0] },
  { id: "explorer-r", name: "Explorer R", side: "waterfront", zone: "Whiskers Harbour", category: "ride", lat: 0, lng: 0, blurb: "A small explorer ride in Whiskers Harbour.", position: [-18.7, -5.6] },
  { id: "village-station", name: "Village Station", side: "waterfront", zone: "Whiskers Harbour", category: "exhibit", lat: 0, lng: 0, blurb: "Village station on the west Whiskers paths.", position: [-20.4, -4.6] },
  { id: "whiskers-village", name: "Whiskers Village Activity Centre", side: "waterfront", zone: "Whiskers Harbour", category: "exhibit", lat: 0, lng: 0, blurb: "Activity centre beside the Whiskers playgrounds.", position: [-18.2, -3.9] },
  { id: "bamboo-zone", name: "Bamboo Zone", side: "waterfront", zone: "Amazing Asian Animals", category: "animal", lat: 0, lng: 0, blurb: "Bamboo habitat on the coral paths.", position: [-18.0, -2.2] },
  { id: "marks-mine", name: "Mark's Mine", side: "waterfront", zone: "Amazing Asian Animals", category: "exhibit", lat: 0, lng: 0, blurb: "A mine-themed play spot in Amazing Asian Animals.", position: [-20.2, 0.9] },
  { id: "club-panda", name: "Club Panda", side: "waterfront", zone: "Amazing Asian Animals", category: "exhibit", lat: 0, lng: 0, blurb: "Panda club beside the pavilion.", position: [-18.0, 0.5] },
  { id: "ocean-square", name: "Ocean Square", side: "waterfront", zone: "Aqua City", category: "exhibit", lat: 0, lng: 0, blurb: "The plaza where Aqua City meets the Ocean Express.", position: [-16.2, 2.3] },
  { id: "conservation-kiosk", name: "Conservation Kiosk", side: "waterfront", zone: "Aqua City", category: "exhibit", lat: 0, lng: 0, blurb: "Conservation kiosk on the Aqua City ring.", position: [-18.4, 4.6] },
  { id: "aqua-city-lagoon", name: "Aqua City Lagoon", side: "waterfront", zone: "Aqua City", category: "exhibit", lat: 0, lng: 0, blurb: "The circular lagoon in Aqua City.", position: [-14.7, 4.6] },
  { id: "applause-pavilion", name: "Applause Pavilion", side: "waterfront", zone: "Aqua City", category: "show", lat: 0, lng: 0, blurb: "Show pavilion on the west side of Aqua City.", position: [-19.0, 5.6] },
  { id: "waterfront-plaza", name: "Waterfront Plaza", side: "waterfront", zone: "Aqua City", category: "exhibit", lat: 0, lng: 0, blurb: "Main plaza of Aqua City.", position: [-17.2, 3.6] },
  { id: "marine-life-stranding", name: "Hong Kong Marine Life Stranding and Education Centre", side: "waterfront", zone: "Aqua City", category: "exhibit", lat: 0, lng: 0, blurb: "Guided-tour centre on the south Aqua City paths.", position: [-16.0, 6.3] },
  { id: "arctic-fox-den", name: "Arctic Fox Den", side: "summit", zone: "Polar Adventure", category: "animal", lat: 0, lng: 0, blurb: "Arctic fox habitat in the polar hub.", position: [8.0, 1.7] },
  { id: "summit-plaza", name: "Summit Plaza", side: "summit", zone: "Rainforest", category: "exhibit", lat: 0, lng: 0, blurb: "Plaza where the rainforest meets the Ocean Express.", position: [11.0, 3.7] },
  { id: "rainforest-why-zone", name: "Rainforest Why Zone", side: "summit", zone: "Rainforest", category: "exhibit", lat: 0, lng: 0, blurb: "Hands-on rainforest zone beside the rapids.", position: [11.0, 4.6] },
  { id: "veterinary-centre", name: "Veterinary Centre", side: "summit", zone: "Marine World", category: "exhibit", lat: 0, lng: 0, blurb: "Veterinary centre on the Marine World paths.", position: [21.0, -1.4] },
  { id: "marine-mammal-centre", name: "Marine Mammal Breeding and Research Centre", side: "summit", zone: "Marine World", category: "animal", lat: 0, lng: 0, blurb: "Marine mammal centre beside the peninsula paths.", position: [17.8, -2.5] },
];

/** Directory numbers from the park sheet. The sheet also lists A12, B7, B8 and D4. */
const CODE: Record<string, string> = {
  "talking-tree": "A1",
  "toto-the-loco": "A2",
  "whiskers-theatre": "A3",
  "merry-go-round": "A4",
  "little-meerkat": "A5",
  "castle-of-redd": "A6",
  balloons: "A7",
  "jungle-of-giants": "A8",
  "explorer-r": "A9",
  "village-station": "A10",
  "whiskers-village": "A11",
  "whiskers-herbal-valley": "A12",
  "bamboo-zone": "B1",
  "gator-marsh": "B2",
  "giant-panda-adventure": "B3",
  "panda-village": "B4",
  "dive-into-local-diversity": "B5",
  "marks-mine": "B6",
  "eco-herbal-trail": "B7",
  "club-panda": "B8",
  "ocean-square": "C1",
  "croco-land": "C2",
  "conservation-kiosk": "C3",
  "aqua-city-lagoon": "C4",
  "grand-aquarium": "C5",
  "sichuan-treasures": "C6",
  "applause-pavilion": "C7",
  "ocean-express-waterfront": "C8",
  "waterfront-plaza": "C9",
  "old-hong-kong": "C10",
  "sea-life-carousel": "C11",
  "sloth-and-friends": "C12",
  "cable-car-waterfront": "C13",
  "marine-life-stranding": "C14",
  "arctic-blast": "D1",
  "south-pole-spectacular": "D2",
  "arctic-fox-den": "D3",
  "north-pole-encounter": "D4",
  "ocean-express-summit": "E1",
  "summit-plaza": "E2",
  "rainforest-why-zone": "E3",
  "expedition-trail": "E4",
  "the-rapids": "E5",
  "the-flash": "F1",
  "whirly-bird": "F2",
  "rev-booster": "F3",
  "bumper-blaster": "F4",
  "hair-raiser": "F5",
  "cable-car-summit": "H1",
  "sea-jelly-spectacular": "H2",
  "shark-mystique": "H3",
  "dolphin-explorations": "H4",
  "ocean-park-tower": "H5",
  "pacific-pier": "H6",
  "flying-swing": "H7",
  "ferris-wheel": "H8",
  "crazy-galleon": "H9",
  "wild-twister": "H10",
  "veterinary-centre": "H11",
  "marine-mammal-centre": "H12",
};

function inverse(aff: Affine, x: number, z: number): { lat: number; lng: number } {
  const det = aff.a * aff.e - aff.b * aff.d;
  const rhsx = x - aff.c;
  const rhsz = z - aff.f;
  const la = (aff.e * rhsx - aff.b * rhsz) / det;
  const ln = (-aff.d * rhsx + aff.a * rhsz) / det;
  return { lat: la + aff.lat0, lng: ln + aff.lng0 };
}

const pois = JSON.parse(readFileSync(new URL("../public/pois.json", import.meta.url), "utf8")) as Poi[];
const extraIds = new Set(EXTRA.map((p) => p.id));
const kept = pois.filter((p) => !extraIds.has(p.id));

// Directory zones. These two survey pins were sitting in the other Waterfront lobe.
const balloons = kept.find((p) => p.id === "balloons");
const carousel = kept.find((p) => p.id === "sea-life-carousel");
if (!balloons || !carousel) throw new Error("missing balloons or carousel");
balloons.zone = "Whiskers Harbour";
balloons.position = [-16.6, -5.6];
carousel.zone = "Aqua City";
carousel.position = [-15.8, 5.5];
const oeSummit = kept.find((p) => p.id === "ocean-express-summit");
if (!oeSummit) throw new Error("missing ocean express summit");
oeSummit.zone = "Rainforest";
oeSummit.position = [9.9, 3.65];

const anchorIds = ["grand-aquarium", "giant-panda-adventure", "cable-car-waterfront", "ocean-express-waterfront"];
const wfAnchor = fitAffine(
  "waterfront",
  anchorIds.map((id) => {
    const p = kept.find((q) => q.id === id);
    if (!p) throw new Error(`missing ${id}`);
    return { lat: p.lat, lng: p.lng, x: p.position[0], z: p.position[1] };
  }),
);
for (const p of [balloons, carousel]) {
  const g = inverse(wfAnchor, p.position[0], p.position[1]);
  p.lat = Math.round(g.lat * 1e6) / 1e6;
  p.lng = Math.round(g.lng * 1e6) / 1e6;
}
const smAnchorIds = ["hair-raiser", "ferris-wheel", "arctic-blast", "the-rapids", "cable-car-summit"];
const smAnchor = fitAffine(
  "summit",
  smAnchorIds.map((id) => {
    const p = kept.find((q) => q.id === id);
    if (!p) throw new Error(`missing ${id}`);
    return { lat: p.lat, lng: p.lng, x: p.position[0], z: p.position[1] };
  }),
);
{
  const g = inverse(smAnchor, oeSummit.position[0], oeSummit.position[1]);
  oeSummit.lat = Math.round(g.lat * 1e6) / 1e6;
  oeSummit.lng = Math.round(g.lng * 1e6) / 1e6;
}

const affines = {
  waterfront: fitSide("waterfront", kept),
  summit: fitSide("summit", kept),
} as Record<Side, Affine>;

for (const p of EXTRA) {
  const g = inverse(affines[p.side], p.position[0], p.position[1]);
  p.lat = Math.round(g.lat * 1e6) / 1e6;
  p.lng = Math.round(g.lng * 1e6) / 1e6;
}

const merged = [...kept, ...EXTRA];
for (const p of merged) {
  const code = CODE[p.id];
  if (!code) continue;
  const bare = p.name.replace(/^[A-H]\d{1,2}\s+/, "");
  p.name = `${code} ${bare}`;
}
const walk = buildWalkGraph(merged);
const root = new URL("../public/", import.meta.url);
writeFileSync(new URL("pois.json", root), JSON.stringify(merged, null, 2) + "\n");
writeFileSync(new URL("walk.json", root), JSON.stringify(walk, null, 2) + "\n");
console.log(`pois ${merged.length}  walk nodes ${walk.nodes.length}  edges ${walk.edges.length}`);
