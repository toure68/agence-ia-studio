const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HOME_TEST_CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],apiRequests=[];
 await page.addInitScript(()=>{try{if(!localStorage.getItem('aia-reader'))localStorage.setItem('aia-reader','off');if(!localStorage.getItem('aia-pages'))localStorage.setItem('aia-pages','off');}catch(e){}}); // classic action cards and grid (mode lecteur: tests/reader.cjs, accueil iPhone: tests/pages.cjs)
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push(r.url());});
 await page.goto('http://127.0.0.1:8125/demo');await page.locator('.module-grid').waitFor();
 assert(await page.locator('#auth').isHidden());assert(await page.locator('.demo-notice').isVisible());
 for(const tab of ['clients','leads','activities','treasury','workspace','tools','reports','emails']){
  await page.evaluate(async tab=>{await openTab(tab);await navigationQueue;},tab);
  assert(!/Erreur du serveur|Cet exemple ne figure/.test(await page.locator('#content').innerText()),tab);
  await page.evaluate(async()=>{await openTab('dashboard');await navigationQueue;});
 }
 const msg=await page.evaluate(async()=>{try{await api('/api/companies/1/clients',{method:'POST',body:'{}'});}catch(e){return e.message;}});
 assert(msg.includes('lecture seule'));assert.deepEqual(errors,[]);assert.deepEqual(apiRequests,[]);
 console.log('Public demo: mobile navigation, read-only protection and no production API requests verified.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
