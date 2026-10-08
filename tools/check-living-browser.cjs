// Isolated Chrome contexts; this never uses the user's browser profile or saves.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/omano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = path.resolve('.qa/living-city'); fs.mkdirSync(out, { recursive: true });
async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const report = { scenarios: [], ui: [], errors: [] };
  try {
    for (const [width, height, dpr, quality] of [[1440,900,1,'high'],[390,844,2,'medium'],[430,932,2,'medium'],[390,844,2,'low']]) {
      const context = await browser.newContext({ viewport: {width,height}, deviceScaleFactor: dpr, hasTouch: width<600, isMobile: width<600 });
      const page = await context.newPage(); page.on('pageerror',e=>report.errors.push(String(e)));
      await page.goto('http://localhost:5173/living-check.html',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.livingQA && document.querySelector('canvas'),{},{timeout:60000});
      await page.selectOption('#quality',quality);
      for (const population of [200,5000,50000,250000]) {
        await page.selectOption('#population',String(population));
        await page.waitForFunction(n=>window.livingQA.snapshot().population===n,population,{timeout:60000});
        await page.waitForTimeout(800); await page.click('#street'); await page.waitForTimeout(4500);
        const samples=[];
        for(let i=0;i<3;i++) { await page.waitForTimeout(1000); samples.push(await page.evaluate(()=> {const s=window.livingQA.snapshot();return {vehicles:s.vehicles,pedestrians:s.pedestrians,agents:s.agents,graphics:s.graphics,routes:s.routes,flows:s.activity.journeys.length};})); }
        const hourly={}; for(const hour of [8,17.5,2]) {await page.selectOption('#hour',String(hour)); await page.waitForTimeout(500); hourly[hour]=await page.evaluate(()=>{const s=window.livingQA.snapshot();return {vehicleActivity:s.activity.vehicleActivity,pedestrianActivity:s.activity.pedestrianActivity,vehicles:s.vehicles,pedestrians:s.pedestrians};});}
        await page.selectOption('#hour','13'); await page.click('#rain'); await page.waitForTimeout(650);
        const rain=await page.evaluate(()=>window.livingQA.snapshot().activity.pedestrianActivity);
        await page.click('#flood'); await page.waitForTimeout(650); await page.click('#dry'); await page.waitForTimeout(650);
        await page.click('#reload'); if(!/every simulation field/.test(await page.locator('#result').innerText())) throw new Error('Save round trip failed');
        report.scenarios.push({width,height,dpr,quality,population,samples,hourly,rain});
        console.log(JSON.stringify({width,quality,population,...samples.at(-1)}));
      }
      await page.selectOption('#population','5000'); await page.waitForFunction(()=>window.livingQA.snapshot().population===5000);
      await page.click('#street'); await page.selectOption('#hour','8'); await page.waitForTimeout(1500);
      const beforePower=await page.evaluate(()=>window.livingQA.snapshot().activity.commercialActivity);
      await page.click('#power'); const failedPower=await page.evaluate(()=>window.livingQA.snapshot().activity.commercialActivity);
      if(failedPower>=beforePower)throw new Error('Power failure did not reduce commercial activity');
      await page.click('#restore'); await page.click('#markets');
      if(!(await page.evaluate(()=>window.livingQA.snapshot().markets)))throw new Error('Sustained suitable market failed to emerge');
      await page.click('#photo'); await page.screenshot({path:path.join(out,`${width}-${quality}.png`)});
      await page.keyboard.press('Escape'); await page.click('#offline');
      await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('Offline replay'),{},{timeout:60000});
      if(!/identical/.test(await page.locator('#result').innerText())) throw new Error('Offline replay differs');
      await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await page.waitForSelector('#start',{timeout:90000}); await page.click('#start'); await page.click('[data-speed="0"]');
      const panels=[];
      for(const category of ['roads','zones','services','transport','economy','data']) {await page.click(`[data-category="${category}"]`);panels.push(await page.locator('#panel-title').innerText());await page.click('#close-panel');}
      await page.click('[data-category="data"]'); await page.click('[data-action="city-feed"]');
      await page.locator('[data-feed-tile]').first().click(); if(await page.locator('#panel').isVisible())throw new Error('Feed navigation did not close panel');
      await page.click('#settings'); await page.click('[data-action="save"]');
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-city-v6')).version); if(saved!==6)throw new Error('Wrong save version');
      await page.reload(); await page.waitForSelector('#settings'); await page.click('#settings'); await page.click('[data-action="load"]'); await page.waitForTimeout(500);
      const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,canvas:!!document.querySelector('canvas'),hud:document.querySelector('.hud').getBoundingClientRect().toJSON(),toolbar:document.querySelector('.toolbar').getBoundingClientRect().toJSON()}));
      if(layout.width>width || !layout.canvas)throw new Error('Viewport overflow or absent canvas');
      report.ui.push({width,height,panels,layout,saveVersion:saved}); await context.close();
    }
  } finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)); await browser.close();}
  if(report.errors.length)throw new Error(report.errors.join('\n'));
  console.log('PASS: living fixtures, hourly rhythms, weather, saves, offline replay and responsive game panels.');
}
run().catch(e=> {console.error(e);process.exitCode=1;});
