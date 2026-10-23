'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{}),headless:true,args:['--no-sandbox','--disable-gpu']});
 try{for(const [width,height] of [[375,667],[390,844],[430,932]]){
  const p=await b.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('aia-reader-samples','on');window.fakeViewport={height:innerHeight,offsetTop:0,width:innerWidth,offsetLeft:0};for(const key of ['height','offsetTop','width','offsetLeft'])Object.defineProperty(visualViewport,key,{get:()=>window.fakeViewport[key]});window.assistantScrolls=0;const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(...args){if(this.id==='assistantMessage')window.assistantScrolls++;return original.apply(this,args)};});
  await p.goto('http://127.0.0.1:8123/demo');await p.locator('.reader-item').first().waitFor();await p.evaluate(()=>{fakeViewport.height=innerHeight;fakeViewport.width=innerWidth;visualViewport.dispatchEvent(new Event('resize'))});await p.waitForTimeout(700);await p.locator('.reader-item').first().click();await p.waitForTimeout(400);
  const background=()=>p.evaluate(()=>['.reference-home','.home-reader','.reader-list','.home-pages','.home-topbar'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,...[r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10)]}));
  const before=await background();await p.locator('#assistantDock').click();await p.locator('.assistant-collapse').waitFor();await p.waitForTimeout(350);
  assert.equal(await p.evaluate(()=>document.activeElement.id),'assistantMessage','First tap focuses composer');assert.deepEqual(await background(),before,'Opening overlay never reflows cockpit');
  await p.locator('#assistantMessage').fill('Brouillon à conserver');
  const keyboard=async(h,top=0)=>{await p.evaluate(({h,top})=>{Object.assign(window.fakeViewport,{height:h,offsetTop:top});visualViewport.dispatchEvent(new Event('resize'));moduleDockKeyboard();assistantKb();},{h,top});await p.waitForTimeout(150)};
  await p.locator('#contextLayer').evaluate(el=>{el.style.backdropFilter='blur(6px)';el.style.webkitBackdropFilter='blur(6px)'});assert.equal(await p.locator('#contextLayer').evaluate(el=>getComputedStyle(el).backdropFilter),'none','No filtered ancestor can offset the composer twice');
  await keyboard(height-280);const panel=await p.locator('#contextPanel').boundingBox();assert(Math.abs(panel.y+panel.height-(height-280-6))<2,'Composer sits immediately above keyboard');
  assert.equal(await p.evaluate(()=>window.assistantScrolls),0,'Assistant never invokes centering scroll');assert.deepEqual(await background(),before,'Keyboard leaves underlying content fixed');
  await keyboard(height-330,35);const moved=await p.locator('#contextPanel').boundingBox();assert(Math.abs(moved.y+moved.height-(height-330+35-6))<2,'Overlay follows viewport pan and keyboard height');
  assert(await p.locator('#assistantMic').isVisible());assert(await p.locator('#chatAttachMenu summary').isVisible());
  fs.mkdirSync('/tmp/assistant-overlay',{recursive:true});await p.screenshot({path:`/tmp/assistant-overlay/${width}.png`});
  await p.locator('.assistant-collapse').click();await p.locator('#contextPanel').waitFor({state:'detached'});await keyboard(height);await p.waitForTimeout(350);assert.deepEqual(await background(),before,'Closing restores exact home geometry');
  await p.locator('#assistantDock').click();await p.locator('.assistant-collapse').waitFor();assert.equal(await p.locator('#assistantMessage').inputValue(),'Brouillon à conserver','Draft survives closing');
  await p.locator('.assistant-collapse').evaluate(el=>{const r=el.getBoundingClientRect(),x=r.left+20,y=r.top+5;for(const [type,dy] of [['touchstart',0],['touchmove',75],['touchend',75]]){const t=new Touch({identifier:1,target:el,clientX:x,clientY:y+dy});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],changedTouches:[t]}));}});await p.locator('#contextPanel').waitFor({state:'detached'});
  assert(await p.locator('#assistantDock').isVisible(),'Downward handle swipe closes overlay');
  await keyboard(height);await p.locator('#assistantDock').click();await p.locator('.assistant-collapse').waitFor();await keyboard(height-280);
  if(width===390)await p.locator('#chatFiles').setInputFiles({name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('Pièce jointe de test')});
  await p.locator('#assistantMessage').focus();await keyboard(height);await p.locator('#contextPanel').waitFor({state:'detached'});assert.notEqual(await p.evaluate(()=>document.activeElement.id),'assistantMessage','Dismissing keyboard also blurs composer');await p.waitForTimeout(350);assert.deepEqual(await background(),before,'Keyboard dismissal restores home');
  await p.locator('#assistantDock').click();await p.locator('.assistant-collapse').waitFor();assert.equal(await p.locator('#assistantMessage').inputValue(),'Brouillon à conserver');if(width===390)assert.equal(await p.locator('.chat-file').count(),1,'Files survive joint close');await p.locator('.assistant-collapse').click();await p.locator('#contextPanel').waitFor({state:'detached'});
  assert.deepEqual(errors,[]);console.log('Assistant overlay OK',width);await p.close();
 }}finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
