import type Phaser from 'phaser';
import { modelCatalog } from './model-catalog';
import { modelAsset } from './model-policy';
import type { GraphicsQuality, VisualLod } from './visual-style';

type Tier=2|6|9|12;
export function preloadModels(scene: Phaser.Scene) {
  for(const page of modelCatalog.sheets[2])scene.load.atlas(page.key,`/assets/model/${page.key}.png`,`/assets/model/${page.key}.json`);
}
// Lazy by visible frame PAGE, not the entire high-resolution library. Far + one detailed tier.
export class ModelAtlas {
  private tier:Tier=6;
  private requested=new Set<string>();
  private used=new Set<string>();
  private loading=false;
  constructor(private scene:Phaser.Scene){}
  begin(quality:GraphicsQuality,lod:VisualLod){
    this.used.clear();
    this.requested.clear();
    this.tier=lod==='far'?2:lod==='close'&&quality!=='low'?quality==='high'?12:9:6;
  }
  resolve(key:string){
    if(!key.startsWith('model-'))return;
    const asset=modelAsset(key.slice(6));if(!asset)return;
    const desired=(modelCatalog.locations[this.tier] as Record<string,string>)[key];
    if(desired&&!this.scene.textures.exists(desired))this.requested.add(desired);
    for(const tier of [this.tier,12,9,6,2] as Tier[]){
      const texture=(modelCatalog.locations[tier] as Record<string,string>)[key];
      if(texture&&this.scene.textures.exists(texture)){
        this.used.add(texture);
        return {texture,frame:key,scale:tier,ox:asset.anchor[0],oy:asset.anchor[1],vector:false};
      }
    }
  }
  flush(){
    if(!this.loading&&this.requested.size){
      const keys=[...this.requested];this.requested.clear();this.loading=true;
      for(const key of keys)if(!this.scene.textures.exists(key))this.scene.load.atlas(key,`/assets/model/${key}.png`,`/assets/model/${key}.json`);
      this.scene.load.once('complete',()=>{this.loading=false;this.scene.events.emit('architecture-ready');});
      if(!this.scene.load.isLoading())this.scene.load.start();
    }
  }
  finish(){
    this.flush();
    // Vehicles refresh less often than the world. Keep a page until every visible
    // pooled image has switched; removing a live Phaser frame invalidates glTexture.
    const live=new Set<string>();
    for(const child of this.scene.children?.list??[]){
      const image=child as Phaser.GameObjects.Image;
      if(image.visible&&image.texture?.key)live.add(image.texture.key);
    }
    for(const tier of [6,9,12] as const)for(const page of modelCatalog.sheets[tier]){
      if(tier!==this.tier&&!this.used.has(page.key)&&!live.has(page.key)&&this.scene.textures.exists(page.key))this.scene.textures.remove(page.key);
    }
  }
  get memoryMiB(){return Object.values(modelCatalog.sheets).flat().filter(p=>this.scene.textures.exists(p.key)).reduce((sum,p)=>sum+p.width*p.height*4/1048576,0);}
}
