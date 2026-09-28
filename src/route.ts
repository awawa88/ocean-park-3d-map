import type { EdgeKind, Side, WalkGraph } from "./types";

export type RouteStep = {
  kind: EdgeKind;
  ax: number;
  az: number;
  bx: number;
  bz: number;
};

const BOARD: Record<EdgeKind, number> = {
  walk: 0,
  cable: 2.2,
  "ocean-express": 1.6,
};

/** Closest point on a walk edge. Cable and Ocean Express are not walkable surfaces. */
export function nearestWalkPoint(
  graph: WalkGraph,
  x: number,
  z: number,
  side?: Side,
): { x: number; z: number; dist: number; a: string; b: string } | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  let best: { x: number; z: number; dist: number; a: string; b: string } | null = null;
  for (const e of graph.edges) {
    if (e.kind !== "walk") continue;
    const na = byId.get(e.a);
    const nb = byId.get(e.b);
    if (!na || !nb) continue;
    if (side && (na.side !== side || nb.side !== side)) continue;
    const ax = na.position[0];
    const az = na.position[1];
    const bx = nb.position[0];
    const bz = nb.position[1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-8;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const dist = Math.hypot(px - x, pz - z);
    if (!best || dist < best.dist) best = { x: px, z: pz, dist, a: e.a, b: e.b };
  }
  return best;
}

/** Pull an outdoor fix onto the nearest walk when it is within about 25 m. */
export function snapToPath(
  graph: WalkGraph,
  x: number,
  z: number,
  side: Side,
  metersPerModelUnit: number,
): { x: number; z: number; dist: number } | null {
  const hit = nearestWalkPoint(graph, x, z, side);
  if (!hit) return null;
  const limit = Math.min(1, Math.max(0.32, 25 / Math.max(8, metersPerModelUnit)));
  if (hit.dist > limit) return null;
  return hit;
}

/** Shortest path from an arbitrary point to a POI node. Cross-island hops are the cable and Ocean Express edges. */
export function routeToPoi(graph: WalkGraph, from: [number, number], poiId: string): RouteStep[] | null {
  const dest = graph.nodes.find((n) => n.poi === poiId || n.id === poiId);
  if (!dest) return null;

  const nodes = graph.nodes.map((n) => ({ ...n }));
  const edges = graph.edges.map((e) => ({ ...e }));
  const origin = graph.nodes.find((n) => Math.hypot(n.position[0] - from[0], n.position[1] - from[1]) < 0.08);
  const fromId = origin ? origin.id : "__from";
  if (!origin) {
    nodes.push({ id: fromId, side: dest.side, position: from });
    const hit = nearestWalkPoint(graph, from[0], from[1]);
    if (hit) {
      edges.push({ a: fromId, b: hit.a, kind: "walk" });
      edges.push({ a: fromId, b: hit.b, kind: "walk" });
    } else {
      const nearest = [...graph.nodes].sort((a, b) => {
        const da = (a.position[0] - from[0]) ** 2 + (a.position[1] - from[1]) ** 2;
        const db = (b.position[0] - from[0]) ** 2 + (b.position[1] - from[1]) ** 2;
        return da - db;
      })[0];
      if (nearest) edges.push({ a: fromId, b: nearest.id, kind: "walk" });
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, { to: string; kind: EdgeKind; w: number }[]>();
  const link = (a: string, b: string, kind: EdgeKind, pace = 1) => {
    const pa = byId.get(a);
    const pb = byId.get(b);
    if (!pa || !pb) return;
    const dist = Math.hypot(pa.position[0] - pb.position[0], pa.position[1] - pb.position[1]);
    const w = dist * pace + BOARD[kind];
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, kind, w });
    adj.get(b)!.push({ to: a, kind, w });
  };
  for (const e of edges) link(e.a, e.b, e.kind, e.pace ?? 1);

  const dist = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, { id: string; kind: EdgeKind }>();
  const used = new Set<string>();
  while (used.size < nodes.length) {
    let best: string | null = null;
    let bestD = Infinity;
    for (const n of nodes) {
      if (used.has(n.id)) continue;
      const d = dist.get(n.id);
      if (d !== undefined && d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    if (best === null) break;
    used.add(best);
    if (best === dest.id) break;
    for (const e of adj.get(best) ?? []) {
      const nd = bestD + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { id: best, kind: e.kind });
      }
    }
  }
  if (!prev.has(dest.id) && dest.id !== fromId) return null;

  const chain: { id: string; kind: EdgeKind }[] = [];
  let cur = dest.id;
  while (cur !== fromId) {
    const p = prev.get(cur);
    if (!p) return null;
    chain.push({ id: cur, kind: p.kind });
    cur = p.id;
  }
  chain.reverse();

  const steps: RouteStep[] = [];
  let cursor = fromId;
  for (const hop of chain) {
    const a = byId.get(cursor)!;
    const b = byId.get(hop.id)!;
    steps.push({ kind: hop.kind, ax: a.position[0], az: a.position[1], bx: b.position[0], bz: b.position[1] });
    cursor = hop.id;
  }
  return steps;
}
