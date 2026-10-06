import { shade } from './visual-style';
export interface Point { x: number; y: number }
// Small structural drawing interface: vector authoring can target either a baked Canvas atlas or Phaser Graphics.
export interface ArtPen {
  fillStyle(color: number, alpha?: number): unknown; lineStyle(width: number, color: number, alpha?: number): unknown;
  fillPoints(points: Point[], close?: boolean): unknown; strokePoints(points: Point[], close?: boolean): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown; strokeRect(x: number, y: number, w: number, h: number): unknown;
  fillEllipse(x: number, y: number, w: number, h: number): unknown; fillCircle(x: number, y: number, r: number): unknown;
  fillRoundedRect(x: number, y: number, w: number, h: number, r: number): unknown;
  lineBetween(x: number, y: number, x2: number, y2: number): unknown;
}
// Vector overflow retains the same weather/data-overlay tint as atlas sprites.
export function tintedPen(g: ArtPen, tint: number): ArtPen {
  const color = (c: number) => (Math.round((c >> 16 & 255) * (tint >> 16 & 255) / 255) << 16)
    | (Math.round((c >> 8 & 255) * (tint >> 8 & 255) / 255) << 8)
    | Math.round((c & 255) * (tint & 255) / 255);
  return {
    fillStyle: (c, a) => g.fillStyle(color(c), a),
    lineStyle: (w, c, a) => g.lineStyle(w, color(c), a),
    fillPoints: (p, close) => g.fillPoints(p, close), strokePoints: (p, close) => g.strokePoints(p, close),
    fillRect: (x, y, w, h) => g.fillRect(x, y, w, h), strokeRect: (x, y, w, h) => g.strokeRect(x, y, w, h),
    fillEllipse: (x, y, w, h) => g.fillEllipse(x, y, w, h), fillCircle: (x, y, r) => g.fillCircle(x, y, r),
    fillRoundedRect: (x, y, w, h, r) => g.fillRoundedRect(x, y, w, h, r),
    lineBetween: (x, y, x2, y2) => g.lineBetween(x, y, x2, y2)
  };
}
export const project = (x: number, y: number, u: number, v: number, z = 0): Point => ({ x: x + (u - v) * 24, y: y + (u + v) * 12 - z });
export function poly(g: ArtPen, color: number, points: Point[], alpha = 1) { g.fillStyle(color, alpha); g.fillPoints(points, true); }
export function ground(g: ArtPen, x: number, y: number, u: number, v: number, w: number, d: number, color: number, alpha = 1) {
  poly(g, color, [project(x,y,u,v), project(x,y,u+w,v), project(x,y,u+w,v+d), project(x,y,u,v+d)], alpha);
}
export function box(g: ArtPen, x: number, y: number, u: number, v: number, w: number, d: number, h: number, color: number, base = 0) {
  const p = (a: number, b: number, z: number) => project(x,y,a,b,z+base);
  poly(g, shade(color,-26), [p(u+w,v,0),p(u+w,v+d,0),p(u+w,v+d,h),p(u+w,v,h)]);
  poly(g, shade(color,5), [p(u,v+d,0),p(u+w,v+d,0),p(u+w,v+d,h),p(u,v+d,h)]);
  poly(g, shade(color,19), [p(u,v,h),p(u+w,v,h),p(u+w,v+d,h),p(u,v+d,h)]);
}
export function contactShadow(g: ArtPen, x: number, y: number, w = 30, d = 10) {
  for (const [spread, opacity] of [[5,.035],[2,.06],[0,.12]]) { g.fillStyle(0x333e35,opacity); g.fillEllipse(x+2,y,w+spread,d+spread*.5); }
}
export function castShadow(g: ArtPen, x: number, y: number, height: number, width: number) {
  const offset = Math.min(27,height*.38);
  for (let n = 3; n >= 0; n--) poly(g,0x475349,[{x:x-width-n,y:y+4},{x:x+width+n,y:y+4},{x:x+width+offset+n,y:y+10+offset*.35},{x:x+offset-width-n,y:y+10+offset*.35}],.027);
}
export class CanvasPen implements ArtPen {
  constructor(private c: CanvasRenderingContext2D) {}
  private fill = '#000'; private stroke = '#000'; private fa = 1; private sa = 1; private width = 1;
  fillStyle(color: number, alpha = 1) { this.fill = `#${color.toString(16).padStart(6,'0')}`; this.fa=alpha; }
  lineStyle(width: number, color: number, alpha = 1) { this.stroke=`#${color.toString(16).padStart(6,'0')}`; this.sa=alpha; this.width=width; }
  private path(p: Point[], close: boolean) { this.c.beginPath(); p.forEach((v,i)=>i ? this.c.lineTo(v.x,v.y) : this.c.moveTo(v.x,v.y)); if(close) this.c.closePath(); }
  private paint() { this.c.fillStyle=this.fill; this.c.globalAlpha=this.fa; this.c.fill(); this.c.globalAlpha=1; }
  private outline() { this.c.strokeStyle=this.stroke; this.c.globalAlpha=this.sa; this.c.lineWidth=this.width; this.c.lineJoin='round'; this.c.stroke(); this.c.globalAlpha=1; }
  fillPoints(p: Point[], close=true) { this.path(p,close); this.paint(); }
  strokePoints(p: Point[], close=false) { this.path(p,close); this.outline(); }
  fillRect(x:number,y:number,w:number,h:number) { this.c.beginPath(); this.c.rect(x,y,w,h); this.paint(); }
  strokeRect(x:number,y:number,w:number,h:number) { this.c.beginPath(); this.c.rect(x,y,w,h); this.outline(); }
  fillEllipse(x:number,y:number,w:number,h:number) { this.c.beginPath(); this.c.ellipse(x,y,w/2,h/2,0,0,Math.PI*2); this.paint(); }
  fillCircle(x:number,y:number,r:number) { this.fillEllipse(x,y,r*2,r*2); }
  fillRoundedRect(x:number,y:number,w:number,h:number,r:number) { this.c.beginPath(); this.c.roundRect(x,y,w,h,r); this.paint(); }
  lineBetween(x:number,y:number,x2:number,y2:number) { this.path([{x,y},{x:x2,y:y2}],false); this.outline(); }
}
