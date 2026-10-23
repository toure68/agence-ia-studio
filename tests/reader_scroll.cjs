'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu'],...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 try{
 for(const [width,height] of [[375,667],[390,844],[430,932]]){
  const p=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('aia-reader-samples','on'));
  await p.goto('http://127.0.0.1:8123/demo');await p.locator('.reader-list .reader-item').first().waitFor();await p.waitForTimeout(600);
  const open=async text=>{
   await p.evaluate(text=>{window.readerSamples[0].body=text;homeReader.setSamples(true)},text);
   await p.waitForTimeout(250);await p.locator('.reader-list .reader-item').first().click();await p.waitForTimeout(250);
  };
  const rect=()=>p.locator('.home-reader').evaluate(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
  const state=()=>p.locator('.reader-body-wrap').evaluate(e=>({overflow:e.classList.contains('is-long'),active:e.classList.contains('is-scrolling'),opacity:getComputedStyle(e.querySelector('.reader-rail')).opacity,bodyWidth:e.querySelector('.reader-body').getBoundingClientRect().width}));
  await open('Message court.');const shortRect=await rect();assert.equal((await state()).overflow,false,'Short text has no rail');
  await p.locator('.reader-body').dispatchEvent('touchstart');assert.equal((await state()).active,false,'Touching short text shows no indicator');
  await open(Array.from({length:70},(_,i)=>'Ligne '+i+' : lire ce texte avec un seul doigt.').join('\n'));
  assert.deepEqual(await rect(),shortRect,'Reader dimensions and position unchanged for long text');
  const resting=await state();assert(resting.overflow);assert.equal(resting.active,false);assert.equal(resting.opacity,'0','Indicator hidden at rest');
  // Send a real single-finger gesture to the browser, rather than faking a scroll event.
  const cdp=await p.context().newCDPSession(p),body=p.locator('.reader-body'),r=await body.boundingBox(),x=r.x+r.width/2,y=r.y+r.height-25;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*12}]});await p.waitForTimeout(20)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await p.waitForTimeout(150);assert(await body.evaluate(e=>e.scrollTop>0),'One finger scrolls the text');
  const active=await state();assert(active.active);assert(Number(active.opacity)>.5);assert.equal(active.bodyWidth,resting.bodyWidth,'Indicator occupies no text width');
  await body.evaluate(e=>e.scrollTop=e.scrollHeight);await p.waitForTimeout(150);
  assert(await body.evaluate(e=>e.scrollTop+e.clientHeight>=e.scrollHeight-2),'Entire long text reachable');
  assert.deepEqual(await rect(),shortRect,'Scrolling never resizes or moves reader');
  fs.mkdirSync('/tmp/reader-scroll',{recursive:true});await p.screenshot({path:`/tmp/reader-scroll/${width}-scrolling.png`});
  await p.waitForTimeout(1300);assert.equal((await state()).opacity,'0','Indicator disappears after reading stops');
  await p.screenshot({path:`/tmp/reader-scroll/${width}-rest.png`});
  await p.evaluate(()=>homeReader.step(1));await p.waitForTimeout(200);assert.deepEqual(errors,[]);console.log('Reader scroll OK',width);await p.close();
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
