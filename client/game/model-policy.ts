import type { Building, City, Tile } from '../../shared/types/city';
import { modelCatalog } from './model-catalog';

export type ModelAsset = typeof modelCatalog.assets[number];
export const modelAsset = (id: string) => modelCatalog.assets.find(a => a.id === id);
// One benchmark form per level, with a second courtyard form at L3. No simulation mutation.
export function modelBuilding(b: Building) {
  if (b.constructionState !== 'complete') return modelAsset(b.constructionState === 'site-preparation' || b.constructionProgress < 45 ? 'construction-foundation' : 'construction-shell');
  const level = b.pendingLevel ?? b.level;
  if (b.type === 'residential') return modelAsset(level === 1 ? 'bungalow' : level === 2 ? 'duplex'
    : level === 3 ? b.variant % 2 ? 'courtyard-apartment' : 'apartment-4' : level === 4 ? 'apartment-8' : 'apartment-14');
  if (b.type === 'commercial') return modelAsset(level === 1 ? 'shop-row' : level === 3 ? 'commercial-modern' : '');
  if (b.type === 'industrial' && level === 1) return modelAsset('warehouse');
}
export function modelProp(kind: string) {
  return modelAsset(kind === 'tank' ? 'tank' : kind === 'pump' ? 'pump' : kind === 'generator-1' ? 'generator-enclosed' : 'generator-open');
}
export function roadMask(city: City, tile: Tile) {
  let mask = 0;
  for (const [bit, dx, dy] of [[0,1,0],[1,-1,0],[2,0,1],[3,0,-1]]) {
    const x=tile.x+dx,y=tile.y+dy;
    if(x>=0&&y>=0&&x<city.size&&y<city.size&&city.tiles[y*city.size+x].road)mask|=1<<bit;
  }
  return mask;
}
export function modelRoad(city: City, tile: Tile) {
  const kind=tile.roadClass??'local';
  if(!tile.road||kind==='dirt')return;
  // Mixed-class transitions retain the established tapered road geometry.
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const x=tile.x+dx,y=tile.y+dy,n=city.tiles[y*city.size+x];
    if(x>=0&&y>=0&&x<city.size&&y<city.size&&n?.road&&(n.roadClass??'local')!==kind)return;
  }
  return modelAsset(`road-${kind}-${roadMask(city,tile)}`);
}
