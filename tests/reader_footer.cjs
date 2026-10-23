'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu'],...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:{})});
 try{
 for(const [width,height] of [[375,667],[390,844],[430,932]]){
  const p=await b.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/module-peek/calendar',r=>r.fulfill({json:{items:[]}}));
  await p.addInitScript(()=>localStorage.setItem('aia-reader-samples','on'));
  await p.goto('http://127.0.0.1:8123/demo');await p.locator('.reader-list').waitFor();await p.waitForTimeout(600);
  await p.evaluate(()=>{
   window.readerSamples=window.readerSamples.slice(0,3).map((c,i)=>({...c,key:'footer-test-'+i,title:'Message test '+i,files:undefined,facts:[],actions:[{l:'Terminé',t:'p',d:'Traité'}]}));
   window.renderPriorities=async()=>homeReader.render(document.querySelector('#priorityBlock'),[],[],company.id);
   homeReader.close();renderPriorities();homePages.fit();homePages.stack();
  });await p.waitForTimeout(650);
  const title=()=>p.locator('.reader-card strong').textContent();
  const swipe=async(selector,dy)=>{await p.locator(selector).evaluate((el,dy)=>{const r=el.getBoundingClientRect(),x=r.left+25,y=r.top+3;for(const [type,offset] of [['touchstart',0],['touchmove',dy],['touchend',dy]]){const t=new Touch({identifier:1,target:el,clientX:x,clientY:y+offset});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],changedTouches:[t]}));}},dy);await p.waitForTimeout(100)};
  assert(await p.locator('.home-back-zone').isVisible(),'Home empty space is active');
  await p.locator('.home-back-zone').click();assert.match(await title(),/Message test 0/,'Tap starts reading');
  await swipe('.home-back-zone',-45);assert.match(await title(),/Message test 1/,'Blank space swipes forward');
  await swipe('.home-back-zone',45);assert.match(await title(),/Message test 0/,'Blank space swipes backward');
  // Complete every sample through its normal finishing button; treated history stays in the queue.
  for(let i=0;i<3;i++){await p.locator('.home-action-row .reader-btn.is-main').click();await p.waitForTimeout(800)}
  assert.equal(await p.locator('.reader-item.is-done').count(),3);
  const footer=p.locator('.reader-end [data-filler="idea"]');assert(await footer.isVisible(),'Idea remains at end of list');
  const endTitle=await title();await swipe('.reader-end',45);assert.notEqual(await title(),endTitle,'Swipe over terminal card returns to treated history');
  await swipe('.reader-list',-45);assert.equal(await title(),endTitle);
  await p.locator('.home-back-zone').click();assert.equal(await title(),endTitle,'Tapping at the end never reads the idea');assert(await footer.isVisible());
  // A new arrival replaces the queue layout; no detached reminder can overlay its cards.
  await p.evaluate(()=>{window.readerSamples.push(...[1,2].map(i=>({...window.readerSamples[0],key:'arrival-'+i,title:'Nouveau message '+i})));renderPriorities();homePages.stack()});await p.waitForTimeout(400);
  assert.equal(await p.locator('.home-filler').count(),0,'No reminder overlay over new messages');
  await p.locator('.home-back-zone').click();assert.match(await title(),/Nouveau message 1/);
  await swipe('.home-back-zone',-45);assert.match(await title(),/Nouveau message 2/);
  await swipe('.reader-end',45);assert.match(await title(),/Nouveau message 1/);
  await swipe('.reader-list',-45);await p.waitForTimeout(700);
  await footer.click();await p.locator('#contextPanel[data-module="assistant"]').waitFor();
  assert(await p.locator('#assistantMessage').isVisible(),'Terminal idea opens an interactive assistant composer');
  fs.mkdirSync('/tmp/reader-footer',{recursive:true});await p.screenshot({path:`/tmp/reader-footer/${width}.png`});
  assert.deepEqual(errors,[]);console.log('Reader footer OK',width);await p.close();
 }
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
