/// <reference types="vite/client" />
import Phaser from 'phaser';
import { gameConfig } from '../game-config';
import type { GraphicsQuality } from '../visual-style';
import { VisualLabScene } from './VisualLabScene';
import type { LabManifest } from './lab-atlas';
import { districts, type CameraPreset, type DistrictId } from './composition';
import './visual-lab.css';

const ui=document.querySelector<HTMLDivElement>('#lab-ui')!;
if(!import.meta.env.DEV){
  ui.textContent='Visual Lab is available in the development server.';
} else {
  ui.innerHTML='<div class="loading">Loading architectural masters…</div>';
  try {
    const response=await fetch('/assets/visual-lab/manifest.json');
    if(!response.ok)throw new Error('Build Lab atlases with tools/art/pack_visual_lab.py first.');
    const manifest=await response.json() as LabManifest;
    const quality: GraphicsQuality=innerWidth<600?'medium':'high';
    const scene=new VisualLabScene(manifest,quality);
    const game=new Phaser.Game(gameConfig(scene,quality));
    const params=new URLSearchParams(location.search);
    const district=(params.get('district')??'urban') as DistrictId;
    ui.innerHTML=`
      <header class="lab-header"><div><small>DEVELOPER VISUAL SANDBOX · NO CITY STATE</small><h1>Architectural model study</h1></div><a href="/">Return to city</a></header>
      <nav class="districts" aria-label="Benchmark districts">${Object.entries(districts).map(([id,d])=>`<button data-district="${id}" aria-pressed="${id===district}">${d.title}</button>`).join('')}</nav>
      <div class="caption"><strong id="district-title">${districts[district]?.title??districts.urban.title}</strong><span id="district-note">${districts[district]?.note??districts.urban.note}</span></div>
      <footer class="lab-controls"><div class="presets" aria-label="Camera presets"><button data-preset="city">City model</button><button data-preset="district">District</button><button data-preset="block">Block</button><button data-preset="street">Street</button></div>
        <div class="tools"><button id="zoom-out" aria-label="Zoom out">−</button><button id="zoom-in" aria-label="Zoom in">+</button>
          <label>Quality <select id="quality"><option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high">HIGH</option></select></label>
          <label>DPR test <select id="dpr"><option value="auto">Device</option><option value="1">1</option><option value="2">2</option></select></label>
          <button id="clean">Clean screenshot · P</button><button id="export">Export frame</button><button id="compare">Reference</button><button id="stats">Diagnostics</button></div>
        <p>Drag to pan · Wheel / pinch to zoom · H to frame · Objects are independently selectable</p>
      </footer>
      <aside class="inspector" hidden><button id="close-inspector" aria-label="Close inspector">×</button><div id="inspection"></div></aside>
      <aside class="diagnostics" hidden></aside>
      <aside class="reference" hidden><button id="close-reference" aria-label="Close reference">×</button><img src="/docs/visual-lab/reference.jpg" alt="Approved architectural masterplan reference"><p>Approved reference · composition and material comparison</p></aside>
      <button class="restore" hidden>Show controls</button><img id="lab-capture" hidden alt="Exported Phaser world frame">`;
    const q=document.querySelector<HTMLSelectElement>('#quality')!;q.value=quality;
    for(const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-district]')))button.onclick=()=>{
      const id=button.dataset.district as DistrictId;
      scene.frame(id,'district');
      document.querySelector('#district-title')!.textContent=districts[id].title;
      document.querySelector('#district-note')!.textContent=districts[id].note;
      for(const b of Array.from(document.querySelectorAll('[data-district]')))b.setAttribute('aria-pressed',String(b===button));
    };
    for(const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-preset]')))button.onclick=()=>scene.frame(scene.district,button.dataset.preset as CameraPreset);
    document.querySelector<HTMLButtonElement>('#zoom-in')!.onclick=()=>scene.zoom(1.25);
    document.querySelector<HTMLButtonElement>('#zoom-out')!.onclick=()=>scene.zoom(.8);
    q.onchange=()=>scene.setQuality(q.value as GraphicsQuality);
    document.querySelector<HTMLSelectElement>('#dpr')!.onchange=e=>{
      const v=(e.target as HTMLSelectElement).value;scene.setDpr(v==='auto'?null:Number(v));
    };
    document.querySelector<HTMLButtonElement>('#clean')!.onclick=()=>scene.setScreenshot(true);
    document.querySelector<HTMLButtonElement>('#export')!.onclick=()=>{
      const exportButton=document.querySelector<HTMLButtonElement>('#export')!;
      exportButton.disabled=true;exportButton.textContent='Rendering frame…';
      // Phaser captures after rendering, so WebGL does not need preserveDrawingBuffer.
      game.renderer.snapshot(image=>{
        if(image instanceof HTMLImageElement){
          document.querySelector<HTMLImageElement>('#lab-capture')!.src=image.src;
          const download=document.createElement('a');
          download.href=image.src;download.download=`visual-lab-${scene.district}-${scene.preset}.png`;
          download.click();
        }
        exportButton.disabled=false;exportButton.textContent='Export frame';
      },'image/png');
    };
    const restore=document.querySelector<HTMLButtonElement>('.restore')!;
    restore.onclick=()=>scene.setScreenshot(false);
    scene.onScreenshot=value=>{document.body.classList.toggle('clean',value);restore.hidden=!value;};
    document.querySelector<HTMLButtonElement>('#stats')!.onclick=()=>{
      const panel=document.querySelector<HTMLElement>('.diagnostics')!;panel.hidden=!panel.hidden;
    };
    document.querySelector<HTMLButtonElement>('#compare')!.onclick=()=>{
      const panel=document.querySelector<HTMLElement>('.reference')!;panel.hidden=!panel.hidden;
    };
    document.querySelector<HTMLButtonElement>('#close-reference')!.onclick=()=>document.querySelector<HTMLElement>('.reference')!.hidden=true;
    document.querySelector<HTMLButtonElement>('#close-inspector')!.onclick=()=>document.querySelector<HTMLElement>('.inspector')!.hidden=true;
    scene.onSelect=item=>{
      const panel=document.querySelector<HTMLElement>('.inspector')!;panel.hidden=!item;
      if(!item)return;
      const asset=manifest.assets.find(a=>a.id===item.asset)!;
      document.querySelector('#inspection')!.textContent=`${item.asset} · ${asset.floors?asset.floors+' floors · ':''}${asset.footprint.map(v=>(v*item.scale).toFixed(1)).join(' × ')} m footprint · ${item.group} · ${asset.masterSize.join(' × ')} px master. Presentation object; no population or economic entity.`;
    };
    scene.onRoadSelect=road=>{
      document.querySelector<HTMLElement>('.inspector')!.hidden=false;
      document.querySelector('#inspection')!.textContent=`${road.id} · ${road.kind} · ${road.to-road.from} m corridor. ${road.kind==='boulevard'?'Six 3.1 m lanes + planted median':road.kind==='avenue'?'Four 3.1 m lanes':'Two neighborhood lanes'}. Continuous sidewalk, curb and junction connections. Presentation geometry; no traffic entity.`;
    };
    const timer=setInterval(()=>{
      if(!scene.sys.isActive())return;
      const d=scene.diagnostics();
      document.querySelector('.diagnostics')!.textContent=`${d.quality.toUpperCase()} · ${d.lod} LOD · ${d.zoom.toFixed(2)}×\nCSS ${d.css} · buffer ${d.buffer}\nDevice DPR ${d.deviceDpr} · effective ${d.dpr}\n${d.fps.toFixed(1)} FPS · p95 ${d.p95.toFixed(1)} ms\n${d.visible} visible / ${d.allocated} pooled images\n${d.textureMiB.toFixed(1)} MiB textures · source tier ${d.sourceTier}\nScene refresh ${d.drawMs.toFixed(1)} ms\nLinear filtering · baked 3D detail\nDraw calls unavailable`;
    },500);
    window.addEventListener('pagehide',()=>{clearInterval(timer);game.destroy(true);},{once:true});
  } catch(error){ui.innerHTML='<div class="loading"></div>';document.querySelector('.loading')!.textContent=String(error);console.error(error);}
}
