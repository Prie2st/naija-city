export type SafetyIncidentType = 'property' | 'commercial' | 'public-space' | 'vehicle';
export type IncidentSeverity = 'minor' | 'moderate' | 'serious';
export interface EmergencyResponseState {
  requiredService: 'police' | 'fire' | 'healthcare';
  facilityId: string | null; minutes: number; path: number[];
  state: 'waiting' | 'responding' | 'resolved';
}
export interface CrimePressureModel {
  economicStress: number; employmentStress: number; housingStress: number; serviceStress: number;
  opportunity: number; community: number; visibility: number; patrol: number;
}
export interface SafetyAreaMetrics {
  crimePressure: number; publicSafety: number; nightSafety: number; commercialSafety: number;
  communitySafety: number; lighting: number; policeAccess: number; patrol: number;
  responseMinutes: number; recentIncidents: number; shock: number; eveningActivity: number;
  model: CrimePressureModel;
}
export interface SafetyIncident {
  id: string; type: SafetyIncidentType; location: number; severity: IncidentSeverity;
  startTime: number; status: 'waiting' | 'responding' | 'resolved'; responseRequired: boolean;
  respondingUnit: string | null; responseTime: number; response: EmergencyResponseState;
  resolution: string | null; resolvedAt: number | null; impact: number;
  districtId: string | null; neighborhoodId: number | null;
}
export interface PoliceFacilityState {
  facilityId: string; activeIncidents: number; responseSlots: number; patrolDemand: number;
  patrolEffectiveness: number; patrolPath: number[];
}
export interface SafetyMetrics {
  crimePressure: number; publicSafety: number; nightSafety: number; lighting: number;
  policeAccess: number; responseMinutes: number; communitySafety: number;
  capacity: number; demand: number; activeIncidents: number; incidents30Days: number;
}
export interface SafetyState {
  local: SafetyAreaMetrics[]; facilities: PoliceFacilityState[]; incidents: SafetyIncident[];
  metrics: SafetyMetrics; districts: Record<string, SafetyMetrics>;
  totalIncidents: number; seriousIncidents: number; resolvedIncidents: number; nextIncidentId: number;
  history: (SafetyMetrics & { tick: number })[]; lastAnalysis: number;
  lightingPower: number; lightingCost: number;
}
