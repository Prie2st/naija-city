import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyTool, catchUp, createCity, TICK_MS } from '../shared/simulation/engine';
import { cityActivity } from '../shared/simulation/activity';
import { economyPanelHtml, dataPanelHtml, inspectorKind, inspectorOrder, inspectorPanelHtml, settingsPanelHtml, withoutLeadingHeading } from '../client/ui/panel-layout';
import { developerSettingsHtml } from '../client/ui/dev-panels';
import { TOOLBAR, toolCategory, sheetAfter, strokeSummary, calendarLabel, placementHint } from '../client/ui/interaction';
import { dragIntent, pressBuildsImmediately, tapIntent, followsPointer, type GestureContext } from '../client/game/gesture-policy';
import { welcomeBackHtml, returnAttention, simulatedSpan } from '../client/ui/welcome-back';
import { detectCityPulse, readableMoney } from '../client/ui/city-pulse';

const firstHeading = (html: string) => html.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? '';
const tileId = (c: ReturnType<typeof createCity>, x: number, y: number) => y * c.size + x;

describe('governance navigation', () => {
  it('has its own toolbar button next to Economy, and the toolbar keeps seven touch-sized slots', () => {
    const categories = TOOLBAR.map(([category]) => category);
    expect(categories).toContain('governance');
    expect(categories.indexOf('governance')).toBe(categories.indexOf('economy') + 1);
    expect(TOOLBAR.find(([c]) => c === 'governance')![2]).toBe('Govern');
    expect(TOOLBAR.length).toBe(7);
    // 390px phone: 10px margins and 5px padding on each side leave at least 44px per button.
    expect((390 - 20 - 10) / TOOLBAR.length).toBeGreaterThanOrEqual(44);
  });
  it('the toolbar opens governance directly instead of through a grey button in other panels', () => {
    const main = readFileSync('client/main.ts', 'utf8');
    expect(main).toContain("category === 'governance'");
    expect(main).not.toContain('City governance · budget, policies & districts');
    expect(settingsPanelHtml('high', 'normal')).not.toContain('data-governance-tab');
  });
});

describe('developer controls stay out of player builds', () => {
  it('player settings contain only save, help and display options', () => {
    const html = settingsPanelHtml('medium', 'low');
    for (const action of ['save', 'load', 'new', 'intro']) expect(html).toContain(`data-action="${action}"`);
    for (const debug of ['data-debug', 'data-infra-debug', 'data-mobility-debug', 'data-transit-debug', 'data-graphics-toggle', 'Advance 1 Year', 'Cause Power Plant Failure', 'Developer'])
      expect(html).not.toContain(debug);
  });
  it('developer tools still exist for development builds', () => {
    const html = developerSettingsHtml({ city: createCity(0), debugTarget: null, transitReportOpen: false, activityHourOverride: null });
    expect(html).toContain('Advance 1 Year'); expect(html).toContain('Cause Power Plant Failure'); expect(html).toContain('data-debug');
  });
  it('main.ts renders developer tools and runs their handlers only behind import.meta.env.DEV', () => {
    const main = readFileSync('client/main.ts', 'utf8');
    const calls = main.split('\n').filter(line => line.includes('developerSettingsHtml('));
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatch(/if \(import\.meta\.env\.DEV\)/);
    for (const key of ['debug', 'infraDebug', 'mobilityDebug', 'transitDebug', 'safetyDebug', 'graphicsToggle', 'livingView', 'mobilityView'])
      expect(main).toMatch(new RegExp(`button\\.dataset\\.${key}\\s*&&\\s*import\\.meta\\.env\\.DEV`));
  });
});

describe('panel information hierarchy', () => {
  const city = createCity(0), activity = cityActivity(city, 8);
  it('Economy starts with money, not transit', () => {
    const html = economyPanelHtml(city);
    expect(html.startsWith('<div class="key-figures"')).toBe(true);
    expect(html).toMatch(/Treasury[\s\S]*Monthly balance[\s\S]*Revenue \/ month[\s\S]*Expenses \/ month/);
    expect(firstHeading(html)).toBe('Where money comes from');
    expect(html.indexOf('Where money goes')).toBeLessThan(html.indexOf('Metropolitan network'));
    // Transit finance is inside a collapsed sub-section.
    const transport = html.indexOf('data-section="economy-transport"');
    expect(transport).toBeGreaterThan(-1); expect(html.indexOf('Metropolitan network')).toBeGreaterThan(transport);
    expect(html.slice(transport - 60, transport + 60)).not.toContain(' open');
  });
  it('Economy warns how long the treasury lasts when spending exceeds revenue', () => {
    const c = createCity(0); c.income = 100; c.expenses = 1_000_100; c.treasury = 10_000_000;
    expect(economyPanelHtml(c)).toContain('lasts about 10 months');
  });
  it('Data starts with city-wide headline figures; transit and safety are collapsed sections', () => {
    const html = dataPanelHtml(city, null, activity);
    const figures = html.slice(0, html.indexOf('</div></div>', html.indexOf('key-figures')) + 12);
    for (const label of ['Population', 'Jobs', 'Housing', 'Satisfaction', 'Power', 'Water', 'Commute', 'Quality of life']) expect(figures).toContain(label);
    expect(figures).not.toContain('boardings');
    for (const section of ['data-transit', 'data-safety', 'data-maps']) expect(html).toMatch(new RegExp(`data-section="${section}">`));
    expect(html.indexOf('key-figures')).toBeLessThan(html.indexOf('Metropolitan network') < 0 ? Infinity : html.indexOf('data-section="data-transit"'));
  });
  it('the building inspector shows the building first and transit last', () => {
    const c = createCity(0), t = c.tiles[tileId(c, 12, 10)];
    expect(inspectorKind(c, t)).toBe('building');
    const order = inspectorOrder(c, t);
    expect(order[0]).toBe('identity'); expect(order.at(-1)).toBe('transit');
    const html = inspectorPanelHtml(c, t, activity);
    expect(html).toContain('data-primary="identity"');
    expect(html.indexOf(t.building!.name)).toBeLessThan(html.indexOf('Transit access'));
    expect(html.indexOf('Residents')).toBeLessThan(html.indexOf('data-section='));
  });
  it('road and service inspectors lead with the road and the facility', () => {
    const c = createCity(0), road = c.tiles[tileId(c, 13, 5)];
    expect(inspectorKind(c, road)).toBe('road');
    expect(inspectorOrder(c, road)[0]).toBe('mobility');
    expect(inspectorPanelHtml(c, road, activity)).toMatch(/data-primary="mobility"><h3>Mobility<\/h3>/);
    expect(applyTool(c, 10, 14, 'primary-school')).toBeFalsy();
    const school = c.tiles[tileId(c, 10, 14)];
    expect(inspectorKind(c, school)).toBe('facility');
    const html = inspectorPanelHtml(c, school, activity);
    const name = c.publicServices.facilities.find(f => f.id === school.publicFacility)!.name;
    expect(html).toContain(`data-primary="facility"><h3>${name}</h3>`);
  });
  it('collapsed sections do not repeat their heading inside the body', () => {
    expect(withoutLeadingHeading('<h3>Mobility</h3><dl></dl>')).toBe('<dl></dl>');
    expect(withoutLeadingHeading('<p>x</p><h3>Later</h3>')).toBe('<p>x</p><h3>Later</h3>');
  });
});

describe('mobile panel (bottom sheet) behaviour', () => {
  it('opens compact, expands and collapses, and closes on a final swipe down', () => {
    expect(sheetAfter('full', 'open', true)).toBe('peek');
    expect(sheetAfter('peek', 'toggle', true)).toBe('full');
    expect(sheetAfter('full', 'toggle', true)).toBe('peek');
    expect(sheetAfter('peek', 'swipe-up', true)).toBe('full');
    expect(sheetAfter('full', 'swipe-down', true)).toBe('peek');
    expect(sheetAfter('peek', 'swipe-down', true)).toBe('min');
    expect(sheetAfter('min', 'swipe-down', true)).toBe('closed');
    expect(sheetAfter('min', 'tap-heading', true)).toBe('peek');
  });
  it('activating an overlay shrinks the phone sheet so the map shows the result', () => {
    for (const state of ['peek', 'full', 'min'] as const) expect(sheetAfter(state, 'overlay', true)).toBe('min');
    expect(sheetAfter('peek', 'overlay', false)).toBe('peek');
  });
  it('the phone stylesheet hides the chips under an open sheet and moves the legend above it', () => {
    const css = readFileSync('client/ui/style.css', 'utf8');
    expect(css).toMatch(/body\[data-panel="open"\] \.demand-chip, body\[data-panel="open"\] \.weather-chip \{ display: none; \}/);
    expect(css).toMatch(/body\[data-sheet="peek"\] \.panel \{ max-height: 36dvh; \}/);
    expect(css).toMatch(/body\[data-sheet="min"\] #panel-content \{ display: none; \}/);
    expect(css).toMatch(/body\[data-panel="open"\] \.overlay-legend \{ top:/);
  });
  it('overlay activation gives visible feedback and shrinks the sheet (main.ts wiring)', () => {
    const main = readFileSync('client/main.ts', 'utf8');
    const setOverlay = main.slice(main.indexOf('function setOverlay'), main.indexOf('function save('));
    expect(setOverlay).toContain("sheetAfter(sheet, 'overlay', compactLayout())");
    expect(setOverlay).toMatch(/map on\. Close it from the legend\./);
  });
});

describe('touch construction safeguards', () => {
  const base: GestureContext = { inspecting: false, touch: true, drawMode: false, rightButton: false, multiTouch: false };
  it('with a tool selected, a one-finger drag pans and never builds', () => {
    expect(dragIntent(base)).toBe('pan');
    expect(pressBuildsImmediately(base)).toBe(false);
    expect(followsPointer(base)).toBe(false);
  });
  it('a tap previews, a second tap on the same tile builds', () => {
    expect(tapIntent({ ...base, sameAsPreview: false })).toBe('preview');
    expect(tapIntent({ ...base, sameAsPreview: true })).toBe('build');
  });
  it('Draw mode makes a one-finger drag paint; two fingers still pan', () => {
    expect(dragIntent({ ...base, drawMode: true })).toBe('paint');
    expect(dragIntent({ ...base, drawMode: true, multiTouch: true })).toBe('pan');
  });
  it('mouse behaviour is unchanged: press builds, left-drag paints, right-drag pans', () => {
    const mouse = { ...base, touch: false };
    expect(pressBuildsImmediately(mouse)).toBe(true);
    expect(dragIntent(mouse)).toBe('paint');
    expect(dragIntent({ ...mouse, rightButton: true })).toBe('pan');
    expect(tapIntent({ ...mouse, sameAsPreview: true })).toBe('none');
  });
  it('inspect mode selects on tap and pans on drag for every input', () => {
    for (const touch of [true, false]) { expect(dragIntent({ ...base, touch, inspecting: true })).toBe('pan'); expect(tapIntent({ ...base, touch, inspecting: true, sameAsPreview: false })).toBe('select'); }
  });
});

describe('construction feedback and tool state', () => {
  it('summarises a stroke once, including skipped tiles and money problems', () => {
    expect(strokeSummary({ built: 0, spent: 0, errors: [] }).tone).toBe('none');
    expect(strokeSummary({ built: 3, spent: 60000, errors: [] })).toEqual({ text: 'Built 3 tiles · ₦60K', tone: 'ok' });
    expect(strokeSummary({ built: 0, spent: 0, errors: ['Treasury too low for this action.'] })).toEqual({ text: 'Not built: Treasury too low for this action.', tone: 'error' });
    expect(strokeSummary({ built: 1, spent: 20000, errors: ['A', 'A'] }).text).toBe('Built 1 tile · ₦20K. 2 tiles skipped: A');
  });
  it('the toolbar marks which system the active tool belongs to', () => {
    expect(toolCategory('inspect')).toBeNull();
    expect(toolCategory('avenue')).toBe('roads'); expect(toolCategory('commercial')).toBe('zones');
    expect(toolCategory('bus-stop')).toBe('transport'); expect(toolCategory('borehole')).toBe('services'); expect(toolCategory('hospital')).toBe('services');
  });
  it('cancelling a tool resets Draw mode and tells the player', () => {
    const main = readFileSync('client/main.ts', 'utf8');
    const choose = main.slice(main.indexOf('function chooseTool'), main.indexOf('function setOverlay'));
    expect(choose).toContain('drawMode = false'); expect(choose).toContain('Construction tool closed');
    expect(placementHint(true, false)).toMatch(/Drag moves the map/);
  });
  it('the calendar shows years instead of an ever-growing month count', () => {
    expect(calendarLabel(0, '06:00')).toBe('Y1 · M1 · D1 · 06:00');
    expect(calendarLabel(6150, '20:37')).toBe('Y18 · M2 · D1 · 20:37');
  });
});

describe('Welcome Back presentation', () => {
  it('leads with time in words, headline figures and at most three actions, with the full report collapsed', () => {
    const c = createCity(0), start = c.lastSimulatedTimestamp;
    const report = { ...catchUp(c, start + 40 * TICK_MS), populationBefore: 548, populationAfter: 0, gridBefore: 86, gridAfter: 0, waterBefore: 96, waterAfter: 0, revenue: -1.4e9, floodProperties: 6849 };
    const html = welcomeBackHtml(report);
    expect(html).toMatch(/^<p class="return-lead">/);
    expect(html.indexOf('key-figures')).toBeLessThan(html.indexOf('Needs your attention'));
    expect(html.match(/class="return-attention"/g)?.length).toBe(3);
    expect(html).toContain('All 548 residents left the city.');
    expect(html).toContain('data-section="return-all"');
    expect(html.indexOf('data-section="return-all"')).toBeLessThan(html.indexOf('Grid reliability'));
    expect(returnAttention(report)[0].text).toContain('residents left');
  });
  it('a quiet absence has nothing to act on', () => {
    const c = createCity(0);
    const report = catchUp(c, c.lastSimulatedTimestamp + 3 * TICK_MS);
    expect(returnAttention({ ...report, revenue: 0, floodProperties: 0 })).toEqual([]);
    expect(welcomeBackHtml({ ...report, revenue: 0, floodProperties: 0 })).toContain('Nothing urgent happened');
  });
  it('describes simulated time in words', () => {
    expect(simulatedSpan(5760)).toBe('16 years'); expect(simulatedSpan(210)).toBe('7 months'); expect(simulatedSpan(1)).toBe('1 day');
  });
  it('the catch-up screen shows one message with progress, not two overlapping ones', () => {
    const main = readFileSync('client/main.ts', 'utf8');
    expect(main).not.toContain('loading-city');
    expect(main).toMatch(/<progress max="1" value="0"/);
  });
});

describe('City Pulse readability', () => {
  it('formats raw naira amounts and shows one budget card, not two', () => {
    expect(readableMoney('Monthly balance -9414265 naira; 360 deficit days.')).toBe('Monthly balance ₦-9.4M; 360 deficit days.');
    const c = createCity(0); c.income = 0; c.expenses = 1e7;
    c.governance.challenges.push({ id: 'budget-1', kind: 'budget', title: 'Persistent budget deficit', description: 'Monthly balance -10000000 naira; 90 deficit days.', severity: 'critical', causes: [], responses: [], overlay: 'none', tileId: null, resolved: false } as never);
    const pulses = detectCityPulse(c);
    expect(pulses.filter(p => /budget deficit/i.test(p.title)).length).toBe(1);
    expect(pulses.find(p => p.title === 'Persistent budget deficit')!.description).toContain('₦-10M');
  });
});
