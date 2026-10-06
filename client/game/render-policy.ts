import type { GraphicsQuality } from './visual-style';

export const MAX_ZOOM = 6;
export const DPR_CAP = { low: 1, medium: 1.5, high: 2 } as const;
export const DETAIL_PAGE_LIMIT = { low: 2, medium: 3, high: 5 } as const;
export function renderLayout(width: number, height: number, dpr: number, quality: GraphicsQuality) {
  const pixels = { low: 2_500_000, medium: 4_500_000, high: 8_400_000 }[quality];
  const ratio = Math.max(1, Math.min(Number.isFinite(dpr) ? dpr : 1, DPR_CAP[quality], Math.sqrt(pixels / (width * height))));
  return { width, height, dpr: ratio, backingWidth: Math.round(width * ratio), backingHeight: Math.round(height * ratio) };
}
// Native source samples cover the physical display. Close high art reaches 12 pixels/world unit.
export function sourceScale(zoom: number, dpr: number, quality: GraphicsQuality) {
  if (zoom < .6) return 1.15;
  const required = zoom * dpr;
  if (required <= 3 || zoom < 1.5) return 4;
  if (quality === 'low') return 6;
  if (quality === 'medium') return required <= 6 ? 8 : 9;
  return required <= 6 && zoom < 4 ? 8 : 12;
}
export function anchoredScroll(world: number, screen: number, viewport: number, zoom: number) {
  return world - viewport / 2 - (screen - viewport / 2) / zoom;
}
export function zoomAnchor(point: {x:number;y:number}, world: {x:number;y:number}) {
  // Phaser Pointer exposes x/y as prototype getters; object spread drops them.
  return { x: point.x, y: point.y, worldX: world.x, worldY: world.y };
}
export function zoomStep(current: number, target: number, delta: number) {
  return Math.abs(current - target) < .0005 ? target : current + (target - current) * (1 - Math.exp(-Math.min(delta, 100) / 85));
}
