/** Interactive map sheet, OP_map.jpg, is 2678×2190. y grows south, same as model z. */
export const MAP_W = 2678;
export const MAP_H = 2190;
export const SCALE = 0.016;
export const ORIGIN_X = 1339;
export const ORIGIN_Y = 1095;
/** Pixel x where the Waterfront paths end and the Summit paths begin. */
export const SIDE_PX = 1200;

export function toModel(px: number, py: number): [number, number] {
  return [(px - ORIGIN_X) * SCALE, (py - ORIGIN_Y) * SCALE];
}

export function toPixel(x: number, z: number): [number, number] {
  return [x / SCALE + ORIGIN_X, z / SCALE + ORIGIN_Y];
}

export const SIDE_SPLIT = (SIDE_PX - ORIGIN_X) * SCALE;

/** A drawn road. Drops the zero-length duplicates in the published file. */
export function usablePath(line: number[][]): boolean {
  if (line.length < 2) return false;
  let span = 0;
  for (let i = 1; i < line.length; i++) {
    span += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  }
  return span >= 8;
}
