import Phaser from 'phaser';
import { projectMetres as p, WORLD_SCALE, type Road, type Surface } from './composition';

export function groundPlane(g: Phaser.GameObjects.Graphics,x: number,y: number,w: number,d: number,color: number,z=0,alpha=1) {
  g.fillStyle(color,alpha).fillPoints([p(x-w/2,y-d/2,z),p(x+w/2,y-d/2,z),p(x+w/2,y+d/2,z),p(x-w/2,y+d/2,z)],true);
}
function line(g: Phaser.GameObjects.Graphics,x1: number,y1: number,x2: number,y2: number,width: number,color: number,z=.04,alpha=1) {
  const a=p(x1,y1,z),b=p(x2,y2,z);g.lineStyle(width,color,alpha).lineBetween(a.x,a.y,b.x,b.y);
}
const roadWidth=(r: Road)=>r.kind==='boulevard'?WORLD_SCALE.boulevardCarriageway:r.kind==='avenue'?WORLD_SCALE.avenueCarriageway:WORLD_SCALE.localCarriageway;
function strip(g: Phaser.GameObjects.Graphics,r: Road,from: number,to: number,offset: number,width: number,color: number,z=0) {
  groundPlane(g,r.axis==='x'?(from+to)/2:r.at+offset,r.axis==='x'?r.at+offset:(from+to)/2,r.axis==='x'?to-from:width,r.axis==='x'?width:to-from,color,z);
}
function crossing(r: Road,t: number,roads: Road[],extra=0) {
  return roads.some(other=>other!==r&&other.axis!==r.axis&&r.at>=other.from&&r.at<=other.to&&Math.abs(t-other.at)<roadWidth(other)/2+extra);
}
function edge(g: Phaser.GameObjects.Graphics,r: Road,roads: Road[],offset: number,width: number,color: number,z=0) {
  let start=r.from;
  for(let t=r.from;t<=r.to+.5;t+=.5){
    const blocked=t>r.to||crossing(r,t,roads,1);
    if(blocked){if(t-start>.5)strip(g,r,start,t,offset,width,color,z);start=t+.5;}
  }
}

export function drawPublicRealm(g: Phaser.GameObjects.Graphics,roads: Road[],surfaces: Surface[],close: boolean) {
  g.clear();g.setDepth(-10000);
  groundPlane(g,159,139,360,309,0x9da58b);
  // Macro and fine variation are static, deterministic batched geometry, never tile borders.
  for(let n=0;n<1200;n++){
    const x=-18+(n*37.713)%357,y=-12+(n*61.173)%301;
    groundPlane(g,x,y,1.2+n%7,.5+(n%9)*.31,n%3?0xa8ad94:0x859574,0,.08);
  }
  const colors={paving:0xc7c7bc,grass:0x7f926c,earth:0xb8aa8e,parking:0x90938d,path:0xdfddd0,play:0xac967d,planting:0x73815c};
  for(const s of surfaces){
    groundPlane(g,s.x,s.y,s.w,s.d,colors[s.kind]);
    if(s.kind==='parking'){
      for(let x=s.x-s.w/2+1;x<s.x+s.w/2;x+=2.6)line(g,x,s.y-2.6,x,s.y+2.6,.13,0xd9d8c8);
    }
    if(close&&(s.kind==='paving'||s.kind==='path')){
      for(let x=s.x-s.w/2+1.2;x<s.x+s.w/2;x+=2.4)line(g,x,s.y-s.d/2,x,s.y+s.d/2,.05,0xa8aaa0,0,.32);
      for(let y=s.y-s.d/2+1.2;y<s.y+s.d/2;y+=2.4)line(g,s.x-s.w/2,y,s.x+s.w/2,y,.05,0xa8aaa0,0,.32);
    }
  }
  // Continuous sidewalks are a street layer. Asphalt is composited across junctions first.
  for(const r of roads)strip(g,r,r.from,r.to,0,roadWidth(r)+WORLD_SCALE.sidewalkWidth*2,0xd0cfc3,.025);
  for(const r of roads)strip(g,r,r.from,r.to,0,roadWidth(r),0x666c69,.01);
  for(const r of roads){
    const half=roadWidth(r)/2;
    for(const sign of [-1,1]){
      edge(g,r,roads,sign*(half+.1),.20,0xf1ebd9,.14);
      edge(g,r,roads,sign*(half+.26),.14,0x9b9e91,.03);
      // Drain channels follow the public realm; driveway bridges interrupt them.
      if(r.kind==='local'){
        edge(g,r,roads,sign*(half+.55),.42,0x555e58,.02);
        edge(g,r,roads,sign*(half+.8),.11,0xb8bcb0,.08);
        for(let t=r.from+14;t<r.to;t+=27)if(!crossing(r,t,roads,3))strip(g,r,t-1.5,t+1.5,sign*(half+.6),1.1,0xccccc0,.12);
      }
      if(close){
        for(let t=r.from;t<r.to;t+=2.4)if(!crossing(r,t,roads,3)){
          const x=r.axis==='x'?t:r.at+sign*(half+1.3),y=r.axis==='x'?r.at+sign*(half+1.3):t;
          line(g,x-(r.axis==='x'?0:.8),y-(r.axis==='x'?.8:0),x+(r.axis==='x'?0:.8),y+(r.axis==='x'?.8:0),.08,0xa3a89c,.15,.55);
        }
      }
    }
    if(r.kind==='boulevard'){
      edge(g,r,roads,0,2.8,0x83906e,.13);
      for(const offset of [-1.48,1.48])edge(g,r,roads,offset,.14,0xd6d3bc,.18);
    }
    // Road texture and paint never cross intersections or the median.
    for(let t=r.from+2;t<r.to-2;t+=5){
      if(crossing(r,t,roads,3.5))continue;
      if(r.kind!=='local')for(const offset of (r.kind==='boulevard'?[-7.6,-4.5,4.5,7.6]:[-3.1,0,3.1]))strip(g,r,t,t+2.5,offset,.12,0xcacbbd,.025);
      if(close)for(let n=0;n<6;n++){
        const off=-half+.7+(n*1.731+t*.27)%(half*2-1.4);
        strip(g,r,t+n*.43,t+n*.43+.09,off,.1,n%2?0x81867e:0x575f59,.015);
      }
    }
    // Pedestrian crossings and stop lines share one consistent scale.
    for(const other of roads.filter(o=>o.axis!==r.axis&&r.at>=o.from&&r.at<=o.to)){
      for(const dir of [-1,1]){
        const t=other.at+dir*(roadWidth(other)/2+2.8);
        if(t<=r.from||t>=r.to)continue;
        for(let off=-half+.8;off<half-.5;off+=1.2){
          if(r.kind==='boulevard'&&Math.abs(off)<1.6)continue;
          strip(g,r,t-.8,t+.8,off,.55,0xc9cbbb,.03);
        }
      }
    }
  }
  // Low compound boundaries are thin grounded walls, not raised square property bases.
  for(const y of [196,244])for(const x of [27,54,81,108]){
    for(const dx of [-12,12]){
      const a=p(x+dx,y-13,0),b=p(x+dx,y+13,0),c=p(x+dx,y+13,1.55),d=p(x+dx,y-13,1.55);
      g.fillStyle(0xa5a598).fillPoints([a,b,c,d],true);
      line(g,x+dx,y-13,x+dx,y+13,.16,0xd4cfba,1.55);
    }
  }
}
