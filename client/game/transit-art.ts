import type Phaser from 'phaser';
import type { City } from '../../shared/types/city';
const point = (id: number) => ({ x: 840 + (id % 32 - Math.floor(id / 32)) * 24, y: (id % 32 + Math.floor(id / 32)) * 12 + 12 });
// One existing scene graphics batch. No passengers, windows or station DOM nodes.
export function drawTransit(g: Phaser.GameObjects.Graphics, city: City, network: boolean, zoom: number, focused: string | null) {
  if (!city.transit) return;
  const view = g.scene.cameras.main.worldView;
  const corridorSet=new Set(city.transit.corridors);
  for (const id of city.transit.corridors) {
    const p = point(id); if (!view.contains(p.x, p.y)) continue;
    const next = [id-1,id+1,id-32,id+32].filter(n=>corridorSet.has(n)&&Math.abs(n%32-id%32)+Math.abs(Math.floor(n/32)-Math.floor(id/32))===1);
    for (const n of next) if (n > id) { const q = point(n); g.lineStyle(1.6, 0x886052, .8); g.lineBetween(p.x + 3, p.y, q.x + 3, q.y); g.lineStyle(.3, 0xebddba, .9); g.lineBetween(p.x + 3, p.y, q.x + 3, q.y); }
  }
  if (network) for (const r of city.transit.routes) {
    if (r.path.length < 2 || !r.path.some(id => view.contains(point(id).x, point(id).y))) continue;
    if (r.id === focused) { g.lineStyle(6, 0xfff1cd, .9); g.strokePoints(r.path.map(point), false); }
    // Crowded services get a warm halo so pressure is visible without opening each route.
    if (r.crowding > 1 && r.status === 'active') { g.lineStyle(r.mode === 'brt' ? 6.5 : 5, 0xc0573d, Math.min(.75, .3 + (r.crowding - 1) * .3)); g.strokePoints(r.path.map(point), false); }
    g.lineStyle(r.mode === 'brt' ? 3.2 : 2, r.color, r.status === 'active' ? .95 : .35); g.strokePoints(r.path.map(point), false);
    if (r.mode === 'brt') { g.lineStyle(.5, 0xf5eddb, .8); g.strokePoints(r.path.map(point), false); }
  }
  for (const s of city.transit.stops) {
    const p = point(s.tileId); if (!view.contains(p.x, p.y)) continue;
    const scale = network ? Math.max(1, 1 / zoom) : 1;
    if (network) {
      g.fillStyle(0xf4f0df, .95); g.lineStyle(1 / zoom, 0x425e66);
      // Transfer points get a soft ring sized by transfers; hubs and depots read differently from stops.
      if (s.transfers > 0) { g.fillStyle(0x6a8f7a, .28); g.fillCircle(p.x, p.y, (6 + Math.min(6, Math.log10(1 + s.transfers) * 2)) * scale); g.fillStyle(0xf4f0df, .95); }
      if (s.kind === 'brt-station') { g.fillRect(p.x - 3 * scale, p.y - 3 * scale, 6 * scale, 6 * scale); g.strokeRect(p.x - 3 * scale, p.y - 3 * scale, 6 * scale, 6 * scale); }
      else if (s.kind === 'bus-terminal') { g.fillRoundedRect(p.x - 5 * scale, p.y - 3.5 * scale, 10 * scale, 7 * scale, 2 * scale); g.strokeRoundedRect(p.x - 5 * scale, p.y - 3.5 * scale, 10 * scale, 7 * scale, 2 * scale); }
      else if (s.kind === 'bus-depot') { g.fillStyle(0x51605f, .9); g.fillRect(p.x - 3 * scale, p.y - 3 * scale, 6 * scale, 6 * scale); g.strokeRect(p.x - 3 * scale, p.y - 3 * scale, 6 * scale, 6 * scale); }
      else { g.fillCircle(p.x, p.y, (s.kind === 'transport-interchange' ? 5 : 3) * scale); g.strokeCircle(p.x, p.y, (s.kind === 'transport-interchange' ? 5 : 3) * scale); if (s.kind === 'transport-interchange') g.strokeCircle(p.x, p.y, 2.5 * scale); }
      if (s.crowding > 1) { g.lineStyle(1 / zoom, 0xb65e46); g.strokeCircle(p.x, p.y, 7 * scale); }
    } else if (zoom >= .8) {
      if (s.kind === 'bus-stop') {
        g.lineStyle(.7, 0x727c79); g.lineBetween(p.x + 7, p.y, p.x + 7, p.y - 6);
        g.fillStyle(0x3f6e7e); g.fillRect(p.x + 5, p.y - 6, 4, 2);
        if (zoom > 1.5) { g.lineStyle(.6, 0x889391); g.lineBetween(p.x + 7, p.y - 4, p.x + 12, p.y - 2); g.fillStyle(0xd5d1bc); g.fillRect(p.x + 7, p.y - 4, 5, 1); }
      } else if (s.kind === 'brt-station') {
        g.fillStyle(0x3a4344, .22); g.fillEllipse(p.x, p.y + 2, 23, 6);
        g.fillStyle(0xb9bcb1); g.fillPoints([{ x: p.x - 11, y: p.y }, { x: p.x + 5, y: p.y - 4 }, { x: p.x + 11, y: p.y }, { x: p.x - 5, y: p.y + 4 }], true);
        g.lineStyle(.6, 0x617374); for (const dx of [-7, 0, 7]) g.lineBetween(p.x + dx, p.y, p.x + dx, p.y - 5);
        g.fillStyle(0x91a7a5, .7); g.fillRect(p.x - 7, p.y - 4, 14, 2);
        g.fillStyle(0xdddccf); g.fillPoints([{ x: p.x - 11, y: p.y - 5 }, { x: p.x + 5, y: p.y - 9 }, { x: p.x + 11, y: p.y - 5 }, { x: p.x - 5, y: p.y - 1 }], true);
      } else {
        g.fillStyle(0x969d91, .75); g.fillPoints([{ x: p.x - 19, y: p.y }, { x: p.x, y: p.y - 8 }, { x: p.x + 19, y: p.y }, { x: p.x, y: p.y + 8 }], true);
        g.lineStyle(.6, 0xd9d9ca); for (let i = 0; i < 4; i++) g.lineBetween(p.x - 13 + i * 5, p.y + 1, p.x - 7 + i * 5, p.y + 4);
        g.fillStyle(0x737e7a); g.fillPoints([{ x: p.x - 12, y: p.y - 7 }, { x: p.x, y: p.y - 12 }, { x: p.x + 9, y: p.y - 7 }, { x: p.x - 3, y: p.y - 2 }], true);
        g.lineStyle(.8, 0xc3c8bb); for (const dx of [-9, -2, 5]) g.lineBetween(p.x + dx, p.y - 5, p.x + dx, p.y);
        if (s.kind === 'transport-interchange') { g.lineStyle(1, 0xd6c18d); g.strokeCircle(p.x, p.y + 1, 6); }
      }
    }
  }
  if (zoom >= 1.2) for (const [key, treatment] of Object.entries(city.transit.junctions)) {
    const p = point(Number(key)); if (!view.contains(p.x, p.y)) continue;
    g.lineStyle(.7, 0x606c65); g.lineBetween(p.x + 7, p.y + 1, p.x + 7, p.y - 5);
    if (treatment === 'roundabout') { g.lineStyle(1, 0xc9c8b6); g.strokeEllipse(p.x, p.y, 9, 4); }
    else { g.fillStyle(treatment === 'signal' ? 0x657f66 : 0x9ca9a0); g.fillRect(p.x + 6, p.y - 5, 2, 3); }
  }
}
