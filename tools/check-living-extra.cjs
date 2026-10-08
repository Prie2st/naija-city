const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/omano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const report={scenarios:[],migration:null,errors:[]};
  try{
    const cases=[[390,844,'medium',250000],[430,932,'medium',50000],[390,844,'low',250000],[1440,900,'high',250000],[768,1024,'medium',5000]];
    for(const [width,height,quality,population] of (process.env.LIVING_MIGRATION_ONLY?cases.filter(c=>c[0]===768):cases)){
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,hasTouch:width<1000,isMobile:width<600});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
      await page.goto('http://localhost:5173/living-check.html',{waitUntil:'domcontentloaded'});await page.waitForSelector('#population',{timeout:90000});await page.selectOption('#quality',quality);await page.selectOption('#population',String(population));
      await page.waitForFunction(n=>window.livingQA.snapshot().population===n,population,{timeout:60000});await page.waitForTimeout(800);await page.click('#street');await page.waitForTimeout(6000);
      const samples=[];for(let n=0;n<5;n++){await page.waitForTimeout(500);samples.push(await page.evaluate(()=>{const s=window.livingQA.snapshot();return {agents:s.agents,graphics:s.graphics};}));}
      if(!samples.some(s=>s.agents.vehicles>0))throw new Error('No vehicles on an active street');report.scenarios.push({width,height,quality,population,samples});console.log(JSON.stringify({width,quality,population,...samples.at(-1)}));
      if(population===5000){await page.click('#bus');await page.waitForTimeout(2500);const s=await page.evaluate(()=>window.livingQA.snapshot());if(!(s.agents.modes.bus>0))throw new Error('Actual bus route has no representative bus');report.scenarios.at(-1).bus=s.agents;}
      if(width===768){
        const legacy=await page.evaluate(async()=>{const {createCity,TICK_MS}=await import('/shared/simulation/engine.ts');const old=createCity(Date.now()-30*TICK_MS);old.version=4;delete old.living;old.tiles.forEach(t=>{if(t.building){delete t.building.tenure;delete t.building.integrationProgress;if(t.building.business)for(const k of ['lossDays','closedAt','reopenProgress','generation'])delete t.building.business[k];}});return JSON.stringify(old);});
        // Seed before the game starts. Seeding an active game then reloading would
        // correctly trigger pagehide autosave and overwrite this test fixture.
        await page.addInitScript(raw=>{localStorage.clear();localStorage.setItem('naija-city-v4',raw);sessionStorage.setItem('original-v4',raw);},legacy);
        await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#settings',{timeout:90000});await page.waitForFunction(()=>!document.querySelector('.offline-progress'),{},{timeout:90000});const body=await page.locator('body').innerText();if(!/Welcome back/i.test(body)||!body.includes('Jobs'))throw new Error('Missing offline return summary: '+body.slice(-1500));
        await page.click('#close-panel');await page.click('#settings');await page.click('[data-action="save"]');report.migration=await page.evaluate(()=>({version:JSON.parse(localStorage.getItem('naija-city-v5')).version,originalPreserved:localStorage.getItem('naija-city-v4')===sessionStorage.getItem('original-v4'),overflow:document.documentElement.scrollWidth>innerWidth}));
        if(report.migration.version!==5||!report.migration.originalPreserved||report.migration.overflow)throw new Error('Migration/storage/layout regression');await page.screenshot({path:'.qa/living-city/tablet-save.png'});
      }
      await context.close();
    }
  }finally{fs.writeFileSync('.qa/living-city/extra-report.json',JSON.stringify(report,null,2));await browser.close();}
  if(report.errors.length)throw new Error(report.errors.join('\n'));console.log('PASS: clipped streets, agent pools, actual buses, tablet, v4 migration, originals retained, offline report.');
})().catch(e=>{console.error(e);process.exitCode=1;});
