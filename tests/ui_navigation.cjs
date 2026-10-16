'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const base='http://127.0.0.1:8123';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 async function home(){
   await page.locator('#moduleBack [data-tab="dashboard"]').click();
   await page.locator('.module-grid').waitFor();
 }
 async function gridCheck(){
   assert.equal(await page.locator('.module-tile').count(),4);
   const geometry=await page.locator('.module-grid').evaluate(el=>{
     const c=[...el.children].map(x=>x.getBoundingClientRect());
     return {columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,
       sameRow:Math.abs(c[0].top-c[1].top)<2,nextRow:c[2].top>c[0].top,
       overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.equal(geometry.columns,2);
   assert(geometry.sameRow&&geometry.nextRow);
   assert.equal(geometry.overflow,false);
 }
 try{
   await page.goto(base,{waitUntil:'networkidle'});
   await page.locator('#loginEmail').fill('ui-owner@example.test');
   await page.locator('#loginPassword').fill('local-ui-smoke-test-only');
   await page.getByRole('button',{name:'Se connecter'}).click();
   await page.locator('.module-grid').waitFor();
   await gridCheck();
   for(const [module,title] of [['leads','Demandes de devis'],['prospects','Prospection assistée'],['companies','Vos entreprises'],['calendar','Calendrier & échéances']]){
     await page.locator('.module-tile[data-go="'+module+'"]').click();
     await page.locator('#content h1').filter({hasText:title}).waitFor();
     assert(page.url().includes('#/'+module));
     assert.equal(await page.locator('#modalLayer:not(.hide)').count(),0);
     if(module==='calendar'){
       await page.reload({waitUntil:'networkidle'});
       await page.locator('#taskForm').waitFor();
       assert.equal(await page.locator('.module-grid').count(),0);
     }
     await home();
   }
   await page.locator('.module-tile[data-go="calendar"]').click();
   await page.locator('#taskTitle').fill('Vérifier la paie du mois');
   await page.locator('#taskDescription').fill('Contrôler les éléments avant validation');
   await page.locator('#taskRepeat').selectOption('monthly');
   await page.getByRole('button',{name:'Enregistrer l’échéance'}).click();
   await page.locator('[data-complete-task]').waitFor();
   await home();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===1);
   await page.locator('[data-priority-open]').click();
   await page.locator('#content h1').filter({hasText:'Vérifier la paie du mois'}).waitFor();
   assert.equal(await page.locator('#modalLayer:not(.hide)').count(),0);
   await page.locator('[data-complete-task]').click();
   await page.locator('#taskForm').waitFor();
   await home();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===0);
   await page.evaluate(async()=>{
     const due=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     for(let i=0;i<6;i++)await api('/api/companies/1/tasks',{method:'POST',body:JSON.stringify({
       title:'Échéance de contrôle '+(i+1),description:'Vérifier le dossier et valider le suivi.',first_due:due})});
     await renderPriorities();
   });
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===6);
   await page.locator('#priorityNext').click();
   await page.waitForFunction(()=>document.querySelector('.priority-rail').scrollLeft>0);
   fs.mkdirSync('/tmp/ui-images',{recursive:true});
   await page.screenshot({path:'/tmp/ui-images/home-iphone.png',fullPage:true});
   await page.locator('[data-priority-dismiss]').nth(1).click();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===5);
   await page.reload({waitUntil:'networkidle'});
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===5);
   await page.setViewportSize({width:1440,height:1000});
   await gridCheck();
   await page.screenshot({path:'/tmp/ui-images/home-desktop.png',fullPage:true});
   assert.deepEqual(errors,[]);
   console.log('PASS: direct module navigation, calendar deep links, two-column iPhone/desktop layout, no horizontal overflow, priority actions, completion and persistent dismissal.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
