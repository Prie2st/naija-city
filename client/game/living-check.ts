// Development-only activity/performance harness. No player storage access.
import Phaser from 'phaser';
import { CityScene } from './CityScene';
import { gameConfig } from './game-config';
import { livingFixture } from '../../shared/simulation/living-fixtures';
import { cityActivity } from '../../shared/simulation/activity';
import { advance, catchUp, refreshCity, TICK_MS } from '../../shared/simulation/engine';
import { decodeCity } from '../../shared/simulation/save-format';
import { updateMobility, establishBus } from '../../shared/simulation/mobility';
import { operateBusinesses } from '../../shared/simulation/economy';
import { updateLiving } from '../../shared/simulation/living-city';
import { setWeather, updateFloods } from '../../shared/simulation/weather';
import type { GraphicsQuality } from './visual-style';

if (!import.meta.env.DEV) throw new Error('Living verification is available only on the development server.');
let city = livingFixture(5000), hour = 8, speed = 1;
document.body.style.cssText = 'margin:0;background:#b5b49f;font:12px system-ui;color:#243d34';
document.querySelector('#app')!.innerHTML = `<div id="game" style="position:fixed;inset:0"></div><aside id="qa" style="position:fixed;top:8px;left:8px;right:8px;background:#f5f0e2ed;padding:10px;border-radius:8px;z-index:10;max-height:24vh;overflow:auto"><b>Living City QA · isolated city · no player saves</b><div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0"><select id="population">${[200,5000,50000,250000].map(n=>`<option ${n===5000?'selected':''}>${n}</option>`)}</select><select id="hour">${[2,6,8,13,17.5,20].map(h=>`<option ${h===8?'selected':''}>${h}</option>`)}</select><select id="quality"><option>high</option><option>medium</option><option>low</option></select><button id="home">Home</button><button id="street">Street</button><button id="rain">Heavy rain</button><button id="flood">Flood</button><button id="dry">Clear/recover</button><button id="power">Power failure</button><button id="restore">Restore utilities</button><button id="reload">Save/reload</button><button id="offline">Offline 1 month</button><button id="pause">Pause/play</button><button id="photo">Hide QA (Esc restores)</button></div><output id="metrics"></output><p id="result"></p></aside>`;
const scene = new CityScene(()=>city,()=> 'inspect',()=>{},()=>{});
const quality: GraphicsQuality = innerWidth<600?'medium':'high';
scene.setGraphicsQuality(quality); new Phaser.Game(gameConfig(scene,quality));
(document.querySelector('#quality') as HTMLSelectElement).value = quality;
const redraw = () => { scene.setActivity(cityActivity(city,hour)); scene.redraw(); };
const result = (text: string) => { document.querySelector('#result')!.textContent=text; };
document.querySelector('#offline')!.insertAdjacentHTML('afterend','<button id="markets">Evaluate market interest</button>');
document.querySelector('#markets')!.insertAdjacentHTML('afterend','<button id="bus">Establish test bus</button>');
document.querySelector<HTMLButtonElement>('#bus')!.onclick = () => {
  const flow=city.mobility.flows.filter(f=>f.purpose==='work'&&f.path.length>2).sort((a,b)=>b.trips-a.trips)[0];
  if(!flow){result('No connected commuter corridor.');return;}
  const error=establishBus(city,[flow.path[0],flow.path.at(-1)!],2);redraw();
  if(error){result(error);return;}
  const tile=city.tiles[flow.path[Math.floor(flow.path.length/2)]];scene.focusTile(tile.x,tile.y);result('Real public bus route established through the existing route planner.');
};
document.querySelector<HTMLButtonElement>('#markets')!.onclick = () => {
  for(let n=0;n<20;n++){city.tick++;updateLiving(city);} refreshCity(city); redraw();
  const market=city.living.markets[0];
  if(market){scene.focusTile(city.tiles[market.tileId].x,city.tiles[market.tileId].y);result(`${market.name}: ${market.stalls} stalls, ${market.jobs} jobs from sustained local conditions.`);}
  else result('Local conditions did not support a market.');
};
document.querySelector<HTMLSelectElement>('#population')!.onchange = e => {
  result('Building aggregate fixture…'); setTimeout(()=> { city=livingFixture(Number((e.target as HTMLSelectElement).value) as 200|5000|50000|250000); redraw(); scene.home(); result(`${city.population} real residents; ${city.mobility.routes.length} organic routes.`); },0);
};
document.querySelector<HTMLSelectElement>('#hour')!.onchange = e => { hour=Number((e.target as HTMLSelectElement).value); redraw(); };
document.querySelector<HTMLSelectElement>('#quality')!.onchange = e => scene.setGraphicsQuality((e.target as HTMLSelectElement).value as GraphicsQuality);
document.querySelector<HTMLButtonElement>('#home')!.onclick = () => scene.home();
document.querySelector<HTMLButtonElement>('#street')!.onclick = () => { scene.zoomTo(4); setTimeout(()=>scene.focusTile(city.population===200?2:5,3),650); };
document.querySelector<HTMLButtonElement>('#rain')!.onclick = () => { setWeather(city,'heavy-rain',8); redraw(); };
document.querySelector<HTMLButtonElement>('#flood')!.onclick = () => { setWeather(city,'extreme-rain',8); for (let n=0;n<8;n++) updateFloods(city); updateMobility(city,false,true); redraw(); };
document.querySelector<HTMLButtonElement>('#dry')!.onclick = () => { setWeather(city,'clear',100); for (let n=0;n<25;n++) updateFloods(city); updateMobility(city,false,true); redraw(); };
document.querySelector<HTMLButtonElement>('#power')!.onclick = () => { for (const t of city.tiles) t.services.powerReliability=0; operateBusinesses(city); refreshCity(city); redraw(); };
document.querySelector<HTMLButtonElement>('#restore')!.onclick = () => { for (const t of city.tiles) { t.services.powerReliability=85; t.services.waterReliability=85; } operateBusinesses(city); refreshCity(city); redraw(); };
document.querySelector<HTMLButtonElement>('#reload')!.onclick = () => { const before=JSON.stringify(city); city=decodeCity(JSON.parse(before)); result(JSON.stringify(city)===before?'Save/reload: every simulation field preserved.':'Round trip changed state.'); redraw(); };
document.querySelector<HTMLButtonElement>('#offline')!.onclick = () => {
  const active=decodeCity(JSON.parse(JSON.stringify(city))), away=decodeCity(JSON.parse(JSON.stringify(city)));
  advance(active,30); const now=city.lastSimulatedTimestamp+30*TICK_MS; active.lastSimulatedTimestamp=now;
  const report=catchUp(away,now); city=away; redraw();
  result(`Offline replay ${JSON.stringify(active)===JSON.stringify(away)?'identical':'DIFFERENT'} · ${report.jobsBefore} → ${report.jobsAfter} jobs · ${report.businessesOpened} opened, ${report.businessesClosed} closed.`);
};
document.querySelector<HTMLButtonElement>('#pause')!.onclick = () => { speed=speed?0:1; scene.setSimulationSpeed(speed); };
document.querySelector<HTMLButtonElement>('#photo')!.onclick = () => { document.querySelector<HTMLElement>('#qa')!.hidden=true; };
document.addEventListener('keydown',e=> { if(e.key==='Escape')document.querySelector<HTMLElement>('#qa')!.hidden=false; });
setInterval(()=>scene.setActivity(cityActivity(city,hour)),100);
setInterval(()=> { document.querySelector('#metrics')!.textContent=scene.graphicsSummary()+` · ${city.population} residents · ${city.mobility.routes.length} routes · ${city.mobility.flows.length} OD flows`; },500);
// Read-only inspection seam for browser QA; no render agents enter the save.
Object.assign(window,{livingQA:{snapshot:()=>({population:city.population,activity:cityActivity(city,hour),vehicles:scene.representativeVehicleCount,pedestrians:scene.representativePedestrianCount,agents:scene.agentDiagnostics,graphics:scene.graphicsSummary(),routes:city.mobility.routes.length,markets:city.living.markets.length,feed:city.living.feed.length})}});
