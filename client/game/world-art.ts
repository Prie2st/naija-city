import { facilityFrame } from './public-service-art';
import type Phaser from 'phaser';
import type { Building, City, Tile } from '../../shared/types/city';
import { ART_ATLAS, ATLAS_ANCHOR, buildingFrame, createArtAtlas, createVehicleAtlas, drawArtFrame } from './art-atlas';
import { DetailAtlas } from './detail-atlas';
import { sourceScale } from './render-policy';
import { buildingHeight } from './building-art';
import { castShadow, tintedPen } from './art-primitives';
import { infrastructureHeight } from './infrastructure-art';
import { isDrainage } from '../../shared/simulation/infrastructure-config';
import { privatePropKinds, visualHash, visualLod, type GraphicsOptions } from './visual-style';
import { ArchitectureAtlas } from './architecture-atlas';
import { benchmarkBuilding, benchmarkProp } from './architecture-policy';
import { ModelAtlas } from './model-atlas';
import { modelBuilding, modelProp, modelRoad, roadMask } from './model-policy';

// Bounded atlases and reusable records; hidden sprites are reused on the next camera redraw.
export class WorldArt {
  private pool: Phaser.GameObjects.Image[] = [];
  private vectorPool: Phaser.GameObjects.Graphics[] = []; private vectors = 0;
  private effectsPool:Phaser.GameObjects.Graphics[]=[];private effects=0;
  private effect(x:number,y:number,depth:number){let g=this.effectsPool[this.effects++];if(!g){g=this.scene.add.graphics();this.effectsPool.push(g);}return g.clear().setPosition(x,y).setDepth(depth+.008).setVisible(true);}
  private floodPool: Phaser.GameObjects.Graphics[]=[];private floods=0;
  readonly detailAtlas: DetailAtlas;
  readonly architecture: ArchitectureAtlas;
  readonly models: ModelAtlas;
  previewGround = new Map<number,string>();
  private source = 1.15; private close = false;
  count=0; frames=0; visibleTiles=0;
  constructor(private scene: Phaser.Scene) { this.frames=createArtAtlas(scene); createVehicleAtlas(scene); this.detailAtlas = new DetailAtlas(scene); this.architecture = new ArchitectureAtlas(scene); this.models=new ModelAtlas(scene); }
  begin(options: GraphicsOptions, zoom: number, dpr: number) { this.count=0;this.effects=0;this.vectors=0;this.floods=0;this.visibleTiles=0; this.source=sourceScale(zoom,dpr,options.quality); this.close=visualLod(zoom,options.quality)==='close'; this.detailAtlas.begin(options.quality,this.source,this.close); this.architecture.begin('low','far'); this.models.begin(options.quality,visualLod(zoom,options.quality)); }
  private buildingKey(b: Building, far: boolean) {
    const model=modelBuilding(b),modelKey=model?`model-${model.id}`:'';
    if(modelKey&&this.models.resolve(modelKey))return modelKey;
    const asset=benchmarkBuilding(b),key=asset?`benchmark-${asset.id}`:'';
    return key&&this.architecture.resolve(key)?key:buildingFrame(b,far);
  }
  private propKey(kind: string, variant: number) {
    const model=modelProp(kind),modelKey=model?`model-${model.id}`:'';
    if(modelKey&&this.models.resolve(modelKey))return modelKey;
    const asset=benchmarkProp(kind,variant),key=asset?`benchmark-${asset.id}`:'';
    return key&&this.architecture.resolve(key)?key:kind;
  }
  private bridge(city: City, t: Tile) {
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
      const nx=t.x+dx,ny=t.y+dy;
      if(nx<0||ny<0||nx>=city.size||ny>=city.size)continue;
      const n=city.tiles[ny*city.size+nx];
      if(n.road&&n.infrastructure&&isDrainage(n.infrastructure.kind)){
        const model=`model-driveway-bridge-${dx?1:0}`;
        return {dx,dy,key:this.models.resolve(model)?model:`benchmark-driveway-bridge-${dx?1:0}`};
      }
    }
  }
  prepare(city: City, tiles: Tile[], options: GraphicsOptions, zoom: number) {
    const keys=new Set<string>(),lod=visualLod(zoom,options.quality);
    for(const t of tiles){
      const hash=visualHash(city.seed,t.y*city.size+t.x),land=t.terrain==='land'||t.terrain==='vegetation';
      // Homogeneous model landscape uses the existing opaque ground batch, avoiding
      // a second full-screen transparent sprite layer. Water retains its texture.
      if(!land)keys.add(`terrain-${t.terrain}-${hash%8}`);
      const facility=city.publicServices?.facilities.find(f=>f.id===t.publicFacility);if(facility)keys.add(facilityFrame(facility));
      if(t.building){keys.add(this.buildingKey(t.building,lod==='far'));if(options.props&&lod==='close')for(const kind of privatePropKinds(t.building))keys.add(this.propKey(kind,t.building.variant));}
      else if(t.terrain==='vegetation'&&!t.road&&!t.zone&&!t.publicFacility&&!t.infrastructure&&options.vegetation&&(options.quality!=='low'||hash%3!==0)){
        const tree=`model-tree-${hash%3}`;
        keys.add(this.models.resolve(tree)?tree:`tree-${hash%8}`);
        if(lod==='close'&&options.quality==='high'&&hash%3===0)keys.add(this.models.resolve(tree)?tree:`tree-${(hash+3)%8}`);
      }
      if(t.infrastructure&&!isDrainage(t.infrastructure.kind))keys.add(`utility-${t.infrastructure.kind}`);
    }
    this.detailAtlas.prepare(new Set([...keys].filter(key=>!key.startsWith('benchmark-')&&!key.startsWith('model-'))),this.source,this.close);
    if([...keys].some(key=>key.startsWith('benchmark-')))this.architecture.begin(options.quality,lod);
  }
  image(frame:string,x:number,y:number,depth:number,tint=0xffffff,scale=1) {
    const asset=this.models.resolve(frame)??this.architecture.resolve(frame)??this.detailAtlas.resolve(frame,this.source,this.close);
    if(asset.vector){
      let g=this.vectorPool[this.vectors++];
      if(!g){g=this.scene.add.graphics();this.vectorPool.push(g);}
      g.clear().setPosition(x,y).setDepth(depth).setScale(scale).setVisible(true);
      drawArtFrame(tint===0xffffff?g:tintedPen(g,tint),frame,this.close);return;
    }
    let sprite=this.pool[this.count++];
    if(!sprite){sprite=this.scene.add.image(0,0,ART_ATLAS).setOrigin(ATLAS_ANCHOR.x,ATLAS_ANCHOR.y);this.pool.push(sprite);}
    sprite.setTexture(asset.texture,asset.frame).setOrigin(asset.ox,asset.oy).setPosition(x,y).setScale(scale/asset.scale).setDepth(depth).setTint(tint).setVisible(true);
  }
  finish(){this.detailAtlas.finish();for(let n=this.effects;n<this.effectsPool.length;n++)this.effectsPool[n].setVisible(false);for(let n=this.count;n<this.pool.length;n++)this.pool[n].setVisible(false);for(let n=this.vectors;n<this.vectorPool.length;n++)this.vectorPool[n].setVisible(false);for(let n=this.floods;n<this.floodPool.length;n++)this.floodPool[n].setVisible(false);this.architecture.finish();this.models.finish();}
  terrain(city:City,t:Tile,x:number,y:number,wetness:number) {
    this.visibleTiles++;
    const hash=visualHash(city.seed,t.y*city.size+t.x),dim=Math.round(255-wetness*20),tint=(dim<<16)|(dim<<8)|Math.min(255,dim+3);
    if(t.terrain==='water'||t.terrain==='wetland')this.image(`terrain-${t.terrain}-${hash%8}`,x,y,-2,tint);
    const preview=this.previewGround.get(t.y*city.size+t.x);
    if(preview&&this.models.resolve('model-'+preview))this.image('model-'+preview,x,y,-1.5,tint);
  }
  road(city:City,t:Tile,x:number,y:number,wetness:number) {
    const asset=modelRoad(city,t);
    if(!asset||!this.models.resolve('model-'+asset.id))return false;
    const dim=Math.round(255-wetness*35),tint=(dim<<16)|(dim<<8)|Math.min(255,dim+5);
    this.image('model-'+asset.id,x,y,-1.2,tint);return true;
  }
  drainage(city:City,t:Tile,x:number,y:number,wetness:number) {
    if(!t.infrastructure||!isDrainage(t.infrastructure.kind))return false;
    const orientation=roadMask(city,t)&3?0:1;
    const key=`model-drain-${t.infrastructure.kind}-${orientation}`;
    if(!this.models.resolve(key))return false;
    this.image(key,x,y,-1.1,wetness>.1?0xc8d3d2:0xffffff);return true;
  }
  objects(city:City,t:Tile,x:number,y:number,g:Phaser.GameObjects.Graphics,options:GraphicsOptions,zoom:number,wetness:number,overlayTint?:number) {
    const lod=visualLod(zoom,options.quality),hash=visualHash(city.seed,t.y*city.size+t.x),depth=1+(y+12)/1000;
    const brightness=Math.round(255-wetness*12),tint=overlayTint??((brightness<<16)|(brightness<<8)|Math.min(255,brightness+2));
    const facility=city.publicServices?.facilities.find(f=>f.id===t.publicFacility);
    if(facility){
      const park=facility.type==='parks';
      if(park){g.fillStyle(0x7f9c70,.8);g.fillPoints([{x,y},{x:x+24,y:y+12},{x,y:y+24},{x:x-24,y:y+12}],true);g.lineStyle(2.5,0xc6baa0);g.lineBetween(x-12,y+6,x+12,y+18);if(options.vegetation)this.image(facilityFrame(facility),x-5,y+10,depth,tint,.8);}
      else if(facility.location===t.y*city.size+t.x){const side=Math.sqrt(facility.tiles.length),cy=y+(side-1)*12;this.image(facilityFrame(facility),x,cy,1+(cy+12)/1000,facility.active?tint:0x9da29a,Math.min(1.8,1+(side-1)*.6));
        // Small identifying crest, baked facade remains a single pooled sprite.
        const crest=this.effect(x,cy,1+(cy+12)/1000);crest.fillStyle(facility.type==='healthcare'?0xa8504c:facility.type==='fire'?0xa96e42:facility.type==='education'?0x526d96:0x65784e);crest.fillCircle(0,12,2.4);
        if(facility.type==='healthcare'){crest.lineStyle(.6,0xfff8e6);crest.lineBetween(-1.3,12,1.3,12);crest.lineBetween(0,10.7,0,13.3);}}
    }
    if(t.publicServices?.fireActive){const fire=this.effect(x,y,depth);fire.fillStyle(0xd36c37,.7);fire.fillEllipse(3,-4,6,9);fire.fillStyle(0xdda85c,.9);fire.fillEllipse(3,-3,3,5);}
    if(options.props&&lod==='close'&&(t.publicServices?.uncollectedWaste??0)>Math.max(.3,(t.publicServices?.wasteGenerated??0)*7)){const waste=this.effect(x,y,depth);waste.fillStyle(0x777362);waste.fillEllipse(14,15,3,1.4);waste.fillStyle(0x999380);waste.fillEllipse(16,16,2,1);}
    if(t.building){
      const definition=modelBuilding(t.building)??benchmarkBuilding(t.building),frame=this.buildingKey(t.building,lod==='far');
      if(!frame.startsWith('model-')&&!frame.startsWith('benchmark-')&&options.shadows&&options.quality!=='low')castShadow(g,x,y+9,buildingHeight(t.building),15);
      this.image(frame,x,y,depth,overlayTint??(t.building.abandoned?0x929c8e:tint));
      // Baked property ground must not hide authoritative floodwater. This flat ground
      // pass covers paving/lowest foundations while leaving the raised architecture visible.
      if(frame.startsWith('model-')&&t.services.floodDepth>=2){
        let water=this.floodPool[this.floods++];
        if(!water){water=this.scene.add.graphics();this.floodPool.push(water);}
        const flood=t.services.floodDepth;
        water.clear().setPosition(x,y).setDepth(depth+.001).setVisible(true);
        water.fillStyle(0x729895,Math.min(.48,.12+flood/500));
        if(flood<12)water.fillEllipse(7,20,12,3);
        else if(flood<35){water.fillEllipse(0,19,26,6);water.fillEllipse(-12,12,12,3);}
        else water.fillPoints([{x:0,y:0},{x:24,y:12},{x:0,y:24},{x:-24,y:12}],true);
        water.lineStyle(.35,0xd4dfd0,.4);water.lineBetween(-8,18,5,21);
      }
      if(options.props&&lod==='close'&&t.building.constructionState==='complete') {
        const bridge=this.bridge(city,t);
        if(bridge&&(this.models.resolve(bridge.key)||this.architecture.resolve(bridge.key)))this.image(bridge.key,x+(bridge.dx-bridge.dy)*12,y+12+(bridge.dx+bridge.dy)*6,depth+.003,tint);
      }
      if(options.props&&lod==='close')for(const kind of privatePropKinds(t.building)){
        const tank=kind==='tank',pump=kind==='pump';
        const socket=definition?.sockets[tank?'tank':pump?'pump':'generator'];
        this.image(this.propKey(kind,t.building.variant),x+(socket?.x??(pump?13:tank?-12:6)),y+(socket?.y??(tank&&t.building.level>=3?-buildingHeight(t.building)+13:13)),depth+.005,tint);
      }
    } else if(t.terrain==='vegetation'&&!t.road&&!t.zone&&!t.publicFacility&&!t.infrastructure&&options.vegetation) {
      // Low quality retains grove masses while reducing individual crowns.
      if(options.quality!=='low'||hash%3!==0){
        const tree=`model-tree-${hash%3}`,model=!!this.models.resolve(tree);
        if(options.shadows&&options.quality!=='low')castShadow(g,x,model?y+12:y+7,model?9:20,model?3.3:8);
        this.image(model?tree:`tree-${hash%8}`,x+(hash%7)-3,model?y+12:y-2,depth-0.003,0xffffff,0.85+(hash>>>8)%25/100);
        if(lod==='close'&&options.quality==='high'&&hash%3===0)this.image(model?tree:`tree-${(hash+3)%8}`,x-10,model?y+16:y+6,depth+.002,0xffffff,.55);
      }
    }
    if(t.infrastructure&&!isDrainage(t.infrastructure.kind)){
      if(options.shadows&&options.quality!=='low')castShadow(g,x,y+9,infrastructureHeight(t),14);
      this.image(`utility-${t.infrastructure.kind}`,x,y,depth,t.infrastructure.condition<40||t.infrastructure.failedUntil>city.tick?0xc1bda7:tint);
    }
  }
  get allocated(){return this.pool.length;}
  get vectorCount(){return this.vectors;}
}
