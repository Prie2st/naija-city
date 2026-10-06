import type { Terrain } from '../types/city';

// Coordinate hashing and smooth value noise produce repeatable groves, not a scatter grid.
function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  return mix(mix(hash(ix, iy, seed), hash(ix + 1, iy, seed), fx),
    mix(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), fx), fy);
}
export function terrainAt(x: number, y: number, seed: number): Terrain {
  const bank = 25 + Math.sin(y / 5) * 2;
  if (x > bank + 1) return 'water';
  if (x > bank) return 'wetland';
  // Open land around the founding settlement makes its first expansion readable.
  const clearing = Math.hypot((x - 13) / 1.2, y - 13) < 5;
  const density = noise(x / 6, y / 6, seed) * 0.8 + noise(x / 3, y / 3, seed + 41) * 0.2;
  return !clearing && density > 0.56 ? 'vegetation' : 'land';
}
