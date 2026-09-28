import * as THREE from "three";
import { MAJOR_PATHS } from "../generated/paths";
import { groundHeight } from "../terrain";

/** Walk colours follow the park legend: each zone paints its own paths. */
export const PATH_FILL: Record<string, string> = {
  "Whiskers Harbour": "#f59a3c",
  "Amazing Asian Animals": "#e8573f",
  "Aqua City": "#fff3cf",
  "Polar Adventure": "#d3ecfa",
  "Thrill Mountain": "#f7d236",
  Rainforest: "#e3eea4",
  "Marine World": "#f07db8",
};

type Pt = [number, number];

function clean(points: Pt[], maxSeg: number): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.03) continue;
    if (last) {
      const d = Math.hypot(p[0] - last[0], p[1] - last[1]);
      const n = Math.ceil(d / maxSeg);
      for (let i = 1; i < n; i++) {
        out.push([last[0] + ((p[0] - last[0]) * i) / n, last[1] + ((p[1] - last[1]) * i) / n]);
      }
    }
    out.push(p);
  }
  return out;
}

/** Chaikin smoothing: rounds the corners of the traced polylines. */
function chaikin(points: Pt[], rounds: number): Pt[] {
  let pts = points;
  for (let r = 0; r < rounds; r++) {
    if (pts.length < 3) return pts;
    const next: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

class RibbonBuilder {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  strip(pts: Pt[], width: number, lift: number, color: THREE.Color) {
    if (pts.length < 2) return;
    const base = this.pos.length / 3;
    const hw = width / 2;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next[0] - prev[0];
      let dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const nx = -dz * hw;
      const nz = dx * hw;
      const [x, z] = pts[i];
      const yl = groundHeight(x + nx, z + nz) + lift;
      const yr = groundHeight(x - nx, z - nz) + lift;
      const yc = groundHeight(x, z) + lift;
      this.pos.push(x + nx, Math.max(yl, yc), z + nz, x - nx, Math.max(yr, yc), z - nz);
      this.col.push(color.r, color.g, color.b, color.r, color.g, color.b);
      if (i > 0) {
        const a = base + (i - 1) * 2;
        this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }

  disc(x: number, z: number, r: number, lift: number, color: THREE.Color) {
    const base = this.pos.length / 3;
    const y = groundHeight(x, z) + lift;
    this.pos.push(x, y, z);
    this.col.push(color.r, color.g, color.b);
    const seg = 10;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      this.pos.push(px, Math.max(y, groundHeight(px, pz) + lift), pz);
      this.col.push(color.r, color.g, color.b);
    }
    for (let i = 0; i < seg; i++) this.idx.push(base, base + 1 + ((i + 1) % seg), base + 1 + i);
  }

  mesh(material: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    return m;
  }
}

function pathMaterial(offset: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
}

/** Paths as two layers: a darker kerb and the coloured walk on top. */
export function buildPaths(): THREE.Group {
  const edge = new RibbonBuilder();
  const fill = new RibbonBuilder();
  const tmp = new THREE.Color();
  const kerb = new THREE.Color();
  for (const path of MAJOR_PATHS) {
    if (path.points.length < 2) continue;
    const pts = chaikin(clean(path.points as Pt[], 0.22), 2);
    const road = path.draw === "road";
    const width = road ? 0.3 : 0.36;
    tmp.set(road ? "#efe3c4" : (PATH_FILL[path.zone] ?? "#f8ecc4"));
    kerb.copy(tmp).multiplyScalar(road ? 0.78 : 0.72);
    edge.strip(pts, width + 0.1, 0.03, kerb);
    fill.strip(pts, width, 0.05, tmp);
    for (const end of [pts[0], pts[pts.length - 1]]) {
      edge.disc(end[0], end[1], (width + 0.1) / 2, 0.03, kerb);
      fill.disc(end[0], end[1], width / 2, 0.05, tmp);
    }
  }
  const g = new THREE.Group();
  g.name = "paths";
  g.add(edge.mesh(pathMaterial(-2)), fill.mesh(pathMaterial(-4)));
  return g;
}

/** A route overlay ribbon that floats just above the paths. */
export function routeGeometry(pts: THREE.Vector3[], width: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const p = pts[i];
    positions.push(p.x - dz * width * 0.5, p.y, p.z + dx * width * 0.5, p.x + dz * width * 0.5, p.y, p.z - dx * width * 0.5);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
