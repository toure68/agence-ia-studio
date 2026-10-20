'use strict';
// Public demo: the same treasury dial as the real app, fed by synthetic banks; read-only, simulated transfer.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const amount=text=>Math.round(Number(text.replace(/[^\d,−-]/g,'').replace('−','-').replace(',','.'))*100);
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const base=process.env.DEMO_BASE_URL||'http://127.0.0.1:8123';
 try{
  for(const width of [320,390,768]){
   const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),errors=[],writes=[];await page.addInitScript(()=>{try{if(!sessionStorage.getItem('fold-test'))localStorage.setItem('aia-treasury-open','1')}catch(e){}});
   await page.addInitScript(()=>{try{if(!localStorage.getItem('aia-reader'))localStorage.setItem('aia-reader','off');}catch(e){}}); // classic action cards (mode lecteur: tests/reader.cjs)
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
   await page.goto(base+'/demo');await page.locator('#homeTreasury .bank-dial').waitFor();
   const read=async()=>({balance:amount(await page.locator('#homeTreasury .bank-total').innerText()),flows:await page.locator('#homeTreasury .dial-flows').innerText()});
   assert.equal((await read()).balance,2485000);
   assert.equal(await page.locator('[data-bank-pill="all"].bank-pill').getAttribute('aria-pressed'),'true');
   assert((await page.locator('.bank-global-alert').innerText()).includes('Rivage'));
   assert.equal(await page.locator('.bank-pill-dot').count(),1);
   assert.equal(await page.locator('.dial-row').count(),3);
   const height=await page.locator('#homeTreasury .bank-dial').evaluate(e=>Math.round(e.getBoundingClientRect().height));
   for(const id of ['horizon','rivage','atlas']){
    await page.locator(`.bank-pill[data-bank-pill="${id}"]`).click();
    assert.equal(await page.locator('#homeTreasury .bank-dial').getAttribute('data-bank-selected'),id);
    assert(Math.abs(await page.locator('#homeTreasury .bank-dial').evaluate(e=>e.getBoundingClientRect().height)-height)<=1,'Same card size for '+id);
    if(id==='rivage'){assert((await page.locator('.bank-home-alert').innerText()).includes('1 000,00'));assert(await page.locator('.bank-total.bank-negative').isVisible());}
    else assert.equal(await page.locator('.dial-row').count(),3);
    await page.locator(`.bank-pill[data-bank-pill="${id}"]`).click();
   }
   await page.locator('.bank-global-alert').click();await page.locator('.bank-fund').click();
   assert.equal((await read()).balance,65000);assert.equal(await page.locator('.bank-pill-dot').count(),0);
   await page.locator('[data-bank-all]').click();await page.locator('.demo-transactions').waitFor();assert.equal(await page.locator('.demo-transactions [data-demo-movement]').count(),6);await page.locator('#closeModal').click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
   // Assistant IA bar at the very top with the account button (user request 2026-10-20), inside the screen;
   // nothing overflows sideways with the grid chooser (opened from the réglages) or a function open.
   const row=await page.evaluate(()=>{const a=document.querySelector('#assistantDock')?.getBoundingClientRect(),m=document.querySelector('.home-account-slot .account-menu')?.getBoundingClientRect(),t=document.querySelector('#homeTreasury')?.getBoundingClientRect();return a&&m&&t?{same:Math.abs((a.top+a.bottom)/2-(m.top+m.bottom)/2)<4,inside:a.left>=0&&m.right<=innerWidth+0.5,above:a.bottom<=t.top}:null;});
   assert(row&&row.same&&row.inside&&row.above,'Assistant and account on one top row, above the treasury '+JSON.stringify(row));
   await page.locator('.account-menu summary').click();await page.locator('#accountGrid').click();await page.locator('#homeColumnChooser').waitFor({state:'visible'});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways overflow with the chooser open');
   await page.keyboard.press('Escape');
   await page.locator('#content .module-grid .module-tile').first().click();await page.waitForFunction(()=>document.querySelector('#moduleFocus')||document.querySelector('#contextPanel')||document.querySelector('#modalLayer:not(.hide) .modal'));await page.waitForTimeout(300);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways overflow with a function open');
   assert.match(await page.locator('meta[name=viewport]').getAttribute('content'),/maximum-scale=1/,'No zoom on field focus');
   await page.close();
  }
  console.log('Demo treasury dial: synthetic banks, header alert, constant size, simulated transfer, read-only.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
