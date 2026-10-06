const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/omano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function run(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const out=path.resolve('.qa/safety');fs.mkdirSync(out,{recursive:true});const report={views:[],errors:[],performance:[]};
  try{
    for(const [width,height,dpr,quality] of [[1440,900,1,'high'],[768,1024,2,'medium'],[390,844,2,'medium'],[430,932,2,'low']]){
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<600,hasTouch:width<1000}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
      await page.goto('http://localhost:5173/public-service-check.html');await page.waitForFunction(()=>window.publicQA?.snapshot().ready,{},{timeout:120000});
      await page.evaluate(async()=>{
        const {createCity}=await import('/shared/simulation/engine.ts');const {makeFacility,updatePublicServices}=await import('/shared/simulation/public-services.ts');const {updateSafety,triggerSafetyIncident}=await import('/shared/simulation/safety.ts');
        const c=createCity(Date.now());for(const t of c.tiles){t.services.powerReliability=95;t.services.waterReliability=95;t.services.floodDepth=0;}
        const f=makeFacility(c,8*32+12,'police-station');f.employeesAvailable=f.employeesRequired;c.publicServices.facilities.push(f);for(const id of f.tiles)c.tiles[id].publicFacility=f.id;c.publicServices.revision++;
        updatePublicServices(c,false);updateSafety(c,false);triggerSafetyIncident(c,10*32+12,'serious');updateSafety(c,false);localStorage.clear();localStorage.setItem('naija-city-v8',JSON.stringify(c));
      });
      await page.goto('http://localhost:5173/');await page.waitForSelector('#settings',{timeout:120000});if(await page.locator('#intro').evaluate(d=>d.open))await page.click('#start');await page.click('[data-speed="0"]');
      await page.click('#settings');await page.locator('#graphics-quality').selectOption(quality);await page.click('[data-governance-tab="Overview"]');await page.click('[data-governance-tab="Safety"]');
      if(!(await page.locator('#panel-content').innerText()).includes('Structural crime pressure'))throw Error('Safety governance panel missing');
      await page.screenshot({path:path.join(out,`${width}-governance.png`)});
      await page.click('[data-service="police"]');await page.locator('[data-public-budget="police"]').selectOption('125');
      if(await page.locator('[data-tool="police-post"]').count()!==1)throw Error('Police placement tool missing');
      await page.screenshot({path:path.join(out,`${width}-police.png`)});
      await page.click('[data-category="data"]');
      for(const overlay of ['public-safety','crime-pressure','police','night-safety','lighting','police-capacity','police-access','response-time']){await page.locator(`[data-overlay="${overlay}"]`).first().click();if(await page.locator('#overlay-name').innerText()!==overlay.replaceAll('-',' '))throw Error('Overlay did not activate');}
      await page.locator('[data-safety-focus]').first().click();if(!(await page.locator('#panel-content').innerText()).includes('Reported'))throw Error('Incident inspector did not open');
      await page.screenshot({path:path.join(out,`${width}-incident.png`)});
      await page.click('#close-panel');await page.click('#pulse-chip');await page.locator('[data-pulse^="safety-"]').first().click();
      await page.click('#settings');await page.click('summary:has-text("Developer controls")');await page.locator('[data-action="graphics-count"]').first().click();const diagnostics=await page.locator('#notice').innerText();
      await page.click('[data-action="save"]');const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-city-v8')));if(saved.publicServices.funding.police!==125)throw Error('Police funding did not persist');
      await page.reload();await page.waitForSelector('#settings',{timeout:120000});await page.click('[data-speed="0"]');
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvas:{width:document.querySelector('canvas').width,height:document.querySelector('canvas').height}}));if(layout.overflow)throw Error('Horizontal overflow');
      await page.screenshot({path:path.join(out,`${width}-world.png`)});report.views.push({width,height,dpr,quality,layout,diagnostics,version:saved.version});await context.close();
    }
    const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto('http://localhost:5173/public-service-check.html');await page.waitForFunction(()=>window.publicQA?.snapshot().ready,{},{timeout:120000});
    report.performance=await page.evaluate(async()=>{
      const {publicServiceFixture}=await import('/shared/simulation/public-service-fixtures.ts');const {initializeSafety,updateSafety,triggerSafetyIncident}=await import('/shared/simulation/safety.ts');const {advance,applyTool}=await import('/shared/simulation/engine.ts');const {makeFacility,updatePublicServices}=await import('/shared/simulation/public-services.ts');
      const results=[];for(const population of [100000,500000]){const c=publicServiceFixture(population);for(const t of c.tiles)t.services.powerReliability=90;
        for(const id of c.publicServices.facilities.filter(f=>['primary-school','phc','pocket-park'].includes(f.subtype)).map(f=>f.location)){applyTool(c,id%32,Math.floor(id/32),'bulldoze');applyTool(c,id%32,Math.floor(id/32),'police-station');const f=c.publicServices.facilities.find(f=>f.location===id);if(f)f.employeesAvailable=f.employeesRequired;}
        c.publicServices.revision++;updatePublicServices(c,false);initializeSafety(c);const initial=c.population;
        let start=performance.now();for(let i=0;i<30;i++){c.tick++;updateSafety(c);}const safetyMs=(performance.now()-start)/30;
        start=performance.now();advance(c,30);results.push({population:initial,finalPopulation:c.population,safetyMsPerDay:safetyMs,fullMsPerDay:(performance.now()-start)/30,localCount:c.safety.local.length,incidents:c.safety.incidents.length,facilities:c.safety.facilities.length,saveBytes:JSON.stringify(c).length});}
      return results;
    });
    const old=await page.evaluate(async()=>{const {createCity,TICK_MS}=await import('/shared/simulation/engine.ts');const c=createCity(Date.now()-40*TICK_MS);c.version=7;delete c.safety;delete c.publicServices.funding.police;delete c.publicServices.costs.police;delete c.publicServices.stats.police;for(const t of c.tiles)delete t.publicServices.police;for(const l of c.governance.local)for(const k of ['lighting','prevention','commercialPatrol','hubSafety'])delete l.effects[k];localStorage.clear();const raw=JSON.stringify(c);localStorage.setItem('naija-city-v7',raw);return raw;});
    await page.goto('http://localhost:5173/');await page.waitForSelector('#settings',{timeout:120000});await page.click('[data-speed="0"]');await page.click('#settings');await page.click('[data-action="save"]');const migration=await page.evaluate(()=>({old:localStorage.getItem('naija-city-v7'),current:JSON.parse(localStorage.getItem('naija-city-v8'))}));if(migration.old!==old||migration.current.version!==8||migration.current.tick<40)throw Error('M6 save migration/offline failed');report.migration={version:8,ticks:migration.current.tick,oldRetained:true};await context.close();
    if(report.errors.length)throw Error(report.errors.join('\n'));
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
