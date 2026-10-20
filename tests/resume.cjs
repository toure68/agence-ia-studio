'use strict';
// Resume where you left off (2026-10-20): the app closed by the phone reopens on the same window with what was typed.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 let page=await ctx.newPage();const errors=[];const watch=p=>p.on('pageerror',e=>errors.push(e.message));watch(page);
 const home='http://127.0.0.1:8123/';
 try{
  await page.goto(home,{waitUntil:'networkidle'});
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('#content .module-grid .module-tile').first().waitFor();
  // Typing in a new client window, then the phone closes the app (the page is thrown away).
  await page.evaluate(()=>openTab('client-new'));
  await page.locator('#clientName').waitFor();
  await page.locator('#clientName').fill('Client en cours de saisie');
  await page.locator('#clientPhone').fill('06 11 22 33 44');
  await page.evaluate(()=>{document.querySelector('#assistantMessage')&&(document.querySelector('#assistantMessage').value='Brouillon assistant');aiaResume.save();});
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('aia-resume')));
  assert.equal(stored.route.tab,'client-new');
  assert(!JSON.stringify(stored).includes('local-ui-smoke-test-only'),'Never keeps a password');
  await page.close();page=await ctx.newPage();watch(page);
  await page.goto(home,{waitUntil:'networkidle'});
  await page.locator('#clientName').waitFor();
  await page.waitForFunction(()=>document.querySelector('#clientName').value==='Client en cours de saisie');
  assert.equal(await page.locator('#clientPhone').inputValue(),'06 11 22 33 44');
  // Closing the window forgets it: next opening is the home.
  await page.evaluate(()=>closeContext());await page.waitForFunction(()=>!document.querySelector('#contextPanel'));
  await page.evaluate(()=>aiaResume.save());
  await page.close();page=await ctx.newPage();watch(page);
  await page.goto(home,{waitUntil:'networkidle'});await page.locator('#content .module-grid .module-tile').first().waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#clientName').count(),0,'A closed window does not come back');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Resume OK');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
