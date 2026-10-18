const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HOME_TEST_CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
  await page.goto('http://127.0.0.1:8125/demo');await page.locator('.demo-multibank').waitFor();
  const untouched=await page.locator('#priorityBlock').innerHTML();
  assert.equal(await page.locator('[data-demo-global]').innerText(),'24 850,00 €');
  assert.equal(await page.locator('.demo-bank-movements li').count(),6);
  assert.equal(await page.locator('.demo-bank-pill.is-alert').count(),1);
  assert((await page.locator('.demo-bank-alert').innerText()).includes('1 000,00 €'));
  if(width===390)await page.locator('#homeTreasury').screenshot({path:process.env.HOME_PREVIEW_DIR+'/demo-multibanques-alerte.png'});
  await page.locator('[data-demo-bank="rivage"]').click();
  assert.equal(await page.locator('[data-demo-balance]').innerText(),'− 350,00 €');
  assert.equal(await page.locator('.demo-bank-movements li').count(),2);
  assert((await page.locator('.demo-bank-movements').innerText()).includes('Banque Rivage'));
  await page.locator('[data-demo-rebalance="rivage"]').click();
  assert.equal(await page.locator('[data-demo-balance]').innerText(),'+ 650,00 €');
  assert.equal(await page.locator('.demo-bank-pill.is-alert').count(),0);
  assert.equal(await page.locator('.demo-rebalance').count(),0);
  assert.equal(await page.locator('[data-demo-global]').innerText(),'24 850,00 €');
  assert((await page.locator('.demo-bank-status').innerText()).includes('Prélèvement couvert'));
  await page.locator('[data-demo-bank="horizon"]').click();
  assert.equal(await page.locator('[data-demo-balance]').innerText(),'+ 17 000,00 €');
  await page.locator('[data-demo-bank="all"]').click();
  assert.equal(await page.locator('.demo-bank-movements li').count(),8);
  assert.equal(await page.locator('#priorityBlock').innerHTML(),untouched);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  if(width===390)await page.locator('#homeTreasury').screenshot({path:process.env.HOME_PREVIEW_DIR+'/demo-multibanques.png'});
  await page.goto('http://127.0.0.1:8125/');assert.equal(await page.locator('script[src*="demo-treasury"]').count(),0);
  assert(await page.locator('#loginForm').isVisible());
  await page.close();
 }
 console.log('Multi-bank demo verified at 320/390/768px: filters, alerts, exact transfer, invariant totals, unchanged surrounding UI, no network writes or impact on main app.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
