'use strict';
// Screen captures for a visual review of every screen at iPhone size (390×844), after the functional tests.
// Never fails the build: each capture is independent. Output: /tmp/screens/*.png (pushed to a captures/ branch).
const fs=require('node:fs');
const {chromium}=require('playwright');
const out='/tmp/screens';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const done=[];
 const shot=async(name,full=false)=>{try{await page.waitForTimeout(450);await page.screenshot({path:`${out}/${name}.png`,fullPage:full});done.push(name);}catch(e){console.error('capture',name,e.message);}};
 const step=async(name,fn)=>{try{await fn();}catch(e){console.error('step',name,e.message);}};
 const settle=()=>page.evaluate(async()=>{await navigationQueue;}).catch(()=>{});
 const close=async()=>{await page.evaluate(()=>{if(document.querySelector('#modalLayer:not(.hide)'))closeModal();if(document.querySelector('#contextPanel'))closeContext();}).catch(()=>{});await settle();await page.waitForTimeout(300);};
 try{
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('#content .module-grid').first().waitFor({state:'attached'});
  await page.evaluate(async()=>{await api('/api/me/wallpaper',{method:'PUT',body:JSON.stringify({wallpaper:'emeraude'})});applyWallpaper('emeraude');try{localStorage.removeItem('aia-treasury-open')}catch(e){}});
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid').first().waitFor({state:'attached'});
  await shot('01-accueil',true);
  await step('tresorerie',async()=>{await page.locator('#homeTreasury [data-dial-fold]').click();await shot('02-accueil-tresorerie-depliee');await page.locator('#homeTreasury [data-dial-fold]').click();});
  await step('action',async()=>{const b=page.locator('[data-priority-open]').first();if(await b.count()){await b.scrollIntoViewIfNeeded();await b.click();await page.waitForTimeout(600);await shot('03-action-depliee-ou-ouverte');await close();if(await page.locator('.priority-card .inline-panel').count())await b.click();}});
  const keys=await page.evaluate(()=>[...document.querySelectorAll('#content .module-grid:not(.module-reserve-grid-inline) .module-tile[data-go]')].map(t=>t.dataset.go));
  let n=10;
  for(const key of keys){
   await step(key,async()=>{
    await close();if(await page.locator('#moduleFocus').count())await page.evaluate(()=>moduleFocusClose());
    await page.locator(`#content .module-grid [data-go="${key}"]`).click();
    await page.waitForFunction(()=>document.querySelector('#contextPanel .context-scroll')||document.querySelector('#modalLayer:not(.hide) .modal'),null,{timeout:6000});await settle();await page.waitForTimeout(600);
    await shot(`${n++}-fenetre-${key}`);
    if(key==='calendar'&&await page.locator('#contextPanel [data-go="task-new"]').count()){await page.locator('#contextPanel [data-go="task-new"]').first().click();await page.locator('#commandText').waitFor();await shot(`${n++}-formulaire-nouvelle-tache`);await page.evaluate(()=>closeModal());}
   });
  }
  await close();if(await page.locator('#moduleFocus').count())await page.evaluate(()=>moduleFocusClose());
  await step('cadre',async()=>{const k=keys[0];await page.locator(`#content .module-grid [data-go="${k}"]`).click();await page.waitForFunction(()=>document.querySelector('#dockExpand'));await page.locator('#dockExpand').click();await shot('40-fenetre-sur-le-cadre');await page.locator('#dockExpand').click();await close();});
  await step('formulaire-clavier',async()=>{await page.evaluate(()=>{openTab('client-new');});await page.locator('#contextPanel #clientName').waitFor();await settle();await shot('41-formulaire-client');
   await page.locator('#clientName').focus();await page.evaluate(()=>{Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:innerHeight-340,width:innerWidth,offsetTop:0,offsetLeft:0,addEventListener(){}}});document.documentElement.style.setProperty('--dialog-height',(innerHeight-340)+'px');moduleDockKeyboard();});
   await shot('42-formulaire-avec-clavier');await page.reload({waitUntil:'networkidle'});});
  await step('assistant',async()=>{await page.locator('#content .module-grid').first().waitFor({state:'attached'});await page.locator('#assistantDock').click();await page.locator('#assistantMessage').waitFor();await shot('43-assistant');await page.locator('.chat-attach-menu>summary').click();await shot('44-assistant-menu-plus');await close();});
  await step('actions',async()=>{await page.evaluate(()=>openPriorityGroup({module:'all',members:priorityCards},company.id));await page.locator('#contextPanel .priority-group-list').waitFor();await settle();await shot('45-toutes-les-actions');await close();});
  for(const [i,w] of [['50','aurore'],['51','sable'],['52','nuit']])await step(w,async()=>{await page.evaluate(id=>applyWallpaper(id),w);await page.waitForTimeout(300);await shot(`${i}-accueil-fond-${w}`);});
  await step('fond-fenetre',async()=>{await page.evaluate(()=>applyWallpaper('aurore'));await page.locator(`#content .module-grid [data-go="${keys[0]}"]`).click();await page.waitForFunction(()=>document.querySelector('#contextPanel'));await settle();await shot('53-fenetre-fond-aurore');await close();});
 }catch(e){console.error('captures',e.message);}
 finally{await browser.close();}
 fs.writeFileSync(`${out}/README.md`,`Captures ${new Date().toISOString()}\n\n${done.map(d=>'- '+d+'.png').join('\n')}\n`);
 console.log('Captures:',done.length);
})();
