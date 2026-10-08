export type ActivityPeriod = 'early morning' | 'morning rush' | 'daytime' | 'evening rush' | 'evening' | 'night';
export interface LocalActivity {
  pedestrian: number; commercial: number; commuter: number; market: number;
  jobsAccess: number; commercialAccess: number; transitAccess: number;
}
export interface ActiveJourney {
  flowId: string; origin: number; destination: number; path: number[];
  purpose: string; volume: number; car: number; okada: number; freight: number;
}
export interface CityActivity {
  hour: number; period: ActivityPeriod; weekend: boolean;
  lighting: 'morning' | 'midday' | 'evening' | 'night';
  pedestrianActivity: number; vehicleActivity: number; commercialActivity: number;
  commuterActivity: number; nightActivity: number; marketActivity: number;
  averageCommute: number; congestion: number;
  tiles: LocalActivity[]; journeys: ActiveJourney[];
  pedestrianNetwork: { path: number[]; origin: number; destination: number; purpose?: string }[];
  roads: Record<number, { flow: number; congestion: number; speed: number }>;
  transit: Record<string, { riders: number; utilization: number; waiting: number; activity: number }>;
}
export interface HouseholdReference { id: string; surname: string; homeId: string; size: number }
export interface HouseholdSample extends HouseholdReference {
  homeTile: number; neighborhood: string; income: 'modest' | 'middle' | 'comfortable';
  employed: number; commute: number; satisfaction: number; concern: string;
}
export interface Market {
  id: string; tileId: number; name: string; age: number; stalls: number;
  attraction: number; jobs: number; output: number; poorDays: number;
}
export interface CityFeedEvent {
  id: string; tick: number; hour: number; kind: string; text: string;
  tileId: number | null; severity: 'notice' | 'warning' | 'opportunity';
}
export interface LivingState {
  households: HouseholdReference[]; markets: Market[];
  informal: { jobs: number; employed: number; output: number; housingPressure: number; pressureDays: number };
  feed: CityFeedEvent[]; lastEvents: Record<string, number>; previous: Record<string, number | string>;
}
export interface SentimentFactor { label: string; value: number }
