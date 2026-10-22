'use strict';
// Geometry regression: no phantom file slot, independent attachments, fixed function pages, and swipe/tap return.
// Run against the isolated UI server; only invented messages are opened. No real communication or provider calls.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 try{
 for(const size of [{width:375,height:667},{width:390,height:844},{width:430,height:932}]){
  const page=await browser.newPage({viewport:size,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8123/');
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();await page.locator('.home-pages').waitFor();
  await page.evaluate(()=>homeReader.setSamples(true));await page.waitForTimeout(800);
  const open=async i=>{await page.evaluate(i=>document.querySelector('#content .reader-list').scrollTo({top:(i+1)*Number(document.body.dataset.readerPitch)}),i);await page.waitForTimeout(400);};
  const geometry=()=>page.evaluate(()=>{const r=s=>{const e=document.querySelector('#content '+s);if(!e)return null;const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,h:b.height};};return {reader:r('.home-reader'),list:r('.reader-list'),files:r('.reader-files'),pages:r('.home-pages'),stack:r('.home-stack'),zone:r('.home-back-zone'),pitch:Number(document.body.dataset.readerPitch),gap:parseFloat(getComputedStyle(document.body).getPropertyValue('--reader-gap'))};});
  const home=await geometry();await open(0);const plain=await geometry();
  assert.equal(plain.files,null);assert(Math.abs(plain.pages.top-home.pages.top)<1,'grid stays in place');
  assert(plain.zone&&plain.zone.h>=8,'usable back/swipe zone exists without files');
  assert(plain.pages.top-plain.list.bottom<=22,'no phantom 52px slot or unused card-sized blank');
  assert(Math.abs((plain.list.h+plain.gap)%plain.pitch)<1,'only complete notification cards');
  const swipe=async dy=>{await page.locator('.home-back-zone').evaluate((e,dy)=>{const r=e.getBoundingClientRect(),x=r.left+30,y=r.top+3;const fire=(type,yy)=>e.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[new Touch({identifier:1,target:e,clientX:x,clientY:yy})],changedTouches:[new Touch({identifier:1,target:e,clientX:x,clientY:yy})]}));fire('touchstart',y);fire('touchmove',y+dy);fire('touchend',y+dy);},dy);await page.waitForTimeout(400);};
  const title=()=>page.locator('.home-reader .reader-card strong').innerText();const first=await title();await swipe(-50);assert.notEqual(await title(),first,'swipe up advances');await swipe(50);assert.equal(await title(),first,'swipe down returns');
  const index=await page.evaluate(()=>[...document.querySelectorAll('.reader-list .reader-item')].findIndex(e=>e.textContent.includes('Photos du chantier')));assert(index>=0);await open(index);const files=await geometry();
  assert(files.files&&files.files.h===46);assert(files.list.h>=60,'even a compact phone keeps a scrollable notification card');assert(files.files.top-files.list.bottom>=12,'files separated from cards and stack');assert(files.pages.top-files.files.bottom>=11.5,'files separated from buttons');assert(files.pages.top-files.files.bottom<=12.5,'no unused space below files');assert(Math.abs(files.pages.top-home.pages.top)<1,'attachments do not move functions');
  await page.locator('.reader-thumb[data-file="0"]').click();await page.locator('.home-reader.is-image .reader-stage-img').waitFor();assert(Math.abs((await geometry()).reader.h-files.reader.h)<1,'image keeps reader height');
  await page.locator('.reader-thumb[data-file="5"]').click();assert.match(await page.locator('.reader-stage-doc').innerText(),/pdf/i);await page.locator('.reader-thumb[data-file="5"]').click();assert.equal(await page.locator('.home-reader.is-image').count(),0);
  await page.screenshot({path:`/tmp/aia-reader-layout-${size.width}.png`});
  await open(0);await page.locator('.home-back-zone').click();await page.waitForTimeout(400);assert(await page.locator('#homeTreasury').isVisible(),'tap returns home');
  assert.deepEqual(errors,[]);console.log('reader layout OK',size, {plainCards:Math.round((plain.list.h+plain.gap)/plain.pitch),filesCards:Math.round((files.list.h+files.gap)/files.pitch)});await page.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
