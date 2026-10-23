'use strict';
// Real JPEGs through the existing trial notification: full image, carousel, Text and unchanged function cells.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 try{
 for(const size of [{width:375,height:667},{width:430,height:932}]){
  const page=await browser.newPage({viewport:size,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8123/');await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');await page.getByRole('button',{name:'Se connecter'}).click();await page.locator('.home-pages').waitFor();
  await page.evaluate(()=>homeReader.setSamples(true));await page.waitForTimeout(500);
  const index=await page.evaluate(()=>[...document.querySelectorAll('.reader-list .reader-item')].findIndex(e=>e.textContent.includes('Vos 7 photos du casque')));assert(index>=0);
  await page.locator('.reader-list [data-reader-item]').nth(index).click();await page.waitForTimeout(500);
  assert.equal(await page.locator('.reader-thumbs .reader-thumb').count(),7);assert.equal(await page.locator('.home-reader.is-image').count(),0,'text initially');
  await page.locator('.reader-thumbs img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
  assert(await page.locator('[data-files-next]').isVisible(),'carousel has overflow indicator');
  const grid=await page.locator('.home-pages').evaluate(e=>e.getBoundingClientRect().top);
  for(let i=0;i<7;i++){
   await page.locator('.reader-thumbs').evaluate((e,i)=>{const t=e.querySelector(`[data-file="${i}"]`);e.scrollLeft=t.offsetLeft-e.offsetLeft;},i);
   await page.locator(`.reader-thumb[data-file="${i}"]`).click();await page.locator('.reader-stage-img').evaluate(e=>e.decode());
   const img=await page.locator('.reader-stage-img').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('.home-reader').getBoundingClientRect();return {w:r.width,h:r.height,nw:e.naturalWidth,nh:e.naturalHeight,fit:getComputedStyle(e).objectFit,inside:r.left>=p.left-1&&r.right<=p.right+1&&r.top>=p.top-1&&r.bottom<=p.bottom+1};});
   assert(img.nw>800&&img.nh>800,'actual full JPEG decoded');assert(img.inside,'whole photo fits reader '+JSON.stringify(img));assert.equal(img.fit,'contain','photo proportions preserved without cropping');
   if(i===0||i===6)await page.screenshot({path:`/tmp/aia-real-photo-${size.width}-${i}.png`});
  }
  await page.locator('.reader-text-thumb').click();assert.equal(await page.locator('.home-reader.is-image').count(),0,'Text restores message');assert.match(await page.locator('.reader-body').innerText(),/sept photos/);
  assert(Math.abs(await page.locator('.home-pages').evaluate(e=>e.getBoundingClientRect().top)-grid)<1,'functions stay put');
  const zone=await page.locator('.home-back-zone').evaluate(e=>e.getBoundingClientRect().height);assert(Math.abs(zone-12)<1);
  const glyphs=await page.locator('.home-page .module-icon svg[data-icon]').evaluateAll(svg=>svg.map(e=>{const b=e.getBBox(),v=e.viewBox.baseVal;return {key:e.dataset.icon,padding:Math.min(b.x-v.x,b.y-v.y,v.x+v.width-b.x-b.width,v.y+v.height-b.y-b.height),fill:Math.max(b.width/v.width,b.height/v.height),ratio:e.getBoundingClientRect().width/e.parentElement.getBoundingClientRect().width};}));
  for(const g of glyphs){assert(g.padding>=1,'stroke margin '+JSON.stringify(g));assert(g.fill>=.78,'maximized glyph '+JSON.stringify(g));assert(g.ratio>=.80,'larger glyph '+JSON.stringify(g));}
  assert.deepEqual(errors,[]);console.log('real photos and glyphs OK',size);await page.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
