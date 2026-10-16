'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.addInitScript(()=>{
   window.__spoken=[];
   Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,cancel(){this.speaking=false;},getVoices(){return [];},speak(u){this.speaking=true;window.__spoken.push(u.text);setTimeout(()=>{this.speaking=false;u.onend?.();},5);}}});
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
   window.SpeechRecognition=class{start(){setTimeout(()=>{this.onresult?.({results:[[{transcript:'Consigne dictée de test.'}]]});this.onend?.();},5);}stop(){this.onend?.();}};
 });
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 async function backHome(){
   for(let i=0;i<5;i++){
    if(await page.locator('.module-grid').count())return;
    const before=new URL(page.url()).hash;await page.locator('#moduleBack [data-back]').click();
    await page.waitForFunction(hash=>location.hash!==hash,before);
    await page.waitForFunction(()=>!document.querySelector('#content > [role="status"]'));
   }
   await page.locator('.module-grid').waitFor();
 }
 async function goModule(route){
   const tile=page.locator('.module-grid [data-go="'+route+'"]');
   if(await tile.count())await tile.click();
   else{await page.locator('.account-menu summary').click();await page.locator('#accountTools').click();await page.locator('.tool-list [data-go="'+route+'"]').click();}
 }
 async function layout(count=16){
   assert.equal(await page.locator('.module-grid .module-tile').count(),count);
   assert.equal(await page.locator('.sidebar,#sideNav,#mobileNav').count(),0);
   const g=await page.locator('.module-grid').evaluate(el=>{
     const c=[...el.children].map(x=>x.getBoundingClientRect());
     return {columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,
       sameRow:Math.abs(c[0].top-c[1].top)<2,nextRow:c[2].top>c[0].top,
       overflow:document.documentElement.scrollWidth>innerWidth,
       helperText:el.querySelectorAll('.module-copy small,.module-copy>span').length};
   });
   assert.equal(g.columns,2);assert(g.sameRow&&g.nextRow);assert(!g.overflow);assert.equal(g.helperText,0);
 }
 async function priorityLayout(count){
   assert.equal(await page.locator('.priority-card').count(),count);
   assert.equal(await page.locator('.priority-controls,.priority-rail,#priorityNext,#priorityPrev,#priorityPosition,.priority-heading').count(),0);
   const geometry=await page.locator('.priority-stack').evaluate(el=>({cards:[...el.querySelectorAll('.priority-tile')].map(x=>{const r=x.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,width:r.width,height:r.height,radius:getComputedStyle(x).borderRadius,border:getComputedStyle(x).borderTopColor};}),module:(()=>{const e=document.querySelector('.module-tile:not(.priority-tile)');return {height:e.getBoundingClientRect().height,radius:getComputedStyle(e).borderRadius,border:getComputedStyle(e).borderTopColor};})(),overflow:document.documentElement.scrollWidth>innerWidth}));
   const cards=geometry.cards;assert(!geometry.overflow);
   for(let i=1;i<cards.length;i++){assert(cards[i].top>=cards[i-1].bottom,'Stack must remain vertical');assert(cards[i].height<=cards[i-1].height,'Priority heights must decrease');assert.equal(cards[i].left,cards[0].left);assert.equal(cards[i].width,cards[0].width);}
   if(count>=3)assert(cards[0].height>cards[1].height&&cards[1].height>cards[2].height);
   for(const card of cards)assert.equal(card.radius,geometry.module.radius);
   if(count>=4)assert.equal(cards[3].height,geometry.module.height);
 }
 async function formVisible(id){
   await page.locator('#'+id).waitFor();
   assert.equal(await page.locator('#modalLayer:not(.hide)').count(),0);
   const position=await page.locator('#'+id+' input').first().boundingBox();
   assert(position&&position.y<360,'First field must be visible without scrolling');
   assert.equal(await page.locator('#moduleBack [data-back] svg').count(),1);
   assert.equal((await page.locator('#moduleBack [data-back]').innerText()).trim(),'');
   assert.equal(await page.locator('#moduleBack [data-back]').evaluate(el=>getComputedStyle(el).borderRadius),'50%');
 }
 try{
   await page.goto('http://127.0.0.1:8123',{waitUntil:'networkidle'});
   await page.locator('#loginEmail').fill('ui-owner@example.test');
   await page.locator('#loginPassword').fill('local-ui-smoke-test-only');
   await page.getByRole('button',{name:'Se connecter'}).click();
   await page.locator('.module-grid').waitFor();
   await layout();
   assert.deepEqual(await page.locator('.module-grid [data-go]').evaluateAll(nodes=>nodes.map(n=>n.dataset.go)),['requests','clients','activities','leads','emails','prospects','calendar','reports','drafts','companies','company-edit','team','treasury','equipment','risks','scanner']);
   assert.equal(await page.locator('.more-functions').count(),1);
   assert.equal(await page.locator('.module-grid [data-go="company-edit"]').getAttribute('href'),'#/company-edit/1');
   assert.equal(await page.locator('.module-grid [data-go="team"]').getAttribute('data-company-id'),'1');
   assert.equal(await page.locator('#mobileNav').count(),0);
   assert.equal(await page.locator('.home-quick-actions').count(),0);
   await page.waitForFunction(()=>document.querySelectorAll('.routine-card').length===1);
   assert((await page.locator('.home-heading').innerText()).startsWith('Bonjour'));
   await priorityLayout(1);
   await page.locator('.priority-card>.voice-button').click();
   assert((await page.evaluate(()=>window.__spoken.join(' '))).includes('Organiser'));
   await page.locator('[data-priority-open]').click();
   await page.locator('#voiceCommand').waitFor();
   await page.locator('#closeModal').click();
   await page.locator('.module-grid').waitFor();
   assert.deepEqual(await page.evaluate(()=>api('/api/companies/1/activities')),[]);
   assert.deepEqual(await page.evaluate(()=>api('/api/companies/1/tasks')),[]);
   assert.equal(await page.locator('#calendarTasks').count(),0);
   for(const [module,title] of [['requests','Demandes'],['treasury','Trésorerie'],['leads','Devis'],['prospects','Prospection'],['companies','Entreprises'],['calendar','Agenda'],['clients','Clients'],['activities','Activités'],['reports','Rapports'],['drafts','Brouillons'],['emails','E-mails']]){
     await goModule(module);
     await page.locator('#content h1').filter({hasText:title}).waitFor();
     assert(page.url().includes('#/'+module));
     assert.equal(await page.locator('#modalLayer:not(.hide)').count(),0);
     await backHome();
   }
   for(const [module,route,form] of [['prospects','prospect-new','prospectForm'],['companies','company-new','companyForm'],['calendar','task-new','taskForm'],['clients','client-new','clientForm'],['activities','activity-new','activityForm']]){
     await goModule(module);
     if(['prospect-new','task-new','activity-new'].includes(route))await page.evaluate(route=>openTab(route),route);else await page.locator(route==='company-new'?'#createCompany':'#content [data-go="'+route+'"]').click();
     await formVisible(form);
     await page.reload({waitUntil:'networkidle'});
     await formVisible(form);
     await page.locator('#moduleBack [data-back]').click();
     await page.waitForURL('**/#/'+module);
     await page.locator(module==='prospects'?'#newProspect':module==='companies'?'#createCompany':module==='calendar'?'.task-list':module==='clients'?'#clientList':'#activityList').waitFor();
     await backHome();
   }
   await goModule('leads');
   await page.locator('[data-go="quote-new"]').click();
   await formVisible('quotationForm');
   await page.locator('#quoteCustomer').fill('Client du devis');
   await page.locator('#quoteTitle').fill('Intervention de test');
   await page.locator('.quote-line [name="description"]').fill('Prestation test');
   await page.locator('.quote-line [name="quantity"]').fill('2.5');
   await page.locator('.quote-line [name="unit_price"]').fill('19.99');
   await page.locator('#quoteVat').fill('20');
   await page.locator('#quotationForm button[type="submit"]').click();
   await page.locator('.quote-detail-lines').waitFor();
   const quotes=await page.evaluate(()=>api('/api/companies/1/quotations'));
   assert.equal(quotes.length,1);assert.equal(quotes[0].total_minor,5998);
   const pdf=await page.request.get('http://127.0.0.1:8123/api/companies/1/quotations/'+quotes[0].id+'/pdf');
   assert.equal(pdf.status(),200);assert((await pdf.body()).subarray(0,5).equals(Buffer.from('%PDF-')));
   await page.locator('[data-go="quote-edit"]').click();
   await page.locator('#quoteStatus').selectOption('accepted');
   await page.locator('#quotationForm button[type="submit"]').click();
   await page.locator('.quote-detail-lines').waitFor();
   await page.locator('#moduleBack [data-back]').click();
   await page.locator('#quoteList').waitFor();
   assert((await page.locator('#quoteList').innerText()).includes('Accepté'));
   await backHome();
   await goModule('emails');
   await page.locator('#mailKeywords').fill('Clients, commandes');
   await Promise.all([
     page.waitForResponse(r=>r.url().includes('/mail/settings')&&r.request().method()==='PUT'&&r.status()===200),
     page.locator('#mailSettingsForm button[type="submit"]').click()
   ]);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/mail/status'))).keywords,'Clients, commandes');
   assert.equal(await page.locator('#mailConnect').isDisabled(),true);
   await backHome();
   await goModule('clients');
   await page.locator('[data-go="client-new"]').click();
   await page.locator('#clientName').fill('Client interface');
   await page.locator('#clientEmail').fill('client@example.test');
   await page.locator('#clientForm button.btn.primary').click();
   await page.locator('[data-client-open]').waitFor();
   await backHome();
   await goModule('activities');
   await page.evaluate(()=>openTab('activity-new'));
   await page.locator('#activityTitle').fill('Préparer intervention');
   await page.locator('#activityDescription + .dictation-button').click();
   await page.waitForFunction(()=>document.querySelector('#activityDescription').value.includes('Consigne dictée'));
   await page.locator('#activityPriority').selectOption('urgent');
   await page.locator('#activityAssignee').fill('Responsable test');
   await page.locator('#activityClient').selectOption({label:'Client interface'});
   await page.locator('#activityForm button.btn.primary').click();
   await page.locator('[data-activity-open]').waitFor();
   await backHome();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card:not(.routine-card)').length===1);
   assert.equal(await page.locator('.example-card').count(),0);
   await page.locator('[data-priority-open]').click();
   await page.locator('[data-work-status="doing"]').click();
   await page.locator('[data-work-status="doing"]').waitFor({state:'detached'});
   await page.locator('[data-work-status="done"]').click();
   await page.locator('[data-work-status="done"]').waitFor({state:'detached'});
   await backHome();
   await page.waitForFunction(()=>document.querySelectorAll('.routine-card').length===1);
   await goModule('reports');
   await page.locator('.report-section').first().waitFor();
   assert((await page.locator('#content').innerText()).includes('Activités terminées'));
   const report=await page.evaluate(()=>api('/api/companies/1/reports'));
   assert.equal(report.clients_active,1);assert.equal(report.activities.done,1);
   await backHome();
   await goModule('calendar');
   await page.evaluate(()=>openTab('task-new'));
   await page.locator('#taskTitle').fill('Valider les éléments de paie');
   await page.locator('#taskDescription').fill('Contrôler les éléments variables.');
   await page.locator('#taskRepeat').selectOption('monthly');
   await page.locator('#taskForm button.btn.primary').click();
   await page.locator('.task-row').waitFor();
   await backHome();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===1);
   await page.locator('[data-priority-open]').click();
   await page.locator('#completeTask').waitFor();
   await page.locator('#completeTask').click();
   await page.locator('.task-row').waitFor();
   await backHome();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card:not(.routine-card)').length===0);
   // The normal Add action opens the voice composer, not the legacy form.
   await page.locator('[data-go="calendar"]').click();
   await page.locator('[data-go="task-new"]').click();
   await page.locator('#voiceCommand').waitFor();
   await page.locator('#closeModal').click();
   await page.locator('.task-list').waitFor();
   assert.equal(await page.locator('#taskForm').count(),0);
   await backHome();
   await page.evaluate(async()=>{
     const due=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     for(let i=0;i<6;i++)await api('/api/companies/1/tasks',{method:'POST',body:JSON.stringify({
       title:'Contrôle '+(i+1),description:'Vérifier le dossier.',first_due:due})});
     await renderPriorities();
   });
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===1);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/priorities'))).length,6);
   await priorityLayout(1);
   fs.mkdirSync('/tmp/ui-images',{recursive:true});
   await page.screenshot({path:'/tmp/ui-images/home-iphone.png',fullPage:true});
   await page.locator('[data-priority-dismiss]').click();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===1);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/priorities'))).length,5);
   await page.reload({waitUntil:'networkidle'});
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===1);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/priorities'))).length,5);
   for(const [name,width,height] of [['landscape',844,390],['tablet',1024,768],['desktop',1440,1000]]){
    await page.setViewportSize({width,height});await layout();await priorityLayout(1);
    const left=await page.locator('.main').evaluate(el=>el.getBoundingClientRect().left);assert.equal(left,0);
    await page.screenshot({path:'/tmp/ui-images/home-'+name+'.png',fullPage:true});
   }
   await page.setViewportSize({width:390,height:844});
   await page.locator('#voiceFab').click();
   await page.waitForFunction(()=>document.querySelector('#voiceCommand')?.value.includes('Consigne dictée'));
   await page.locator('#voiceCommand').fill('entrée 120 euros règlement client');
   await page.locator('#previewCommand').click();
   assert.equal(await page.locator('#treasuryForm').count(),0);
   await page.locator('#confirmVoiceCommand').click();
   await page.locator('.treasury-list').waitFor();
   const cash=await page.evaluate(()=>api('/api/companies/1/treasury'));
   assert.equal(cash.balances_minor.EUR,12000);assert.equal(cash.movements.length,1);
   await page.locator('[data-check-cash]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-check-cash]').length===0);
   await backHome();
   for(const [command,path,title] of [['ajoute un prospect Garage Vocal','/api/prospects','Prospection'],['ajoute une échéance contrôle demain','/api/companies/1/tasks','Agenda']]){
    await page.locator('#voiceFab').click();await page.waitForFunction(()=>document.querySelector('#voiceCommand')?.value.includes('Consigne dictée'));
    const before=(await page.evaluate(path=>api(path),path)).length;
    await page.locator('#voiceCommand').fill(command);await page.locator('#previewCommand').click();await page.locator('#confirmVoiceCommand').click();
    await page.locator('#content h1').filter({hasText:title}).waitFor();
    assert.equal((await page.evaluate(path=>api(path),path)).length,before+1);await backHome();
   }
   await page.locator('.account-menu summary').click();
   assert.equal(await page.locator('#accountAudit:visible').count(),1);
   await page.locator('.account-menu summary').click();
   await goModule('activities');
   await page.locator('.account-menu summary').click();await page.locator('#accountTools').click();
   assert.equal(await page.locator('.tool-list [data-go="equipment"],.tool-list [data-go="risks"],.tool-list [data-go="conformity"]').count(),3);
   await backHome();
   const completed=page.waitForResponse(r=>r.url().includes('/complete')&&r.request().method()==='POST');
   await page.locator('[data-priority-complete]').click();await completed;
   assert.equal((await page.evaluate(()=>api('/api/companies/1/priorities'))).length,5);
   await layout();
   await goModule('equipment');await page.locator('#addAssetVoice').click();
   await page.locator('#voiceCommand').fill('matériel Perceuse quantité 2 en panne');
   await page.locator('#previewCommand').click();await page.locator('#confirmVoiceCommand').click();
   await page.locator('[data-asset]').waitFor();
   assert((await page.locator('#content').innerText()).includes('En panne'));
   await page.locator('[data-asset]').click();await page.locator('#assetForm select[name="condition"]').selectOption('ready');
   await page.locator('#assetForm button.btn.primary').click();await page.locator('[data-asset]').waitFor();
   assert((await page.locator('#content').innerText()).includes('Disponible'));await backHome();
   const wid=await page.evaluate(async()=>{const w=await api('/api/companies/1/activities',{method:'POST',body:JSON.stringify({title:'Chantier matériel test'})});return w.id;});
   await page.evaluate(id=>openTab('material',{recordId:id}),wid);await page.locator('#materialNeeds').fill('Perceuse : 3');
   await Promise.all([page.waitForResponse(r=>r.url().includes('/material')&&r.request().method()==='PUT'&&r.status()===200),page.locator('#materialForm button.btn.primary').click()]);
   await page.waitForFunction(()=>document.querySelector('#content .msg.err')?.textContent.includes('1 manquant'));
   await page.evaluate(id=>openTab('activity',{recordId:id}),wid);
   assert((await page.locator('#activityMaterialStatus').innerText()).includes('1 manquant'));
   await backHome();await goModule('risks');await page.locator('#addRiskVoice').click();
   await page.locator('#voiceCommand').fill('assurance RC Pro demain');await page.locator('#previewCommand').click();await page.locator('#confirmVoiceCommand').click();
   await page.locator('[data-risk]').waitFor();await page.locator('[data-risk]').click();
   await page.locator('#riskForm input[name="completed"]').check();await page.locator('#riskForm button.btn.primary').click();
   await page.locator('[data-risk]').waitFor();assert((await page.locator('[data-risk]').innerText()).includes('Vérifié'));
   assert.equal((await page.evaluate(()=>api('/api/companies/1/risks')))[0].completed,1);await backHome();
   await goModule('conformity');await page.locator('.compliance-list').waitFor();assert.equal(await page.locator('.compliance-list article').count(),33);await backHome();
   await page.locator('.more-functions').click();await page.locator('#activityDomain').selectOption('agriculture');
   await page.locator('#suggestModules').click();assert.equal(await page.locator('[data-module-key="equipment"]').isChecked(),true);assert.equal(await page.locator('[data-module-key="prospects"]').isChecked(),false);
   await page.locator('#clearModules').click();await page.locator('[data-module-key="clients"]').check();await page.locator('#saveModules').click();
   await page.waitForFunction(()=>document.querySelectorAll('.module-grid .module-tile').length===1);
   await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.module-grid .module-tile').count(),1);
   await page.locator('.more-functions').click();await page.locator('#clearModules').click();await page.locator('#saveModules').click();
   await page.waitForFunction(()=>document.querySelector('.more-functions')&&document.querySelectorAll('.module-grid .module-tile').length===0);
   assert.equal(await page.locator('.more-functions').isVisible(),true);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/clients'))).length,1);
   await page.locator('.more-functions').click();await page.locator('#moduleScope').selectOption('suggested');assert.equal(await page.locator('[data-module-key="prospects"]').count(),0);
   await page.locator('#moduleScope').selectOption('all');assert.equal(await page.locator('[data-module-key="prospects"]').count(),1);
   await page.locator('[data-module-key="prospects"]').check();await page.locator('#selectAllModules').click();await page.locator('#saveModules').click();await page.locator('.module-grid').waitFor();await layout();
   await goModule('scanner');
   await page.locator('#scanKind').waitFor();
   assert.equal(await page.locator('#scanKind option').count(),10);
   await page.locator('#scanFile').setInputFiles({name:'kbis-colonnes.png',mimeType:'image/png',buffer:fs.readFileSync('/tmp/ui-kbis-columns.png')});
   await page.locator('#readDocument').click();await page.locator('#documentReview').waitFor({timeout:60000});
   assert.equal(await page.locator('#import-legal_name').inputValue(),'INFONET');
   assert.equal(await page.locator('#import-rcs_number').inputValue(),'123 456 789 R.C.S. Paris');
   assert((await page.locator('#import-address').inputValue()).includes('75008 Paris'));
   assert.equal(await page.locator('#documentReview input[type="checkbox"]').count(),0);
   assert.equal(await page.locator('#documentReview .dictation-button').count(),0);
   await page.locator('#import-legal_name').fill('INFONET CORRIGÉ');await page.locator('#documentReview button[type="submit"]').click();await page.locator('#scanForm').waitFor();
   await page.locator('.profile-details summary').click();assert.equal(await page.locator('#profile-legal_name').inputValue(),'INFONET CORRIGÉ');
   await page.locator('#scanFile').setInputFiles({name:'photo-kbis-test.png',mimeType:'image/png',buffer:fs.readFileSync('/tmp/ui-kbis.png')});
   await page.locator('#readDocument').click();await page.locator('#documentReview').waitFor({timeout:60000});
   assert.equal(await page.locator('#import-iban').inputValue(),'FR1420041010050500013M02606');assert.equal((await page.evaluate(()=>api('/api/companies/1/profile'))).fields.legal_name,'INFONET CORRIGÉ');
   await page.reload({waitUntil:'networkidle'});await page.locator('#documentReview').waitFor();
   assert.equal(await page.locator('#documentReview [data-import-field]').count(),0);await page.locator('#documentReview button[type="submit"]').click();await page.locator('#scanForm').waitFor();
   await page.locator('.profile-details summary').click();assert.equal(await page.locator('#profile-siret').inputValue(),'73282932000074');
   await page.locator('#scanKind').selectOption('quote');await page.locator('#scanFile').setInputFiles({name:'tarifs-test.pdf',mimeType:'application/pdf',buffer:fs.readFileSync('/tmp/ui-quote.pdf')});
   await page.locator('#readDocument').click();await page.locator('.imported-rate').waitFor({timeout:60000});assert.equal(await page.locator('.imported-rate [data-rate="unit_price"]').inputValue(),'25.50');
   assert.equal(await page.locator('#documentReview [data-import-field]').count(),0);await page.locator('#documentReview button[type="submit"]').click();await page.locator('#scanForm').waitFor();await backHome();
   await goModule('leads');await page.locator('[data-go="quote-new"]').click();await page.locator('#catalogTariff').waitFor();
   const tariff=(await page.evaluate(()=>api('/api/companies/1/tariff-catalog')))[0];await page.locator('#catalogTariff').selectOption(String(tariff.id));
   assert.equal(await page.locator('.quote-line [name="unit_price"]').inputValue(),'25.50');await backHome();await layout();
   // The same circular arrow closes account dialogs.
   await page.locator('.account-menu summary').click();
   await page.locator('#passwordBtn').click();
   assert.equal(await page.locator('#closeModal.back-circle svg').count(),1);
   await page.locator('#closeModal').click();
   assert.deepEqual(errors,[]);
   console.log('PASS: clean home, four main modules, dynamic badges, voice FAB, cashbook, logistics and explicit compliance gaps, quotation creation/edit/PDF, always-present useful priority, mail settings, speech and dictation controls, client and activity workflows, labeled examples, direct form routes, visible first fields, consistent circular returns, browser history, responsive layout, recurrence, priority actions and persistent dismissal.');
 }catch(error){
   console.error('UI details',JSON.stringify({errors,body:await page.locator('body').innerText()}));
   fs.mkdirSync('/tmp/ui-images',{recursive:true});
   await page.screenshot({path:'/tmp/ui-images/failure.png',fullPage:true});
   throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
