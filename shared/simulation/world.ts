import type { City, Tile } from '../types/city';
export function tileAt(city: City, x: number, y: number): Tile | undefined {
  return x >= 0 && y >= 0 && x < city.size && y < city.size ? city.tiles[y * city.size + x] : undefined;
}
export function roadAccess(city: City, tile: Tile): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const next = tileAt(city, tile.x + dx, tile.y + dy);
    return next?.road && next.services.floodDepth < 90 && next.services.roadCondition >= 20;
  });
}
const neighbourCache = new Map<number, number[][]>();
export function neighbourhoods(size: number): number[][] {
  let cached = neighbourCache.get(size);
  if (cached) return cached;
  cached = Array.from({ length: size * size }, (_, id) => {
    const ids: number[] = [], x = id % size, y = Math.floor(id / size);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) ids.push(ny * size + nx);
    }
    return ids;
  });
  neighbourCache.set(size, cached); return cached;
}
export const clamp = (n: number, low = 0, high = 100) => Math.max(low, Math.min(high, n));
export const isOperating = (b: Tile['building']) => !!b && b.openedAt !== null && !b.abandoned;
export function stableHash(seed: number, id: number) {
  let n = Math.imul(seed + id, 374761393); n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
