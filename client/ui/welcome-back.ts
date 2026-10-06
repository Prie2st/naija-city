// Welcome Back presentation: a short summary of what changed and what needs attention first,
// with the full report one tap away. Reads the existing OfflineReport; never changes catch-up.
import type { OfflineReport } from '../../shared/types/city';
import { compactMoney, escapeHtml, offlineHtml } from './panels';
import { collapsible, keyFigures } from './panel-layout';

/** "16 years", "7 months", "12 days" — simulated time in words a player can picture. */
export function simulatedSpan(ticks: number) {
  if (ticks >= 720) return `${Math.round(ticks / 360)} years`;
  if (ticks >= 60) return `${Math.round(ticks / 30)} months`;
  return `${ticks} day${ticks === 1 ? '' : 's'}`;
}
export function awayText(ms: number) {
  const minutes = Math.floor(ms / 60000), hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${Math.max(1, minutes)} min`;
}

export interface ReturnAttention { severity: number; text: string; action: string; label: string }
/** The most important changes, worst first (at most three). Thresholds are presentation choices only. */
export function returnAttention(r: OfflineReport): ReturnAttention[] {
  const out: ReturnAttention[] = [];
  const popLoss = r.populationBefore > 0 ? (r.populationBefore - r.populationAfter) / r.populationBefore : 0;
  if (popLoss >= .25) out.push({ severity: 100 * popLoss, text: r.populationAfter === 0 ? `All ${r.populationBefore.toLocaleString()} residents left the city.` : `Population fell by ${Math.round(popLoss * 100)}% (${r.populationBefore.toLocaleString()} → ${r.populationAfter.toLocaleString()}).`, action: 'data-action="pulse"', label: 'See what went wrong' });
  if (r.gridBefore - r.gridAfter >= 20 && r.gridAfter < 60) out.push({ severity: r.gridBefore - r.gridAfter, text: `Power reliability fell to ${Math.round(r.gridAfter)}%.`, action: 'data-service="power"', label: 'Open power' });
  if (r.waterBefore - r.waterAfter >= 20 && r.waterAfter < 60) out.push({ severity: r.waterBefore - r.waterAfter, text: `Water reliability fell to ${Math.round(r.waterAfter)}%.`, action: 'data-service="water"', label: 'Open water' });
  if (r.revenue < 0) out.push({ severity: Math.min(90, 30 + Math.log10(Math.max(1, -r.revenue)) * 5), text: `The treasury fell by ${compactMoney(-r.revenue)}.`, action: 'data-action="economy"', label: 'Open economy' });
  if (r.floodProperties > 0) out.push({ severity: Math.min(60, 20 + r.floodProperties / 10), text: `Flooding hit properties ${r.floodProperties.toLocaleString()} times.`, action: 'data-service="drainage"', label: 'Open drainage' });
  if (r.healthcareBefore - r.healthcareAfter >= 20) out.push({ severity: (r.healthcareBefore - r.healthcareAfter) / 2, text: `Healthcare access fell to ${Math.round(r.healthcareAfter)}%.`, action: 'data-service="healthcare"', label: 'Open healthcare' });
  if (r.educationBefore - r.educationAfter >= 20) out.push({ severity: (r.educationBefore - r.educationAfter) / 2, text: `Education access fell to ${Math.round(r.educationAfter)}%.`, action: 'data-service="education"', label: 'Open education' });
  if (r.safetyBefore - r.safetyAfter >= 10) out.push({ severity: r.safetyBefore - r.safetyAfter, text: `Public safety fell to ${Math.round(r.safetyAfter)}%.`, action: 'data-governance-tab="Safety"', label: 'Open safety' });
  return out.sort((a, b) => b.severity - a.severity).slice(0, 3);
}

export function welcomeBackHtml(r: OfflineReport) {
  const delta = (a: number, b: number) => `${b - a >= 0 ? '+' : '−'}${Math.abs(b - a).toLocaleString()}`;
  let html = `<p class="return-lead">You were away for ${awayText(r.awayMs)}. In that time <b>${simulatedSpan(r.ticks)}</b> passed in your city.</p>`;
  html += keyFigures([
    { label: 'Population', value: r.populationAfter.toLocaleString(), note: delta(r.populationBefore, r.populationAfter), tone: r.populationAfter < r.populationBefore ? 'bad' : 'good' },
    { label: 'Treasury change', value: `${r.revenue >= 0 ? '+' : ''}${compactMoney(r.revenue)}`, tone: r.revenue < 0 ? 'bad' : 'good' },
    { label: 'Jobs', value: r.jobsAfter.toLocaleString(), note: delta(r.jobsBefore, r.jobsAfter), tone: r.jobsAfter < r.jobsBefore ? 'bad' : undefined },
    { label: 'Quality of life', value: r.qolAfter.toFixed(0), note: `was ${r.qolBefore.toFixed(0)}`, tone: r.qolAfter < r.qolBefore - 2 ? 'bad' : undefined },
  ]);
  const attention = returnAttention(r);
  html += attention.length
    ? `<h3>Needs your attention</h3>${attention.map(a => `<div class="return-attention"><span>${escapeHtml(a.text)}</span><button class="secondary" ${a.action}>${a.label} ›</button></div>`).join('')}`
    : '<p>Nothing urgent happened. Pick up where you left off.</p>';
  html += collapsible('return-all', 'All changes while away', offlineHtml(r));
  return html + `<p class="hint">Your city keeps simulating while you are away, for up to 24 real hours.</p>`;
}
