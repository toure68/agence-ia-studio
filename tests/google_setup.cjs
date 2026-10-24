'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});try{
 for(const width of [375,390,430]){
  const p=await b.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.fakeViewport={height:844,offsetTop:0};for(const k of ['height','offsetTop'])Object.defineProperty(visualViewport,k,{get:()=>fakeViewport[k]});});
  let configured=false;
  const callback='https://agence-ia-studio.onrender.com/api/mail/gmail/callback';
  await p.route('**/api/companies/1/mail/**',async r=>{const path=new URL(r.request().url()).pathname.split('/mail/')[1],req=r.request(),body=req.postDataJSON();
   if(path==='unified/accounts')return r.fulfill({json:{providers:[{id:'gmail',name:'Gmail',short:'Gmail',provider:'google',supported:true}],accounts:[{id:7,email:'old@example.test',service:'gmail',connected:false}],configured}});
   if(path==='google/setup'&&req.method()==='GET')return r.fulfill({json:{configured,client_id:'',secret_set:false,redirect_uri:callback}});
   if(path==='google/setup'&&req.method()==='PUT'){writes.push({path,body});configured=true;return r.fulfill({json:{configured:true,secret_set:true,client_id:body.client_id,redirect_uri:callback}});}
   if(path==='unified/connect'){writes.push({path,body,account:new URL(req.url()).searchParams.get('account_id')});return r.fulfill({json:{url:'https://accounts.google.com/o/oauth2/v2/auth?client_id=test'}});}
   return r.fulfill({status:404,json:{detail:'Unexpected '+path}});
  });
  await p.goto('http://127.0.0.1:8123/');await p.locator('#loginEmail').fill(process.env.ADMIN_EMAIL);await p.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD);await p.getByRole('button',{name:'Se connecter'}).click();await p.locator('.home-pages').waitFor();await p.evaluate(()=>mailConnections.choose('gmail'));await p.getByRole('button',{name:'old@example.test',exact:false}).click();
  const email=p.locator('#mailProviderConnect input[name=email]');assert.equal(await email.evaluate(e=>e.readOnly),false);await email.click();assert.equal(await p.evaluate(()=>document.activeElement?.name),'email');assert.equal(await email.getAttribute('inputmode'),'email');
  await email.fill('new@example.test');await p.waitForTimeout(80);assert.equal(await p.locator('#mailProviderConnect .contact-go').count(),0,'An OAuth address is never a mailto contact');assert(await p.locator('#mailProviderConnect [type=submit]').isDisabled());
  await p.locator('#mailGoogleSetup').click();await p.locator('#mailGoogleSetupForm').waitFor();fs.mkdirSync('/tmp/google-setup',{recursive:true});await p.screenshot({path:`/tmp/google-setup/setup-${width}.png`});assert.equal(await p.locator('#mailGoogleCallback').inputValue(),callback);
  await p.locator('#mailGoogleJson').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({installed:{client_id:'desktop',client_secret:'not-valid'}}))});await p.getByRole('status').filter({hasText:'Application Web'}).waitFor();assert.equal(writes.length,0);
  const json={web:{client_id:'12345-test.apps.googleusercontent.com',client_secret:'fake-google-client-secret',redirect_uris:[callback],token_uri:'https://untrusted.example.test/ignored'}};
  await p.locator('#mailGoogleJson').setInputFiles({name:'client.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});await p.getByRole('status').filter({hasText:'Identifiants importés'}).waitFor();
  const secret=p.locator('#mailGoogleSetupForm [name=client_secret]');assert.equal(await secret.getAttribute('type'),'password');await secret.click();await p.evaluate(()=>{fakeViewport.height=innerHeight-280;visualViewport.dispatchEvent(new Event('resize'));});await p.waitForTimeout(200);
  const footer=await p.locator('.modal.universal-sheet .us-close-bottom').boundingBox();assert(footer.y+footer.height<=844-280,'Close stays above the keyboard');
  await p.evaluate(()=>{fakeViewport.height=innerHeight;visualViewport.dispatchEvent(new Event('resize'));});await p.locator('#mailGoogleSetupForm [type=submit]').click();await p.locator('#mailProviderConnect').waitFor();assert.equal(await p.locator('#mailProviderConnect [name=email]').inputValue(),'new@example.test','Address survives setup');assert(await p.locator('#mailProviderConnect [type=submit]').isEnabled(),'Google setup unlocks real OAuth, never fakes a connected mailbox');
  assert.deepEqual(writes[0].body,{client_id:json.web.client_id,client_secret:json.web.client_secret});assert.equal(await p.locator('#mailGoogleSetupForm').count(),0,'Secret field removed after saving');assert(!writes.some(w=>w.path.endsWith('/send')));
  await p.evaluate(()=>{window.fakeMailPopup={document:{body:{}},location:{},close(){}};window.open=()=>fakeMailPopup;});await p.locator('#mailProviderConnect [type=submit]').click();await p.waitForFunction(()=>fakeMailPopup.location.href?.startsWith('https://accounts.google.com/'));
  const connection=writes.find(w=>w.path==='unified/connect');assert(connection.body.add&&connection.body.login_hint==='new@example.test');assert.equal(connection.account,null,'Changed address adds a separate account');
  fs.mkdirSync('/tmp/google-setup',{recursive:true});await p.screenshot({path:`/tmp/google-setup/connected-form-${width}.png`});assert.deepEqual(errors,[]);console.log('Google setup OK',width);await p.close();
 }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
