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
  const before=await page.evaluate(()=>({scroll:scrollY,top:document.querySelector('#content .module-grid').getBoundingClientRect().top,height:Math.round(document.querySelector('.module-reserve-launch').getBoundingClientRect().bottom-document.querySelector('#content .module-grid').getBoundingClientRect().top),page:document.documentElement.scrollHeight,url:location.href,tiles:document.querySelectorAll('#content .module-grid:not(.module-reserve-grid-inline) .module-tile').length}));
  await page.locator('#content .module-grid [data-go="clients"]').click();
  const frame=page.locator('#moduleFocus');await frame.waitFor();
  const after=await page.evaluate(()=>({scroll:scrollY,top:document.querySelector('#moduleFocus').getBoundingClientRect().top,url:location.href}));
  assert.equal(after.url,before.url,'No screen change');assert(Math.abs(after.scroll-before.scroll)<2,'No scroll');assert(Math.abs(after.top-before.top)<2,'Same place as the grid '+JSON.stringify({before,after}));
  assert(await page.locator('#content .module-grid:not(.module-reserve-grid-inline)').isHidden(),'Grid hidden');
  const frameHeight=()=>frame.evaluate(e=>Math.round(e.getBoundingClientRect().height));
  assert(Math.abs(await frameHeight()-before.height)<=1,'Frame covers exactly the function block (grid + Réserve) '+JSON.stringify({block:before.height,frame:await frameHeight()}));
  assert(Math.abs(await page.evaluate(()=>document.documentElement.scrollHeight)-before.page)<=1,'Nothing below moves');
  assert.equal(await page.locator('#moduleFocus [data-focus-close]').getAttribute('aria-label'),'Toutes les fonctions','Apps button instead of a back arrow on the first level');
  assert(await page.locator('.module-reserve-launch').isHidden(),'Reserve button hidden');
  assert(await page.locator('#homeTreasury').isVisible(),'Treasury dial stays above');
  assert.equal(await page.locator('#moduleFocus .focus-title-main').innerText(),'Clients');
  await page.locator('#moduleFocus .focus-row',{hasText:'Client Cadran Fonction'}).waitFor();
  assert(await page.locator('#moduleFocus .focus-row').count()<=3,'Three lines at most');
  // Small strip of the other functions at the bottom; switching stays in the same frame.
  const strip=page.locator('#moduleFocus .focus-app');assert.equal(await strip.count(),before.tiles);
  assert.equal(await page.locator('#moduleFocus .focus-app[aria-pressed="true"]').getAttribute('data-focus-app'),'clients');
  const box=await strip.first().locator('.module-icon').boundingBox();assert(box.width<=44&&box.height<=44,'Small format');
  assert.equal(await strip.first().locator('.focus-app-name').count(),1,'Name band above each app');
  assert(await page.locator('#moduleFocus .focus-apps').evaluate(e=>e.scrollHeight<=e.clientHeight+1&&getComputedStyle(e).overflowY==='hidden'),'Strip never moves up or down');
  const other=await page.locator('#moduleFocus .focus-app[aria-pressed="false"]').first();
  if(await other.count()){const key=await other.getAttribute('data-focus-app');await other.click();assert.equal(await page.locator('#moduleFocus .focus-app[aria-pressed="true"]').getAttribute('data-focus-app'),key);assert.equal(await page.locator('#moduleFocus').count(),1);assert(Math.abs(await frameHeight()-before.height)<=1,'Same size for another function');await page.locator('#moduleFocus [data-focus-app="clients"]').click();}
  // Buttons readable before any tap (no white on white), same height.
  const buttons=await page.locator('#moduleFocus .focus-btn').evaluateAll(es=>es.map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {text:e.innerText.trim(),color:c.color,bg:c.backgroundColor,h:Math.round(r.height)};}));
  assert.deepEqual(buttons.map(b=>b.text),['Voir tout →','＋ Nouveau client']);
  for(const b of buttons)assert(b.color!==b.bg&&b.h>=40,'Readable button '+JSON.stringify(b));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  // "Voir tout" opens the full function; closing it comes back to the same frame.
  const frameBox=await frame.boundingBox(),stripTop=await page.locator('#moduleFocus .focus-apps').evaluate(e=>e.getBoundingClientRect().top);
  await page.locator('#moduleFocus [data-focus-open]').click();await page.locator('#contextPanel').waitFor();
  await page.waitForFunction(()=>document.body.classList.contains('dock-to-focus')&&document.querySelector('#dockExpand'));
  // Second window: exactly on the frame, dark universe, back arrow and Déployer.
  const panelBox=await page.locator('#contextPanel').boundingBox();
  const vh=await page.evaluate(()=>innerHeight),top=Math.max(8,frameBox.y),visible={x:frameBox.x,y:top,width:frameBox.width,height:Math.min(vh-8,stripTop-6)-top};
  for(const k of ['x','y','width','height'])assert(Math.abs(panelBox[k]-visible[k])<=2,'Second window on the (visible) frame '+JSON.stringify({visible,panelBox}));
  const dark=await page.locator('#contextPanel').evaluate(e=>{const m=getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number);return (m[0]+m[1]+m[2])/3;});assert(dark<60,'Dark window '+dark);
  assert.equal(await page.locator('#dockBack').innerText(),'‹ 1','Single back button with the number of steps');
  assert(await page.locator('#dockApps').isVisible(),'Apps button to go straight back to all functions');
  assert(await page.locator('#moduleFocus .focus-apps').evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&e.contains(hit);}),'App strip stays visible under the window');
  // Switching function from the strip while a window is open closes it and opens the other function in the frame.
  const next=page.locator('#moduleFocus .focus-app[aria-pressed="false"]').first();
  if(await next.count()){const k=await next.getAttribute('data-focus-app');await next.click();await page.locator('#contextPanel').waitFor({state:'detached'});await page.evaluate(async()=>{await navigationQueue;});
   assert.equal(await page.locator('#moduleFocus .focus-app[aria-pressed="true"]').getAttribute('data-focus-app'),k);
   await page.locator('#moduleFocus [data-focus-app="clients"]').click();await page.locator('#moduleFocus [data-focus-open]').click();await page.locator('#contextPanel').waitFor();await page.waitForFunction(()=>document.querySelector('#dockBack'));}
  // No light surface and no dark ink left in the window (no white-on-white like the old Agenda card).
  const lightCheck=sel=>page.locator(sel).evaluate(root=>{const rgb=v=>{const m=String(v).match(/rgba?\(([^)]+)\)/);if(!m)return null;const [r,g,b,a=1]=m[1].split(/[\s,/]+/).filter(Boolean).map(Number);return {r,g,b,a};},lum=c=>(0.2126*c.r+0.7152*c.g+0.0722*c.b)/255;
   const bad=[];for(const el of root.querySelectorAll('*')){if(/^(INPUT|SELECT|TEXTAREA|BUTTON|OPTION|svg|path|IMG)$/i.test(el.tagName)||el.closest('svg,.btn,.badge')||!el.getClientRects().length)continue;const cs=getComputedStyle(el),bg=rgb(cs.backgroundColor),fg=rgb(cs.color);
    if(bg&&bg.a>0.3&&lum(bg)>0.78)bad.push('light:'+el.className);
    if(fg&&lum(fg)<0.22&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))bad.push('dark text:'+el.className+':'+el.textContent.trim().slice(0,30));}
   return bad;});
  await page.waitForTimeout(150);
  assert.deepEqual(await lightCheck('#contextPanel'),[],'Readable dark window');
  const headerBacks=await page.locator('#contextPanel .context-header').evaluate(h=>[...h.querySelectorAll('button,a')].filter(b=>b.getClientRects().length&&/‹|back|Revenir/i.test((b.textContent||'')+(b.getAttribute('aria-label')||'')+(getComputedStyle(b,'::before').content||''))).length);
  assert(headerBacks<=1,'One back arrow only, got '+headerBacks);
  await page.locator('#dockExpand').click();
  assert((await page.locator('#contextPanel').boundingBox()).width>frameBox.width,'Déployer widens the window');
  await page.locator('#dockExpand').click();
  // The single visible back arrow returns to the function frame.
  await page.locator('#dockBack').click();await page.locator('#contextPanel').waitFor({state:'detached'});
  await page.evaluate(async()=>{await navigationQueue;});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('dock-to-focus')),false,'Dock released after closing');
  assert(await frame.isVisible(),'Frame kept after the full view');
  // Keyboard open while typing in a docked form: the form leaves the frame and fills the visible area above
  // the keyboard, with the field in view; it returns onto the frame when the keyboard closes.
  await page.locator('#moduleFocus [data-focus-go="client-new"]').click();await page.locator('#contextPanel input').first().waitFor();
  await page.waitForFunction(()=>document.body.classList.contains('dock-to-focus'));
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
  await page.locator('#dockBack').click();await page.locator('#contextPanel').waitFor({state:'detached'});await page.evaluate(async()=>{await navigationQueue;});
  // Guided entry: "Suivant" key moves to the next field, a complete phone number moves on by itself,
  // the validate button stays visible at the bottom, a small progress shows where you are.
  await page.locator('#moduleFocus [data-focus-go="client-new"]').click();await page.locator('#clientName').waitFor();
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
  await page.locator('#dockBack').click();await page.locator('#contextPanel').waitFor({state:'detached'});await page.evaluate(async()=>{await navigationQueue;});
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
  // Escape and the back arrow restore the grid.
  await page.keyboard.press('Escape');assert.equal(await page.locator('#moduleFocus').count(),0);
  assert(await page.locator('#content .module-grid [data-go="clients"]').isVisible());
  await page.locator('#content .module-grid [data-go="clients"]').click();await page.locator('#moduleFocus [data-focus-close]').click();
  assert(await page.locator('.module-reserve-launch').isVisible(),'Reserve button back');
  // Tiny grid (4 columns, 1 row): the frame still keeps the grid's size; content adapts.
  await page.evaluate(async()=>{const cid=company.id,w=await api(`/api/companies/${cid}/workspace`);await api(`/api/companies/${cid}/workspace`,{method:'PUT',body:JSON.stringify({domain:w.domain,visible:w.visible,version:w.version,columns:4,rows:1})});});
  await page.reload({waitUntil:'networkidle'});const small=page.locator('#content .module-grid .module-tile').first();await small.waitFor();
  const smallGrid=await page.evaluate(()=>Math.round(document.querySelector('.module-reserve-launch').getBoundingClientRect().bottom-document.querySelector('#content .module-grid').getBoundingClientRect().top));
  await small.click();await frame.waitFor();
  assert(Math.abs(await frameHeight()-smallGrid)<=1,'Small grid: same size '+JSON.stringify({grid:smallGrid,frame:await frameHeight()}));
  assert(await frame.locator('[data-focus-open]').isVisible(),'Voir tout stays reachable');
  assert(await frame.evaluate(e=>[...e.querySelectorAll('button,a')].filter(b=>b.offsetParent).every(b=>b.getBoundingClientRect().bottom<=e.getBoundingClientRect().bottom+1)),'Nothing spills out of the frame');
  await page.locator('#moduleFocus [data-focus-close]').click();
  // Action cards: the green button opens the matching function in the function dial and docks its window there.
  // Normal-size grid again (the previous check used a one-row grid, too small to host a window).
  await page.evaluate(async()=>{const cid=company.id,w=await api(`/api/companies/${cid}/workspace`);await api(`/api/companies/${cid}/workspace`,{method:'PUT',body:JSON.stringify({domain:w.domain,visible:w.visible,version:w.version,columns:2,rows:4})});});
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').first().waitFor({state:'attached'});
  const card=page.locator('.priority-card:has([data-priority-open])').first();
  if(await card.count()){
   const module=await card.getAttribute('data-priority-module');
   const known=await page.evaluate(m=>(homeLayout.workspace?.modules||[]).some(x=>x.key===m),module);
   if(known){
    await card.locator('[data-priority-open]').click();
    await page.locator('#moduleFocus').waitFor();
    assert.equal(await page.locator('#moduleFocus .focus-app[aria-pressed="true"]').getAttribute('data-focus-app'),module,'Same function as in the dial');
    // Same as the dial's own button: no extra window; the card's actions are listed first in the dial.
    assert.equal(await page.locator('#contextPanel').count(),0);assert.equal(await page.locator('#modalLayer:not(.hide)').count(),0);
    await page.locator('#moduleFocus [data-focus-priority]').first().click();
    await page.waitForFunction(()=>document.body.classList.contains('dock-to-focus')&&(document.querySelector('#contextPanel')||document.querySelector('#modalLayer:not(.hide) .modal')));
    const win=await page.evaluate(()=>{const w=(document.querySelector('#contextPanel')||document.querySelector('#modalLayer:not(.hide) .modal')).getBoundingClientRect(),f=document.querySelector('#moduleFocus').getBoundingClientRect();return {dx:Math.abs(w.left-f.left),dw:Math.abs(w.width-f.width)};});
    assert(win.dx<=2&&win.dw<=2,'Action window docked on the function frame '+JSON.stringify(win));
    await page.evaluate(()=>{if(document.querySelector('#contextPanel'))closeContext();else closeModal();});
    await page.evaluate(async()=>{await navigationQueue;});
    if(await page.locator('#moduleFocus').count())await page.locator('#moduleFocus [data-focus-close]').click();
   }
  }
  // Preview endpoint is company-scoped and read-only.
  const peek=await page.evaluate(async()=>api(`/api/companies/${company.id}/module-peek/clients`));
  assert(peek.items.length>=1&&peek.items.length<=3);
  assert.deepEqual(errors,[]);
  console.log('Function dial: opens in place, same position, no scroll, 3 lines, app strip, Voir tout, back/Escape.');
 }catch(error){
  console.error('Function dial details',JSON.stringify({url:page.url(),errors,body:(await page.locator('#moduleFocus').innerText().catch(()=>'')).slice(0,800)}));
  throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
