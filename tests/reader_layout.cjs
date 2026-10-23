'use strict';
// Geometry regression: no phantom file slot, independent attachments, fixed function pages, and swipe/tap return.
// Run against the isolated UI server; only invented messages are opened. No real communication or provider calls.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const openSessionPage=require('./ui_session.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 try{
 for(const size of [{width:375,height:667},{width:390,height:844},{width:430,height:932}]){
  const page=await openSessionPage(browser,{viewport:size,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>homeReader.setSamples(true));await page.waitForTimeout(800);
  const open=async i=>{await page.locator('.reader-list [data-reader-item]').nth(i).click();await page.waitForTimeout(400);};
  const geometry=()=>page.evaluate(()=>{const r=s=>{const e=document.querySelector('#content '+s);if(!e)return null;const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,h:b.height};};return {reader:r('.home-reader'),list:r('.reader-list'),files:r('.reader-files'),pages:r('.home-pages'),stack:r('.home-stack'),zone:r('.home-back-zone'),pitch:Number(document.querySelector('.reader-list')?.dataset.pitch)||Number(document.body.dataset.readerPitch),gap:parseFloat(getComputedStyle(document.body).getPropertyValue('--reader-gap'))};});
  const home=await geometry();await open(0);const plain=await geometry();
  assert.equal(plain.files,null);assert(plain.list.h>=60,'complete notification cards remain available');assert(Math.abs(plain.pages.top-home.pages.top)<1,'grid stays in place');
  assert(plain.zone&&plain.zone.h>=8,'spare room is a swipe zone without files');
  assert(plain.pages.top-plain.list.bottom>=8,'spare room stays above functions');
  assert(Math.abs((plain.list.h+plain.gap)%plain.pitch)<1,'only complete notification cards');
  const swipe=async dy=>{await page.locator('.home-back-zone').evaluate((e,dy)=>{const r=e.getBoundingClientRect(),x=r.left+30,y=r.top+3;const fire=(type,yy)=>e.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[new Touch({identifier:1,target:e,clientX:x,clientY:yy})],changedTouches:[new Touch({identifier:1,target:e,clientX:x,clientY:yy})]}));fire('touchstart',y);fire('touchmove',y+dy);fire('touchend',y+dy);},dy);await page.waitForTimeout(400);};
  const title=()=>page.locator('.home-reader .reader-card strong').innerText();const first=await title();await swipe(-50);assert.notEqual(await title(),first,'swipe up advances');await swipe(50);assert.equal(await title(),first,'swipe down returns');
  const index=await page.evaluate(()=>[...document.querySelectorAll('.reader-list .reader-item')].findIndex(e=>e.textContent.includes('Photos du chantier')));assert(index>=0);await open(index);const files=await geometry();
  const plainCount=Math.round((plain.list.h+plain.gap)/plain.pitch),fileCount=Math.round((files.list.h+files.gap)/files.pitch);
  assert(files.files&&files.files.h>=46&&files.files.h<=72);assert(fileCount<plainCount||(plainCount===1&&fileCount===1),'files use queue space, retaining one notification on short screens');assert(files.list.h>=60,'even a compact phone keeps a scrollable notification card');assert(files.files.top-files.list.bottom>=16,'files separated from cards and stack');assert(files.zone.h>=16,'comfortable zone below files');assert(Math.abs(files.reader.h-plain.reader.h)<1,'files never shrink the reader');assert(Math.abs(files.pages.top-home.pages.top)<1,'attachments do not move functions');
  await page.locator('.reader-thumb[data-file="0"]').click();await page.locator('.home-reader.is-image .reader-stage-img').waitFor();assert(Math.abs((await geometry()).reader.h-files.reader.h)<1,'image keeps reader height');
  await page.locator('.reader-thumb[data-file="5"]').click();assert.match(await page.locator('.reader-stage-doc').innerText(),/pdf/i);await page.locator('.reader-text-thumb').click();assert.equal(await page.locator('.home-reader.is-image').count(),0);assert.equal(await page.locator('.reader-text-thumb').getAttribute('aria-pressed'),'true');
  // One image centers with Text, without empty cells; ten images scroll while Text stays pinned.
  for(const count of [1,10]){
   await page.evaluate(count=>{const c=window.readerSamples.find(c=>c.files?.length);const original=c.files.find(f=>f.type==='image');c.files=Array.from({length:count},(_,i)=>({...original,name:'Photo '+(i+1)}));homeReader.setSamples(true);},count);await page.waitForTimeout(400);await open(index);
   assert.equal(await page.locator('.reader-thumbs .reader-thumb').count(),count);
   assert.equal(await page.locator('.home-reader.is-image').count(),0,'message always starts with text');
   assert.equal(await page.locator('.reader-text-thumb').getAttribute('aria-pressed'),'true');
   const positions=()=>page.evaluate(()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,right:b.right,y:b.y,w:b.width}};return {row:r('.reader-file-row'),text:r('.reader-text-thumb'),files:r('.reader-files'),window:r('.reader-file-window')};});
   const before=await positions();
   if(count===1){assert(Math.abs((before.row.x+before.row.right)/2-size.width/2)<1,'one image + Text centered');assert.equal(await page.locator('[data-files-next]').isVisible(),false);}
   else{
    assert(await page.locator('[data-files-next]').isVisible(),'overflow has a visible next arrow');
    await page.locator('[data-files-next]').click();await page.waitForTimeout(200);assert(await page.locator('.reader-thumbs').evaluate(e=>e.scrollLeft>0),'arrow scrolls images');
    const after=await positions();assert.equal(after.text.x,before.text.x,'Text tile is pinned');
    await page.locator('.reader-thumbs').evaluate(e=>e.scrollTo({left:e.scrollWidth}));await page.waitForTimeout(200);assert(await page.locator('[data-files-prev]').isVisible());assert.equal(await page.locator('[data-files-next]').isVisible(),false);
   }
   await page.locator(`.reader-thumb[data-file="${count-1}"]`).click();await page.locator('.reader-stage-img').waitFor();
   await page.locator('.reader-text-thumb').click();assert.equal(await page.locator('.home-reader.is-image').count(),0,'Text restores the message');
   assert((await geometry()).zone.h>=16);
   await page.screenshot({path:`/tmp/aia-carousel-${size.width}-${count}.png`});
  }
  await page.screenshot({path:`/tmp/aia-reader-layout-${size.width}.png`});
  await page.locator('.reader-thumb[data-file="0"]').click();await page.locator('.reader-stage-img').waitFor();await swipe(-50);assert.equal(await page.locator('.home-reader.is-image').count(),0,'changing message resets to text');await swipe(50);assert.equal(await page.locator('.reader-text-thumb').getAttribute('aria-pressed'),'true','returning to message starts with text');
  // The swipe deliberately suppresses its trailing synthetic click for 500ms.
  await page.waitForTimeout(550);
  await page.locator('.reader-thumb[data-file="0"]').click();await page.locator('.reader-stage-img').waitFor();await page.locator('.home-back-zone').click();await page.waitForTimeout(400);assert.equal(await page.locator('.home-reader.is-image').count(),0,'bottom tap returns home');assert.equal(await page.locator('.reference-home.reader-active').count(),0,'Blank tap returns home');await open(index);assert.equal(await page.locator('.home-reader.is-image').count(),0,'reopening the same message starts with text');
  await open(0);await page.locator('.reader-grip').click();await page.waitForTimeout(400);assert(await page.locator('#homeTreasury').isVisible(),'reader grip returns home');
  assert.deepEqual(errors,[]);console.log('reader layout OK',size, {plainCards:Math.round((plain.list.h+plain.gap)/plain.pitch),filesCards:Math.round((files.list.h+files.gap)/files.pitch)});await page.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
