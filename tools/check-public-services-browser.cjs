// Isolated headless Chrome contexts. No user profile or player storage is used.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/omano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('.qa/public-services');fs.mkdirSync(out,{recursive:true});
async function run(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const report={scenarios:[],ui:[],errors:[]};
  try{
    for(const [width,height,dpr,quality] of [[1440,900,1,'high'],[1024,768,2,'medium'],[390,844,2,'medium'],[430,932,2,'medium'],[390,844,2,'low']]){
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<600,hasTouch:width<600});
      const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
      await page.goto('http://localhost:5173/public-service-check.html',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.publicQA&&document.querySelector('canvas')&&window.publicQA.snapshot().ready,{},{timeout:90000});
      await page.selectOption('#quality',quality);
      for(const population of [1000,10000,100000,500000]){
        await page.selectOption('#population',String(population));
        await page.waitForFunction(n=>window.publicQA.snapshot().population===n,population,{timeout:90000});
        await page.click('#school');await page.waitForTimeout(3000);
        const samples=[];for(let i=0;i<3;i++){await page.waitForTimeout(1000);samples.push(await page.evaluate(()=>{const s=window.publicQA.snapshot();return {graphics:s.graphics,vehicles:s.vehicles,pedestrians:s.pedestrians,cache:s.cache,schoolDemand:s.services.stats.education.demand,schoolServed:s.services.stats.education.served};}));}
        await page.click('#reload');if(!/every field preserved/.test(await page.locator('#result').innerText()))throw new Error('Service save round trip failed');
        report.scenarios.push({width,height,dpr,quality,population,samples});console.log(JSON.stringify({width,quality,population,...samples.at(-1)}));
      }
      await page.selectOption('#population','10000');await page.waitForFunction(()=>window.publicQA.snapshot().population===10000);
      const before=await page.evaluate(()=>window.publicQA.snapshot().services.facilities.find(f=>f.subtype==='hospital').effectiveCapacity);
      await page.click('#utilities');const failed=await page.evaluate(()=>window.publicQA.snapshot().services.facilities.find(f=>f.subtype==='hospital').effectiveCapacity);
      if(failed>=before)throw new Error('Utilities did not reduce hospital capacity');await page.click('#restore');
      await page.click('#waste');await page.click('#fire');await page.waitForTimeout(1000);await page.click('#photo');await page.screenshot({path:path.join(out,`${width}-${quality}.png`)});await page.keyboard.press('Escape');
      await page.click('#offline');await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('Offline replay'),{},{timeout:90000});if(!/identical/.test(await page.locator('#result').innerText()))throw new Error('Offline service replay differs');
      await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#start',{timeout:90000});await page.click('#start');await page.click('[data-speed="0"]');
      const categories=[];await page.click('[data-category="services"]');
      for(const group of ['education','healthcare','fire','waste','parks','power','water','drainage']){await page.click(`[data-service="${group}"]`);categories.push({group,tools:await page.locator('[data-tool]').count()});}
      await page.click('[data-service="education"]');await page.selectOption('[data-public-budget="education"]','75');await page.click('[data-tool="primary-school"]');
      if(!(await page.locator('#placement').isVisible()))throw new Error('Service build mode missing');await page.click('#explore');
      await page.click('[data-category="data"]');const overlays=[];for(const o of ['education','healthcare','fire','waste','parks','quality-of-life']){await page.click(`[data-overlay="${o}"]`);overlays.push(await page.locator('#overlay-name').innerText());}
      await page.click('#close-panel');await page.click('#settings');await page.click('[data-action="save"]');
      const version=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-city-v6')).version);if(version!==6)throw new Error('Wrong save version');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw new Error('Horizontal UI overflow');
      report.ui.push({width,height,dpr,quality,categories,overlays,saveVersion:version,utilityCapacityBefore:before,utilityCapacityFailed:failed});await context.close();
    }
    if(report.errors.length)throw new Error(report.errors.join('\n'));
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
