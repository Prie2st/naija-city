import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBuilding } from '../shared/simulation/buildings';
import { createCity } from '../shared/simulation/engine';
import { modelBuilding, modelProp, modelRoad, roadMask } from '../client/game/model-policy';
import { modelCatalog } from '../client/game/model-catalog';
import { ModelAtlas } from '../client/game/model-atlas';
import { privatePropKinds } from '../client/game/visual-style';

describe('architectural model benchmark',()=>{
  it('maps real residential levels without mutating saved simulation data',()=>{
    const ids=new Set<string>();
    for(let level=1;level<=5;level++){
      const b=createBuilding('residential',level,731,0,true);b.level=level;b.variant=0;
      const before=JSON.stringify(b),a=modelBuilding(b)!;
      expect(a.level).toBe(level);expect(a.floors).toBe([1,2,4,8,14][level-1]);ids.add(a.id);
      expect(modelBuilding(JSON.parse(before))).toEqual(a);expect(JSON.stringify(b)).toBe(before);
    }
    expect(ids.size).toBe(5);
    const b=createBuilding('residential',1,731,0,true);b.level=3;b.variant=1;
    expect(modelBuilding(b)?.id).toBe('courtyard-apartment');
  });
  it('keeps construction and private adaptation authoritative',()=>{
    const b=createBuilding('residential',1,731,0);
    expect(modelBuilding(b)?.id).toBe('construction-foundation');
    b.constructionState='construction';b.constructionProgress=70;
    expect(modelBuilding(b)?.id).toBe('construction-shell');
    b.generator=60;b.privateWater=50;b.privateBorehole=true;expect(privatePropKinds(b)).toEqual([]);
    b.constructionState='complete';expect(privatePropKinds(b).map(k=>modelProp(k)?.type)).toEqual(['prop','prop','prop']);
    b.generator=0;b.privateWater=0;b.privateBorehole=false;expect(privatePropKinds(b)).toEqual([]);
  });
  it('uses fixed-orientation road connections and retains tapered mixed-class transitions',()=>{
    const city=createCity(0,731);city.tiles.forEach(t=>{t.road=false;t.roadClass=null;});
    const t=city.tiles[10*32+10];t.road=true;t.roadClass='avenue';
    for(const [x,y]of [[9,10],[11,10],[10,9]]){const n=city.tiles[y*32+x];n.road=true;n.roadClass='avenue';}
    expect(roadMask(city,t)).toBe(11);expect(modelRoad(city,t)?.id).toBe('road-avenue-11');
    city.tiles[10*32+11].roadClass='major';expect(modelRoad(city,t)).toBeUndefined();
    t.roadClass='dirt';expect(modelRoad(city,t)).toBeUndefined();
  });
  it('exports every frame with safe gutters and native sampling for 6x / DPR 2',()=>{
    for(const tier of [2,6,9,12]as const){
      const frames=new Set<string>();
      for(const p of modelCatalog.sheets[tier]){
        const png=readFileSync(`public/assets/model/${p.key}.png`);
        expect(png.readUInt32BE(16)).toBe(p.width);expect(png.readUInt32BE(20)).toBe(p.height);
        expect(Math.max(p.width,p.height)).toBeLessThanOrEqual(2048);
        const data=JSON.parse(readFileSync(`public/assets/model/${p.key}.json`,'utf8'));
        for(const [key,value]of Object.entries(data.frames)){
          const f=(value as {frame:{x:number;y:number;w:number;h:number}}).frame;
          expect(f.x).toBeGreaterThanOrEqual(2);expect(f.y).toBeGreaterThanOrEqual(2);
          expect(f.x+f.w+2).toBeLessThanOrEqual(p.width);expect(f.y+f.h+2).toBeLessThanOrEqual(p.height);frames.add(key);
        }
      }
      expect(frames.size).toBe(modelCatalog.assets.length);
    }
    for(const a of modelCatalog.assets){
      expect(a.sourceScale).toBeGreaterThanOrEqual(23.9);expect(a.metresPerTile).toBe(20);
      expect(a.camera).toEqual({projection:'orthographic',azimuth:45,elevation:30});
      expect(Number.isFinite(a.anchor[0])&&Number.isFinite(a.anchor[1])).toBe(true);
    }
  });
  it('loads only requested high pages and releases obsolete tiers',()=>{
    const loaded=new Set<string>(modelCatalog.sheets[2].map(p=>p.key));const requests:string[]=[];let complete=()=>{};
    const scene={textures:{exists:(k:string)=>loaded.has(k),remove:(k:string)=>loaded.delete(k)},
      load:{atlas:(k:string)=>requests.push(k),once:(_e:string,fn:()=>void)=>{complete=fn;},isLoading:()=>false,start(){}},events:{emit(){}}};
    const atlas=new ModelAtlas(scene as never);atlas.begin('high','close');expect(atlas.resolve('model-bungalow')?.scale).toBe(2);atlas.finish();
    expect(requests.length).toBe(1);expect(requests[0]).toContain('-12-');requests.forEach(k=>loaded.add(k));complete();
    atlas.begin('high','close');expect(atlas.resolve('model-bungalow')?.scale).toBe(12);atlas.finish();
    atlas.begin('low','far');atlas.resolve('model-bungalow');atlas.finish();expect(loaded.has(requests[0])).toBe(false);
  });
  it('does not evict an old tier while a visible pooled vehicle still uses it',()=>{
    const old=modelCatalog.sheets[12][0].key;
    const loaded=new Set<string>([old,...modelCatalog.sheets[2].map(p=>p.key)]);
    const vehicle:{visible:boolean;texture:{key:string}}={visible:true,texture:{key:old}};
    const scene={children:{list:[vehicle]},textures:{exists:(k:string)=>loaded.has(k),remove:(k:string)=>loaded.delete(k)},load:{}};
    const atlas=new ModelAtlas(scene as never);
    atlas.begin('low','far');atlas.resolve('model-bungalow');atlas.finish();
    expect(loaded.has(old)).toBe(true);
    vehicle.texture.key=modelCatalog.sheets[2][0].key;
    atlas.finish();expect(loaded.has(old)).toBe(false);
  });
});
