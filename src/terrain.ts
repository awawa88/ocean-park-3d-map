import { PLAZA_GRID, SDF_GRID } from "./generated/ground-grid";

/**
 * Ground model for the whole sheet.
 *
 * The coastline is a signed distance field traced from the park map (land > 0),
 * so the shore is smooth at any zoom. Height is authored: a low Waterfront shelf,
 * the forested spur between the two sides (the high ground), a raised Summit
 * plateau that drops to the sea in cliffs, and Brick Hill rising to the south.
 */

/** Waterfront shelf height, just above the shore. */
export const WF_PLATEAU = 0.55;
/** Summit plateau height. */
export const SM_PLATEAU = 2.6;

/** Aqua City lagoon, a round bite of water in the middle of the Waterfront. */
export const LAGOON = { x: -9.22, z: 3.14, r: 0.95 };

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const sdfData = decode(SDF_GRID.data);
const plazaData = decode(PLAZA_GRID.data);

function bilinear(
  grid: { x0: number; z0: number; step: number; cols: number; rows: number },
  data: Uint8Array,
  x: number,
  z: number,
): number {
  let c = (x - grid.x0) / grid.step;
  let r = (z - grid.z0) / grid.step;
  c = Math.max(0, Math.min(grid.cols - 1.001, c));
  r = Math.max(0, Math.min(grid.rows - 1.001, r));
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const tc = c - c0;
  const tr = r - r0;
  const i = r0 * grid.cols + c0;
  const a = data[i];
  const b = data[i + 1];
  const d = data[i + grid.cols];
  const e = data[i + grid.cols + 1];
  return (a * (1 - tc) + b * tc) * (1 - tr) + (d * (1 - tc) + e * tc) * tr;
}

/** Signed distance to the coast in model units. Positive on land. */
export function coastDistance(x: number, z: number): number {
  return (bilinear(SDF_GRID, sdfData, x, z) / 255) * 8 - 4;
}

/** 0..1 weight of developed park ground (plazas, rides, buildings). */
export function plazaWeight(x: number, z: number): number {
  return bilinear(PLAZA_GRID, plazaData, x, z) / 255;
}

export function inLagoon(x: number, z: number): boolean {
  return Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.r;
}

export function onLand(x: number, z: number): boolean {
  if (inLagoon(x, z)) return false;
  return coastDistance(x, z) > 0;
}

// --- authored relief ---------------------------------------------------------

type Bump = { x: number; z: number; sx: number; sz: number; h: number; p: number; rot?: number };

/** 0 on the Waterfront shelf, 1 on the Summit headland. The wooded slope between is the ramp. */
function summitWeight(x: number, z: number): number {
  return smoothstep(-4.8, -1.4, x + Math.max(0, z - 3) * 0.25);
}

/** Hills add on top. */
const HILLS: Bump[] = [
  // Forested spur between Whiskers Harbour and the Summit: the park's high ground.
  { x: -6.2, z: -7.2, sx: 2.6, sz: 3.6, h: 3.9, p: 1, rot: 0.35 },
  { x: -4.6, z: -3.2, sx: 2.2, sz: 3.0, h: 1.9, p: 1 },
  // Wooded slope between Aqua City and the Rainforest.
  { x: -3.4, z: 3.2, sx: 3.2, sz: 4.2, h: 2.3, p: 1 },
  // Brick Hill to the south.
  { x: 3.4, z: 12.2, sx: 10, sz: 6.5, h: 5.2, p: 1 },
  { x: -0.6, z: 8.2, sx: 2.6, sz: 2.2, h: 1.5, p: 1 },
  { x: 7.8, z: 7.2, sx: 3.2, sz: 2.4, h: 1.7, p: 1 },
  { x: 12.4, z: 5.2, sx: 3.0, sz: 2.2, h: 1.1, p: 1 },
  { x: 15.5, z: 10, sx: 7.5, sz: 6, h: 3.0, p: 1 },
  { x: -4.0, z: 13, sx: 6, sz: 5, h: 3.2, p: 1 },
  // Rolling hills beyond the Waterfront.
  { x: -21, z: -11, sx: 5, sz: 6, h: 2.4, p: 1 },
  { x: -21.5, z: 4, sx: 4.5, sz: 4.5, h: 1.8, p: 1 },
  { x: -17, z: 14, sx: 6, sz: 5, h: 2.2, p: 1 },
];

function bump(b: Bump, x: number, z: number): number {
  let dx = x - b.x;
  let dz = z - b.z;
  if (b.rot) {
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const rx = dx * c - dz * s;
    dz = dx * s + dz * c;
    dx = rx;
  }
  const r2 = (dx / b.sx) ** 2 + (dz / b.sz) ** 2;
  return b.h * Math.exp(-Math.pow(r2 * 2.2, b.p));
}

function hash(i: number, j: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, z: number): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j);
  const b = hash(i + 1, j);
  const c = hash(i, j + 1);
  const d = hash(i + 1, j + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x: number, z: number): number {
  return (
    valueNoise(x * 0.35, z * 0.35) * 0.55 +
    valueNoise(x * 0.8 + 5.3, z * 0.8 - 2.1) * 0.3 +
    valueNoise(x * 1.9 - 7.7, z * 1.9 + 3.3) * 0.15
  );
}

function smoothstep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** Terrain height, including the sea floor (negative) and the lagoon bowl. */
export function terrainHeight(x: number, z: number): number {
  const sdf = coastDistance(x, z);
  const sw = summitWeight(x, z);
  // The Summit sags a little toward the Marine World tip and the Polar hub.
  const plateau = WF_PLATEAU + (SM_PLATEAU - WF_PLATEAU) * sw - sw * smoothstep(8, 16, x) * 0.35;
  let hills = 0;
  for (const b of HILLS) hills += bump(b, x, z);
  const plaza = plazaWeight(x, z);
  // Rides and plazas are flat terraces; hills flatten under them.
  const rough = (fbm(x, z) - 0.45) * 0.9 * (1 - plaza);
  let h = plateau + hills * (1 - plaza * 0.75) + rough * (0.3 + hills * 0.25);
  h = Math.max(h, 0.35);

  // Shore: a thin beach, then the sea floor shelves away.
  const shore = 0.12;
  const land = smoothstep(0.02, 1.1, sdf);
  h = shore + (h - shore) * land;
  if (sdf < 0.02) h = shore + Math.max(-2.4, sdf * 1.6) - 0.12 * (1 - smoothstep(-0.2, 0.02, sdf));

  const lg = Math.hypot(x - LAGOON.x, z - LAGOON.z);
  if (lg < LAGOON.r + 0.1) {
    const bowl = smoothstep(LAGOON.r + 0.08, LAGOON.r - 0.25, lg);
    h = h * (1 - bowl) + (h - 0.55) * bowl;
  }
  return h;
}

// Height cache on a regular grid: groundHeight is called every frame for labels and routes.
const HC = { x0: -34, z0: -28, step: 0.1, cols: 681, rows: 561 };
let heightCache: Float32Array | null = null;

function ensureCache(): Float32Array {
  if (heightCache) return heightCache;
  heightCache = new Float32Array(HC.cols * HC.rows);
  for (let r = 0; r < HC.rows; r++) {
    for (let c = 0; c < HC.cols; c++) {
      heightCache[r * HC.cols + c] = terrainHeight(HC.x0 + c * HC.step, HC.z0 + r * HC.step);
    }
  }
  return heightCache;
}

/** Cached bilinear lookup of terrainHeight. */
export function sampleTerrain(x: number, z: number): number {
  const hc = ensureCache();
  const c = (x - HC.x0) / HC.step;
  const r = (z - HC.z0) / HC.step;
  if (c < 0 || r < 0 || c >= HC.cols - 1 || r >= HC.rows - 1) return terrainHeight(x, z);
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const tc = c - c0;
  const tr = r - r0;
  const i = r0 * HC.cols + c0;
  return (
    (hc[i] * (1 - tc) + hc[i + 1] * tc) * (1 - tr) + (hc[i + HC.cols] * (1 - tc) + hc[i + HC.cols + 1] * tc) * tr
  );
}

/** Height of the walkable ground. Water reads as sea level. */
export function groundHeight(x: number, z: number): number {
  return Math.max(0, sampleTerrain(x, z));
}
