import { readFileSync, writeFileSync } from "node:fs";
import { SIDE_PX, toModel, usablePath } from "../src/layout";
import type { Poi, Side } from "../src/types";

type Pin = { name: string; x: number; y: number; api_key: string; region?: string };
type Ref = { latitude: number; longitude: number; pixelX: number; pixelY: number };

const root = new URL("../", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(`src/data/${name}`, root), "utf8"));
const attractions = read("attractions.json") as Pin[];
const transport = read("transportations.json") as Pin[];
const pathLines = (read("path_lines.json") as number[][][]).filter(usablePath);
const refs = read("reference_points.json") as Ref[];
type LegendPin = { id: string; name: string; zone: string; category: Poi["category"]; x: number; y: number };
type Escalator = { id: string; name: string; zone: string; points: [number, number][] };
const legend = read("legend.json") as {
  attractions: LegendPin[];
  escalators: Escalator[];
  codes: Record<string, string>;
  blurbs: Record<string, string>;
  overrides?: Record<string, [number, number] | string>;
};

const ZONE: Record<string, string> = {
  hair_raiser: "Thrill Mountain",
  arctic_blast: "Polar Adventure",
  bumper_blaster: "Thrill Mountain",
  castleofredd: "Whiskers Harbour",
  crazy_galleon: "Marine World",
  ecoherbaltrail: "Amazing Asian Animals",
  ferris_wheel: "Marine World",
  flying_swing: "Marine World",
  jungleofgiants: "Whiskers Harbour",
  toto_the_loco: "Whiskers Harbour",
  mgr: "Whiskers Harbour",
  balloon: "Whiskers Harbour",
  old_hong_kong: "Aqua City",
  slc: "Aqua City",
  rapids: "Rainforest",
  flash: "Thrill Mountain",
  whirly_bird: "Thrill Mountain",
  rev_booster: "Thrill Mountain",
  ocean_park_tower: "Marine World",
  wildtwister: "Marine World",
  whiskersherb: "Whiskers Harbour",
  gpa: "Amazing Asian Animals",
  hkjcst: "Aqua City",
  de: "Marine World",
  mmbrc: "Marine World",
  pacific_pier: "Marine World",
  meerkat: "Whiskers Harbour",
  dld: "Amazing Asian Animals",
  sloth: "Aqua City",
  south_pole: "Polar Adventure",
  north_pole: "Polar Adventure",
  sea_jelly: "Marine World",
  shark_mystique: "Marine World",
  expedition_trail: "Rainforest",
  crocoland: "Aqua City",
  grand_aquarium: "Aqua City",
  reptile: "Rainforest",
  oe_up: "Aqua City",
  oe_down: "Rainforest",
  cable_car_up: "Whiskers Harbour",
  cable_car_down: "Marine World",
};

const ID: Record<string, string> = {
  hair_raiser: "hair-raiser",
  arctic_blast: "arctic-blast",
  bumper_blaster: "bumper-blaster",
  castleofredd: "castle-of-redd",
  crazy_galleon: "crazy-galleon",
  ecoherbaltrail: "eco-herbal-trail",
  ferris_wheel: "ferris-wheel",
  flying_swing: "flying-swing",
  jungleofgiants: "jungle-of-giants",
  toto_the_loco: "toto-the-loco",
  mgr: "merry-go-round",
  balloon: "balloons",
  old_hong_kong: "old-hong-kong",
  slc: "sea-life-carousel",
  rapids: "the-rapids",
  flash: "the-flash",
  whirly_bird: "whirly-bird",
  rev_booster: "rev-booster",
  ocean_park_tower: "ocean-park-tower",
  wildtwister: "wild-twister",
  whiskersherb: "whiskers-herbal-valley",
  gpa: "giant-panda-adventure",
  hkjcst: "sichuan-treasures",
  de: "dolphin-explorations",
  mmbrc: "marine-mammal-centre",
  pacific_pier: "pacific-pier",
  meerkat: "little-meerkat",
  dld: "dive-into-local-diversity",
  sloth: "sloth-and-friends",
  south_pole: "south-pole-spectacular",
  north_pole: "north-pole-encounter",
  sea_jelly: "sea-jelly-spectacular",
  shark_mystique: "shark-mystique",
  expedition_trail: "expedition-trail",
  crocoland: "croco-land",
  grand_aquarium: "grand-aquarium",
  reptile: "reptile-territory",
  oe_up: "ocean-express-waterfront",
  oe_down: "ocean-express-summit",
  cable_car_up: "cable-car-waterfront",
  cable_car_down: "cable-car-summit",
};

const RIDES = new Set([
  "hair_raiser", "arctic_blast", "bumper_blaster", "crazy_galleon", "ferris_wheel", "flying_swing",
  "jungleofgiants", "toto_the_loco", "mgr", "balloon", "slc", "rapids", "flash", "whirly_bird",
  "rev_booster", "wildtwister", "castleofredd",
]);
const ANIMALS = new Set([
  "gpa", "hkjcst", "de", "mmbrc", "pacific_pier", "meerkat", "dld", "sloth", "south_pole",
  "north_pole", "sea_jelly", "shark_mystique", "reptile", "crocoland", "grand_aquarium",
]);

function category(key: string, kind: "attraction" | "transport"): Poi["category"] {
  if (kind === "transport") return "transport";
  if (RIDES.has(key)) return "ride";
  if (ANIMALS.has(key)) return "animal";
  return "exhibit";
}

function latLngAt(px: number, py: number): { lat: number; lng: number } {
  const scored = refs
    .map((r) => ({ r, d2: (r.pixelX - px) ** 2 + (r.pixelY - py) ** 2 }))
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, 8);
  if (scored[0].d2 < 4) return { lat: scored[0].r.latitude, lng: scored[0].r.longitude };
  let wsum = 0;
  let lat = 0;
  let lng = 0;
  for (const s of scored) {
    const w = 1 / Math.max(4, s.d2);
    wsum += w;
    lat += w * s.r.latitude;
    lng += w * s.r.longitude;
  }
  return { lat: lat / wsum, lng: lng / wsum };
}

const SUMMIT_ZONES = ["Polar Adventure", "Thrill Mountain", "Rainforest", "Marine World"];
const sideOf = (zone: string): Side => (SUMMIT_ZONES.includes(zone) ? "summit" : "waterfront");

const makePin = (id: string, name: string, zone: string, cat: Poi["category"], x: number, y: number, sourceKey?: string): Poi => {
  const ll = latLngAt(x, y);
  const poi: Poi = {
    id,
    name,
    side: sideOf(zone),
    zone,
    category: cat,
    lat: Math.round(ll.lat * 1e6) / 1e6,
    lng: Math.round(ll.lng * 1e6) / 1e6,
    blurb: legend.blurbs[id] ?? `${zone}.`,
    position: toModel(x, y),
  };
  if (legend.codes[id]) poi.code = legend.codes[id];
  if (sourceKey) poi.sourceKey = sourceKey;
  return poi;
};

const pins: Poi[] = [
  ...[...attractions.map((a) => ({ ...a, kind: "attraction" as const })), ...transport.map((a) => ({ ...a, kind: "transport" as const }))].map(
    (a) => {
      const id = ID[a.api_key];
      const zone = ZONE[a.api_key];
      if (!id || !zone) throw new Error(`unmapped ${a.api_key}`);
      const moved = legend.overrides?.[id];
      const [x, y] = Array.isArray(moved) ? moved : [a.x, a.y];
      return makePin(id, a.name, zone, category(a.api_key, a.kind), x, y, a.api_key);
    },
  ),
  // Legend attractions the interactive map's feed leaves out.
  ...legend.attractions.map((a) => makePin(a.id, a.name, a.zone, a.category, a.x, a.y)),
  // Escalators: one pin at the middle of each run.
  ...legend.escalators.map((e) => {
    const [x, y] = e.points[Math.floor(e.points.length / 2)];
    return makePin(e.id, e.name, e.zone, "transport", x, y);
  }),
];
const ids = new Set<string>();
for (const p of pins) {
  if (ids.has(p.id)) throw new Error(`duplicate poi ${p.id}`);
  ids.add(p.id);
}

// --- land mask from every official road, every pin, and the hillside waist ---
const CELL = 10;
const GW = Math.ceil(2678 / CELL);
const GH = Math.ceil(2190 / CELL);
const mask = new Uint8Array(GW * GH);
const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < GW && y < GH ? y * GW + x : -1);
const stamp = (px: number, py: number, rad: number) => {
  const cx = px / CELL;
  const cy = py / CELL;
  const r = rad / CELL;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(GW - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(GH - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) mask[y * GW + x] = 1;
    }
  }
};
const stampSeg = (ax: number, ay: number, bx: number, by: number, rad: number) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL * 0.6)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stamp(ax + (bx - ax) * t, ay + (by - ay) * t, rad);
  }
};
for (const line of pathLines) {
  for (let i = 1; i < line.length; i++) stampSeg(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1], 58);
}
for (const p of pins) stamp(p.position[0] / 0.016 + 1339, p.position[1] / 0.016 + 1095, 46);
// Hillside between the two path networks, including Brick Hill's crest.
// The crest projects to about pixel (900, 670) on this sheet. North of y=560 stays the bay.
for (let py = 560; py <= 1100; py += 8) {
  for (let px = 720; px <= 1400; px += 8) {
    const nx = (px - 1020) / 320;
    const ny = (py - 800) / 280;
    if (nx * nx + ny * ny <= 1) stamp(px, py, 14);
  }
}
// Dilate one cell so the outline does not nick a road.
const grown = mask.slice();
for (let y = 1; y < GH - 1; y++) {
  for (let x = 1; x < GW - 1; x++) {
    if (mask[y * GW + x]) continue;
    if (mask[y * GW + x - 1] || mask[y * GW + x + 1] || mask[(y - 1) * GW + x] || mask[(y + 1) * GW + x]) grown[y * GW + x] = 1;
  }
}
mask.set(grown);

function trace(which: (x: number, y: number) => boolean): [number, number][] {
  const segs = new Map<string, [number, number][]>();
  const key = (x: number, y: number) => `${x},${y}`;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = segs.get(k);
    if (list) list.push([x1, y1]);
    else segs.set(k, [[x1, y1]]);
  };
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const on = which(x, y);
      if (!on) continue;
      const left = x === 0 || !which(x - 1, y);
      const right = x === GW - 1 || !which(x + 1, y);
      const up = y === 0 || !which(x, y - 1);
      const down = y === GH - 1 || !which(x, y + 1);
      if (up) add(x, y, x + 1, y);
      if (right) add(x + 1, y, x + 1, y + 1);
      if (down) add(x + 1, y + 1, x, y + 1);
      if (left) add(x, y + 1, x, y);
    }
  }
  let best: [number, number][] = [];
  let bestA = 0;
  for (const [start, nexts] of segs) {
    if (nexts.length === 0) continue;
    const loop: [number, number][] = [];
    let cur = start;
    const guard = segs.size + 5;
    for (let n = 0; n < guard; n++) {
      const [sx, sy] = cur.split(",").map(Number);
      loop.push([sx, sy]);
      const opts = segs.get(cur);
      if (!opts || opts.length === 0) break;
      const nxt = opts.pop()!;
      cur = key(nxt[0], nxt[1]);
      if (cur === start) break;
    }
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    area = Math.abs(area);
    if (area > bestA) {
      bestA = area;
      best = loop;
    }
  }
  return best;
}

function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 4) return pts;
  const open = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts;
  const keep = new Array(open.length).fill(false);
  keep[0] = keep[open.length - 1] = true;
  const stack: [number, number][] = [[0, open.length - 1]];
  const dist = (a: [number, number], b: [number, number], p: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1e-8;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
  };
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let far = 0;
    let atI = -1;
    for (let k = i + 1; k < j; k++) {
      const d = dist(open[i], open[j], open[k]);
      if (d > far) {
        far = d;
        atI = k;
      }
    }
    if (atI >= 0 && far > eps) {
      keep[atI] = true;
      stack.push([i, atI], [atI, j]);
    }
  }
  return open.filter((_, i) => keep[i]);
}

function toRing(cells: [number, number][]): [number, number][] {
  const mid = simplify(cells, 1.35).map(([cx, cy]) => {
    const px = cx * CELL;
    const py = cy * CELL;
    return toModel(px, py);
  });
  return mid.map(([x, z]) => [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000]);
}

const full = toRing(trace((_x, _y) => true && mask[_y * GW + _x] === 1));
const left = toRing(trace((x, y) => mask[y * GW + x] === 1 && (x + 0.5) * CELL < SIDE_PX));
const right = toRing(trace((x, y) => mask[y * GW + x] === 1 && (x + 0.5) * CELL >= SIDE_PX));
if (full.length < 20 || left.length < 12 || right.length < 12) {
  throw new Error(`coast too small full ${full.length} left ${left.length} right ${right.length}`);
}

const fmt = (ring: [number, number][]) => ring.map(([x, z]) => `    [${x}, ${z}],`).join("\n");
const coast = `// Generated from the interactive map roads and pins. Do not edit by hand.
// Run: npx vite-node scripts/build-layout.ts

export type Ring = [number, number][];

export const ISLANDS: Record<"waterfront" | "summit", Ring> = {
  waterfront: [
${fmt(left)}
  ],
  summit: [
${fmt(right)}
  ],
};

export const LAND: Ring = [
${fmt(full)}
];

/** No separate lagoon hole. The Aqua City water sits in the traced coast. */
export const LAGOON = { x: 0, z: 0, r: 0 };

export const HILL: Ring = [];

export const MAP_SCALE = 0.016;
`;
writeFileSync(new URL("src/generated/coast.ts", root), coast);

const seeds = pins.map((p) => `  { x: ${p.position[0]}, z: ${p.position[1]}, zone: ${JSON.stringify(p.zone)}, side: ${JSON.stringify(p.side)} },`);
writeFileSync(
  new URL("src/generated/zones.ts", root),
  `// Generated zone seeds. One per interactive-map pin.\nimport type { Side } from "../types";\nexport const ZONE_SEEDS: { x: number; z: number; zone: string; side: Side }[] = [\n${seeds.join("\n")}\n];\n`,
);

const refLines = refs.map((r) => {
  const [x, z] = toModel(r.pixelX, r.pixelY);
  return `  [${r.latitude}, ${r.longitude}, ${Math.round(x * 1000) / 1000}, ${Math.round(z * 1000) / 1000}],`;
});
writeFileSync(
  new URL("src/generated/refs.ts", root),
  `// Reference pins from the interactive map, in model x,z.\nexport const REFS: [number, number, number, number][] = [\n${refLines.join("\n")}\n];\n`,
);

function projectGps(lat: number, lng: number): [number, number] {
  const cos = Math.cos((lat * Math.PI) / 180);
  const scored = refs
    .map((r) => {
      const [x, z] = toModel(r.pixelX, r.pixelY);
      const dlat = (r.latitude - lat) * 111_320;
      const dlng = (r.longitude - lng) * 111_320 * cos;
      return { x, z, d2: dlat * dlat + dlng * dlng };
    })
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, 8);
  if (scored[0].d2 < 4) return [scored[0].x, scored[0].z];
  let wsum = 0;
  let x = 0;
  let z = 0;
  for (const s of scored) {
    const w = 1 / Math.max(4, s.d2);
    wsum += w;
    x += w * s.x;
    z += w * s.z;
  }
  return [x / wsum, z / wsum];
}

function inRing(x: number, z: number, ring: [number, number][]): boolean {
  let n = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi) n++;
  }
  return n % 2 === 1;
}

type RoadPiece = { name: string; points: [number, number][] };
const googleRoads = JSON.parse(readFileSync(new URL("src/data/major-roads.json", root), "utf8")) as RoadPiece[];
const slug: Record<string, string> = {
  "Ocean Park Road": "ocean-park-road",
  "Nam Long Shan Road": "nam-long-shan-road",
  "Wong Chuk Hang Road": "wong-chuk-hang-road",
  "Police School Road": "police-school-road",
};
const googleLines: string[] = [];
const googleCount: Record<string, number> = {};
for (const road of googleRoads) {
  const projected = road.points.map(([lat, lng]) => projectGps(lat, lng));
  let run: [number, number][] = [];
  const flush = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const id = slug[road.name];
    const n = googleCount[id] ?? 0;
    googleCount[id] = n + 1;
    const mid = run[Math.floor(run.length / 2)];
    let zone = "Aqua City";
    let bestD = Infinity;
    for (const p of pins) {
      const d = Math.hypot(p.position[0] - mid[0], p.position[1] - mid[1]);
      if (d < bestD) {
        bestD = d;
        zone = p.zone;
      }
    }
    const side: Side = ["Polar Adventure", "Thrill Mountain", "Rainforest", "Marine World"].includes(zone) ? "summit" : "waterfront";
    const rounded = run.map(([x, z]) => `[${Math.round(x * 1000) / 1000}, ${Math.round(z * 1000) / 1000}]`);
    googleLines.push(
      `  { id: "gpr-${id}-${n}", side: "${side}", zone: ${JSON.stringify(zone)}, draw: "road", points: [${rounded.join(", ")}] },`,
    );
    run = [];
  };
  for (const [x, z] of projected) {
    if (inRing(x, z, full)) run.push([x, z]);
    else flush();
  }
  flush();
}

const major = pathLines.map((line, i) => {
  const pts = line.map(([px, py]) => toModel(px, py));
  const mid = pts[Math.floor(pts.length / 2)];
  let zone = "Aqua City";
  let bestD = Infinity;
  for (const p of pins) {
    const d = Math.hypot(p.position[0] - mid[0], p.position[1] - mid[1]);
    if (d < bestD) {
      bestD = d;
      zone = p.zone;
    }
  }
  const side: Side = ["Polar Adventure", "Thrill Mountain", "Rainforest", "Marine World"].includes(zone) ? "summit" : "waterfront";
  const rounded = pts.map(([x, z]) => `[${Math.round(x * 1000) / 1000}, ${Math.round(z * 1000) / 1000}]`);
  return `  { id: "road-${i}", side: "${side}", zone: ${JSON.stringify(zone)}, draw: "walk", points: [${rounded.join(", ")}] },`;
});

const pathsFile = `// Generated from the interactive map's path_lines.json. Do not edit by hand.
import type { Poi, Side, WalkEdge, WalkGraph, WalkNode } from "../types";

export type PathDraw = "walk" | "artery" | "road";
export type MajorPath = {
  id: string;
  side: Side;
  zone: string;
  draw: PathDraw;
  points: [number, number][];
};

export const MAJOR_PATHS: MajorPath[] = [
${major.join("\n")}
${googleLines.join("\n")}
];

const MERGE = 0.12;
const POI_ATTACH = 0.35;

export function buildWalkGraph(pois: Pick<Poi, "id" | "side" | "position">[]): WalkGraph {
  const nodes: WalkNode[] = [];
  const edges: WalkEdge[] = [];
  const taken = new Set<string>();

  const nearest = (side: Side, x: number, z: number, max: number): WalkNode | null => {
    let best: WalkNode | null = null;
    let bestD = max;
    for (const n of nodes) {
      if (n.side !== side) continue;
      const d = Math.hypot(n.position[0] - x, n.position[1] - z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  };

  const take = (side: Side, x: number, z: number): WalkNode => {
    const hit = nearest(side, x, z, MERGE);
    if (hit) return hit;
    const poi = pois.find((p) => p.side === side && !taken.has(p.id) && Math.hypot(p.position[0] - x, p.position[1] - z) < POI_ATTACH);
    const node: WalkNode = poi
      ? { id: poi.id, side, position: [poi.position[0], poi.position[1]], poi: poi.id }
      : { id: \`\${side}-\${nodes.length}\`, side, position: [x, z] };
    if (poi) taken.add(poi.id);
    nodes.push(node);
    return node;
  };

  const seen = new Set<string>();
  const link = (a: WalkNode, b: WalkNode, pace?: number) => {
    if (a.id === b.id || a.side !== b.side) return;
    const key = a.id < b.id ? \`\${a.id}|\${b.id}\` : \`\${b.id}|\${a.id}\`;
    if (seen.has(key)) return;
    seen.add(key);
    const edge: WalkEdge = { a: a.id, b: b.id, kind: "walk" };
    if (pace) edge.pace = pace;
    edges.push(edge);
  };

  for (const path of MAJOR_PATHS) {
    let prev: WalkNode | null = null;
    for (const [x, z] of path.points) {
      const node = take(path.side, x, z);
      if (prev) link(prev, node, path.draw === "road" ? 1.8 : undefined);
      prev = node;
    }
  }

  for (const poi of pois) {
    if (taken.has(poi.id)) continue;
    const host = nearest(poi.side, poi.position[0], poi.position[1], 2.4);
    const node: WalkNode = { id: poi.id, side: poi.side, position: [poi.position[0], poi.position[1]], poi: poi.id };
    nodes.push(node);
    taken.add(poi.id);
    if (host) link(host, node);
  }

  const idOf = (poiId: string) => nodes.find((n) => n.poi === poiId)?.id;
  const cableA = idOf("cable-car-waterfront");
  const cableB = idOf("cable-car-summit");
  const oeA = idOf("ocean-express-waterfront");
  const oeB = idOf("ocean-express-summit");
  if (cableA && cableB) edges.push({ a: cableA, b: cableB, kind: "cable" });
  if (oeA && oeB) edges.push({ a: oeA, b: oeB, kind: "ocean-express" });
  return { nodes, edges };
}
`;
writeFileSync(new URL("src/generated/paths.ts", root), pathsFile);

const escLines = legend.escalators.map((e) => {
  const pts = e.points.map(([x, y]) => toModel(x, y).map((v) => Math.round(v * 1000) / 1000));
  return `  { id: ${JSON.stringify(e.id)}, name: ${JSON.stringify(e.name)}, points: ${JSON.stringify(pts)} },`;
});
writeFileSync(
  new URL("src/generated/escalators.ts", root),
  `// Escalators from the park sheet (src/data/legend.json), in model x,z.\nexport type EscalatorRun = { id: string; name: string; points: [number, number][] };\nexport const ESCALATORS: EscalatorRun[] = [\n${escLines.join("\n")}\n];\n`,
);

const { buildWalkGraph } = await import("../src/generated/paths.ts");
const walk = buildWalkGraph(pins);
writeFileSync(new URL("public/pois.json", root), JSON.stringify(pins, null, 2) + "\n");
writeFileSync(new URL("public/walk.json", root), JSON.stringify(walk, null, 2) + "\n");
console.log(`pins ${pins.length}  park roads ${pathLines.length}  google road pieces ${googleLines.length}  coast ${full.length}  walk nodes ${walk.nodes.length} edges ${walk.edges.length}`);
console.log("google roads", googleCount);
