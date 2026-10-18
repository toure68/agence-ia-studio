const assert=require('node:assert/strict'),{chromium}=require('playwright');
const amount=text=>Math.round(Number(text.replace(/[^\d,−-]/g,'').replace('−','-').replace(',','.'))*100);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HOME_TEST_CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [320,390,768]){
  const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:true}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
  await page.goto('http://127.0.0.1:8125/demo');await page.locator('.demo-multibank').waitFor();
  const untouched=await page.locator('#priorityBlock').innerHTML();
  const read=async()=>Object.fromEntries(await Promise.all(['balance','incoming','outgoing'].map(async key=>[key,amount(await page.locator(`[data-demo-${key}]`).innerText())])));
  const global=await read();assert.deepEqual(global,{balance:2485000,incoming:2920000,outgoing:435000});
  assert.equal(await page.locator('[data-demo-bank="all"]').getAttribute('aria-pressed'),'true');
  assert(await page.locator('.demo-bank-detail').isHidden());
  assert.equal(await page.locator('.demo-global-alert').count(),1);
  assert((await page.locator('.demo-global-alert').innerText()).includes('− 350,00 €'));
  assert.equal(await page.locator('.demo-bank-dot:visible').count(),1);
  assert.equal(await page.locator('[data-demo-bank="atlas"]').innerText(),'A');
  for(const pill of await page.locator('.demo-bank-pill').all()){
   const box=await pill.boundingBox();assert.equal(box.width,44);assert.equal(box.height,44);assert(await pill.getAttribute('aria-label'));
  }
  assert.equal(await page.locator('.demo-multibank').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  if(width===390)await page.locator('#homeTreasury').screenshot({path:process.env.HOME_PREVIEW_DIR+'/demo-tresorerie-logos.png'});
  const sums={balance:0,incoming:0,outgoing:0};
  for(const id of ['horizon','rivage','atlas']){
   await page.locator(`[data-demo-bank="${id}"]`).click();
   const values=await read();for(const k in sums)sums[k]+=values[k];
   assert((await page.locator('[data-demo-name]').innerText()).toLowerCase().includes(id));
   assert.equal(await page.locator('.demo-bank-dot:visible').count(),1);
   if(id==='rivage'){
    assert.equal(values.balance,-35000);assert(await page.locator('[data-demo-balance]').evaluate(e=>e.classList.contains('demo-negative')));
    assert(await page.locator('.demo-bank-alert').isVisible());assert((await page.locator('.demo-bank-alert').innerText()).includes('1 000,00 €'));
    if(width===390)await page.locator('#homeTreasury').screenshot({path:process.env.HOME_PREVIEW_DIR+'/demo-tresorerie-logos-alerte.png'});
   }else{
    assert.equal(await page.locator('[data-demo-movement]').count(),5);
    assert.equal(await page.locator('[data-demo-movement] time').count(),5);
    assert(await page.locator('[data-demo-all-transactions]').isVisible());
    const dates=await page.locator('[data-demo-movement] time').evaluateAll(es=>es.map(e=>e.dateTime));assert.deepEqual(dates,[...dates].sort().reverse());
    if(id==='horizon'){
     await page.locator('[data-demo-all-transactions]').click();await page.locator('.demo-transactions').waitFor({state:'visible'});
     assert.equal(await page.locator('.demo-transactions [data-demo-movement]').count(),5);await page.locator('#closeModal').click();
    }
   }
   await page.locator(`[data-demo-bank="${id}"]`).click();assert.equal(await page.locator('[data-demo-bank="all"]').getAttribute('aria-pressed'),'true');
  }
  assert.deepEqual(sums,global);
  await page.locator('.demo-global-alert').click();assert.equal(await page.locator('[data-demo-bank="rivage"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-demo-rebalance="rivage"]').click();assert.equal((await read()).balance,65000);
  assert.equal(await page.locator('.demo-bank-dot:visible').count(),0);assert.equal(await page.locator('.demo-bank-alert').count(),0);
  assert((await page.locator('.demo-bank-status').innerText()).includes('virement simulé'));
  await page.locator('[data-demo-all-transactions]').click();assert.equal(await page.locator('.demo-transactions [data-demo-movement]').count(),6);await page.locator('#closeModal').click();
  await page.locator('[data-demo-bank="all"]').click();assert.deepEqual(await read(),global);assert.equal(await page.locator('.demo-global-alert').count(),0);
  assert.equal(await page.locator('#priorityBlock').innerHTML(),untouched);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  await page.reload();await page.locator('.demo-multibank').waitFor();assert.equal(await page.locator('[data-demo-bank="all"]').getAttribute('aria-pressed'),'true');
  await page.goto('http://127.0.0.1:8125/');assert.equal(await page.locator('script[src*="demo-treasury"]').count(),0);assert(await page.locator('#loginForm').isVisible());await page.close();
 }
 // Adding/reordering banks requires configuration changes only; overflow stays inside the row.
 const extra=await browser.newPage({viewport:{width:320,height:844}});
 await extra.route('**/static/demo-treasury.js*',async route=>{
  const response=await route.fetch(),body=await response.text();
  await route.fulfill({response,body:body.replace("let selected='all'", "banks.reverse();banks.push(...Array.from({length:8},(_,i)=>({...banks[0],id:'extra'+i,name:'Banque Exemple '+i,logo:null})));let selected='all'")});
 });
 await extra.goto('http://127.0.0.1:8125/demo');await extra.locator('.demo-multibank').waitFor();
 assert.equal(await extra.locator('[data-demo-bank]').count(),12);
 assert(await extra.locator('.demo-bank-pills').evaluate(e=>e.scrollWidth>e.clientWidth));
 await extra.locator('[data-demo-bank="extra7"]').click();assert.equal(await extra.locator('[data-demo-name]').innerText(),'Exemple 7');
 assert(await extra.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await extra.close();
 console.log('Logo treasury verified at 320/390/768px: global sum equals all banks, monthly scoped flows, 44px logos/fallback, persistent alerts, 5 dated transactions and full history, toggle/reset, simulated transfer only, scoped white/green theme; bank configuration addition/reorder and horizontal overflow verified.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
