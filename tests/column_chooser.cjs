'use strict';
// Home column chooser: the grid button expands inline and applies 2/3/4 columns without leaving home.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 await page.addInitScript(()=>{try{if(!localStorage.getItem('aia-reader'))localStorage.setItem('aia-reader','off');}catch(e){}}); // classic action cards (mode lecteur: tests/reader.cjs)
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('#content .module-grid .module-tile').first().waitFor();
  const url=page.url();
  // Action cards: speaker in the top-right corner, green button centered across the card.
  await page.waitForFunction(()=>document.querySelector('.priority-card>.voice-button'));
  const cards=await page.locator('.priority-card').evaluateAll(cs=>cs.filter(c=>c.querySelector('.voice-button')&&c.querySelector('.priority-cta')).map(c=>{const card=c.getBoundingClientRect(),voice=c.querySelector('.voice-button').getBoundingClientRect(),cta=c.querySelector('.priority-cta').getBoundingClientRect(),dismiss=c.querySelector('.priority-dismiss')?.getBoundingClientRect();return {topGap:voice.top-card.top,rightGap:card.right-voice.right,above:voice.bottom<=cta.top,centered:Math.abs((cta.left-card.left)-(card.right-cta.right)),overlapDismiss:dismiss?!(voice.right<=dismiss.left+1||voice.left>=dismiss.right-1):false,size:[voice.width,voice.height]};}));
  assert(cards.length>0,'Action cards with a speaker are shown');
  for(const c of cards){assert(c.topGap<20&&c.rightGap<60&&c.above,'Speaker sits in the top-right corner: '+JSON.stringify(c));assert(c.centered<3,'Green button centered: '+JSON.stringify(c));assert(!c.overlapDismiss,'Speaker does not cover the close cross');assert(c.size[0]>=44&&c.size[1]>=44);}
  // "Tous les modules" text link is replaced by the Réserve button below the grid.
  assert.equal(await page.locator('.more-functions').isVisible(),false);
  // The grid chooser is reached from the réglages (« Grille des fonctions », user request 2026-10-20).
  const toggle=page.locator('[data-columns-toggle]'),chooser=page.locator('#homeColumnChooser');
  const openChooser=async()=>{await page.locator('.account-menu summary').click();await page.locator('#accountGrid').click();await chooser.waitFor({state:'visible'});};
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert(await chooser.isHidden());
  await openChooser();
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert(await chooser.isVisible());
  assert.equal(await page.locator('.column-choice').count(),3);
  for(const choice of await page.locator('.column-choice').all()){const box=await choice.boundingBox();assert(box.width>=44&&box.height>=44,'Choices are touch-sized');}
  assert.equal(await page.locator('#saveModules').count(),0,'No form opens');
  for(const columns of [3,4,2]){
   if(await chooser.isHidden())await openChooser();
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
   assert(grid.onlyFunctions,'Grid cells are real functions');
   assert(grid.cells<=Math.max(rows*columns,grid.urgent),`At most ${rows} rows unless actions require more`);
  }
  // Free row count: the stepper changes how many rows of functions show, applied and saved at once.
  const cellsNow=()=>page.locator('#content .module-grid').evaluate(el=>({cells:el.children.length,urgent:el.querySelectorAll('.module-tile[data-state="danger"],.module-tile[data-state="warning"]').length}));
  const stepRows=async delta=>{const saved=page.waitForResponse(r=>r.url().endsWith('/workspace')&&r.request().method()==='PUT');await page.locator(`[data-rows-step="${delta}"]`).click();assert((await saved).ok());};
  await openChooser();assert.equal(await page.locator('#homeRowsValue').innerText(),'3','Default 3 rows in 2 columns');
  await stepRows(1);await stepRows(1);assert.equal(await page.locator('#homeRowsValue').innerText(),'5');
  // The grid shows exactly the checked functions (plus urgent ones), capped by rows × columns:
  // with fewer than 10 eligible functions it shows them all (the count depends on earlier tests' data).
  let grid=await cellsNow();const eligible=await page.evaluate(()=>homeGridModules({...homeLayout.workspace,rows:10,columns:2},homeLayout.state).modules.length);
  assert.equal(grid.cells,Math.max(Math.min(10,eligible),grid.urgent),'5 rows × 2 columns '+JSON.stringify({grid,eligible}));
  assert(await chooser.isVisible(),'Stepper keeps the chooser open');
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').waitFor();
  await openChooser();assert.equal(await page.locator('#homeRowsValue').innerText(),'5','Row choice is saved');
  for(let i=0;i<4;i++)await stepRows(-1);
  await page.locator('[data-rows-step="-1"]').click();await page.locator('[data-rows-step="-1"]').click();
  assert.equal(await page.locator('#homeRowsValue').innerText(),'1','Never below one row');
  grid=await cellsNow();assert.equal(grid.cells,Math.max(2,grid.urgent),'One row, unless actions require more');
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').waitFor();await openChooser();
  assert.equal(await page.locator('#homeRowsValue').innerText(),'1');
  await stepRows(1);await stepRows(1);await page.keyboard.press('Escape');assert(await chooser.isHidden());
  // The Réserve button unfolds a container in place: every function as a home-style card with a check.
  const launch=page.locator('#content .module-reserve-launch'),reserve=page.locator('#homeReserve');
  assert(await page.locator('#content .module-reserve-launch .module-reserve-plus').isVisible());
  assert(await reserve.isHidden());
  await launch.getByText('Réserve').click();
  assert(await reserve.isVisible());assert.equal(await launch.getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#contextPanel').count(),0,'No panel or page opens');assert.equal(page.url(),url);
  const homeCount=await page.locator('#content .module-grid:not(.module-reserve-grid-inline) .module-tile').count();
  assert.equal(await page.locator('#homeReserve [data-reserve-key][aria-checked="true"]').count(),homeCount,'Checked cards match home');
  const veilleCard=page.locator('#homeReserve [data-reserve-key="veille"]');assert.equal(await veilleCard.getAttribute('aria-checked'),'false','Veille métier starts in the reserve');
  assert(await veilleCard.evaluate(e=>e.classList.contains('module-tile')&&!!e.querySelector('.module-icon svg')),'Same card style as home');
  let saved=page.waitForResponse(r=>r.url().endsWith('/workspace')&&r.request().method()==='PUT');
  await veilleCard.click();
  assert.equal(await page.locator('#content .module-grid:not(.module-reserve-grid-inline) [data-go="veille"]').count(),1,'Checked function appears on home at once');
  assert.equal(await page.locator('#homeReserve [data-reserve-key="veille"]').getAttribute('aria-checked'),'true');
  assert((await saved).ok());assert(await reserve.isVisible(),'Container stays open');
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').first().waitFor();
  assert.equal(await page.locator('#content .module-grid [data-go="veille"]').count(),1,'Choice is saved');
  await launch.click();saved=page.waitForResponse(r=>r.url().endsWith('/workspace')&&r.request().method()==='PUT');
  await page.locator('#homeReserve [data-reserve-key="veille"]').click();
  assert.equal(await page.locator('#content .module-grid:not(.module-reserve-grid-inline) [data-go="veille"]').count(),0,'Unchecked function leaves home');
  assert((await saved).ok());
  await launch.click();assert(await reserve.isHidden());
  // Veille métier keeps its own panel when opened.
  await page.evaluate(()=>openTab('veille'));await page.locator('#contextPanel .veille-panel').waitFor();assert((await page.locator('#contextPanel .veille-panel').innerText()).includes('Veille non connectée'));
  await page.locator('#closeContext').click();await page.locator('#content .module-grid').first().waitFor();
  assert.equal(await page.locator('#content .home-sector').count(),0);
  // Escape closes the chooser without changing anything.
  await openChooser();await page.keyboard.press('Escape');assert(await chooser.isHidden());
  assert.deepEqual(errors,[]);
  console.log('Column chooser: inline 2/3/4, applied instantly, saved, no form.');
 }catch(error){
  console.error('Column chooser details',JSON.stringify({url:page.url(),errors,heading:await page.locator('.home-modules-heading').innerHTML().catch(()=>'')}));
  throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
