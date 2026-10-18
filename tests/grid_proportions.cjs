'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{}),...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8123');
  await page.locator('#loginEmail').fill('ui-owner@example.test');
  await page.locator('#loginPassword').fill('local-ui-smoke-test-only');
  await page.locator('#loginForm button').click();
  await page.locator('.module-grid').waitFor();
  await page.evaluate(async()=>{
   window.layoutWorkspace=await api('/api/companies/1/workspace');
   window.layoutSnapshot=await api('/api/companies/1/cockpit');
   // Keep the same factual modules in both arrangements, including multiline text.
   layoutWorkspace.dynamic=false;
   layoutWorkspace.visible=layoutWorkspace.modules.slice(0,6).map(m=>m.key);
  });
  const results=[];
  for(const width of [320,375,390,430,750,751,844,1280]){
   await page.setViewportSize({width,height:844});
   const measurements=[];
   for(const columns of [2,3,4]){
    await page.evaluate(columns=>{
     const grid=document.querySelector('.module-grid');
     updateHomeGrid({...layoutWorkspace,columns},layoutSnapshot);
    },columns);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const geometry=await page.locator('.module-grid').evaluate(grid=>{
     const bounds=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
     return {overflow:document.documentElement.scrollWidth>innerWidth,cards:[...grid.children].map(card=>{
      const tile=card.querySelector('.module-tile'),icon=card.querySelector('.module-icon'),text=card.querySelector('.module-copy'),label=card.querySelector('strong'),metric=card.querySelector('.widget-metric');
      return {card:bounds(card),tile:bounds(tile),icon:bounds(icon),text:bounds(text),font:parseFloat(getComputedStyle(label).fontSize),metricFont:parseFloat(getComputedStyle(metric).fontSize),padding:parseFloat(getComputedStyle(tile).paddingTop)};
     })};
    });
    assert(!geometry.overflow,`No horizontal overflow at ${width}/${columns}`);
    for(const c of geometry.cards){
     assert(Math.abs(c.card.height-geometry.cards[0].card.height)<.1,'Equal card heights');
     assert(c.tile.bottom<=c.card.bottom+.1,'Button stays within card bottom');
     assert(c.icon.y>=c.tile.y-.1&&c.icon.bottom<=c.tile.bottom+.1,'Icon contained vertically');
     assert(c.icon.bottom<=c.text.y+.1,'Icon is above the label');
     assert(c.text.bottom<=c.tile.bottom+.1,'Text contained vertically');
     assert(Math.abs(c.icon.width-c.icon.height)<.1,'Square icon badge');
     assert(c.card.height>=44,'Touch target remains at least 44px');
    }
    measurements.push(geometry.cards[0]);
   }
   for(const dense of measurements.slice(1)){
    const two=measurements[0],scale=dense.card.width/two.card.width;
    for(const [base,small] of [[two.card.height,dense.card.height],[two.icon.width,dense.icon.width],[two.font,dense.font],[two.padding,dense.padding]])
     assert(Math.abs(small/base-scale)<.015,'Height, icon, font and padding scale with width');
   }
   results.push({width,heights:measurements.map(c=>c.card.height)});
   if(width===390)await page.screenshot({path:'/tmp/prospection-three-columns.png',fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.module-grid [data-go]').first().click();
  await page.locator('#contextPanel').waitFor();
  await page.locator('#closeContext').click();
  await page.locator('#contextPanel').waitFor({state:'detached'});
  assert.equal(await page.locator('.module-grid').count(),1,'Cockpit stays mounted after opening and closing a function');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,results}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

