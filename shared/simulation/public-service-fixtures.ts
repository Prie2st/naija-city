import { livingFixture } from './living-fixtures';
import { refreshHouseholds } from './living-city';
import { updateClusters } from './development';
import { makeFacility, updatePublicServices } from './public-services';
import { createBuilding, setTypology } from './buildings';
import { refreshCity } from './economy';
import { updateMobility } from './mobility';
import type { FacilityKind } from '../types/public-services';
// Aggregate QA cities only. Neither this module nor the QA entry touches storage.
export function publicServiceFixture(population:1000|10000|100000|500000) {
  const c=livingFixture(population);c.treasury=2000000000;
  const sites:[FacilityKind,number,number][]=[['primary-school',4,2],['secondary-school',6,2],['phc',12,2],['hospital',18,2],['fire-station',4,5],['waste-depot',12,5],['landfill',26,26],['pocket-park',4,8],['neighborhood-park',18,5],['city-park',20,11]];
  for(const [kind,x,y] of sites){const f=makeFacility(c,y*32+x,kind);f.employeesAvailable=f.employeesRequired;c.publicServices.facilities.push(f);
    for(const id of f.tiles){const t=c.tiles[id];t.road=false;t.roadClass=null;t.building=null;t.zone=null;t.infrastructure=null;t.publicFacility=f.id;t.services.powerReliability=90;t.services.waterReliability=90;}}
  // Rehouse residents displaced when reserving the test facilities. Population is
  // always the sum of real aggregate occupancies, never a HUD-only fixture number.
  let housing=c.tiles.reduce((sum,t)=>sum+(t.building?.maximumOccupancy??0),0);
  for(let id=0;id<c.tiles.length&&housing<population;id++){const t=c.tiles[id];if(t.road||t.publicFacility||t.building)continue;t.zone='residential';t.building=createBuilding('residential',id,c.seed,0,true);setTypology(t.building,population<=1000?2:5);housing+=t.building.maximumOccupancy;}
  // 500k is a deliberately super-dense stress case: the fixed 32x32 production
  // map's current level-5 balance cannot house that many people. Raise only QA
  // aggregate capacities, while retaining real occupancy and workforce rules.
  if(housing<population){const factor=population/housing;for(const t of c.tiles)if(t.building?.type==='residential')t.building.maximumOccupancy=Math.ceil(t.building.maximumOccupancy*factor);}
  let remaining=population;for(const t of c.tiles)if(t.building?.type==='residential'){t.building.occupants=Math.min(t.building.maximumOccupancy,remaining);remaining-=t.building.occupants;}
  c.publicServices.revision++;updateMobility(c,false,true);updatePublicServices(c,false);refreshCity(c);updateClusters(c);refreshHouseholds(c);return c;
}
