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
  const box=await page.evaluate(()=>{const h=document.querySelector('#content .reference-home').getBoundingClientRect(),t=document.querySelector('#homeTreasury').getBoundingClientRect(),a=document.querySelector('#assistantDock').getBoundingClientRect(),g=document.querySelector('.home-pages').getBoundingClientRect(),s=document.querySelector('#content .reference-home').getBoundingClientRect();
   return {bottom:h.bottom,vh:innerHeight,overflow:getComputedStyle(document.body).overflow,date:document.querySelector('#homeTreasury').getAttribute('data-date'),tTop:t.top,aTop:a.top,aBottom:a.bottom,gBottom:g.bottom,sBottom:s.top};});
  assert.ok(box.bottom<=box.vh+1,'the home fits the screen '+JSON.stringify(box));
  assert.equal(box.overflow,'hidden','no vertical scroll on the home');
  assert.ok(box.tTop>=box.sBottom&&box.date,'date tab and treasury visible under the réglages '+JSON.stringify(box));
  assert.ok(box.aTop>=box.gBottom&&box.aBottom<=box.vh+1,'Assistant IA at the bottom, under the functions '+JSON.stringify(box));
  await page.evaluate(()=>scrollTo(0,500));assert.equal(await page.evaluate(()=>scrollY),0,'the page does not move up');

  // Réglages grouped behind the account button, left of the Assistant IA (21/10); no icon row at the top.
  assert.equal(await page.locator('.home-settings').count(),0,'no réglage icons row');
  const acc=await page.evaluate(()=>{const s=document.querySelector('#content .home-account-slot .account-menu summary')?.getBoundingClientRect(),a=document.querySelector('#assistantDock').getBoundingClientRect();return s?{right:Math.round(s.right),aLeft:Math.round(a.left),dy:Math.round(Math.abs((s.top+s.bottom)/2-(a.top+a.bottom)/2))}:null;});
  assert(acc&&acc.right<=acc.aLeft&&acc.dy<=4,'account button left of the Assistant IA '+JSON.stringify(acc));
  await page.locator('#content .home-account-slot .account-menu summary').click();
  for(const id of ['accountWallpaper','accountReader','accountTools'])assert.ok(await page.locator('#'+id).isVisible(),'menu entry '+id);
  const panel=await page.evaluate(()=>{const p=document.querySelector('.account-panel').getBoundingClientRect();return {top:Math.round(p.top),bottom:Math.round(p.bottom),vh:innerHeight};});
  assert(panel.top>=0&&panel.bottom<=panel.vh,'menu fully on screen '+JSON.stringify(panel));
  await page.locator('#content .home-account-slot .account-menu summary').click();

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
   const top=await page.evaluate(()=>{const r=document.querySelector('.home-reader').getBoundingClientRect(),c=document.querySelector('.home-reader .reader-card')?.getBoundingClientRect(),h=document.querySelector('#content .reference-home').getBoundingClientRect(),n=c&&document.querySelector('.home-reader .reader-card').nextElementSibling?.getBoundingClientRect();return {readerTop:Math.round(r.top-h.top),cardInReader:c?Math.round(c.top-r.top):null,under:n?Math.round(n.top-c.bottom):null,speakOnCard:!!document.querySelector('.home-reader .reader-card [data-reader-speak]'),head:!!document.querySelector('.home-reader .reader-head')};});
   console.log('reader top',JSON.stringify(top));
   if(top.cardInReader!==null){assert.ok(top.cardInReader<=0,'card at the very top of the reader');assert.ok(top.speakOnCard,'speaker on the card');assert.ok(!top.head,'no tool row');}
   assert.ok(await page.locator('.home-reader').getAttribute('data-date'),'date on the reader too');
   await page.screenshot({path:out+'/97-accueil-iphone-lecteur.png'});
   await page.locator('.reader-list').evaluate(el=>el.scrollTo({top:0}));await page.locator('#homeTreasury .home-treasury').waitFor({state:'visible'});
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
  const toggleReader=async()=>{await page.locator('#content .home-account-slot .account-menu summary').click();await page.locator('#accountReader').click();await page.evaluate(()=>document.querySelector('.account-menu')?.removeAttribute('open'));};
  await toggleReader();
  await page.locator('.priority-card').first().waitFor();
  await toggleReader();
  await page.locator('.reader-item,.priority-card').first().waitFor();
  // « Préparer demain » / « Veille » never mix with the notification cards (21/10).
  await page.waitForTimeout(600);
  const mixed=await page.evaluate(()=>document.querySelectorAll('#content .reader-list .reader-item').length>0&&!!document.querySelector('#content .home-filler [data-filler="calendar"],#content .home-filler [data-filler="veille"]'));
  assert.equal(mixed,false,'Préparer demain / Veille hidden while notifications are shown');
  // Cards never touch the function pages; the gap left is small (21/10, choice A).
  const gap=await page.evaluate(()=>{const lr=document.querySelector('#content .reader-list')?.getBoundingClientRect(),pg=document.querySelector('#content .home-pages')?.getBoundingClientRect();if(!lr||!pg)return null;const vis=[...document.querySelectorAll('#content .reader-list .reader-item')].map(e=>e.getBoundingClientRect()).filter(r=>r.bottom>lr.top+2&&r.top<lr.bottom-2);return vis.length?{gap:Math.round(pg.top-Math.max(...vis.map(r=>r.bottom))),cards:vis.length,slots:document.body.dataset.readerSlots}:null;});
  console.log('cards/grid',JSON.stringify(gap),'slots',await page.evaluate(()=>document.body.dataset.readerSlots+' pitch '+document.body.dataset.readerPitch));
  if(gap){assert(gap.gap>=6,'Cards never touch the function pages '+JSON.stringify(gap));const sl=await page.evaluate(()=>document.body.dataset.readerSlots);assert(sl==='6'||gap.gap<79,'6 cards, or no room for one more '+sl+' '+JSON.stringify(gap));}
  // No notification: the filler cards sit under the replacement card, never over it (22/10).
  const overlap=await page.evaluate(()=>{const f=document.querySelector('#content .home-filler'),c=[...document.querySelectorAll('#content #priorityBlock .priority-card')].filter(e=>e.offsetParent);if(!f||!c.length)return null;const fr=f.getBoundingClientRect();return c.some(e=>{const r=e.getBoundingClientRect();return r.bottom>fr.top+1&&r.top<fr.bottom-1;});});
  if(overlap!==null)assert.equal(overlap,false,'Filler never covers the replacement card');
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
  // Compact bottom (21/10): Assistant IA 44px high, dots centred between the functions and the Assistant.
  const bottom=await page.evaluate(()=>{const d=document.querySelector('#content .reference-home .home-topbar .assistant-dock').getBoundingClientRect(),dots=document.querySelector('#content .home-page-dots'),pg=document.querySelector('#content .home-pages').getBoundingClientRect();const dot=dots?.querySelector('.home-page-dot')?.getBoundingClientRect();
   return {h:Math.round(d.height),gap:Math.round(d.top-pg.bottom),above:dot?Math.round(dot.top-pg.bottom):null,below:dot?Math.round(d.top-dot.bottom):null,under:Math.round(innerHeight-d.bottom)};});
  console.log('bottom',JSON.stringify(bottom));assert(bottom.h>=43&&bottom.h<=50,'Assistant bar 44–50px (Claude-like capsule)');assert(bottom.under>=6&&bottom.under<=10,'Assistant at the very bottom (22/10)');
  assert(await page.locator('#assistantDock .dock-voice').isVisible()&&await page.locator('#assistantDock .dock-mic').isVisible()&&await page.locator('#assistantDock .dock-plus').isVisible(),'Claude-like bar: +, micro, voice');
  await page.locator('#assistantDock').click();await page.locator('#contextPanel').waitFor();await page.waitForTimeout(400);
  const sheet=await page.evaluate(()=>{const p=document.querySelector('#contextPanel').getBoundingClientRect(),pg=document.querySelector('.reference-home .home-pages')?.getBoundingClientRect(),t=document.querySelector('.reference-home .home-topbar')?.getBoundingClientRect();return {module:document.querySelector('#contextPanel').dataset.module,top:Math.round(p.top),bottom:Math.round(p.bottom),pagesTop:pg?Math.round(pg.top):null,barTop:t?Math.round(t.top):null};});
  console.log('assistant sheet',JSON.stringify(sheet));
  if(sheet.barTop)assert(sheet.bottom<=sheet.barTop&&sheet.bottom>=sheet.barTop-14,'Assistant window right above the bar '+JSON.stringify(sheet));
  // 22/10 step 3: chat behaviour — no bottom close button, the window grows upwards with the messages and stays on the screen.
  assert(!(await page.locator('#contextPanel .context-footer').isVisible()),'No form-like bottom button in the Assistant window');
  assert(!(await page.locator('#contextPanel .context-header').isVisible())&&!(await page.locator('#chatConnect').isVisible()),'No header (title, speaker, Connecter) in the Assistant window');
  assert.equal(await page.locator('#assistantMessage').getAttribute('rows'),'1','One-line message field');
  const grow=await page.evaluate(async()=>{const panel=document.querySelector('#contextPanel'),log=document.querySelector('#chatTurns'),before=panel.getBoundingClientRect();log.classList.remove('hide');for(let i=0;i<14;i++){const a=document.createElement('article');a.className='chat-message '+(i%2?'chat-assistant':'chat-user');a.innerHTML='<strong>x</strong><p>Message de test numéro '+i+' assez long pour occuper une ligne entière.</p>';log.append(a);}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const after=panel.getBoundingClientRect(),form=document.querySelector('#assistantForm').getBoundingClientRect(),u=log.querySelector('.chat-user').getBoundingClientRect();return {topBefore:Math.round(before.top),top:Math.round(after.top),bottom:Math.round(after.bottom),bottomBefore:Math.round(before.bottom),formBottom:Math.round(form.bottom),scrolls:log.scrollHeight>log.clientHeight+2,userRight:Math.round(after.right-u.right)};});
  console.log('assistant grow',JSON.stringify(grow));
  assert(grow.top<grow.topBefore-40&&grow.top>=8&&grow.bottom===grow.bottomBefore,'Assistant window grows upwards with the conversation '+JSON.stringify(grow));
  assert(grow.formBottom<=grow.bottom&&grow.scrolls,'Message field stays visible, messages scroll '+JSON.stringify(grow));
  assert(grow.userRight<=24,'User messages are bubbles on the right '+JSON.stringify(grow));
  await page.locator('#closeContext').click();await page.locator('#contextPanel').waitFor({state:'detached'});
  // 21/10 step 1 — reader actions in the first row of the function grid (trial messages, nothing sent).
  await page.evaluate(()=>{try{localStorage.setItem('aia-reader-samples','on');}catch(e){}});
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .reader-list .reader-item').first().waitFor();await page.waitForTimeout(800);
  const rowBefore=await page.evaluate(()=>[...document.querySelector('#content .home-page').children].slice(0,4).map(e=>e.dataset.module));
  const openAt=async i=>{await page.evaluate(i=>{const l=document.querySelector('#content .reader-list');l.scrollTo({top:(i+1)*(Number(document.body.dataset.readerPitch)||54)});},i);await page.waitForTimeout(900);};
  const state=()=>page.evaluate(()=>{const row=document.querySelector('#content .home-action-row'),card=document.querySelector('#content .home-reader');
   const inCard=[...card.querySelectorAll('[data-reader-run]')].filter(b=>!b.hidden&&b.offsetParent).length;
   const first=[...document.querySelector('#content .home-page').children].slice(0,4).map(e=>getComputedStyle(e).visibility);
   const r=row?.getBoundingClientRect(),t=document.querySelector('#content .home-page').children[0].getBoundingClientRect();
   return {labels:row?[...row.querySelectorAll('[data-action-run]')].map(b=>b.textContent.trim()):null,title:card.querySelector('.reader-title strong')?.textContent,inCard,first,over:r?Math.abs(r.top-t.top)<2:false,second:getComputedStyle(document.querySelector('#content .home-page').children[4]||document.body).visibility};});
  const nFn=await page.evaluate(()=>document.querySelectorAll('#content .home-pages [data-go]').length);
  await openAt(0);const a1=await state();
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#content .home-pages [data-go]').length),nFn,'No function hidden while reading: they move to the next pages');console.log('actions 1',JSON.stringify(a1));
  assert(a1.labels&&a1.labels.length>0&&a1.labels.length<=4,'Actions shown in the grid row');
  assert(a1.over,'Action row sits exactly on the first row');
  // Same buttons as the reader (words written, green main / grey / red), on the right, separator below (21/10, mock-up OK).
  const look=await page.evaluate(()=>{const row=document.querySelector('#content .home-action-row'),btns=[...row.querySelectorAll('.reader-btn')];
   const rr=row.getBoundingClientRect(),last=btns[btns.length-1].getBoundingClientRect(),main=row.querySelector('.reader-btn.is-main');
   return {left:Math.round(btns[0].getBoundingClientRect().left-rr.left),texts:btns.map(b=>b.textContent.trim()),h:Math.round(last.height),right:Math.round(rr.right-last.right),mainBg:main?getComputedStyle(main).backgroundColor:null,sep:getComputedStyle(row,'::after').content,squares:row.querySelectorAll('.module-card,.module-tile').length};});
  console.log('look',JSON.stringify(look));
  await page.screenshot({path:out+'/96-lecteur-actions-dans-la-grille.png'});
  // Swiping the function pages while reading never moves the buttons (they stay on the right of the grid).
  const xr=await page.evaluate(async()=>{const box=document.querySelector('#content .home-pages'),row=document.querySelector('#content .home-action-row');const r0=Math.round(row.getBoundingClientRect().right);box.scrollLeft=box.clientWidth*0.5;await new Promise(r=>setTimeout(r,250));window.homeActions.place();const r1=Math.round(row.getBoundingClientRect().right);box.scrollLeft=0;await new Promise(r=>setTimeout(r,400));window.homeActions.place();return [r0,r1,Math.round(box.getBoundingClientRect().right)];});
  console.log('swipe',JSON.stringify(xr));assert(Math.abs(xr[0]-xr[1])<=1,'Buttons stay put while the pages slide');
  assert(look.texts.every(t=>t.length>0),'Words written on the buttons');assert(look.h>=40,'Reader-size buttons');
  assert(look.right<=1&&look.left<=1,'Buttons fill the whole row');assert.equal(look.squares,0,'No function square in the reserved row');
  if(look.mainBg)assert(!/rgba?\(0, 0, 0, 0\)|transparent/.test(look.mainBg),'Main button filled (green)');assert.deepEqual(a1.first,['hidden','hidden','hidden','hidden']);
  assert.equal(a1.second,'visible','Other rows stay reachable');assert.equal(a1.inCard,0,'Actions left the reader card');
  await openAt(1);const a2=await state();console.log('actions 2',JSON.stringify(a2));
  assert(a2.title!==a1.title,'Next message');assert(a2.labels&&a2.labels.length>0,'Actions follow the message');
  // Running an action (trial message: simulated, nothing sent) works from the grid row.
  const before2=await page.evaluate(()=>document.querySelector('#content .reader-count')?.textContent);
  const target=await page.evaluate(()=>{const b=[...document.querySelectorAll('#content .home-action-row [data-action-run]')].find(b=>!/modif|répond|appel|itinéraire|détail|ouvrir/i.test(b.textContent));return b?b.dataset.actionRun:null;});
  if(target!==null){await page.locator(`#content .home-action-row [data-action-run="${target}"]`).click();await page.waitForTimeout(900);
   const after2=await page.evaluate(()=>document.querySelector('#content .reader-count')?.textContent);console.log('run',before2,'→',after2);assert.notEqual(after2,before2,'Action ran from the grid');}
  // Back to the home: the first row is exactly as before.
  await page.evaluate(()=>document.querySelector('#content .reader-list').scrollTo({top:0}));await page.waitForTimeout(900);
  const back=await page.evaluate(()=>({row:!!document.querySelector('#content .home-action-row'),first:[...document.querySelector('#content .home-page').children].slice(0,4).map(e=>[e.dataset.module,getComputedStyle(e).visibility])}));
  console.log('back',JSON.stringify(back));assert.equal(back.row,false);assert.deepEqual(back.first.map(x=>x[0]),rowBefore,'Same functions, same order');assert(back.first.every(x=>x[1]==='visible'));
  // 22/10 — while reading, the cards fill the room down to the function pages.
  await openAt(0);
  const fill=await page.evaluate(()=>{const lr=document.querySelector('#content .reader-list').getBoundingClientRect(),pg=document.querySelector('#content .home-pages').getBoundingClientRect();return {gap:Math.round(pg.top-lr.bottom),pitch:Number(document.body.dataset.readerPitch)||54};});
  console.log('reading fill',JSON.stringify(fill));
  assert(await page.locator('#content .home-reader .reader-grip').isVisible(),'Closing grip at the bottom of the reader (22/10)');
  assert.equal(typeof (await page.evaluate(()=>typeof window.homeReader.step)),'string');assert(fill.gap<fill.pitch+10,'No room left for one more card while reading (stack included)');
  // 22/10 step 2 — attachments apart from the text: « 📎 7 pièces jointes » on top, small thumbnails (46px) under the cards.
  const idx=await page.evaluate(()=>[...document.querySelectorAll('#content .reader-list .reader-item')].findIndex(e=>/Photos du chantier/.test(e.textContent)));
  assert(idx>=0,'Trial message with attachments present');await openAt(idx);
  const att=await page.evaluate(()=>{const box=document.querySelector('#content .reader-files'),th=[...box.querySelectorAll('.reader-thumb')],bw=box.getBoundingClientRect();
   return {thumbs:th.length,visible:th.filter(t=>{const r=t.getBoundingClientRect();return r.left>=bw.left-1&&r.right<=bw.right+1;}).length,h:Math.round(th[0].getBoundingClientRect().height),noBig:!document.querySelector('#content .home-reader .reader-body img'),count:/📎 7 pièces jointes/.test(document.querySelector('#content .home-reader').innerText),list:getComputedStyle(document.querySelector('#content .reader-list')).visibility};});
  console.log('attachments',JSON.stringify(att));
  assert.equal(att.thumbs,7);assert(att.visible>=6,'Small thumbnails, most visible');assert(att.h<=48,'Thumbnails as small as an action button');assert(att.noBig&&att.count,'Files apart from the text, count on top');assert.equal(att.list,'visible','Cards stay');
  // Under the cards, above the function pages; the message reads like an e-mail (22/10).
  const place=await page.evaluate(()=>{const l=document.querySelector('#content .reader-list').getBoundingClientRect(),b=document.querySelector('#content .reader-files').getBoundingClientRect(),pg=document.querySelector('#content .home-pages').getBoundingClientRect(),r=document.querySelector('#content .home-reader').innerText;return {under:Math.round(b.top-l.bottom),above:Math.round(pg.top-b.bottom),mail:/De\s/.test(r)&&/Objet/.test(r)&&/Claire Lefèvre/.test(r)};});
  console.log('attachments place',JSON.stringify(place));assert(place.under>=0&&place.above>=0,'Thumbnails between the cards and the functions');assert(place.mail,'E-mail header and text');
  // First function row = function of the message being read (marked), then the next ones, each once.
  const row=await page.evaluate(()=>{const pg=document.querySelector('#content .home-page'),cols=Number(document.querySelector('#content .home-pages').dataset.columns)||4;const cells=[...pg.children].slice(cols,cols*2);return {mods:cells.map(e=>e.dataset.module),reading:cells.map(e=>e.classList.contains('is-reading')),want:window.homeReader.readingModules(cols)};});
  console.log('reading row',JSON.stringify(row));assert.equal(row.mods[0],row.want[0]);assert.equal(row.reading[0],true,'Marked « en lecture »');assert.deepEqual(row.mods.slice(0,row.want.length),row.want,'Functions of the next messages, in order');
  await page.screenshot({path:out+'/89-lecteur-pieces-jointes.png'});
  // Tap = full-screen viewer: the file big, no buttons on top, mini carousel; another mini changes the file; Escape closes.
  await page.locator('#content .reader-thumb[data-file="0"]').click();await page.locator('.img-viewer').waitFor();
  const iv=await page.evaluate(()=>{const v=document.querySelector('.img-viewer').getBoundingClientRect(),img=document.querySelector('.img-viewer .iv-img')?.getBoundingClientRect();return {w:Math.round(v.width),h:Math.round(v.height),img:img?Math.round(img.width):0,minis:document.querySelectorAll('.img-viewer .iv-mini').length,buttons:[...document.querySelectorAll('.img-viewer button')].filter(b=>!b.classList.contains('iv-mini')&&!b.classList.contains('sr-only')).length};});
  console.log('viewer',JSON.stringify(iv));assert(iv.w>=389&&iv.minis===7&&iv.buttons===0&&iv.img>200,'Full-screen viewer, big image, 7 minis, no buttons '+JSON.stringify(iv));
  await page.screenshot({path:out+'/90-visionneuse.png'});
  await page.locator('.img-viewer .iv-mini[data-i="5"]').click();
  assert.match(await page.locator('.img-viewer .iv-doc').textContent(),/Devis_D-2041\.pdf/,'Mini changes the file (PDF shown)');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.img-viewer').count(),0,'Viewer closed');
  await page.evaluate(()=>document.querySelector('#content .reader-list').scrollTo({top:0}));await page.waitForTimeout(800);
  assert.equal(await page.locator('#content .reader-files').count(),0,'Thumbnails gone back home');
  await page.evaluate(()=>{try{localStorage.setItem('aia-reader-samples','off');}catch(e){}});
  // Settings follow the account (22/10): a change here is saved, and a new phone gets it at sign-in.
  await page.evaluate(()=>localStorage.setItem('aia-pages-grid',JSON.stringify({cols:4,rows:3})));await page.waitForTimeout(900);
  const saved=await page.evaluate(()=>api('/api/me').then(m=>m.prefs));console.log('prefs',JSON.stringify(saved));
  assert.deepEqual(saved.grid,{cols:4,rows:3},'Grid saved in the account');
  await page.evaluate(()=>{localStorage.removeItem('aia-pages-grid');window.applyPrefs({grid:{cols:4,rows:3}});});
  assert.equal(await page.evaluate(()=>localStorage.getItem('aia-pages-grid')),JSON.stringify({cols:4,rows:3}),'Applied from the account');
  await page.evaluate(()=>api('/api/me/prefs',{method:'PUT',body:JSON.stringify({grid:{cols:4,rows:2}})}));await page.evaluate(()=>localStorage.setItem('aia-pages-grid',JSON.stringify({cols:4,rows:2})));
  // Trial banks (22/10): the account-menu switch adds them, the dial shows them, the same switch removes them.
  await page.locator('#content .home-account-slot .account-menu summary').click();
  await page.locator('#accountTrialBanks').waitFor();await page.waitForTimeout(500);
  if(await page.locator('#accountTrialBanks').getAttribute('aria-checked')!=='true'){
   await page.locator('#accountTrialBanks').click();await page.waitForTimeout(1500);
   const n=await page.evaluate(()=>api(`/api/companies/${company.id}/banks`).then(d=>d.banks.filter(b=>b.name.startsWith('Essai · ')).length));
   assert.equal(n,3,'Trial banks added');await page.screenshot({path:out+'/94-banques-essai.png'});
   page.once('dialog',d=>d.accept());
   await page.locator('#content .home-account-slot .account-menu summary').click();await page.waitForTimeout(600);
   await page.locator('#accountTrialBanks').click();await page.waitForTimeout(1500);
   assert.equal(await page.evaluate(()=>api(`/api/companies/${company.id}/banks`).then(d=>d.banks.filter(b=>b.name.startsWith('Essai · ')).length)),0,'Trial banks removed');
  }
  assert.deepEqual(errors,[]);
  console.log('pages ok');
 }catch(e){await page.screenshot({path:out+'/99-iphone-erreur.png'}).catch(()=>{});console.error(e);process.exitCode=1;}
 finally{await browser.close();}
})();
