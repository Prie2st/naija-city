import type Phaser from 'phaser';
import type { City } from '../../shared/types/city';
import type { CityActivity } from '../../shared/types/living';
import { agentCaps, vehiclePlan, type VehiclePlan } from './activity-policy';
import type { GraphicsQuality } from './visual-style';
import { ART_ATLAS, VEHICLE_ATLAS, ATLAS_ANCHOR } from './art-atlas';
import { WORLD_STYLE } from './visual-style';
import type { ModelAtlas } from './model-atlas';
interface Vehicle { plan: VehiclePlan; position: number; direction: number; wait: number; lastStop: number }
const point = (id: number) => ({ x: 840 + (id % 32 - Math.floor(id / 32)) * 24, y: (id % 32 + Math.floor(id / 32)) * 12 + 12 });
const roadPosition = (path: number[], position: number, direction: number) => {
  const index = Math.min(path.length - 2, Math.max(0, Math.floor(position))), f = position - index;
  const a = point(path[index]), b = point(path[index + 1]);
  const angle = Math.atan2(b.y - a.y, b.x - a.x) + (direction < 0 ? Math.PI : 0);
  return { x: a.x + (b.x - a.x) * f - Math.sin(angle) * 2, y: a.y + (b.y - a.y) * f + Math.cos(angle) * 2 };
};
// Rendering-only fixed pool. No traveler entities, routing, or save state live here.
export class TrafficArt {
  private sprites: Phaser.GameObjects.Image[] = [];
  constructor(private scene: Phaser.Scene,private models?:ModelAtlas) {}
  private pool: Vehicle[] = [];
  count = 0;
  private city: City | null = null;
  private nextPlan = 0;
  private lastFrame = 0;
  get allocated() { return this.sprites.length; }
  get pausedTransit() { return this.pool.filter(v => v.plan.routeId && v.wait > 0).length; }
  get modeCounts() { return this.pool.reduce((counts, v) => { counts[v.plan.mode] = (counts[v.plan.mode] ?? 0) + 1; return counts; }, {} as Record<string, number>); }
  update(g: Phaser.GameObjects.Graphics, city: City, time: number, zoom: number, mobile: boolean, speed: number, snapshot: CityActivity, quality: GraphicsQuality = mobile ? 'medium' : 'high', width = mobile ? 430 : 1440, height = mobile ? 932 : 900) {
    const dt = this.lastFrame ? Math.min(100, time - this.lastFrame) : 100;
    if (dt < (mobile ? 60 : 30)) return;
    this.lastFrame = time;
    const activity = snapshot;
    const camera = this.scene.cameras.main, view = camera.worldView;
    if (city !== this.city || time >= this.nextPlan) {
      if (city !== this.city) this.pool = [];
      this.city = city; this.nextPlan = time + 350;
      const visible = new Set(city.tiles.flatMap((t, id) => t.road && view.contains(point(id).x, point(id).y) ? [id] : []));
      const cap = agentCaps(quality, zoom, width, height).vehicles;
      const previous = new Map(this.pool.map(v => [v.plan.key, v]));
      this.pool = vehiclePlan(city, activity, visible, cap).filter(p=>zoom>=.6||p.mode!=='police-car').map((plan, i) => {
        const old = previous.get(plan.key);
        if (old && old.plan.path[0] === plan.path[0] && old.plan.path.at(-1) === plan.path.at(-1)) {
          old.plan = plan; old.position = Math.min(old.position, plan.path.length - 1);
          const p = roadPosition(plan.path, old.position, old.direction);
          if(plan.mode==='police-car')return old;
          if (old.position < plan.path.length - 1.05 && view.contains(p.x,p.y)) return old;
        }
        // Spacing contracts as measured congestion rises. Vehicles remain representatives.
        const crowded = plan.path.some(id => (activity.roads[id]?.congestion ?? 0) > 65);
        const direction = plan.routeId && i % 2 ? -1 : 1;
        const indices = new Set(plan.path.flatMap((id,index) => visible.has(id) ? [Math.max(0,index-1),Math.min(plan.path.length-2,index)] : []));
        const positions = [...indices].flatMap(index => [0.1,0.3,0.5,0.7,0.9].map(f => index+f)).filter(position => { const p=roadPosition(plan.path,position,direction); return view.contains(p.x,p.y); }).sort((a,b)=>a-b);
        const position = plan.mode==='police-car'?0:positions[crowded ? Math.min(positions.length-1,Math.floor(positions.length/2)+i%3) : i%positions.length] ?? 0;
        return { plan, position, direction, wait: 0, lastStop: -1 };
      });
    }
    g.clear(); for (const sprite of this.sprites) sprite.setVisible(false); this.count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const v = this.pool[i], path = v.plan.path, length = path.length - 1;
      const at = Math.min(length - 1, Math.floor(v.position)), tile = city.tiles[path[at]];
      if (!tile.road || tile.services.floodDepth >= 90) continue;
      const planned=city.transit?.routes.find(r=>r.id===v.plan.routeId);
      const roadSpeed = planned?.mode==='brt'?planned.speed:activity.roads[path[at]]?.speed ?? tile.mobility.speed;
      if (v.wait > 0) v.wait = Math.max(0, v.wait - dt / 1000 * speed);
      else v.position += dt / 1000 * speed * roadSpeed / 35 * v.direction;
      if (v.position >= length || v.position <= 0) {
        if(v.plan.mode==='police-car'){v.position=Math.max(.001,Math.min(length-.001,v.position));v.direction*=-1;v.wait=1.2;}
        else if (v.plan.routeId) { v.position = Math.max(0, Math.min(length - 0.001, v.position)); v.direction *= -1; }
        else v.position = 0; // Recycle at the origin; commuter direction belongs to the OD snapshot.
        v.lastStop = -1;
      }
      const a = Math.min(length - 1, Math.floor(v.position)), fraction = v.position - a;
      const stopId = path[Math.round(v.position)];
      if (v.plan.routeId && Math.abs(v.position - Math.round(v.position)) < 0.1 && v.lastStop !== stopId && (city.mobility.stops.some(s => s.tileId === stopId && s.routes.includes(v.plan.routeId!))||city.transit?.stops.some(s=>s.anchor===stopId&&s.routes.includes(v.plan.routeId!)))) { v.wait = 0.6; v.lastStop = stopId; }
      const start = point(path[a]), end = point(path[a + 1]);
      const x = start.x + (end.x - start.x) * fraction, y = start.y + (end.y - start.y) * fraction;
      const angle = Math.atan2(end.y - start.y, end.x - start.x) + (v.direction < 0 ? Math.PI : 0), side = v.plan.transitMode==='brt'?4:2;
      const heading = Math.cos(angle) > 0 ? Math.sin(angle) > 0 ? 0 : 3 : Math.sin(angle) > 0 ? 1 : 2;
      let sprite = this.sprites[i];
      if(!sprite) { sprite=this.scene.add.image(0,0,ART_ATLAS).setOrigin(ATLAS_ANCHOR.x,ATLAS_ANCHOR.y);this.sprites[i]=sprite; }
      const px=x-Math.sin(angle)*side, py=y+Math.cos(angle)*side;
      if(!camera.worldView.contains(px,py))continue;
      const detailed=this.scene.textures?.exists(VEHICLE_ATLAS);
      const model=this.models?.resolve(`model-vehicle-${v.plan.mode}-${heading}`);
      sprite.setTexture(model?.texture??(detailed?VEHICLE_ATLAS:ART_ATLAS),model?.frame??`vehicle-${v.plan.mode}-${heading}`)
        .setOrigin(model?.ox??ATLAS_ANCHOR.x,model?.oy??ATLAS_ANCHOR.y)
        .setPosition(px,py).setScale(model?1/model.scale:detailed?1/12:1/WORLD_STYLE.atlasScale)
        .setDepth(1+py/1000).setTint(v.plan.color??(v.plan.mode==='police-car'?0xffffff:i%3===0?0xe6dfce:0xffffff)).setVisible(true);
      this.count++;

    }
    this.models?.flush();
  }
}
export function drawTransportNetwork(g: Phaser.GameObjects.Graphics, city: City, showLines: boolean) {
  if (showLines) {
    for (const f of city.mobility.flows.filter(f => f.trips >= 30).slice(0, 32)) { g.lineStyle(1, 0x9e6b58, 0.25); g.strokePoints(f.path.map(point), false); }
    for (const r of city.mobility.routes) { g.lineStyle(r.mode === 'bus' ? 4 : 2.5, r.mode === 'bus' ? 0x3b765b : r.mode === 'danfo' ? 0xd29a32 : 0x7179a3, r.reliability ? 0.9 : 0.35); g.strokePoints(r.path.map(point), false); }
  }
  for (const stop of city.mobility.stops) {
    const p = point(stop.tileId); g.fillStyle(stop.designated ? 0x4c785f : 0xd4ad5b); g.fillCircle(p.x + 9, p.y - 2, showLines ? 3.5 : 2);
    if (stop.designated) { g.fillStyle(0xe1d8b8); g.fillRect(p.x + 7, p.y - 7, 7, 3); g.lineStyle(1, 0x597259); g.lineBetween(p.x + 8, p.y - 4, p.x + 8, p.y); }
  }
  for (const hub of city.mobility.hubs) { const p = point(hub.tileId); g.lineStyle(2, 0xf4dda4); g.strokeCircle(p.x, p.y, 10); }
}
