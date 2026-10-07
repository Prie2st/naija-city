import { transitOverlay } from '../../shared/simulation/transit';
import { drawTransit } from './transit-art';
import { safetyOverlayValue } from '../../shared/simulation/safety';
import { governanceOverlayValue } from '../../shared/simulation/governance';
import { isPublicService } from '../../shared/simulation/public-service-config';
import { facilityFootprint } from '../../shared/simulation/public-services';
import { facilityHeight } from './public-service-art';
import { serviceOverlayValue, publicDebugValue } from './public-service-art';
import { TrafficArt, drawTransportNetwork } from './traffic-art';
import { waypointPath } from '../../shared/simulation/road-network';
import Phaser from 'phaser';
import { dragIntent, followsPointer, pressBuildsImmediately, tapIntent, type GestureContext } from './gesture-policy';
import type { City, Tool, Overlay } from '../../shared/types/city';
import { previewTool } from '../../shared/simulation/engine';
import { drawRoad } from './roads';
import { buildingHeight } from './building-art';
import { WorldArt } from './world-art';
import { graphicsOptions, visualLod, type GraphicsOptions, type GraphicsQuality } from './visual-style';
import { drawInfrastructure, infrastructureHeight } from './infrastructure-art';
import { isDrainage } from '../../shared/simulation/infrastructure-config';
import { MAX_ZOOM, renderLayout, anchoredScroll, zoomStep, zoomAnchor } from './render-policy';
import { cityFraming } from './camera-framing';
import { preloadArchitecture } from './architecture-atlas';
import { benchmarkBuilding } from './architecture-policy';
import { preloadModels } from './model-atlas';
import { modelBuilding } from './model-policy';
import type { CityActivity } from '../../shared/types/living';
import { cityActivity } from '../../shared/simulation/activity';
import { CityLifeArt } from './city-life-art';

const W = 48, H = 24, ORIGIN = 840;
const zoneColor = { residential: 0x72b89a, commercial: 0xe4bc69, industrial: 0xba9acc };
export class CityScene extends Phaser.Scene {
  private renderDpr = 1;
  private cssWidth = innerWidth; private cssHeight = innerHeight;
  private targetZoom = 1;
  private zoomAnchor: { x: number; y: number; worldX: number; worldY: number } | null = null;
  private debugDpr: number | null = null; private resolutionCheck = 0;
  get viewZoom() { return this.cameras.main.zoom / this.renderDpr; }
  get displayDpr() { return this.renderDpr; }
  setTestDpr(value: number | null) { this.debugDpr = value; this.updateResolution(); }
  private trafficArt!: TrafficArt;
  private lifeArt!: CityLifeArt;
  private activity: CityActivity | null = null;
  private activityCity: City | null = null;
  private livingDebug: string | null = null;
  setActivity(activity: CityActivity) { this.activity = activity; this.activityCity = this.getCity(); }
  private publicDebug:string|null=null;
  private servicePreview:number[]=[];
  setPublicServiceDebug(value:string|null){this.publicDebug=value;this.redraw();}
  setServicePreview(ids:number[]){this.servicePreview=ids;this.refreshFeedback();}
  setLivingDebug(value: string | null) { this.livingDebug = value; this.redraw(); }
  get representativePedestrianCount() { return this.lifeArt?.count ?? 0; }
  get agentDiagnostics() { return { vehicles: this.trafficArt?.count ?? 0, pedestrians: this.lifeArt?.count ?? 0, vehiclePool: this.trafficArt?.allocated ?? 0, pedestrianPool: this.lifeArt?.allocated ?? 0, pausedTransit: this.trafficArt?.pausedTransit ?? 0, modes: this.trafficArt?.modeCounts ?? {} }; }
  private worldArt!: WorldArt;
  private graphics: GraphicsOptions = graphicsOptions(innerWidth < 600 ? 'medium' : 'high');
  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private redrawMs = 0;
  /** Optional developer timing sink for redraw cost. */
  onRedrawTimed: ((ms: number) => void) | null = null;
  private cameraKey = '';
  private lastCameraDraw = 0;
  private graphicsDebug!: Phaser.GameObjects.Graphics;
  setGraphicsQuality(quality: GraphicsQuality) { this.graphics.quality = quality; if(this.art)this.updateResolution(); this.redraw(); }
  toggleGraphics(key: keyof Omit<GraphicsOptions, 'quality'>) { this.graphics[key] = !this.graphics[key]; this.redraw(); return this.graphics[key]; }
  graphicsSummary() {
    const sorted = [...this.frameTimes].sort((a,b)=>a-b), mean = sorted.reduce((a,b)=>a+b,0) / Math.max(1,sorted.length);
    const canvas=this.game.canvas, ratio=this.renderDpr, memory=(this.worldArt?.detailAtlas.memoryMiB??16)+(this.worldArt?.architecture.memoryMiB??0)+(this.worldArt?.models.memoryMiB??0);
    return `CSS ${this.cssWidth}×${this.cssHeight}; buffer ${canvas.width}×${canvas.height}; device DPR ${devicePixelRatio}, effective ${ratio}${this.debugDpr?' (test input '+this.debugDpr+')':''}; zoom ${this.viewZoom.toFixed(2)}× / max ${MAX_ZOOM}×; ${this.graphics.quality} / ${visualLod(this.viewZoom,this.graphics.quality)} LOD; ${mean ? (1000/mean).toFixed(1) : '—'} FPS; p95 ${sorted[Math.floor(sorted.length*.95)]?.toFixed(1) ?? '—'} ms; redraw ${this.redrawMs.toFixed(1)} ms; ${this.worldArt?.visibleTiles ?? 0} tiles, ${this.worldArt?.count ?? 0} active / ${this.worldArt?.allocated ?? 0} pooled sprites; ${this.trafficArt?.count ?? 0} vehicles; ${this.lifeArt?.count ?? 0} pedestrians / ${this.lifeArt?.allocated ?? 0} pooled; texture estimate ${memory+10} MiB (${this.worldArt?.detailAtlas.pageCount??0} detail pages), vector overflow ${this.worldArt?.vectorCount??0}; ${this.game.renderer.type===Phaser.WEBGL?'WebGL':'Canvas'} / linear filtering; draw calls unavailable.`;
  }
  private traffic!: Phaser.GameObjects.Graphics;
  private simulationSpeed = 1;
  private debugVisual: 'od' | 'graph' | 'capacity' | null = null;
  private focusedRoute: string | null = null;
  setDebugVisual(value: 'od' | 'graph' | 'capacity' | null) { this.debugVisual = value; this.redraw(); }
  setFocusedRoute(id: string | null) { this.focusedRoute = id; this.redraw(); }
  private routeDraft: number[] | null = null;
  get representativeVehicleCount() { return this.trafficArt?.count??0; }
  setSimulationSpeed(speed: number) { this.simulationSpeed = speed; }
  setRoutePreview(points: number[] | null) { this.routeDraft = points; this.redraw(); }
  private art!: Phaser.GameObjects.Graphics;
  private groundBase!: Phaser.GameObjects.Graphics;
  private hover!: Phaser.GameObjects.Graphics;
  private selection!: Phaser.GameObjects.Graphics;
  private selected: { x: number; y: number } | null = null;
  private preview: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private down = { x: 0, y: 0 };
  private dragged = false;
  private painted = new Set<number>();
  private pinchDistance = 0;
  private hadPinch = false;
  private lastPaint: { x: number; y: number } | null = null;
  private overlay: Overlay = 'none';
  private rain!: Phaser.GameObjects.Graphics;
  private rainQuality: 'normal' | 'low' | 'off' = 'normal';
  private lastRainFrame = 0;
  private visualWetness = 0;
  private wetnessTime = 0;
  private lastWetRedraw = 0;
  private renderedCity: City | null = null;
  constructor(private getCity: () => City, private getTool: () => Tool,
    private selectTile: (x: number, y: number, paint: boolean) => void,
    private previewTile: (x: number, y: number) => void) { super('city'); }
  private drawMode = false;
  private strokeEnd: ((tiles: number) => void) | null = null;
  private viewInsets = { right: 0, bottom: 0 };
  /** Touch Draw mode: a one-finger drag paints the active tool instead of moving the map. */
  setDrawMode(on: boolean) { this.drawMode = on; }
  /** Called once when a construction stroke (click, tap-confirm or drag) finishes. */
  onStrokeEnd(handler: (tiles: number) => void) { this.strokeEnd = handler; }
  /** CSS pixels of map covered by UI panels, so focusing keeps the target in the visible area. */
  setViewInsets(insets: { right: number; bottom: number }) { this.viewInsets = insets; }
  private gesture(p: Phaser.Input.Pointer): GestureContext {
    return { inspecting: this.getTool() === 'inspect', touch: p.wasTouch, drawMode: this.drawMode, rightButton: p.rightButtonDown(), multiTouch: this.pointers.size > 1 || this.hadPinch };
  }
  private pointersReleased: () => void = () => {};
  /** Called when the last pointer lifts, so a painted stroke's tool batch can be settled once (M8.3). */
  onPointersReleased(callback: () => void) { this.pointersReleased = callback; }
  preload() { preloadArchitecture(this); preloadModels(this); }
  // Isolated art-fixture presentation; no city/save fields are added.
  setArtPreviewGround(ground:Map<number,string>) { if(this.worldArt)this.worldArt.previewGround=ground;this.redraw(); }
  create() {
    this.groundBase = this.add.graphics().setDepth(-3);
    this.art = this.add.graphics().setDepth(-1); this.selection = this.add.graphics().setDepth(6); this.hover = this.add.graphics().setDepth(7);
    this.worldArt = new WorldArt(this); this.trafficArt = new TrafficArt(this,this.worldArt.models);
    this.lifeArt = new CityLifeArt(this);
    this.events.on('architecture-ready', this.redraw, this);
    this.events.once('shutdown', () => this.events.off('architecture-ready', this.redraw, this));
    this.graphicsDebug = this.add.graphics().setDepth(8);
    this.traffic = this.add.graphics().setDepth(1);
    this.rain = this.add.graphics().setScrollFactor(0).setDepth(10);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.rainQuality = 'off';
    this.cameras.main.setBackgroundColor('#c8c5ac');
    this.updateResolution(); this.home(); this.redraw();
    const resize=()=>this.updateResolution();
    const observer=new ResizeObserver(resize);observer.observe(this.game.canvas.parentElement!);
    window.addEventListener('resize',resize);
    this.events.once('shutdown',()=>{observer.disconnect();window.removeEventListener('resize',resize);});
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.pointers.size) { this.hadPinch = false; this.zoomAnchor=null; this.targetZoom=this.viewZoom; }
      this.pointers.set(p.id, { x: p.x, y: p.y });
      this.down = { x: p.x, y: p.y }; this.dragged = false; this.painted.clear(); this.lastPaint = null;
      if (this.pointers.size === 2) { this.pinchDistance = this.distance(); this.dragged = true; this.hadPinch = true; }
      else if (this.getTool() !== 'inspect' && !p.rightButtonDown()) {
        // Touch never builds on press: a tap previews, a second tap or the Build button confirms,
        // and only an explicit Draw mode turns a one-finger drag into painting.
        const context = this.gesture(p);
        if (followsPointer(context)) this.highlight(p);
        if (pressBuildsImmediately(context)) this.pick(p, true);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown && this.pointers.has(p.id)) {
        const last = this.pointers.get(p.id)!;
        this.pointers.set(p.id, { x: p.x, y: p.y });
        if (this.pointers.size > 1) {
          const d = this.distance();
          if (this.pinchDistance > 0) this.zoom(d / this.pinchDistance, this.midpoint());
          this.pinchDistance = d; this.dragged = true;
        } else if (dragIntent(this.gesture(p)) === 'pan') {
          this.cameras.main.scrollX -= (p.x - last.x) / this.cameras.main.zoom;
          this.cameras.main.scrollY -= (p.y - last.y) / this.cameras.main.zoom;
          if (Math.hypot(p.x - this.down.x, p.y - this.down.y) > 5*this.renderDpr) this.dragged = true;
        } else if (!p.wasTouch || Math.hypot(p.x - this.down.x, p.y - this.down.y) > 10*this.renderDpr) {
          this.dragged = true; this.pick(p, true);
        }
      }
      if (followsPointer(this.gesture(p))) this.highlight(p);
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (this.pointers.size === 1 && !this.dragged && !this.hadPinch) {
        const target = this.coords(p);
        const intent = tapIntent({ ...this.gesture(p), sameAsPreview: !!this.preview && this.preview.x === target.x && this.preview.y === target.y });
        if (intent === 'select') this.pick(p, false);
        else if (intent === 'preview') this.highlight(p);
        else if (intent === 'build') { this.painted.clear(); this.lastPaint = null; this.down = { x: p.x, y: p.y }; this.pick(p, true); }
      }
      if (this.pointers.size === 1 && this.painted.size && this.getTool() !== 'inspect') this.strokeEnd?.(this.painted.size);
      this.pointers.delete(p.id); this.pinchDistance = 0;
      if (!this.pointers.size) this.pointersReleased();
    };
    this.input.on('pointerup', up); this.input.on('pointerupoutside', up);
    this.game.canvas.addEventListener('pointerleave', () => { if (!this.pointers.size) this.hover.clear(); });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoom(Math.exp(Phaser.Math.Clamp(-dy*.0015,-.4,.4)),p));
    this.input.mouse?.disableContextMenu();

    this.input.keyboard?.on('keydown-H', () => this.home());
  }
  private distance() { const a = [...this.pointers.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  private cameraBounds() {
    const camera = this.cameras.main;
    // Viewport-relative margins permit centring even when a tall phone sees beyond map edges.
    const px = Math.max(200, this.scale.width / camera.zoom * 0.55);
    const py = Math.max(200, this.scale.height / camera.zoom * 0.55);
    camera.setBounds(-px, -py, 1680 + px * 2, 768 + py * 2);
  }
  private midpoint() { const a=[...this.pointers.values()]; return {x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}; }
  private updateResolution() {
    if(!this.art)return;
    const camera=this.cameras.main, zoom=this.viewZoom;
    const center=camera.getWorldPoint(camera.width/2,camera.height/2);
    const rect=this.game.canvas.parentElement!.getBoundingClientRect();
    const layout=renderLayout(Math.max(1,Math.round(rect.width)),Math.max(1,Math.round(rect.height)),this.debugDpr??devicePixelRatio,this.graphics.quality);
    if(layout.backingWidth===this.game.canvas.width&&layout.backingHeight===this.game.canvas.height&&layout.dpr===this.renderDpr&&this.cssWidth===layout.width&&this.cssHeight===layout.height)return;
    this.cssWidth=layout.width;this.cssHeight=layout.height;this.renderDpr=layout.dpr;
    this.scale.zoom=1/layout.dpr;
    this.scale.resize(layout.backingWidth,layout.backingHeight);
    this.game.canvas.style.width=layout.width+'px';this.game.canvas.style.height=layout.height+'px';
    this.scale.refresh();
    camera.setSize(layout.backingWidth,layout.backingHeight).setZoom(zoom*layout.dpr);
    this.zoomAnchor=null;this.targetZoom=zoom;this.pointers.clear();this.cameraBounds();camera.centerOn(center.x,center.y);this.redraw();
  }
  zoom(factor: number, anchor?: {x:number;y:number}) { this.zoomTo(this.targetZoom*factor,anchor); }
  zoomTo(value: number, anchor?: {x:number;y:number}) {
    const minimum=Math.max(.12,Math.min(.4,(this.cssWidth-30)/(this.getCity().size*W),(this.cssHeight-200)/(this.getCity().size*H)));
    const point=anchor??{x:this.cameras.main.width/2,y:this.cameras.main.height/2};
    const world=this.cameras.main.getWorldPoint(point.x,point.y);
    this.zoomAnchor=zoomAnchor(point,world);this.targetZoom=Phaser.Math.Clamp(value,minimum,MAX_ZOOM);
  }
  home() {
    const frame=cityFraming(this.getCity(),this.cssWidth,this.cssHeight);
    this.zoomAnchor=null;this.targetZoom=frame.zoom;this.cameras.main.setZoom(frame.zoom*this.renderDpr);
    this.cameraBounds();this.cameras.main.centerOn(frame.x,frame.y);
  }
  /** CSS-pixel position of a tile centre inside the canvas (browser QA and accessibility probes). */
  tileScreen(x: number, y: number) {
    const camera=this.cameras.main, world={x:ORIGIN+(x-y)*W/2,y:(x+y)*H/2+H/2};
    return {x:(world.x-camera.worldView.x)*camera.zoom/this.renderDpr,y:(world.y-camera.worldView.y)*camera.zoom/this.renderDpr};
  }
  focusTile(x: number, y: number) {
    const camera=this.cameras.main,zoom=Math.max(this.viewZoom,this.cssWidth<600?2:2.2);
    this.zoomAnchor=null;this.targetZoom=zoom;camera.setZoom(zoom*this.renderDpr);this.cameraBounds();
    camera.centerOn(ORIGIN+(x-y)*W/2+this.viewInsets.right/2/zoom,(x+y)*H/2+12-30/zoom+this.viewInsets.bottom/2/zoom);
  }
  /** Pan just enough that a tile sits inside the part of the map not covered by panels. */
  ensureVisible(x: number, y: number, margin = 48) {
    const at = this.tileScreen(x, y), camera = this.cameras.main, zoom = camera.zoom / this.renderDpr;
    const maxX = this.cssWidth - this.viewInsets.right - margin, maxY = this.cssHeight - this.viewInsets.bottom - margin;
    const dx = at.x > maxX ? at.x - maxX : at.x < margin ? at.x - margin : 0;
    const dy = at.y > maxY ? at.y - maxY : at.y < margin + 110 ? at.y - margin - 110 : 0;
    if (dx || dy) { camera.scrollX += dx / zoom; camera.scrollY += dy / zoom; }
  }
  private coords(p: { x: number; y: number }) {
    const world = this.cameras.main.getWorldPoint(p.x, p.y);
    if (this.getTool() === 'inspect') {
      // Hit-test visible building silhouettes before the ground grid, including tall roofs.
      const buildings = this.getCity().tiles.filter(t => t.publicFacility || t.building || (t.infrastructure && !isDrainage(t.infrastructure.kind))).sort((a, b) => b.x + b.y - a.x - a.y);
      for (const t of buildings) {
        const x = ORIGIN + (t.x - t.y) * W / 2, y = (t.x + t.y) * H / 2;
        const height = t.building ? modelBuilding(t.building)?.visualHeight??(t.building.constructionState === 'site-preparation' ? 4 : buildingHeight(t.building)) : t.publicFacility?facilityHeight(this.getCity().publicServices.facilities.find(f=>f.id===t.publicFacility)):infrastructureHeight(t);
        const outline = new Phaser.Geom.Polygon([
          x, y + 3 - height, x + 16, y + 10 - height, x + 14, y + 10,
          x, y + 17, x - 14, y + 10, x - 16, y + 10 - height,
        ]);
        if (Phaser.Geom.Polygon.Contains(outline, world.x, world.y)) return { x: t.x, y: t.y };
      }
    }
    const a = (world.x - ORIGIN) / (W / 2), b = world.y / (H / 2);
    return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
  }
  private pick(p: Phaser.Input.Pointer, paint: boolean) {
    const { x, y } = this.coords(p), id = y * 32 + x;
    if (x < 0 || y < 0 || x >= 32 || y >= 32) { if (!paint) this.selectTile(-1, -1, false); return; }
    if (paint && this.painted.has(id)) return;
    if (paint && p.wasTouch && !this.lastPaint) {
      const start = this.coords(this.down);
      if (start.x >= 0 && start.y >= 0 && start.x < 32 && start.y < 32) {
        this.lastPaint = start;
        this.painted.add(start.y * 32 + start.x); this.selectTile(start.x, start.y, true);
      }
    }
    if (paint && this.lastPaint) {
      // Fill pointer-event gaps with a connected Manhattan path.
      let px = this.lastPaint.x, py = this.lastPaint.y;
      while (px !== x || py !== y) {
        if (px !== x) px += Math.sign(x - px);
        else py += Math.sign(y - py);
        const next = py * 32 + px;
        if (!this.painted.has(next)) { this.painted.add(next); this.selectTile(px, py, true); }
      }
    } else { this.painted.add(id); this.selectTile(x, y, paint); }
    if (paint) this.lastPaint = { x, y };
  }
  private highlight(p: Phaser.Input.Pointer) {
    const { x, y } = this.coords(p);
    this.preview = x >= 0 && y >= 0 && x < 32 && y < 32 ? { x, y } : null;
    this.previewTile(x, y); this.refreshFeedback();
  }
  setSelected(tile: { x: number; y: number } | null) {
    this.selected = tile; this.refreshFeedback();
  }
  clearPreview() { this.preview = null; this.refreshFeedback(); }
  setOverlay(overlay: Overlay) { this.overlay = overlay; this.redraw(); }
  setRainQuality(quality: 'normal' | 'low' | 'off') { this.rainQuality = quality; this.rain?.clear(); }
  update(time: number, delta: number) {
    // Raw frame interval: Phaser's smoothed delta hides stalls longer than 200 ms.
    const interval = this.lastFrameTime ? time - this.lastFrameTime : 0; this.lastFrameTime = time;
    if (interval > 0 && interval < 5000) { this.frameTimes.push(interval); if (this.frameTimes.length > 180) this.frameTimes.shift(); }
    const camera = this.cameras.main;
    if(time-this.resolutionCheck>500){this.resolutionCheck=time;this.updateResolution();}
    const next=zoomStep(this.viewZoom,this.targetZoom,delta);
    if(next!==this.viewZoom){
      camera.setZoom(next*this.renderDpr);this.cameraBounds();
      if(this.zoomAnchor){const a=this.zoomAnchor;camera.scrollX=anchoredScroll(a.worldX,a.x,camera.width,camera.zoom);camera.scrollY=anchoredScroll(a.worldY,a.y,camera.height,camera.zoom);}
    }
    const key = `${Math.floor(camera.scrollX / 24)}:${Math.floor(camera.scrollY / 24)}:${Math.round(camera.zoom * 20)}:${this.getTool() !== 'inspect'}`;
    if (key !== this.cameraKey && time - this.lastCameraDraw > 100) { this.lastCameraDraw = time; this.redraw(); this.cameraKey = key; }
    const activity = this.activity!;
    this.trafficArt.update(this.traffic, this.getCity(), time, this.viewZoom, this.cssWidth < 600 || this.graphics.quality === 'low', this.simulationSpeed, activity, this.graphics.quality, this.cssWidth, this.cssHeight);
    this.lifeArt.update(this.getCity(), activity, time, this.viewZoom, this.graphics.quality, this.simulationSpeed, this.cssWidth, this.cssHeight);
    const intensity = this.getCity().weather.rainfall;
    const dt = Math.min(200, time - (this.wetnessTime || time)); this.wetnessTime = time;
    const target = intensity ? Math.min(1, 0.28 + intensity / 90) : 0;
    const before = this.visualWetness;
    this.visualWetness += (target - this.visualWetness) * (1 - Math.exp(-dt / (target > this.visualWetness ? 1800 : 14000)));
    if (Math.abs(before - this.visualWetness) > 0.0001 && time - this.lastWetRedraw >= (this.graphics.quality === 'high' ? 1200 : 2000)) { this.lastWetRedraw = time; this.redraw(); }
    if (!this.rain || time - this.lastRainFrame < (this.rainQuality === 'low' ? 80 : 40)) return;
    this.lastRainFrame = time; this.rain.clear();
    const zoom=this.viewZoom;
    this.rain.setScale(1/zoom).setPosition(camera.width/2-this.cssWidth/(2*zoom),camera.height/2-this.cssHeight/(2*zoom));
    if (!intensity || this.rainQuality === 'off' || !this.graphics.weather) return;
    const reduced = this.rainQuality === 'low' || this.graphics.quality !== 'high';
    const count = Math.min(reduced ? 64 : 180, Math.ceil(intensity * (reduced ? 1 : 3)));
    const strength = Math.min(1, intensity / 65), length = 9 + strength * 17;
    this.rain.fillStyle(0x253f58, strength * 0.045); this.rain.fillRect(0,0,this.cssWidth,this.cssHeight);

    // Bounded screen-space strokes; no entities, allocations, or simulation calculations per raindrop.
    for (let n = 0; n < count; n++) {
      const layer=.55+(n%5)*.13,streak=length*layer;
      const x=(n*137.3-time*.065*layer+this.cssWidth*100)%this.cssWidth,y=(n*91.7+time*(.25+strength*.22)*layer)%this.cssHeight;
      this.rain.lineStyle(.45+layer*.55,n%3?0xb8d2d1:0xe0e7dd,(.15+strength*.28)*layer);
      this.rain.lineBetween(x,y,x-streak*.35,y+streak);
    }
  }
  refreshFeedback() {
    if (!this.hover) return;
    this.hover.clear(); this.selection.clear();
    if(this.servicePreview.length)for(const id of this.servicePreview){const t=this.getCity().tiles[id];this.hover.fillStyle(0x65b9a4,.12);this.hover.fillPoints(this.diamond(ORIGIN+(t.x-t.y)*W/2,(t.x+t.y)*H/2),true);}
    if (this.selected) {
      const { x, y } = this.selected;
      this.selection.lineStyle(3/this.viewZoom, 0xfff4bb);
      this.selection.strokePoints(this.diamond(ORIGIN + (x - y) * W / 2, (x + y) * H / 2), true);
    }
    if (!this.preview) return;
    const { x, y } = this.preview, tool = this.getTool();
    const placement = previewTool(this.getCity(), x, y, tool);
    const color = tool === 'inspect' ? 0xffffff : placement.status === 'invalid' ? 0xef755b : placement.status === 'unchanged' ? 0xecc875 : 0x63d5ab;
    if(isPublicService(tool)) for(const id of facilityFootprint(this.getCity(),y*this.getCity().size+x,tool)){const t=this.getCity().tiles[id],shape=this.diamond(ORIGIN+(t.x-t.y)*W/2,(t.x+t.y)*H/2);this.hover.fillStyle(color,.2);this.hover.fillPoints(shape,true);this.hover.lineStyle(2/this.viewZoom,color);this.hover.strokePoints(shape,true);}
    const shape = this.diamond(ORIGIN + (x - y) * W / 2, (x + y) * H / 2);
    this.hover.fillStyle(color, 0.2); this.hover.fillPoints(shape, true);
    this.hover.lineStyle(2/this.viewZoom, color); this.hover.strokePoints(shape, true);
    if (tool !== 'inspect') {
      const px = ORIGIN + (x - y) * W / 2, py = (x + y) * H / 2 + H / 2;
      this.hover.lineStyle(2/this.viewZoom, color);
      if (placement.status === 'invalid') {
        this.hover.lineBetween(px - 4, py - 4, px + 4, py + 4); this.hover.lineBetween(px - 4, py + 4, px + 4, py - 4);
      } else { this.hover.lineBetween(px - 4, py, px + 4, py); this.hover.lineBetween(px, py - 4, px, py + 4); }
    }
  }
  private diamond(x: number, y: number) {
    return [{ x, y }, { x: x + W / 2, y: y + H / 2 }, { x, y: y + H }, { x: x - W / 2, y: y + H / 2 }];
  }
  redraw() {
    if (!this.art) return;
    const g = this.art; g.clear(); this.groundBase.clear();
    const city = this.getCity();
    if (this.activityCity !== city || !this.activity) { this.activity = cityActivity(city, 12); this.activityCity = city; }
    if (city !== this.renderedCity) { this.visualWetness = city.weather.rainfall ? Math.min(1, 0.28 + city.weather.rainfall / 90) : 0; this.renderedCity = city; }
    const began = performance.now(), camera = this.cameras.main;
    const left = camera.scrollX + camera.width * .5 * (1 - 1 / camera.zoom), top = camera.scrollY + camera.height * .5 * (1 - 1 / camera.zoom);
    const right = left + camera.width / camera.zoom, bottom = top + camera.height / camera.zoom;
    const lod = visualLod(this.viewZoom,this.graphics.quality), detail = lod !== 'far';
    this.worldArt.begin(this.graphics,this.viewZoom,this.renderDpr); this.graphicsDebug.clear();
    const visible=city.tiles.filter(t=>{
      const x=ORIGIN+(t.x-t.y)*W/2,y=(t.x+t.y)*H/2;
      const height=t.building?(modelBuilding(t.building)?.visualHeight??benchmarkBuilding(t.building)?.visualHeight??buildingHeight(t.building))+8:t.publicFacility?facilityHeight(city.publicServices.facilities.find(f=>f.id===t.publicFacility))+25:t.infrastructure?infrastructureHeight(t)+8:38;
      return x+28>=left&&x-28<=right&&y+28>=top&&y-height<=bottom;
    });
    this.worldArt.prepare(city,visible,this.graphics,this.viewZoom);
    for (const t of visible) {
      const x = ORIGIN + (t.x - t.y) * W / 2, y = (t.x + t.y) * H / 2;
      // Match the baked landscape material under anti-aliased tile edges.
      const dim=1-this.visualWetness*20/255;
      const base = t.terrain === 'water' ? 0x4d8a91 : t.terrain === 'wetland' ? 0x889876 : Phaser.Display.Color.GetColor(Math.round(145*dim),Math.round(157*dim),Math.round(134*dim));
      this.groundBase.fillStyle(base);
      this.groundBase.fillPoints([{x,y:y-1},{x:x+25,y:y+12},{x,y:y+25},{x:x-25,y:y+12}],true);
      this.worldArt.terrain(city,t,x,y,this.visualWetness);
      const activeOverlay = this.publicDebug || this.overlay !== 'none' && this.overlay !== 'mobility' && this.overlay !== 'transit-network';
      let objectTint: number | undefined;
      if (activeOverlay && t.terrain !== 'water') {
        const value = (this.publicDebug?publicDebugValue(t,this.publicDebug):undefined) ?? transitOverlay(city,t.y*city.size+t.x,this.overlay) ?? safetyOverlayValue(city,t,this.overlay) ?? governanceOverlayValue(city,t,this.overlay) ?? serviceOverlayValue(t,this.overlay) ?? (this.overlay === 'traffic' ? 100-t.mobility.congestion : this.overlay === 'land-value' ? t.landValue : this.overlay === 'development' ? t.attractiveness : this.overlay === 'power' ? t.services.powerReliability : this.overlay === 'water' ? t.services.waterReliability : this.overlay === 'drainage' ? t.services.drainageQuality : this.overlay === 'flood-risk' ? 100-t.services.floodRisk : (t.building?.occupancy??0)*100);
        const mix=value/100;g.fillStyle(Phaser.Display.Color.GetColor(Math.round(186-mix*92),Math.round(111+mix*46),Math.round(81+mix*23)),.82);g.fillPoints(this.diamond(x,y),true);
        objectTint = Phaser.Display.Color.GetColor(Math.round(240-mix*68),Math.round(179+mix*48),Math.round(142+mix*28));
      } else if(t.zone && (!t.building || this.getTool() !== 'inspect')) { g.fillStyle(zoneColor[t.zone],t.building?.14:.26);g.fillPoints(this.diamond(x,y),true); }
      // Normal play has no tile outlines. Planning and developer bounds reveal the grid.
      if(this.getTool() !== 'inspect' || this.graphics.bounds){g.lineStyle(.6,0xede2bb,.4);g.strokePoints(this.diamond(x,y),true);}
      if(t.terrain==='water'||t.terrain==='wetland') {
        for(const [dx,dy,edge] of [[-1,0,0],[0,-1,1],[1,0,2],[0,1,3]]) {
          const n=city.tiles[(t.y+dy)*city.size+t.x+dx];
          if(t.x+dx<0||t.y+dy<0||t.x+dx>=city.size||t.y+dy>=city.size||!n||n.terrain==='water'||n.terrain==='wetland')continue;
          const d=this.diamond(x,y),a=d[(edge+3)%4],b=d[edge];
          g.lineStyle(3.5,0xa8a784,.38);g.lineBetween(a.x,a.y,b.x,b.y);g.lineStyle(1.2,0xc4c0a2,.65);g.lineBetween(a.x,a.y,b.x,b.y);
        }
      }
      if(t.road&&!this.worldArt.road(city,t,x,y,this.visualWetness))drawRoad(g,city,t,x,y,t.roadClass??'local',this.visualWetness,detail,lod==='close');
      if(t.road&&this.overlay==='traffic'){g.fillStyle(t.mobility.congestion>70?0xb74f3d:t.mobility.congestion>35?0xcb9d48:0x65a480,.5);g.fillPoints(this.diamond(x,y),true);}
      if(t.infrastructure&&isDrainage(t.infrastructure.kind)&&!this.worldArt.drainage(city,t,x,y,this.visualWetness))drawInfrastructure(g,t,x,y,city,detail);
      if(t.services.floodDepth>=2&&t.terrain!=='water') {
        const depth=t.services.floodDepth;
        // Ground-plane floodwater leaves rooftops visible and softly darkens saturated soil.
        g.fillStyle(0x546e66,Math.min(.22,depth/700));g.fillPoints(this.diamond(x,y),true);
        g.fillStyle(0x658f91,Math.min(.52,.16+depth/500));
        if(depth<12)g.fillEllipse(x+4,y+14,12,4);
        else if(depth<35){g.fillEllipse(x+2,y+13,29,9);g.fillEllipse(x-10,y+10,12,4);}
        else {g.fillPoints(this.diamond(x,y),true);g.fillEllipse(x+2,y+14,34,10);}
        g.lineStyle(.6,0xc1d5c7,depth>=35?.55:.25);g.lineBetween(x-10,y+12,x+5,y+15);
        if(depth>=90){g.lineStyle(1,0xd0d9c6,.5);g.lineBetween(x-16,y+11,x-3,y+18);}
      } else if(this.visualWetness>.3&&t.terrain==='land'&&(t.x*7+t.y*3)%11===0){g.fillStyle(0x839996,this.visualWetness*.24);g.fillEllipse(x+5,y+15,13,4);}
      this.worldArt.objects(city,t,x,y,g,this.graphics,this.viewZoom,this.visualWetness,this.overlay==='transit-network'?0xc9d1c7:objectTint);
      if(this.graphics.lod){this.graphicsDebug.lineStyle(1,lod==='far'?0xce8059:lod==='medium'?0xd4ba64:0x72ba9b,.6);this.graphicsDebug.strokePoints(this.diamond(x,y),true);}
      if(this.graphics.anchors){this.graphicsDebug.lineStyle(.7,0xf5d578);this.graphicsDebug.lineBetween(x-2,y+12,x+2,y+12);this.graphicsDebug.lineBetween(x,y+10,x,y+14);}
      if(this.graphics.depth){this.graphicsDebug.fillStyle(0xe5ae73,.6);this.graphicsDebug.fillCircle(x,y+12,1+(y/768)*2);}
    }
    this.worldArt.finish();this.redrawMs=performance.now()-began;this.onRedrawTimed?.(this.redrawMs);
    if (this.livingDebug) for (const t of visible) {
      const id = t.y * city.size + t.x, a = this.activity!.tiles[id], x = ORIGIN + (t.x - t.y) * W / 2, y = (t.x + t.y) * H / 2;
      if (this.livingDebug === 'neighborhoods' && t.clusterId !== null) { this.graphicsDebug.lineStyle(1, [0xc8a061,0x789d91,0x9b89b7][t.clusterId % 3], 0.9); this.graphicsDebug.strokePoints(this.diamond(x,y),true); }
      else if (this.livingDebug !== 'network') {
        const value = this.livingDebug === 'business' ? (t.building?.business?.profitability ?? 0) / 100 : this.livingDebug === 'markets' ? a.market : this.livingDebug === 'informal' ? t.building?.tenure !== 'formal' && t.building ? 1 : this.getCity().living.informal.housingPressure / 200 : a.pedestrian;
        this.graphicsDebug.fillStyle(value > 0.6 ? 0x79b39a : 0xc49664, value * 0.45); this.graphicsDebug.fillPoints(this.diamond(x,y),true);
      }
    }
    if (this.livingDebug === 'network') for (const link of this.lifeArt.network) { this.graphicsDebug.lineStyle(1,0xefda9f,0.65); this.graphicsDebug.strokePoints(link.path.map(id => ({x: ORIGIN + (id % 32 - Math.floor(id / 32))*24 + 5,y: (id % 32 + Math.floor(id / 32))*12 + 15})),false); }
    if (this.debugVisual === 'graph' || this.debugVisual === 'capacity') for (const t of city.tiles) if (t.road) { const x = ORIGIN + (t.x - t.y) * W / 2, y = (t.x + t.y) * H / 2 + 12; g.fillStyle(this.debugVisual === 'capacity' ? 0xf9df91 : 0xffffff, 0.8); g.fillCircle(x, y, this.debugVisual === 'capacity' ? Math.min(6, 1 + t.mobility.effectiveCapacity / 180) : 2); }
    if (this.debugVisual === 'od') for (const f of city.mobility.flows) { const a = city.tiles[f.origin], b = city.tiles[f.destination]; g.lineStyle(Math.min(5, 1 + f.trips / 300), 0xb6814e, 0.7); g.lineBetween(ORIGIN + (a.x - a.y) * W / 2, (a.x + a.y) * H / 2 + 12, ORIGIN + (b.x - b.y) * W / 2, (b.x + b.y) * H / 2 + 12); }
    const focused = city.mobility.routes.find(r => r.id === this.focusedRoute); if (focused && this.overlay === 'mobility') { g.lineStyle(5, 0xf6e5bd); g.strokePoints(focused.path.map(id => { const t = city.tiles[id]; return { x: ORIGIN + (t.x - t.y) * W / 2, y: (t.x + t.y) * H / 2 + 12 }; }), false); }
    for(const i of city.safety?.incidents??[])if(i.resolvedAt===null&&i.severity!=='minor'){const t=city.tiles[i.location],x=ORIGIN+(t.x-t.y)*W/2,y=(t.x+t.y)*H/2;g.lineStyle(1.5,0xd6a365,.85);g.strokeCircle(x,y-8,4);}
    drawTransportNetwork(g, city, this.overlay === 'mobility'||this.overlay==='transit-network');
    drawTransit(g,city,this.overlay==='transit-network',this.viewZoom,this.focusedRoute);
    if (this.routeDraft?.length) { const route = waypointPath(city, this.routeDraft); g.lineStyle(3, route ? 0x4a9b71 : 0xd86950); g.strokePoints((route?.path ?? this.routeDraft).map(id => { const t = city.tiles[id]; return { x: ORIGIN + (t.x - t.y) * W / 2, y: (t.x + t.y) * H / 2 + 12 }; }), false); }
    this.refreshFeedback();
  }
}
