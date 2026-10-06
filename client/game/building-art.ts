import type { Building } from '../../shared/types/city';
import { box, contactShadow, ground, poly, project, type ArtPen } from './art-primitives';
import { palette, shade, visualVariant } from './visual-style';
export function buildingHeight(b: Building) {
  return (b.type === 'industrial' ? [12,17,23,29,36] : b.type === 'commercial' ? [12,19,31,49,76] : [15,23,34,51,78])[(b.pendingLevel ?? b.level)-1];
}
// Authoring coordinates are fractions of one 24 m parcel; facade details follow the same projection.
export function drawPrivateBuilding(g: ArtPen, b: Building, x: number, y: number, detail = true, close = false) {
  const variant=visualVariant(b), level=b.pendingLevel??b.level, industrial=b.type==='industrial', commercial=b.type==='commercial';
  const wall=b.abandoned?0x9b9788:industrial?[0xb5b1a2,0xadafa8,0xc0b4a2,0xa6aca6][variant]:[0xe0d2b4,0xc6c9bf,0xceba9c,0xc6d0cb][variant];
  const roof=b.abandoned?0x7f8077:industrial?palette.zinc:[palette.terracotta,0x777e7c,0x886251,0x647979][variant];
  const u=.14+(variant%2)*.04,v=.12,w=industrial?.68:level>=3?.67:.52,d=industrial?.62:commercial?.53:.48;
  const top=buildingHeight(b),pitched=level<=2||industrial,h=top-(pitched?5:2),p=(a:number,c:number,z=0)=>project(x,y,a,c,z);
  const line=(a:number,c:number,z:number,a2:number,c2:number,z2:number,color:number,width=.6,alpha=1)=>{const q=p(a,c,z),r=p(a2,c2,z2);g.lineStyle(width,color,alpha);g.lineBetween(q.x,q.y,r.x,r.y);};
  ground(g,x,y,.06,.05,.89,.89,industrial?0xa49780:commercial?0xbdb7a5:level<3?0xb69e7a:0xbdb6a3);
  ground(g,x,y,.08,.78,.79,.12,0xc9bfab);
  if(detail) {
    for(let n=0;n<5;n++) ground(g,x,y,.12+n*.145,.8,.1,.04,shade(0xc4baa5,n%2*9));
    ground(g,x,y,.47,.67,.13,.27,0xc9c4b4);
    if(!commercial&&!industrial&&level<3) {ground(g,x,y,.72,.18,.17,.33,0x879363);const q=p(.84,.3);g.fillStyle(0x5a7148);g.fillEllipse(q.x,q.y-2,5,4);}
  }
  if(b.constructionState==='site-preparation') {
    ground(g,x,y,.06,.05,.89,.89,0xb8906b);ground(g,x,y,u,v,w,d,0xa6a097);
    g.lineStyle(.7,0xddd0b4);g.strokePoints([p(u,v),p(u+w,v),p(u+w,v+d),p(u,v+d)],true);
    if(detail){box(g,x,y,.72,.68,.12,.16,2,0xaa6d4b);box(g,x,y,.17,.75,.2,.1,2,0xd1c3a9);}return;
  }
  contactShadow(g,x,y+12,33,10);
  const constructing=b.constructionState!=='complete',actualHeight=constructing?Math.max(3,h*b.constructionProgress/100):h;
  if (close) box(g,x,y,u-.025,v-.025,w+.05,d+.05,1.2,0x99998c);
  box(g,x,y,u,v,w,d,actualHeight,constructing?0xa9a596:wall);
  if(detail&&!constructing){
    // Fine plaster wear and exposed concrete bands are baked, never evaluated per rendered frame.
    for(let n=0;n<12;n++){
      const a=u+.035+((n*7+variant*3)%17)/17*(w-.08),z=1+((n*11+variant*7)%23)/23*(h-2);
      line(a,v+d,z,Math.min(u+w-.02,a+.045),v+d,z,shade(wall,n%2?-19:23),.35,.4);
    }
  }
  if(constructing) {
    if(detail) {
      for(let z=2;z<actualHeight;z+=3){line(u,v+d,z,u+w,v+d,z,0x817e71,.4,.6);line(u+w,v,z,u+w,v+d,z,0x817e71,.4,.6);}
      for(const a of [u,u+w/2,u+w]) line(a,v+d+.045,0,a,v+d+.045,top,0x816748,.65);
      for(let z=6;z<top;z+=8) line(u-.06,v+d+.045,z,u+w+.07,v+d+.045,z,0x917451,.7);
      box(g,x,y,.12,.77,.2,.1,2,0xc5bba3);box(g,x,y,.72,.71,.14,.14,3,0x9e6c4e);
    }return;
  }
  if(pitched) {
    const a=p(u-.04,v-.04,h),c=p(u+w+.04,v-.04,h),e=p(u+w+.04,v+d+.04,h),f=p(u-.04,v+d+.04,h),r=p(u+w*.3,v+d*.5,top),s=p(u+w*.7,v+d*.5,top);
    poly(g,shade(roof,19),[a,c,s,r]);poly(g,shade(roof,-18),[c,e,s]);poly(g,roof,[f,e,s,r]);poly(g,shade(roof,8),[a,f,r]);
    if (close) {
      // Narrow corrugations/tile courses are authored into the high-resolution master.
      const strips = variant === 0 || variant === 2 ? 18 : 26;
      for (let n=1;n<strips;n++) {const q=n/strips;line(u+w*q,v+d+.04,h,u+w*(.3+q*.4),v+d*.5,top,shade(roof,n%2?28:-20),.14,.6);}
      line(u+w*.3,v+d*.5,top+.15,u+w*.7,v+d*.5,top+.15,shade(roof,38),.55);
      line(u-.04,v+d+.045,h-.65,u+w+.04,v+d+.045,h-.65,0x514f46,.45);
    }
    if(detail){for(let n=1;n<9;n++){const q=n/9;line(u+w*q,v+d+.04,h,u+w*(.3+q*.4),v+d*.5,top,shade(roof,26),.4,.55);}line(u-.04,v+d+.04,h,u+w+.04,v+d+.04,h,0x5d6259,.8);}
  } else {
    box(g,x,y,u-.025,v-.025,w+.05,d+.05,1.4,0xbbbbad,h);
    poly(g,0x929b95,[p(u+.05,v+.05,h+1.4),p(u+w-.05,v+.05,h+1.4),p(u+w-.05,v+d-.05,h+1.4),p(u+.05,v+d-.05,h+1.4)]);
    if(detail){box(g,x,y,u+.12,v+.1,.19,.15,3,0xb4b6aa,h+1.4);box(g,x,y,u+w-.16,v+.14,.08,.15,2,0x71827d,h+1.4);}
  }
  const floors=industrial?Math.max(1,Math.floor(level/2)):level===1?1:level===2?2:level===3?3:level===4?5:9,floorHeight=h/floors;
  if(commercial&&level>=3){
    poly(g,0x617f82,[p(u+w,v+.035,7),p(u+w,v+d-.035,7),p(u+w,v+d-.035,h-.5),p(u+w,v+.035,h-.5)]);
    if(detail){for(let z=9;z<h;z+=floorHeight)line(u+w,v+.035,z,u+w,v+d-.035,z,0xb3c2ba,.65);for(let n=1;n<5;n++)line(u+w,v+n*d/5,7,u+w,v+n*d/5,h-.5,0x91aaa7,.5);}
  }
  for(let floor=0;floor<floors;floor++) {
    const z=2+floor*floorHeight,wh=Math.min(3.5,floorHeight*.5);
    for(let n=0;n<(detail?3:2);n++) {
      const a=u+.07+n*(w-.15)/(detail?3:2),c=v+.07+n*(d-.13)/(detail?3:2);
      poly(g,b.abandoned?0x5c6259:palette.glass,[p(a,v+d,z),p(a+.075,v+d,z),p(a+.075,v+d,z+wh),p(a,v+d,z+wh)]);
      poly(g,0x3a5b62,[p(u+w,c,z),p(u+w,c+.07,z),p(u+w,c+.07,z+wh),p(u+w,c,z+wh)]);
      if(close){
        g.lineStyle(.22,0xe2d9c7);g.strokePoints([p(a,v+d,z),p(a+.075,v+d,z),p(a+.075,v+d,z+wh),p(a,v+d,z+wh)],true);
        line(a+.0375,v+d,z,a+.0375,v+d,z+wh,0xc7d0c5,.2);
        line(a,v+d,z+wh*.52,a+.075,v+d,z+wh*.52,0xc7d0c5,.2);
        g.lineStyle(.22,0xbec6b8);g.strokePoints([p(u+w,c,z),p(u+w,c+.07,z),p(u+w,c+.07,z+wh),p(u+w,c,z+wh)],true);
      }
      if(detail){line(a,v+d,z+wh,a+.075,v+d,z+wh,0xe5ddd0,.65);line(a+.02,v+d,z+.7,a+.045,v+d,z+wh-.5,0x9db4b3,.5,.8);}
    }
    if(detail&&!industrial&&level>=3){line(u,v+d,z-1,u+w,v+d,z-1,shade(wall,-13),.8);if(!commercial){box(g,x,y,u+.07,v+d,.33,.06,1.4,0xcac7b8,z);line(u+.07,v+d+.06,z+2,u+.4,v+d+.06,z+2,0x657773,.6);}}
  }
  if(commercial) {
    const shops=level===2?3:level===1?1:2;
    for(let n=0;n<shops;n++) {
      const a=u+.035+n*(w-.07)/shops,sw=(w-.09)/shops;
      poly(g,0x385958,[p(a,v+d),p(a+sw,v+d),p(a+sw,v+d,6),p(a,v+d,6)]);
      poly(g,b.abandoned?0x8c8775:variant%2?0x9c7350:0x617b72,[p(a,v+d,6),p(a+sw,v+d,6),p(a+sw,v+d+.12,4),p(a,v+d+.12,4)]);
      if(detail){line(a,v+d,8,a+sw,v+d,8,0xe2d6b3,2);for(let k=0;k<4;k++)line(a+.02+k*sw/5,v+d,8,a+.035+k*sw/5,v+d,8,0x77684f,.8);line(a+sw*.5,v+d,0,a+sw*.5,v+d,6,0xbabcae,.7);}
    }
  } else if(industrial) {
    poly(g,0x6d7b78,[p(u+.14,v+d),p(u+.44,v+d),p(u+.44,v+d,7),p(u+.14,v+d,7)]);
    if(detail){for(let z=1;z<7;z++)line(u+.14,v+d,z,u+.44,v+d,z,0xaab0a6,.45);box(g,x,y,.13,.79,.16,.09,2,0x946c46);box(g,x,y,.76,.78,.09,.08,3,0x687b78);box(g,x,y,u+w-.14,v+.1,.06,.06,level>=3?10:5,0x888d87,top-3);}
  } else {
    poly(g,0x74624f,[p(u+w*.6,v+d),p(u+w*.74,v+d),p(u+w*.74,v+d,6),p(u+w*.6,v+d,6)]);
    if(detail&&level<=2)box(g,x,y,u+.05,v+d,.25,.08,1,0xc5b9a1,4);
    if(close&&level<=2){
      // Veranda slab, supports, entry steps and door frame change the architectural silhouette.
      box(g,x,y,u+.04,v+d,.36,.13,.7,0xc8beaa);
      box(g,x,y,u+.025,v+d,.4,.13,.55,shade(wall,8),6.8);
      for(const a of [u+.045,u+.37])box(g,x,y,a,v+d+.09,.025,.025,6.4,0xd3c7b3);
      box(g,x,y,u+w*.59,v+d+.02,.17,.04,.35,0xada594);
      line(u+w*.6,v+d,0,u+w*.6,v+d,6,0xdbc9ab,.35);
      line(u+w*.74,v+d,0,u+w*.74,v+d,6,0xdbc9ab,.35);
      const handle=p(u+w*.71,v+d,2.8);g.fillStyle(0xb0a487);g.fillCircle(handle.x,handle.y,.16);
    }
  }
  if(detail) {
    const fence=industrial?0x8c9185:0xc0b49b,fh=industrial?2.7:level<3?3.3:1.7;
    box(g,x,y,.06,.91,.36,.025,fh,fence);box(g,x,y,.6,.91,.32,.025,fh,fence);box(g,x,y,.91,.08,.025,.83,fh,shade(fence,-16));line(.43,.92,.3,.58,.92,.3,0x626d64,1.8);
    if(b.abandoned){line(u+.1,v+d,4,u+.23,v+d,1,0x666958,1);line(u+.1,v+d,1,u+.23,v+d,4,0x666958,1);const q=p(.2,.86);g.fillStyle(0x69734f);g.fillEllipse(q.x,q.y,6,3);}
  }
}
