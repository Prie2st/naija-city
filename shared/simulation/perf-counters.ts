// Developer timing hooks. The simulation reports how long its expensive passes take;
// nothing here changes results, and with no sink attached a sample costs two clock reads.
export type PerfChannel = 'sim-day' | 'traffic' | 'transit-search' | 'tool-recompute';
type Sink = (channel: PerfChannel, ms: number) => void;
let sink: Sink | null = null;
/** Attach (or detach with null) a receiver for simulation timings. */
export function setPerfSink(next: Sink | null) { sink = next; }
export function perfRecord(channel: PerfChannel, ms: number) { sink?.(channel, ms); }
export const perfNow = () => performance.now();
