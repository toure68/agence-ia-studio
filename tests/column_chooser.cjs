'use strict';
// Home column chooser: the grid button expands inline and applies 2/3/4 columns without leaving home.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('#content .module-grid .module-tile').first().waitFor();
  const url=page.url();
  // "Tous les modules" is hidden while the grid has modules.
  assert.equal(await page.locator('.more-functions').isVisible(),false);
  const toggle=page.locator('[data-columns-toggle]'),chooser=page.locator('#homeColumnChooser');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert(await chooser.isHidden());
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert(await chooser.isVisible());
  assert.equal(await page.locator('.column-choice').count(),3);
  for(const choice of await page.locator('.column-choice').all()){const box=await choice.boundingBox();assert(box.width>=44&&box.height>=44,'Choices are touch-sized');}
  assert.equal(await page.locator('#saveModules').count(),0,'No form opens');
  for(const columns of [3,4,2]){
   if(await chooser.isHidden())await toggle.click();
   const saved=page.waitForResponse(r=>r.url().endsWith('/workspace')&&r.request().method()==='PUT');
   await page.locator(`[data-set-columns="${columns}"]`).click();
   // Applied immediately, chooser closes, still on home.
   assert.equal(await page.locator('#content .module-grid').getAttribute('data-columns'),String(columns));
   assert(await chooser.isHidden());assert.equal(page.url(),url);assert(await page.locator('#content .reference-home').isVisible());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert((await saved).ok(),'Column choice saved');
   await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').waitFor();
   assert.equal(await page.locator('#content .module-grid').getAttribute('data-columns'),String(columns),'Choice is saved');
   assert.equal(await page.locator(`[data-set-columns="${columns}"]`).getAttribute('aria-pressed'),'true');
  }
  // Escape closes the chooser without changing anything.
  await toggle.click();await page.keyboard.press('Escape');assert(await chooser.isHidden());
  assert.deepEqual(errors,[]);
  console.log('Column chooser: inline 2/3/4, applied instantly, saved, no form.');
 }catch(error){
  console.error('Column chooser details',JSON.stringify({url:page.url(),errors,heading:await page.locator('.home-modules-heading').innerHTML().catch(()=>'')}));
  throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
