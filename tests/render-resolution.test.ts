import { describe, expect, it, vi } from 'vitest';
import { anchoredScroll, MAX_ZOOM, renderLayout, sourceScale, zoomStep, zoomAnchor } from '../client/game/render-policy';
import { ArtBounds, DetailAtlas } from '../client/game/detail-atlas';
import { drawArtFrame } from '../client/game/art-atlas';

describe('render resolution and camera focus', () => {
  it('accepts a professional trimmed master sheet with the stable world anchor',()=>{
    const textures={exists:(key:string)=>key==='city-master-12-close',get:()=>({has:(key:string)=>key==='building-residential-1-0'})};
    const atlas=new DetailAtlas({textures} as never);atlas.begin('high',12,true);
    expect(atlas.resolve('building-residential-1-0',12,true)).toEqual({texture:'city-master-12-close',frame:'building-residential-1-0',scale:12,ox:.5,oy:.75});
    expect(atlas.pageCount).toBe(0);
  });
  it('uses vector masters rather than blurry sprites when the bounded atlas cache fills',()=>{
    const context=new Proxy({}, {get:()=>()=>{}});
    vi.stubGlobal('document',{createElement:()=>({getContext:()=>context})});
    const textures={addCanvas:()=>({add(){},refresh(){}}),remove(){}};
    try{
      const atlas=new DetailAtlas({textures} as never);atlas.begin('low',12,true);
      const keys=new Set<string>();
      for(const type of ['residential','commercial','industrial'])for(let level=1;level<=5;level++)for(let variant=0;variant<4;variant++)keys.add(`building-${type}-${level}-${variant}`);
      atlas.prepare(keys,12,true);
      expect(atlas.pageCount).toBeLessThanOrEqual(2);
      expect([...keys].some(key=>atlas.resolve(key,12,true).vector)).toBe(true);
      atlas.finish();atlas.begin('low',4,false);expect(atlas.pageCount).toBe(0);
    }finally{vi.unstubAllGlobals();}
  });
  it('retains Phaser pointer prototype coordinates for wheel anchoring',()=>{
    const pointer=Object.create({get x(){return 420;},get y(){return 310;}});
    expect(zoomAnchor(pointer,{x:813,y:240})).toEqual({x:420,y:310,worldX:813,worldY:240});
  });
  it('separates physical backing pixels from CSS dimensions across requested viewports', () => {
    for (const [width, height] of [[1920,1080],[1440,900],[768,1024],[430,932],[390,844]]) {
      const high = renderLayout(width,height,2,'high');
      expect(high.backingWidth).toBe(width*2); expect(high.backingHeight).toBe(height*2);
      expect(renderLayout(width,height,4,'low').dpr).toBe(1);
      const medium=renderLayout(width,height,4,'medium');expect(medium.dpr).toBeLessThanOrEqual(1.5);
      expect(high.width).toBe(width); expect(high.height).toBe(height);
    }
    expect(renderLayout(3840,2160,4,'high').dpr).toBeLessThan(1.1);
  });
  it('supplies native physical source resolution at street zoom for each quality cap', () => {
    expect(MAX_ZOOM).toBe(6);
    for (const [quality,dpr] of [['low',1],['medium',1.5],['high',2]] as const) {
      for (const zoom of [1.5,2,2.5,3,MAX_ZOOM]) expect(sourceScale(zoom,dpr,quality)).toBeGreaterThanOrEqual(zoom*dpr);
    }
    expect(sourceScale(MAX_ZOOM,2,'high')).toBe(12);
  });
  it('keeps an off-centre world anchor under the pointer through smooth DPR-aware zoom', () => {
    for (const dpr of [1,1.5,2]) {
      const viewport=1440*dpr,screen=480*dpr,world=813.25;
      let zoom=.5;
      for (let n=0;n<100;n++) {
        zoom=zoomStep(zoom,6,16.67);
        const physicalZoom=zoom*dpr,scroll=anchoredScroll(world,screen,viewport,physicalZoom);
        expect(scroll+viewport/2+(screen-viewport/2)/physicalZoom).toBeCloseTo(world,9);
        expect(zoom).toBeLessThanOrEqual(6);
      }
      expect(zoom).toBe(6);
    }
  });
  it('packs close architectural masters with stable anchors and no clipping at native resolution', () => {
    for (const type of ['residential','commercial','industrial']) for (let level=1;level<=5;level++) for (let variant=0;variant<4;variant++) {
      const bounds=new ArtBounds();drawArtFrame(bounds,`building-${type}-${level}-${variant}`,true);
      const size=bounds.size(12);
      expect(size.width).toBeGreaterThan(300);expect(size.height).toBeGreaterThan(150);
      expect(size.width+4).toBeLessThan(2048);expect(size.height+4).toBeLessThan(2048);
      expect(size.left).toBeLessThan(bounds.left*12);expect(size.top).toBeLessThan(bounds.top*12);
    }
    const vehicle=new ArtBounds();drawArtFrame(vehicle,'vehicle-danfo-0',true);
    expect(vehicle.size(12).width).toBeGreaterThan(60);
  });
});
