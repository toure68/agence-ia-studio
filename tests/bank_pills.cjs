'use strict';
// Real-app home treasury: bank pills, automatic alert, latest movements, return to "Tous".
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
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
  const card=page.locator('#homeTreasury .bank-home');await card.waitFor();
  // Airy typography: small TRÉSORERIE label with the bank name on the right, large balance, readable flows.
  const typo=await page.evaluate(()=>{const q=s=>document.querySelector('#homeTreasury '+s),r=e=>e.getBoundingClientRect(),label=q('.treasury-label'),name=q('.bank-home-name'),total=q('.bank-total'),flow=q('.home-flow b');return {label:label.textContent,labelSize:parseFloat(getComputedStyle(label.parentElement).fontSize),sameRow:Math.abs(r(label).top-r(name).top)<6,nameRight:r(name).right>r(label).right,total:parseFloat(getComputedStyle(total).fontSize),flow:parseFloat(getComputedStyle(flow).fontSize),gap:r(total).top-r(label).bottom};});
  assert.equal(typo.label,'Trésorerie');assert(typo.labelSize<=14&&typo.sameRow&&typo.nameRight,'Header row: label left, bank right '+JSON.stringify(typo));
  assert(typo.total>=30&&typo.flow>=17&&typo.gap>=14,'Large balance, readable flows, airy spacing '+JSON.stringify(typo));
  // Default view is always "Tous", with the alert visible without any click.
  assert.equal(await card.getAttribute('data-bank-selected'),'all');
  assert.equal(await page.locator('[data-bank-pill="all"].bank-pill').getAttribute('aria-pressed'),'true');
  assert(await page.locator('.bank-home-detail').isHidden(),'Bank detail stays closed on the summary');
  const banks=await page.locator('.bank-pill[data-bank-pill]:not([data-bank-pill="all"])').count();assert(banks>=3);
  assert.equal(await page.locator('.bank-pill[data-bank-add]').count(),1);
  const alert=page.locator('.bank-global-alert',{hasText:'Pastille Rivage'});assert.equal(await alert.count(),1);
  assert((await alert.innerText()).includes('demain'),'Global alert names the upcoming debit');
  assert.equal(await page.locator('[data-bank-pill] .bank-pill-dot').count(),1,'Only the bank in deficit has a red dot');
  for(const pill of await page.locator('.bank-pill').all()){const box=await pill.boundingBox();assert.equal(Math.round(box.width),44);assert.equal(Math.round(box.height),44);assert(await pill.getAttribute('aria-label'));}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  // Bank in alert: balance in red and alert expanded automatically.
  const summaryHeight=await page.locator('#homeTreasury .bank-home').evaluate(e=>Math.round(e.getBoundingClientRect().height));
  const rivage=page.locator('.bank-pill[aria-label^="Banque Pastille Rivage"]');await rivage.click();
  // The card keeps exactly the summary size; the bank view replaces its content in place.
  assert(Math.abs(await page.locator('#homeTreasury .bank-home').evaluate(e=>e.getBoundingClientRect().height)-summaryHeight)<=1,'Card size unchanged in the bank view');
  assert(await page.locator('#homeTreasury .bank-focus .bank-back').isVisible(),'Back arrow at the top');
  assert((await page.locator('.bank-home-name').innerText()).toLowerCase().includes('rivage'));
  assert(await page.locator('.bank-total.bank-negative').isVisible());
  const fund=page.locator('.bank-home-alert .bank-fund');assert(await fund.isVisible());
  assert((await page.locator('.bank-home-alert').innerText()).includes('1 000,00'),'Missing amount covers overdraft plus debit');
  assert((await fund.innerText()).startsWith('Approvisionner depuis'));
  // Tapping the selected bank again returns to the summary.
  await page.locator('.bank-pill[aria-label^="Banque Pastille Rivage"]').click();
  assert.equal(await page.locator('#homeTreasury .bank-home').getAttribute('data-bank-selected'),'all');
  // Bank without alert: month flows and the 5 latest movements.
  await page.locator('.bank-pill[aria-label="Banque Pastille Atlas"]').click();
  assert(Math.abs(await page.locator('#homeTreasury .bank-home').evaluate(e=>e.getBoundingClientRect().height)-summaryHeight)<=1,'Same size for a bank without alert');
  assert.equal(await page.locator('.bank-row').count(),3,'Focus view keeps the 3 latest movements');
  assert(await page.locator('.bank-view-all').isVisible());
  assert.equal(await page.locator('.bank-home-alert').count(),0);
  assert((await page.locator('.bank-focus-flows').innerText()).includes('60,00'));
  assert.equal(await page.locator('#homeTreasury .home-flow').count(),0,'Summary details are hidden in the bank view');
  // Escape and the fold button both return to "Tous".
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#homeTreasury .bank-home').getAttribute('data-bank-selected'),'all');
  await page.locator('.bank-pill[aria-label="Banque Pastille Atlas"]').click();await page.locator('.bank-fold').click();
  assert.equal(await page.locator('#homeTreasury .bank-home').getAttribute('data-bank-selected'),'all');
  // A bank logo uploaded by the user replaces the initials in its pill.
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#1e7a4f';g.fillRect(0,0,64,64);return c.toDataURL('image/png');});
  await page.evaluate(async image=>{const banks=(await api(`/api/companies/${company.id}/banks`)).banks;const atlas=banks.find(b=>b.name==='Banque Pastille Atlas');await api(`/api/companies/${company.id}/banks/${atlas.id}/logo`,{method:'PUT',body:JSON.stringify({image})});},png);
  await page.reload({waitUntil:'networkidle'});await page.locator('#homeTreasury .bank-home').waitFor();
  const logo=page.locator('.bank-pill[aria-label="Banque Pastille Atlas"] img.bank-pill-logo');assert.equal(await logo.count(),1,'Logo shown in the pill');
  const box=await page.locator('.bank-pill[aria-label="Banque Pastille Atlas"]').boundingBox();assert.equal(Math.round(box.width),44);
  assert.equal(await page.locator('.bank-pill[aria-label^="Banque Pastille Rivage"] img').count(),0,'Banks without a logo keep their initials');
  // "+" opens the manual bank editor.
  await page.locator('.bank-pill[data-bank-add]').click();await page.locator('#bankEditor').waitFor();
  assert.deepEqual(errors,[]);
  console.log('Home bank pills: Tous by default, alert expanded, latest movements, return to summary.');
 }catch(error){
  console.error('Bank pills details',JSON.stringify({url:page.url(),errors,body:(await page.locator('#homeTreasury').innerText().catch(()=>'')).slice(0,1500)}));
  throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
