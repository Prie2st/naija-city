import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBuilding } from '../shared/simulation/buildings';
import { architectureSheets } from '../client/game/architecture-catalog';
import { benchmarkAssets, benchmarkBuilding, benchmarkProp } from '../client/game/architecture-policy';
import { ArchitectureAtlas } from '../client/game/architecture-atlas';
import { privatePropKinds } from '../client/game/visual-style';

describe('benchmark architecture asset contracts', () => {
  it('provides structural benchmark forms without changing saved building data', () => {
    for (const [type, level, count] of [['residential',1,6],['residential',2,3],['commercial',1,4],['industrial',1,2]] as const) {
      const forms = new Set<string>();
      for (let variant=0; variant<count; variant++) {
        const b=createBuilding(type,variant,731,0,true);b.variant=variant;b.level=level;
        const before=JSON.stringify(b),asset=benchmarkBuilding(b)!;
        forms.add(asset.footprint);
        expect(benchmarkBuilding(JSON.parse(before))).toEqual(asset);
        expect(JSON.stringify(b)).toBe(before);
      }
      expect(forms.size).toBe(count);
    }
    const higher=createBuilding('residential',1,731,0,true);higher.level=3;
    expect(benchmarkBuilding(higher)).toBeUndefined();
  });
  it('uses actual construction and adaptation state instead of decorative utility props', () => {
    const b=createBuilding('residential',1,731,0);
    expect(benchmarkBuilding(b)?.id).toBe('construction-foundation');
    b.constructionState='construction';b.constructionProgress=60;
    expect(benchmarkBuilding(b)?.id).toBe('construction-shell');
    b.constructionState='complete';
    expect(privatePropKinds(b)).toEqual([]);
    b.generator=50;b.privateWater=50;b.privateBorehole=true;
    expect(privatePropKinds(b).map(kind=>benchmarkProp(kind,b.variant)?.type)).toEqual(['prop','prop','prop']);
    b.abandoned=true;expect(privatePropKinds(b)).toEqual([]);
    expect(benchmarkBuilding(b)?.type).toBe('residential');
  });
  it('exports every manifest frame with native-size sampling, gutters and valid sockets', () => {
    for(const tier of [2,6,9,12] as const) {
      const frames=new Map<string,{frame:{x:number;y:number;w:number;h:number}}>();
      for(const page of architectureSheets[tier]) {
        const data=JSON.parse(readFileSync(`public/assets/architecture/${page.key}.json`,'utf8'));
        const png=readFileSync(`public/assets/architecture/${page.key}.png`);
        expect(png.readUInt32BE(16)).toBe(page.width);expect(png.readUInt32BE(20)).toBe(page.height);
        for(const [key,value]of Object.entries(data.frames)) {
          const frame=(value as {frame:{x:number;y:number;w:number;h:number}}).frame;
          expect(frame.x+frame.w+2).toBeLessThanOrEqual(page.width);
          expect(frame.y+frame.h+2).toBeLessThanOrEqual(page.height);
          expect(frame.x).toBeGreaterThanOrEqual(2);expect(frame.y).toBeGreaterThanOrEqual(2);
          frames.set(key,value as never);
        }
      }
      expect(frames.size).toBe(benchmarkAssets.length);
      for(const asset of benchmarkAssets) {
        expect(frames.get('benchmark-'+asset.id)?.frame.w).toBe(Math.round(asset.worldWidth*tier));
        expect(asset.anchor[0]).toBeGreaterThan(0);expect(asset.anchor[1]).toBeGreaterThan(0);
        for(const socket of Object.values(asset.sockets)) {
          expect(Math.abs(socket.x)).toBeLessThan(22);expect(socket.y).toBeLessThanOrEqual(24);
        }
      }
    }
  });
  it('loads close sheets once and releases obsolete detailed tiers after composition', () => {
    const loaded=new Set<string>([...architectureSheets[2],...architectureSheets[6]].map(p=>p.key));
    const requests:string[]=[];let complete=()=>{};
    const scene={textures:{exists:(key:string)=>loaded.has(key),get:()=>({has:()=>true}),remove:(key:string)=>loaded.delete(key)},
      load:{atlas:(key:string)=>requests.push(key),once:(_event:string,fn:()=>void)=>{complete=fn;},isLoading:()=>false,start(){}},events:{emit(){}}};
    const atlas=new ArchitectureAtlas(scene as never);
    atlas.begin('medium','close');atlas.begin('medium','close');
    expect(requests).toEqual(architectureSheets[9].map(p=>p.key));
    architectureSheets[9].forEach(p=>loaded.add(p.key));complete();
    expect(atlas.resolve('benchmark-bungalow-modest')?.scale).toBe(9);
    expect(loaded.has(architectureSheets[6][0].key)).toBe(false);
    atlas.begin('low','close');architectureSheets[6].forEach(p=>loaded.add(p.key));complete();
    expect(atlas.resolve('benchmark-bungalow-modest')?.scale).toBe(6);
    expect(loaded.has(architectureSheets[9][0].key)).toBe(false);
    expect(atlas.memoryMiB).toBeLessThanOrEqual(17);
  });
});
