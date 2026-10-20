'use strict';
// Read-only check of the LIVE site (Railway), run by GitHub after each release and every few hours.
// Never writes anything: health, the public demo, and — only if LIVE_EMAIL/LIVE_PASSWORD secrets exist — a login
// with a dedicated test account that only opens screens. Fails (red) when the site is down or a page breaks.
const fs=require('node:fs');
const {chromium}=require('playwright');
const BASE=process.env.LIVE_URL||'https://agence-ia-studio-production.up.railway.app';
const out='/tmp/live';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const problems=[],done=[];
 const health=await fetch(BASE+'/health').then(r=>r.status).catch(e=>'error '+e.message);
 if(health!==200)problems.push('health '+health);
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const shot=async n=>{await page.waitForTimeout(500);await page.screenshot({path:`${out}/${n}.png`});done.push(n);};
 try{
  const r=await page.goto(BASE+'/demo',{waitUntil:'networkidle',timeout:45000});
  if(!r||r.status()!==200)problems.push('demo '+(r&&r.status()));
  await page.locator('#content .module-grid,.reference-home').first().waitFor({timeout:20000});
  await shot('live-01-demo-accueil');
  const tile=page.locator('#content .module-grid .module-tile[data-go]').first();
  if(await tile.count()){await tile.click();await page.waitForTimeout(1200);await shot('live-02-demo-fonction');}
 }catch(e){problems.push('demo: '+e.message.split('\n')[0]);}
 if(process.env.LIVE_EMAIL&&process.env.LIVE_PASSWORD){
  try{
   const p2=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
   p2.on('pageerror',e=>errors.push(e.message));
   await p2.goto(BASE+'/',{waitUntil:'networkidle'});
   await p2.locator('#loginEmail').fill(process.env.LIVE_EMAIL);await p2.locator('#loginPassword').fill(process.env.LIVE_PASSWORD);
   await p2.getByRole('button',{name:'Se connecter'}).click();
   await p2.locator('#content .module-grid').first().waitFor({state:'attached',timeout:20000});
   await p2.waitForTimeout(800);await p2.screenshot({path:`${out}/live-10-accueil.png`});done.push('live-10-accueil');
   const keys=await p2.evaluate(()=>[...document.querySelectorAll('#content .module-grid:not(.module-reserve-grid-inline) .module-tile[data-go]')].map(t=>t.dataset.go));
   let n=11;
   for(const k of keys){
    try{
     await p2.evaluate(()=>{if(document.querySelector('#modalLayer:not(.hide)'))closeModal();if(document.querySelector('#contextPanel'))closeContext();});await p2.waitForTimeout(400);
     if(await p2.locator('#moduleFocus').count())await p2.evaluate(()=>moduleFocusClose());
     await p2.locator(`#content .module-grid [data-go="${k}"]`).click();
     await p2.waitForFunction(()=>document.querySelector('#contextPanel .context-scroll')||document.querySelector('#modalLayer:not(.hide) .modal'),null,{timeout:10000});
     await p2.waitForTimeout(900);await p2.screenshot({path:`${out}/live-${n}-${k}.png`});done.push(`live-${n++}-${k}`);
    }catch(e){problems.push(`window ${k}: `+e.message.split('\n')[0]);}
   }
  }catch(e){problems.push('login: '+e.message.split('\n')[0]);}
 }
 await browser.close();
 if(errors.length)problems.push('script errors: '+[...new Set(errors)].slice(0,5).join(' | '));
 fs.writeFileSync(`${out}/README.md`,`Contrôle du site en ligne ${new Date().toISOString()}\n\nSanté : ${health}\n\nProblèmes :\n${problems.map(p=>'- '+p).join('\n')||'- aucun'}\n\nCaptures :\n${done.map(d=>'- '+d+'.png').join('\n')}\n`);
 console.log(JSON.stringify({health,problems,captures:done.length}));
 if(problems.length){console.error('LIVE PROBLEMS: '+problems.join(' | '));process.exit(1);}
})();
