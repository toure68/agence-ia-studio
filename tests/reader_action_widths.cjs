'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.HOME_TEST_CHROME,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{for(const [width,height] of [[375,667],[390,844],[430,932]]){
  const p=await b.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await p.addInitScript(()=>localStorage.setItem('aia-reader-samples','on'));
  await p.goto('http://127.0.0.1:8123/demo');await p.locator('.reader-item').first().waitFor();await p.waitForTimeout(600);await p.locator('.reader-item').first().click();
  const show=labels=>p.evaluate(labels=>homeActions.show(labels.map((label,i)=>({label,kind:i===0?'main':i===1?'danger':'second',run:()=>window.actionWidthClicked=label}))),labels);
  const sizes=()=>p.locator('.home-action-row').evaluate(row=>({row:row.getBoundingClientRect().toJSON(),buttons:[...row.children].map(b=>({w:b.getBoundingClientRect().width,right:b.getBoundingClientRect().right,h:b.clientHeight,scrollH:b.scrollHeight,scrollW:b.scrollWidth,clientW:b.clientWidth}))}));
  for(const count of [2,3,4,5]){await show(['Oui','Non','Voir','Aide','OK'].slice(0,count));const s=await sizes();assert(Math.max(...s.buttons.map(b=>b.w))-Math.min(...s.buttons.map(b=>b.w))<1,'Equal widths for fitting labels');}
  await show(['Confirmer la livraison','Décaler','Non']);let s=await sizes();assert(s.buttons[0].w>s.buttons[1].w,'Long label gets extra room only when needed');assert(s.buttons.every(b=>b.scrollW<=b.clientW+1&&b.scrollH<=b.h+1),'Complete labels stay visible');assert(s.buttons.every(b=>b.right<=s.row.right+1),'Buttons fit the row');
  await p.locator('.home-action-row button').nth(1).click();assert.equal(await p.evaluate(()=>window.actionWidthClicked),'Décaler','Original button action retained');
  await show(['Confirmer la livraison du matériel','Décaler au lendemain','Refuser cette proposition','Question','Plus tard']);s=await sizes();assert(s.buttons.every(b=>b.scrollW<=b.clientW+1&&b.scrollH<=b.h+1),'Long labels wrap within the fixed action row '+JSON.stringify(s));
  fs.mkdirSync('/tmp/reader-actions',{recursive:true});await p.screenshot({path:`/tmp/reader-actions/${width}.png`});console.log('Action widths OK',width);await p.close();
 }}finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
