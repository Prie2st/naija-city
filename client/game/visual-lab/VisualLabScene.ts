import Phaser from 'phaser';
import { renderLayout, MAX_ZOOM, anchoredScroll, zoomAnchor, zoomStep } from '../render-policy';
import type { GraphicsQuality } from '../visual-style';
import { LabAtlas, type LabManifest } from './lab-atlas';
import { createComposition, districts, projectMetres, cameraFrame, type CameraPreset, type DistrictId, type LabObject, type Road } from './composition';
import { drawPublicRealm, groundPlane } from './public-realm';

export class VisualLabScene extends Phaser.Scene {
  readonly composition=createComposition();
  readonly sprites=new Map<string,Phaser.GameObjects.Image>();
  private atlas!: LabAtlas;
  private ground!: Phaser.GameObjects.Graphics;
  private selection!: Phaser.GameObjects.Graphics;
  private pointers=new Map<number,{x:number;y:number}>();
  private down={x:0,y:0}; private dragged=false; private pinched=false;
  private pinchDistance=0;
  private anchor: {x:number;y:number;worldX:number;worldY:number} | null=null;
  private targetZoom=1; private dpr=1; private cssWidth=innerWidth; private cssHeight=innerHeight;
  private dirty=true; private lastDraw=0; private cameraKey=''; private groundClose=false;
  private frames: number[]=[]; private measured=0; private drawMs=0;
  private selected: LabObject | null=null;
  district: DistrictId='urban';
  preset: CameraPreset='district';
  screenshot=false;
  quality: GraphicsQuality;
  testDpr: number | null=null;
  onSelect: (item: LabObject | null)=>void=()=>{};
  onRoadSelect: (road: Road)=>void=()=>{};
  onScreenshot: (value: boolean)=>void=()=>{};
  constructor(private manifest: LabManifest,quality: GraphicsQuality) {
    super('VisualLab');this.quality=quality;
  }
  preload() {
    for(const page of this.manifest.sheets['2'])this.load.atlas(page.key,`/assets/visual-lab/${page.key}.png`,`/assets/visual-lab/${page.key}.json`);
  }
  create() {
    this.atlas=new LabAtlas(this,this.manifest,()=>{this.dirty=true;});
    this.ground=this.add.graphics();this.selection=this.add.graphics().setDepth(20000);
    this.resize();this.frame();
    const params=new URLSearchParams(location.search);
    const requested=params.get('district');if(requested&&requested in districts)this.district=requested as DistrictId;
    const camera=params.get('camera');if(camera&&['city','district','block','street'].includes(camera))this.preset=camera as CameraPreset;
    this.frame();
    const observer=new ResizeObserver(()=>this.resize());observer.observe(this.game.canvas.parentElement!);
    const resize=()=>this.resize();window.addEventListener('resize',resize);
    this.events.once('shutdown',()=>{observer.disconnect();window.removeEventListener('resize',resize);});
    this.input.on('pointerdown',(p: Phaser.Input.Pointer)=>{
      if(!this.pointers.size){this.dragged=false;this.pinched=false;this.anchor=null;this.targetZoom=this.viewZoom;this.down={x:p.x,y:p.y};}
      this.pointers.set(p.id,{x:p.x,y:p.y});
      if(this.pointers.size===2){this.pinchDistance=this.distance();this.dragged=true;this.pinched=true;}
    });
    this.input.on('pointermove',(p: Phaser.Input.Pointer)=>{
      const last=this.pointers.get(p.id);if(!last||!p.isDown)return;
      this.pointers.set(p.id,{x:p.x,y:p.y});
      if(this.pointers.size===2){
        const dist=this.distance();const pts=[...this.pointers.values()];
        if(this.pinchDistance>0)this.zoom(dist/this.pinchDistance,{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2});
        this.pinchDistance=dist;this.dragged=true;
      } else {
        this.cameras.main.scrollX-=(p.x-last.x)/this.cameras.main.zoom;
        this.cameras.main.scrollY-=(p.y-last.y)/this.cameras.main.zoom;
        if(Math.hypot(p.x-this.down.x,p.y-this.down.y)>5*this.dpr)this.dragged=true;
      }
    });
    const up=(p: Phaser.Input.Pointer)=>{
      if(!this.dragged&&!this.pinched&&this.pointers.size===1){
        if(this.screenshot)this.setScreenshot(false);else this.pick(p);
      }
      this.pointers.delete(p.id);this.pinchDistance=0;
    };
    this.input.on('pointerup',up);this.input.on('pointerupoutside',up);
    this.input.on('wheel',(p: Phaser.Input.Pointer,_: unknown,_dx: number,dy: number)=>this.zoom(Math.exp(Phaser.Math.Clamp(-dy*.0015,-.4,.4)),p));
    this.input.mouse?.disableContextMenu();
    this.input.keyboard?.on('keydown-H',()=>this.frame());
    this.input.keyboard?.on('keydown-P',()=>this.setScreenshot(!this.screenshot));
    this.input.keyboard?.on('keydown-ESC',()=>this.setScreenshot(false));
    this.draw();
  }
  get viewZoom(){return this.cameras.main.zoom/this.dpr;}
  private distance(){const a=[...this.pointers.values()];return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}
  resize() {
    if(!this.atlas)return;
    const camera=this.cameras.main,zoom=this.viewZoom;
    const center=camera.getWorldPoint(camera.width/2,camera.height/2);
    const layout=renderLayout(innerWidth,innerHeight,this.testDpr??devicePixelRatio,this.quality);
    if(layout.backingWidth===this.game.canvas.width&&layout.backingHeight===this.game.canvas.height&&this.dpr===layout.dpr&&this.cssWidth===layout.width&&this.cssHeight===layout.height)return;
    this.cssWidth=layout.width;this.cssHeight=layout.height;this.dpr=layout.dpr;
    this.scale.zoom=1/layout.dpr;this.scale.resize(layout.backingWidth,layout.backingHeight);
    this.game.canvas.style.width=layout.width+'px';this.game.canvas.style.height=layout.height+'px';this.scale.refresh();
    camera.setSize(layout.backingWidth,layout.backingHeight).setZoom(zoom*layout.dpr);
    camera.centerOn(center.x,center.y);this.anchor=null;this.targetZoom=zoom;this.dirty=true;
  }
  frame(district=this.district,preset=this.preset) {
    this.district=district;this.preset=preset;
    const f=cameraFrame(district,preset,this.cssWidth,this.cssHeight);
    const points=[projectMetres(f.x,f.y),projectMetres(f.x+f.w,f.y),projectMetres(f.x+f.w,f.y+f.d),projectMetres(f.x,f.y+f.d)];
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
    const minY=Math.min(...points.map(p=>p.y))-60,maxY=Math.max(...points.map(p=>p.y));
    const fit=Math.min(this.cssWidth*.89/(maxX-minX),(this.cssHeight-(this.cssWidth<600?225:160))*.94/(maxY-minY));
    const zoom=Math.max(.25,Math.min(MAX_ZOOM,f.zoom??fit));
    this.targetZoom=zoom;this.anchor=null;this.cameras.main.setZoom(zoom*this.dpr);
    this.cameras.main.centerOn((minX+maxX)/2,(minY+maxY)/2+(this.screenshot?0:10/zoom));this.dirty=true;
  }
  zoom(factor: number,point?: {x:number;y:number}) {
    const camera=this.cameras.main;
    const anchor=point??{x:camera.width/2,y:camera.height/2};
    this.anchor=zoomAnchor(anchor,camera.getWorldPoint(anchor.x,anchor.y));
    this.targetZoom=Phaser.Math.Clamp(this.targetZoom*factor,.25,MAX_ZOOM);
  }
  setQuality(quality: GraphicsQuality){this.quality=quality;this.resize();this.dirty=true;}
  setDpr(value: number | null){this.testDpr=value;this.resize();this.dirty=true;}
  setScreenshot(value: boolean){this.screenshot=value;this.selection.setVisible(!value);this.onScreenshot(value);}
  private pick(p: Phaser.Input.Pointer) {
    const world=this.cameras.main.getWorldPoint(p.x,p.y);
    const candidates=this.composition.objects.filter(o=>{
      const image=this.sprites.get(o.id);return image?.visible&&image.getBounds().contains(world.x,world.y);
    }).sort((a,b)=>(this.sprites.get(b.id)?.depth??0)-(this.sprites.get(a.id)?.depth??0));
    this.selected=candidates[0]??null;this.onSelect(this.selected);this.drawSelection();
    if(!this.selected){
      const x=(world.x/1.2+world.y/.6)/2,y=(world.y/.6-world.x/1.2)/2;
      const road=this.composition.roads.find(r=>{
        const width=r.kind==='boulevard'?21.4:r.kind==='avenue'?12.4:6.4;
        const along=r.axis==='x'?x:y,across=r.axis==='x'?y:x;
        return along>=r.from&&along<=r.to&&Math.abs(across-r.at)<=width/2;
      });
      if(road)this.onRoadSelect(road);
    }
  }
  private drawSelection(){
    this.selection.clear();if(!this.selected)return;
    const a=this.atlas.assets.get(this.selected.asset)!;
    const {x,y,scale}=this.selected;
    groundPlane(this.selection,x,y,a.footprint[0]*scale,a.footprint[1]*scale,0xe8d6a3,0,.2);
  }
  private draw() {
    const began=performance.now();const camera=this.cameras.main;
    camera.preRender();const bounds=camera.worldView;const zoom=this.viewZoom;
    const close=zoom>(this.quality==='low'?3:2.1);
    if(this.groundClose!==close||this.lastDraw===0){drawPublicRealm(this.ground,this.composition.roads,this.composition.surfaces,close);this.groundClose=close;}
    for(const sprite of this.sprites.values())sprite.setVisible(false);
    this.atlas.begin(zoom,this.dpr,this.quality);
    for(const item of this.composition.objects){
      if(item.detail==='close'&&(!close||this.quality==='low'))continue;
      if(item.detail==='medium'&&zoom<.65)continue;
      if(this.quality==='low'&&this.atlas.assets.get(item.asset)?.type==='tree'&&Number(item.id.split('-').at(-1))%3===0)continue;
      const asset=this.atlas.assets.get(item.asset);if(!asset)continue;
      const pos=projectMetres(item.x,item.y);
      const w=asset.worldWidth*item.scale,h=asset.worldHeight*item.scale;
      const left=pos.x-w*asset.anchor[0],top=pos.y-h*asset.anchor[1];
      if(left>bounds.right+10||left+w<bounds.left-10||top>bounds.bottom+10||top+h<bounds.top-10)continue;
      if(this.quality!=='low'&&this.atlas.assets.has(item.asset+'-shadow'))this.image(item,item.asset+'-shadow',-9000+(item.x+item.y)*.001);
      // Ground sorting uses the front of the object's footprint, so towers do not sort by roof.
      this.image(item,item.asset,(item.x+item.y+(asset.footprint[0]+asset.footprint[1])*.35)*.6);
    }
    this.atlas.finish();this.drawSelection();this.dirty=false;this.drawMs=performance.now()-began;
  }
  private image(item: LabObject,id: string,depth: number) {
    const frame=this.atlas.frame(id);if(!frame)return;
    const asset=this.atlas.assets.get(id)!;const key=id===item.asset?item.id:item.id+'-shadow';
    let image=this.sprites.get(key);
    if(!image){image=this.add.image(0,0,frame.key,id);this.sprites.set(key,image);}
    else image.setTexture(frame.key,id);
    const pos=projectMetres(item.x,item.y);
    image.setOrigin(asset.anchor[0],asset.anchor[1]).setPosition(pos.x,pos.y).setScale(item.scale/frame.tier).setDepth(depth).setVisible(true);
  }
  update(_time: number,delta: number) {
    if(!this.atlas)return;
    this.frames.push(delta);if(this.frames.length>180)this.frames.shift();this.measured++;
    const camera=this.cameras.main;const next=zoomStep(this.viewZoom,this.targetZoom,delta);
    if(next!==this.viewZoom){
      camera.setZoom(next*this.dpr);
      if(this.anchor){const a=this.anchor;camera.scrollX=anchoredScroll(a.worldX,a.x,camera.width,camera.zoom);camera.scrollY=anchoredScroll(a.worldY,a.y,camera.height,camera.zoom);}
    }
    if(this.measured%60===0)this.resize();
    const key=`${Math.round(camera.scrollX*2)}:${Math.round(camera.scrollY*2)}:${Math.round(camera.zoom*100)}`;
    if((this.dirty||key!==this.cameraKey)&&_time-this.lastDraw>60){this.draw();this.cameraKey=key;this.lastDraw=_time;}
  }
  diagnostics() {
    const sorted=[...this.frames].sort((a,b)=>a-b);const mean=this.frames.reduce((a,b)=>a+b,0)/Math.max(1,this.frames.length);
    const visible=[...this.sprites.values()].filter(s=>s.visible);
    return {css:`${this.cssWidth}×${this.cssHeight}`,buffer:`${this.game.canvas.width}×${this.game.canvas.height}`,
      dpr:this.dpr,deviceDpr:this.testDpr??devicePixelRatio,zoom:this.viewZoom,fps:mean?1000/mean:0,p95:sorted[Math.floor(sorted.length*.95)]??0,
      visible:visible.length,allocated:this.sprites.size,textureMiB:this.atlas?.memoryMiB??0,drawMs:this.drawMs,
      lod:this.viewZoom<.65?'city':this.viewZoom>2.1?'close':'district',quality:this.quality,
      sourceTier:visible.length?Math.max(...visible.map(s=>Number(s.texture.key.split('-').at(-2)))):0};
  }
}
