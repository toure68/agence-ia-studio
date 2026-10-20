'use strict';
// Phone habits (2026-10-20): a phone number calls, an e-mail writes, an address opens the map; pulling the home
// down refreshes it (app opened from the home screen); swiping an action row to the left shows its finishing button.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
 await page.addInitScript(()=>{try{if(!localStorage.getItem('aia-reader'))localStorage.setItem('aia-reader','off');}catch(e){}}); // classic action cards (mode lecteur: tests/reader.cjs)
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__pullRefreshForce=true;});
 // Synthetic finger: touchstart → touchmove steps → touchend on an element (or the document).
 const swipe=(sel,dx,dy)=>page.evaluate(([sel,dx,dy])=>{
  const el=sel?document.querySelector(sel):document.querySelector('#content .home-heading')||document.body,r=el.getBoundingClientRect();
  const x0=sel?r.right-30:r.left+r.width/2,y0=r.top+Math.min(20,r.height/2);
  const t=(x,y)=>new Touch({identifier:1,target:el,clientX:x,clientY:y});
  const fire=(type,x,y)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t(x,y)],changedTouches:[t(x,y)]}));
  fire('touchstart',x0,y0);for(let i=1;i<=8;i++)fire('touchmove',x0+dx*i/8,y0+dy*i/8);fire('touchend',x0+dx,y0+dy);
 },[sel,dx,dy]);
 try{
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('#content .module-grid .module-tile').first().waitFor();
  // 1. Contact buttons under the client's fields.
  const id=await page.evaluate(async()=>(await api(`/api/companies/${company.id}/clients`,{method:'POST',body:JSON.stringify({name:'Client Habitudes',phone:'06 12 34 56 78',email:'habitudes@example.test',address:'10 rue de la Paix, Paris'})})).id);
  await page.evaluate(id=>openTab('client-edit',{recordId:id}),id);
  await page.locator('.contact-go.is-tel:not([hidden])').waitFor();
  const links=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.contact-go:not([hidden])')].map(a=>[a.className.replace('contact-go is-',''),a.getAttribute('href')])));
  assert.equal(links.tel,'tel:0612345678');assert.equal(links.mail,'mailto:habitudes@example.test');assert.match(links.map||'',/maps.*10%20rue%20de%20la%20Paix/);
  await page.locator('#clientPhone').fill('');assert(await page.locator('.contact-go.is-tel').isHidden(),'Call button hidden when the number is empty');
  assert(await page.evaluate(()=>{const i=document.querySelector('#clientPhone').getBoundingClientRect(),a=document.querySelector('.contact-go.is-mail').getBoundingClientRect(),e=document.querySelector('#clientEmail').getBoundingClientRect();return a.top>=e.bottom+6&&a.right<=innerWidth;}),'Write button under the e-mail field, inside the screen');
  await page.evaluate(()=>closeContext());await page.waitForFunction(()=>!document.querySelector('#contextPanel'));
  // 2. Pull the home down: it refreshes.
  await page.evaluate(()=>{scrollTo(0,0);window.__pulls=0;const f=window.refreshCockpit;window.refreshCockpit=async()=>{window.__pulls++;return f();};});
  await swipe(null,0,260);
  await page.waitForFunction(()=>window.__pulls===1);
  await page.waitForFunction(()=>!document.querySelector('.pull-refresh'));
  await swipe(null,0,40);await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.__pulls),1,'A short pull does not refresh');
  // 3. Swipe an action row to the left: its finishing button appears and finishes it.
  await page.evaluate(async()=>{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date());await api(`/api/companies/${company.id}/tasks`,{method:'POST',body:JSON.stringify({title:'Tâche à glisser',description:'Glisser pour terminer',first_due:d})});await renderPriorities();
   openPriorityGroup({module:'all',members:priorityCards.filter(c=>!c.example&&!c.fallback)},company.id);});
  await page.locator('#contextPanel .priority-group-list .task-row').first().waitFor();
  const idx=await page.evaluate(()=>[...document.querySelectorAll('#contextPanel .priority-group-list .task-row')].findIndex(r=>r._swipe&&r.textContent.includes('Tâche à glisser')));
  assert(idx>=0,'The task row has the swipe gesture');
  const sel=`#contextPanel .priority-group-list .task-row[data-priority-item-open="${idx}"]`;
  await swipe(sel,-200,0);
  await page.locator('.swipe-act').waitFor();
  assert.equal((await page.locator('.swipe-act').innerText()).trim(),'Terminé');
  assert(await page.evaluate(()=>!document.querySelector('#contextPanel .inline-panel')),'Swiping does not unfold the row');
  await page.locator('.swipe-act').click();
  await page.waitForFunction(s=>document.querySelector(s)?.classList.contains('inline-finished'),sel);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Phone habits OK');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
