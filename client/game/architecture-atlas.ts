import type Phaser from 'phaser';
import { architectureSheets } from './architecture-catalog';
import { assetById } from './architecture-policy';
import type { GraphicsQuality, VisualLod } from './visual-style';

type Tier = 2 | 6 | 9 | 12;
const queue = (scene: Phaser.Scene, tier: Tier) => {
  for (const page of architectureSheets[tier]) {
    if (!scene.textures.exists(page.key)) scene.load.atlas(page.key,
      `/assets/architecture/${page.key}.png`, `/assets/architecture/${page.key}.json`);
  }
};
export function preloadArchitecture(scene: Phaser.Scene) { queue(scene, 2); }

// Keep a small city-view sheet and ONE detailed tier. High assets load only near the camera.
export class ArchitectureAtlas {
  private desired: Tier = 6;
  private loading = false;
  private used = new Set<Tier>();
  constructor(private scene: Phaser.Scene) {}
  begin(quality: GraphicsQuality, lod: VisualLod) {
    this.used.clear();
    this.desired = lod === 'far' ? 2 : lod === 'close' && quality !== 'low' ? quality === 'high' ? 12 : 9 : 6;
    const tier = this.desired;
    if (tier === 2 || this.loading || architectureSheets[tier].every(p => this.scene.textures.exists(p.key))) return;
    this.loading = true;
    queue(this.scene, tier);
    this.scene.load.once('complete', () => {
      this.loading = false;
      this.scene.events.emit('architecture-ready');
      // Redraw switches pooled sprites before obsolete textures are released.
      this.finish();
    });
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }
  resolve(key: string) {
    const asset = key.startsWith('benchmark-') ? assetById(key.slice(10)) : undefined;
    if (!asset) return;
    for (const tier of [this.desired, 12, 9, 6, 2] as Tier[]) {
      for (const p of architectureSheets[tier]) if (this.scene.textures.exists(p.key) && this.scene.textures.get(p.key).has(key)) {
        this.used.add(tier);
        return { texture: p.key, frame: key, scale: tier, ox: asset.anchor[0], oy: asset.anchor[1], vector: false };
      }
    }
  }
  finish() {
    for (const tier of [6, 9, 12] as const) if (tier !== this.desired && !this.used.has(tier)) {
      for (const p of architectureSheets[tier]) if (this.scene.textures.exists(p.key)) this.scene.textures.remove(p.key);
    }
  }
  get memoryMiB() {
    return ([2, 6, 9, 12] as const).reduce((total, tier) => total + architectureSheets[tier]
      .filter(p => this.scene.textures.exists(p.key)).reduce((sum, p) => sum + p.width * p.height * 4 / 1048576, 0), 0);
  }
}
