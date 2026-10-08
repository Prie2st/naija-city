// Isolated browser contexts: never reads or changes the player's local save.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/omano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('.qa/governance');fs.mkdirSync(out,{recursive:true});
async function run(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const report=process.argv.includes('--migration-only')?JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8')):{views:[],errors:[]};
  try{
    for(const [width,height,dpr] of (process.argv.includes('--migration-only')?[]:[[1440,900,1],[768,1024,2],[390,844,2],[430,932,2]])){
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<600,hasTouch:width<600}),page=await context.newPage();
      page.on('pageerror',e=>report.errors.push(String(e)));
      await page.goto('http://localhost:5173/');await page.waitForSelector('#settings',{timeout:90000});
      await page.evaluate(async()=>{const {createCity}=await import('/shared/simulation/engine.ts');localStorage.setItem('naija-city-v7',JSON.stringify(createCity()));});
      await page.reload();await page.waitForSelector('#settings',{timeout:90000});await page.click('[data-speed="0"]');
      await page.click('[data-category="economy"]');await page.click('[data-governance-tab="Overview"]');
      for(const tab of ['Overview','Budget','Taxes','Policies','Districts','Housing','Development']){await page.click(`[data-governance-tab="${tab}"]`);if(!(await page.locator('#panel-title').innerText()).toLowerCase().includes('governance'))throw Error('Governance title missing');await page.screenshot({path:path.join(out,`${width}-${tab}.png`)});}
      await page.click('[data-governance-tab="Districts"]');await page.click('[data-district-draw]');
      const tap=async(x,y)=>width<600?page.touchscreen.tap(x,y):page.mouse.click(x,y);
      await tap(width/2-20,height/2-40);await tap(width/2+20,height/2+40);
      await page.waitForSelector('#commit:visible');await page.click('#commit');
      await page.locator('[data-district-name]').fill('Unity Planning Area');await page.click('#panel-title');
      await page.click('[data-adopt] >> nth=0');
      await page.click('[data-governance-tab="Taxes"]');await page.locator('[data-tax="residential"]').fill('.5');await page.click('#panel-title');
      await page.click('[data-governance-tab="Policies"]');await page.locator('[data-policy-district]').selectOption('');await page.click('[data-policy="affordable"]');
      await page.click('#settings');await page.click('summary:has-text("Developer controls")');await page.click('[data-debug="month"]');
      await page.click('[data-action="save"]');
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-city-v7')));
      if(saved.governance.districts.length<2||!saved.governance.districts.some(d=>d.name==='Unity Planning Area'))throw Error('District drawing/adoption/rename did not persist');
      if(saved.governance.taxes.target.residential!==.5||saved.governance.taxes.effective.residential<=.25)throw Error('Tax target failed to phase in');
      if(!saved.governance.policies.some(p=>p.id==='affordable'&&p.strength>0))throw Error('Policy did not activate');
      await page.click('[data-governance-tab="Overview"]');await page.click('[data-governance-tab="Development"]');await page.click('[data-overlay="affordability"]');
      if(!(await page.locator('#overlay-name').innerText()).includes('affordability'))throw Error('Governance overlay missing');
      await page.click('#close-panel');await page.click('#clear-overlay');
      const performance=await page.evaluate(async()=>{const {advance}=await import('/shared/simulation/engine.ts');const c=JSON.parse(localStorage.getItem('naija-city-v7'));const t=performance.now();advance(c,30);return {msPerDay:(performance.now()-t)/30,saveBytes:JSON.stringify(c).length};});
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvas:{width:document.querySelector('canvas').width,height:document.querySelector('canvas').height}}));
      if(layout.overflow)throw Error('Horizontal page overflow');
      await page.screenshot({path:path.join(out,`${width}-world.png`)});
      report.views.push({width,height,dpr,districts:saved.governance.districts.length,tax:saved.governance.taxes.effective.residential,policy:saved.governance.policies[0].strength,layout,...performance});await context.close();
    }
    const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
    await page.goto('http://localhost:5173/public-service-check.html');await page.waitForFunction(()=>window.publicQA?.snapshot().ready,{},{timeout:90000});
    const old=await page.evaluate(async()=>{const {createCity,TICK_MS}=await import('/shared/simulation/engine.ts');const c=createCity(Date.now()-40*TICK_MS);c.version=6;delete c.governance;const raw=JSON.stringify(c);localStorage.clear();localStorage.setItem('naija-city-v6',raw);return raw;});
    await page.goto('http://localhost:5173/');await page.waitForSelector('#settings',{timeout:90000});await page.click('[data-speed="0"]');await page.click('#settings');await page.click('[data-action="save"]');
    const migration=await page.evaluate(()=>({old:localStorage.getItem('naija-city-v6'),current:JSON.parse(localStorage.getItem('naija-city-v7'))}));
    if(migration.old!==old||migration.current.version!==7||migration.current.tick<40)throw Error('v6 migration/offline replay failed');
    report.migration={version:migration.current.version,tick:migration.current.tick,oldRetained:true};await context.close();
    if(report.errors.length)throw Error(report.errors.join('\n'));
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
