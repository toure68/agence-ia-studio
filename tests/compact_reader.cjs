const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{}),args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 const results=[];fs.mkdirSync('/tmp/compact-reader',{recursive:true});
 for(const [width,height] of [[390,844],[430,932],[375,667],[768,1024]]){
  const p=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('aia-reader-samples','on');localStorage.setItem('aia-pages-grid',JSON.stringify({cols:4,rows:2}));});
  await p.goto('http://127.0.0.1:8123/demo');await p.locator('.reader-list .reader-item').first().waitFor();await p.waitForTimeout(900);
  const open=async title=>{const i=await p.locator('.reader-list .reader-item').evaluateAll((els,title)=>els.findIndex(e=>e.textContent.includes(title)),title);assert(i>=0,title);await p.locator('.reader-list .reader-item').nth(i).click();await p.locator('.home-reader:not([hidden])').waitFor();await p.waitForTimeout(700);if(!(await p.locator('.home-reader').innerText()).includes(title))console.log(await p.evaluate(()=>({title:document.querySelector('.home-reader').innerText,list:document.querySelector('.reader-list').outerHTML.slice(0,200),scroll:document.querySelector('.reader-list').scrollTop,items:[...document.querySelectorAll('.reader-list .reader-item')].slice(0,3).map(x=>({h:x.getBoundingClientRect().height,top:x.getBoundingClientRect().top,gap:getComputedStyle(x.parentElement).gap}))})));assert((await p.locator('.home-reader').innerText()).includes(title),'Correct message remains selected');};
  const geometry=()=>p.evaluate(()=>{const r=s=>document.querySelector(s)?.getBoundingClientRect(),list=r('.reader-list'),pg=r('.home-pages'),files=r('.reader-files'),card=r('.home-reader'),icons=[...document.querySelectorAll('.home-page[data-page="0"] .module-card:not(.home-slot-reserved) .module-icon')].map(e=>e.getBoundingClientRect());
   const items=[...document.querySelectorAll('.reader-list .reader-item')].map(e=>e.getBoundingClientRect()).filter(r=>r.top>=list.top-1&&r.bottom<=list.bottom+1);
   return {reader:card.height,grid:pg.top,tail:pg.top-(files?.bottom||list.bottom),cards:items.length,cols:Number(document.querySelector('.home-pages').dataset.columns),icon:icons[0]?.width,iconGap:icons.length>1?icons[1].left-icons[0].right:null,errors:[],bodyHeight:document.querySelector('.reference-home').getBoundingClientRect().bottom,vh:innerHeight};});
  await open('M. Dupuis');const text=await geometry();await p.screenshot({path:`/tmp/compact-reader/${width}-text.png`});
  assert.equal(text.cols,width===430?7:width===768?12:6,'Columns adapt to screen width');
  assert(Math.abs(text.iconGap-13)<1,'Compact, regular icon spacing');
  await open('Vos 7 photos');const files=await geometry();await p.screenshot({path:`/tmp/compact-reader/${width}-files.png`});
  assert(Math.abs(files.reader-text.reader)<=1,JSON.stringify({width,text,files}));
  assert(files.cards<text.cards,'Files replace notification slots '+JSON.stringify({width,text,files}));
  assert(files.tail>=8&&files.tail<=16,'Compact bottom gap '+JSON.stringify(files));
  assert(text.tail>=8&&text.tail<=26,'No blank reserve '+JSON.stringify(text));
  await p.locator('.reader-thumb[data-file="0"]').click();await p.locator('.reader-stage-img').waitFor();await p.waitForTimeout(150);
  const image=await geometry();console.log(JSON.stringify({width,text,files,image}));assert(Math.abs(image.reader-files.reader)<=1,'Image keeps reader height');
  await p.locator('.reader-thumb[data-file="-1"]').click();assert.equal(await p.locator('.home-reader.is-image').count(),0);
  assert.deepEqual(errors,[]);results.push({width,height,text,files,image});await p.close();
 }
 console.log(JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
