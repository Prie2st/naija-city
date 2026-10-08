import type Phaser from 'phaser';
import type { Building, InfrastructureKind, Terrain, Zone } from '../../shared/types/city';
import type { TravelMode } from '../../shared/types/mobility';
import type { VisualVehicle } from './activity-policy';
import { CanvasPen, poly, type ArtPen } from './art-primitives';
import { drawPrivateBuilding } from './building-art';
import { drawInfrastructure } from './infrastructure-art';
import { drawTerrain, drawVegetation, drawProp } from './environment-art';
import { WORLD_STYLE } from './visual-style';
import { createBuilding } from '../../shared/simulation/buildings';
import { asset, emptyServices } from '../../shared/simulation/infrastructure-config';
export const ART_ATLAS = 'city-materials';
export const VEHICLE_ATLAS = 'city-vehicles-detail';
export const ATLAS_ANCHOR = { x: .5, y: .75 };
export function buildingFrame(b: Building, far: boolean) {
  const level=b.pendingLevel??b.level;
  if(b.constructionState==='site-preparation')return `site-${b.type}`;
  if(b.constructionState!=='complete')return `construction-${b.type}-${level}-${b.constructionProgress<45?0:b.constructionProgress<75?1:2}`;
  if(b.abandoned)return `abandoned-${b.type}-${level}`;
  return `building-${b.type}-${level}-${far?'far':b.variant%4}`;
}
function drawVehicle(g: ArtPen, mode: VisualVehicle, heading: number) {
  const police=mode==='police-car';if(police)mode='car';
  const emergency=mode==='fire-engine', waste=mode==='waste-truck';if(emergency||waste)mode='truck';
  const angle=[Math.atan2(12,24),Math.atan2(12,-24),Math.atan2(-12,-24),Math.atan2(-12,24)][heading];
  const l=mode==='bus'?5.6:mode==='truck'?5:mode==='danfo'?3.4:mode==='delivery'?3.2:mode==='car'||mode==='taxi'?2.5:mode==='keke'?1.7:1.35,w=mode==='bus'||mode==='truck'?1.5:mode==='danfo'||mode==='delivery'?1.25:mode==='car'||mode==='taxi'?1:mode==='keke'?1:.45;
  const p=(u:number,v:number,z=0)=>({x:Math.cos(angle)*u-Math.sin(angle)*v,y:Math.sin(angle)*u+Math.cos(angle)*v-z});
  g.fillStyle(0x39483d,.18);g.fillEllipse(2,2,l*2+2,w*2+2);
  const wheel=(u:number,v:number)=>{const q=p(u,v);g.fillStyle(0x333c37);g.fillEllipse(q.x,q.y,1.7,1.4);};
  if(mode==='okada') {
    wheel(-1.3,0);wheel(1.3,0);g.lineStyle(.8,0x666e66);const a=p(-1.3,0),b=p(1.3,0);g.lineBetween(a.x,a.y,b.x,b.y);
    const q=p(0,0,1.3);g.fillStyle(0x647c88);g.fillEllipse(q.x,q.y,2,2);g.fillStyle(0xc5b691);g.fillCircle(q.x,q.y-1.2,.65);return;
  }
  wheel(-l+1,-w);wheel(-l+1,w);wheel(l-1,-w);if(mode!=='keke')wheel(l-1,w);
  const color=police?0x718ba1:mode==='danfo'?0xcba650:mode==='bus'?0x739186:mode==='keke'?0xbfb267:mode==='taxi'?0xb5a56b:0xb5bab0;
  poly(g,0x667165,[p(-l,-w),p(l,-w),p(l,w),p(-l,w)]);
  poly(g,color,[p(-l,-w,1.4),p(l,-w,1.4),p(l,w,1.4),p(-l,w,1.4)]);
  const roof=mode==='car'?l*.5:l*.77;
  poly(g,0x486772,[p(-roof,-w*.82,1.5),p(roof,-w*.82,1.5),p(roof,w*.82,1.5),p(-roof,w*.82,1.5)]);
  poly(g,mode==='danfo'?0xd6b66b:mode==='bus'?0x9aafa1:0xc5c7bc,[p(-roof*.72,-w*.78,2),p(roof*.72,-w*.78,2),p(roof*.72,w*.78,2),p(-roof*.72,w*.78,2)]);
  if(mode==='danfo'||mode==='bus')for(let n=0;n<4;n++){const a=p(-roof+n*roof*.5,w*.85,1.8),b=p(-roof+n*roof*.5,w*.85,.5);g.lineStyle(.45,0x526457);g.lineBetween(a.x,a.y,b.x,b.y);}
  if(mode==='keke'){const q=p(l,0,1.5);g.fillStyle(0xe0d2a7);g.fillCircle(q.x,q.y,.6);}
  if(police){const q=p(0,0,2.3);g.fillStyle(0x496e91);g.fillRect(q.x-1,q.y-.35,2,.7);}
  if(mode==='taxi'){const q=p(0,0,2.4);g.fillStyle(0xe4d8ab);g.fillRect(q.x-.7,q.y-.4,1.4,.7);}
  if(mode==='truck'||mode==='delivery'){
    if(emergency||waste){g.fillStyle(emergency?0xa94f3f:0x658276);g.fillEllipse(0,-2,3,2);}
    const length=mode==='truck'?l*.65:l*.6;
    poly(g,emergency?0xb26454:waste?0x7f9984:0x8d9994,[p(-l,-w,3.1),p(length,-w,3.1),p(length,w,3.1),p(-l,w,3.1)]);
    poly(g,emergency?0x974b3e:waste?0x56795d:0x667b74,[p(-l,w,1.4),p(length,w,1.4),p(length,w,3.1),p(-l,w,3.1)]);
    for(let n=0;n<5;n++){const a=p(-l+n*length*.28,w,1.5),b=p(-l+n*length*.28,w,3);g.lineStyle(.25,0xa4b0a5);g.lineBetween(a.x,a.y,b.x,b.y);}
  }
}
// Vector masters are resolution independent. The detail atlas bakes only requested frames.
export function drawArtFrame(g: ArtPen, key: string, close = false) {
  const parts = key.split('-');
  if (['building', 'construction', 'abandoned', 'site'].includes(parts[0])) {
    const b = createBuilding(parts[1] as Zone, 0, 0, 0, true);
    b.level = Number(parts[2]) || 1;
    b.variant = Number(parts[3]) || 0;
    if (parts[0] === 'site') b.constructionState = 'site-preparation';
    if (parts[0] === 'abandoned') b.abandoned = true;
    if (parts[0] === 'construction') { b.constructionState = 'construction'; b.constructionProgress = [25, 60, 85][Number(parts[3])]; }
    drawPrivateBuilding(g, b, 0, 0, parts[3] !== 'far', close);
  } else if (parts[0] === 'terrain') drawTerrain(g, parts[1] as Terrain, Number(parts[2]), close);
  else if (parts[0] === 'tree') drawVegetation(g, Number(parts[1]), true, close);
  else if (parts[0] === 'utility') drawInfrastructure(g, { infrastructure: asset(key.slice(8) as InfrastructureKind, 0, 0, 0), services: emptyServices() } as never, 0, 0);
  else if (parts[0] === 'vehicle') drawVehicle(g, parts[1] as VisualVehicle, Number(parts[2]));
  else drawProp(g, key);
}
export function createArtAtlas(scene: Phaser.Scene) {
  if(scene.textures.exists(ART_ATLAS))return scene.textures.get(ART_ATLAS).frameTotal-1;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=WORLD_STYLE.atlasSize;
  const ctx=canvas.getContext('2d')!;const pen=new CanvasPen(ctx),frames:{key:string;x:number;y:number}[]=[];
  const add=(key:string,draw:()=>void)=>{
    const i=frames.length,x=(i%16)*128,y=Math.floor(i/16)*128;if(i>=256)throw new Error('City atlas exceeds its 16 MB budget.');
    ctx.save();ctx.beginPath();ctx.rect(x,y,128,128);ctx.clip();ctx.translate(x+64,y+96);ctx.scale(WORLD_STYLE.atlasScale,WORLD_STYLE.atlasScale);draw();ctx.restore();frames.push({key,x,y});
  };
  for(const type of ['residential','commercial','industrial'] as Zone[]) {
    for(let level=1;level<=5;level++) {
      for(const variant of [0,1,2,3,'far'] as const){const b=createBuilding(type,0,0,0,true);b.level=level;b.variant=variant==='far'?0:variant;add(`building-${type}-${level}-${variant}`,()=>drawPrivateBuilding(pen,b,0,0,variant!=='far'));}
      const abandoned=createBuilding(type,0,0,0,true);abandoned.level=level;abandoned.abandoned=true;add(`abandoned-${type}-${level}`,()=>drawPrivateBuilding(pen,abandoned,0,0));
      for(let stage=0;stage<3;stage++){const b=createBuilding(type,0,0,0);b.level=level;b.constructionState='construction';b.constructionProgress=[25,60,85][stage];add(`construction-${type}-${level}-${stage}`,()=>drawPrivateBuilding(pen,b,0,0));}
    }
    const b=createBuilding(type,0,0,0);add(`site-${type}`,()=>drawPrivateBuilding(pen,b,0,0));
  }
  for(const terrain of ['land','vegetation','water','wetland'] as Terrain[])for(let v=0;v<8;v++)add(`terrain-${terrain}-${v}`,()=>drawTerrain(pen,terrain,v));
  for(let v=0;v<8;v++)add(`tree-${v}`,()=>drawVegetation(pen,v));
  for(const kind of ['generator-0','generator-1','tank','pump'])add(kind,()=>drawProp(pen,kind));
  for(const kind of ['diesel','gas','solar','substation','borehole','water-tower','treatment'] as InfrastructureKind[])add(`utility-${kind}`,()=>drawInfrastructure(pen,{infrastructure:asset(kind,0,0,0),services:emptyServices()} as never,0,0));
  for(const mode of ['car','taxi','okada','keke','danfo','bus','delivery','truck','fire-engine','waste-truck','police-car'] as VisualVehicle[])for(let h=0;h<4;h++)add(`vehicle-${mode}-${h}`,()=>drawVehicle(pen,mode,h));
  const texture=scene.textures.addCanvas(ART_ATLAS,canvas)!;
  for(const f of frames) {
    // Trim transparent margins: a ground tile submits a 56x29 quad rather than a 128x128 quad.
    const pixels=ctx.getImageData(f.x,f.y,128,128).data;
    let left=127,top=127,right=0,bottom=0;
    for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(pixels[(y*128+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    const width=right-left+1,height=bottom-top+1;
    texture.add(f.key,0,f.x+left,f.y+top,width,height)!.setTrim(128,128,left,top,width,height);
  }
  return frames.length;
}
export function createVehicleAtlas(scene: Phaser.Scene) {
  if(scene.textures.exists(VEHICLE_ATLAS))return;
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;
  const ctx=canvas.getContext('2d')!,frames:{key:string;x:number;y:number}[]=[];
  for(const mode of ['car','taxi','okada','keke','danfo','bus','delivery','truck','fire-engine','waste-truck','police-car'] as VisualVehicle[])for(let heading=0;heading<4;heading++){
    const n=frames.length,x=n%8*192,y=Math.floor(n/8)*192;
    ctx.save();ctx.translate(x+96,y+144);ctx.scale(12,12);drawVehicle(new CanvasPen(ctx),mode,heading);ctx.restore();
    frames.push({key:`vehicle-${mode}-${heading}`,x,y});
  }
  const texture=scene.textures.addCanvas(VEHICLE_ATLAS,canvas)!;
  for(const f of frames)texture.add(f.key,0,f.x,f.y,192,192);
  texture.setFilter(0);
}
