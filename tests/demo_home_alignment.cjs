const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HOME_TEST_CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.addInitScript(()=>{try{if(!localStorage.getItem('aia-reader'))localStorage.setItem('aia-reader','off');if(!localStorage.getItem('aia-pages'))localStorage.setItem('aia-pages','off');}catch(e){}}); // classic action cards and grid (mode lecteur: tests/reader.cjs, accueil iPhone: tests/pages.cjs)
  await page.goto('http://127.0.0.1:8125/demo');await page.locator('.module-grid').waitFor();
  for(const selector of ['.assistant-dock','.assistant-dock-hint','.module-copy']){
   assert.equal(await page.locator(selector).first().evaluate(e=>getComputedStyle(e).textAlign),'center',selector);
  }
  for(const selector of ['.home-section-title','.priority-tile','.priority-description'])assert.equal(await page.locator(selector).first().evaluate(e=>getComputedStyle(e).textAlign),'left',selector);
  assert.equal(await page.locator('.assistant-dock').evaluate(e=>getComputedStyle(e).justifyContent),'center');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width===390)await page.screenshot({path:process.env.HOME_PREVIEW_DIR+'/demo-accueil-centre.png',fullPage:true});
  await page.locator('#assistantDock').click();await page.locator('#contextPanel').waitFor();
  assert(await page.locator('#assistantMessage').isVisible());
  await page.close();
 }
 console.log('Demo home centered at 320/390/768px; no overflow; assistant panel still opens.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
