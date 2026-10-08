import type { Building } from '../../shared/types/city';
import { architectureCatalog } from './architecture-catalog';

export interface PropSocket { x: number; y: number }
export interface ArchitectureAsset {
  id: string; type: string; level: number; variant: number; worldWidth: number;
  anchor: readonly number[]; visualHeight: number; footprint: string;
  sockets: Readonly<Record<string, PropSocket>>; lod: readonly number[];
}
export const benchmarkAssets: readonly ArchitectureAsset[] = architectureCatalog;
export const assetById = (id: string) => benchmarkAssets.find(a => a.id === id);

// Existing saved variants remain untouched. Artwork selection is presentation only.
export function benchmarkBuilding(b: Building): ArchitectureAsset | undefined {
  const level = b.pendingLevel ?? b.level;
  const supported = (b.type === 'residential' && level <= 2) || level === 1;
  if (!supported) return;
  if (b.constructionState !== 'complete') {
    return assetById(b.constructionState === 'site-preparation' || b.constructionProgress < 45
      ? 'construction-foundation' : 'construction-shell');
  }
  const variants = benchmarkAssets.filter(a => a.type === b.type && a.level === level);
  return variants[b.variant % variants.length];
}

export function benchmarkProp(kind: string, variant: number) {
  return assetById(kind === 'tank' ? variant % 2 ? 'tank-blue' : 'tank-black'
    : kind === 'pump' ? 'borehole-pump' : kind === 'generator-1' ? 'generator-enclosed' : 'generator-open');
}
