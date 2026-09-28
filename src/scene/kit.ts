import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Small modelling kit: cached materials and primitive helpers that return positioned meshes. */

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(hex: string, opts: { rough?: number; metal?: number; emissive?: string; opacity?: number } = {}) {
  const key = `${hex}|${opts.rough ?? 0.72}|${opts.metal ?? 0}|${opts.emissive ?? ""}|${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: opts.rough ?? 0.72,
      metalness: opts.metal ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    if (opts.emissive) {
      m.emissive.set(opts.emissive);
      m.emissiveIntensity = 0.6;
    }
    matCache.set(key, m);
  }
  return m;
}

export const C = {
  white: "#f7f5ef",
  cream: "#f3e6c4",
  sand: "#e3cf9f",
  stone: "#cfc3a8",
  grey: "#8f959b",
  dark: "#3a3f45",
  black: "#26282b",
  red: "#e0403a",
  coral: "#ec7a62",
  orange: "#f28a24",
  gold: "#f2bf3a",
  yellow: "#f6d743",
  lime: "#9bd04a",
  green: "#3d9a4f",
  teal: "#1fa3a8",
  cyan: "#43c6e0",
  sky: "#8fd4f2",
  blue: "#2f78d0",
  navy: "#1f3f7a",
  ice: "#e3f3fb",
  purple: "#8a5cc8",
  pink: "#ef7fb6",
  magenta: "#d63b8f",
  wood: "#a8733f",
  roofGreen: "#2f8c5b",
  glass: "#9fd9f0",
};

type V3 = [number, number, number];

function place<T extends THREE.Object3D>(o: T, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]): T {
  o.position.set(p[0], p[1], p[2]);
  o.rotation.set(r[0], r[1], r[2]);
  return o;
}

export function box(w: number, h: number, d: number, m: THREE.Material, p: V3 = [0, h / 2, 0], r?: V3) {
  return place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), p, r);
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, p: V3 = [0, h / 2, 0], seg = 16, r?: V3) {
  return place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m), p, r);
}

export function cone(rad: number, h: number, m: THREE.Material, p: V3 = [0, h / 2, 0], seg = 16, r?: V3) {
  return place(new THREE.Mesh(new THREE.ConeGeometry(rad, h, seg), m), p, r);
}

export function sphere(rad: number, m: THREE.Material, p: V3 = [0, rad, 0], seg = 16, scale?: V3) {
  const s = place(new THREE.Mesh(new THREE.SphereGeometry(rad, seg, Math.max(6, Math.round(seg * 0.7))), m), p);
  if (scale) s.scale.set(scale[0], scale[1], scale[2]);
  return s;
}

export function dome(rad: number, m: THREE.Material, p: V3 = [0, 0, 0], seg = 20, scale?: V3) {
  const s = place(
    new THREE.Mesh(new THREE.SphereGeometry(rad, seg, Math.round(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2), m),
    p,
  );
  if (scale) s.scale.set(scale[0], scale[1], scale[2]);
  return s;
}

export function torus(rad: number, tube: number, m: THREE.Material, p: V3 = [0, 0, 0], r?: V3, arc = Math.PI * 2, seg = 32) {
  return place(new THREE.Mesh(new THREE.TorusGeometry(rad, tube, 8, seg, arc), m), p, r);
}

/** Hip roof: a four-sided pyramid rotated square to the walls. */
export function hipRoof(w: number, d: number, h: number, m: THREE.Material, y: number) {
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), m);
  r.rotation.y = Math.PI / 4;
  r.scale.set(w * 1.12, h, d * 1.12);
  r.position.y = y + h / 2;
  return r;
}

/** Gable roof: a triangular prism along x. */
export function gableRoof(w: number, d: number, h: number, m: THREE.Material, y: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.05, 0);
  shape.lineTo(d / 2 + 0.05, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + 0.1, bevelEnabled: false });
  geo.translate(0, 0, -(w + 0.1) / 2);
  geo.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = y;
  return mesh;
}

/** Simple building: walls, optional window band, and a roof. */
export function house(
  w: number,
  d: number,
  h: number,
  wall: string,
  roof: string,
  kind: "hip" | "gable" | "flat" = "hip",
  roofH = Math.min(w, d) * 0.45,
) {
  const g = new THREE.Group();
  g.add(box(w, h, d, mat(wall)));
  g.add(box(w * 1.002, h * 0.16, d * 1.002, mat(C.dark, { rough: 0.4 }), [0, h * 0.62, 0]));
  if (kind === "hip") g.add(hipRoof(w, d, roofH, mat(roof), h));
  else if (kind === "gable") g.add(gableRoof(w, d, roofH, mat(roof), h));
  else g.add(box(w * 1.06, 0.06, d * 1.06, mat(roof), [0, h + 0.03, 0]));
  return g;
}

/** A tube along a list of points. */
export function tube(points: THREE.Vector3[], radius: number, m: THREE.Material, closed = false, segs = 200, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, radial, closed), m);
}

export function group(...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  if (children.length) g.add(...children);
  return g;
}

/** Text sign painted on a canvas: original lettering, no park artwork. */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  const r = h * 0.22;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, r);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();
  ctx.fillStyle = fg;
  let size = Math.round(h * 0.5);
  const face = `"Nunito", "Avenir Next", "Segoe UI", system-ui, sans-serif`;
  ctx.font = `800 ${size}px ${face}`;
  while (ctx.measureText(text).width > w * 0.86 && size > 10) {
    size -= 2;
    ctx.font = `800 ${size}px ${face}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function shadows(root: THREE.Object3D, cast = true, receive = true) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
  return root;
}

/**
 * Merge every mesh that does not move into one mesh per material.
 * Moving parts are found by running the animation once and diffing world matrices,
 * so builders do not have to tag them. Instanced meshes are left alone.
 */
export function bakeStatic(root: THREE.Object3D, tick?: (t: number) => void): number {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material)) meshes.push(m);
  });
  const before = new Map(meshes.map((m) => [m, m.matrixWorld.clone()]));
  const moving = new Set<THREE.Mesh>();
  if (tick) {
    tick(3.37);
    root.updateMatrixWorld(true);
    for (const m of meshes) if (!m.matrixWorld.equals(before.get(m)!)) moving.add(m);
    tick(0);
    root.updateMatrixWorld(true);
    for (const m of meshes) if (!m.matrixWorld.equals(before.get(m)!)) moving.add(m);
  }
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  for (const m of meshes) {
    if (moving.has(m) || !m.visible) continue;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    }
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const mat = m.material as THREE.Material;
    let entry = byMat.get(mat);
    if (!entry) byMat.set(mat, (entry = { geos: [], cast: m.castShadow, receive: m.receiveShadow }));
    entry.geos.push(g);
    m.removeFromParent();
    g = null as unknown as THREE.BufferGeometry;
  }
  let merged = 0;
  for (const [material, { geos, cast, receive }] of byMat) {
    const out = mergeGeometries(geos, false);
    if (!out) continue;
    const mesh = new THREE.Mesh(out, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    root.add(mesh);
    merged++;
  }
  return merged;
}
