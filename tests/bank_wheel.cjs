const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HOME_TEST_CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8125');await page.locator('#loginEmail').fill('Mohamed@preview.test');await page.locator('#loginPassword').fill('local-ui-smoke-test-only');await page.locator('#loginForm button').click();await page.locator('#homeTreasury .bank-wheel').waitFor();
 assert.equal(await page.evaluate(async()=>(await api('/api/companies/1/banks')).banks.length),0);
 const home=page.locator('#homeTreasury');
 await home.locator('[data-bank-step="1"]').click();await home.locator('[data-bank-step="1"]').click();
 await home.locator('[data-bank-select="demo-c"]').click();assert(await home.locator('.bank-wheel').evaluate(e=>e.classList.contains('is-locked')));
 const scroll=await home.locator('.bank-wheel').evaluate(e=>e.scrollTop);await home.locator('.bank-wheel').hover();await page.mouse.wheel(0,-400);assert.equal(await home.locator('.bank-wheel').evaluate(e=>e.scrollTop),scroll);
 await home.locator('[data-bank-lock-toggle]').click();assert(!(await home.locator('.bank-wheel').evaluate(e=>e.classList.contains('is-locked'))));
 const wheel=home.locator('.bank-wheel');await wheel.evaluate(e=>e.scrollTop=0);await wheel.scrollIntoViewIfNeeded();const bounds=await wheel.boundingBox(),cdp=await page.context().newCDPSession(page);
 const swipe=async reverse=>{const x=bounds.x+bounds.width/2,start=reverse?bounds.y+45:bounds.y+bounds.height-45,end=reverse?bounds.y+bounds.height-45:bounds.y+45;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start+(end-start)*i/6}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await swipe(false);await page.waitForFunction(()=>document.querySelector('#homeTreasury .bank-wheel').scrollTop>20);
 await home.locator('[data-bank-lock-toggle]').click();const fixed=await wheel.evaluate(e=>e.scrollTop);await swipe(true);assert.equal(await wheel.evaluate(e=>e.scrollTop),fixed,'touch swipe cannot move the locked bank');
 async function addBank(name,balance,reserved='0'){
  await page.locator('#homeTreasury [data-bank-add]').click();await page.locator('#bankEditor [name="name"]').fill(name);await page.locator('#bankEditor [name="opening_balance"]').fill(balance);await page.locator('#bankEditor [name="reserved"]').fill(reserved);await page.locator('#bankEditor button[type="submit"]').click();await page.locator('#bankEditor').waitFor({state:'hidden'});
  await page.waitForFunction(async name=>(await api('/api/companies/1/banks')).banks.some(b=>b.name===name),name);
  return await page.evaluate(async name=>(await api('/api/companies/1/banks')).banks.find(b=>b.name===name).id,name);
 }
 const a=await addBank('Banque principale','1000','100'),b=await addBank('Banque prélèvements','-20');
 assert.equal(await page.locator('.home-demo-badge').count(),0);
 await page.locator('[data-treasury-mode]').click();await page.locator('#planBankDebit').click();
 await page.locator('#bankDebit [name="bank_id"]').selectOption(String(b));await page.locator('#bankDebit [name="label"]').fill('Assurance samedi');await page.locator('#bankDebit [name="amount"]').fill('80');
 await page.locator('#bankDebit button[type="submit"]').click();await page.locator('#bankDebit').waitFor({state:'hidden'});
 await page.waitForFunction(async()=>(await api('/api/companies/1/banks')).debits.length===1);
 const ledger=page.locator('#content');await ledger.locator('[data-bank-step="1"]').click();
 await ledger.locator(`[data-bank-available="${b}"]`).click();await page.locator('#bankFunding').waitFor();assert.equal(await page.locator('#bankFunding [name="amount"]').inputValue(),'100,00');
 assert.equal(await page.evaluate(async()=>(await api('/api/companies/1/treasury')).movements.length),0);
 await page.locator('#cancelBankFunding').click();
 await ledger.locator(`[data-bank-available="${b}"]`).click();await page.locator('#bankFunding button[type="submit"]').click();await page.locator('#bankFunding').waitFor({state:'hidden'});
 await page.waitForFunction(async()=>(await api('/api/companies/1/treasury')).movements.length===2);
 assert.equal(await page.evaluate(async()=>(await api('/api/companies/1/banks')).balances_minor.EUR),98000);
 assert.equal(await page.evaluate(async id=>(await api('/api/companies/1/banks')).banks.find(x=>x.id===id).available_minor,b),0);
 await ledger.locator(`[data-bank-in="${b}"]`).click();await page.locator('#bankMovement').waitFor();assert.equal(await page.locator('#bankMovement [name="bank_id"]').inputValue(),String(b));
 await page.locator('#bankMovement [name="amount"]').fill('25,00');await page.locator('#bankMovement [name="label"]').fill('Règlement test');await page.locator('#bankMovement button[type="submit"]').click();await page.locator('#confirmBankMovement').click();await page.locator('#bankMovement').waitFor({state:'hidden'});
 await page.waitForFunction(async()=>(await api('/api/companies/1/treasury')).movements.length===3);
 await page.locator('[data-pay-bank-debit]').click();await page.locator('#confirmPaidDebit').click();await page.locator('#confirmPaidDebit').waitFor({state:'hidden'});
 await page.waitForFunction(async()=>(await api('/api/companies/1/banks')).debits.length===0);
 const final=await page.evaluate(async()=>api('/api/companies/1/banks'));assert.equal(final.balances_minor.EUR,92500);assert.equal(final.inflows_minor.EUR,2500);assert.equal(final.outflows_minor.EUR,8000);
 await page.locator('#closeContext').click();await page.evaluate(()=>navigationQueue);
 await page.evaluate(async()=>{await api('/api/companies/1/banks',{method:'POST',body:JSON.stringify({name:'Banque à approvisionner',opening_balance:'-15'})});await refreshCockpit();});
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  assert(await page.locator('#homeTreasury .bank-card').evaluateAll(cards=>cards.every(c=>{const r=c.getBoundingClientRect();return [...c.querySelectorAll('button')].every(b=>{const p=b.getBoundingClientRect();return p.left>=r.left-1&&p.right<=r.right+1&&p.bottom<=r.bottom+1;});})),'all bank actions remain visible within their card');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.setViewportSize({width:390,height:844});
 const needs=await page.evaluate(async()=>(await api('/api/companies/1/banks')).banks.find(b=>b.name==='Banque à approvisionner').id);
 await page.evaluate(id=>{const state=bankWheelState('home');state.selected=id;state.locked=true;return refreshCockpit();},needs);
 await page.locator('#homeTreasury .bank-overview').screenshot({path:process.env.HOME_PREVIEW_DIR+'/roue-banques.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,banks:3,transfersPreserveTotals:true,confirmationRequired:true,responsiveWidths:3}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
