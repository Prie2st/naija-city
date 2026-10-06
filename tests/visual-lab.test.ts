import { describe,expect,it } from 'vitest';
import { readFileSync,readdirSync } from 'node:fs';
import { createComposition, densityComposition, districts, cameraFrame, projectMetres, WORLD_SCALE } from '../client/game/visual-lab/composition';

const manifest=JSON.parse(readFileSync('public/assets/visual-lab/manifest.json','utf8'));

describe('independent architectural benchmark',()=>{
  it('composes all five districts deterministically with separately addressable objects',()=>{
    const a=createComposition();
    expect(a).toEqual(createComposition());
    expect(new Set(a.objects.map(o=>o.district))).toEqual(new Set(Object.keys(districts)));
    expect(new Set(a.objects.map(o=>o.id)).size).toBe(a.objects.length);
    expect(a.objects.every(o=>manifest.assets.some((asset: {id: string})=>asset.id===o.asset))).toBe(true);
  });
  it('contains eight dense 6–12-storey buildings belonging to one complex',()=>{
    const complex=createComposition().objects.filter(o=>o.group==='urban-courtyard-complex');
    expect(complex).toHaveLength(8);
    const floors=complex.map(o=>manifest.assets.find((a:{id:string})=>a.id===o.asset).floors);
    expect(floors.every(n=>n>=6&&n<=12)).toBe(true);
    expect(new Set(complex.map(o=>o.asset)).size).toBe(5);
  });
  it('uses visual aggregation without changing or importing simulation entities',()=>{
    expect([1,2,3,4,5].map(level=>densityComposition(level).structures)).toEqual([2,3,2,3,4]);
    for(const file of readdirSync('client/game/visual-lab').filter(f=>f.endsWith('.ts'))){
      const source=readFileSync('client/game/visual-lab/'+file,'utf8');
      expect(source).not.toMatch(/from\s+['"].*(simulation|persistence)/);
      expect(source).not.toMatch(/localStorage|indexedDB|createCity|advanceCity/);
    }
  });
  it('locks car, parking, lanes and tile reference to the same metre scale',()=>{
    expect(WORLD_SCALE.metresPerLogicalTile).toBe(20);
    expect(WORLD_SCALE.localCarriageway/2).toBeGreaterThan(WORLD_SCALE.sedan.width);
    expect(WORLD_SCALE.parkingBay.length).toBeGreaterThan(WORLD_SCALE.sedan.length);
    expect(WORLD_SCALE.parkingBay.width).toBeGreaterThan(WORLD_SCALE.sedan.width);
    expect(projectMetres(20,0)).toEqual({x:24,y:12});
    expect(projectMetres(0,20)).toEqual({x:-24,y:12});
    expect(WORLD_SCALE.boulevardCarriageway-WORLD_SCALE.boulevardMedian).toBeCloseTo(6*WORLD_SCALE.laneWidth);
  });
  it('provides distinct city, district, block and street frames on desktop and mobile',()=>{
    for(const width of [390,430,1024,1440]){
      const city=cameraFrame('urban','city',width,932);
      const district=cameraFrame('urban','district',width,932);
      const block=cameraFrame('urban','block',width,932);
      const street=cameraFrame('urban','street',width,932);
      expect(city.w).toBeGreaterThan(district.w);
      expect(district.w).toBeGreaterThan(block.w);
      expect(street.zoom).toBeGreaterThan(block.zoom!);
      expect(street.zoom).toBeLessThanOrEqual(6);
    }
  });
  it('uses native high-resolution masters, padded bounded atlases and a controlled memory budget',()=>{
    const pages=new Map<string,any>();
    for(const asset of manifest.assets){
      expect(asset.sourceScale).toBeGreaterThan(23.8);
      expect(asset.masterSize.every((size:number)=>size>0)).toBe(true);
      for(const tier of [2,6,9,12]){
        const key=manifest.locations[tier][asset.id];
        let page=pages.get(key);if(!page){page=JSON.parse(readFileSync(`public/assets/visual-lab/${key}.json`,'utf8'));pages.set(key,page);}
        const frame=page.frames[asset.id].frame;
        expect(frame.x).toBeGreaterThanOrEqual(2);expect(frame.y).toBeGreaterThanOrEqual(2);
        expect(frame.x+frame.w+2).toBeLessThanOrEqual(page.meta.size.w);
        expect(frame.y+frame.h+2).toBeLessThanOrEqual(page.meta.size.h);
        expect(frame.w).toBeLessThanOrEqual(asset.masterSize[0]);
        expect(frame.h).toBeLessThanOrEqual(asset.masterSize[1]);
      }
    }
    const highMemory=manifest.sheets[12].reduce((n:number,p:{width:number;height:number})=>n+p.width*p.height*4/1048576,0);
    expect(highMemory).toBeLessThan(64);
  });
});
