// Milestone 8 mobile/desktop transit workflow check. Start `npm run dev` first.
// PLAYWRIGHT_MODULE / CHROMIUM_PATH override the Playwright package and browser.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_URL || 'http://localhost:5173';
const out = path.resolve('.qa/transit'); fs.mkdirSync(out, { recursive: true });
const views = [[390, 844, 3], [430, 932, 3], [1440, 900, 1]];
async function tapTile(page, x, y) {
  await page.evaluate(([x, y]) => window.naijaQA.focusTile(x, y), [x, y]); await page.waitForTimeout(250);
  const point = await page.evaluate(([x, y]) => window.naijaQA.tileScreen(x, y), [x, y]), box = await page.locator('#game canvas').boundingBox();
  const at = { x: box.x + point.x, y: box.y + point.y };
  if (page.context()._options?.hasTouch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(150); return at;
}
async function layout(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#panel'), r = panel && !panel.hidden ? panel.getBoundingClientRect() : null;
    const small = [...document.querySelectorAll('#panel button, #placement button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 30).length;
    return { overflow: document.documentElement.scrollWidth > innerWidth, panel: r && { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width), fits: r.left >= 0 && r.right <= innerWidth + 1 }, smallButtons: small };
  });
}
async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
  const report = { views: [], errors: [] };
  try {
    for (const [width, height, dpr] of views) {
      const mobile = width < 600, context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage(), shot = name => page.screenshot({ path: path.join(out, `${width}-${name}.png`) }), steps = {};
      page.on('pageerror', e => report.errors.push(`${width}: ${e}`));
      await page.goto(base); await page.waitForSelector('#settings', { timeout: 120000 });
      const seed = await page.evaluate(async () => {
        const { transitFixture } = await import('/shared/simulation/transit-fixtures.ts'); const { placeTransitFacility } = await import('/shared/simulation/transit.ts');
        const c = transitFixture(4000); for (const id of [162, 174, 186]) placeTransitFacility(c, id, 'bus-stop'); placeTransitFacility(c, 195, 'bus-depot');
        c.lastSimulatedTimestamp = Date.now(); return JSON.stringify(c);
      });
      // The page autosaves on pagehide, so the seed is written as the next document starts.
      await context.addInitScript(json => { if (!sessionStorage.getItem('qa-seeded')) { localStorage.clear(); localStorage.setItem('naija-city-v9', json); sessionStorage.setItem('qa-seeded', '1'); } }, seed);
      await page.reload(); await page.waitForSelector('#settings', { timeout: 120000 });
      if (await page.locator('#intro').evaluate(d => d.open).catch(() => false)) await page.click('#start');
      await page.click('[data-speed="0"]');
      // Transport → Bus → Create route → select stops → preview → complete.
      await page.click('[data-category="transport"]'); await page.click('[data-transport-tab="bus"]'); await shot('bus-tab'); steps.busTab = await layout(page);
      await page.click('[data-action="transit-plan"][data-transit-mode="bus"]');
      for (const [x, y] of [[2, 5], [14, 5], [26, 5]]) await tapTile(page, x, y);
      steps.draft = await page.locator('#tool-name').innerText(); steps.preview = await page.locator('#placement-description').innerText(); await shot('route-preview'); steps.placement = await layout(page);
      if (steps.draft !== 'BUS · 3 stops') throw Error(`Stop selection failed at ${width}: ${steps.draft}`);
      await page.click('#commit'); await page.waitForTimeout(300);
      steps.created = await page.evaluate(() => window.naijaQA.city().transit.routes.map(r => `${r.name}:${r.status}:${Math.round(r.ridership)}`));
      if (!steps.created.length) throw Error(`Route was not created at ${width}`);
      await page.click('[data-category="transport"]'); await page.click('[data-transport-tab="bus"]'); await page.locator('[data-transit-route]').first().click();
      const inspector = await page.locator('#panel-content').innerText();
      for (const text of ['Headway', 'Crowding in the busiest period', 'Boardings by period', 'Operating subsidy']) if (!inspector.includes(text)) throw Error(`Route inspector missing ${text} at ${width}`);
      await shot('route-inspector'); steps.routeInspector = await layout(page);
      steps.routeDetailVisible = await page.locator('.route-detail h3').first().evaluate(h => { const r = h.getBoundingClientRect(), p = document.querySelector('#panel').getBoundingClientRect(); return r.top >= p.top && r.bottom <= p.bottom; });
      if (!steps.routeDetailVisible) throw Error(`Route detail is not scrolled into view at ${width}`);
      await page.locator('#panel').evaluate(el => { el.scrollTop += el.clientHeight * .8; }); await shot('route-inspector-scrolled');
      // Stop/station inspector from a map tap.
      await page.click('#close-panel'); await tapTile(page, 14, 5);
      const stop = await page.locator('#panel-content').innerText();
      for (const text of ['Routes served', 'Boardings / transfers', 'Crowding in the busiest period', 'Night safety']) if (!stop.includes(text)) throw Error(`Stop inspector missing ${text} at ${width}`);
      await shot('stop-inspector'); steps.stopInspector = await layout(page);
      // Network tab, overlays and legend.
      await page.click('#close-panel'); await page.click('[data-category="transport"]'); await page.click('[data-transport-tab="network"]'); await shot('network-tab'); steps.networkTab = await layout(page);
      await page.locator('[data-overlay="transit-accessibility"]').first().click(); await page.waitForTimeout(200);
      steps.legend = [await page.locator('#overlay-name').innerText(), await page.locator('#legend-low').innerText(), await page.locator('#legend-high').innerText()];
      if (steps.legend[1] !== 'Poor' || steps.legend[2] !== 'Excellent') throw Error(`Accessibility legend wrong at ${width}`);
      await page.click('#close-panel').catch(() => {}); await shot('accessibility-overlay');
      await page.click('[data-category="transport"]'); await page.click('[data-transport-tab="network"]'); await page.locator('[data-overlay="transit-network"]').first().click(); await page.click('#close-panel').catch(() => {}); await shot('network-view');
      report.views.push({ width, height, dpr, steps }); await context.close();
    }
    if (report.errors.length) throw Error(report.errors.join('\n'));
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log(JSON.stringify(report, null, 2));
}
run().catch(e => { console.error(e); process.exitCode = 1; });
