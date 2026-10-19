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
  const box=await strip.first().boundingBox();assert(box.width<=44&&box.height<=44,'Small format');
  const other=await page.locator('#moduleFocus .focus-app[aria-pressed="false"]').first();
  if(await other.count()){const key=await other.getAttribute('data-focus-app');await other.click();assert.equal(await page.locator('#moduleFocus .focus-app[aria-pressed="true"]').getAttribute('data-focus-app'),key);assert.equal(await page.locator('#moduleFocus').count(),1);assert(Math.abs(await frameHeight()-before.height)<=1,'Same size for another function');await page.locator('#moduleFocus [data-focus-app="clients"]').click();}
  // Buttons readable before any tap (no white on white), same height.
  const buttons=await page.locator('#moduleFocus .focus-btn').evaluateAll(es=>es.map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {text:e.innerText.trim(),color:c.color,bg:c.backgroundColor,h:Math.round(r.height)};}));
  assert.deepEqual(buttons.map(b=>b.text),['Voir tout →','＋ Nouveau client']);
  for(const b of buttons)assert(b.color!==b.bg&&b.h>=40,'Readable button '+JSON.stringify(b));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  // "Voir tout" opens the full function; closing it comes back to the same frame.
  const frameBox=await frame.boundingBox();
  await page.locator('#moduleFocus [data-focus-open]').click();await page.locator('#contextPanel').waitFor();
  await page.waitForFunction(()=>document.body.classList.contains('dock-to-focus')&&document.querySelector('#dockExpand'));
  // Second window: exactly on the frame, dark universe, back arrow and Déployer.
  const panelBox=await page.locator('#contextPanel').boundingBox();
  const vh=await page.evaluate(()=>innerHeight),top=Math.max(8,frameBox.y),visible={x:frameBox.x,y:top,width:frameBox.width,height:Math.min(vh-8,frameBox.y+frameBox.height)-top};
  for(const k of ['x','y','width','height'])assert(Math.abs(panelBox[k]-visible[k])<=2,'Second window on the (visible) frame '+JSON.stringify({visible,panelBox}));
  const dark=await page.locator('#contextPanel').evaluate(e=>{const m=getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number);return (m[0]+m[1]+m[2])/3;});assert(dark<60,'Dark window '+dark);
  assert.equal(await page.locator('#closeContext').getAttribute('aria-label'),'Revenir à la fonction');
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
  await page.locator('#contextPanel .context-header :is(#closeContext,#moduleBack [data-back])').filter({visible:true}).first().click();await page.locator('#contextPanel').waitFor({state:'detached'});
  await page.evaluate(async()=>{await navigationQueue;});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('dock-to-focus')),false,'Dock released after closing');
  assert(await frame.isVisible(),'Frame kept after the full view');
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
