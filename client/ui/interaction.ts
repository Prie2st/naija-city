// Pure UI interaction rules: toolbar layout, mobile panel (bottom sheet) states, construction
// feedback and calendar text. No DOM access, so every rule is unit tested.
import type { Tool } from '../../shared/types/city';
import { compactMoney } from './panels';

/** Bottom toolbar: one button per major system. Governance is first-class, between Economy and Data. */
export const TOOLBAR: readonly (readonly [category: string, icon: string, label: string])[] = [
  ['roads', '╋', 'Roads'], ['zones', '▧', 'Zones'], ['services', '⌂', 'Services'], ['transport', '⇄', 'Transport'],
  ['economy', '₦', 'Economy'], ['governance', '⚖', 'Govern'], ['data', '▥', 'Data'],
];

/** Which toolbar button stays highlighted while a construction tool from it is active. */
export function toolCategory(tool: Tool): string | null {
  if (tool === 'inspect') return null;
  if (['road', 'dirt-road', 'avenue', 'major-road', 'bulldoze'].includes(tool)) return 'roads';
  if (['residential', 'commercial', 'industrial'].includes(tool)) return 'zones';
  if (['bus-stop', 'brt-station', 'bus-terminal', 'transport-interchange', 'bus-depot'].includes(tool)) return 'transport';
  return 'services';
}

/** Mobile panel heights: `min` = heading only, `peek` = about a third of the screen, `full` = up to the HUD. */
export type SheetState = 'min' | 'peek' | 'full';
export type SheetEvent = 'open' | 'overlay' | 'toggle' | 'swipe-up' | 'swipe-down' | 'tap-heading' | 'focus-map';
/** Next sheet state. `closed` means the panel should close. On wide screens the panel is a side panel and never collapses. */
export function sheetAfter(state: SheetState, event: SheetEvent, compact: boolean): SheetState | 'closed' {
  if (!compact) return event === 'swipe-down' ? state : 'peek';
  switch (event) {
    case 'open': return 'peek';
    // An overlay or a camera jump needs the map: shrink the sheet so the result is visible.
    case 'overlay': case 'focus-map': return 'min';
    case 'toggle': return state === 'full' ? 'peek' : state === 'peek' ? 'full' : 'peek';
    case 'swipe-up': return state === 'min' ? 'peek' : 'full';
    case 'swipe-down': return state === 'full' ? 'peek' : state === 'peek' ? 'min' : 'closed';
    case 'tap-heading': return state === 'min' ? 'peek' : state;
  }
}

export interface StrokeResult { built: number; spent: number; errors: string[] }
/** One line summarising a construction stroke (a click, a confirmed tap or a drag). */
export function strokeSummary(r: StrokeResult): { text: string; tone: 'ok' | 'error' | 'none' } {
  const reasons = [...new Set(r.errors)];
  const noun = (n: number) => `${n} tile${n === 1 ? '' : 's'}`;
  if (!r.built && !reasons.length) return { text: '', tone: 'none' };
  if (!r.built) return { text: `Not built: ${reasons[0]}`, tone: 'error' };
  const done = `Built ${noun(r.built)} · ${compactMoney(r.spent)}`;
  return reasons.length ? { text: `${done}. ${noun(r.errors.length)} skipped: ${reasons[0]}`, tone: 'error' } : { text: done, tone: 'ok' };
}
export const isFundsError = (error: string) => /treasury too low|insufficient/i.test(error);

/** Construction-bar hint for the current input type. */
export function placementHint(touch: boolean, drawMode: boolean) {
  if (!touch) return 'Click to build, drag to paint. Right-drag moves the map. Esc or Done to stop.';
  return drawMode ? 'Draw on: drag to paint tiles. Two fingers move the map.' : 'Tap a tile to preview, then tap it again or press Build. Drag moves the map.';
}

/** HUD calendar: 30-day months, 12-month years. */
export function calendarLabel(tick: number, time: string) {
  return `Y${Math.floor(tick / 360) + 1} · M${Math.floor(tick / 30) % 12 + 1} · D${tick % 30 + 1} · ${time}`;
}
