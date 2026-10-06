import type { Building } from '../../shared/types/city';

// Presentation scale only. Mobility's calibrated 120 m graph lengths are unchanged.
export const WORLD_STYLE = { tileMetres: 20, tileWidth: 48, tileHeight: 24, origin: 840, atlasSize: 2048, cellSize: 128, atlasScale: 1.15 };
export type GraphicsQuality = 'low' | 'medium' | 'high';
export type VisualLod = 'far' | 'medium' | 'close';
export interface GraphicsOptions {
  quality: GraphicsQuality; shadows: boolean; props: boolean; vegetation: boolean; weather: boolean;
  bounds: boolean; anchors: boolean; depth: boolean; lod: boolean;
}
export const graphicsOptions = (quality: GraphicsQuality): GraphicsOptions => ({ quality, shadows: true, props: true, vegetation: true, weather: true, bounds: false, anchors: false, depth: false, lod: false });
export function visualLod(zoom: number, quality: GraphicsQuality): VisualLod {
  return zoom < (quality === 'low' ? 0.85 : 0.6) ? 'far' : zoom < (quality === 'high' ? 2 : quality === 'medium' ? 2.2 : 2.5) ? 'medium' : 'close';
}
export function visualVariant(b: Building) { return b.variant % 4; }
export function privatePropKinds(b: Building) {
  if (b.abandoned || b.constructionState !== 'complete') return [];
  return [...(b.generator >= 15 ? [`generator-${b.variant % 2}`] : []), ...(b.privateWater >= 15 ? ['tank'] : []), ...(b.privateBorehole ? ['pump'] : [])];
}
export const palette = { grass: 0x8b9a65, earth: 0xaf7752, sand: 0xc2ad82, plaster: 0xd9cfb5, concrete: 0xb8b5a8, zinc: 0x87918d, terracotta: 0xa76548, glass: 0x456b72, water: 0x4c8e93, shadow: 0x343e39 };
export function shade(color: number, amount: number) {
  const channel = (n: number) => Math.max(0, Math.min(255, Math.round(n + amount)));
  return (channel(color >> 16) << 16) | (channel((color >> 8) & 255) << 8) | channel(color & 255);
}
export function visualHash(seed: number, id: number) {
  let n = Math.imul(seed + id, 374761393); n = Math.imul(n ^ (n >>> 13), 1274126177); return (n ^ (n >>> 16)) >>> 0;
}
