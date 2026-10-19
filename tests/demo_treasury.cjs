'use strict';
// Public demo: the same treasury dial as the real app, fed by synthetic banks; read-only, simulated transfer.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const amount=text=>Math.round(Number(text.replace(/[^\d,−-]/g,'').replace('−','-').replace(',','.'))*100);
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const base=process.env.DEMO_BASE_URL||'http://127.0.0.1:8123';
 try{
  for(const width of [320,390,768]){
   const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),errors=[],writes=[];
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
   // Browser behaves like the installed app: assistant and grid button share one row inside the screen,
   // nothing overflows sideways with the chooser or a function open, and fields never trigger iOS zoom.
   const row=await page.evaluate(()=>{const a=document.querySelector('#assistantDock')?.getBoundingClientRect(),g=document.querySelector('[data-columns-toggle]')?.getBoundingClientRect();return a&&g?{same:Math.abs(a.top-g.top)<4,inside:a.left>=0&&g.right<=innerWidth+0.5,assistantFirst:a.left<g.left}:null;});
   if(row)assert(row.same&&row.inside&&row.assistantFirst,'Assistant then grid button on one row, inside the screen '+JSON.stringify(row));
   await page.locator('[data-columns-toggle]').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways overflow with the chooser open');
   await page.locator('[data-columns-toggle]').click();
   await page.locator('#content .module-grid .module-tile').first().click();await page.locator('#moduleFocus').waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways overflow with a function open');
   assert.match(await page.locator('meta[name=viewport]').getAttribute('content'),/maximum-scale=1/,'No zoom on field focus');
   await page.close();
  }
  console.log('Demo treasury dial: synthetic banks, header alert, constant size, simulated transfer, read-only.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
