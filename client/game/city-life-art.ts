import type Phaser from 'phaser';
import type { City } from '../../shared/types/city';
import type { CityActivity } from '../../shared/types/living';
import type { GraphicsQuality } from './visual-style';
import { agentCaps } from './activity-policy';
import { CanvasPen, box, ground, project } from './art-primitives';

const TEXTURE = 'city-life-detail';
const point = (id: number) => ({ x: 840 + (id % 32 - Math.floor(id / 32)) * 24, y: (id % 32 + Math.floor(id / 32)) * 12 + 12 });
interface Walker { key: string; points: { x: number; y: number }[]; position: number; variant: number; waiting: boolean }
// Native 12-sample detail sheet extends the established Canvas atlas pipeline, not a new renderer.
function createLifeAtlas(scene: Phaser.Scene) {
  if (scene.textures.exists(TEXTURE)) return;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const c = canvas.getContext('2d')!, frames: { key: string; x: number; y: number }[] = [];
  for (let variant = 0; variant < 8; variant++) {
    const x = variant * 64;
    c.save(); c.translate(x + 32, 80); c.scale(12, 12);
    c.fillStyle = '#38443f55'; c.beginPath(); c.ellipse(0.3, 0.1, 0.8, 0.3, 0, 0, Math.PI * 2); c.fill();
    c.lineWidth = 0.3; c.strokeStyle = '#424744'; c.beginPath(); c.moveTo(-0.18, -0.75); c.lineTo(-0.35, 0); c.moveTo(0.16, -0.75); c.lineTo(0.35, -0.04); c.stroke();
    c.fillStyle = ['#586b82', '#b78966', '#d4cab4', '#6f8375', '#8d7486', '#c0ab72', '#666b72', '#889d9c'][variant];
    c.fillRect(-0.35, -1.9, 0.7, variant % 3 === 0 ? 1.4 : 1.1);
    c.fillStyle = ['#91684e', '#715541', '#ac8062'][variant % 3]; c.beginPath(); c.arc(0, -2.22, 0.33, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#99765b'; c.lineWidth = 0.22; c.beginPath(); c.moveTo(-0.38, -1.6); c.lineTo(-0.55, -1.05); c.stroke();
    if (variant % 3 === 1) { c.fillStyle = '#857b5e'; c.fillRect(0.4, -1.1, 0.4, 0.55); }
    c.restore(); frames.push({ key: `person-${variant}`, x, y: 0 });
  }
  for (let variant = 0; variant < 3; variant++) {
    const x = variant * 256, y = 128;
    c.save(); c.translate(x + 128, y + 100); c.scale(12, 12);
    const pen = new CanvasPen(c);
    ground(pen, 0, 0, -0.28, -0.22, 0.56, 0.44, 0xa8a392, 0.6);
    for (let n = 0; n < variant + 2; n++) {
      const u = -0.22 + n * 0.14;
      box(pen, 0, 0, u, -0.13, 0.12, 0.17, 1, 0x8c8270);
      const a = project(0, 0, u - 0.01, -0.14, 3.3), b = project(0, 0, u + 0.13, -0.14, 3.3), d = project(0, 0, u + 0.13, 0.09, 2.7), e = project(0, 0, u - 0.01, 0.09, 2.7);
      pen.fillStyle(n % 2 ? 0x8d775d : 0x6e8882); pen.fillPoints([a, b, d, e], true);
      pen.lineStyle(0.18, 0xd4cdb8); pen.strokePoints([a, b, d, e], true);
      const q = project(0, 0, u + 0.04, 0.06, 1.2); pen.fillStyle(0xa79356); pen.fillCircle(q.x, q.y, 0.5);
    }
    c.restore(); frames.push({ key: `market-${variant}`, x, y });
  }
  const texture = scene.textures.addCanvas(TEXTURE, canvas)!;
  for (const f of frames) texture.add(f.key, 0, f.x, f.y, f.key.startsWith('market') ? 256 : 64, f.key.startsWith('market') ? 192 : 96);
  texture.setFilter(0);
}

export class CityLifeArt {
  private images: Phaser.GameObjects.Image[] = [];
  private marketImages: Phaser.GameObjects.Image[] = [];
  private walkers: Walker[] = [];
  private nextPlan = 0;
  private city: City | null = null;
  private lastFrame = 0;
  count = 0; network: CityActivity['pedestrianNetwork'] = [];
  private revision = -1;
  private lamps: Phaser.GameObjects.Graphics;
  private lampStamp='';
  constructor(private scene: Phaser.Scene) { createLifeAtlas(scene); this.lamps=scene.add.graphics().setDepth(2.9); }
  update(city: City, activity: CityActivity, time: number, zoom: number, quality: GraphicsQuality, speed: number, width: number, height: number) {
    const dt = this.lastFrame ? Math.min(100, time - this.lastFrame) / 1000 : 0;
    this.lastFrame = time;
    if (city !== this.city || this.revision !== city.mobility.revision) {
      this.network = activity.pedestrianNetwork; this.revision = city.mobility.revision; this.nextPlan = 0;
      if (city !== this.city) {this.walkers = [];this.lampStamp='';}
      this.city = city;
    }
    this.network = activity.pedestrianNetwork;
    const view = this.scene.cameras.main.worldView, caps = agentCaps(quality, zoom, width, height);
    const lampStamp=`${city.tick}:${activity.lighting}:${Math.round(zoom*10)}:${Math.round(view.x/12)}:${Math.round(view.y/12)}:${quality}`;
    if(lampStamp!==this.lampStamp){this.lampStamp=lampStamp;this.lamps.clear();
      if(zoom>=1.15&&(activity.lighting==='night'||activity.lighting==='evening')){let count=0;for(let id=0;id<city.tiles.length;id++){const t=city.tiles[id],light=city.safety?.local[id].lighting??0;if(!t.road||light<25||id%2)continue;const p=point(id);if(!view.contains(p.x,p.y))continue;if(count++>({low:16,medium:40,high:64}[quality]))break;this.lamps.fillStyle(0xffdfa0,light/100*.18);this.lamps.fillEllipse(p.x+7,p.y+2,7,3);this.lamps.lineStyle(.4,0x6c7370);this.lamps.lineBetween(p.x+7,p.y+1,p.x+7,p.y-3);this.lamps.fillStyle(0xffe4a7,light/100*.8);this.lamps.fillCircle(p.x+7,p.y-3,.65);}}
    }
    if (time >= this.nextPlan) {
      this.nextPlan = time + 400;
      const previous = new Map(this.walkers.map(w => [w.key, w])), walkers: Walker[] = [];
      const add = (key: string, points: Walker['points'], amount: number, waiting = false) => {
        const count = Math.min(waiting ? 6 : 5, Math.floor(amount));
        for (let n = 0; n < count && walkers.length < caps.pedestrians; n++) {
          const id = `${key}:${n}`;
          walkers.push(previous.get(id) ?? { key: id, points, position: (n * 0.37 % 1) * (points.length - 1), variant: (walkers.length + n) % 8, waiting });
        }
      };
      for (const stop of city.mobility.stops) {
        const p = point(stop.tileId); if (!view.contains(p.x, p.y)) continue;
        const foot = activity.tiles[stop.tileId].pedestrian;
        add(`stop-${stop.tileId}`, [{ x: p.x + 6, y: p.y + 1 }, { x: p.x + 11, y: p.y + 3 }], foot * 7, true);
      }
      for(const stop of city.transit?.stops??[]){const p=point(stop.tileId);if(!view.contains(p.x,p.y)||stop.boardings<=0)continue;const pressure=stop.routes.reduce((n,id)=>n+(activity.transit[id]?.waiting??0)+(activity.transit[id]?.riders??0),0);add(`formal-stop-${stop.id}`,[{x:p.x+6,y:p.y+1},{x:p.x+11,y:p.y+3}],Math.min(6,pressure/30),true);}
      for (const link of this.network) {
        const start = point(link.origin), end = point(link.destination);
        if (!view.contains(start.x, start.y) && !view.contains(end.x, end.y)) continue;
        const foot = Math.max(activity.tiles[link.origin].pedestrian, activity.tiles[link.destination].pedestrian);
        const points = [start, ...link.path.map(id => ({ x: point(id).x + 5, y: point(id).y + 3 })), end];
        if (link.path.some(id => city.tiles[id].services.floodDepth >= 35)) continue;
        add(`walk-${link.origin}-${link.destination}`, points, foot * 7);
      }
      for(const facility of city.publicServices?.facilities??[]){
        const p=point(facility.location);if(!view.contains(p.x,p.y)||facility.served<=0)continue;
        add(`facility-${facility.id}`,[{x:p.x-8,y:p.y+5},{x:p.x+8,y:p.y+7}],activity.tiles[facility.location].pedestrian*6);
      }
      for (const market of city.living.markets) {
        const p = point(market.tileId); if (!view.contains(p.x, p.y)) continue;
        add(`market-${market.id}`, [{ x: p.x - 8, y: p.y + 3 }, { x: p.x + 9, y: p.y + 5 }], activity.tiles[market.tileId].market * 6);
      }
      this.walkers = walkers;
    }
    this.count = 0; this.images.forEach(i => i.setVisible(false));
    for (let n = 0; n < this.walkers.length && n < caps.pedestrians; n++) {
      const w = this.walkers[n], length = w.points.length - 1;
      if (!length) continue;
      if (!w.waiting) w.position += dt * speed * (0.42 + w.variant * 0.035);
      if (w.position >= length) w.position = 0; // Recycled representative, not a returning individual.
      const index = Math.min(length - 1, Math.floor(w.position)), f = w.waiting ? (n % 6) / 6 : w.position - index;
      const a = w.points[index], b = w.points[index + 1], x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
      if (!view.contains(x, y)) continue;
      let image = this.images[n];
      if (!image) { image = this.scene.add.image(0, 0, TEXTURE).setOrigin(0.5, 80 / 96).setScale(1 / 12); this.images[n] = image; }
      image.setFrame(`person-${w.variant}`).setPosition(x, y).setDepth(1 + y / 1000 + 0.002).setVisible(true); this.count++;
    }
    this.marketImages.forEach(i => i.setVisible(false));
    if (zoom < 0.6) return;
    city.living.markets.forEach((market, i) => {
      const p = point(market.tileId); if (!view.contains(p.x, p.y)) return;
      let image = this.marketImages[i];
      if (!image) { image = this.scene.add.image(0, 0, TEXTURE).setOrigin(0.5, 100 / 192).setScale(1 / 12); this.marketImages[i] = image; }
      image.setFrame(`market-${market.stalls >= 7 ? 2 : market.stalls >= 4 ? 1 : 0}`).setPosition(p.x + 7, p.y + 4).setDepth(1 + (p.y + 4) / 1000).setTint(market.jobs ? 0xffffff : 0x929892).setVisible(true);
    });
  }
  get allocated() { return this.images.length; }
}
