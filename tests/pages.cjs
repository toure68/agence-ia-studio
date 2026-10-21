'use strict';
// Accueil façon iPhone (static/home-pages.js, user request 2026-10-20): one screen without vertical scroll,
// réglages as icons on top, functions in 4 × 2 pages swiped sideways with dots, functions with actions on the
// first page with red badges, Assistant IA at the bottom, the date always visible, windows keep the strip below.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const out='/tmp/screens';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
 await page.addInitScript(()=>{try{localStorage.removeItem('aia-pages');localStorage.setItem('aia-reader','on');localStorage.removeItem('aia-treasury-open');}catch(e){}});
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('.home-pages .home-page').first().waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({path:out+'/95-accueil-iphone.png'});

  // One screen: nothing to scroll vertically, the date tab and the treasury fully visible.
  const box=await page.evaluate(()=>{const h=document.querySelector('#content .reference-home').getBoundingClientRect(),t=document.querySelector('#homeTreasury').getBoundingClientRect(),a=document.querySelector('#assistantDock').getBoundingClientRect(),g=document.querySelector('.home-pages').getBoundingClientRect(),s=document.querySelector('.home-settings').getBoundingClientRect();
   return {bottom:h.bottom,vh:innerHeight,overflow:getComputedStyle(document.body).overflow,date:document.querySelector('#homeTreasury').getAttribute('data-date'),tTop:t.top,aTop:a.top,aBottom:a.bottom,gBottom:g.bottom,sBottom:s.bottom};});
  assert.ok(box.bottom<=box.vh+1,'the home fits the screen '+JSON.stringify(box));
  assert.equal(box.overflow,'hidden','no vertical scroll on the home');
  assert.ok(box.tTop>=box.sBottom&&box.date,'date tab and treasury visible under the réglages '+JSON.stringify(box));
  assert.ok(box.aTop>=box.gBottom&&box.aBottom<=box.vh+1,'Assistant IA at the bottom, under the functions '+JSON.stringify(box));
  await page.evaluate(()=>scrollTo(0,500));assert.equal(await page.evaluate(()=>scrollY),0,'the page does not move up');

  // Réglages as icons: one tap, no menu.
  for(const name of ['Fond','Lecteur','Voix','Outils'])assert.ok(await page.locator('.home-setting',{hasText:name}).isVisible(),'réglage '+name);
  assert.ok(!await page.locator('.account-menu summary').isVisible(),'no account menu to open');
  assert.equal(await page.locator('.home-setting',{hasText:'Lecteur'}).getAttribute('aria-pressed'),'true');

  // Function pages: 4 columns × 2 rows, dots, swipe sideways; no « Réserve de fonctions ».
  const pages=await page.locator('.home-page').count(),dots=await page.locator('.home-page-dot').count();
  assert.ok(pages>=2&&dots===pages,'several pages with their dots');
  for(const p of await page.locator('.home-page').all()){assert.ok(await p.locator('[data-module]').count()<=8);assert.equal(await p.getAttribute('data-columns'),'4');}
  assert.equal(await page.locator('.module-reserve-launch,#homeReserve').count(),0,'no reserve button');
  const withActions=await page.evaluate(()=>[...document.querySelectorAll('.home-pages [data-module]')].filter(c=>c.querySelector('.module-count')).map(c=>c.closest('.home-page').dataset.page));
  assert.ok(withActions.length>0&&withActions.slice(0,8).every(p=>p==='0'),'functions with an action are on the first page '+JSON.stringify(withActions));
  assert.equal(await page.locator('.home-page .module-count').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 59, 48)','red iOS badge');
  const gridTop=()=>page.locator('.home-pages').evaluate(el=>el.getBoundingClientRect().top);
  const before=await gridTop();
  await page.locator('.home-pages').evaluate(el=>el.scrollTo({left:el.clientWidth}));
  await page.waitForFunction(()=>document.querySelector('.home-page-dot[data-page-dot="1"]')?.getAttribute('aria-selected')==='true');
  assert.ok(Math.abs(await gridTop()-before)<1,'pages slide sideways only');
  await page.screenshot({path:out+'/96-accueil-iphone-page2.png'});
  await page.locator('.home-page-dot[data-page-dot="0"]').click();
  await page.waitForFunction(()=>document.querySelector('.home-page-dot[data-page-dot="0"]')?.getAttribute('aria-selected')==='true');

  // Reading does not move the functions.
  if(await page.locator('.reader-list').count()){
   await page.locator('.reader-list').evaluate(el=>el.scrollTo({top:72}));await page.locator('.home-reader:not([hidden])').waitFor();
   assert.ok(Math.abs(await gridTop()-before)<1,'functions stay in place while reading');
   assert.ok(await page.locator('.home-reader').getAttribute('data-date'),'date on the reader too');
   await page.screenshot({path:out+'/97-accueil-iphone-lecteur.png'});
   await page.locator('[data-reader-back]').click();await page.locator('#homeTreasury .home-treasury').waitFor({state:'visible'});
  }

  // « Grille » square at the end of the functions: opens the columns/rows panel; a choice applies at once.
  await page.locator('.home-pages').evaluate(el=>el.scrollTo({left:el.scrollWidth}));
  await page.locator('[data-grid-tile]').click();
  await page.locator('#homeColumnChooser:not([hidden])').waitFor();
  await page.locator('#homeColumnChooser [data-set-columns="3"]').click();
  await page.waitForFunction(()=>document.querySelector('.home-pages')?.dataset.layout==='3x2');
  await page.locator('#homeColumnChooser [data-set-columns="4"]').click();
  await page.waitForFunction(()=>document.querySelector('.home-pages')?.dataset.layout==='4x2');
  await page.keyboard.press('Escape');
  await page.locator('.home-pages').evaluate(el=>el.scrollTo({left:0}));
  // A function opens as its window with the function strip at the bottom.
  await page.locator('.home-page[data-page="0"] .module-tile').first().click();
  await page.locator('#contextPanel').waitFor();
  await page.waitForFunction(()=>document.querySelector('#dockAppBar'));
  await page.screenshot({path:out+'/98-accueil-iphone-fenetre.png'});
  await page.evaluate(()=>closeContext());
  await page.waitForFunction(()=>!document.querySelector('#contextLayer'));

  // The « Lecteur » icon switches the reader mode right away.
  await page.locator('.home-setting',{hasText:'Lecteur'}).click();
  await page.locator('.priority-card').first().waitFor();
  await page.locator('.home-setting',{hasText:'Lecteur'}).click();
  await page.locator('.reader-item,.priority-card').first().waitFor();
  // « Préparer demain » / « Veille » never mix with the notification cards (21/10).
  await page.waitForTimeout(600);
  const mixed=await page.evaluate(()=>document.querySelectorAll('#content .reader-item').length>0&&!!document.querySelector('#content .home-filler [data-filler="calendar"],#content .home-filler [data-filler="veille"]'));
  assert.equal(mixed,false,'Préparer demain / Veille hidden while notifications are shown');
  // Cards never touch the function pages; the gap left is small (21/10, choice A).
  const gap=await page.evaluate(()=>{const lr=document.querySelector('#content .reader-list')?.getBoundingClientRect(),pg=document.querySelector('#content .home-pages')?.getBoundingClientRect();if(!lr||!pg)return null;const vis=[...document.querySelectorAll('#content .reader-item')].map(e=>e.getBoundingClientRect()).filter(r=>r.bottom>lr.top+2&&r.top<lr.bottom-2);return vis.length?{gap:Math.round(pg.top-Math.max(...vis.map(r=>r.bottom))),cards:vis.length,slots:document.body.dataset.readerSlots}:null;});
  console.log('cards/grid',JSON.stringify(gap));
  if(gap){assert(gap.gap>=6,'Cards never touch the function pages '+JSON.stringify(gap));assert(gap.gap<=24,'Cards fill the room above the function pages '+JSON.stringify(gap));}
  // Unfolded treasury opens over the cards: cards keep their place and count, panel stops above the functions (21/10).
  const tBefore=await page.evaluate(()=>({top:Math.round(document.querySelector('#content .reader-list').getBoundingClientRect().top),slots:document.body.dataset.readerSlots}));
  await page.evaluate(()=>bankDialSetOpen(document.querySelector('#homeTreasury'),true));await page.waitForTimeout(700);
  const opened=await page.evaluate(()=>{const t=document.querySelector('#homeTreasury .home-treasury').getBoundingClientRect(),pg=document.querySelector('#content .home-pages').getBoundingClientRect();return {top:Math.round(document.querySelector('#content .reader-list').getBoundingClientRect().top),slots:document.body.dataset.readerSlots,tBottom:Math.round(t.bottom),pTop:Math.round(pg.top),folded:document.querySelector('#homeTreasury .home-treasury').classList.contains('is-folded')};});
  console.log('treasury open',JSON.stringify({tBefore,opened}));
  if(!opened.folded){assert.equal(opened.top,tBefore.top,'Cards do not move when the treasury unfolds');assert.equal(opened.slots,tBefore.slots,'Card count unchanged');assert(opened.tBottom<=opened.pTop,'Unfolded treasury stops above the functions');}
  await page.evaluate(()=>bankDialSetOpen(document.querySelector('#homeTreasury'),false));await page.waitForTimeout(600);
  // Stable: the number of cards does not change once the home has settled.
  const s1=await page.evaluate(()=>document.body.dataset.readerSlots);await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>document.body.dataset.readerSlots),s1,'Card count stays stable');
  // One single way back at the end of the list: « ✓ Fin de la liste » itself (21/10).
  assert.equal(await page.locator('#content .filler-back').count(),0);
  const end=await page.evaluate(()=>{const b=document.querySelector('#content .reader-end [data-reader-top]');return b?{text:b.textContent.trim(),n:document.querySelectorAll('#content .reader-end button').length}:null;});
  // At the very end of the list (reading), the end button is shown whole, never cut by the box (21/10).
  if(end){await page.evaluate(()=>{const l=document.querySelector('#content .reader-list');l.scrollTo({top:l.scrollHeight});});await page.waitForTimeout(900);
   const cut=await page.evaluate(()=>{const l=document.querySelector('#content .reader-list').getBoundingClientRect(),b=document.querySelector('#content .reader-end [data-reader-top]').getBoundingClientRect();return {list:[Math.round(l.top),Math.round(l.bottom)],btn:[Math.round(b.top),Math.round(b.bottom)]};});
   console.log('end button',JSON.stringify(cut));assert(cut.btn[0]>=cut.list[0]-1&&cut.btn[1]<=cut.list[1]+1,'End button not cut '+JSON.stringify(cut));
   // A tap in the empty room under the end button goes back to the home, like the button.
   const pt=await page.evaluate(()=>{const e=document.querySelector('#content .reader-end').getBoundingClientRect(),b=document.querySelector('#content .reader-end [data-reader-top]').getBoundingClientRect();return {x:e.left+e.width/2,y:Math.min(e.bottom-4,b.bottom+12)};});
   const roomBelow=await page.evaluate(()=>{const l=document.querySelector('#content .reader-list').getBoundingClientRect(),b=document.querySelector('#content .reader-end [data-reader-top]').getBoundingClientRect();return l.bottom-b.bottom;});
   if(roomBelow>16){await page.mouse.click(pt.x,pt.y);await page.waitForTimeout(900);assert(await page.evaluate(()=>document.querySelector('#content .reader-list').scrollTop<4),'Empty room under the end button goes back home');}
   await page.evaluate(()=>document.querySelector('#content .reader-list').scrollTo({top:0}));await page.waitForTimeout(600);}
  if(end){assert(end.text.startsWith('✓ Fin de la liste'));assert.equal(end.n,1);}
  // 21/10 step 1 — reader actions in the first row of the function grid (trial messages, nothing sent).
  await page.evaluate(()=>{try{localStorage.setItem('aia-reader-samples','on');}catch(e){}});
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .reader-item').first().waitFor();await page.waitForTimeout(800);
  const rowBefore=await page.evaluate(()=>[...document.querySelector('#content .home-page').children].slice(0,4).map(e=>e.dataset.module));
  const openAt=async i=>{await page.evaluate(i=>{const l=document.querySelector('#content .reader-list');l.scrollTo({top:(i+1)*(Number(document.body.dataset.readerPitch)||54)});},i);await page.waitForTimeout(900);};
  const state=()=>page.evaluate(()=>{const row=document.querySelector('#content .home-action-row'),card=document.querySelector('#content .home-reader');
   const inCard=[...card.querySelectorAll('[data-reader-run]')].filter(b=>!b.hidden&&b.offsetParent).length;
   const first=[...document.querySelector('#content .home-page').children].slice(0,4).map(e=>getComputedStyle(e).visibility);
   const r=row?.getBoundingClientRect(),t=document.querySelector('#content .home-page').children[0].getBoundingClientRect();
   return {labels:row?[...row.querySelectorAll('.action-tile')].map(b=>b.getAttribute('aria-label')):null,title:card.querySelector('.reader-title strong')?.textContent,inCard,first,over:r?Math.abs(r.top-t.top)<2:false,second:getComputedStyle(document.querySelector('#content .home-page').children[4]||document.body).visibility};});
  await openAt(0);const a1=await state();console.log('actions 1',JSON.stringify(a1));
  assert(a1.labels&&a1.labels.length>0&&a1.labels.length<=4,'Actions shown in the grid row');
  assert(a1.over,'Action row sits exactly on the first row');assert.deepEqual(a1.first,['hidden','hidden','hidden','hidden']);
  assert.equal(a1.second,'visible','Other rows stay reachable');assert.equal(a1.inCard,0,'Actions left the reader card');
  await openAt(1);const a2=await state();console.log('actions 2',JSON.stringify(a2));
  assert(a2.title!==a1.title,'Next message');assert(a2.labels&&a2.labels.length>0,'Actions follow the message');
  // Running an action (trial message: simulated, nothing sent) works from the grid row.
  const before2=await page.evaluate(()=>document.querySelector('#content .reader-count')?.textContent);
  const target=await page.evaluate(()=>{const b=[...document.querySelectorAll('#content .home-action-row .action-tile')].find(b=>!/modif|répond|appel|itinéraire|détail|ouvrir/i.test(b.getAttribute('aria-label')));return b?b.dataset.actionRun:null;});
  if(target!==null){await page.locator(`#content .home-action-row [data-action-run="${target}"]`).click();await page.waitForTimeout(900);
   const after2=await page.evaluate(()=>document.querySelector('#content .reader-count')?.textContent);console.log('run',before2,'→',after2);assert.notEqual(after2,before2,'Action ran from the grid');}
  // Back to the home: the first row is exactly as before.
  await page.evaluate(()=>document.querySelector('#content .reader-list').scrollTo({top:0}));await page.waitForTimeout(900);
  const back=await page.evaluate(()=>({row:!!document.querySelector('#content .home-action-row'),first:[...document.querySelector('#content .home-page').children].slice(0,4).map(e=>[e.dataset.module,getComputedStyle(e).visibility])}));
  console.log('back',JSON.stringify(back));assert.equal(back.row,false);assert.deepEqual(back.first.map(x=>x[0]),rowBefore,'Same functions, same order');assert(back.first.every(x=>x[1]==='visible'));
  await page.evaluate(()=>{try{localStorage.setItem('aia-reader-samples','off');}catch(e){}});
  assert.deepEqual(errors,[]);
  console.log('pages ok');
 }catch(e){await page.screenshot({path:out+'/99-iphone-erreur.png'}).catch(()=>{});console.error(e);process.exitCode=1;}
 finally{await browser.close();}
})();
