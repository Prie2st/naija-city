// Developer frame-time and simulation-time monitor. Frame intervals come from
// requestAnimationFrame timestamps, not Phaser's smoothed delta, so stalls stay visible.
import { setPerfSink, type PerfChannel } from '../../shared/simulation/perf-counters';

/** Fixed-size ring of recent samples with spike-oriented summaries. */
class Samples {
  private values: Float64Array; private next = 0; private filled = 0;
  constructor(size: number) { this.values = new Float64Array(size); }
  add(ms: number) { this.values[this.next] = ms; this.next = (this.next + 1) % this.values.length; this.filled = Math.min(this.filled + 1, this.values.length); }
  get count() { return this.filled; }
  last() { return this.filled ? this.values[(this.next - 1 + this.values.length) % this.values.length] : 0; }
  summary() {
    if (!this.filled) return { count: 0, mean: 0, p95: 0, p99: 0, max: 0 };
    const sorted = Array.from(this.values.subarray(0, this.filled)).sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    return { count: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, p95: at(.95), p99: at(.99), max: sorted[sorted.length - 1] };
  }
}
export type PerfMetric = PerfChannel | 'redraw' | 'ui';
/** A frame longer than this counts as a stutter (three missed 60 Hz frames). */
export const STUTTER_MS = 50;
export class PerfMonitor {
  readonly frames = new Samples(600);
  private metrics = new Map<PerfMetric, Samples>();
  private lastFrame = 0; private frame = 0; private running = false;
  stutters = 0; longTasks = 0; longTaskMs = 0; private observer: PerformanceObserver | null = null;
  start() {
    if (this.running) return; this.running = true; this.lastFrame = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      if (this.lastFrame) { const ms = now - this.lastFrame; this.frames.add(ms); if (ms > STUTTER_MS) this.stutters++; }
      this.lastFrame = now; this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
    setPerfSink((channel, ms) => this.record(channel, ms));
    // Long tasks (>50 ms of blocked main thread) are reported by Chromium-based browsers only.
    try { this.observer = new PerformanceObserver(list => { for (const e of list.getEntries()) { this.longTasks++; this.longTaskMs += e.duration; } }); this.observer.observe({ type: 'longtask' }); } catch { this.observer = null; }
  }
  stop() { this.running = false; cancelAnimationFrame(this.frame); setPerfSink(null); this.observer?.disconnect(); this.observer = null; }
  /** Hidden tabs stop rAF; the gap on return is not a stall, so restart the interval. */
  resume() { this.lastFrame = 0; }
  record(metric: PerfMetric, ms: number) { let s = this.metrics.get(metric); if (!s) { s = new Samples(120); this.metrics.set(metric, s); } s.add(ms); }
  snapshot() {
    const metric = (k: PerfMetric) => { const s = this.metrics.get(k); return s ? { last: s.last(), ...s.summary() } : null; };
    return { frame: this.frames.summary(), stutters: this.stutters, longTasks: this.observer ? this.longTasks : null, longTaskMs: this.longTaskMs,
      simDay: metric('sim-day'), traffic: metric('traffic'), transit: metric('transit-search'), tool: metric('tool-recompute'), redraw: metric('redraw'), ui: metric('ui') };
  }
  text() {
    const s = this.snapshot(), f = s.frame, n = (v: number) => v.toFixed(1);
    const line = (name: string, m: ReturnType<PerfMonitor['snapshot']>['simDay']) => m ? `${name} last ${n(m.last)} · avg ${n(m.mean)} · max ${n(m.max)} ms (${m.count})` : `${name} —`;
    return [
      `frame avg ${n(f.mean)} · p95 ${n(f.p95)} · p99 ${n(f.p99)} · max ${n(f.max)} ms over ${f.count}`,
      `stutters >${STUTTER_MS} ms: ${s.stutters}${s.longTasks === null ? ' · long tasks n/a' : ` · long tasks ${s.longTasks} (${Math.round(s.longTaskMs)} ms)`}`,
      line('sim day', s.simDay), line('traffic', s.traffic), line('transit', s.transit), line('tool', s.tool), line('redraw', s.redraw), line('ui', s.ui),
    ].join('\n');
  }
}
