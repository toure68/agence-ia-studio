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
  // "Tous les modules" text link is replaced by the Réserve button below the grid.
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
   // Applied immediately, chooser stays open for the row stepper, still on home.
   assert.equal(await page.locator('#content .module-grid').getAttribute('data-columns'),String(columns));
   assert(await chooser.isVisible());assert.equal(page.url(),url);assert(await page.locator('#content .reference-home').isVisible());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert((await saved).ok(),'Column choice saved');
   await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').waitFor();
   assert.equal(await page.locator('#content .module-grid').getAttribute('data-columns'),String(columns),'Choice is saved');
   assert.equal(await page.locator(`[data-set-columns="${columns}"]`).getAttribute('aria-pressed'),'true');
   // Row cap: 2 cols → 3 rows, 3 → 3, 4 → 2, real functions only; urgent ones may add rows.
   const grid=await page.locator('#content .module-grid').evaluate(el=>{const tiles=[...el.querySelectorAll('.module-tile')],urgent=tiles.filter(t=>['danger','warning'].includes(t.dataset.state)).length;return {cells:el.children.length,urgent,onlyFunctions:[...el.children].every(c=>c.querySelector('.module-tile'))};});
   const rows={2:3,3:3,4:2}[columns];
   assert(grid.onlyFunctions,'Grid cells are real functions');assert.equal(grid.cells%columns,0,'Complete rows');
   assert(grid.cells<=Math.max(rows*columns,Math.ceil(grid.urgent/columns)*columns),`At most ${rows} rows unless actions require more`);
  }
  // Free row count: the stepper changes how many rows of functions show, applied and saved at once.
  const cellsNow=()=>page.locator('#content .module-grid').evaluate(el=>({cells:el.children.length,urgent:el.querySelectorAll('.module-tile[data-state="danger"],.module-tile[data-state="warning"]').length}));
  const stepRows=async delta=>{const saved=page.waitForResponse(r=>r.url().endsWith('/workspace')&&r.request().method()==='PUT');await page.locator(`[data-rows-step="${delta}"]`).click();assert((await saved).ok());};
  await toggle.click();assert.equal(await page.locator('#homeRowsValue').innerText(),'3','Default 3 rows in 2 columns');
  await stepRows(1);await stepRows(1);assert.equal(await page.locator('#homeRowsValue').innerText(),'5');
  let grid=await cellsNow();assert.equal(grid.cells,Math.max(10,Math.ceil(grid.urgent/2)*2),'5 rows × 2 columns');
  assert(await chooser.isVisible(),'Stepper keeps the chooser open');
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').waitFor();
  await toggle.click();assert.equal(await page.locator('#homeRowsValue').innerText(),'5','Row choice is saved');
  for(let i=0;i<4;i++)await stepRows(-1);
  await page.locator('[data-rows-step="-1"]').click();await page.locator('[data-rows-step="-1"]').click();
  assert.equal(await page.locator('#homeRowsValue').innerText(),'1','Never below one row');
  grid=await cellsNow();assert.equal(grid.cells,Math.max(2,Math.ceil(grid.urgent/2)*2),'One row, unless actions require more');
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').waitFor();await toggle.click();
  assert.equal(await page.locator('#homeRowsValue').innerText(),'1');
  await stepRows(1);await stepRows(1);await page.keyboard.press('Escape');assert(await chooser.isHidden());
  // The Réserve button opens the reserve over home, without the settings form; the + and the text both work.
  assert(await page.locator('#content .module-reserve-launch .module-reserve-plus').isVisible());
  await page.locator('#content .module-reserve-launch').getByText('Réserve').click();
  await page.locator('#contextPanel .module-reserve').waitFor();
  assert.equal(await page.locator('#saveModules').count(),0);
  assert(await page.locator('#contextPanel .module-reserve-manage').isVisible());
  await page.locator('#closeContext').click();await page.locator('#content .module-grid').waitFor();
  // Escape closes the chooser without changing anything.
  await toggle.click();await page.keyboard.press('Escape');assert(await chooser.isHidden());
  assert.deepEqual(errors,[]);
  console.log('Column chooser: inline 2/3/4, applied instantly, saved, no form.');
 }catch(error){
  console.error('Column chooser details',JSON.stringify({url:page.url(),errors,heading:await page.locator('.home-modules-heading').innerHTML().catch(()=>'')}));
  throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
