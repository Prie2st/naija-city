// Development-only visual fixtures. No storage, no writes to the player's city, not a Vite production entry.
import Phaser from 'phaser';
import { CityScene } from './CityScene';
import { gameConfig } from './game-config';
import { createCity, refreshCity } from '../../shared/simulation/engine';
import { createBuilding, setTypology } from '../../shared/simulation/buildings';
import { asset } from '../../shared/simulation/infrastructure-config';
import { updateInfrastructure } from '../../shared/simulation/infrastructure';
import { initializeMobility, updateMobility } from '../../shared/simulation/mobility';
import { setWeather, updateFloods } from '../../shared/simulation/weather';
import { decodeCity } from '../../shared/simulation/save-format';
import { initializeLiving } from '../../shared/simulation/living-city';
import { labourAndMigration } from '../../shared/simulation/economy';
import type { InfrastructureKind, Zone } from '../../shared/types/city';
import type { GraphicsQuality } from './visual-style';

let city=createCity(0,731);
document.body.style.cssText='margin:0;background:#c8c5ac;font:12px system-ui;color:#233e34';
document.querySelector('#app')!.innerHTML='<div id="game" style="position:fixed;inset:0"></div><div style="position:fixed;z-index:10;top:8px;left:8px;right:8px;background:#faf5e5ed;padding:9px;border-radius:9px"><b>Renderer QA · isolated fixtures · no player save access</b><div style="display:flex;gap:5px;flex-wrap:wrap;margin:7px 0"><button data-size="small">Small settlement</button><button data-size="medium">Medium city / all levels</button><button data-size="dense">Dense city</button><button id="rain">Heavy rain</button><button id="flood">Accumulate flood</button><button id="dry">Dry / recovery</button><button id="reload">Save-format round trip</button><button id="home">Home</button><button id="in">Zoom +</button><button id="out">Zoom −</button><select id="quality"><option>high</option><option>medium</option><option>low</option></select></div><div style="display:flex;gap:4px;flex-wrap:wrap"><label>Canvas viewport <select id="test-viewport"><option>native</option><option>1920x1080</option><option>1440x900</option><option>768x1024</option><option>430x932</option><option>390x844</option></select></label><label>Zoom <select id="exact-zoom"><option>.5</option><option>1</option><option>1.5</option><option>2</option><option>2.5</option><option>3</option><option>6</option></select></label><button id="zoom-exact">Set zoom</button><button id="focus-house">Focus L1 house</button><button id="dpr1">Test DPR 1</button><button id="dpr2">Test DPR 2</button><button id="native-dpr">Native DPR</button><button id="test-wheel">Test wheel focus</button><button id="test-pinch">Test touch pinch</button><button id="test-touch-pan">Test touch pan</button></div><output id="metrics"></output><div id="status"></div></div>';
const scene=new CityScene(()=>city,()=> 'inspect',()=>{},()=>{});
const initialQuality:GraphicsQuality=innerWidth<600?'medium':'high';
scene.setGraphicsQuality(initialQuality);
const game=new Phaser.Game(gameConfig(scene,initialQuality));
(document.querySelector('#quality') as HTMLSelectElement).value=initialQuality;
async function fixture(dense:boolean) {
  scene.setArtPreviewGround(new Map());
  city=createCity(0,731);
  for(const t of city.tiles)if(t.x<24&&t.y<28){t.building=null;t.zone=null;t.road=false;t.roadClass=null;t.infrastructure=null;}
  for(const t of city.tiles) {
    if(t.x<3||t.x>22||t.y<5||t.y>25)continue;
    t.terrain='land';
    if(t.y%4===1||t.x%6===1){t.road=true;t.roadClass=(['dirt','local','avenue','major'] as const)[Math.floor(t.y/4)%4];continue;}
    if(!dense&&(t.y>15||t.x>18))continue;
    const type=(['residential','commercial','industrial'] as Zone[])[Math.floor(t.y/4)%3],level=1+(Math.floor((t.x-3)/3)%5);
    t.zone=type;t.building=createBuilding(type,t.y*32+t.x,city.seed,0,true);setTypology(t.building,level);
    t.building.occupants=t.building.maximumOccupancy*.8|0;t.building.jobs=t.building.maximumJobs*.7|0;
    t.building.generator=t.x%4===0?55:0;t.building.privateWater=t.x%5===0?65:0;t.building.privateBorehole=t.x%5===0;
    if(t.x===5&&t.y%4===0){t.building.constructionState='construction';t.building.constructionProgress=60;}
    if(t.x===9&&t.y===8)t.building.abandoned=true;
  }
  const kinds:InfrastructureKind[]=['diesel','gas','solar','substation','borehole','water-tower','treatment','open-drain','engineered-drain','channel'];
  kinds.forEach((kind,n)=>{const t=city.tiles[18*32+3+n*2];t.building=null;t.zone=null;t.road=false;t.infrastructure=asset(kind,731,n,0);});
  city.infrastructure.revision++;updateInfrastructure(city,false);refreshCity(city);initializeMobility(city);initializeLiving(city);
  for(let n=0;n<30;n++){city.tick++;updateMobility(city);labourAndMigration(city);refreshCity(city);if(n%5===0)await new Promise<void>(resolve=>setTimeout(resolve,0));}
}
document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach(b=>b.onclick=()=>{scene.setArtPreviewGround(new Map());status('Preparing fixture…');setTimeout(async()=>{if(b.dataset.size==='small')city=createCity(0,731);else await fixture(b.dataset.size==='dense');scene.home();scene.redraw();status('Fixture ready.');},0);});
document.querySelector<HTMLButtonElement>('#rain')!.onclick=()=>{setWeather(city,'heavy-rain',6);scene.redraw();};
document.querySelector<HTMLButtonElement>('#flood')!.onclick=()=>{setWeather(city,'extreme-rain',6);for(let n=0;n<5;n++)updateFloods(city);scene.redraw();};
document.querySelector<HTMLButtonElement>('#dry')!.onclick=()=>{setWeather(city,'clear',6);for(let n=0;n<8;n++)updateFloods(city);scene.redraw();};
document.querySelector<HTMLButtonElement>('#reload')!.onclick=()=>{const before=JSON.stringify(city);city=decodeCity(JSON.parse(before));document.querySelector('#status')!.textContent=JSON.stringify(city)===before?'Version 5 city round trip preserved every simulation field.':'Round trip changed state.';scene.redraw();};
document.querySelector<HTMLButtonElement>('#home')!.onclick=()=>scene.home();
document.querySelector<HTMLButtonElement>('#in')!.onclick=()=>scene.zoom(1.25);
document.querySelector<HTMLButtonElement>('#out')!.onclick=()=>scene.zoom(.8);
document.querySelector<HTMLSelectElement>('#quality')!.onchange=e=>scene.setGraphicsQuality((e.target as HTMLSelectElement).value as GraphicsQuality);
setInterval(()=>{document.querySelector('#metrics')!.textContent=scene.graphicsSummary()+` Population ${city.population}, employed ${city.employed}, reachable ${city.mobility.stats.reachableWorkers}, trips ${city.mobility.stats.dailyTrips}, routes ${city.mobility.routes.length}`;},1000);

document.querySelector<HTMLButtonElement>('#zoom-exact')!.onclick=()=>scene.zoomTo(Number(document.querySelector<HTMLSelectElement>('#exact-zoom')!.value));
document.querySelector<HTMLButtonElement>('#focus-house')!.onclick=()=>scene.focusTile(3,6);
for(const [id,value]of [['dpr1',1],['dpr2',2],['native-dpr',null]] as const)document.querySelector<HTMLButtonElement>('#'+id)!.onclick=()=>scene.setTestDpr(value);
const status=(text:string)=>{document.querySelector('#status')!.textContent=text;};
document.querySelector('#metrics')!.parentElement!.insertAdjacentHTML('beforeend', '<div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap"><button id="benchmark">Benchmark street</button><select id="benchmark-focus"><option>Homes</option><option>Level 2</option><option>Shops</option><option>Industry</option><option>Construction</option></select><button id="focus-benchmark">Focus benchmark</button><button id="adaptations">Toggle actual backup state</button><button id="art-photo">Hide QA · Escape restores</button></div>');
document.querySelector<HTMLButtonElement>('#benchmark')!.onclick=()=>{
  scene.setArtPreviewGround(new Map());
  city=createCity(0,731);
  for(const t of city.tiles){t.building=null;t.zone=null;t.road=false;t.roadClass=null;t.infrastructure=null;if(t.x>=4&&t.x<=14&&t.y>=7&&t.y<=14)t.terrain='land';}
  for(const y of [9,11,13])for(let x=4;x<=13;x++){const t=city.tiles[y*32+x];t.road=true;t.roadClass='local';}
  const place=(x:number,y:number,type:Zone,level:number,variant:number)=>{
    const t=city.tiles[y*32+x];t.zone=type;t.building=createBuilding(type,y*32+x,731,0,true);
    t.building.variant=variant;setTypology(t.building,level);t.building.occupants=t.building.maximumOccupancy*.75|0;t.building.jobs=t.building.maximumJobs*.7|0;
    return t.building;
  };
  for(let n=0;n<6;n++)place(5+n,8,'residential',1,n);
  for(let n=0;n<3;n++)place(5+n,10,'residential',2,n);
  for(let n=0;n<4;n++)place(9+n,10,'commercial',1,n);
  for(let n=0;n<2;n++)place(5+n,12,'industrial',1,n);
  for(let n=0;n<2;n++){const b=place(9+n,12,'residential',1,n);b.constructionState='construction';b.constructionProgress=n?70:20;}
  for(let x=5;x<=10;x++)city.tiles[9*32+x].infrastructure=asset('open-drain',731,x,0);
  refreshCity(city);initializeMobility(city);initializeLiving(city);scene.focusTile(7,8);scene.zoomTo(6);scene.redraw();status('17 benchmark properties. Private adaptations off; no player save access.');
};
document.querySelector<HTMLButtonElement>('#focus-benchmark')!.onclick=()=>{
  const view=document.querySelector<HTMLSelectElement>('#benchmark-focus')!.value;
  const [x,y]=view==='Homes'?[7,8]:view==='Level 2'?[6,10]:view==='Shops'?[10,10]:view==='Industry'?[5,12]:[9,12];
  scene.focusTile(x,y);scene.zoomTo(6);scene.redraw();
};
document.querySelector<HTMLButtonElement>('#adaptations')!.onclick=()=>{
  const on=!city.tiles.some(t=>(t.building?.generator??0)>0);
  for(const t of city.tiles)if(t.building){t.building.generator=on?60:0;t.building.privateWater=on?60:0;t.building.privateBorehole=on;}
  scene.redraw();status(`Actual fixture backup state ${on?'ON':'OFF'}; construction/abandoned properties still hide adaptations.`);
};
document.querySelector<HTMLButtonElement>('#art-photo')!.onclick=()=>{document.querySelector('#metrics')!.parentElement!.style.visibility='hidden';};
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('#metrics')!.parentElement!.style.visibility='visible';});

document.querySelector('#metrics')!.parentElement!.insertAdjacentHTML('beforeend','<div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap"><button id="model-block">Architectural urban block</button><button id="model-low">Architectural low-density street</button><button id="model-library">Architectural benchmark A–I</button><button id="model-center">Focus courtyard</button></div>');
function modelFixture(kind:'block'|'low'|'library') {
  city=createCity(0,731);
  for(const t of city.tiles){t.building=null;t.zone=null;t.road=false;t.roadClass=null;t.infrastructure=null;if(t.x>=6&&t.x<=17&&t.y>=6&&t.y<=17)t.terrain='land';}
  const place=(x:number,y:number,type:Zone,level:number,variant=0)=>{
    const t=city.tiles[y*32+x];t.zone=type;t.building=createBuilding(type,y*32+x,731,0,true);
    setTypology(t.building,level);t.building.variant=variant;t.building.occupants=t.building.maximumOccupancy*.8|0;t.building.jobs=t.building.maximumJobs*.7|0;
    return t.building;
  };
  const ground=new Map<number,string>();
  if(kind==='block'){
    for(let y=8;y<=13;y++)for(let x=8;x<=13;x++){
      const t=city.tiles[y*32+x];
      if(x===8||x===13||y===8||y===13){t.road=true;t.roadClass='avenue';}
      else ground.set(y*32+x,'public-realm');
    }
    for(const [x,y,level,variant]of [[9,9,3,0],[12,9,4,0],[9,12,3,1],[12,12,4,0]]){
      place(x,y,'residential',level,variant);ground.delete(y*32+x);
    }
    for(let x=7;x<=14;x++){const t=city.tiles[15*32+x];t.road=true;t.roadClass='major';}
    place(10,14,'commercial',1);place(13,14,'commercial',3);
  }else{
    for(const y of [9,12,15])for(let x=7;x<=16;x++){const t=city.tiles[y*32+x];t.road=true;t.roadClass=y===9?'local':y===12?'avenue':'major';}
    if(kind==='low'){
      for(let n=0;n<4;n++)place(8+n,8,'residential',1,n);
      for(let n=0;n<3;n++)place(8+n,11,'residential',2,n);
      place(12,11,'commercial',1);place(14,11,'industrial',1);
      for(let x=8;x<=11;x++)city.tiles[9*32+x].infrastructure=asset('open-drain',731,x,0);
    }else{
      for(let n=0;n<5;n++)place(8+n,8,'residential',n+1);
      place(14,8,'residential',3,1);
      place(8,11,'commercial',1);place(10,11,'commercial',3);place(12,11,'industrial',1);
      for(let n=0;n<2;n++){const b=place(14+n,11,'residential',2);b.constructionState='construction';b.constructionProgress=n?65:20;}
    }
  }
  refreshCity(city);initializeMobility(city);initializeLiving(city);updateMobility(city);
  scene.setArtPreviewGround(ground);scene.zoomTo(kind==='block'?3:4);scene.redraw();
  // Let Phaser update its camera matrix before a second focus/zoom operation.
  setTimeout(()=>{scene.focusTile(kind==='block'?11:10,kind==='block'?11:9);scene.redraw();},650);
  status(`${kind==='block'?'Four apartment buildings, shared courtyard, parking, paths and surrounding avenues':kind==='low'?'Bungalows, duplexes, shops, workshop and state-authoritative drainage':'All five residential heights, courtyard, two commercial forms, warehouse and construction'}. Isolated fixture: no player save access.`);
}
document.querySelector<HTMLButtonElement>('#model-block')!.onclick=()=>modelFixture('block');
document.querySelector<HTMLButtonElement>('#model-low')!.onclick=()=>modelFixture('low');
document.querySelector<HTMLButtonElement>('#model-library')!.onclick=()=>modelFixture('library');
document.querySelector<HTMLButtonElement>('#model-center')!.onclick=()=>{scene.zoomTo(4);setTimeout(()=>scene.focusTile(11,11),650);};
document.querySelector<HTMLButtonElement>('#test-wheel')!.onclick=()=>{
  const canvas=game.canvas,rect=canvas.getBoundingClientRect(),camera=scene.cameras.main;
  const x=rect.width*.38,y=rect.height*.55,world=camera.getWorldPoint(x*scene.displayDpr,y*scene.displayDpr);
  canvas.dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+x,clientY:rect.top+y,deltaY:-280,bubbles:true,cancelable:true}));
  setTimeout(()=>{const after=camera.getWorldPoint(x*scene.displayDpr,y*scene.displayDpr);status(`Wheel focus drift: ${Math.hypot(world.x-after.x,world.y-after.y).toFixed(3)} world px. Zoom ${scene.viewZoom.toFixed(2)}×.`);},800);
};
document.querySelector<HTMLButtonElement>('#test-pinch')!.onclick=()=>{
  const canvas=game.canvas,rect=canvas.getBoundingClientRect(),x=rect.left+rect.width*.5,y=rect.top+rect.height*.6,before=scene.viewZoom;
  const touch=(id:number,dx:number)=>new Touch({identifier:id,target:canvas,clientX:x+dx,clientY:y,pageX:x+dx,pageY:y,screenX:x+dx,screenY:y});
  let a=touch(11,-35),b=touch(12,35);
  const send=(type:string,touches:Touch[],changed:Touch[])=>canvas.dispatchEvent(new TouchEvent(type,{touches,targetTouches:touches,changedTouches:changed,bubbles:true,cancelable:true}));
  send('touchstart',[a],[a]);send('touchstart',[a,b],[b]);a=touch(11,-60);b=touch(12,60);send('touchmove',[a,b],[a,b]);send('touchend',[],[a,b]);
  setTimeout(()=>status(`Touch input pinch: ${before.toFixed(2)}× → ${scene.viewZoom.toFixed(2)}×; ${scene.viewZoom>before?'passed':'check zoom limit/input'}.`),800);
};

document.querySelector<HTMLSelectElement>('#test-viewport')!.onchange=e=>{
  const value=(e.target as HTMLSelectElement).value,world=document.querySelector<HTMLDivElement>('#game')!;
  if(value==='native'){world.style.cssText='position:fixed;inset:0';document.body.style.minWidth='';document.body.style.minHeight='';}
  else{const [width,height]=value.split('x').map(Number);world.style.cssText=`position:absolute;left:0;top:0;width:${width}px;height:${height}px`;document.body.style.minWidth=width+'px';document.body.style.minHeight=height+'px';}
};

document.querySelector<HTMLButtonElement>('#test-touch-pan')!.onclick=()=>{
  const canvas=game.canvas,rect=canvas.getBoundingClientRect(),camera=scene.cameras.main,x=rect.left+rect.width*.5,y=rect.top+rect.height*.7;
  const before=camera.getWorldPoint(camera.width/2,camera.height/2);
  const touch=(dx:number,dy:number)=>new Touch({identifier:21,target:canvas,clientX:x+dx,clientY:y+dy,pageX:x+dx,pageY:y+dy,screenX:x+dx,screenY:y+dy});
  const a=touch(0,0),b=touch(36,48);
  const send=(type:string,touches:Touch[],changed:Touch[])=>canvas.dispatchEvent(new TouchEvent(type,{touches,targetTouches:touches,changedTouches:changed,bubbles:true,cancelable:true}));
  send('touchstart',[a],[a]);send('touchmove',[b],[b]);send('touchend',[],[b]);
  setTimeout(()=>{const after=camera.getWorldPoint(camera.width/2,camera.height/2),distance=Math.hypot(after.x-before.x,after.y-before.y);status(`Touch pan: moved ${distance.toFixed(3)} world px; ${distance>1?'passed':'check input'}.`);},150);
};
