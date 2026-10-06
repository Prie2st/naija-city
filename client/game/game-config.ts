import Phaser from 'phaser';
import { renderLayout } from './render-policy';
import type { GraphicsQuality } from './visual-style';

export function gameConfig(scene: Phaser.Scene, quality: GraphicsQuality): Phaser.Types.Core.GameConfig {
  const layout = renderLayout(innerWidth, innerHeight, devicePixelRatio, quality);
  return {
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#c8c5ac',
    // Phaser 3.90 has no game-resolution multiplier. NONE separates physical pixels from CSS size.
    scale: { mode: Phaser.Scale.NONE, width: layout.backingWidth, height: layout.backingHeight, zoom: 1 / layout.dpr, autoRound: false },
    input: { activePointers: 3, touch: true }, scene: [scene],
    // Canvas-authored edges retain anti-aliasing; DPR supersampling smooths vector geometry.
    // Avoid an additional multisampled framebuffer on top of high-DPI rendering.
    render: { antialias: true, antialiasGL: false, pixelArt: false, roundPixels: false }
  };
}
