'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu'],...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:{})});
 try{for(const [width,height,provider] of [[375,667],[390,844],[430,932]].flatMap(size=>['nylas','gmail'].map(provider=>[...size,provider]))){
  const p=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});p.setDefaultTimeout(12000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('aia-reader','on');localStorage.removeItem('aia-reader-samples');});
  const spacedBody='Bonjour, pouvez-vous confirmer notre commande ? <img src=x onerror=alert(1)>'+ '\n'.repeat(25)+'\t\u00a0\u200c\u00a0\n'.repeat(10)+'Commandé\nExpédié\nEn cours de livraison'+ '\n'.repeat(45)+'Produit de test\nQuantité : 6\nPrix : 219,90 €\nDate : 24 octobre\nContact : 👩‍🌾';
  const message={id:88001,connection_id:0,provider,sender:'Client <client@example.test>',reply_to:'client@example.test',subject:'Nouvelle commande',received:'2026-10-23T10:00:00Z',body:spacedBody,attachments:[]};
  const card={key:'mail-notification-test',kind:'email',rank:3,mail_received:true,mail_service:'gmail',state:'warning',state_label:'Non lu',home_title:message.sender,home_detail:message.subject,title:message.subject,source:'Gmail',subject:message.subject,date:message.received,action:{type:'email',id:message.id,connection_id:0,provider}};
  let sent=0,draft=null;const requests=[];
  await p.route('**/api/companies/1/priorities',route=>route.fulfill({json:sent?[]:[card]}));
  await p.route('**/api/companies/1/mail/**',async route=>{
   const req=route.request(),u=new URL(req.url()),path=u.pathname.split('/mail/')[1];requests.push({path,account:u.searchParams.get('account_id')});
   const body=req.postDataJSON(),ok=json=>route.fulfill({json});
   if(path==='messages/88001')return ok(message);
   if(path==='unified/accounts')return ok({providers:[{id:'gmail',name:'Gmail',short:'Gmail',provider:'google'}],accounts:[{id:0,service:'gmail',connected:true,email:'owner@example.test'}],configured:true});
   if(path==='unified/messages/88001/thread')return ok({messages:[message],selected:message.id});
   if(path==='unified/version')return ok({version:0});
   if(path==='unified/drafts'&&req.method()==='PUT'){draft={...body,id:1,revision:(body.revision||0)+1,status:'draft'};return ok(draft);}
   if(path==='unified/drafts/1/send'){assert.equal(body.confirmed,true);sent++;return ok({sent:true});}
   if(path==='unified/drafts/1')return ok(draft);
   return route.fulfill({status:404,json:{detail:'Unexpected '+path}});
  });
  await p.goto('http://127.0.0.1:8123/');await p.locator('#loginEmail').fill(process.env.ADMIN_EMAIL);await p.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD);await p.getByRole('button',{name:'Se connecter'}).click();
  await p.locator('[data-reader-key="mail-notification-test"]').waitFor();const address=p.url();
  await p.evaluate(()=>homeReader.setSamples(false));
  await p.evaluate(()=>mailClient.selectAccount(7));
  await p.locator('[data-reader-key="mail-notification-test"]').click();
  await p.locator('.reader-mail-text').filter({hasText:'confirmer notre commande'}).waitFor();
  assert.equal(await p.locator('[data-reader-key="mail-notification-test"] .mail-brand-svg').count(),1,'Gmail brand in notification');
  assert.equal(await p.locator('.reader-card .mail-brand-svg').count(),1,'Gmail brand in reader');
  await p.locator('.home-pages [data-module="mail-gmail"].is-reading').waitFor();
  assert(await p.getByRole('button',{name:'Transférer',exact:true}).filter({visible:true}).isVisible());
  assert.equal(await p.locator('.reader-mail-text img').count(),0,'Received HTML stays inert');
  const compact=p.locator('.reader-mail-text.is-compact');
  assert.equal(await compact.locator('p').count(),3,'Layout gaps become three compact paragraphs');
  assert.equal(await compact.locator('p').nth(1).textContent(),'Commandé\nExpédié\nEn cours de livraison','Meaningful line breaks remain');
  for(const text of ['Quantité : 6','219,90 €','24 octobre','👩‍🌾'])assert((await compact.textContent()).includes(text),'All message information remains');
  assert(await compact.evaluate(el=>el.scrollHeight<300),'No empty screens between the message parts');
  fs.mkdirSync('/tmp/mail-notifications',{recursive:true});await p.screenshot({path:`/tmp/mail-notifications/reader-${provider}-${width}.png`});
  assert.equal(await p.evaluate(()=>mailClient.selected()),7,'Preview never changes selected box');
  await p.getByRole('button',{name:'Transférer',exact:true}).filter({visible:true}).click();
  await p.locator('#mailComposeForm').waitFor();
  assert.match(await p.locator('#mailComposeForm [name=body]').inputValue(),/Message transféré/);
  assert((await p.locator('#mailComposeForm [name=body]').inputValue()).endsWith(spacedBody),'Forwarding preserves the original unmodified message');
  assert.equal(sent,0);await p.locator('.modal.universal-sheet .us-close-bottom').click();
  // Both the in-reader buttons and the bottom action strip share these actions.
  await p.getByRole('button',{name:'Répondre',exact:true}).filter({visible:true}).click();
  let form=p.locator('#mailComposeForm');await form.waitFor();assert.equal(await form.locator('[name=to]').inputValue(),'client@example.test');assert.equal(await p.evaluate(()=>mailClient.selected()),0);
  await form.locator('[name=body]').fill('Bonjour, commande bien reçue.');
  await p.locator('.modal.universal-sheet .us-close-bottom').click();
  assert(await p.locator('.reader-mail-text').isVisible(),'Close returns to the same message');
  await p.getByRole('button',{name:'Répondre',exact:true}).filter({visible:true}).click();form=p.locator('#mailComposeForm');
  assert.equal(await form.locator('[name=body]').inputValue(),'Bonjour, commande bien reçue.','Draft preserved');
  await form.locator('button[type=submit]').click();await form.locator('#mailConfirmSend').waitFor();assert.equal(sent,0,'Review never sends');
  await p.screenshot({path:`/tmp/mail-notifications/reply-${width}.png`});
  await form.locator('#mailConfirmSend').click();await form.waitFor({state:'detached'});assert.equal(sent,1);assert.equal(p.url(),address);
  assert(requests.filter(x=>x.path==='messages/88001'||x.path==='unified/drafts').every(x=>x.account===null),'Uses notification box, not previously selected account');
  assert.deepEqual(errors,[]);console.log('Mail notifications OK',provider,width);await p.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
