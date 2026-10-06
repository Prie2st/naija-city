import Phaser from 'phaser';
import type { GraphicsQuality } from '../visual-style';

export interface LabAsset {
  id: string; type: string; footprint: number[]; floors: number;
  heightMetres: number; sourceScale: number; anchor: number[];
  worldWidth: number; worldHeight: number; masterSize: number[];
  sockets: Record<string,number[]>;
}
export interface LabManifest {
  assets: LabAsset[];
  sheets: Record<string,{ key: string; width: number; height: number }[]>;
  locations: Record<string,Record<string,string>>;
}
export function labTier(zoom: number,dpr: number,quality: GraphicsQuality) {
  if(zoom*dpr<=1.5)return 2;
  if(quality==='low'||zoom*dpr<=6)return 6;
  return quality==='medium'?9:12;
}
export class LabAtlas {
  readonly assets: Map<string,LabAsset>;
  private requested=new Set<string>();
  private pending=new Set<string>();
  private used=new Set<string>();
  private tier=2;
  constructor(private scene: Phaser.Scene,readonly manifest: LabManifest, private loaded:()=>void) {
    this.assets=new Map(manifest.assets.map(a=>[a.id,a]));
    scene.load.on('complete',()=>{
      this.pending.clear();this.loaded();
    });
    scene.load.on('loaderror',(file: Phaser.Loader.File)=>{
      this.requested.delete(file.key);console.error('Visual Lab atlas failed',file.key);
    });
  }
  begin(zoom: number,dpr: number,quality: GraphicsQuality) {
    this.tier=labTier(zoom,dpr,quality);this.used.clear();
  }
  frame(id: string) {
    const desired=this.manifest.locations[this.tier]?.[id];
    if(desired&&!this.scene.textures.exists(desired)&&!this.requested.has(desired)){
      this.requested.add(desired);this.pending.add(desired);
      this.scene.load.atlas(desired,`/assets/visual-lab/${desired}.png`,`/assets/visual-lab/${desired}.json`);
    }
    for(const tier of [this.tier,9,6,2].filter(t=>t<=this.tier)){
      const key=this.manifest.locations[tier]?.[id];
      if(key&&this.scene.textures.exists(key)){
        this.used.add(key);return {key,tier};
      }
    }
    return null;
  }
  finish() {
    if(this.pending.size&&!this.scene.load.isLoading())this.scene.load.start();
    // Release old large tiers only after every visible Image has switched away.
    const live=new Set(this.scene.children.list.filter((o):o is Phaser.GameObjects.Image=>o instanceof Phaser.GameObjects.Image&&o.visible).map(o=>o.texture.key));
    for(const [tier,pages] of Object.entries(this.manifest.sheets)){
      if(Number(tier)===2||Number(tier)===this.tier)continue;
      for(const p of pages)if(this.scene.textures.exists(p.key)&&!this.used.has(p.key)&&!live.has(p.key)){
        this.scene.textures.remove(p.key);this.requested.delete(p.key);
      }
    }
  }
  get memoryMiB() {
    return Object.values(this.manifest.sheets).flat().filter(p=>this.scene.textures.exists(p.key)).reduce((n,p)=>n+p.width*p.height*4/1048576,0);
  }
}
