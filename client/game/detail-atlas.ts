import type Phaser from 'phaser';
import { CanvasPen, type ArtPen, type Point } from './art-primitives';
import { ART_ATLAS, ATLAS_ANCHOR, drawArtFrame } from './art-atlas';
import { DETAIL_PAGE_LIMIT } from './render-policy';
import type { GraphicsQuality } from './visual-style';

export class ArtBounds implements ArtPen {
  left = Infinity; top = Infinity; right = -Infinity; bottom = -Infinity;
  private width = 0;
  fillStyle() {} lineStyle(width: number) { this.width = width; }
  private point(x: number, y: number, margin = 0) { this.left = Math.min(this.left, x - margin); this.right = Math.max(this.right, x + margin); this.top = Math.min(this.top, y - margin); this.bottom = Math.max(this.bottom, y + margin); }
  fillPoints(p: Point[]) { p.forEach(q => this.point(q.x, q.y)); }
  strokePoints(p: Point[]) { p.forEach(q => this.point(q.x, q.y, this.width / 2)); }
  fillRect(x: number, y: number, w: number, h: number) { this.point(x, y); this.point(x + w, y + h); }
  strokeRect(x: number, y: number, w: number, h: number) { this.point(x, y, this.width / 2); this.point(x + w, y + h, this.width / 2); }
  fillEllipse(x: number, y: number, w: number, h: number) { this.point(x - w / 2, y - h / 2); this.point(x + w / 2, y + h / 2); }
  fillCircle(x: number, y: number, r: number) { this.fillEllipse(x, y, r * 2, r * 2); }
  fillRoundedRect(x: number, y: number, w: number, h: number) { this.fillRect(x, y, w, h); }
  lineBetween(x: number, y: number, x2: number, y2: number) { this.point(x, y, this.width / 2); this.point(x2, y2, this.width / 2); }
  size(scale: number) {
    const left = Math.floor((this.left - 1) * scale), top = Math.floor((this.top - 1) * scale);
    return { left, top, width: Math.ceil((this.right + 1) * scale) - left, height: Math.ceil((this.bottom + 1) * scale) - top };
  }
}
interface Frame { texture: string; frame: string; scale: number; ox: number; oy: number; vector?: boolean }
interface Page { key: string; texture: Phaser.Textures.CanvasTexture; ctx: CanvasRenderingContext2D; x: number; y: number; rowHeight: number; used: boolean; dirty: boolean; age: number }
// Tight shelf packing, transparent gutters and batched uploads. No persistent city state.
export class DetailAtlas {
  private pages: Page[] = [];
  private frames = new Map<string, Frame>();
  private serial = 0; private age = 0; private limit = 5;
  private tier = '';
  fallbackCount = 0;
  constructor(private scene: Phaser.Scene) {}
  private supplied(key: string, scale: number, close: boolean): Frame | null {
    const texture=`city-master-${scale}-${close?'close':'medium'}`;
    if(!this.scene.textures.exists?.(texture)||!this.scene.textures.get(texture).has(key))return null;
    // Professional sheets preserve a 128-world-unit untrimmed cell, then use normal atlas trim metadata.
    return {texture,frame:key,scale,ox:ATLAS_ANCHOR.x,oy:ATLAS_ANCHOR.y};
  }
  begin(quality: GraphicsQuality, scale: number, close: boolean) {
    this.limit = DETAIL_PAGE_LIMIT[quality]; this.age++; this.fallbackCount = 0;
    const tier=`${scale}:${close}:${this.limit}`;
    if(tier!==this.tier){for(const page of [...this.pages])this.remove(page);this.tier=tier;}
    this.pages.forEach(p => p.used = false);
  }
  prepare(keys: Set<string>, scale: number, close: boolean) {
    if(scale<=1.15)return;
    const fresh: {key:string;height:number}[]=[];
    for(const key of keys){
      if(this.supplied(key,scale,close))continue;
      const frame=this.frames.get(`${scale}:${close?'close':'medium'}:${key}`);
      if(frame){const page=this.pages.find(p=>p.key===frame.texture)!;page.used=true;page.age=this.age;}
      else{const bounds=new ArtBounds();drawArtFrame(bounds,key,close);fresh.push({key,height:bounds.size(scale).height});}
    }
    // Tall architecture first avoids fragmented shelves and protects this view from LRU eviction.
    for(const {key}of fresh.sort((a,b)=>b.height-a.height))this.resolve(key,scale,close);
  }
  resolve(key: string, scale: number, close: boolean): Frame {
    const base = { texture: ART_ATLAS, frame: key, scale: 1.15, ox: ATLAS_ANCHOR.x, oy: ATLAS_ANCHOR.y };
    if (scale <= 1.15) return base;
    const supplied=this.supplied(key,scale,close);if(supplied)return supplied;
    const id = `${scale}:${close ? 'close' : 'medium'}:${key}`;
    const cached = this.frames.get(id);
    if (cached) { const page = this.pages.find(p => p.key === cached.texture)!; page.used = true; page.age = this.age; return cached; }
    const bounds = new ArtBounds(); drawArtFrame(bounds, key, close); const size = bounds.size(scale);
    const width = size.width + 4, height = size.height + 4;
    let page = this.pages.find(p => this.fits(p, width, height));
    if (!page) {
      if (this.pages.length >= this.limit) {
        const old = this.pages.filter(p => !p.used).sort((a, b) => a.age - b.age)[0];
        // Preserve sharpness under cache pressure; WorldArt draws the vector master directly.
        if (!old) { this.fallbackCount++; return { ...base, vector: true }; }
        this.remove(old);
      }
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
      const key = `city-detail-${this.serial++}`;
      page = { key, texture: this.scene.textures.addCanvas(key, canvas)!, ctx: canvas.getContext('2d')!, x: 0, y: 0, rowHeight: 0, used: true, dirty: false, age: this.age };
      this.pages.push(page);
    }
    if (page.x + width > 2048) { page.y += page.rowHeight; page.x = 0; page.rowHeight = 0; }
    const x = page.x + 2, y = page.y + 2, ctx = page.ctx;
    ctx.save(); ctx.translate(x - size.left, y - size.top); ctx.scale(scale, scale); drawArtFrame(new CanvasPen(ctx), key, close); ctx.restore();
    page.texture.add(id, 0, x, y, size.width, size.height);
    page.x += width; page.rowHeight = Math.max(page.rowHeight, height); page.used = page.dirty = true; page.age = this.age;
    const frame = { texture: page.key, frame: id, scale, ox: -size.left / size.width, oy: -size.top / size.height };
    this.frames.set(id, frame); return frame;
  }
  private fits(page: Page, width: number, height: number) { return width <= 2048 && height <= 2048 && (page.x + width <= 2048 ? page.y + height <= 2048 : page.y + page.rowHeight + height <= 2048); }
  private remove(page: Page) { for (const [id, frame] of this.frames) if (frame.texture === page.key) this.frames.delete(id); this.scene.textures.remove(page.key); this.pages = this.pages.filter(p => p !== page); }
  finish() {
    for (const p of this.pages) if (p.dirty) { p.texture.refresh(); p.dirty = false; }
    // Lowering quality releases excess unused pages instead of retaining desktop memory on a phone.
    for (const p of [...this.pages].filter(p => !p.used).sort((a, b) => a.age - b.age)) if (this.pages.length > this.limit) this.remove(p);
  }
  get memoryMiB() { return 16 + this.pages.length * 16; }
  get pageCount() { return this.pages.length; }
}
