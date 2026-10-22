'use strict';
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 await page.addInitScript(()=>{try{localStorage.removeItem('aia-pages');localStorage.setItem('aia-reader','on');localStorage.setItem('aia-reader-samples','on');}catch(e){}});
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.goto('http://127.0.0.1:8123/',{waitUntil:'networkidle'});
 await page.locator('#loginEmail').fill('ui-owner@example.test');await page.locator('#loginPassword').fill('local-ui-smoke-test-only');
 await page.getByRole('button',{name:'Se connecter'}).click();await page.locator('#content .reader-list .reader-item').first().waitFor();await page.waitForTimeout(1000);
 const cdp=await ctx.newCDPSession(page);
 const swipe=async(x,y1,y2)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y1}]});for(let k=1;k<=6;k++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y1+(y2-y1)*k/6}]});}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(900);};
 const state=()=>page.evaluate(()=>{const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom)];};const z=document.querySelector('.home-back-zone'),zr=z?.getBoundingClientRect();let hit=null;if(zr){const el=document.elementFromPoint(195,(zr.top+zr.bottom)/2);hit=el?(el.tagName+'.'+el.className).slice(0,80):null;}
  return {title:document.querySelector('#content .home-reader:not([hidden]) .reader-title, #content .home-reader:not([hidden]) strong')?.textContent?.slice(0,30),list:R(document.querySelector('#content .reader-list')),zone:R(z),files:R(document.querySelector('#content .reader-files')),pages:R(document.querySelector('#content .home-pages')),actions:R(document.querySelector('.home-action-row')),hit,scroll:document.querySelector('#content .reader-list')?.scrollTop};});
 await page.evaluate(()=>{const l=document.querySelector('#content .reader-list');l.scrollTo({top:Number(document.body.dataset.readerPitch)||54});});await page.waitForTimeout(1200);
 let s=await state();console.log('READING',JSON.stringify(s));
 if(s.zone){const y=(s.zone[0]+s.zone[1])/2;await swipe(195,y+20,y-40);console.log('AFTER SWIPE UP',JSON.stringify(await state()));await swipe(195,y-20,y+40);console.log('AFTER SWIPE DOWN',JSON.stringify(await state()));}
 const idx=await page.evaluate(()=>[...document.querySelectorAll('#content .reader-list .reader-item')].findIndex(e=>/Photos du chantier/.test(e.textContent)));
 await page.evaluate(i=>{const l=document.querySelector('#content .reader-list');l.scrollTo({top:(i+1)*(Number(document.body.dataset.readerPitch)||54)});},idx);await page.waitForTimeout(1200);
 console.log('FILES',JSON.stringify(await state()));
 // grip
 const g=await page.evaluate(()=>{const b=document.querySelector('.reader-grip');if(!b)return null;const r=b.getBoundingClientRect();const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {r:[Math.round(r.top),Math.round(r.left)],hit:(el?.className||'').toString().slice(0,60)};});console.log('GRIP',JSON.stringify(g));
 await browser.close();
})();
