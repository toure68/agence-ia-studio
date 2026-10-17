'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.addInitScript(()=>{
   window.__spoken=[];window.__spokenDetails=[];window.__voices=[];
   const speechEvents=new EventTarget();
   Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,cancel(){this.speaking=false;},getVoices(){return window.__voices;},addEventListener:(...args)=>speechEvents.addEventListener(...args),removeEventListener:(...args)=>speechEvents.removeEventListener(...args),dispatchEvent:e=>speechEvents.dispatchEvent(e),speak(u){this.speaking=true;window.__spoken.push(u.text);window.__spokenDetails.push({voice:u.voice?.voiceURI,rate:u.rate,text:u.text});setTimeout(()=>{this.speaking=false;u.onend?.();},5);}}});
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
   window.__recognitionAttempts=0;window.SpeechRecognition=class{constructor(){window.__recognitionAttempts++;throw Error('App dictation must remain disabled');}};
 });
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 async function backHome(){
   for(let i=0;i<5;i++){
    await page.evaluate(async()=>{await navigationQueue;});
    if(await page.locator('#content .module-grid').count())return;
    const before=await page.evaluate(()=>JSON.stringify(readRoute()));await page.locator('#moduleBack [data-back]').click();
    await page.waitForFunction(route=>JSON.stringify(readRoute())!==route||Boolean(document.querySelector('#content .module-grid')),before);
    await page.evaluate(async()=>{await navigationQueue;});
    await page.waitForFunction(()=>!document.querySelector('#content > [role="status"]'));
   }
   await page.locator('#content .module-grid').waitFor();
 }
 async function goModule(route){
   if(await page.locator('#contextPanel').count())await backHome();
   const tile=page.locator('#content .module-grid [data-go="'+route+'"]');
   if(await tile.count())await tile.click();
   else{await page.locator('.account-menu summary').click();await page.locator('#accountTools').click();await page.locator('.tool-list [data-go="'+route+'"]').click();}
 }
 async function openAssistant(){
   if(await page.locator('#assistantMessage').isVisible())return;
   await backHome();await page.locator('#assistantDock').click();await page.locator('#assistantMessage').waitFor({state:'visible'});
 }
 async function layout(count=16){
   assert.equal(await page.locator('#content .module-grid .module-tile').count(),count);
   assert.equal(await page.locator('.sidebar,#sideNav,#mobileNav').count(),0);
   const g=await page.locator('#content .module-grid').evaluate(el=>{
     const c=[...el.children].map(x=>x.getBoundingClientRect());
     return {columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,
       sameRow:Math.abs(c[0].top-c[1].top)<2,nextRow:c[2].top>c[0].top,
       overflow:document.documentElement.scrollWidth>innerWidth,
       helperText:el.querySelectorAll('.module-copy small,.module-copy>span').length};
   });
   assert.equal(g.columns,2);assert(g.sameRow&&g.nextRow);assert(!g.overflow);assert.equal(g.helperText,0);
   assert.equal(await page.locator('.module-state').count(),0);
   assert.equal(await page.locator('#assistantChat').count(),1);
   assert.equal(await page.locator('#assistantParking').evaluate(el=>el.hidden),true);
   assert.equal(await page.locator('#assistantMessage').isVisible(),false);
   const pill=await page.locator('#assistantDock').evaluate(el=>{const r=el.getBoundingClientRect(),heading=document.querySelector('.home-heading').getBoundingClientRect(),priorities=document.querySelector('#priorityBlock').getBoundingClientRect();return {height:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right,headingBottom:heading.bottom,priorityTop:priorities.top,position:getComputedStyle(el).position,width:innerWidth};});
   assert(pill.height<=44&&pill.top>=pill.headingBottom&&pill.bottom<=pill.priorityTop&&pill.left>=0&&pill.right<=pill.width,'Assistant stays compact between greeting and priorities');assert.equal(pill.position,'relative');
   assert.equal(await page.locator('#assistantMessage').getAttribute('placeholder'),'Posez une question ou ajoutez un document…');

   assert.equal(await page.locator('#voiceFab,.dictation-button,#startCommandMic').count(),0);
   assert.equal(await page.evaluate(()=>window.__recognitionAttempts),0);
   const surfaces=await page.locator('#content .module-grid .module-tile').first().evaluate(el=>{
    const probe=el.cloneNode(true);probe.removeAttribute('data-state');probe.style.position='fixed';probe.style.left='-1000px';el.parentElement.append(probe);
    const read=()=>{const c=getComputedStyle(probe);return [c.backgroundImage,c.color,c.borderBottomColor,c.borderLeftColor,c.borderRightColor,getComputedStyle(probe.querySelector('.module-icon')).backgroundColor,getComputedStyle(probe.querySelector('strong')).fontSize];};
    const tones={};for(const tone of ['green','blue','gold','purple']){probe.className='module-tile tone-'+tone;const original=read(),states={};for(const state of ['neutral','info','warning','danger','success']){probe.className='module-tile tone-'+tone+' state-'+state;probe.dataset.state=state;states[state]={surface:read(),top:getComputedStyle(probe).borderTopColor,shadow:getComputedStyle(probe).boxShadow};}tones[tone]={original,states};}
    probe.setAttribute('aria-current','page');const active={color:getComputedStyle(probe).color,background:getComputedStyle(probe).backgroundImage,band:getComputedStyle(probe).borderTopColor};
    const glass=getComputedStyle(el.parentElement),icons=[...document.querySelectorAll('#content .module-grid .module-icon')].map(i=>getComputedStyle(i).backgroundImage);
    probe.remove();return {tones,active,glass:{background:glass.backgroundColor,filter:glass.backdropFilter},iconColors:new Set(icons).size};
   });
   for(const tone of Object.values(surfaces.tones))for(const state of Object.values(tone.states))assert.deepEqual(state.surface,tone.original,'State changes preserve the neutral glass surface');
   assert.equal(new Set(Object.values(surfaces.tones).map(t=>t.original[0])).size,1);assert(surfaces.glass.filter.includes('blur'));assert(surfaces.iconColors>=6,'App badges are colorful and identifiable');
   assert.equal(surfaces.tones.green.states.neutral.top,'rgba(0, 0, 0, 0)');assert(surfaces.tones.green.states.danger.shadow.includes('227, 99, 101'),'Danger remains visible through a fine upper indicator');
   assert.equal(surfaces.active.color,'rgb(38, 50, 71)');assert.equal(surfaces.active.band,'rgb(117, 165, 237)');

 }
 async function priorityLayout(count){
   assert.equal(await page.locator('.priority-card').count(),count);
   assert.equal(await page.locator('.priority-controls,.priority-rail,#priorityNext,#priorityPrev,#priorityPosition,.priority-heading').count(),0);
   const geometry=await page.locator('.priority-stack').evaluate(el=>({cards:[...el.querySelectorAll('.priority-tile')].map(x=>{const r=x.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,width:r.width,height:r.height,radius:getComputedStyle(x).borderRadius,border:getComputedStyle(x).borderTopColor};}),module:(()=>{const e=document.querySelector('.module-tile:not(.priority-tile)');return {height:e.getBoundingClientRect().height,radius:getComputedStyle(e).borderRadius,border:getComputedStyle(e).borderTopColor};})(),overflow:document.documentElement.scrollWidth>innerWidth}));
   const cards=geometry.cards;assert(!geometry.overflow);
   for(let i=1;i<cards.length;i++){assert(cards[i].top>=cards[i-1].bottom,'Stack must remain vertical');assert(cards[i].height<=cards[i-1].height,'Priority heights must decrease');assert.equal(cards[i].left,cards[0].left);assert.equal(cards[i].width,cards[0].width);}
   if(count>=3)assert(cards[0].height>cards[1].height&&cards[1].height>cards[2].height);
   for(const card of cards)assert.equal(card.radius,geometry.module.radius);
   if(count>=5){assert(cards[2].height>cards[3].height&&cards[3].height>cards[4].height);assert.equal(cards[4].height,geometry.module.height);}
 }
 async function formVisible(id){
   await page.locator('#'+id).waitFor();
   assert.equal(await page.locator('#modalLayer:not(.hide)').count(),0);
   const position=await page.locator('#'+id+' input').first().boundingBox();
   assert(position&&position.y>=0&&position.y+position.height<page.viewportSize().height,'First field must be visible inside the sheet without scrolling');
   assert.equal(await page.locator('#moduleBack [data-back] svg').count(),1);
   assert.equal((await page.locator('#moduleBack [data-back]').innerText()).trim(),'');
   assert.equal(await page.locator('#moduleBack [data-back]').evaluate(el=>getComputedStyle(el).borderRadius),'50%');
 }
 try{
   await page.goto('http://127.0.0.1:8123',{waitUntil:'networkidle'});
   assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'/static/manifest.webmanifest');
   assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),'IA Studio');
   const appManifest=await (await page.request.get('http://127.0.0.1:8123/static/manifest.webmanifest')).json();
   assert.equal(appManifest.display,'standalone');assert.deepEqual(appManifest.icons.map(i=>i.sizes),['192x192','512x512']);
   assert.deepEqual(await page.evaluate(async()=>{const icon=new Image();icon.src=document.querySelector('link[rel="apple-touch-icon"]').href;await icon.decode();return [icon.naturalWidth,icon.naturalHeight];}),[180,180]);
   await page.locator('#loginEmail').fill('ui-owner@example.test');
   await page.locator('#loginPassword').fill('local-ui-smoke-test-only');
   await page.getByRole('button',{name:'Se connecter'}).click();
   await page.locator('#content .module-grid').waitFor();
   await layout();
   const initialWidgets=await page.locator('#content .module-grid').evaluate(el=>({cards:el.querySelectorAll('.module-tile').length,icons:el.querySelectorAll('.module-icon svg').length,metrics:el.querySelectorAll('.widget-metric').length,images:el.querySelectorAll('img,image,use').length,cockpitRequests:performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname==='/api/companies/1/cockpit').length}));
   assert.equal(initialWidgets.icons,initialWidgets.cards);assert.equal(initialWidgets.metrics,initialWidgets.cards);assert.equal(initialWidgets.images,0);assert.equal(initialWidgets.cockpitRequests,1,'Initial widgets reuse one cockpit snapshot');
   // Every module opens above the same live cockpit; closing preserves its draft and scroll.
   const assistantAddress=page.url();await openAssistant();assert.equal(page.url(),assistantAddress);
   fs.mkdirSync('/tmp/ui-images',{recursive:true});await page.screenshot({path:'/tmp/ui-images/assistant-panel-mobile.png',animations:'disabled'});
   await page.locator('#assistantMessage').fill('Brouillon à conserver');
   await page.locator('#chatFiles').setInputFiles({name:'brouillon-conserve.txt',mimeType:'text/plain',buffer:Buffer.from('Pièce jointe non envoyée')});
   await page.locator('#closeContext').click();await page.waitForFunction(()=>readRoute().tab==='dashboard');
   assert.equal(await page.locator('#assistantMessage').isVisible(),false);
   await openAssistant();assert.equal(await page.locator('#assistantMessage').inputValue(),'Brouillon à conserver');assert.equal(await page.locator('.chat-file').count(),1);
   await page.locator('.chat-file button').click();await backHome();
   await page.evaluate(()=>{document.querySelector('#assistantChat').dataset.identity='same-cockpit';});
   await page.locator('#content [data-go="clients"]').click();await page.locator('#contextPanel #content h1').waitFor();
   assert.equal(await page.locator('#cockpitContent .module-grid .module-card').count(),16);
   fs.mkdirSync('/tmp/ui-images',{recursive:true});await page.screenshot({path:'/tmp/ui-images/panel-mobile.png',animations:'disabled'});
   await page.setViewportSize({width:1280,height:900});assert.equal(await page.locator('#contextPanel').count(),1);await page.screenshot({path:'/tmp/ui-images/panel-desktop.png',animations:'disabled'});await page.setViewportSize({width:390,height:844});
   assert.equal(await page.locator('#shell').evaluate(el=>el.inert),true);
   assert.notEqual(await page.locator('#contextLayer').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
   await page.mouse.click(2,2);await page.locator('#contextLayer').waitFor({state:'detached'});
   await page.waitForFunction(()=>readRoute().tab==='dashboard');
   assert.equal(await page.locator('#assistantMessage').inputValue(),'Brouillon à conserver');
   assert.equal(await page.locator('#assistantChat').getAttribute('data-identity'),'same-cockpit');
   await goModule('calendar');await page.locator('#content [data-go="task-new"]').click();await page.locator('#commandText').waitFor();
   await page.keyboard.press('Escape');await page.locator('#commandText').waitFor({state:'detached'});
   assert.equal(await page.locator('#contextPanel').count(),1);
   await page.keyboard.press('Escape');await page.locator('#contextPanel').waitFor({state:'detached'});await page.waitForFunction(()=>readRoute().tab==='dashboard');
   await goModule('clients');await page.locator('#contextTitle').filter({hasText:'Clients'}).waitFor();
   const touch=await page.context().newCDPSession(page),handle=await page.locator('#contextPanel .sheet-handle').boundingBox();
   const tx=handle.x+handle.width/2,ty=handle.y+8;
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});
   for(const dy of [25,60,110])await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx,y:ty+dy}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
   await page.locator('#contextPanel').waitFor({state:'detached'});await page.waitForFunction(()=>readRoute().tab==='dashboard');
   let releaseClients;const heldClients=new Promise(resolve=>{releaseClients=resolve;});
   await page.route('**/api/companies/1/clients',async route=>{await heldClients;await route.fulfill({json:[]});});
   await goModule('clients');await page.locator('#contextPanel').waitFor();await page.locator('#closeContext').click();
   releaseClients();await page.evaluate(()=>navigationQueue);await page.waitForFunction(()=>readRoute().tab==='dashboard');
   await page.unroute('**/api/companies/1/clients');
   assert.equal(await page.locator('#assistantChat').getAttribute('data-identity'),'same-cockpit');
   assert.equal(await page.locator('#content .module-grid').count(),1);
   // Back/forward and bottom close change only the floating panel, never the page URL.
   const cockpitAddress=page.url();await goModule('clients');await page.locator('#contextPanel #content h1').waitFor();
   assert.equal(page.url(),cockpitAddress);await page.goBack();await page.locator('#contextPanel').waitFor({state:'detached'});
   assert.equal(await page.locator('#assistantChat').getAttribute('data-identity'),'same-cockpit');
   await page.goForward();await page.locator('#contextPanel #content h1').waitFor();assert.equal(page.url(),cockpitAddress);
   await page.locator('#closeContextBottom').click();await page.locator('#contextPanel').waitFor({state:'detached'});await page.waitForFunction(()=>readRoute().tab==='dashboard');
   assert.equal(page.url(),cockpitAddress);
   await openAssistant();await page.locator('#assistantMessage').fill('');await backHome();
   const pressedTile=page.locator('#content .module-grid .module-tile').first();await pressedTile.scrollIntoViewIfNeeded();
   const pressedBox=await pressedTile.boundingBox();await page.mouse.move(pressedBox.x+20,pressedBox.y+20);await page.mouse.down();
   assert.equal(await pressedTile.evaluate(el=>getComputedStyle(el).color),'rgb(38, 50, 71)');
   assert.equal(await pressedTile.evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(117, 165, 237)');
   await page.mouse.move(1,1);await page.mouse.up();await page.mouse.move(1,1);
   assert.equal(await page.locator('#content .module-grid').count(),1);
   assert.deepEqual(await page.locator('#content .module-grid [data-go]').evaluateAll(nodes=>nodes.map(n=>n.dataset.go).sort()),['requests','clients','activities','leads','emails','prospects','calendar','reports','drafts','companies','company-edit','team','treasury','equipment','risks','scanner'].sort());
   assert.equal(await page.locator('.more-functions').count(),1);
   assert.equal(await page.locator('#content .module-grid [data-go="company-edit"]').getAttribute('href'),'#/company-edit/1');
   assert.equal(await page.locator('#content .module-grid [data-go="team"]').getAttribute('data-company-id'),'1');
   assert.equal(await page.locator('#mobileNav').count(),0);
   assert.equal(await page.locator('.home-quick-actions').count(),0);
   await page.waitForFunction(()=>document.querySelectorAll('.routine-card').length===1);
   assert((await page.locator('.home-heading').innerText()).startsWith('Bonjour'));
   await priorityLayout(1);
   await page.locator('.priority-card>.voice-button').click();
   assert((await page.evaluate(()=>window.__spoken.join(' '))).includes('Organiser'));
   await page.locator('.account-menu summary').click();await page.locator('#accountSpeech').click();
   await page.locator('#speechSettingsForm').waitFor();assert.equal(await page.locator('#speechVoice option').count(),1);
   await page.evaluate(()=>{window.__voices=[{name:'Français compact',voiceURI:'test-fr-compact',lang:'fr-FR',localService:true},{name:'Français qualité améliorée',voiceURI:'test-fr-enhanced',lang:'fr-FR',localService:true},{name:'English',voiceURI:'test-en',lang:'en-US',localService:true}];speechSynthesis.dispatchEvent(new Event('voiceschanged'));});
   assert.equal(await page.locator('#speechVoice option').count(),3);
   await page.locator('#speechTest').click();assert.equal((await page.evaluate(()=>window.__spokenDetails.at(-1))).voice,'test-fr-enhanced');
   await page.locator('#speechVoice').selectOption('test-fr-compact');await page.locator('#speechRate').focus();await page.keyboard.press('Home');for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight');await page.locator('#speechTest').click();
   const speechPreview=await page.evaluate(()=>window.__spokenDetails.at(-1));assert.equal(speechPreview.voice,'test-fr-compact');assert.equal(speechPreview.rate,.9);
   await page.locator('#speechVoice').selectOption('test-fr-enhanced');await page.locator('#speechSettingsForm button[type="submit"]').click();
   await page.reload();await page.locator('#content .module-grid').waitFor();
   await page.waitForFunction(()=>document.querySelector('.priority-card>.voice-button'));
   await page.locator('.priority-card>.voice-button').click();assert.equal((await page.evaluate(()=>window.__spokenDetails.at(-1))).rate,.9);
   await page.evaluate(()=>{window.__voices=[{name:'Français qualité améliorée',voiceURI:'test-fr-enhanced',lang:'fr-FR',localService:true}];});
   await page.locator('.account-menu summary').click();await page.locator('#accountSpeech').click();assert.equal(await page.locator('#speechVoice').inputValue(),'test-fr-enhanced');
   await page.locator('#closeModal').click();
   const longReading=await page.evaluate(async()=>{window.__spoken=[];const text=('Votre message est prêt pour relecture. Merci de vérifier les informations. ').repeat(24);const b=document.createElement('button');document.body.append(b);readAloud(text,b);await new Promise(r=>setTimeout(r,60));b.remove();return {text,spoken:window.__spoken};});
   assert(longReading.spoken.length>1&&longReading.spoken.length<10);assert.equal(longReading.spoken.join(' ').replace(/\s+/g,' ').trim(),longReading.text.trim());

   await openAssistant();
   await page.waitForFunction(()=>document.querySelector('#chatConnection')?.textContent.includes('activer'));
   assert.equal(await page.locator('#assistantSend').isDisabled(),true);
   await page.locator('#chatConnect').click();await page.locator('#assistantConnectionForm').waitFor();
   assert.equal(await page.locator('#assistantApiKey').getAttribute('type'),'password');await page.locator('#closeModal').click();
   let uiChatTurns=[],uiChatRevision=0,uiChatPayload=null,releaseChat;const delayedChat=new Promise(resolve=>{releaseChat=resolve;});
   const chatStatus=()=>({configured:true,can_connect:true,revision:uiChatRevision,busy:false,turns:uiChatTurns});
   await page.route('**/api/companies/1/assistant',route=>route.fulfill({json:chatStatus()}));
   await page.route('**/api/companies/1/assistant/messages',async route=>{uiChatPayload=route.request().postDataJSON();if(uiChatPayload.text==='Réponse en arrière-plan')await delayedChat;if(uiChatPayload.text==='Demande en erreur')return route.fulfill({status:502,json:{detail:'Service IA de test indisponible'}});const turn={id:9001+uiChatTurns.length,text:uiChatPayload.text,files:uiChatPayload.files.map(f=>({name:f.name,kind:'document'})),answer:'Réponse interface de test. <script>texte inoffensif</script>',created:new Date().toISOString()};uiChatTurns.push(turn);uiChatRevision++;await route.fulfill({status:201,json:{turn,revision:uiChatRevision}});});
   await page.route('**/api/companies/1/assistant/reset',route=>{uiChatTurns=[];uiChatRevision++;return route.fulfill({json:chatStatus()});});
   await page.evaluate(()=>mountAssistant());
   await page.locator('#chatFiles').setInputFiles([{name:'notes-assistant.txt',mimeType:'text/plain',buffer:Buffer.from('Mes documents de test')},{name:'photo-assistant.png',mimeType:'image/png',buffer:fs.readFileSync('/tmp/ui-kbis.png')}]);
   assert.equal(await page.locator('.chat-file').count(),2);
   await page.locator('#assistantMessage').fill('Analyse mes documents');await page.locator('#assistantSend').click();
   await page.locator('.chat-answer').waitFor();assert.equal(uiChatPayload.files.length,2);assert(uiChatPayload.files[1].data.length>20);
   assert.equal(uiChatPayload.text,'Analyse mes documents');assert((await page.locator('.chat-answer').innerText()).includes('<script>'));assert.equal(await page.locator('#chatTurns script').count(),0);
   assert.equal(await page.locator('#chatAttachments .chat-file').count(),0);assert.equal(await page.locator('#assistantMessage').inputValue(),'');
   await page.locator('#assistantMessage').fill('Réponse en arrière-plan');await page.locator('#assistantSend').click();
   await page.locator('#closeContext').click();await page.waitForFunction(()=>readRoute().tab==='dashboard');releaseChat();
   await page.waitForFunction(()=>document.querySelector('#chatTurns .chat-user')&&document.querySelectorAll('.chat-user').length===2&&document.querySelector('#assistantMessage').value==='');
   await openAssistant();assert.equal(await page.locator('.chat-user').count(),2);
   await page.reload();await page.locator('.chat-answer').first().waitFor();assert.equal(await page.locator('.chat-user').count(),2);
   await page.evaluate(()=>{window.__chatTracksStopped=0;Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){window.__chatTracksStopped++;}}]})}});window.MediaRecorder=class{static isTypeSupported(){return true;}constructor(stream,options){this.mimeType=options?.mimeType||'audio/webm';this.state='inactive';}start(){this.state='recording';}stop(){if(this.state==='inactive')return;this.state='inactive';this.ondataavailable?.({data:new Blob(['synthetic-test-audio'],{type:this.mimeType})});this.onstop?.();}};});
   await page.evaluate(()=>mountAssistant());await page.locator('#assistantMic').click();await page.waitForFunction(()=>document.querySelector('#assistantMic').getAttribute('aria-pressed')==='true');
   await page.locator('#assistantMic').click();await page.locator('.chat-file').waitFor();assert((await page.locator('.chat-file').innerText()).includes('message-vocal'));
   assert.equal(await page.evaluate(()=>window.__chatTracksStopped),1);await page.locator('.chat-file button').click();
   await page.locator('#assistantMic').click();await page.waitForFunction(()=>document.querySelector('#assistantMic').getAttribute('aria-pressed')==='true');await page.evaluate(()=>cleanupAssistant());
   assert.equal(await page.evaluate(()=>window.__chatTracksStopped),2);assert.equal(await page.locator('.chat-file').count(),0);
   await page.locator('#assistantMessage').fill('Demande en erreur');await page.locator('#assistantSend').click();await page.waitForFunction(()=>document.querySelector('#chatProgress').textContent.includes('indisponible'));
   assert.equal(await page.locator('#assistantMessage').inputValue(),'Demande en erreur');await page.locator('#assistantMessage').fill('');
   page.once('dialog',dialog=>dialog.accept());await page.locator('#chatReset').click();await page.waitForFunction(()=>document.querySelector('#chatTurns').children.length===0);
   await page.unroute('**/api/companies/1/assistant');await page.unroute('**/api/companies/1/assistant/messages');await page.unroute('**/api/companies/1/assistant/reset');
   await page.evaluate(()=>mountAssistant());
   // A persisted zero quota blocks even a connection test before provider dispatch.
   await goModule('ai-usage');await page.locator('#budgetForm').waitFor();
   await page.locator('#budgetCalls').fill('0');
   await Promise.all([page.waitForResponse(r=>r.url().endsWith('/ai-usage')&&r.request().method()==='PUT'),page.locator('#budgetForm button').click()]);
   await page.waitForFunction(()=>document.querySelector('#content [role="status"]')?.textContent.includes('bloqués'));
   await backHome();await openAssistant();await page.locator('#chatConnect').click();await page.locator('#assistantApiKey').fill('sk-fake-budget-ui-key-no-provider-call');
   await page.locator('#assistantConnectionForm button').click();
   await page.waitForFunction(()=>document.querySelector('#assistantConnectionStatus')?.textContent.includes('Quota mensuel'));
   assert.equal((await page.evaluate(()=>api('/api/companies/1/ai-usage'))).calls,0);
   assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('sk-fake-budget')),false);
   await page.locator('#closeModal').click();await goModule('ai-usage');await page.locator('#budgetForm').waitFor();
   await page.locator('#budgetCalls').fill('');await page.locator('#budgetUsd').fill('0.5');
   await Promise.all([page.waitForResponse(r=>r.url().endsWith('/ai-usage')&&r.request().method()==='PUT'),page.locator('#budgetForm button').click()]);
   await page.waitForFunction(()=>document.querySelector('#budgetUsd')?.value==='0.500000');await page.reload();
   await page.locator('#budgetUsd').waitFor();assert.equal(await page.locator('#budgetUsd').inputValue(),'0.500000');
   await page.locator('#budgetUsd').fill('');
   await Promise.all([page.waitForResponse(r=>r.url().endsWith('/ai-usage')&&r.request().method()==='PUT'),page.locator('#budgetForm button').click()]);
   await page.waitForFunction(()=>document.querySelector('#content [role="status"]')?.textContent.includes('Aucun plafond'));
   await backHome();
   await page.locator('[data-priority-open]').click();
   await page.locator('#commandText').waitFor();
   await page.locator('#closeModal').click();
   await page.locator('#content .module-grid').waitFor();
   assert.deepEqual(await page.evaluate(()=>api('/api/companies/1/activities')),[]);
   assert.deepEqual(await page.evaluate(()=>api('/api/companies/1/tasks')),[]);
   assert.equal(await page.locator('#calendarTasks').count(),0);
   for(const [module,title] of [['requests','Demandes'],['treasury','Trésorerie'],['leads','Devis'],['prospects','Prospection'],['companies','Entreprises'],['calendar','Agenda'],['clients','Clients'],['activities','Activités'],['reports','Rapports'],['drafts','Brouillons'],['emails','E-mails']]){
     const cockpitAddress=page.url();await goModule(module);
     await page.locator('#content h1').filter({hasText:title}).waitFor();
     assert.equal(page.url(),cockpitAddress);assert.equal(await page.locator('#cockpitContent .module-grid').count(),1);assert.equal(await page.locator('#closeContextBottom').count(),1);
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
     await page.waitForFunction(expected=>tab===expected,module);
     await page.locator(module==='prospects'?'#newProspect':module==='companies'?'#createCompany':module==='calendar'?'.task-list':module==='clients'?'#clientList':'#activityList').waitFor();
     await backHome();
   }
   await goModule('leads');
   await page.locator('#content [data-go="quote-new"]').click();
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
   await page.locator('#content [data-go="quote-edit"]').click();
   await page.locator('#quoteStatus').selectOption('accepted');
   await page.locator('#quotationForm button[type="submit"]').click();
   await page.locator('.quote-detail-lines').waitFor();
   await page.locator('#moduleBack [data-back]').click();
   await page.locator('#quoteList').waitFor();
   assert((await page.locator('#quoteList').innerText()).includes('Accepté'));
   await page.locator('[data-quote-open]').first().click();
   await page.locator('#content [data-go="quote-sign"]').click();
   await page.locator('#signatureForm').waitFor();
   await page.reload();await page.locator('#signatureForm').waitFor();
   await page.locator('#signerName').fill('Signataire interface');
   await page.locator('#signatureCanvas').scrollIntoViewIfNeeded();
   const box=await page.locator('#signatureCanvas').boundingBox();
   await page.mouse.move(box.x+box.width*.1,box.y+box.height*.4);await page.mouse.down();
   for(const [x,y] of [[.3,.2],[.5,.7],[.8,.3]])await page.mouse.move(box.x+box.width*x,box.y+box.height*y,{steps:8});
   await page.mouse.up();
   await page.setViewportSize({width:844,height:390});await page.setViewportSize({width:390,height:844});
   assert((await page.locator('#signatureStatus').innerText()).includes('Signature tracée'));
   await page.locator('#signatureConsent').check();
   await page.locator('#signatureForm button[type="submit"]').click();
   await page.locator('.quote-detail-lines').waitFor();
   const signed=await page.evaluate(id=>api('/api/companies/1/quotations/'+id),quotes[0].id);
   assert.equal(signed.signature.signer_name,'Signataire interface');assert.equal(signed.status,'accepted');
   assert.equal(await page.locator('#content [data-go="quote-edit"]').count(),0);
   const signedPdf=await page.request.get('http://127.0.0.1:8123/api/companies/1/quotations/'+quotes[0].id+'/pdf?preview=true');
   assert.equal(signedPdf.status(),200);assert(signedPdf.headers()['content-disposition'].startsWith('inline;'));
   assert((await signedPdf.body()).subarray(0,5).equals(Buffer.from('%PDF-')));
   await backHome();
   await goModule('emails');
   await page.locator('#mailKeywords').fill('Clients, commandes');
   await Promise.all([
     page.waitForResponse(r=>r.url().includes('/mail/settings')&&r.request().method()==='PUT'&&r.status()===200),
     page.locator('#mailSettingsForm button[type="submit"]').click()
   ]);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/mail/status'))).keywords,'Clients, commandes');
   assert.equal(await page.locator('#mailConnect').isDisabled(),true);
   // Isolated UI fixture: no real mailbox connection and no paid AI call.
   let mailAiCalls=0,mailSendCalls=0;
   await page.route('**/api/companies/1/mail/messages/99001',route=>route.fulfill({json:{id:99001,subject:'Message test IA',sender:'Client test',body:'Merci de préciser votre offre.',reply_to:'client@example.test',send_status:'draft',revision:1,reply_body:'Texte personnel à conserver',reply_subject:'Re: Message test IA'}}));
   await page.route('**/api/companies/1/mail/messages/99001/analyse',async route=>{
    mailAiCalls++;const {kind}=route.request().postDataJSON();
    if(mailAiCalls===1)return route.fulfill({status:503,json:{detail:'Crédit indisponible pour ce test'}});
    return route.fulfill({json:{kind,text:kind==='summary'?'Résumé <img src=x onerror=alert(1)>':'Bonjour, pourriez-vous préciser les quantités ?',history_count:2,tariff_count:2,tariffs_limited:false,truncated:false,cached:false}});
   });
   await page.route('**/api/companies/1/mail/messages/99001/send',route=>{mailSendCalls++;return route.fulfill({json:{sent:true}});});
   await page.evaluate(()=>openTab('email',{recordId:99001}));
   await page.locator('[data-mail-ai="summary"]').click();
   await page.locator('[data-ai-status]').filter({hasText:'Crédit indisponible'}).waitFor();
   assert.equal(await page.locator('#mailReplyBody').inputValue(),'Texte personnel à conserver');
   await page.locator('[data-mail-ai="summary"]').click();
   await page.locator('[data-ai-result]').filter({hasText:'Résumé <img'}).waitFor();
   assert.equal(await page.locator('[data-ai-result] img').count(),0);
   await page.locator('[data-mail-ai="reply"]').click();
   await page.locator('[data-ai-actions] .btn').waitFor();
   assert((await page.locator('[data-ai-status]').innerText()).includes('2 tarif(s) de vente validé(s)'));
   assert.equal(await page.locator('#mailReplyBody').inputValue(),'Texte personnel à conserver');
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('[data-ai-actions] .btn').click();
   assert.equal(await page.locator('#mailReplyBody').inputValue(),'Bonjour, pourriez-vous préciser les quantités ?');
   assert.equal(await page.locator('#sendMailReply').isDisabled(),true);
   assert.equal(mailSendCalls,0);
   await page.unroute('**/api/companies/1/mail/messages/99001');
   await page.unroute('**/api/companies/1/mail/messages/99001/analyse');
   await page.unroute('**/api/companies/1/mail/messages/99001/send');
   await backHome();
   await goModule('clients');
   await page.locator('#content [data-go="client-new"]').click();
   await page.locator('#clientName').fill('Client interface');
   await page.locator('#clientEmail').fill('client@example.test');
   await page.locator('#clientForm button.btn.primary').click();
   await page.locator('[data-client-open]').waitFor();
   await backHome();await page.waitForFunction(()=>document.querySelector('.priority-card')?.innerText.includes('Client interface'));
   assert.equal(await page.locator('#content .module-grid [data-go="clients"]').getAttribute('data-state'),'warning');
   assert.equal(await page.locator('.priority-tile').getAttribute('data-state'),'warning');
   assert.equal(await page.locator('.priority-card').count(),1);
   assert.equal(await page.locator('.module-grid input,.module-grid dl,.module-inline-action,.inline-client-facts').count(),0);
   assert((await page.locator('[data-module="clients"] .module-insight').innerText()).includes('Client interface'));
   assert.equal(await page.locator('#contextPanel').count(),0);
   await page.locator('[data-priority-open]').click();
   await page.locator('#clientForm').waitFor();assert.equal(await page.locator('#clientName').inputValue(),'Client interface');
   await page.locator('[data-validate-client]').click();await page.locator('#content .module-grid').waitFor();
   await page.waitForFunction(()=>document.querySelectorAll('.routine-card').length===1);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/clients')))[0].needs_review,false);
   assert.equal(await page.locator('#content .module-grid [data-go="clients"]').getAttribute('data-state'),'success');
   await goModule('activities');
   await page.evaluate(()=>openTab('activity-new'));
   await page.locator('#activityTitle').fill('Préparer intervention');
   assert.equal(await page.locator('.dictation-button').count(),0);
   await page.locator('#activityDescription').fill('Consigne saisie au clavier.');
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
   await goModule('social');
   await page.locator('[data-social-work]').first().click();
   await page.locator('#socialTitle').fill('Réalisation publique test');
   await page.locator('#socialFacts').fill('Travail terminé.');
   await page.locator('#socialCreate button').click();
   await page.locator('#socialPreview').waitFor();
   await page.waitForFunction(()=>document.querySelector('#socialPreview')?.naturalWidth===1080);
   assert.equal(await page.locator('#socialCopy').isDisabled(),true);
   assert.equal(await page.locator('#socialDownload').count(),0);
   await backHome();
   await page.waitForFunction(()=>document.querySelector('.priority-card')?.innerText.includes('Réalisation publique test'));
   await page.locator('[data-priority-open]').click();
   await page.locator('#socialConsent').check();
   await page.locator('#socialValidate').click();
   await page.locator('#socialDownload').waitFor();
   const socialImage=await page.request.get('http://127.0.0.1:8123'+await page.locator('#socialDownload').getAttribute('href'));
   assert.equal(socialImage.status(),200);assert.equal(socialImage.headers()['content-type'],'image/png');
   await page.locator('#socialBody').fill('Correction publique à vérifier.');
   assert.equal(await page.locator('#socialDownload').count(),0);
   assert.equal(await page.locator('#socialCopy').isDisabled(),true);
   const savedSocialForm=await page.locator('#socialEdit').elementHandle();
   await page.locator('#socialEdit button').click();
   await page.waitForFunction(form=>!form.isConnected,savedSocialForm);
   await page.locator('#socialConsent').waitFor();
   assert.equal(await page.locator('#socialConsent').isChecked(),false);
   page.once('dialog',dialog=>dialog.accept());await page.locator('#socialArchive').click();
   await page.locator('[data-social-post]').waitFor();
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
   await page.locator('#content [data-go="calendar"]').click();
   await page.locator('#content [data-go="task-new"]').click();
   await page.locator('#commandText').waitFor();
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
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===6);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/priorities'))).length,6);
   await priorityLayout(6);
   fs.mkdirSync('/tmp/ui-images',{recursive:true});
   await page.screenshot({path:'/tmp/ui-images/home-iphone.png',fullPage:true});
   await page.locator('[data-priority-dismiss]').first().click();
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===5);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/priorities'))).length,5);
   await page.reload({waitUntil:'networkidle'});
   await page.waitForFunction(()=>document.querySelectorAll('.priority-card').length===5);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/priorities'))).length,5);
   for(const [name,width,height] of [['landscape',844,390],['tablet',1024,768],['desktop',1440,1000]]){
    await page.setViewportSize({width,height});await layout();await priorityLayout(5);
    const left=await page.locator('.main').evaluate(el=>el.getBoundingClientRect().left);assert.equal(left,0);
    await page.screenshot({path:'/tmp/ui-images/home-'+name+'.png',fullPage:true});
   }
   await page.setViewportSize({width:390,height:844});
   await goModule('treasury');await page.locator('#cashAdd').click();
   await page.locator('#commandText').waitFor();
   await page.locator('#commandText').fill('entrée 120 euros règlement client');
   await page.locator('#previewCommand').click();
   assert.equal(await page.locator('#treasuryForm').count(),0);
   await page.locator('#confirmCommand').click();
   await page.locator('.treasury-list').waitFor();
   const cash=await page.evaluate(()=>api('/api/companies/1/treasury'));
   assert.equal(cash.balances_minor.EUR,12000);assert.equal(cash.movements.length,1);
   await page.locator('[data-check-cash]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-check-cash]').length===0);
   await backHome();
   for(const [command,path,title] of [['ajoute un prospect Garage Clavier','/api/prospects','Prospection'],['ajoute une échéance contrôle demain','/api/companies/1/tasks','Agenda']]){
    await goModule(title==='Prospection'?'prospects':'calendar');
    await page.locator(title==='Prospection'?'#newProspect':'[data-go="task-new"]').click();await page.locator('#commandText').waitFor();
    const before=(await page.evaluate(path=>api(path),path)).length;
    await page.locator('#commandText').fill(command);await page.locator('#previewCommand').click();await page.locator('#confirmCommand').click();
    await page.locator('#content h1').filter({hasText:title}).waitFor();
    assert.equal((await page.evaluate(path=>api(path),path)).length,before+1);await backHome();
   }
   await page.locator('.account-menu summary').click();
   assert.equal(await page.locator('#accountAudit:visible').count(),1);
   await page.locator('.account-menu summary').click();
   await goModule('activities');
   await page.locator('#closeContext').click();await page.waitForFunction(()=>readRoute().tab==='dashboard');
   await page.locator('.account-menu summary').click();await page.locator('#accountTools').click();
   assert.equal(await page.locator('.tool-list [data-go="equipment"],.tool-list [data-go="risks"],.tool-list [data-go="conformity"]').count(),3);
   await backHome();
   assert.equal(await page.locator('[data-priority-complete],.module-grid button').count(),0);
   await page.locator('[data-priority-open]').first().click();await page.locator('#completeTask').waitFor();
   const completed=page.waitForResponse(r=>r.url().includes('/complete')&&r.request().method()==='POST');
   await page.locator('#completeTask').click();await completed;await backHome();
   assert.equal((await page.evaluate(()=>api('/api/companies/1/priorities'))).length,5);
   await layout();
   await goModule('equipment');await page.locator('#addAsset').click();
   await page.locator('#commandText').fill('matériel Perceuse quantité 2 en panne');
   await page.locator('#previewCommand').click();await page.locator('#confirmCommand').click();
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
   await backHome();await goModule('risks');await page.locator('#addRisk').click();
   await page.locator('#commandText').fill('assurance RC Pro demain');await page.locator('#previewCommand').click();await page.locator('#confirmCommand').click();
   await page.locator('[data-risk]').waitFor();await page.locator('[data-risk]').click();
   await page.locator('#riskForm input[name="completed"]').check();await page.locator('#riskForm button.btn.primary').click();
   await page.locator('[data-risk]').waitFor();assert((await page.locator('[data-risk]').innerText()).includes('Vérifié'));
   assert.equal((await page.evaluate(()=>api('/api/companies/1/risks')))[0].completed,1);await backHome();
   await goModule('conformity');await page.locator('.compliance-list').waitFor();assert.equal(await page.locator('.compliance-list article').count(),35);assert((await page.locator('.compliance-list').innerText()).includes('COST-01'));await backHome();
   await page.locator('.more-functions').click();assert.equal(await page.locator('#dynamicHome').isChecked(),true);await page.locator('#dynamicHome').uncheck();await page.locator('#activityDomain').selectOption('agriculture');
   await page.locator('#suggestModules').click();assert.equal(await page.locator('[data-module-key="equipment"]').isChecked(),true);assert.equal(await page.locator('[data-module-key="prospects"]').isChecked(),false);
   await page.locator('#clearModules').click();await page.locator('[data-module-key="clients"]').check();await page.locator('#saveModules').click();
   await page.waitForFunction(()=>document.querySelectorAll('#content .module-grid .module-tile').length===1);
   await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#content .module-grid .module-tile').count(),1);
   await page.locator('.more-functions').click();await page.locator('#clearModules').click();await page.locator('#saveModules').click();
   await page.waitForFunction(()=>document.querySelector('.more-functions')&&document.querySelectorAll('#content .module-grid .module-tile').length===0);
   assert.equal(await page.locator('.more-functions').isVisible(),true);
   assert.equal((await page.evaluate(()=>api('/api/companies/1/clients'))).length,1);
   await page.locator('.more-functions').click();await page.locator('#moduleScope').selectOption('suggested');assert.equal(await page.locator('[data-module-key="prospects"]').count(),0);
   await page.locator('#moduleScope').selectOption('all');assert.equal(await page.locator('[data-module-key="prospects"]').count(),1);
   await page.locator('[data-module-key="prospects"]').check();await page.locator('#selectAllModules').click();assert.equal(await page.locator('[data-module-key="social"]').isChecked(),true);await page.locator('[data-module-key="social"]').uncheck();await page.locator('#saveModules').click();await page.locator('#content .module-grid').waitFor();await layout();
   // Filling is derived from the authorized catalog and never alters saved preferences.
   const fillCases=await page.evaluate(async()=>{
     const source=await api('/api/companies/1/workspace');
     return [3,4].map(columns=>{
       const input={...source,dynamic:false,columns,visible:['clients']},before=JSON.stringify(input),filled=homeGridModules(input);
       const none=homeGridModules({...input,visible:[]}),full=homeGridModules({...input,visible:source.modules.map(m=>m.key)});
       return {columns,count:filled.modules.length,keys:filled.modules.map(m=>m.key),automatic:filled.modules.filter(m=>m.automatic).length,unchanged:JSON.stringify(input)===before,empty:none.modules.length,allowed:filled.modules.every(m=>source.modules.some(a=>a.key===m.key)),fullCount:full.modules.length};
     });
   });
   for(const result of fillCases){assert.equal(result.count,result.columns);assert.equal(new Set(result.keys).size,result.count);assert.equal(result.automatic,result.columns-1);assert(result.unchanged&&result.allowed);assert.equal(result.empty,0);assert.equal(result.fullCount,Math.floor(17/result.columns)*result.columns);}
   const widgetRefresh=await page.evaluate(async()=>{
     const state=await api('/api/companies/1/cockpit'),tile=document.querySelector('[data-go="leads"]');
     const icon=tile.querySelector('svg');tile.dataset.identity='widget-kept';
     refreshHomeWidgets({...state,widgets:{...state.widgets,leads:{value:99,label:'À finaliser'}}});
     const result={value:tile.querySelector('.widget-value').textContent,same:document.querySelector('[data-go="leads"]')===tile&&tile.querySelector('svg')===icon,multi:moduleWidget('treasury',{widgets:{treasury:{balances_minor:{EUR:10000,XOF:50000}}}})};
     refreshHomeWidgets(state);return result;
   });
   assert.equal(widgetRefresh.value,'99');assert(widgetRefresh.same);assert.equal(widgetRefresh.multi.value,'2');assert(widgetRefresh.multi.detail.includes('100')&&widgetRefresh.multi.detail.includes('500'));
   const dynamics=await page.evaluate(async()=>{
     const source=await api('/api/companies/1/workspace'),inactive=source.modules.map(m=>m.key).filter(k=>!['clients','calendar','reports'].includes(k));
     const input={...source,dynamic:true,columns:3,visible:['reports','equipment','clients'],inactive};
     const urgent=homeGridModules(input,{module_states:{calendar:{state:'danger'}}}).modules.map(m=>m.key);
     const quiet=homeGridModules({...input,inactive:source.modules.map(m=>m.key)}).modules;
     const manual=homeGridModules({...input,dynamic:false}).modules.map(m=>m.key);
     return {urgent,quiet:quiet.length,manual};
   });
   assert.equal(dynamics.urgent[0],'calendar');assert(!dynamics.urgent.includes('equipment'));assert.equal(dynamics.urgent.length,3);assert.equal(dynamics.quiet,0);assert(dynamics.manual.includes('equipment'));
   // Column choice survives closing the panel and reload without changing modules.
   for(const columns of [3,4]){
     await page.locator('.more-functions').click();await page.locator('#homeColumns').selectOption(String(columns));await page.locator('#saveModules').click();
     await page.waitForFunction(n=>document.querySelector('#content .module-grid')?.dataset.columns===String(n),columns);
     await page.reload({waitUntil:'networkidle'});
     for(const width of [320,390,844,1280]){
       await page.setViewportSize({width,height:844});
       const geometry=await page.locator('#content .module-grid').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth,cards:[...el.querySelectorAll('.module-tile')].map(c=>{const r=c.getBoundingClientRect(),face=c.querySelector('.module-face').getBoundingClientRect(),label=c.querySelector('.module-copy').getBoundingClientRect();return r.width>=44&&c.scrollWidth<=c.clientWidth&&Math.abs(face.height-face.width)<2&&label.top>=face.bottom;}),sizes:[...el.querySelectorAll('.module-face')].map(c=>({width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height})),count:el.children.length,closedRow:Math.abs(el.lastElementChild.getBoundingClientRect().right-el.getBoundingClientRect().right)<2,prioritiesAbove:document.querySelector('#priorityBlock').getBoundingClientRect().bottom<=el.getBoundingClientRect().top}));
       assert.equal(geometry.columns,columns);assert(!geometry.overflow);assert.equal(geometry.count%columns,0);for(const size of geometry.sizes){assert(Math.abs(size.width-geometry.sizes[0].width)<2&&Math.abs(size.height-geometry.sizes[0].height)<2,'Every icon card has the same dimensions');}assert(geometry.cards.every(Boolean),'Dense cards remain proportionate, contained and tappable');assert(geometry.closedRow&&geometry.prioritiesAbove,'Rows are filled and priorities remain above the grid');
       const metrics=await page.locator('#content .module-grid').evaluate(el=>[...el.querySelectorAll('.module-tile')].every(c=>{const f=c.querySelector('.module-face').getBoundingClientRect(),m=c.querySelector('.widget-metric').getBoundingClientRect(),icon=c.querySelector('.module-icon').getBoundingClientRect();return c.querySelector('.module-icon svg')&&getComputedStyle(c.querySelector('.module-icon')).borderRadius==='25%'&&m.top>=f.top&&m.bottom<=f.bottom&&m.width>0&&icon.width>=f.width*.4&&icon.width<=f.width*.51;}));
       assert(metrics,'Dense widgets retain SVG and visible data within equal cards');
       if(width===390){
         await page.screenshot({path:`/tmp/ui-images/home-${columns}-columns-mobile.png`,fullPage:true});
         const frames=await page.evaluate(()=>new Promise(resolve=>{const samples=[],saved=scrollY;window.scrollTo(0,Math.max(0,Math.min(document.querySelector('.module-grid').offsetTop,document.documentElement.scrollHeight-innerHeight)-240));let previous;function step(now){if(previous!==undefined)samples.push(now-previous);previous=now;window.scrollBy(0,8);if(samples.length<30)requestAnimationFrame(step);else{window.scrollTo(0,saved);samples.sort((a,b)=>a-b);resolve({medianMs:samples[15],p95Ms:samples[28]});}}requestAnimationFrame(step);}));
         console.log('Scroll frame sample (CI browser)',JSON.stringify({columns,...frames}));
       }

     }
     await page.setViewportSize({width:390,height:844});await goModule('clients');await page.locator('#contextPanel').waitFor();await backHome();
     assert.equal(await page.locator('.module-grid').getAttribute('data-columns'),String(columns));
     await page.locator('.more-functions').click();assert.equal(await page.locator('#homeColumns').inputValue(),String(columns));await backHome();
   }
   await page.locator('.more-functions').click();await page.locator('#homeColumns').selectOption('2');await page.locator('#saveModules').click();
   await page.waitForFunction(()=>document.querySelector('#content .module-grid')?.dataset.columns==='2');await layout();
   await page.locator('.more-functions').click();await page.locator('#dynamicHome').check();await page.locator('#saveModules').click();await page.locator('#content .module-grid').waitFor();
   assert.equal((await page.evaluate(()=>api('/api/companies/1/workspace'))).dynamic,true);
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
   assert.equal(await page.locator('#documentReview [data-import-field]').count(),0);await page.locator('#documentReview button[type="submit"]').click();await page.locator('#scanForm').waitFor();
   for(const [kind,file,number] of [['passport','/tmp/ui-passport.png','L898902C3'],['identity','/tmp/ui-identity.png','D23145890']]){
    await page.locator('#scanKind').selectOption(kind);assert((await page.locator('#scanHint').innerText()).length>20);
    await page.locator('#scanFile').setInputFiles({name:kind+'-specimen.png',mimeType:'image/png',buffer:fs.readFileSync(file)});
    await page.locator('#readDocument').click();await page.locator('#documentReview').waitFor({timeout:60000});
    assert.equal(await page.locator('#import-last_name').inputValue(),'ERIKSSON');assert.equal(await page.locator('#import-first_name').inputValue(),'ANNA MARIA');
    assert.equal(await page.locator('#import-document_number').inputValue(),number);assert.equal(await page.locator('#import-birth_date').inputValue(),'12/08/1974');
    assert.equal(await page.locator('#import-expiry_date').inputValue(),'15/04/2012');assert.equal(await page.locator('#import-legal_name').count(),0);
    assert.equal(await page.locator('#documentReview input[type="checkbox"]').count(),0);
    await page.locator('#documentReview button[type="submit"]').click();await page.locator('#scanForm').waitFor();
    const saved=(await page.evaluate(()=>api('/api/companies/1/profile'))).fields;assert.equal(saved.document_number,number);assert.equal(saved.legal_name,'TEST SERVICES');
   }
   await page.locator('#scanKind').selectOption('address');await page.locator('#scanFile').setInputFiles({name:'justificatif-test.pdf',mimeType:'application/pdf',buffer:fs.readFileSync('/tmp/ui-address.pdf')});
   await page.locator('#readDocument').click();await page.locator('#documentReview').waitFor({timeout:60000});
   assert.equal(await page.locator('#import-personal_address').inputValue(),'12 rue du Test 75001 Paris');assert.equal(await page.locator('#import-document_holder').inputValue(),'ALICE MARTIN');
   await page.locator('#documentReview button[type="submit"]').click();await page.locator('#scanForm').waitFor();await backHome();
   await goModule('leads');await page.locator('#content [data-go="quote-new"]').click();await page.locator('#catalogTariff').waitFor();
   const tariff=(await page.evaluate(()=>api('/api/companies/1/tariff-catalog')))[0];await page.locator('#catalogTariff').selectOption(String(tariff.id));
   assert.equal(await page.locator('.quote-line [name="unit_price"]').inputValue(),'25.50');await backHome();await layout();
   // The same circular arrow closes account dialogs.
   await page.locator('.account-menu summary').click();
   await page.locator('#passwordBtn').click();
   assert.equal(await page.locator('#closeModal.back-circle svg').count(),1);
   await page.locator('#closeModal').click();
   assert.equal(await page.locator('#voiceFab,.dictation-button,#startCommandMic').count(),0);
   assert.equal(await page.evaluate(()=>window.__recognitionAttempts),0);
   await page.locator('#assistantChat').evaluate(el=>{el.dataset.privateSession='old-session';});
   if(!await page.locator('#logout').isVisible())await page.locator('.account-menu summary').click();
   await page.locator('#logout').click();await page.locator('#loginEmail').waitFor();
   assert.equal(await page.locator('#content>*').count(),0);assert.equal(await page.locator('#contextPanel').count(),0);
   await page.locator('#loginEmail').fill('ui-owner@example.test');await page.locator('#loginPassword').fill('local-ui-smoke-test-only');await page.getByRole('button',{name:'Se connecter'}).click();
   await page.locator('#content .module-grid').waitFor();assert.equal(await page.locator('#assistantChat').getAttribute('data-private-session'),null);
   assert.deepEqual(errors,[]);
   console.log('PASS: clean home, four main modules, dynamic badges, keyboard input, cashbook, logistics and explicit compliance gaps, quotation creation/edit/PDF, always-present useful priority, mail settings, speech controls and no integrated dictation, client and activity workflows, labeled examples, direct form routes, visible first fields, consistent circular returns, browser history, responsive layout, recurrence, priority actions and persistent dismissal.');
 }catch(error){
   console.error('UI details',JSON.stringify({url:page.url(),errors,body:await page.locator('body').innerText()}));
   fs.mkdirSync('/tmp/ui-images',{recursive:true});
   await page.screenshot({path:'/tmp/ui-images/failure.png',fullPage:true});
   throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
