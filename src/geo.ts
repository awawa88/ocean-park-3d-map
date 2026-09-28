import { SIDE_SPLIT } from "./layout";
import { REFS } from "./generated/refs";
import { ZONE_SEEDS } from "./generated/zones";
import type { Poi, Ring, Side } from "./types";

/** Latitude split between the two survey clusters. Waterfront sits north of this. */
export const LAT_SPLIT = 22.2405;

export type Affine = {
  side: Side;
  /** x = a*(lat-lat0) + b*(lng-lng0) + c */
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  lat0: number;
  lng0: number;
};

const CONTROL_IDS: Record<Side, string[]> = {
  waterfront: [
    "grand-aquarium",
    "giant-panda-adventure",
    "sea-life-carousel",
    "balloons",
    "cable-car-waterfront",
    "ocean-express-waterfront",
  ],
  summit: [
    "hair-raiser",
    "ferris-wheel",
    "arctic-blast",
    "the-rapids",
    "cable-car-summit",
    "ocean-express-summit",
  ],
};

function solve3(ata: number[][], b: number[]): [number, number, number] {
  const m = ata.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    const div = m[c][c];
    if (Math.abs(div) < 1e-14) throw new Error("Affine fit is singular");
    for (let k = c; k < 4; k++) m[c][k] /= div;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c];
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

/** Least-squares affine. Lat/lng are centered so the 3×3 system stays well conditioned. */
export function fitAffine(side: Side, points: { lat: number; lng: number; x: number; z: number }[]): Affine {
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng0 = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atx = [0, 0, 0];
  const atz = [0, 0, 0];
  for (const p of points) {
    const r = [p.lat - lat0, p.lng - lng0, 1];
    for (let i = 0; i < 3; i++) {
      atx[i] += r[i] * p.x;
      atz[i] += r[i] * p.z;
      for (let j = 0; j < 3; j++) ata[i][j] += r[i] * r[j];
    }
  }
  const [a, b, c] = solve3(ata, atx);
  const [d, e, f] = solve3(ata, atz);
  return { side, a, b, c, d, e, f, lat0, lng0 };
}

export function fitSide(side: Side, pois: Poi[]): Affine {
  const pts = CONTROL_IDS[side].map((id) => {
    const p = pois.find((q) => q.id === id);
    if (!p) throw new Error(`Missing control POI ${id}`);
    return { lat: p.lat, lng: p.lng, x: p.position[0], z: p.position[1] };
  });
  return fitAffine(side, pts);
}

export function project(aff: Affine, lat: number, lng: number): { x: number; z: number } {
  const la = lat - aff.lat0;
  const ln = lng - aff.lng0;
  return { x: aff.a * la + aff.b * ln + aff.c, z: aff.d * la + aff.e * ln + aff.f };
}

export function pointInRing(x: number, z: number, ring: Ring): boolean {
  let n = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    const denom = zj - zi;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (denom === 0 ? 1e-12 : denom) + xi) n++;
  }
  return n % 2 === 1;
}

export type Projection = {
  side: Side;
  x: number;
  z: number;
  inside: boolean;
};

/** Interactive-map GPS. Inverse-distance from the published survey pins. */
export function projectGps(lat: number, lng: number): { x: number; z: number } {
  const cos = Math.cos((lat * Math.PI) / 180);
  const scored = REFS.map((r) => {
    const dlat = (r[0] - lat) * 111_320;
    const dlng = (r[1] - lng) * 111_320 * cos;
    return { x: r[2], z: r[3], d2: dlat * dlat + dlng * dlng };
  }).sort((a, b) => a.d2 - b.d2);
  const nearest = scored.slice(0, 8);
  if (nearest[0].d2 < 4) return { x: nearest[0].x, z: nearest[0].z };
  let wsum = 0;
  let x = 0;
  let z = 0;
  for (const s of nearest) {
    const w = 1 / Math.max(4, s.d2);
    wsum += w;
    x += w * s.x;
    z += w * s.z;
  }
  return { x: x / wsum, z: z / wsum };
}

/**
 * Place a GPS fix on the interactive-map layout.
 * The side is whichever path network that point falls in.
 */
export function chooseProjection(
  lat: number,
  lng: number,
  _affines: Record<Side, Affine>,
  islands: Record<Side, Ring>,
): Projection {
  const p = projectGps(lat, lng);
  const inWf = pointInRing(p.x, p.z, islands.waterfront);
  const inSm = pointInRing(p.x, p.z, islands.summit);
  const side: Side = inWf && !inSm ? "waterfront" : inSm && !inWf ? "summit" : p.x < SIDE_SPLIT ? "waterfront" : "summit";
  return { side, x: p.x, z: p.z, inside: side === "waterfront" ? inWf : inSm };
}

/** Zone of the nearest interactive-map pin on this side. */
export function zoneAt(x: number, z: number, side: Side): string {
  let best = side === "waterfront" ? "Aqua City" : "Polar Adventure";
  let bestD = Infinity;
  for (const s of ZONE_SEEDS) {
    if (s.side !== side) continue;
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s.zone;
    }
  }
  return best;
}

/** Inverse of projectGps: model x,z back to latitude and longitude. */
export function modelToLatLng(x: number, z: number): { lat: number; lng: number } {
  const scored = REFS.map((r) => ({ lat: r[0], lng: r[1], d2: (r[2] - x) ** 2 + (r[3] - z) ** 2 })).sort(
    (a, b) => a.d2 - b.d2,
  );
  const nearest = scored.slice(0, 8);
  if (nearest[0].d2 < 1e-8) return { lat: nearest[0].lat, lng: nearest[0].lng };
  let wsum = 0;
  let lat = 0;
  let lng = 0;
  for (const s of nearest) {
    const w = 1 / Math.max(1e-4, s.d2);
    wsum += w;
    lat += w * s.lat;
    lng += w * s.lng;
  }
  return { lat: lat / wsum, lng: lng / wsum };
}

/** Meters per model unit, from the local Jacobian of the affine (northing). */
export function metersPerUnit(aff: Affine, lat: number, lng: number): number {
  const dLat = 0.0001;
  const northM = dLat * 111_320;
  const a = project(aff, lat, lng);
  const b = project(aff, lat + dLat, lng);
  const model = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6;
  return northM / model;
}

export function ringCentroid(ring: Ring): [number, number] {
  let x = 0;
  let z = 0;
  for (const p of ring) {
    x += p[0];
    z += p[1];
  }
  return [x / ring.length, z / ring.length];
}
