const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HOME_TEST_CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
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
 for(const key of ['leads','scanner','clients','equipment'])assert.equal(await page.locator(`.module-grid [data-go="${key}"] .module-count`).innerText(),'1');
 assert.equal(await page.locator('.module-grid [data-go="calendar"] .module-count').count(),0);
 assert.equal(await page.locator('.home-modules-heading a').innerText(),'');
 assert.equal(await page.locator('#companySelect option:checked').innerText(),'Éclat Propreté');
 assert(await page.locator('.priority-card').evaluateAll(cards=>cards.every(c=>{const voice=c.querySelector('.voice-button').getBoundingClientRect(),cta=c.querySelector('.priority-cta').getBoundingClientRect();return Math.abs(voice.top-cta.top)<2&&voice.left>=cta.right;})));
 const heights=await page.locator('.priority-card').evaluateAll(cards=>cards.map(c=>c.getBoundingClientRect().height));
 assert(heights.slice(0,2).reduce((a,b)=>a+b,0)+heights[2]/2+24<744,'at least 2.5 action cards fit in the usable viewport');
 assert(await page.locator('.module-icon').evaluateAll(icons=>icons.every(e=>getComputedStyle(e).borderTopColor===getComputedStyle(e).color)));
 const url=page.url();await page.locator('[data-treasury-mode]').click();await page.locator('#cashAdd').waitFor();assert.equal(page.url(),url);await page.locator('#closeContext').click();
 await page.locator('#homeSectorInfo').click();await page.locator('#homeSectorChoice').selectOption('commerce');await page.locator('#saveHomeSector').click();await page.locator('#modalLayer').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(async()=>(await api('/api/companies/1/workspace')).domain),'commerce');
 await page.locator('#assistantDock').click();await page.locator('#assistantMessage').fill('Brouillon préservé');await page.locator('#closeContext').click();
 await page.locator('.module-grid [data-go="leads"]').click();await page.locator('#quoteSearch').waitFor();await page.locator('#closeContextBottom').click();
 await page.locator('#assistantDock').click();assert.equal(await page.locator('#assistantMessage').inputValue(),'Brouillon préservé');await page.locator('#closeContext').click();
 for(const width of [320,390,430])for(const columns of [2,3,4]){
  await page.setViewportSize({width,height:844});await page.evaluate(async columns=>{const w=await api('/api/companies/1/workspace'),s=await api('/api/companies/1/cockpit');updateHomeGrid({...w,columns},s);await renderPriorities({workspace:{...w,columns},cockpit:s});},columns);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert(await page.locator('.module-grid').evaluate(g=>{const rs=[...g.children].map(e=>e.getBoundingClientRect());return document.documentElement.scrollWidth<=innerWidth&&rs.every(r=>Math.abs(r.width-rs[0].width)<1&&Math.abs(r.height-rs[0].height)<1);}));
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>refreshCockpit());await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:process.env.HOME_PREVIEW_DIR+'/accueil-corrige.png',fullPage:true});
 await page.locator('#priorityBlock').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.HOME_PREVIEW_DIR+'/actions-corrigees.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,actionHeights:heights,responsiveConfigurations:9}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
