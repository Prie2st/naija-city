const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/omano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function run(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const report=[];
  try{for(const [population,width,height,quality] of [[100000,1440,900,'high'],[500000,390,844,'medium'],[500000,430,932,'low']]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<600?2:1,isMobile:width<600,hasTouch:width<600}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('http://localhost:5173/public-service-check.html');await page.waitForFunction(()=>window.publicQA?.snapshot().ready,{},{timeout:120000});
    await page.locator('#quality').selectOption(quality);await page.locator('#population').selectOption(String(population));await page.waitForTimeout(4000);
    const city=await page.evaluate(()=>window.publicQA.snapshot());await page.click('#hospital');await page.waitForTimeout(4000);const block=await page.evaluate(()=>window.publicQA.snapshot());
    fs.mkdirSync('.qa/safety',{recursive:true});await page.screenshot({path:path.resolve(`.qa/safety/dense-${population}-${width}.png`)});
    if(city.population!==population||errors.length)throw Error(`Dense fixture failed: ${errors.join('; ')}`);
    report.push({population,width,height,quality,city:city.graphics,block:block.graphics,vehicles:block.vehicles,pedestrians:block.pedestrians,errors});await context.close();
  }}finally{await browser.close();fs.writeFileSync(path.resolve('.qa/safety/dense-rendering.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
