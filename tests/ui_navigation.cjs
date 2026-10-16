'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 async function backHome(){
   await page.locator('#moduleBack [data-back]').click();
   await page.locator('.module-grid').waitFor();
 }
 async function layout(count=10){
   assert.equal(await page.locator('.module-tile').count(),count);
   const g=await page.locator('.module-grid').evaluate(el=>{
     const c=[...el.children].map(x=>x.getBoundingClientRect());
     return {columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,
       sameRow:Math.abs(c[0].top-c[1].top)<2,nextRow:c[2].top>c[0].top,
       overflow:document.documentElement.scrollWidth>innerWidth,
       helperText:el.querySelectorAll('.module-copy small,.module-copy>span').length};
   });
   assert.equal(g.columns,2);assert(g.sameRow&&g.nextRow);assert(!g.overflow);assert.equal(g.helperText,0);
 }
 async function formVisible(id){
   await page.locator('#'+id).waitFor();
   assert.equal(await page.locator('#modalLayer:not(.hide)').count(),0);
   const position=await page.locator('#'+id+' input').first().boundingBox();
   assert(position&&position.y<360,'First field must be visible without scrolling');
   assert.equal(await page.locator('#moduleBack button svg').count(),1);
   assert.equal((await page.locator('#moduleBack button').innerText()).trim(),'');
   assert.equal(await page.locator('#moduleBack button').evaluate(el=>getComputedStyle(el).borderRadius),'50%');
 }
 try{
   await page.goto('http://127.0.0.1:8123',{waitUntil:'networkidle'});
   await page.locator('#loginEmail').fill('ui-owner@example.test');
   await page.locator('#loginPassword').fill('local-ui-smoke-test-only');
   await page.getByRole('button',{name:'Se connecter'}).click();
   await page.locator('.module-grid').waitFor();
   await layout();
   assert.equal(await page.locator('#mobileNav').count(),0);
   assert.equal(await page.locator('.home-quick-actions').count(),0);
   await page.waitForFunction(()=>document.querySelectorAll('.example-card').length===3);
   assert((await page.locator('#priorityBlock').innerText()).includes('Exemples'));
   await page.locator('[data-priority-open]').first().click();
   await page.locator('#finishPriorityExample').click();
   await page.waitForFunction(()=>document.querySelectorAll('.example-card').length===2);
   assert.deepEqual(await page.evaluate(()=>api('/api/companies/1/activities')),[]);
   assert.deepEqual(await page.evaluate(()=>api('/api/companies/1/tasks')),[]);
   assert.equal(await page.locator('#calendarTasks').count(),0);
   for(const [module,title] of [['leads','Demandes de devis'],['prospects','Prospection'],['companies','Entreprises'],['calendar','Agenda'],['clients','Clients'],['activities','Activités'],['reports','Rapports'],['drafts','Brouillons']]){
     await page.locator('.module-tile[data-go="'+module+'"]').click();
     await page.locator('#content h1').filter({hasText:title}).waitFor();
     assert(page.url().includes('#/'+module));
     assert.equal(await page.locator('#modalLayer:not(.hide)').count(),0);
     await backHome();
   }
   for(const [module,route,form] of [['prospects','prospect-new','prospectForm'],['companies','company-new','companyForm'],['calendar','task-new','taskForm'],['clients','client-new','clientForm'],['activities','activity-new','activityForm']]){
     await page.locator('.module-tile[data-go="'+module+'"]').click();
     await page.locator(route==='prospect-new'?'#newProspect':route==='company-new'?'#createCompany':'#content [data-go="'+route+'"]').click();
     await formVisible(form);
     await page.reload({waitUntil:'networkidle'});
     await formVisible(form);
     await page.locator('#moduleBack [data-back]').click();
     await page.waitForURL('**/#/'+module);
     await page.locator(module==='prospects'?'#newProspect':module==='companies'?'#createCompany':module==='calendar'?'.task-list':module==='clients'?'#clientList':'#activityList').waitFor();
     await backHome();
   }
   await page.locator('.module-tile[data-go="clients"]').click();
   await page.locator('[data-go="client-new"]').click();
   await page.locator('#clientName').fill('Client interface');
   await page.locator('#clientEmail').fill('client@example.test');
   await page.locator('#clientForm button').click();
   await page.locator('[data-client-open]').waitFor();
   await backHome();
   await page.locator('.module-tile[data-go="activities"]').click();
   await page.locator('[data-go="activity-new"]').click();
   await page.locator('#activityTitle').fill('Préparer intervention');
   await page.locator('#activityPriority').selectOption('urgent');
   await page.locator('#activityAssignee').fill('Responsable test');
   await page.locator('#activityClient').selectOption({label:'Client interface'});
   await page.locator('#activityForm button').click();
   await page.locator('[data-activity-open]').waitFor();
   await backHome();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card:not(.example-card)').length===1);
   assert.equal(await page.locator('.example-card').count(),0);
   await page.locator('[data-priority-open]').click();
   await page.locator('[data-work-status="doing"]').click();
   await page.locator('[data-work-status="doing"]').waitFor({state:'detached'});
   await page.locator('[data-work-status="done"]').click();
   await page.locator('[data-work-status="done"]').waitFor({state:'detached'});
   await backHome();
   await page.waitForFunction(()=>document.querySelectorAll('.example-card').length===2);
   await page.locator('.module-tile[data-go="reports"]').click();
   await page.locator('.report-section').first().waitFor();
   assert((await page.locator('#content').innerText()).includes('Activités terminées'));
   const report=await page.evaluate(()=>api('/api/companies/1/reports'));
   assert.equal(report.clients_active,1);assert.equal(report.activities.done,1);
   await backHome();
   await page.locator('.module-tile[data-go="calendar"]').click();
   await page.locator('[data-go="task-new"]').click();
   await page.locator('#taskTitle').fill('Valider les éléments de paie');
   await page.locator('#taskDescription').fill('Contrôler les éléments variables.');
   await page.locator('#taskRepeat').selectOption('monthly');
   await page.locator('#taskForm button').click();
   await page.locator('.task-row').waitFor();
   await backHome();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===1);
   await page.locator('[data-priority-open]').click();
   await page.locator('#completeTask').waitFor();
   await page.locator('#completeTask').click();
   await page.locator('.task-row').waitFor();
   await backHome();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card:not(.example-card)').length===0);
   // The Add action in Agenda opens only the form; back returns to Agenda.
   await page.locator('[data-go="calendar"]').click();
   await page.locator('[data-go="task-new"]').click();
   await formVisible('taskForm');
   await page.locator('#moduleBack [data-back]').click();
   await page.locator('.task-list').waitFor();
   assert.equal(await page.locator('#taskForm').count(),0);
   await backHome();
   await page.evaluate(async()=>{
     const due=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     for(let i=0;i<6;i++)await api('/api/companies/1/tasks',{method:'POST',body:JSON.stringify({
       title:'Contrôle '+(i+1),description:'Vérifier le dossier.',first_due:due})});
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
   await layout();
   await page.screenshot({path:'/tmp/ui-images/home-desktop.png',fullPage:true});
   // The same circular arrow closes account dialogs.
   await page.locator('.account-menu summary').click();
   await page.locator('#passwordBtn').click();
   assert.equal(await page.locator('#closeModal.back-circle svg').count(),1);
   await page.locator('#closeModal').click();
   assert.deepEqual(errors,[]);
   console.log('PASS: clean home, ten useful modules, client and activity workflows, labeled examples, direct form routes, visible first fields, consistent circular returns, browser history, responsive layout, recurrence, priority actions and persistent dismissal.');
 }catch(error){
   console.error('UI details',JSON.stringify({errors,body:await page.locator('body').innerText()}));
   fs.mkdirSync('/tmp/ui-images',{recursive:true});
   await page.screenshot({path:'/tmp/ui-images/failure.png',fullPage:true});
   throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
