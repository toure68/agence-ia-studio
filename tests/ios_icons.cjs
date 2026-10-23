'use strict';
// Visual-only regression: same cell rectangles, order, routes, and number of pages before/after CSS.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const openSessionPage=require('./ui_session.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 try{
 for(const size of [{width:375,height:667},{width:430,height:932}]){
 for(const cols of [2,3,4]){
  const read=async baseline=>{
   const page=await openSessionPage(browser,{viewport:size,isMobile:true,hasTouch:true,reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(baseline)await page.route('**/static/home-pages.css*',r=>r.fulfill({contentType:'text/css',body:fs.readFileSync(process.env.ICON_BASELINE_CSS,'utf8')}));
   if(baseline)await page.reload();
   await page.evaluate(cols=>{document.querySelector(`#homeColumnChooser [data-set-columns="${cols}"]`).click();},cols);await page.waitForTimeout(600);
   const state=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100)};return {grid:rect(document.querySelector('.home-pages')),pages:document.querySelectorAll('.home-page').length,cards:[...document.querySelectorAll('.home-page>.module-card:not(.home-slot-reserved)')].map(e=>{const a=e.querySelector('.module-tile'),icon=e.querySelector('.module-icon'),label=e.querySelector('.module-copy strong'),s=getComputedStyle(icon);return {key:e.dataset.module,href:a.getAttribute('href'),go:a.dataset.go||null,name:a.getAttribute('aria-label'),cell:rect(e),icon:rect(icon),label:rect(label),font:parseFloat(getComputedStyle(label).fontSize),radius:parseFloat(s.borderTopLeftRadius),bg:s.backgroundImage}})};});
   if(!baseline){
    for(const c of state.cards){assert(Math.abs(c.icon[2]-c.icon[3])<1,'square '+c.key);assert(c.icon[1]>=c.cell[1]-1,'icon fits cell '+c.key);assert(c.radius>=25,'rounded corners '+c.key);assert.equal(c.label[3],0,'no visible label '+c.key);assert(c.name&&c.name.length>0,'accessible name '+c.key);assert(c.icon[1]+c.icon[3]<=c.cell[1]+c.cell[3]+1,'icon inside cell '+c.key);}
    await page.screenshot({path:`/tmp/aia-ios-icons-${size.width}-${cols}.png`});
    const first=page.locator('.home-page[data-page="0"] [data-go]').first(),key=await first.getAttribute('data-go');await first.click();await page.locator('#contextPanel').waitFor();assert.equal(await page.locator('#contextPanel').getAttribute('data-module'),key,'same module opens');
   }
   assert.deepEqual(errors,[]);await page.close();return state;
  };
  const before=process.env.ICON_BASELINE_CSS?await read(true):null,after=await read(false);
  if(before){for(let i=0;i<after.cards.length;i++)assert(after.cards[i].icon[2]>=before.cards[i].icon[2],'icon enlarged');const structure=s=>({grid:s.grid,pages:s.pages,cards:s.cards.map(({key,href,go,cell})=>({key,href,go,cell}))});assert.deepEqual(structure(after),structure(before),'all positions, routes and ordering unchanged');}
  console.log('iOS icons OK',size.width,cols,'columns');
 }
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
