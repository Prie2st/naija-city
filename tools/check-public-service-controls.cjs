// Normal game controls in isolated Chrome contexts; never uses player storage.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/omano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = path.resolve('.qa/public-services');
fs.mkdirSync(out, { recursive: true });

async function run() {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const report = { scenarios: [], errors: [] };
  try {
    for (const [width, height] of process.argv.includes('--migration-only') ? [] : [[1440, 900], [390, 844], [430, 932]]) {
      const mobile = width < 600;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(String(e)));
      await page.goto('http://localhost:5173/public-service-check.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.publicQA?.snapshot().ready, {}, { timeout: 90000 });
      await page.evaluate(async () => {
        const { createCity, applyTool, previewTool } = await import('/shared/simulation/engine.ts');
        const city = createCity();
        for (const [x, y, kind] of [[12, 8, 'primary-school'], [14, 8, 'phc']]) {
          if (previewTool(city, x, y, kind).status !== 'valid') throw new Error(`Invalid control test site ${x},${y}`);
        }
        const error = applyTool(city, 12, 8, 'primary-school');
        if (error) throw new Error(error);
        localStorage.setItem('naija-city-v6', JSON.stringify(city));
      });
      await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#settings', { timeout: 90000 });
      await page.click('[data-speed="0"]');
      await page.click('[data-category="services"]');
      await page.click('[data-service="education"]');
      await page.click('[data-service-focus="268"]');
      if (!(await page.locator('#panel-content').innerText()).includes('Base capacity')) throw new Error('Facility inspector missing');
      await page.click('#close-panel');
      if (mobile) await page.touchscreen.tap(width / 2, height / 2 + 16);
      else await page.mouse.click(width / 2, height / 2 + 16);
      if (!(await page.locator('#panel-title').innerText()).includes('Primary School')) throw new Error('Map facility inspection failed');
      await page.click('[data-category="services"]');
      await page.click('[data-service="healthcare"]');
      await page.click('[data-tool="phc"]');
      // Known isometric projection after the school inspector's camera focus.
      const zoom = mobile ? 2 : 2.2;
      const point = { x: width / 2 + 48 * zoom, y: height / 2 + 24 * zoom + 30 };
      if (mobile) {
        await page.touchscreen.tap(point.x, point.y);
        await page.waitForSelector('#commit:visible');
        if (!(await page.locator('#placement-description').innerText()).includes('residents in travel reach')) throw new Error('Touch service preview missing');
        await page.click('#commit');
      } else await page.mouse.click(point.x, point.y);
      await page.click('#explore');
      await page.click('#settings');
      await page.click('summary:has-text("Developer controls")');
      await page.click('[data-debug="month"]');
      await page.click('[data-action="save"]');
      const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('naija-city-v6')));
      const active = await read();
      if (active.publicServices.facilities.length !== 2) throw new Error('UI placement did not create the clinic');
      if (active.publicServices.employed <= 0 || active.publicServices.employed > active.publicServices.publicJobs) throw new Error('Facility workforce is invalid');
      const actualWorkers = active.tiles.reduce((n, t) => n + (t.building?.jobs ?? 0), 0) + active.publicServices.employed + active.living.informal.employed;
      if (actualWorkers !== active.employed || actualWorkers > active.workforce) throw new Error('UI progression created ghost workers');
      await page.click('[data-category="data"]');
      await page.click('[data-action="city-feed"]');
      if (!(await page.locator('#panel-content').innerText()).includes('Primary School')) throw new Error('Facility events missing from City Feed');
      await page.click('[data-category="services"]');
      await page.click('[data-service="education"]');
      await page.click('[data-service-focus="268"]');
      await page.click('[data-service-active]');
      if (!(await page.locator('#panel-content').innerText()).includes('inactive')) throw new Error('Suspension status missing');
      await page.click('#settings');
      await page.click('[data-action="save"]');
      const suspended = (await read()).publicServices.facilities.find(f => f.subtype === 'primary-school');
      if (suspended.active || suspended.employeesAvailable || suspended.effectiveCapacity) throw new Error('Suspended school kept staff or capacity');
      await page.click('[data-category="services"]');
      await page.click('[data-service="education"]');
      await page.click('[data-service-focus="268"]');
      await page.click('[data-service-active]');
      await page.screenshot({ path: path.join(out, `controls-${width}.png`) });
      await page.click('#settings');
      await page.click('[data-action="save"]');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#settings', { timeout: 90000 });
      const reopened = (await read()).publicServices.facilities.find(f => f.subtype === 'primary-school');
      if (!reopened.active || reopened.tiles[0] !== 268) throw new Error('Reopened facility did not survive reload');
      report.scenarios.push({ width, height, touchPlacement: mobile, facilities: active.publicServices.facilities.length, publicStaff: active.publicServices.employed, workforce: active.workforce, suspendedStaff: suspended.employeesAvailable, reopened: reopened.active });
      console.log(JSON.stringify(report.scenarios.at(-1)));
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(String(e)));
    await page.goto('http://localhost:5173/public-service-check.html');
    await page.waitForFunction(() => window.publicQA?.snapshot().ready, {}, { timeout: 90000 });
    const original = await page.evaluate(async () => {
      const { createCity, TICK_MS } = await import('/shared/simulation/engine.ts');
      const city = createCity(Date.now() - 30 * TICK_MS);
      city.version = 5;
      delete city.publicServices;
      for (const t of city.tiles) { delete t.publicServices; delete t.publicFacility; }
      const raw = JSON.stringify(city);
      localStorage.setItem('naija-city-v5', raw);
      return raw;
    });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#settings', { timeout: 90000 });
    await page.waitForFunction(() => document.querySelector('#panel-title')?.textContent === 'Welcome back', {}, { timeout: 30000 }).catch(async error => {
      console.log({ title: await page.locator('#panel-title').innerText(), notice: await page.locator('#notice').innerText() });
      await page.screenshot({ path: path.join(out, 'migration-failure.png') });
      throw error;
    });
    await page.click('[data-speed="0"]');
    if ((await page.locator('#panel-title').textContent()) !== 'Welcome back') throw new Error('Migrated city offline report missing');
    const welcome = await page.locator('#panel-content').innerText();
    if (!welcome.includes('Quality of Life') || !welcome.includes('Waste backlog')) throw new Error('Offline service summary missing');
    await page.click('#settings');
    await page.click('[data-action="save"]');
    const migration = await page.evaluate(() => ({ old: localStorage.getItem('naija-city-v5'), city: JSON.parse(localStorage.getItem('naija-city-v6')) }));
    if (migration.old !== original || migration.city.version !== 6 || !migration.city.publicServices) throw new Error('Legacy save was not safely migrated');
    report.migration = { sourceVersion: 5, savedVersion: 6, originalRetained: true, offlineServiceSummary: true };
    console.log(JSON.stringify(report.migration));
    await context.close();
    if (report.errors.length) throw new Error(report.errors.join('\n'));
  } finally {
    fs.writeFileSync(path.join(out, 'controls.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
