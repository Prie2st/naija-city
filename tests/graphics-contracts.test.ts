import { describe, expect, it } from 'vitest';
import { createCity } from '../shared/simulation/engine';
import { createBuilding } from '../shared/simulation/buildings';
import { decodeCity } from '../shared/simulation/save-format';
import { buildingFrame } from '../client/game/art-atlas';
import { drawPrivateBuilding } from '../client/game/building-art';
import { privatePropKinds, visualLod, WORLD_STYLE, graphicsOptions } from '../client/game/visual-style';
import type { ArtPen, Point } from '../client/game/art-primitives';
import { TrafficArt } from '../client/game/traffic-art';
import { cityActivity } from '../shared/simulation/activity';

describe('rendering contracts',()=>{
  it('keeps visual scale and graphics options outside city saves',()=>{
    const city=createCity(0);const saved=JSON.stringify(city);
    const options=graphicsOptions('low');options.props=false;
    expect(WORLD_STYLE.tileMetres).toBe(20);expect(JSON.stringify(city)).toBe(saved);expect(decodeCity(JSON.parse(saved))).toEqual(city);
  });
  it('uses deterministic building frames across reloads and separately represents construction/abandonment',()=>{
    const b=createBuilding('residential',400,731,0,true),frame=buildingFrame(b,false);
    expect(buildingFrame(JSON.parse(JSON.stringify(b)),false)).toBe(frame);
    b.constructionState='redevelopment';b.pendingLevel=3;b.constructionProgress=60;
    expect(buildingFrame(b,false)).toBe('construction-residential-3-1');
    b.constructionState='complete';b.pendingLevel=null;b.abandoned=true;expect(buildingFrame(b,false)).toContain('abandoned');
  });
  it('only presents private adaptations that exist in simulation and hides inactive construction props',()=>{
    const b=createBuilding('commercial',400,731,0,true);expect(privatePropKinds(b)).toEqual([]);
    b.generator=50;b.privateWater=50;b.privateBorehole=true;expect(privatePropKinds(b)).toHaveLength(3);
    b.abandoned=true;expect(privatePropKinds(b)).toEqual([]);b.abandoned=false;b.constructionState='redevelopment';expect(privatePropKinds(b)).toEqual([]);
  });
  it('uses more aggressive far LOD on low quality while retaining close detail',()=>{
    expect(visualLod(.7,'low')).toBe('far');expect(visualLod(.7,'high')).toBe('medium');expect(visualLod(2.5,'medium')).toBe('close');
  });
  it('initializes the representative vehicle pool on its first frame without changing trips',()=>{
    const city=createCity(0),before=JSON.stringify(city);
    const sprite={setOrigin(){return this;},setTexture(){return this;},setPosition(){return this;},setScale(){return this;},setDepth(){return this;},setTint(){return this;},setVisible(){return this;}};
    const scene={add:{image:()=>({...sprite})},cameras:{main:{worldView:{contains:()=>true}}}};
    const art=new TrafficArt(scene as never);art.update({clear(){}} as never,city,100,1.5,true,1,cityActivity(city,12));
    expect(art.count).toBeGreaterThan(0);expect(art.count).toBeLessThanOrEqual(36);expect(JSON.stringify(city)).toBe(before);
    art.update({clear(){}} as never,city,200,1.5,false,1,cityActivity(city,12));
    art.update({clear(){}} as never,city,300,1.5,true,1,cityActivity(city,12));
    expect(art.count).toBeLessThanOrEqual(36);
  });
  it('authors all variants/levels inside atlas cells without modifying building state',()=>{
    const coords:number[]=[];
    const pen:ArtPen={fillStyle(){},lineStyle(){},fillPoints(p:Point[]){p.forEach(q=>coords.push(q.x,q.y));},strokePoints(p:Point[]){p.forEach(q=>coords.push(q.x,q.y));},fillRect(){},strokeRect(){},fillEllipse(){},fillCircle(){},fillRoundedRect(){},lineBetween(x,y,x2,y2){coords.push(x,y,x2,y2);}};
    for(const type of ['residential','commercial','industrial'] as const)for(let level=1;level<=5;level++)for(let variant=0;variant<4;variant++){
      const b=createBuilding(type,variant,731,0,true);b.level=level;b.variant=variant;const saved=JSON.stringify(b);drawPrivateBuilding(pen,b,0,0);expect(JSON.stringify(b)).toBe(saved);
    }
    expect(coords.every(Number.isFinite)).toBe(true);expect(Math.min(...coords)).toBeGreaterThan(-83);expect(Math.max(...coords)).toBeLessThan(28);
  });
});
