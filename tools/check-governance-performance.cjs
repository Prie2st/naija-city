const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/omano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function run(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const report=[];
  try{for(const [width,height,quality] of [[1440,900,'high'],[390,844,'medium'],[430,932,'low']]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<600?2:1,isMobile:width<600,hasTouch:width<600}),page=await context.newPage();
    await page.goto('http://localhost:5173/');await page.waitForSelector('#settings',{timeout:90000});if(await page.locator('#intro').evaluate(d=>d.open))await page.click('#start');await page.click('[data-speed="0"]');
    await page.click('#settings');await page.locator('#graphics-quality').selectOption(quality);
    await page.click('[data-governance-tab="Overview"]');await page.click('[data-governance-tab="Development"]');await page.click('[data-overlay="environment"]');await page.click('#close-panel');
    await page.waitForTimeout(2000);await page.click('#settings');await page.click('summary:has-text("Developer controls")');await page.click('[data-action="graphics-count"] >> nth=0');
    report.push({width,height,quality,diagnostics:await page.locator('#notice').innerText()});await context.close();
  }}finally{await browser.close();fs.mkdirSync('.qa/governance',{recursive:true});fs.writeFileSync(path.resolve('.qa/governance/rendering.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
