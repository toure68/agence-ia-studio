'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu'],...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:{})});
 try{
 for(const [width,height] of [[375,667],[390,844],[430,932]]){
  const p=await b.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'no-preference'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('aia-reader-samples','on'));
  await p.goto('http://127.0.0.1:8123/demo');await p.locator('.reader-list .reader-item').first().waitFor();await p.waitForTimeout(500);
  await p.locator('.reader-list .reader-item').nth(2).click();await p.waitForTimeout(500);
  const rect=()=>p.locator('.home-reader').evaluate(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
  const fixed=await rect(),title=()=>p.locator('.reader-card strong').textContent(),initial=await title();
  const fire=async(type,dy)=>p.locator('.reader-list').evaluate((el,{type,dy})=>{
   const r=el.getBoundingClientRect(),x=r.left+60,y=r.top+35+dy;
   const t=new Touch({identifier:1,target:el,clientX:x,clientY:y});
   el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:['touchend','touchcancel'].includes(type)?[]:[t],changedTouches:[t]}));
  },{type,dy});
  const snap=()=>p.locator('.reader-list').evaluate(e=>({top:e.scrollTop,pitch:Number(e.dataset.pitch),motion:e.dataset.pileMotion,transforms:[...e.querySelectorAll('.reader-item')].filter(x=>getComputedStyle(x).visibility!=='hidden').map(x=>x.style.transform)}));
  const checkBounds=()=>p.locator('.reader-list').evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('.reader-item')].filter(e=>getComputedStyle(e).visibility!=='hidden').every(e=>{const r=e.getBoundingClientRect();return r.bottom<=b.bottom+1&&r.top>=b.top-1})});
  const origin=await snap();fs.mkdirSync('/tmp/reader-pile',{recursive:true});
  await fire('touchstart',0);
  for(const dy of [-10,-25,-45]){
   await fire('touchmove',dy);await p.waitForTimeout(20);const s=await snap();
   assert.equal(s.top,origin.top,'Focused message stays anchored until release');assert.equal(await title(),initial);
   assert.equal(s.motion,'1');assert(s.transforms.some(t=>t.includes('scale(')));assert(await checkBounds(),'Folding cards stay inside the pile');
   await p.screenshot({path:`/tmp/reader-pile/${width}-drag-${-dy}.png`});
  }
  await fire('touchend',-45);await p.waitForTimeout(400);
  assert.notEqual(await title(),initial,'Release selects the next message');assert.equal((await snap()).top,origin.top+origin.pitch);
  assert.deepEqual(await rect(),fixed,'Reader position and size stay fixed');
  // Short movement springs back; reversing the gesture restores the previous message.
  const next=await title(),at=await snap();await fire('touchstart',0);await fire('touchmove',-10);await fire('touchend',-10);await p.waitForTimeout(400);
  assert.equal(await title(),next);assert.equal((await snap()).top,at.top);
  await fire('touchstart',0);await fire('touchmove',45);await fire('touchend',45);await p.waitForTimeout(400);assert.equal(await title(),initial);
  await fire('touchstart',0);await fire('touchmove',-45);await fire('touchcancel',-45);await p.waitForTimeout(400);assert.equal(await title(),initial);
  await p.emulateMedia({reducedMotion:'reduce'});await fire('touchstart',0);await fire('touchmove',-45);await fire('touchend',-45);assert.notEqual(await title(),initial);assert.equal((await snap()).motion,undefined);
  assert.deepEqual(errors,[]);console.log('Magnetic pile OK',width);await p.close();
 }
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
