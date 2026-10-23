const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 const results=[];fs.mkdirSync('/tmp/compact-reader',{recursive:true});
 for(const [width,height] of [[390,844],[430,932],[375,667],[768,1024]]){
  const p=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('aia-reader-samples','on');localStorage.setItem('aia-pages-grid',JSON.stringify({cols:4,rows:2}));});
  await p.goto('http://127.0.0.1:8123/demo');await p.locator('.reader-list .reader-item').first().waitFor();await p.waitForTimeout(900);
  const open=async title=>{const i=await p.locator('.reader-list .reader-item').evaluateAll((els,title)=>els.findIndex(e=>e.textContent.includes(title)),title);assert(i>=0,title);await p.locator('.reader-list .reader-item').nth(i).click();await p.locator('.home-reader:not([hidden])').waitFor();await p.waitForTimeout(700);if(!(await p.locator('.home-reader').innerText()).includes(title))console.log(await p.evaluate(()=>({title:document.querySelector('.home-reader').innerText,list:document.querySelector('.reader-list').outerHTML.slice(0,200),scroll:document.querySelector('.reader-list').scrollTop,items:[...document.querySelectorAll('.reader-list .reader-item')].slice(0,3).map(x=>({h:x.getBoundingClientRect().height,top:x.getBoundingClientRect().top,gap:getComputedStyle(x.parentElement).gap}))})));assert((await p.locator('.home-reader').innerText()).includes(title),'Correct message remains selected');};
  const geometry=()=>p.evaluate(()=>{const r=s=>document.querySelector(s)?.getBoundingClientRect(),list=r('.reader-list'),pg=r('.home-pages'),files=r('.reader-files'),card=r('.home-reader'),icons=[...document.querySelectorAll('.home-page[data-page="0"] .module-card:not(.home-slot-reserved) .module-icon')].map(e=>e.getBoundingClientRect());
   const items=[...document.querySelectorAll('.reader-list .reader-item')].map(e=>e.getBoundingClientRect()).filter(r=>r.top>=list.top-1&&r.bottom<=list.bottom+1);
   return {reader:card.height,grid:pg.top,tail:(r('.home-action-row')?.top||pg.top)-(files?.bottom||list.bottom),cards:items.length,cols:Number(document.querySelector('.home-pages').dataset.columns),cardHeight:items[0]?.height,icon:icons[0]?.width,iconGap:icons.length>1?icons[1].left-icons[0].right:null,errors:[],bodyHeight:document.querySelector('.reference-home').getBoundingClientRect().bottom,vh:innerHeight};});
  const home=await geometry();
  await open('M. Dupuis');const text=await geometry();await p.screenshot({path:`/tmp/compact-reader/${width}-text.png`});
  assert.equal(text.cols,width===768?12:6,'Phones show six columns; tablets adapt to screen width');
  assert(Math.abs(text.iconGap-9)<1,'Larger icons keep equal horizontal and vertical gaps');
  assert(text.reader>=(height>700?320:230),'Reader is taller, within the available screen space');
  const clipped=await p.evaluate(()=>{
   const home=document.querySelector('.reference-home').getBoundingClientRect(),grid=document.querySelector('.home-pages').getBoundingClientRect();
   return [...document.querySelectorAll('.home-page[data-page="0"] .module-icon,.home-page[data-page="0"] .module-count')].filter(e=>{
    const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(!r.width||!r.height)return false;
    const extra=e.classList.contains('module-count')?2:Math.max(0,parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset));
    return r.left-extra<home.left-.5||r.right+extra>home.right+.5||r.top-extra<grid.top-.5||r.bottom+extra>grid.bottom+.5;
   }).map(e=>e.className);
  });
  assert.deepEqual(clipped,[],'Icons, reading outline and counters fit inside the visible grid');
  await open('Vos 7 photos');const files=await geometry();await p.screenshot({path:`/tmp/compact-reader/${width}-files.png`});
  assert(Math.abs(files.reader-text.reader)<=1,JSON.stringify({width,text,files}));
  const carousel=await p.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),f=r('.reader-files'),l=r('.reader-list'),a=r('.home-action-row'),strip=r('.reader-thumbs'),row=r('.reader-file-row');const thumbs=[...document.querySelectorAll('.reader-thumbs .reader-thumb')].map(e=>e.getBoundingClientRect()).filter(r=>r.left>=strip.left-.5&&r.right<=strip.right+.5);return {above:f.top-l.bottom,below:a.top-f.bottom,count:thumbs.length+1,square:thumbs.every(r=>Math.abs(r.width-r.height)<.5),center:(row.left+row.right)/2,screen:innerWidth/2};});
  assert(Math.abs(carousel.above-carousel.below)<1,'Carousel has equal upper/lower gaps '+JSON.stringify(carousel));assert.equal(carousel.count,6,'Text plus five complete image slots');assert(carousel.square,'Thumbnails remain square');assert(Math.abs(carousel.center-carousel.screen)<1,'Carousel is horizontally centered');

  assert.equal(files.cards,text.cards,'Attachments preserve all notification slots '+JSON.stringify({width,text,files}));
  assert(files.tail>=2&&files.tail<90,'Strip fits between notifications and actions '+JSON.stringify(files));
  assert(text.tail>=8,'Spare room separates notifications from actions '+JSON.stringify(text));
  assert(Math.abs(text.cardHeight-home.cardHeight)<1,'Text cards retain the home height');
  assert(Math.abs(files.cardHeight-home.cardHeight)<1,'File-message cards retain the home height');
  assert(Math.abs(text.icon-home.icon)<1&&Math.abs(files.icon-home.icon)<1,'Function icons retain their home size');
  assert.equal(await p.locator('.reader-card .reader-item').count(),0,'No nested notification card');
  assert(await p.locator('.reader-text-thumb').evaluate(b=>{const r=b.getBoundingClientRect(),s=b.querySelector('svg')?.getBoundingClientRect();return s&&Math.abs(s.width-r.width)<1&&Math.abs(s.height-r.height)<1&&getComputedStyle(b).backgroundColor==='rgb(244, 240, 230)';}),'Text illustration fills the entire light tile');
  assert(await p.locator('.reader-files').evaluate(e=>{const r=e.getBoundingClientRect(),l=document.querySelector('.reader-list').getBoundingClientRect(),a=document.querySelector('.home-action-row').getBoundingClientRect();return r.height>0&&r.top>=l.bottom&&r.bottom<=a.top;}),'Carousel occupies only the existing gap');
  await p.locator('.reader-thumb[data-file="0"]').click();await p.locator('.reader-stage-img').waitFor();await p.waitForTimeout(150);
  const image=await geometry();console.log(JSON.stringify({width,text,files,image}));assert(Math.abs(image.reader-files.reader)<=1,'Image keeps reader height');
  await p.locator('.reader-thumb[data-file="-1"]').click();assert.equal(await p.locator('.home-reader.is-image').count(),0);
  // Real touch gestures use whole-card stack transitions, including every sampled animation frame.
  await p.emulateMedia({reducedMotion:'no-preference'});
  const motion=await p.locator('.reader-list').evaluate(async el=>{
   const first=el.scrollTop,box=el.getBoundingClientRect(),x=box.left+30,y=box.top+35;
   const fire=(type,yy)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[new Touch({identifier:1,target:el,clientX:x,clientY:yy})],changedTouches:[new Touch({identifier:1,target:el,clientX:x,clientY:yy})]}));
   fire('touchstart',y);fire('touchmove',y-60);
   const moving=el.dataset.pileMotion==='1'&&[...el.querySelectorAll('.reader-item')].some(e=>e.style.transform.includes('translateY('));
   const tracked=el.scrollTop===first;
   fire('touchend',y-60);
   let partial=0;
   for(let i=0;i<20;i++){await new Promise(requestAnimationFrame);const b=el.getBoundingClientRect();for(const item of el.querySelectorAll('.reader-item')){const r=item.getBoundingClientRect();if(r.bottom>b.top+1&&r.top<b.bottom-1&&(r.top<b.top-1||r.bottom>b.bottom+1))partial++;}}
   return {first,after:el.scrollTop,partial,moving,tracked,pitch:Number(el.dataset.pitch)};
  });
  assert(Math.abs(motion.after-motion.first-motion.pitch)<1,'Swipe advances exactly one card');
  assert(motion.moving&&motion.tracked,'Cards follow the finger before magnetic release');
  assert.equal(motion.partial,0,'No card is clipped through the black edge during the animation');
  assert.equal(await p.locator('.reader-files').count(),0,'Next text-only message restores empty gap');
  assert.deepEqual(errors,[]);results.push({width,height,text,files,image});await p.close();
 }
 console.log(JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
