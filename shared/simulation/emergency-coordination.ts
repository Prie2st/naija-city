import type { City } from '../types/city';
import type { EmergencyResponseState, IncidentSeverity } from '../types/safety';
export interface EmergencyIncidentSummary {
  id:string; location:number; severity:IncidentSeverity; startTime:number;
  response:EmergencyResponseState; resolvedAt:number|null;
}
// Common read model for dispatch UI and future emergencies. Existing fire damage
// and healthcare visit allocation retain their own established simulation rules.
export function emergencyIncidents(city:City):EmergencyIncidentSummary[] {
  return [
    ...city.publicServices.fires.map(f=>({id:f.id,location:f.tileId,severity:(f.intensity>50?'serious':'moderate') as IncidentSeverity,startTime:f.startedAt,resolvedAt:f.resolvedAt,
      response:{requiredService:'fire' as const,facilityId:f.stationId,minutes:f.responseMinutes,path:f.path,state:(f.resolvedAt!==null?'resolved':f.stationId?'responding':'waiting') as EmergencyResponseState['state']}})),
    ...city.safety.incidents.map(i=>({id:i.id,location:i.location,severity:i.severity,startTime:i.startTime,response:i.response,resolvedAt:i.resolvedAt})),
  ];
}
