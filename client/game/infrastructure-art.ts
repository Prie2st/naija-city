import type { City, Tile } from '../../shared/types/city';
import { tileAt } from '../../shared/simulation/world';
import { isDrainage } from '../../shared/simulation/infrastructure-config';
import { box, contactShadow, ground, poly, project, type ArtPen } from './art-primitives';
export function infrastructureHeight(t: Tile) { return t.infrastructure?.kind === 'water-tower' ? 40 : t.infrastructure?.kind === 'gas' ? 28 : 19; }
export function drawInfrastructure(g: ArtPen, t: Tile, x: number, y: number, city?: City, detail = true) {
  const a=t.infrastructure;if(!a)return;
  const muted=a.condition<40||a.failedUntil>(city?.tick??0);
  if(isDrainage(a.kind)) {
    const channel=a.kind==='channel',engineered=a.kind==='engineered-drain',width=channel?5:engineered?2.6:1.8;
    const arms=[[-19,13,0,22],[0,22,20,13]];
    if(city)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const n=tileAt(city,t.x+dx,t.y+dy);if(n?.infrastructure&&isDrainage(n.infrastructure.kind))arms.push([0,12,(dx-dy)*24,12+(dx+dy)*12]);}
    g.lineStyle(width+2.4,0xaaa796);for(const [ax,ay,bx,by]of arms)g.lineBetween(x+ax,y+ay,x+bx,y+by);
    g.lineStyle(width+1,0x686f68);for(const [ax,ay,bx,by]of arms)g.lineBetween(x+ax,y+ay,x+bx,y+by);
    g.lineStyle(width,muted?0x7d7867:(city?.weather.rainfall??0)>0?0x5a8a8a:channel?0x64847e:0x8b8875);for(const [ax,ay,bx,by]of arms)g.lineBetween(x+ax,y+ay,x+bx,y+by);
    if(detail){g.lineStyle(.6,0xd1cbb5,.8);g.lineBetween(x-19,y+11.5,x,y+20.5);if(engineered){g.lineStyle(.7,0x777f77);for(let n=0;n<5;n++)g.lineBetween(x-17+n*3.2,y+11+n*1.6,x-15+n*3.2,y+15+n*1.6);}else if((city?.weather.rainfall??0)>0){g.lineStyle(.5,0xc0d4c5,.55);g.lineBetween(x-12,y+16,x-4,y+19);}}
    return;
  }
  ground(g,x,y,.05,.05,.9,.9,0xb4b1a0);contactShadow(g,x+2,y+13,35,11);
  const p=(u:number,v:number,z=0)=>project(x,y,u,v,z);
  const line=(u:number,v:number,z:number,u2:number,v2:number,z2:number,c:number,w=1)=>{const q=p(u,v,z),r=p(u2,v2,z2);g.lineStyle(w,c);g.lineBetween(q.x,q.y,r.x,r.y);};
  if(a.kind==='water-tower') {
    for(const [u,v]of [[.3,.3],[.7,.3],[.3,.7],[.7,.7]])line(u,v,0,u,v,27,0x777f74,1);
    line(.3,.7,0,.7,.7,25,0x7e877a,.6);line(.7,.7,0,.3,.7,25,0x7e877a,.6);line(.7,.3,0,.7,.7,25,0x677469,.6);
    const q=p(.5,.5,27);g.fillStyle(muted?0x87938d:0x7e9ea0);g.fillRoundedRect(q.x-9,q.y-10,18,12,3);g.fillStyle(0xb6c6b6);g.fillEllipse(q.x,q.y-10,18,6);g.fillStyle(0x597d80);g.fillEllipse(q.x,q.y+1,18,4);
    if(detail){line(.73,.5,0,.73,.5,35,0x536d6e,.65);g.lineStyle(.5,0xc4cec0);g.lineBetween(q.x-8,q.y-5,q.x+8,q.y-5);}
  } else if(a.kind==='solar') {
    for(const [u,v]of [[.12,.12],[.5,.12],[.12,.5],[.5,.5]]){
      const points=[p(u,v,4),p(u+.3,v,4),p(u+.3,v+.28,2),p(u,v+.28,2)];poly(g,0x3e596e,points);g.lineStyle(.7,0xa9b9b2);g.strokePoints(points,true);
      if(detail){for(let n=1;n<4;n++)line(u+n*.075,v,4,u+n*.075,v+.28,2,0x7d99a1,.35);line(u,v+.14,3,u+.3,v+.14,3,0x8ca4a8,.4);}
    }
  } else if(a.kind==='substation') {
    for(const [u,v]of [[.22,.25],[.56,.25]]){box(g,x,y,u,v,.22,.27,7,0x959d92);for(let n=0;n<3;n++)box(g,x,y,u+.03+n*.07,v+.12,.035,.04,3,0x605f53,7);}
    for(const u of [.17,.83])line(u,.14,0,u,.14,18,0x777d70,1);
    line(.17,.14,16,.83,.14,16,0xadb49b,.9);line(.17,.14,13,.83,.14,13,0x747d6f,.5);
    if(detail){box(g,x,y,.08,.83,.8,.018,3.5,0x8c9686);for(let n=0;n<9;n++)line(.1+n*.085,.84,0,.1+n*.085,.84,4,0x687565,.45);}
  } else if(a.kind==='borehole') {
    box(g,x,y,.18,.18,.46,.36,7,0xd1c7ad);box(g,x,y,.15,.15,.52,.42,1.5,0x839188,7);
    const q=p(.48,.38,9);g.fillStyle(0x45636a);g.fillRoundedRect(q.x-4,q.y-7,8,7,2);g.fillStyle(0x829799);g.fillEllipse(q.x,q.y-7,8,3);
    line(.76,.65,0,.76,.65,5,0x5b7e83,1);line(.76,.65,5,.9,.65,5,0x5b7e83,1);
  } else if(a.kind==='treatment') {
    box(g,x,y,.1,.1,.4,.31,8,0xbac5b8);box(g,x,y,.08,.08,.44,.35,1.5,0x798f86,8);
    for(const u of [.3,.72]){const q=p(u,.68);g.fillStyle(0x777f70);g.fillEllipse(q.x,q.y-2,13,8);g.fillStyle(0x658f8c);g.fillEllipse(q.x,q.y-3,10,5);g.lineStyle(.6,0xc1c8b3);g.lineBetween(q.x-5,q.y-4,q.x+5,q.y-2);}
  } else {
    box(g,x,y,.13,.17,.63,.48,a.kind==='gas'?13:9,muted?0x9a9c8f:0xc1b9a2);
    box(g,x,y,.1,.14,.69,.54,1,0x818c84,a.kind==='gas'?13:9);
    if(detail){for(let n=0;n<5;n++)line(.2+n*.1,.67,2,.2+n*.1,.67,6,0x546761,1.3);}
    box(g,x,y,.68,.18,.07,.07,a.kind==='gas'?26:17,0x858f87);
    box(g,x,y,.2,.78,.23,.1,3,0x99977c);
    if(a.kind==='gas'){const q=p(.3,.38,16);g.fillStyle(0xa1aca1);g.fillEllipse(q.x,q.y,10,5);g.lineStyle(1.5,0xadb4a5);g.lineBetween(q.x,q.y,q.x+8,q.y+4);}
  }
}
