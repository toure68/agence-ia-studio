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
   if(!w.visible.includes('clients'))await api(`/api/companies/${cid}/workspace`,{method:'PUT',body:JSON.stringify({domain:w.domain,visible:['clients',...w.visible],version:w.version,columns:w.columns||2,rows:10})});
  });
  await page.reload({waitUntil:'networkidle'});await page.locator('#content .module-grid [data-go="clients"]').waitFor();
  const before=await page.evaluate(()=>({scroll:scrollY,top:document.querySelector('#content .module-grid').getBoundingClientRect().top,url:location.href,tiles:document.querySelectorAll('#content .module-grid:not(.module-reserve-grid-inline) .module-tile').length}));
  await page.locator('#content .module-grid [data-go="clients"]').click();
  const frame=page.locator('#moduleFocus');await frame.waitFor();
  const after=await page.evaluate(()=>({scroll:scrollY,top:document.querySelector('#moduleFocus').getBoundingClientRect().top,url:location.href}));
  assert.equal(after.url,before.url,'No screen change');assert(Math.abs(after.scroll-before.scroll)<2,'No scroll');assert(Math.abs(after.top-before.top)<2,'Same place as the grid '+JSON.stringify({before,after}));
  assert(await page.locator('#content .module-grid:not(.module-reserve-grid-inline)').isHidden(),'Grid hidden');
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
  if(await other.count()){const key=await other.getAttribute('data-focus-app');await other.click();assert.equal(await page.locator('#moduleFocus .focus-app[aria-pressed="true"]').getAttribute('data-focus-app'),key);assert.equal(await page.locator('#moduleFocus').count(),1);await page.locator('#moduleFocus [data-focus-app="clients"]').click();}
  // Buttons readable before any tap (no white on white), same height.
  const buttons=await page.locator('#moduleFocus .focus-btn').evaluateAll(es=>es.map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {text:e.innerText.trim(),color:c.color,bg:c.backgroundColor,h:Math.round(r.height)};}));
  assert.deepEqual(buttons.map(b=>b.text),['Voir tout →','＋ Nouveau client']);
  for(const b of buttons)assert(b.color!==b.bg&&b.h>=40,'Readable button '+JSON.stringify(b));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  // "Voir tout" opens the full function; closing it comes back to the same frame.
  await page.locator('#moduleFocus [data-focus-open]').click();await page.locator('#contextPanel').waitFor();
  await page.locator('#closeContext').click();await page.locator('#contextPanel').waitFor({state:'detached'});
  assert(await frame.isVisible(),'Frame kept after the full view');
  // Escape and the back arrow restore the grid.
  await page.keyboard.press('Escape');assert.equal(await page.locator('#moduleFocus').count(),0);
  assert(await page.locator('#content .module-grid [data-go="clients"]').isVisible());
  await page.locator('#content .module-grid [data-go="clients"]').click();await page.locator('#moduleFocus [data-focus-close]').click();
  assert(await page.locator('.module-reserve-launch').isVisible(),'Reserve button back');
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
