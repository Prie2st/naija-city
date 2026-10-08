import { box, contactShadow, ground, poly, project, type ArtPen } from './art-primitives';
import { shade, visualHash } from './visual-style';
import type { Terrain } from '../../shared/types/city';

export function drawTerrain(g: ArtPen, terrain: Terrain, variant: number, close = false) {
  const water=terrain==='water',wet=terrain==='wetland';
  const base=water?0x4d8a91:wet?0x889876:terrain==='vegetation'?0x879665:0x9ba375;
  ground(g,0,0,0,0,1,1,shade(base,variant%3*2-2));
  // Semi-transparent earth/grass patches cross the tile interior without a visible grid border.
  for(let n=0;n<(water?14:36);n++) {
    const h=visualHash(variant+131,n),u=(h%1000)/1000,v=((h>>>10)%1000)/1000,p=project(0,0,u,v);
    g.fillStyle(water?(n%3?0x79afb0:0x326f7c):n%4===0?0xaf8763:n%3===0?0xc0b18c:0x6b8254,water?.1:.12);
    g.fillEllipse(p.x,p.y,2+h%8,water?.6:1+h%3);
    if(!water&&n%5===0){g.lineStyle(.3,0x647b4d,.35);g.lineBetween(p.x,p.y,p.x+.4,p.y-1.2);}
  }
  if(close&&!water)for(let n=0;n<90;n++){
    const h=visualHash(variant+463,n),p=project(0,0,(h%997)/997,((h>>>10)%991)/991);
    g.lineStyle(.12,n%3?0x758858:0xb49972,.3);g.lineBetween(p.x,p.y,p.x+.25+(h%3)*.15,p.y-.2);
  }
  if(water){g.lineStyle(.45,0xb2d1c6,.24);for(let n=0;n<5;n++)g.lineBetween(-10+n*3,8+n*2,-3+n*3,8.7+n*2);}
}
export function drawVegetation(g: ArtPen, variant: number, detail=true, close=false) {
  const palm=variant%3===0,shrub=variant===7,height=shrub?7:18+variant%4*3;
  contactShadow(g,3,13,palm?15:23,7);
  g.lineStyle(palm?1.4:2,0x827257);g.lineBetween(0,12,palm?2:0,12-height);
  if(close){g.lineStyle(.3,0xc0b18a,.8);g.lineBetween(-.3,10,-.3,12-height);}
  if(palm) {
    const cy=12-height;
    for(let n=0;n<7;n++) {
      const a=n*Math.PI*2/7,dx=Math.cos(a)*12,dy=Math.sin(a)*5;
      poly(g,n%2?0x567a4a:0x718b50,[{x:2,y:cy},{x:2+dx*.6,y:cy+dy-2},{x:2+dx,y:cy+dy+3},{x:2+dx*.3,y:cy+dy*.4+1}]);
      if(detail){g.lineStyle(.45,0x95a367,.7);g.lineBetween(2,cy,2+dx*.85,cy+dy+1);}
    }
  } else {
    // Irregular overlapping crowns, separate sunlit lobes, not identical oval trees.
    for(let n=0;n<(detail?11:5);n++) {
      const h=visualHash(variant,n),cx=h%13-6,cy=12-height+((h>>>6)%9)-3;
      g.fillStyle([0x4f7147,0x61814c,0x7c9558,0x879e61][n%4]);g.fillEllipse(cx,cy,8+h%7,6+(h>>>3)%6);
      if(detail){g.fillStyle(0xb0b87b,.25);g.fillEllipse(cx-2,cy-2,3,2);}
    }
  }
}
export function drawProp(g: ArtPen, kind: string) {
  contactShadow(g,0,5,10,4);
  if(kind.startsWith('generator')) {
    box(g,0,0,-.11,.13,.27,.12,4,kind.endsWith('0')?0x90967e:0xb19b60);
    const p=project(0,0,.16,.2,2);g.fillStyle(0x3e4b49);g.fillRect(p.x-1,p.y-1,2.5,2);
    g.lineStyle(.5,0x4a514d);for(let n=0;n<4;n++)g.lineBetween(-3+n,1,-3+n,3);
    g.lineStyle(.65,0x5b655e);g.lineBetween(3,1,3,-3);g.lineBetween(3,-3,4,-3);
  } else if(kind==='tank') {
    g.lineStyle(.6,0x6c756b);g.lineBetween(-3,4,-3,-2);g.lineBetween(3,4,3,-2);g.lineBetween(-3,3,3,-2);
    g.fillStyle(0x384c4d);g.fillRoundedRect(-4,-9,8,8,2);g.fillStyle(0x718888);g.fillEllipse(0,-9,8,3);
    g.lineStyle(.45,0x879995,.55);g.lineBetween(-3,-6,3,-6);g.lineBetween(-3,-4,3,-4);
  } else if(kind==='pump') {
    box(g,0,0,-.05,.08,.18,.18,2,0xb2b4a2);g.lineStyle(1,0x62818a);g.lineBetween(0,2,0,-3);g.lineBetween(0,-3,4,-3);g.lineBetween(4,-3,4,0);
  }
}
