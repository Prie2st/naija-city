import type Phaser from 'phaser';
import type { City, Tile } from '../../shared/types/city';
import { tileAt } from '../../shared/simulation/world';
import type { RoadClass } from '../../shared/types/mobility';
import { visualHash } from './visual-style';
export type { RoadClass } from '../../shared/types/mobility';
export const ROAD_STYLES: Record<RoadClass,{surface:number;edge:number;marking:number;width:number}>={
  dirt:{surface:0xa47751,edge:0xb89063,marking:0x906544,width:.30},
  local:{surface:0x626965,edge:0xaba58c,marking:0xd3cbb0,width:.35},
  avenue:{surface:0x596360,edge:0xbcb7a2,marking:0xe0d7b9,width:.55},
  major:{surface:0x505b59,edge:0xc3bca7,marking:0xe4d9b2,width:.75},
};
export function drawRoad(g:Phaser.GameObjects.Graphics,city:City,tile:Tile,x:number,y:number,roadClass:RoadClass='local',wetness=0,detail=true,close=false) {
  const style=ROAD_STYLES[roadClass],project=(u:number,v:number)=>({x:x+(u-v)*24,y:y+(u+v)*12});
  const quad=(u:number,v:number,u2:number,v2:number,color:number,alpha=1)=>{g.fillStyle(color,alpha);g.fillPoints([project(u,v),project(u2,v),project(u2,v2),project(u,v2)],true);};
  const neighbours=[[1,0],[-1,0],[0,1],[0,-1]].flatMap(([dx,dy])=>{const t=tileAt(city,tile.x+dx,tile.y+dy);return t?.road?[{dx,dy,t}]:[];});
  const layer=(extra:number,color:number,alpha=1)=>{
    const w=style.width+extra,lo=(1-w)/2,hi=1-lo;quad(lo,lo,hi,hi,color,alpha);
    for(const {dx,dy,t}of neighbours){
      // Shared edges use the average width, including mixed-class intersections.
      const edge=(style.width+ROAD_STYLES[t.roadClass??'local'].width)/2+extra,el=(1-edge)/2,eh=1-el;
      const points=dx===1?[project(.5,lo),project(1,el),project(1,eh),project(.5,hi)]:dx===-1?[project(0,el),project(.5,lo),project(.5,hi),project(0,eh)]:dy===1?[project(lo,.5),project(hi,.5),project(eh,1),project(el,1)]:[project(el,0),project(eh,0),project(hi,.5),project(lo,.5)];
      g.fillStyle(color,alpha);g.fillPoints(points,true);
    }
  };
  layer(.17,0x536047,.14);layer(.11,style.edge);layer(0,style.surface);
  if(wetness>.02){layer(0,0x243f46,wetness*.25);}
  if(detail){
    const h=visualHash(city.seed,tile.y*city.size+tile.x);
    if(close)for(let n=0;n<16;n++){
      const seed=visualHash(h,n),lo=(1-style.width)/2+.035,span=style.width-.07;
      const p=project(lo+(seed%101)/101*span,lo+((seed>>>9)%103)/103*span);
      g.fillStyle(roadClass==='dirt'?0xc6a076:n%2?0x929b90:0x333e39,.2);g.fillCircle(p.x,p.y,.12+(seed%3)*.05);
    }
    quad(.36,.4,.5,.55,roadClass==='dirt'?0xb18a63:0x79817a,.18);
    if(h%4===0)quad(.55,.48,.66,.6,0x414e4b,.16);
    if(wetness>.2){g.lineStyle(.65,0xc0cebf,wetness*.4);const a=project(.34,.4),b=project(.68,.4);g.lineBetween(a.x,a.y,b.x,b.y);}
  }
  for(const {dx,dy}of neighbours) {
    if(roadClass==='dirt'){
      if(detail)for(const lane of [-.08,.08]){const a=project(.5+dx*.22+(dy?lane:0),.5+dy*.22+(dx?lane:0)),b=project(.5+dx*.49+(dy?lane:0),.5+dy*.49+(dx?lane:0));g.lineStyle(.7,0x835f43,.4);g.lineBetween(a.x,a.y,b.x,b.y);}continue;
    }
    if(roadClass==='local')continue;
    const a=project(.5+dx*.3,.5+dy*.3),b=project(.5+dx*.48,.5+dy*.48);g.lineStyle(roadClass==='major'?.85:.6,style.marking,.72);g.lineBetween(a.x,a.y,b.x,b.y);
    if(roadClass==='major'&&detail)for(const lane of [-.17,.17]){const a=project(.5+dx*.26+(dy?lane:0),.5+dy*.26+(dx?lane:0)),b=project(.5+dx*.4+(dy?lane:0),.5+dy*.4+(dx?lane:0));g.lineStyle(.45,0xdfdeca,.65);g.lineBetween(a.x,a.y,b.x,b.y);}
  }
  if(roadClass==='major'&&detail&&neighbours.length===2&&neighbours[0].dx===-neighbours[1].dx&&neighbours[0].dy===-neighbours[1].dy){const horizontal=neighbours[0].dx!==0;quad(horizontal?.25:.47,horizontal?.47:.25,horizontal?.75:.53,horizontal?.53:.75,0x839164,.7);}
}
