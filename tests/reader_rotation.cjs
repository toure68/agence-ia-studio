'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright'),openSessionPage=require('./ui_session.cjs');
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:{})});try{
 for(const [width,height] of [[375,667],[390,844],[430,932]]){
  const p=await openSessionPage(b,{viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});p.setDefaultTimeout(12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.evaluate(()=>{localStorage.setItem('aia-pages-grid',JSON.stringify({cols:4,rows:2}));homePages.fit();homeReader.setSamples(true)});await p.locator('.reader-item').first().waitFor();await p.waitForTimeout(500);
  await p.evaluate(()=>{readerSamples[0].body='Un long message dont la lecture doit rester accessible. '.repeat(120);homeReader.setSamples(true)});await p.locator('.reader-item').first().click();await p.waitForTimeout(300);
  const check=async label=>{const s=await p.evaluate(()=>{const rect=e=>e?.getBoundingClientRect().toJSON(),box=document.querySelector('.home-pages'),pg=box.querySelector('.home-page'),row=document.querySelector('.home-action-row'),body=document.querySelector('.reader-body');return {row:rect(row),slot:rect(pg.firstElementChild),reader:rect(document.querySelector('.home-reader')),body:rect(body),pages:rect(box),assistant:rect(document.querySelector('.home-topbar')),buttons:[...row.children].map(e=>({rect:rect(e),scroll:e.scrollWidth,client:e.clientWidth})),viewport:innerHeight,read:homeReader.queueSnapshot().read};});
   fs.mkdirSync('/tmp/reader-rotation',{recursive:true});await p.screenshot({path:`/tmp/reader-rotation/${width}-${label}.png`});
   assert(Math.abs(s.row.top-s.slot.top)<1.5,label+' action row follows its reserved slot '+JSON.stringify(s));assert(s.reader.bottom<=s.row.top-4,label+' actions never cover reader text '+JSON.stringify(s));assert(s.row.bottom<=s.viewport,label+' actions visible in viewport '+JSON.stringify(s));assert(s.buttons.every(b=>b.rect.left>=s.row.left-1&&b.rect.right<=s.row.right+1&&b.scroll<=b.client+1),label+' buttons stay inside row');assert.equal(s.read,1,'Orientation preserves selected message');return s;};
  const start=await check('start');
  for(const expanded of [false,true]){
   if(expanded)await p.locator('.reader-grip').tap();
   for(let turn=0;turn<2;turn++){
    await p.setViewportSize({width:height,height:width});await p.waitForTimeout(500);await check(`landscape-${expanded}-${turn}`);
    await p.setViewportSize({width,height});await p.waitForTimeout(500);const back=await check(`portrait-${expanded}-${turn}`);assert(Math.abs(back.row.top-start.row.top)<1.5,'Portrait restores original action position');
   }
   if(expanded){await p.locator('.reader-grip').tap();assert.equal(await p.locator('.reader-grip').getAttribute('aria-expanded'),'false');}
  }
  await p.locator('.home-action-row button').nth(1).tap();await p.locator('.universal-sheet form').waitFor();const input=p.locator('.universal-sheet textarea').first();await input.fill('Brouillon conservé pendant la rotation');await p.setViewportSize({width:height,height:width});await p.waitForTimeout(300);await p.setViewportSize({width,height});await p.waitForTimeout(300);assert.equal(await input.inputValue(),'Brouillon conservé pendant la rotation');await p.locator('.us-close-bottom').filter({visible:true}).last().tap();await check('after-editor');
  if(width===390)for(const cols of [2,3]){await p.evaluate(cols=>{localStorage.setItem('aia-pages-grid',JSON.stringify({cols,rows:3}));homePages.fit();},cols);await p.waitForTimeout(400);const before=await check('columns-'+cols);await p.setViewportSize({width:height,height:width});await p.waitForTimeout(500);await check('columns-'+cols+'-landscape');await p.setViewportSize({width,height});await p.waitForTimeout(500);const restored=await check('columns-'+cols+'-portrait');assert(Math.abs(restored.row.top-before.row.top)<1.5);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('aia-pages-grid')).rows),3,'Landscape leaves saved portrait preferences unchanged');}
  await p.evaluate(()=>{localStorage.setItem('aia-pages-grid',JSON.stringify({cols:4,rows:2}));homePages.fit();homeReader.close();homeReader.setSamples(false)});await p.waitForTimeout(400);assert.deepEqual(errors,[]);console.log('Reader rotation OK',width);await p.close();
 }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
