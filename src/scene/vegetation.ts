import * as THREE from "three";
import { ESCALATORS } from "../generated/escalators";
import { MAJOR_PATHS } from "../generated/paths";
import { zoneAt } from "../geo";
import { SIDE_SPLIT } from "../layout";
import { coastDistance, groundHeight, inLagoon, LAGOON } from "../terrain";
import type { Poi } from "../types";
import { maskAt, type GroundMasks } from "./ground";

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spatial hash of path samples and landmark footprints, for keeping clear space. */
class Clearance {
  private cells = new Map<string, [number, number, number][]>();
  private size = 1;
  add(x: number, z: number, r: number) {
    const k = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    c.push([x, z, r]);
  }
  blocked(x: number, z: number, pad: number): boolean {
    const cx = Math.floor(x / this.size);
    const cz = Math.floor(z / this.size);
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const c = this.cells.get(`${cx + i},${cz + j}`);
        if (!c) continue;
        for (const [px, pz, r] of c) if ((px - x) ** 2 + (pz - z) ** 2 < (r + pad) ** 2) return true;
      }
    }
    return false;
  }
}

/** Radius each landmark keeps clear of trees and filler buildings. */
const FOOTPRINT: Record<string, number> = {
  "grand-aquarium": 2.0,
  "hair-raiser": 2.3,
  "ferris-wheel": 1.4,
  "ocean-park-tower": 0.8,
  "the-rapids": 1.2,
  "arctic-blast": 0.9,
  "south-pole-spectacular": 1.0,
  "flying-swing": 0.9,
  "crazy-galleon": 0.9,
  "giant-panda-adventure": 1.0,
  "old-hong-kong": 0.9,
};

export function clearanceFor(pois: Poi[]): Clearance {
  const c = new Clearance();
  for (const path of MAJOR_PATHS) {
    const pts = path.points;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
      for (let k = 0; k <= n; k++) c.add(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, 0.22);
    }
  }
  for (const p of pois) if (!p.id.startsWith("escalator-")) c.add(p.position[0], p.position[1], FOOTPRINT[p.id] ?? 0.65);
  for (const run of ESCALATORS) {
    for (let i = 1; i < run.points.length; i++) {
      const [ax, az] = run.points[i - 1];
      const [bx, bz] = run.points[i];
      for (let k = 0; k <= 6; k++) c.add(ax + ((bx - ax) * k) / 6, az + ((bz - az) * k) / 6, 0.45);
    }
  }
  c.add(LAGOON.x, LAGOON.z, LAGOON.r + 0.2);
  // Big landmarks whose footprint is off their pin.
  c.add(10.35, -2.4, 1.55); // Dolphin Explorations stadium and lagoon
  c.add(10.37, 0.34, 1.95); // Pacific Pier
  c.add(7.94, -4.4, 0.95); // Summit cable car hall
  c.add(-11.6, 9.9, 1.2); // main gate
  return c;
}

function roundCrown(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const lump = 1 + 0.12 * Math.sin(x * 5.1 + z * 3.7) * Math.cos(y * 4.3);
    pos.setXYZ(i, x * lump, y * lump * 0.85, z * lump);
  }
  geo.deleteAttribute("normal");
  const merged = mergeVertices(geo);
  merged.computeVertexNormals();
  merged.translate(0, 0.62, 0);
  return merged;
}

/** Weld duplicate vertices so a lumpy crown shades smoothly. */
function mergeVertices(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute("position");
  const map = new Map<string, number>();
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      map.set(key, id);
    }
    idx.push(id);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(idx);
  return out;
}

function conifer(): THREE.BufferGeometry {
  const a = new THREE.ConeGeometry(0.75, 1.1, 7);
  a.translate(0, 0.85, 0);
  const b = new THREE.ConeGeometry(0.55, 0.9, 7);
  b.translate(0, 1.35, 0);
  return mergeGeos([a, b]);
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      idx.push(base + i);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

function palmFronds(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.ConeGeometry(0.16, 0.9, 3, 1);
    leaf.rotateZ(Math.PI / 2 + 0.35);
    leaf.translate(0.42, 1.25, 0);
    leaf.scale(1, 1, 0.35);
    leaf.rotateY((i / 6) * Math.PI * 2);
    parts.push(leaf);
  }
  return mergeGeos(parts);
}

type Spot = { x: number; z: number; s: number; kind: "round" | "conifer" | "palm"; tone: number };

export function buildVegetation(masks: GroundMasks, pois: Poi[], clear: Clearance): THREE.Group {
  const rng = mulberry(11);
  const spots: Spot[] = [];
  const step = 0.47;
  for (let z = -19.5; z < 19.5; z += step) {
    for (let x = -24; x < 24; x += step) {
      const jx = x + (rng() - 0.5) * step * 0.9;
      const jz = z + (rng() - 0.5) * step * 0.9;
      const coast = coastDistance(jx, jz);
      if (coast < 0.2 || inLagoon(jx, jz)) continue;
      const m = maskAt(masks, jx, jz);
      if (m.road > 0.4) continue;
      let p = 0;
      if (m.forest > 0.5) p = 0.92;
      else if (m.plaza > 0.5) p = 0.07;
      else p = 0.14;
      if (rng() > p) continue;
      const pad = m.forest > 0.5 ? 0.12 : 0.28;
      if (clear.blocked(jx, jz, pad)) continue;
      const h = groundHeight(jx, jz);
      const plazaZone = m.plaza > 0.5 ? zoneAt(jx, jz, jx < SIDE_SPLIT ? "waterfront" : "summit") : "";
      let kind: Spot["kind"] = "round";
      if (plazaZone === "Aqua City" || plazaZone === "Whiskers Harbour" || (m.plaza > 0.5 && coast < 1.5)) kind = "palm";
      else if (m.forest > 0.5 && h > 2.8 && rng() < 0.3) kind = "conifer";
      const s = m.forest > 0.5 ? 0.34 + rng() * 0.18 : 0.24 + rng() * 0.1;
      spots.push({ x: jx, z: jz, s, kind, tone: rng() });
    }
  }

  const group = new THREE.Group();
  group.name = "trees";
  const tones = [
    new THREE.Color("#3f8f3a"),
    new THREE.Color("#4f9e3f"),
    new THREE.Color("#2f7a35"),
    new THREE.Color("#6aae45"),
    new THREE.Color("#377f45"),
  ];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  const make = (kind: Spot["kind"], crownGeo: THREE.BufferGeometry, trunkGeo: THREE.BufferGeometry, crownMat: THREE.Material) => {
    const list = spots.filter((s) => s.kind === kind);
    if (!list.length) return;
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, list.length);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: "#8a6242", roughness: 0.9 }), list.length);
    list.forEach((sp, i) => {
      dummy.position.set(sp.x, groundHeight(sp.x, sp.z) - 0.02, sp.z);
      const sy = sp.s * (0.9 + sp.tone * 0.35);
      dummy.scale.set(sp.s, sy, sp.s);
      dummy.rotation.set(0, sp.tone * 6.28, 0);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      trunks.setMatrixAt(i, dummy.matrix);
      if (kind === "palm") col.set("#5aa53a").offsetHSL(0, 0, (sp.tone - 0.5) * 0.08);
      else col.copy(tones[Math.floor(sp.tone * tones.length) % tones.length]).offsetHSL((sp.tone - 0.5) * 0.02, 0, (sp.tone - 0.5) * 0.06);
      crowns.setColorAt(i, col);
    });
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    trunks.castShadow = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    group.add(crowns, trunks);
  };

  const leaf = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 });
  const trunk = new THREE.CylinderGeometry(0.07, 0.11, 0.45, 5);
  trunk.translate(0, 0.22, 0);
  make("round", roundCrown(), trunk, leaf);
  const trunk2 = new THREE.CylinderGeometry(0.06, 0.1, 0.5, 5);
  trunk2.translate(0, 0.25, 0);
  make("conifer", conifer(), trunk2, leaf);
  const palmTrunk = new THREE.CylinderGeometry(0.045, 0.07, 1.3, 5);
  palmTrunk.translate(0, 0.65, 0);
  make("palm", palmFronds(), palmTrunk, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, side: THREE.DoubleSide }));
  return group;
}

const BUILDING_WALL: Record<string, string[]> = {
  "Whiskers Harbour": ["#f7d7a8", "#f3b977", "#fbe8c8"],
  "Amazing Asian Animals": ["#f4d2c2", "#efe1c9", "#e9b8a2"],
  "Aqua City": ["#ffffff", "#e8f3f7", "#f5ecd6"],
  "Polar Adventure": ["#eaf6fc", "#d4eaf6", "#ffffff"],
  "Thrill Mountain": ["#fff1b8", "#ffe082", "#ffffff"],
  Rainforest: ["#e3d6b0", "#d8c69a", "#efe5c8"],
  "Marine World": ["#fbe3ef", "#ffffff", "#e8f1f7"],
};
const BUILDING_ROOF: Record<string, string[]> = {
  "Whiskers Harbour": ["#e2553a", "#f08a2c", "#3f8fd0"],
  "Amazing Asian Animals": ["#c8403a", "#2f8c5b", "#b3452e"],
  "Aqua City": ["#1f9bc0", "#2f6fc0", "#e25a3a"],
  "Polar Adventure": ["#ffffff", "#7fbfe0", "#4a8fd0"],
  "Thrill Mountain": ["#e2403a", "#2f78d0", "#f28a24"],
  Rainforest: ["#9a6a3a", "#3d7f45", "#c9a25a"],
  "Marine World": ["#d63b8f", "#1fa3a8", "#8a5cc8"],
};

/** Small shops, kiosks and restaurants on the plazas, instanced. */
export function buildFiller(masks: GroundMasks, clear: Clearance): THREE.Group {
  const rng = mulberry(5);
  const spots: { x: number; z: number; w: number; d: number; h: number; yaw: number; zone: string }[] = [];
  const taken = new Clearance();
  for (let i = 0; i < 9000 && spots.length < 150; i++) {
    const x = -18 + rng() * 36;
    const z = -14 + rng() * 26;
    const m = maskAt(masks, x, z);
    if (m.plaza < 0.7 || m.road > 0.3 || coastDistance(x, z) < 0.5 || inLagoon(x, z)) continue;
    const w = 0.3 + rng() * 0.35;
    const d = 0.25 + rng() * 0.25;
    const r = Math.max(w, d) * 0.6;
    if (clear.blocked(x, z, r + 0.08) || taken.blocked(x, z, r + 0.1)) continue;
    taken.add(x, z, r);
    const zone = zoneAt(x, z, x < SIDE_SPLIT ? "waterfront" : "summit");
    spots.push({ x, z, w, d, h: 0.2 + rng() * 0.28, yaw: (Math.floor(rng() * 4) * Math.PI) / 2 + (rng() - 0.5) * 0.3, zone });
  }
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  bodyGeo.translate(0, 0.5, 0);
  const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.translate(0, 0.5, 0);
  const bandGeo = new THREE.BoxGeometry(1.01, 1, 1.01);
  bandGeo.translate(0, 0.5, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 }), spots.length);
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 }), spots.length);
  const bands = new THREE.InstancedMesh(bandGeo, new THREE.MeshStandardMaterial({ color: "#3a4a58", roughness: 0.3, metalness: 0.2 }), spots.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    const y = groundHeight(s.x, s.z);
    dummy.rotation.set(0, s.yaw, 0);
    dummy.position.set(s.x, y - 0.02, s.z);
    dummy.scale.set(s.w, s.h + 0.02, s.d);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    dummy.position.set(s.x, y + s.h * 0.5, s.z);
    dummy.scale.set(s.w, s.h * 0.18, s.d);
    dummy.updateMatrix();
    bands.setMatrixAt(i, dummy.matrix);
    dummy.position.set(s.x, y + s.h, s.z);
    dummy.scale.set(s.w * 1.15, Math.min(s.w, s.d) * 0.55, s.d * 1.15);
    dummy.updateMatrix();
    roofs.setMatrixAt(i, dummy.matrix);
    const walls = BUILDING_WALL[s.zone] ?? ["#ffffff"];
    const roofsC = BUILDING_ROOF[s.zone] ?? ["#e2553a"];
    bodies.setColorAt(i, col.set(walls[i % walls.length]));
    roofs.setColorAt(i, col.set(roofsC[(i * 7) % roofsC.length]));
  });
  for (const m of [bodies, roofs, bands]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  const g = new THREE.Group();
  g.name = "filler";
  g.add(bodies, bands, roofs);
  return g;
}
