'use strict';
// Real-app home treasury dial: bank pills, header alert, Derniers/À venir, constant size, motion settings.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];await page.addInitScript(()=>{try{if(!sessionStorage.getItem('fold-test'))localStorage.setItem('aia-treasury-open','1')}catch(e){}});
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('#homeTreasury .home-treasury').waitFor();
  // Seed three banks through the app's own authenticated API helper.
  await page.evaluate(async()=>{
   const cid=company.id,post=(path,body)=>api(`/api/companies/${cid}${path}`,{method:'POST',body:JSON.stringify(body)});
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const t=new Date(today+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+1);const tomorrow=t.toISOString().slice(0,10);
   const atlas=await post('/banks',{name:'Banque Pastille Atlas',currency:'EUR',opening_balance:'7200',reserved:'0'});
   const rivage=await post('/banks',{name:'Banque Pastille Rivage',currency:'EUR',opening_balance:'0',reserved:'0'});
   await post('/banks',{name:'Banque Pastille Horizon',currency:'EUR',opening_balance:'18000',reserved:'0'});
   await post('/treasury',{label:'Charges sociales',direction:'out',amount:'350',currency:'EUR',date:today,bank_id:rivage.id,operation_id:crypto.randomUUID()});
   for(let i=0;i<6;i++)await post('/treasury',{label:'Règlement client '+i,direction:'in',amount:'10',currency:'EUR',date:today,bank_id:atlas.id,operation_id:crypto.randomUUID()});
   await post('/bank-debits',{bank_id:rivage.id,label:'Assurance professionnelle',amount:'650',due:tomorrow,operation_id:crypto.randomUUID()});
  });
  await page.reload({waitUntil:'networkidle'});
  const card=page.locator('#homeTreasury .bank-dial');await card.waitFor();
  const height=()=>page.locator('#homeTreasury .bank-dial').evaluate(e=>Math.round(e.getBoundingClientRect().height));
  // Watch-face layout: one header row (label, scope, status), ring + balance, Derniers/À venir, pills + Voir tout.
  const face=await page.evaluate(()=>{const q=s=>document.querySelector('#homeTreasury '+s),r=e=>e.getBoundingClientRect(),card=r(q('.bank-dial'));return {label:q('.treasury-label').textContent,name:q('.bank-home-name').textContent,ring:!!q('.dial-ring .dial-arc-in'),total:parseFloat(getComputedStyle(q('.bank-total')).fontSize),inside:[...document.querySelectorAll('#homeTreasury .bank-dial button')].every(b=>{const x=r(b);return x.width>0&&x.top>=card.top-1&&x.bottom<=card.bottom+1;}),scroll:document.documentElement.scrollWidth<=innerWidth};});
  assert.equal(face.label,'Trésorerie');assert.equal(face.name,'Toutes');assert(face.ring&&face.total>=24&&face.inside&&face.scroll,'Compact face, nothing clipped '+JSON.stringify(face));
  assert.equal(await card.getAttribute('data-bank-selected'),'all');
  assert.equal(await page.locator('[data-bank-pill="all"].bank-pill').getAttribute('aria-pressed'),'true');
  const banks=await page.locator('.bank-pill[data-bank-pill]:not([data-bank-pill="all"])').count();assert(banks>=3);
  assert.equal(await page.locator('.bank-pill[data-bank-add]').count(),1);
  const alert=page.locator('.bank-global-alert',{hasText:'Pastille Rivage'});assert.equal(await alert.count(),1);
  assert((await alert.innerText()).includes('demain'),'Header alert names the upcoming debit');
  assert.equal(await page.locator('[data-bank-pill] .bank-pill-dot').count(),1,'Only the bank in deficit has a red dot');
  for(const pill of await page.locator('.bank-pill').all()){const box=await pill.boundingBox();assert.equal(Math.round(box.width),36);assert.equal(Math.round(box.height),36);assert(await pill.getAttribute('aria-label'));}
  // Two equal, always-visible buttons: readable label and opaque background before any tap.
  const tabs=await page.locator('.dial-tab').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {w:Math.round(r.width),h:Math.round(r.height),text:e.innerText.trim(),color:c.color,bg:c.backgroundColor,pressed:e.getAttribute('aria-pressed')};}));
  assert.equal(tabs.length,2);assert.equal(tabs[0].w,tabs[1].w);assert.equal(tabs[0].h,tabs[1].h);
  assert.deepEqual(tabs.map(t=>t.text),['Derniers','À venir']);
  for(const t of tabs){assert(t.bg!=='rgba(0, 0, 0, 0)'&&t.color!==t.bg,'Tab visible before tap '+JSON.stringify(t));}
  assert.equal(tabs[0].pressed,'true');
  // "Voir tout" sits on the same row, same size, so the bank pills get the whole bottom row.
  const more=await page.locator('.dial-tabs .dial-more').evaluate(e=>{const r=e.getBoundingClientRect(),t=document.querySelector('.dial-tab').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top-t.top),text:e.innerText.trim()};});
  assert.deepEqual(more,{w:tabs[0].w,h:tabs[0].h,top:0,text:'Voir tout →'});
  assert.equal(await page.locator('.dial-foot button:not(.bank-pill)').count(),0,'Only bank pills in the bottom row');
  assert.equal(await page.locator('.dial-row').count(),3,'Three latest movements across banks');
  await page.locator('[data-dial-tab="next"]').click();
  assert.equal(await page.locator('[data-dial-tab="next"]').getAttribute('aria-pressed'),'true');
  const next=page.locator('.dial-row.is-next');assert(await next.count()>=1);
  assert((await page.locator('.dial-row.is-risk').innerText()).includes('à couvrir'),'Uncovered debit flagged');
  assert((await page.locator('.dial-row.is-risk b').innerText()).includes('650,00'));
  assert.equal(await page.locator('.dial-tab-dot.is-risk').count(),1);
  await page.locator('[data-dial-tab="last"]').click();
  const summaryHeight=await height();
  // Bank in alert: same card size, balance in red, funding action instead of the list.
  await page.locator('.bank-pill[aria-label^="Banque Pastille Rivage"]').click();
  assert(Math.abs(await height()-summaryHeight)<=1,'Card size unchanged in the bank view');
  assert(await page.locator('#homeTreasury .bank-dial .bank-back').isVisible(),'Back arrow at the top');
  assert((await page.locator('.bank-home-name').innerText()).toLowerCase().includes('rivage'));
  assert(await page.locator('.bank-total.bank-negative').isVisible());
  assert.equal(await page.locator('.dial-status.is-alert').innerText(),'Alerte');
  const fund=page.locator('.bank-home-alert .bank-fund');assert(await fund.isVisible());
  assert((await page.locator('.bank-home-alert').innerText()).includes('1 000,00'),'Missing amount covers overdraft plus debit');
  assert((await fund.innerText()).startsWith('Approvisionner depuis'));
  // The alert is the default panel; Derniers still shows this bank's movements, same card size.
  await page.locator('[data-dial-tab="last"]').click();assert.equal(await page.locator('.bank-home-alert').count(),0);assert(await page.locator('.dial-row').count()>=1);
  assert(Math.abs(await height()-summaryHeight)<=1,'Same size on Derniers for a bank in alert');
  // Tapping the selected bank again returns to the summary.
  await page.locator('.bank-pill[aria-label^="Banque Pastille Rivage"]').click();
  assert.equal(await page.locator('#homeTreasury .bank-home').getAttribute('data-bank-selected'),'all');
  // Bank without alert: month flows and the 3 latest movements.
  await page.locator('.bank-pill[aria-label="Banque Pastille Atlas"]').click();
  assert(Math.abs(await height()-summaryHeight)<=1,'Same size for a bank without alert');
  assert.equal(await page.locator('.dial-row').count(),3,'Bank view keeps the 3 latest movements');
  assert(await page.locator('.bank-view-all').isVisible());
  assert.equal(await page.locator('.bank-home-alert').count(),0);
  assert((await page.locator('.dial-flows').innerText()).includes('60,00'));
  assert.equal(await page.locator('.dial-status.is-ok').innerText(),'À jour');
  await page.locator('[data-dial-tab="next"]').click();assert.equal(await page.locator('.dial-empty').innerText(),'Aucun prélèvement prévu');
  await page.locator('[data-dial-tab="last"]').click();
  // Escape and the back arrow both return to "Tous".
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#homeTreasury .bank-home').getAttribute('data-bank-selected'),'all');
  await page.locator('.bank-pill[aria-label="Banque Pastille Atlas"]').click();await page.locator('.bank-fold').click();
  assert.equal(await page.locator('#homeTreasury .bank-home').getAttribute('data-bank-selected'),'all');
  // Folded by default (no choice saved yet): ring, balance and month in/out stay, plus the alert; tabs and banks hide.
  await page.evaluate(()=>{sessionStorage.setItem('fold-test','1');localStorage.removeItem('aia-treasury-open');});
  await page.reload({waitUntil:'networkidle'});await page.locator('#homeTreasury .bank-dial').waitFor();
  const folded=await page.evaluate(()=>{const d=document.querySelector('#homeTreasury .bank-dial');return {cls:d.classList.contains('is-folded'),tabs:!!d.querySelector('.dial-tabs'),pills:!!d.querySelector('.bank-pills'),ring:!!d.querySelector('.dial-ring'),total:!!d.querySelector('.bank-total'),flows:!!d.querySelector('.dial-flows'),alert:!!d.querySelector('.dial-fold-alert .bank-fund'),h:Math.round(d.getBoundingClientRect().height)};});
  assert(folded.cls&&!folded.tabs&&!folded.pills&&folded.ring&&folded.total&&folded.flows,'Folded dial: vital figures only '+JSON.stringify(folded));
  assert(folded.alert,'An alert always stays visible, even folded');
  await page.locator('#homeTreasury .bank-dial .bank-total').click();
  await page.locator('#homeTreasury .dial-tabs').waitFor();
  assert.equal(await page.locator('#homeTreasury [data-dial-fold]').getAttribute('aria-expanded'),'true');
  assert((await page.locator('#homeTreasury .bank-dial').evaluate(d=>d.getBoundingClientRect().height))>folded.h,'Unfolded shows the full dial');
  await page.reload({waitUntil:'networkidle'});await page.locator('#homeTreasury .dial-tabs').waitFor(); // choice kept
  await page.locator('#homeTreasury [data-dial-fold]').click();
  await page.waitForFunction(()=>document.querySelector('#homeTreasury .bank-dial.is-folded'));
  assert.equal(await page.locator('#homeTreasury .bank-pills').count(),0,'Folded again');
  // Motion on: rings fill and amounts tick, then settle on the exact value.
  const motion=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'});await motion.addInitScript(()=>{try{if(!sessionStorage.getItem('fold-test'))localStorage.setItem('aia-treasury-open','1')}catch(e){}});
  await motion.context().addCookies(await page.context().cookies());
  await motion.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});await motion.locator('#homeTreasury .bank-dial').waitFor();
  assert.equal(await motion.locator('#homeTreasury .dial-arc-in').evaluate(e=>getComputedStyle(e).animationName),'dial-fill');
  const final=await page.locator('#homeTreasury .bank-total').innerText();
  await motion.waitForFunction(t=>document.querySelector('#homeTreasury .bank-total').innerText===t,final,{timeout:3000});
  await motion.close();
  // Reduce Motion: no ring sweep, values shown at once.
  assert.equal(await page.locator('#homeTreasury .dial-arc-in').evaluate(e=>getComputedStyle(e).animationName),'none');
  // A bank logo uploaded by the user replaces the initials in its pill.
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#1e7a4f';g.fillRect(0,0,64,64);return c.toDataURL('image/png');});
  await page.evaluate(async image=>{const banks=(await api(`/api/companies/${company.id}/banks`)).banks;const atlas=banks.find(b=>b.name==='Banque Pastille Atlas');await api(`/api/companies/${company.id}/banks/${atlas.id}/logo`,{method:'PUT',body:JSON.stringify({image})});},png);
  await page.reload({waitUntil:'networkidle'});await page.locator('#homeTreasury .bank-dial').waitFor();
  const logo=page.locator('.bank-pill[aria-label="Banque Pastille Atlas"] img.bank-pill-logo');assert.equal(await logo.count(),1,'Logo shown in the pill');
  const box=await page.locator('.bank-pill[aria-label="Banque Pastille Atlas"]').boundingBox();assert.equal(Math.round(box.width),36);
  assert.equal(await page.locator('.bank-pill[aria-label^="Banque Pastille Rivage"] img').count(),0,'Banks without a logo keep their initials');
  // "+" opens the manual bank editor.
  await page.locator('.bank-pill[data-bank-add]').click();await page.locator('#bankEditor').waitFor();
  assert.deepEqual(errors,[]);
  console.log('Treasury dial: compact face, equal visible tabs, latest/upcoming rows, alert funding, constant size, motion and reduced motion.');
 }catch(error){
  console.error('Bank pills details',JSON.stringify({url:page.url(),errors,body:(await page.locator('#homeTreasury').innerText().catch(()=>'')).slice(0,1500)}));
  throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
