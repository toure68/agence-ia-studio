const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HOME_TEST_CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await page.addInitScript(()=>{try{if(!sessionStorage.getItem('fold-test'))localStorage.setItem('aia-treasury-open','1')}catch(e){}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{try{if(!localStorage.getItem('aia-reader'))localStorage.setItem('aia-reader','off');}catch(e){}}); // classic action cards (mode lecteur: tests/reader.cjs)
 await page.goto('http://127.0.0.1:8125');await page.locator('#loginEmail').fill('Mohamed@preview.test');await page.locator('#loginPassword').fill('local-ui-smoke-test-only');await page.locator('#loginForm button').click();await page.locator('.module-grid').waitFor();
 await page.evaluate(async()=>{
  await api('/api/companies/1/clients',{method:'POST',body:JSON.stringify({name:'omar touré'})});
  await api('/api/companies/1/quotations',{method:'POST',body:JSON.stringify({customer_name:'omar touré',title:'Entretien des locaux',lines:[{description:'Entretien annuel',quantity:1,unit_price:'5208'}]})});
  await api('/api/companies/1/equipment',{method:'POST',body:JSON.stringify({name:'Aspirateur',quantity:1,condition:'worn'})});
  // A real local upload, not a mocked priorities response.
  const pdf=await fetch('/api/test-document-fixture').then(r=>r.text());
  await api('/api/companies/1/documents',{method:'POST',body:JSON.stringify({filename:'devis-reçu.pdf',kind:'quote',data:pdf})});
  await refreshCockpit();
 });
 await page.locator('.priority-card .voice-button').first().waitFor();
 assert.equal(await page.locator('.home-demo-badge').count(),1);
 assert(!/exemple|Aperçu fictif|EUR/.test(await page.locator('.reference-home').innerText()));
 assert.equal(await page.locator('#homeTreasury a').count(),0);
 assert.equal(await page.locator('#homeTreasury [data-home-cash]').count(),2);
 assert((await page.locator('.home-cash-details').innerText()).includes('29 200,00 €'));
 assert((await page.locator('.home-cash-details').innerText()).includes('4 350,00 €'));
 await page.locator('[data-home-cash="in"]').click();assert.equal(await page.locator('#commandText').inputValue(),'Entrée ');
 await page.locator('#commandText').fill('Entrée 12 800,00 € règlement client');await page.locator('#previewCommand').click();
 assert((await page.locator('#commandPreview').innerText()).includes('12 800,00 €'));
 assert(!(await page.locator('#commandPreview').innerText()).includes('EUR'));
 assert.equal(await page.evaluate(async()=>(await api('/api/companies/1/treasury')).movements.length),0);
 await page.locator('#confirmCommand').click();await page.locator('#cashAdd').waitFor();await page.locator('#closeContext').click();await page.evaluate(()=>navigationQueue);
 assert.equal(await page.evaluate(async()=>(await api('/api/companies/1/treasury')).balances_minor.EUR),1280000);
 await page.locator('[data-home-cash="out"]').click();assert.equal(await page.locator('#commandText').inputValue(),'Sortie ');
 await page.locator('#commandText').fill('Sortie 12 80 € fournitures');await page.locator('#previewCommand').click();
 assert.equal(await page.locator('#confirmCommand').count(),0);assert(await page.locator('#commandError').isVisible());await page.keyboard.press('Escape');
 for(const key of ['leads','scanner','clients','equipment'])assert.equal(await page.locator(`.module-grid [data-go="${key}"] .module-count`).innerText(),'1');
 assert.equal(await page.locator('.module-grid [data-go="calendar"] .module-count').count(),0);
 assert.equal(await page.locator('.home-modules-heading a').innerText(),'');
 assert.equal(await page.locator('#companySelect option:checked').textContent(),'Éclat Propreté');
 assert(await page.locator('.priority-card').evaluateAll(cards=>cards.every(c=>{const card=c.getBoundingClientRect(),voice=c.querySelector('.voice-button').getBoundingClientRect(),cta=c.querySelector('.priority-cta').getBoundingClientRect();return voice.bottom<=cta.top&&voice.top-card.top<20&&card.right-voice.right<60&&Math.abs((cta.left-card.left)-(card.right-cta.right))<3;})),'Speaker sits top right; green button centered');
 const heights=await page.locator('.priority-card').evaluateAll(cards=>cards.map(c=>c.getBoundingClientRect().height));
 assert(heights.slice(0,2).reduce((a,b)=>a+b,0)+heights[2]/2+24<744,'at least 2.5 action cards fit in the usable viewport');
 assert(await page.locator('.priority-cta').evaluateAll(buttons=>buttons.every(e=>getComputedStyle(e).backgroundColor==='rgb(74, 222, 128)')));
 assert(await page.locator('.module-grid [data-go="leads"]').evaluate(e=>e.classList.contains('tone-green')));
 assert(await page.locator('.module-grid [data-go="clients"]').evaluate(e=>e.classList.contains('tone-blue')));
 assert((await page.locator('.priority-stack').innerText()).includes('5 208,00 €'));
 assert((await page.locator('.priority-stack').innerText()).includes('devis-reçu.pdf'));
 await page.locator('[data-priority-module="scanner"] [data-priority-open]').click();await page.locator('#documentReview').waitFor();await page.locator('#closeContext').click();await page.evaluate(()=>navigationQueue);
 const url=page.url();await page.locator('[data-treasury-mode]').click();await page.locator('#cashAdd').waitFor();assert.equal(page.url(),url);await page.locator('#closeContext').click();await page.evaluate(()=>navigationQueue);
 assert.equal(await page.locator('#content .home-sector').count(),0,'Veille métier is a reserve function, not a fixed home card');
 await page.evaluate(()=>openTab('veille'));await page.locator('#homeSectorInfo').click();await page.locator('#homeSectorChoice').selectOption('commerce');await page.locator('#saveHomeSector').click();await page.locator('#modalLayer').waitFor({state:'hidden'});await page.locator('#closeContext').click();await page.evaluate(()=>navigationQueue);
 assert.equal(await page.evaluate(async()=>(await api('/api/companies/1/workspace')).domain),'commerce');
 await page.locator('#assistantDock').click();await page.locator('#assistantMessage').fill('Brouillon préservé');await page.locator('#closeContext').click();await page.evaluate(()=>navigationQueue);
 await page.locator('.module-grid [data-go="leads"]').click();await page.locator('#quoteSearch').waitFor();await page.locator('#closeContextBottom').click();await page.evaluate(()=>navigationQueue);
 await page.locator('#assistantDock').click();assert.equal(await page.locator('#assistantMessage').inputValue(),'Brouillon préservé');await page.locator('#closeContext').click();await page.evaluate(()=>navigationQueue);
 for(const width of [320,390,430])for(const columns of [2,3,4]){
  await page.setViewportSize({width,height:844});await page.evaluate(async columns=>{const w=await api('/api/companies/1/workspace'),s=await api('/api/companies/1/cockpit');updateHomeGrid({...w,columns},s);await renderPriorities({workspace:{...w,columns},cockpit:s});},columns);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert(await page.locator('.module-grid').evaluate(g=>{const rs=[...g.children].map(e=>e.getBoundingClientRect());return document.documentElement.scrollWidth<=innerWidth&&rs.every(r=>Math.abs(r.width-rs[0].width)<1&&Math.abs(r.height-rs[0].height)<1);}));
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>refreshCockpit());await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:process.env.HOME_PREVIEW_DIR+'/accueil-epure.png',fullPage:true});
 await page.screenshot({path:process.env.HOME_PREVIEW_DIR+'/accueil-mobile-epure.png'});
 await page.locator('#priorityBlock').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.HOME_PREVIEW_DIR+'/actions-epurees.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,actionHeights:heights,responsiveConfigurations:9}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
