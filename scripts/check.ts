import { readFileSync } from "node:fs";
import { ISLANDS } from "../src/generated/coast";
import { MAJOR_PATHS, buildWalkGraph } from "../src/generated/paths";
import { chooseProjection, fitSide, pointInRing, projectGps, zoneAt } from "../src/geo";
import { toModel, usablePath } from "../src/layout";
import { nearestWalkPoint, routeToPoi } from "../src/route";
import { groundHeight, LAGOON, onLand } from "../src/terrain";
import type { Poi, Side, WalkGraph } from "../src/types";

const pois = JSON.parse(readFileSync(new URL("../public/pois.json", import.meta.url), "utf8")) as Poi[];
const walk = JSON.parse(readFileSync(new URL("../public/walk.json", import.meta.url), "utf8")) as WalkGraph;
const affines = {
  waterfront: fitSide("waterfront", pois),
  summit: fitSide("summit", pois),
} as Record<Side, ReturnType<typeof fitSide>>;

const lines: string[] = [];
const ok = (name: string, cond: boolean) => {
  lines.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failed++;
};
let failed = 0;

const aq = chooseProjection(22.243171, 114.173586, affines, ISLANDS);
ok("aquarium uses waterfront transform", aq.side === "waterfront");
ok("aquarium lands inside waterfront", pointInRing(aq.x, aq.z, ISLANDS.waterfront));
ok("aquarium does not land on summit", !pointInRing(aq.x, aq.z, ISLANDS.summit));

const bay = toModel(1200, 420);
ok("northern bay stays water", !onLand(bay[0], bay[1]));
const crest = projectGps(22.241, 114.1735);
ok("Brick Hill crest is on the headland", onLand(crest.x, crest.z));
const meek = pois.find((p) => p.id === "little-meerkat")!;
const wheel = pois.find((p) => p.id === "ferris-wheel")!;
const hairPin = pois.find((p) => p.id === "hair-raiser")!;
const meekH = groundHeight(meek.position[0], meek.position[1]);
const wheelH = groundHeight(wheel.position[0], wheel.position[1]);
const hairH = groundHeight(hairPin.position[0], hairPin.position[1]);
const ridgeH = groundHeight(crest.x, crest.z);
ok("waterfront sits near sea level", meekH < 1.6);
ok("summit rides are up the slope", wheelH > meekH + 0.6 && hairH > meekH + 0.8);
ok("Brick Hill crest is the high ground", ridgeH > hairH && ridgeH > wheelH);

const near = chooseProjection(22.2434, 114.1737, affines, ISLANDS);
ok("point near aquarium stays on waterfront", near.side === "waterfront" && near.inside);

for (const id of ["hair-raiser", "ferris-wheel", "giant-panda-adventure"] as const) {
  const pin = pois.find((p) => p.id === id)!;
  const hit = chooseProjection(pin.lat, pin.lng, affines, ISLANDS);
  ok(
    `${pin.name} GPS lands on its side`,
    hit.side === pin.side && Math.hypot(hit.x - pin.position[0], hit.z - pin.position[1]) < 0.8,
  );
}

let zoneMiss = 0;
for (const p of pois) {
  const z = zoneAt(p.position[0], p.position[1], p.side);
  if (z !== p.zone) {
    zoneMiss++;
    lines.push(`  zone ${p.id}: paint=${z} data=${p.zone}`);
  }
  if (!onLand(p.position[0], p.position[1])) {
    failed++;
    lines.push(`FAIL  pin outside the headland ${p.id}`);
  }
}
ok("POI zones match island paint", zoneMiss === 0);

const steps = routeToPoi(walk, pois.find((p) => p.id === "grand-aquarium")!.position, "hair-raiser");
ok("walk graph reaches Hair Raiser from the aquarium", !!steps?.length);
ok(
  "cross-island route uses the cable or Ocean Express",
  !!steps?.some((s) => s.kind === "cable" || s.kind === "ocean-express"),
);

ok(
  "major path polylines exist on the waterfront",
  MAJOR_PATHS.filter((p) => p.side === "waterfront" && p.draw !== "road" && p.points.length >= 4).length >= 3,
);
ok(
  "major path polylines exist on the summit",
  MAJOR_PATHS.filter((p) => p.side === "summit" && p.draw !== "road" && p.points.length >= 4).length >= 3,
);

let offIsland = 0;
let inLagoon = 0;
for (const path of MAJOR_PATHS) {
  for (const [x, z] of path.points) {
    if (!onLand(x, z)) {
      offIsland++;
      if (offIsland < 8) lines.push(`  off land ${path.id} ${x},${z}`);
    }
    if (LAGOON.r > 0.4 && path.side === "waterfront" && Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.r + 0.15) {
      inLagoon++;
      lines.push(`  lagoon ${path.id} ${x},${z}`);
    }
  }
}
ok("path vertices sit on the headland", offIsland === 0);
ok("paths stay out of the Aqua City lagoon", inLagoon === 0);

const built = buildWalkGraph(pois);
const sameGraph =
  built.nodes.length === walk.nodes.length &&
  built.edges.length === walk.edges.length &&
  built.nodes.every((n) => walk.nodes.some((m) => m.id === n.id && m.side === n.side));
ok("walk.json matches the major-path graph", sameGraph);

ok(
  "every attraction is a walk node",
  pois.every((p) => walk.nodes.some((n) => n.poi === p.id && n.side === p.side)),
);
ok(
  "walk edges stay on one island",
  walk.edges.every((e) => {
    if (e.kind !== "walk") return e.kind === "cable" || e.kind === "ocean-express";
    const a = walk.nodes.find((n) => n.id === e.a);
    const b = walk.nodes.find((n) => n.id === e.b);
    return !!a && !!b && a.side === b.side;
  }),
);

const pathDist = (lat: number, lng: number, side: Side) => {
  const hit = chooseProjection(lat, lng, affines, ISLANDS);
  const near = nearestWalkPoint(walk, hit.x, hit.z, side);
  return near?.dist ?? Infinity;
};
for (const id of ["grand-aquarium", "hair-raiser", "ferris-wheel"] as const) {
  const pin = pois.find((p) => p.id === id)!;
  const d = pathDist(pin.lat, pin.lng, pin.side);
  ok(`${pin.name} GPS near a path (${d.toFixed(2)} u)`, d < 0.8);
}

const byNode = new Map(walk.nodes.map((n) => [n.id, n]));
const onEdge = (ax: number, az: number, bx: number, bz: number) =>
  walk.edges.some((e) => {
    if (e.kind !== "walk") return false;
    const a = byNode.get(e.a);
    const b = byNode.get(e.b);
    if (!a || !b) return false;
    const close = (px: number, pz: number, x: number, z: number) => Math.hypot(px - x, pz - z) < 0.08;
    return (
      (close(a.position[0], a.position[1], ax, az) && close(b.position[0], b.position[1], bx, bz)) ||
      (close(b.position[0], b.position[1], ax, az) && close(a.position[0], a.position[1], bx, bz))
    );
  });
const walkSteps = (steps ?? []).filter((s) => s.kind === "walk");
ok(
  "aquarium → hair raiser walks along path edges",
  walkSteps.length >= 4 && walkSteps.every((s) => onEdge(s.ax, s.az, s.bx, s.bz)),
);

const reach = (start: string, side: Side) => {
  const seen = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const id = q.pop()!;
    for (const e of walk.edges) {
      if (e.kind !== "walk") continue;
      const other = e.a === id ? e.b : e.b === id ? e.a : "";
      if (!other || seen.has(other)) continue;
      const node = byNode.get(other);
      if (!node || node.side !== side) continue;
      seen.add(other);
      q.push(other);
    }
  }
  return seen;
};
const wfPois = pois.filter((p) => p.side === "waterfront").map((p) => p.id);
const smPois = pois.filter((p) => p.side === "summit").map((p) => p.id);
const wfReach = reach("grand-aquarium", "waterfront");
const smReach = reach("hair-raiser", "summit");
ok(
  "waterfront paths connect every waterfront POI",
  wfPois.every((id) => wfReach.has(id)),
);
ok(
  "summit paths connect every summit POI",
  smPois.every((id) => smReach.has(id)),
);

const officialAttractions = JSON.parse(readFileSync(new URL("../src/data/attractions.json", import.meta.url), "utf8")) as {
  api_key: string;
  name: string;
  x: number;
  y: number;
}[];
const officialTransport = JSON.parse(readFileSync(new URL("../src/data/transportations.json", import.meta.url), "utf8")) as {
  api_key: string;
  name: string;
  x: number;
  y: number;
}[];
const officialPaths = (JSON.parse(readFileSync(new URL("../src/data/path_lines.json", import.meta.url), "utf8")) as number[][][]).filter(usablePath);

const zones = ["Whiskers Harbour", "Amazing Asian Animals", "Aqua City", "Polar Adventure", "Thrill Mountain", "Rainforest", "Marine World"];
for (const zone of zones) {
  ok(`section ${zone} has a pin`, pois.some((p) => p.zone === zone));
}
ok("both areas are present", pois.some((p) => p.side === "waterfront") && pois.some((p) => p.side === "summit"));

// Deliberate corrections where the feed pin sits off its attraction on the printed sheet.
const overrides = (JSON.parse(readFileSync(new URL("../src/data/legend.json", import.meta.url), "utf8")) as {
  overrides?: Record<string, [number, number] | string>;
}).overrides ?? {};
for (const a of [...officialAttractions, ...officialTransport]) {
  const pin = pois.find((p) => p.sourceKey === a.api_key);
  const moved = pin ? overrides[pin.id] : undefined;
  const [x, z] = Array.isArray(moved) ? toModel(moved[0], moved[1]) : toModel(a.x, a.y);
  const placed = !!pin && Math.hypot(pin.position[0] - x, pin.position[1] - z) < 0.02;
  ok(`interactive map pin ${a.name}`, placed);
}
ok(
  `every interactive-map footpath is drawn (${officialPaths.length})`,
  MAJOR_PATHS.filter((p) => p.draw !== "road").length === officialPaths.length,
);
for (const name of ["ocean-park-road", "nam-long-shan-road", "wong-chuk-hang-road", "police-school-road"]) {
  ok(
    `Google major road ${name}`,
    MAJOR_PATHS.some((p) => p.id.startsWith(`gpr-${name}-`) && p.points.length >= 2),
  );
}

console.log(lines.join("\n"));
if (failed) process.exit(1);
console.log("all checks passed");
