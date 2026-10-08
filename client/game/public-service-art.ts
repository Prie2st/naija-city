import type { PublicServiceFacility } from '../../shared/types/public-services';
import type { Tile, Overlay } from '../../shared/types/city';
import { SERVICE_GROUPS } from '../../shared/simulation/public-service-config';
import type { ServiceGroup } from '../../shared/types/public-services';
// Reuse the established architectural atlas and renderer. Dedicated service art
// can replace these identifiers without changing simulation or the DPR pipeline.
export const facilityFrame=(f:PublicServiceFacility)=>`model-${f.type==='education'?'shop-row':f.type==='healthcare'||f.type==='police'?'commercial-modern':f.type==='parks'?'tree-1':'warehouse'}`;
export const facilityHeight=(f:PublicServiceFacility|undefined)=>f?.type==='healthcare'?45:f?.type==='parks'?18:f?25:0;
export const serviceOverlayValue=(tile:Tile,overlay:Overlay):number|undefined=>overlay==='quality-of-life'?tile.publicServices.qualityOfLife:SERVICE_GROUPS.includes(overlay as ServiceGroup)?tile.publicServices[overlay as ServiceGroup].quality:undefined;
export function publicDebugValue(tile:Tile,view:string){
  const s=tile.publicServices;
  return view==='education-demand'?Math.min(100,s.educationDemand/3):view==='healthcare-demand'?Math.min(100,s.healthcareDemand/1.5):view==='education-capacity'?s.education.served:view==='healthcare-capacity'?s.healthcare.served:view==='fire-response'?Math.max(0,100-s.fire.minutes*4):view==='waste-generation'?Math.min(100,s.wasteGenerated*120):view==='waste-collection'?s.waste.served:view==='park-access'?s.parks.served:view==='accessibility'?Math.max(s.education.access,s.healthcare.access):s.qualityOfLife;
}
