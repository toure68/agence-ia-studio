'use strict';
// Function dial: a function opens in place of the home grid (same frame, no screen change, no scroll),
// with a small strip of the other functions at the bottom; "Voir tout" opens the full function.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('#content .module-grid .module-tile').first().waitFor();
  // Make sure "Clients" is on the grid and has something to preview.
  await page.evaluate(async()=>{
   const cid=company.id,w=await api(`/api/companies/${cid}/workspace`);
   await api(`/api/companies/${cid}/clients`,{method:'POST',body:JSON.stringify({name:'Client Cadran Fonction',phone:'0600000000'})});
   await api(`/api/companies/${cid}/workspace`,{method:'PUT',body:JSON.stringify({domain:w.domain,visible:w.visible.includes('clients')?w.visible:['clients',...w.visible],version:w.version,columns:2,rows:10})});
  });
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid [data-go="clients"]').waitFor();
  await page.locator('#content .module-grid [data-go="clients"]').scrollIntoViewIfNeeded();
  const tiles=await page.locator('#content .module-grid:not(.module-reserve-grid-inline) .module-tile[data-go]').count();
  const lightCheck=sel=>page.locator(sel).evaluate(root=>{const rgb=v=>{const m=String(v).match(/rgba?\(([^)]+)\)/);if(!m)return null;const [r,g,b,a=1]=m[1].split(/[\s,/]+/).filter(Boolean).map(Number);return {r,g,b,a};},lum=c=>(0.2126*c.r+0.7152*c.g+0.0722*c.b)/255;
   const bad=[];for(const el of root.querySelectorAll('*')){if(/^(INPUT|SELECT|TEXTAREA|BUTTON|OPTION|svg|path|IMG)$/i.test(el.tagName)||el.closest('svg,.btn,.badge')||!el.getClientRects().length)continue;const cs=getComputedStyle(el),bg=rgb(cs.backgroundColor),fg=rgb(cs.color);
    if(bg&&bg.a>0.3&&lum(bg)>0.78)bad.push('light:'+el.className);
    if(fg&&lum(fg)<0.22&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))bad.push('dark text:'+el.className+':'+el.textContent.trim().slice(0,30));}
   return bad;});
  const geo=()=>page.evaluate(()=>{const w=document.querySelector('#contextPanel')||document.querySelector('#modalLayer:not(.hide) .modal'),f=document.querySelector('#moduleFocus'),s=f?.querySelector('.focus-apps');
   const r=w?.getBoundingClientRect(),fr=f?.getBoundingClientRect(),sr=s?.getBoundingClientRect();
   return {win:r&&{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom},frame:fr&&{x:fr.x,y:fr.y,w:fr.width,bottom:fr.bottom},strip:sr&&{top:sr.top,h:sr.height},vh:innerHeight};});
  const waitWindow=async key=>{await page.waitForFunction(k=>document.body.classList.contains('dock-to-focus')&&document.querySelector(`#moduleFocus [data-focus-app="${k}"]`)?.getAttribute('aria-pressed')==='true'&&(document.querySelector('#contextPanel #dockBack')||document.querySelector('#modalLayer:not(.hide) .modal')),key);await page.evaluate(async()=>{await navigationQueue;});};
  const toGrid=async()=>{await page.evaluate(()=>{if(document.querySelector('#contextPanel'))closeContext();else if(document.querySelector('#modalLayer:not(.hide)'))closeModal();});await page.evaluate(async()=>{await navigationQueue;});
   await page.waitForFunction(()=>!document.querySelector('#moduleFocus')&&!document.body.classList.contains('dock-to-focus'));};
  // Tapping a function opens its full window directly (no summary step), on the function frame, app strip below.
  await page.locator('#content .module-grid [data-go="clients"]').click();await waitWindow('clients');
  await page.locator('#contextPanel').getByText('Client Cadran Fonction').first().waitFor();
  // Windows open maximized by default: home blurred behind, app strip at the bottom; ⤡ puts it back on the frame.
  const full=await page.evaluate(()=>{const p=document.querySelector('#contextPanel').getBoundingClientRect(),b=document.querySelector('#dockAppBar')?.getBoundingClientRect(),cs=getComputedStyle(document.querySelector('#contextLayer'));return {on:document.body.classList.contains('dock-expanded'),w:p.width,bottom:p.bottom,bar:b&&{top:b.top,h:b.height,bottom:b.bottom},blur:cs.backdropFilter||cs.webkitBackdropFilter||'',vw:innerWidth,vh:innerHeight};});
  assert(full.on&&full.w>=full.vw-40,'Maximized by default '+JSON.stringify(full));
  assert(full.bar&&full.bar.h>20&&full.bar.bottom<=full.vh+1&&full.bottom<=full.bar.top+1,'App strip under the maximized window '+JSON.stringify(full));
  assert(/blur/.test(full.blur),'Home blurred behind the window '+JSON.stringify(full));
  await page.locator('#dockExpand').click();
  assert(!await page.evaluate(()=>document.body.classList.contains('dock-expanded')),'⤡ puts the window back on the frame');
  const g=await geo();
  assert(Math.abs(g.win.x-g.frame.x)<=2&&Math.abs(g.win.w-g.frame.w)<=2&&g.win.y<=Math.max(8,g.frame.y)+1,'Window on the function frame '+JSON.stringify(g));
  assert(g.strip.top+g.strip.h<=g.vh+1,'App strip fully on screen '+JSON.stringify(g));
  assert(g.strip&&g.strip.h>20&&Math.abs(g.win.bottom-(g.strip.top-6))<=2,'App strip right under the window '+JSON.stringify(g));
  assert(g.win.h>=g.vh*0.5,'Big window '+JSON.stringify(g));
  assert(await page.locator('#moduleFocus .focus-kpis').evaluate(e=>getComputedStyle(e).visibility==='hidden'),'No summary step');
  assert(await page.locator('#moduleFocus .focus-apps').evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&e.contains(hit);}),'App strip visible and usable under the window');
  const strip=page.locator('#moduleFocus .focus-app');assert.equal(await strip.count(),tiles);
  const box=await strip.first().locator('.module-icon').boundingBox();assert(box.width<=44&&box.height<=44,'Small format');
  assert.equal(await strip.first().locator('.focus-app-name').count(),1,'Name band above each app');
  assert(await page.locator('#moduleFocus .focus-apps').evaluate(e=>e.scrollHeight<=e.clientHeight+1&&getComputedStyle(e).overflowY==='hidden'),'Strip never moves up or down');
  // Header: apps button, one big back arrow with a small number, Assistant IA in place of the title, ⤢.
  assert(await page.locator('#dockApps').isVisible(),'Apps button');
  assert.equal((await page.locator('#dockBack').innerText()).trim(),'1','Single back button with the number of steps');
  const backLook=await page.locator('#dockBack').evaluate(b=>{const i=b.querySelector('svg').getBoundingClientRect(),n=parseFloat(getComputedStyle(b.querySelector('.dock-back-n')).fontSize),r=b.getBoundingClientRect();return {icon:i.height,n,h:r.height};});
  assert(backLook.icon>=22&&backLook.n<backLook.icon&&backLook.h>=40,'Large iOS-style back chevron, smaller step number '+JSON.stringify(backLook));
  assert(await page.locator('#dockAssistant').isVisible(),'Assistant IA in the window header');
  assert(await page.locator('#contextTitle').isHidden(),'No title in the header: the name is in the strip');
  assert.equal(await page.locator('#assistantDock').evaluate(e=>getComputedStyle(e).visibility),'hidden','Home assistant moved into the window');
  const headerBacks=await page.locator('#contextPanel .context-header').evaluate(h=>[...h.querySelectorAll('button,a')].filter(b=>b.getClientRects().length&&/‹|back|Revenir/i.test((b.textContent||'')+(b.getAttribute('aria-label')||'')+(getComputedStyle(b,'::before').content||''))).length);
  assert(headerBacks<=1,'One back arrow only, got '+headerBacks);
  const dark=await page.locator('#contextPanel').evaluate(e=>{const m=getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number);return (m[0]+m[1]+m[2])/3;});assert(dark<60,'Dark window '+dark);
  await page.waitForTimeout(150);assert.deepEqual(await lightCheck('#contextPanel'),[],'Readable dark window');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  // The assistant opens from the window without closing it; the back arrow returns to the function.
  await page.locator('#dockAssistant').click();
  await page.waitForFunction(()=>document.querySelector('#contextPanel #assistantChat')&&document.querySelector('#dockBack')?.dataset.n==='2');
  const composer=await page.evaluate(()=>{const t=document.querySelector('#assistantMessage'),m=document.querySelector('.chat-attach-menu'),cs=getComputedStyle(t),bg=getComputedStyle(m).backgroundColor,bar=document.querySelector('.chat-toolbar').getBoundingClientRect();return {pad:parseFloat(cs.paddingLeft),menuBg:bg,gap:Math.round(bar.top-t.getBoundingClientRect().bottom)};});
  assert(composer.pad>=10&&/rgba\(0, 0, 0, 0\)|transparent/.test(composer.menuBg),'Assistant field: text inside the field, round + without a square block '+JSON.stringify(composer));
  assert(composer.gap>=10,'Buttons below the field are not stuck to it '+JSON.stringify(composer));
  await page.locator('#dockBack').click();
  await page.waitForFunction(()=>document.querySelector('#dockBack')?.dataset.n==='1'&&!document.querySelector('#contextPanel #assistantChat'));
  await page.locator('#contextPanel').getByText('Client Cadran Fonction').first().waitFor();
  // Another app in the strip: its window opens directly in place of this one.
  const other=page.locator('#moduleFocus .focus-app[aria-pressed="false"]').first();
  if(await other.count()){const k=await other.getAttribute('data-focus-app');await other.click();await waitWindow(k);
   if(await page.locator('#dockBack').count())assert.equal((await page.locator('#dockBack').innerText()).trim(),'1','Fresh window after switching');
   await page.locator('#moduleFocus [data-focus-app="clients"]').click();await waitWindow('clients');}
  // Déployer still works.
  await page.locator('#dockExpand').click();
  assert((await page.locator('#contextPanel').boundingBox()).width>g.frame.w,'Déployer widens the window');
  await page.locator('#dockExpand').click();
  // Keyboard open while typing in a docked form: the form leaves the frame and fills the visible area above
  // the keyboard, with the field in view; it returns onto the frame when the keyboard closes.
  await page.evaluate(()=>{openTab('client-new');});await page.locator('#contextPanel #clientName').waitFor();
  await page.waitForFunction(()=>document.querySelector('#dockBack')?.dataset.n==='2');
  const dockedBox=await page.locator('#contextPanel').boundingBox();
  const field=page.locator('#contextPanel input:not([type=hidden])').first();await field.focus();
  const kb=await page.evaluate(()=>{const real=window.visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:innerHeight-340,width:innerWidth,offsetTop:0,offsetLeft:0,addEventListener(){}}});
   document.documentElement.style.setProperty('--dialog-height',(innerHeight-340)+'px');document.documentElement.style.setProperty('--dialog-top','0px');moduleDockKeyboard();
   const r=document.querySelector('#contextPanel').getBoundingClientRect(),f=document.activeElement.getBoundingClientRect();
   window.__realVV=real;return {on:document.body.classList.contains('dock-keyboard'),top:r.top,bottom:r.bottom,limit:innerHeight-340,field:{top:f.top,bottom:f.bottom}};});
  assert(kb.on&&kb.top<=12&&kb.bottom<=kb.limit+1,'Form fills the space above the keyboard '+JSON.stringify(kb));
  await page.waitForTimeout(300);
  const fieldBox=await field.boundingBox();assert(fieldBox.y>=0&&fieldBox.y+fieldBox.height<=kb.limit+1,'Active field visible above the keyboard');
  await page.evaluate(()=>{Object.defineProperty(window,'visualViewport',{configurable:true,value:window.__realVV});syncDialogViewport();document.activeElement.blur();moduleDockKeyboard();});
  const back=await page.locator('#contextPanel').boundingBox();assert(Math.abs(back.y-dockedBox.y)<=2&&Math.abs(back.height-dockedBox.height)<=2,'Back onto the frame when the keyboard closes');
  // Guided entry: "Suivant" key moves to the next field, a complete phone number moves on by itself,
  // the validate button stays visible at the bottom, a small progress shows where you are.
  await page.waitForFunction(()=>document.querySelector('#clientName')?.getAttribute('enterkeyhint')==='next');
  await page.locator('#clientName').focus();await page.keyboard.type('Client Guidé');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'clientEmail','Enter goes to the next field');
  await page.keyboard.type('guide@example.test');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'clientPhone');
  await page.keyboard.type('0612345678');await page.waitForFunction(()=>document.activeElement.id==='clientAddress');
  const guide=await page.evaluate(()=>{const b=document.querySelector('#clientForm .fg-primary');const typing=getComputedStyle(b).position;const cur=document.activeElement;cur.blur();const idle=getComputedStyle(b).position;cur.focus();return {sticky:typing==='static'&&idle==='sticky',current:!!document.querySelector('#clientAddress').closest('.fg-current'),progress:document.querySelector('#clientForm .fg-progress span')?.textContent||''};});
  assert(guide.sticky&&guide.current&&/\d+ \/ \d+/.test(guide.progress),'Guided entry '+JSON.stringify(guide));
  assert.equal(await page.evaluate(async()=>(await api(`/api/companies/${company.id}/clients`)).some(c=>c.name==='Client Guidé')),false,'Never submits on its own');
  const ring=await page.evaluate(()=>{const f=document.querySelector('#clientAddress');f.focus();const w=f.closest('.fg-current'),cs=getComputedStyle(f);return {wrapOutline:w?getComputedStyle(w).outlineStyle:'none',inputOutline:cs.outlineStyle,shadow:cs.boxShadow};});
  assert(ring.wrapOutline==='none'&&ring.inputOutline==='none'&&ring.shadow!=='none','One single ring on the active field '+JSON.stringify(ring));
  // Swipe from the left edge to the right = back one step; at the first step it closes the window (home grid).
  const edgeSwipe=(dx=150,dy=4)=>page.evaluate(([dx,dy])=>{window.__edgeBackForce=true;const el=document.elementFromPoint(6,420)||document.body,mk=(x,y)=>new Touch({identifier:7,target:el,clientX:x,clientY:y});
   el.dispatchEvent(new TouchEvent('touchstart',{touches:[mk(6,420)],changedTouches:[mk(6,420)],bubbles:true,cancelable:true}));
   el.dispatchEvent(new TouchEvent('touchmove',{touches:[mk(6+dx/2,420+dy/2)],changedTouches:[mk(6+dx/2,420+dy/2)],bubbles:true,cancelable:true}));
   el.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[mk(6+dx,420+dy)],bubbles:true,cancelable:true}));},[dx,dy]);
  await page.evaluate(()=>document.activeElement?.blur());
  await edgeSwipe(30,200);await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.querySelector('#dockBack')?.dataset.n),'2','A vertical move is a scroll, never a back');
  await edgeSwipe();
  await page.waitForFunction(()=>document.querySelector('#dockBack')?.dataset.n==='1'&&!document.querySelector('#clientForm'));
  await page.evaluate(async()=>{await navigationQueue;});
  await edgeSwipe();
  await page.waitForFunction(()=>!document.querySelector('#contextPanel')&&!document.querySelector('#moduleFocus'));
  await page.evaluate(async()=>{await navigationQueue;});
  // Closing the window returns to the home grid, with the assistant back in its place.
  await toGrid();
  assert(await page.locator('#content .module-grid [data-go="clients"]').isVisible(),'Grid back');
  assert(await page.locator('.module-reserve-launch').isVisible(),'Reserve button back');
  assert.equal(await page.locator('#assistantDock').evaluate(e=>getComputedStyle(e).visibility),'visible','Assistant back in its place');
  // Exports stay inside the app: the CSV goes to the share sheet, the page does not navigate to a file.
  await page.evaluate(()=>{openTab('prospects');});await page.locator('a[href="/api/prospects-export"]').waitFor();
  const urlBefore=page.url();
  await page.evaluate(()=>{navigator.canShare=()=>true;navigator.share=async d=>{window.__shared=d.files[0].name+':'+d.files[0].size;};});
  await page.locator('a[href="/api/prospects-export"]').click();await page.waitForFunction(()=>window.__shared);
  assert.equal(page.url(),urlBefore,'No navigation to a bare file page');
  assert((await page.evaluate(()=>window.__shared)).startsWith('prospects-agence-ia.csv:'));
  await page.locator('#closeContext').click();await page.locator('#contextPanel').waitFor({state:'detached'});await page.evaluate(async()=>{await navigationQueue;});
  // Forms opened from home buttons (e.g. "Traiter l'activité") are dark and nothing overflows.
  await page.evaluate(()=>openCommand('task'));await page.locator('#commandText').waitFor();await page.waitForTimeout(150);
  assert.deepEqual(await lightCheck('#modalLayer .modal'),[],'Readable dark form');
  const fit=await page.locator('#modalLayer .modal').evaluate(m=>{const r=m.getBoundingClientRect();return [...m.querySelectorAll('input,select,textarea')].filter(i=>i.getClientRects().length).every(i=>i.getBoundingClientRect().right<=r.right+1);});
  assert(fit,'Fields stay inside the form');
  await page.keyboard.press('Escape');await page.locator('#modalLayer.hide').waitFor({state:'attached'});
  // Window header outside the frame (e.g. the assistant from the home): equal round buttons on one line, and at the
  // first step only × (no second way out); the back arrow comes back one step deeper.
  await page.evaluate(()=>{openTab('clients');});await page.locator('#contextPanel').waitFor();await page.evaluate(async()=>{await navigationQueue;});
  const head=()=>page.evaluate(()=>{const vis=e=>!!e&&e.getClientRects().length>0,box=e=>{const r=e.getBoundingClientRect();return {h:Math.round(r.height),w:Math.round(r.width),c:Math.round(r.top+r.height/2)};};
   const back=document.querySelector('#moduleBack [data-back]'),close=document.querySelector('#closeContext'),voice=document.querySelector('.context-header .voice-button');
   return {back:vis(back)?box(back):null,close:vis(close)?box(close):null,voice:vis(voice)?box(voice):null};});
  let h=await head();
  assert(!h.back&&h.close,'First step: × only, no duplicate back arrow '+JSON.stringify(h));
  for(const b of [h.close,h.voice].filter(Boolean))assert(b.h===40&&b.w===40,'Same size buttons '+JSON.stringify(h));
  if(h.voice)assert(Math.abs(h.voice.c-h.close.c)<=1,'Buttons on one line '+JSON.stringify(h));
  await page.evaluate(()=>{openTab('client-new');});await page.locator('#contextPanel #clientName').waitFor();await page.evaluate(async()=>{await navigationQueue;});
  h=await head();
  assert(h.back&&h.back.h===40&&Math.abs(h.back.c-h.close.c)<=1,'One step deeper: back arrow, same size, same line '+JSON.stringify(h));
  await page.evaluate(()=>closeContext());await page.waitForFunction(()=>!document.querySelector('#contextPanel'));await page.evaluate(async()=>{await navigationQueue;});
  // Typing in any form (not only on the function frame): the form fills the visible area above the keyboard,
  // the close bar steps aside and the active field is in view; everything comes back when the keyboard closes.
  await page.evaluate(()=>{openTab('client-new');});await page.locator('#contextPanel #clientName').waitFor();await page.evaluate(async()=>{await navigationQueue;});
  assert(!await page.evaluate(()=>document.body.classList.contains('dock-to-focus')),'A plain window, not on the frame');
  const lastField=page.locator('#contextPanel input:not([type=hidden])').last();await lastField.focus();
  const typingMode=await page.evaluate(()=>{const real=window.visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:innerHeight-340,width:innerWidth,offsetTop:0,offsetLeft:0,addEventListener(){}}});
   document.documentElement.style.setProperty('--dialog-height',(innerHeight-340)+'px');document.documentElement.style.setProperty('--dialog-top','0px');moduleDockKeyboard();window.__realVV=real;
   const r=document.querySelector('#contextPanel').getBoundingClientRect(),foot=document.querySelector('.context-footer');
   return {on:document.body.classList.contains('kb-open'),top:r.top,bottom:r.bottom,limit:innerHeight-340,footer:foot?getComputedStyle(foot).display:'none'};});
  assert(typingMode.on&&typingMode.top<=2&&typingMode.bottom<=typingMode.limit+1&&typingMode.footer==='none','Form fills the space above the keyboard, close bar hidden '+JSON.stringify(typingMode));
  await page.waitForTimeout(350);
  const lastBox=await lastField.boundingBox();assert(lastBox.y>=40&&lastBox.y+lastBox.height<=typingMode.limit+1,'Active field visible above the keyboard '+JSON.stringify(lastBox));
  await page.evaluate(()=>{Object.defineProperty(window,'visualViewport',{configurable:true,value:window.__realVV});syncDialogViewport();document.activeElement.blur();moduleDockKeyboard();});
  assert(!await page.evaluate(()=>document.body.classList.contains('kb-open')),'Normal window again when the keyboard closes');
  await page.evaluate(()=>closeContext());await page.waitForFunction(()=>!document.querySelector('#contextPanel'));await page.evaluate(async()=>{await navigationQueue;});
  // The apps button of the window returns to all functions.
  await page.locator('#content .module-grid [data-go="clients"]').click();await waitWindow('clients');
  await page.locator('#dockApps').click();await page.evaluate(async()=>{await navigationQueue;});
  await page.waitForFunction(()=>!document.querySelector('#moduleFocus')&&!document.querySelector('#contextPanel'));
  // Tiny grid (4 columns, 1 row): too little room on the frame, the function still opens in a full window.
  await page.evaluate(async()=>{const cid=company.id,w=await api(`/api/companies/${cid}/workspace`);await api(`/api/companies/${cid}/workspace`,{method:'PUT',body:JSON.stringify({domain:w.domain,visible:w.visible,version:w.version,columns:4,rows:1})});});
  await page.reload({waitUntil:'networkidle'});const small=page.locator('#content .module-grid .module-tile').first();await small.waitFor();
  await small.click();await page.waitForFunction(()=>document.querySelector('#contextPanel')||document.querySelector('#modalLayer:not(.hide) .modal'));
  assert(await page.locator('#contextPanel,#modalLayer:not(.hide) .modal').first().isVisible(),'Window opens even with a tiny grid');
  await page.evaluate(()=>{if(document.querySelector('#contextPanel'))closeContext();else closeModal();});await page.evaluate(async()=>{await navigationQueue;});
  await page.waitForFunction(()=>!document.querySelector('#moduleFocus')&&!document.querySelector('#contextPanel'));
  // Action cards: the green button opens the action's window directly, docked on the function frame like a function.
  await page.evaluate(async()=>{const cid=company.id,w=await api(`/api/companies/${cid}/workspace`);await api(`/api/companies/${cid}/workspace`,{method:'PUT',body:JSON.stringify({domain:w.domain,visible:w.visible,version:w.version,columns:2,rows:4})});});
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').first().waitFor({state:'attached'});
  const card=page.locator('.priority-card:has([data-priority-open])').first();
  if(await card.count()){
   const module=await card.getAttribute('data-priority-module');
   const known=await page.evaluate(m=>(homeLayout.workspace?.modules||[]).some(x=>x.key===m)&&!!document.querySelector(`#content .module-grid [data-go="${m}"]`),module);
   if(known){
    await card.locator('[data-priority-open]').click();await waitWindow(module);
    if(await page.locator('#contextPanel').count())assert(await page.evaluate(()=>document.body.classList.contains('dock-expanded')&&!!document.querySelector('#dockAppBar [data-focus-app]')),'Action window maximized, app strip at the bottom');
    else{const w=await geo();assert(Math.abs(w.win.x-w.frame.x)<=2&&Math.abs(w.win.w-w.frame.w)<=2,'Action list docked on the function frame '+JSON.stringify(w));}
    await toGrid();
   }
  }
  // Every function window, opened from the grid then from the strip: no card inside a card, the app strip
  // stays available docked AND in full screen (⤢), and the full-screen strip switches window.
  {
   const keys=await page.evaluate(()=>(homeLayout.workspace?.modules||[]).map(m=>m.key));
   await page.evaluate(()=>{moduleDock.preferExpanded=false;}); // checked on the frame here; maximized is checked above
   const report=[],checked=[];
   for(const key of keys){
    const inStrip=page.locator(`#moduleFocus [data-focus-app="${key}"]`),docked=await page.evaluate(()=>!!document.querySelector('#contextPanel')&&document.body.classList.contains('dock-to-focus'));
    if(docked&&await inStrip.count())await inStrip.click();
    else{
     if(await page.locator('#contextPanel,#modalLayer:not(.hide)').count())await toGrid();
     const tile=page.locator(`#content .module-grid [data-go="${key}"]`);if(!await tile.count())continue;await tile.click();
    }
    const opened=await page.waitForFunction(k=>document.querySelector(`#moduleFocus [data-focus-app="${k}"]`)?.getAttribute('aria-pressed')==='true'&&(document.querySelector('#contextPanel .context-scroll')||document.querySelector('#modalLayer:not(.hide) .modal')),key,{timeout:6000}).then(()=>true,()=>false);
    if(!opened){report.push(key+': no window');continue;}
    await page.evaluate(async()=>{await navigationQueue;});
    await page.waitForTimeout(600);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const m=await page.evaluate(()=>{
     const win=document.querySelector('#contextPanel .context-scroll')||document.querySelector('#modalLayer:not(.hide) .modal');
     const deep=[];
     for(const el of win.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color]),select,textarea,h1,h2,h3,h4,label')){
      if(!el.getClientRects().length||el.closest('li,ul,ol,table,button,a,.fg-progress'))continue;
      let indent=0;for(let a=el.parentElement;a&&a!==win;a=a.parentElement){const cs=getComputedStyle(a);indent+=parseFloat(cs.paddingLeft)+parseFloat(cs.borderLeftWidth)+Math.max(0,parseFloat(cs.marginLeft));}
      if(indent>8)deep.push(`${el.tagName}:${(el.textContent||el.name||'').trim().slice(0,24)}=${Math.round(indent)}px`);
     }
     const strip=document.querySelector('#moduleFocus .focus-apps'),sr=strip?.getBoundingClientRect(),w=(document.querySelector('#contextPanel')||document.querySelector('#modalLayer:not(.hide) .modal')).getBoundingClientRect();
     return {deep:deep.slice(0,6),strip:!!sr&&sr.height>20&&sr.top>=w.bottom-1&&sr.bottom<=innerHeight+1,docked:document.body.classList.contains('dock-to-focus')};
    });
    checked.push(key);
    if(m.deep.length)report.push(`${key}: nested box ${m.deep.join(', ')}`);
    if(!m.docked)report.push(key+': window not on the function frame');
    else if(!m.strip)report.push(key+': app strip hidden under the window');
    if(await page.locator('#dockExpand').count()){
     await page.locator('#dockExpand').click();
     const x=await page.evaluate(()=>{const b=document.querySelector('#dockAppBar'),p=document.querySelector('#contextPanel').getBoundingClientRect();if(!b)return {bar:false};const r=b.getBoundingClientRect();return {bar:r.height>20&&r.bottom<=innerHeight+1,above:p.bottom<=r.top+1,apps:b.querySelectorAll('[data-focus-app]').length,dial:document.querySelectorAll('#moduleFocus .focus-apps [data-focus-app]').length};});
     if(!x.bar)report.push(key+': app strip missing in full screen');else{if(!x.above)report.push(key+': full-screen window covers the strip');if(x.apps!==x.dial)report.push(key+': full-screen strip differs from the dial');}
     await page.locator('#dockExpand').click();
     if(await page.locator('#dockAppBar').count())report.push(key+': strip left after leaving full screen');
    }
   }
   assert(checked.length>=3,'Enough function windows checked '+checked.join(','));
   assert.deepEqual(report,[],'All function windows: '+report.join(' | '));
   // Full-screen strip: touching another app opens its window directly.
   const [first,second]=checked;
   await toGrid();await page.locator(`#content .module-grid [data-go="${first}"]`).click();await waitWindow(first);
   await page.waitForFunction(()=>document.querySelector('#dockExpand'));
   await page.locator('#dockExpand').click();await page.locator(`#dockAppBar [data-focus-app="${second}"]`).click();
   await waitWindow(second);
   assert(await page.evaluate(()=>document.body.classList.contains('dock-expanded')&&!!document.querySelector('#dockAppBar')),'Next window maximized too, strip at the bottom');
   await page.locator('#dockExpand').click();
   console.log('Function windows checked:',checked.join(', '));
   // No white frame around the current app of the strip (keyboard focus = green ring on the icon only).
   const ring=await page.locator('#moduleFocus .focus-app.is-current').evaluate(b=>{b.focus();const cs=getComputedStyle(b);return {outline:cs.outlineStyle,width:cs.outlineWidth};});
   assert(ring.outline==='none'||ring.width==='0px','No white frame around the current app '+JSON.stringify(ring));
   await toGrid();
  }
  // Glass design: wallpaper chosen from the account menu, saved on the account, glass cards over it.
  {
   assert.equal(await page.evaluate(()=>document.body.dataset.wall),'nuit','Default wallpaper: Uni nuit');
   await page.locator('.account-menu summary').click();await page.locator('#accountWallpaper').click();
   await page.locator('#modalLayer [data-wallpaper="aurore"]').click();
   await page.waitForFunction(()=>document.body.dataset.wall==='aurore'&&me.wallpaper==='aurore');
   await page.evaluate(()=>closeModal());
   await page.evaluate(()=>{try{localStorage.removeItem('aia-wallpaper')}catch(e){}});
   await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').first().waitFor({state:'attached'});
   await page.waitForFunction(()=>document.body.dataset.wall==='aurore');
   const glass=await page.evaluate(()=>{const t=document.querySelector('.reference-home .home-treasury,.reference-home .module-focus,.reference-home .module-grid>.module-card');const cs=getComputedStyle(t);const w=getComputedStyle(document.querySelector('#appWall'));return {blur:(cs.backdropFilter||cs.webkitBackdropFilter||''),wall:w.display,img:w.backgroundImage};});
   assert(/blur/.test(glass.blur),'Frosted glass cards '+JSON.stringify(glass));
   // Windows take the wallpaper's colours too (frosted glass, not flat grey).
   await page.evaluate(()=>{openTab('clients');});await page.locator('#contextPanel').waitFor();await page.evaluate(async()=>{await navigationQueue;});
   const win=await page.locator('#contextPanel').evaluate(p=>{const cs=getComputedStyle(p),m=cs.backgroundColor.match(/[\d.]+/g)||[];return {blur:cs.backdropFilter||cs.webkitBackdropFilter||'',alpha:m.length>3?Number(m[3]):1,header:getComputedStyle(p.querySelector('.context-header')).backgroundColor};});
   assert(/blur/.test(win.blur)&&win.alpha<0.95&&/rgba\(0, 0, 0, 0\)|transparent/.test(win.header),'Window in frosted glass over the wallpaper '+JSON.stringify(win));
   await page.evaluate(()=>closeContext());await page.waitForFunction(()=>!document.querySelector('#contextPanel'));await page.evaluate(async()=>{await navigationQueue;});assert(glass.wall==='block'&&/gradient/.test(glass.img),'Wallpaper behind the home '+JSON.stringify(glass));
   await page.evaluate(async()=>{await api('/api/me/wallpaper',{method:'PUT',body:JSON.stringify({wallpaper:'nuit'})});applyWallpaper('nuit');});
  }
  // Preview endpoint is company-scoped and read-only.
  const peek=await page.evaluate(async()=>api(`/api/companies/${company.id}/module-peek/clients`));
  assert(peek.items.length>=1&&peek.items.length<=3);
  assert.deepEqual(errors,[]);
  console.log('Function windows: open directly on the frame, app strip below, assistant in the header, back to the grid.');
 }catch(error){
  console.error('Function dial details',JSON.stringify({url:page.url(),errors,body:(await page.locator('#moduleFocus').innerText().catch(()=>'')).slice(0,800)}));
  throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
