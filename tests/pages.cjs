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
  assert.deepEqual(errors,[]);
  console.log('pages ok');
 }catch(e){await page.screenshot({path:out+'/99-iphone-erreur.png'}).catch(()=>{});console.error(e);process.exitCode=1;}
 finally{await browser.close();}
})();
