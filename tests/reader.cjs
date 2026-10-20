'use strict';
// Mode lecteur (static/reader.js, user request 2026-10-20): treasury → reader, at most 5 small cards, counter,
// the function grid never moves while reading, finishing an action advances, and the switch restores the classic cards.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const out='/tmp/screens';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
 await page.addInitScript(()=>{try{localStorage.setItem('aia-reader','on');localStorage.removeItem('aia-treasury-open');}catch(e){}});
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('#content .module-grid').first().waitFor({state:'attached'});
  // Enough actions to fill more than five cards: tasks due today come first in the queue.
  await page.evaluate(async()=>{
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date());
   for(let i=1;i<=7;i++)await api(`/api/companies/${company.id}/tasks`,{method:'POST',body:JSON.stringify({title:'Lecteur test '+i,description:'Appeler le client et confirmer le rendez-vous de chantier '+i,first_due:today,monthly:false})});
  });
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.reader-item').first().waitFor();
  const n=await page.locator('.reader-item').count();
  assert.ok(n>=7,'every action is in the queue');
  const box=await page.locator('.reader-list').evaluate(el=>el.getBoundingClientRect().height);
  assert.ok(Math.abs(box-(5*72-8))<2,'five cards visible at most, the rest below: '+box);
  assert.match(await page.locator('.reader-count').innerText(),/à traiter/);
  assert.ok(await page.locator('#homeTreasury').isVisible(),'treasury shown before reading');
  const gridTop=()=>page.locator('#content .module-grid').first().evaluate(el=>el.getBoundingClientRect().top+scrollY);
  const before=await gridTop();
  await page.screenshot({path:out+'/90-lecteur-tresorerie.png'});

  // Slide the first card up: it goes into the reader, at the treasury's place and height.
  const treasuryH=await page.locator('#homeTreasury .home-treasury').evaluate(el=>el.offsetHeight);
  await page.locator('.reader-list').evaluate(el=>el.scrollTo({top:72}));
  await page.locator('.home-reader:not([hidden])').waitFor();
  assert.ok(!await page.locator('#homeTreasury').isVisible(),'treasury replaced by the reader');
  const first=await page.locator('.reader-item strong').first().innerText();
  assert.ok((await page.locator('.home-reader').innerText()).includes(first),'reader shows the first card');
  const readerH=await page.locator('.home-reader').evaluate(el=>el.offsetHeight);
  assert.ok(Math.abs(readerH-Math.max(treasuryH,300))<2,`reader: treasury height, at least 300px for 3–4 lines (${readerH} / ${treasuryH})`);
  assert.ok(Math.abs(await gridTop()-before)<2,'the function grid does not move while reading (the list gets shorter instead)');
  assert.ok(await page.locator('.home-reader [data-reader-run]').first().isVisible(),'action buttons ready in the reader');
  await page.screenshot({path:out+'/91-lecteur-ouvert.png'});

  // Finishing the action from the reader: it is counted and the next one takes its place.
  const idx=(await page.locator('.reader-item strong').allInnerTexts()).findIndex(t=>t.startsWith('Lecteur test'));
  assert.ok(idx>=0);
  await page.locator('.reader-list').evaluate((el,i)=>el.scrollTo({top:(i+1)*72}),idx);
  await page.waitForFunction(()=>/^Lecteur test/.test(document.querySelector('.home-reader .reader-title strong')?.textContent||''));
  const titleBefore=await page.locator('.home-reader .reader-title strong').innerText();
  const finish=page.locator('.home-reader .reader-btn.is-main');
  assert.equal(await finish.innerText(),'Terminé');
  await finish.click();
  await page.waitForFunction(t=>document.querySelector('.home-reader:not([hidden]) .reader-title strong')?.textContent!==t,titleBefore);
  assert.equal(await page.locator('.reader-item').count(),n-1,'finished action left the queue');
  assert.match(await page.locator('.reader-count').innerText(),/1 traité/);

  // Back to the top: the treasury returns.
  await page.locator('[data-reader-back]').click();
  await page.locator('#homeTreasury .home-treasury').waitFor({state:'visible'});
  assert.ok(Math.abs(await gridTop()-before)<2,'grid back at its place');

  // The switch in the account menu restores the classic action cards.
  await page.evaluate(()=>document.querySelector('#accountReader').click());
  await page.locator('.priority-card').first().waitFor();
  assert.equal(await page.locator('.reader-item').count(),0);
  assert.equal(await page.locator('#accountReader').getAttribute('aria-checked'),'false');
  await page.evaluate(()=>document.querySelector('#accountReader').click());
  await page.locator('.reader-item').first().waitFor();
  // Messages d'essai: 16 simulated messages on top, marked « Essai », a button counts them as done, nothing saved.
  await page.evaluate(()=>document.querySelector('#accountReaderSamples').click());
  await page.waitForFunction(()=>document.querySelectorAll('.reader-item .reader-tag').length===16);
  // Money colour code in the small cards: + green when it comes in, − red when it goes out.
  const money=await page.evaluate(()=>{const get=t=>{const it=[...document.querySelectorAll('.reader-item')].find(e=>e.innerText.includes(t))?.querySelector('.reader-money');return it?{text:it.textContent,cls:it.className,color:getComputedStyle(it).color}:null;};return {inn:get('Bâtiplus SARL'),out:get('Matériaux Durand')};});
  assert.ok(money.inn&&money.inn.text.startsWith('+')&&money.inn.cls.includes('is-in'),'incoming amount in green: '+JSON.stringify(money));
  assert.ok(money.out&&money.out.text.startsWith('−')&&money.out.cls.includes('is-out'),'outgoing amount in red: '+JSON.stringify(money));
  assert.notEqual(money.inn.color,money.out.color);
  await page.locator('.reader-list').evaluate(el=>el.scrollTo({top:72}));
  await page.waitForFunction(()=>document.querySelector('.home-reader:not([hidden]) .reader-tag'));
  assert.ok((await page.locator('.home-reader').innerText()).includes('Bâtiplus SARL'));
  assert.ok(Math.abs(await gridTop()-before)<2,'grid still in place with the test messages');
  await page.screenshot({path:out+'/92-lecteur-essai.png'});
  await page.locator('.home-reader .reader-btn',{hasText:'Modifier'}).click();
  await page.locator('.home-reader.is-editing [data-draft="amount"]').fill('1 350 €');
  await page.screenshot({path:out+'/93-lecteur-modifier.png'});
  await page.locator('.home-reader .reader-btn',{hasText:'Enregistrer et envoyer'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.reader-item .reader-tag').length===15);
  await page.evaluate(()=>document.querySelector('#accountReaderSamples').click());
  await page.waitForFunction(()=>document.querySelectorAll('.reader-item .reader-tag').length===0);
  assert.deepEqual(errors,[]);
  console.log('reader ok');
 }catch(e){await page.screenshot({path:out+'/99-lecteur-erreur.png'}).catch(()=>{});console.error(e);process.exitCode=1;}
 finally{await browser.close();}
})();
