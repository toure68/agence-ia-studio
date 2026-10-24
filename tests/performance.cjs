'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.HOME_TEST_CHROME?{executablePath:process.env.HOME_TEST_CHROME}:process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});let authState=process.env.UI_AUTH_STATE_PATH&&fs.existsSync(process.env.UI_AUTH_STATE_PATH)?JSON.parse(fs.readFileSync(process.env.UI_AUTH_STATE_PATH,'utf8')):undefined;try{
 for(const [width,height] of [[375,667],[390,844],[430,932]]){
  const p=await b.newPage({viewport:{width,height},isMobile:true,hasTouch:true,storageState:authState});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const cd=await p.context().newCDPSession(p);await cd.send('Emulation.setCPUThrottlingRate',{rate:4});
  await p.addInitScript(()=>{localStorage.setItem('aia-reader','on');localStorage.removeItem('aia-reader-samples');window.idleStacks=0;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>raf(t=>{if(f.name==='stack'||String(f).includes('stack();'))idleStacks++;f(t)});});
  let bodies=0,conditional=0,full=0,version=1;
  const cards=Array.from({length:1000},(_,i)=>({key:'perf-'+i,kind:'email',rank:3,mail_received:true,mail_service:'gmail',state:'warning',state_label:'Non lu',home_title:'Client '+i,home_detail:'Commande '+i,title:'Commande '+i,subject:'Commande '+i,source:'Gmail',date:'2026-10-24T10:00:00Z',action:{type:'email',id:70000+i,connection_id:0,provider:'gmail'}}));
  const messages=cards.map((c,i)=>({id:c.action.id,provider:'gmail',connection_id:0,subject:c.subject,sender:c.home_title,reply_to:'client@example.test',body:'Message complet '+i+'\nQuantité : 6',received:c.date,unread:true,archived:0,attachments:[]}));
  await p.route('**/api/companies/1/priorities',r=>{const tag='"perf-'+version+'"';if(r.request().headers()['if-none-match']===tag){conditional++;return r.fulfill({status:304,headers:{ETag:tag}});}full++;return r.fulfill({json:cards,headers:{ETag:tag}});});
  await p.route('**/api/companies/1/mail/**',r=>{const path=new URL(r.request().url()).pathname.split('/mail/')[1];if(path==='unified/accounts')return r.fulfill({json:{providers:[{id:'gmail',name:'Gmail',short:'Gmail',provider:'google'}],accounts:[{id:0,email:'owner@example.test',service:'gmail',connected:true}],configured:true}});
   if(path==='unified/status')return r.fulfill({json:{connected:true,configured:true,email:'owner@example.test',keywords:'Clients',realtime:false}});
   if(path==='messages')return r.fulfill({json:messages});if(path==='unified/drafts')return r.fulfill({json:[]});if(path==='unified/version')return r.fulfill({json:{version:0}});
   const m=path.match(/^messages\/(\d+)$/);if(m){bodies++;return r.fulfill({json:messages[Number(m[1])-70000]});}
   return r.fulfill({status:404,json:{detail:'Unexpected test request'}});
  });
  const started=Date.now();await p.goto('http://127.0.0.1:8123/');if(!authState){await p.locator('#loginEmail').fill(process.env.ADMIN_EMAIL);await p.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD);await p.getByRole('button',{name:'Se connecter'}).click();}await p.locator('[data-reader-key="perf-0"]').waitFor();if(!authState){authState={cookies:(await p.context().storageState()).cookies,origins:[]};if(process.env.UI_AUTH_STATE_PATH)fs.writeFileSync(process.env.UI_AUTH_STATE_PATH,JSON.stringify(authState),{mode:0o600});}const ready=Date.now()-started;await p.waitForTimeout(800);
  assert.equal(bodies,0,'Loading the home never fetches 1000 message bodies');assert.equal(full,1,'No second priority fetch caused by layout measurement');
  const dom=await p.locator('.reader-item').count();assert(dom<=12);assert.equal(await p.evaluate(()=>homeReader.queueSnapshot().total),1000);assert.match(await p.locator('.reader-count').textContent(),/1000/);
  await p.evaluate(()=>idleStacks=0);await p.waitForTimeout(1000);assert(await p.evaluate(()=>idleStacks)<5,'Visual calculations stop when the screen is idle');
  const step=await p.evaluate(()=>{const t=performance.now();homeReader.step(1);return performance.now()-t;});assert(step<500,'Large queues do not create second-long synchronous stalls');
  await p.locator('.reader-mail-text').filter({hasText:'Message complet 0'}).waitFor();assert.equal(bodies,1);
  const kept=await p.evaluate(async()=>{const el=document.querySelector('.reader-list');await renderPriorities();return el===document.querySelector('.reader-list')});assert(kept,'Unchanged refresh keeps the mounted queue');assert(conditional>=1);assert.equal(bodies,1,'Unchanged refresh retains the loaded body');
  // Jump across the queue using its actual scroll range, then step in both directions.
  await p.locator('.reader-list').evaluate(el=>{el.scrollTop=998*Number(document.body.dataset.readerPitch)});
  await p.locator('.reader-card strong').filter({hasText:'Client 997'}).waitFor();assert(await p.locator('.reader-item').count()<=12);
  await p.evaluate(()=>homeReader.step(1));await p.locator('.reader-card strong').filter({hasText:'Client 998'}).waitFor();await p.evaluate(()=>homeReader.step(-1));await p.locator('.reader-card strong').filter({hasText:'Client 997'}).waitFor();await p.evaluate(()=>homeReader.step(1));await p.locator('.reader-card strong').filter({hasText:'Client 998'}).waitFor();await p.waitForTimeout(350);
  // Dragging at the virtualized end keeps the same magnetic gesture and global index.
  await p.locator('.reader-list').evaluate(el=>{const r=el.getBoundingClientRect();for(const [type,dy] of [['touchstart',0],['touchmove',-45],['touchend',-45]]){const t=new Touch({identifier:1,target:el,clientX:r.x+50,clientY:r.y+20+dy});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],changedTouches:[t]}));}});
  await p.locator('.reader-card strong').filter({hasText:'Client 999'}).waitFor();await p.waitForTimeout(400);assert(await p.locator('.reader-end-btn').isVisible());
  fs.mkdirSync('/tmp/performance',{recursive:true});await p.screenshot({path:`/tmp/performance/end-${width}.png`});
  await p.locator('.reader-end-btn').click();await p.waitForTimeout(400);assert.equal(await p.locator('.reference-home.reader-active').count(),0);assert(await p.locator('[data-reader-key="perf-0"]').isVisible());
  // Search still covers every imported message although only fifty rows are mounted.
  await p.evaluate(()=>openTab('emails'));await p.locator('#mailList [data-mail-id]').first().waitFor();assert.equal(await p.locator('#mailList [data-mail-id]').count(),50);
  await p.locator('[data-mail-page="1"]').click();assert.equal(await p.locator('#mailList [data-mail-id]').first().getAttribute('data-mail-id'),'70050');
  await p.locator('#mailSearch').fill('Commande 999');assert.equal(await p.locator('#mailList [data-mail-id]').count(),1);assert(await p.locator('[data-mail-id="70999"]').isVisible());
  await p.locator('#contextPanel .us-close-bottom').click();await p.waitForTimeout(400);
  await p.evaluate(()=>openPriorityGroup({module:'all',members:priorityCards},company.id));await p.locator('[data-priority-item-open]').first().waitFor();assert.equal(await p.locator('[data-priority-item-open]').count(),50);await p.locator('[data-action-page="1"]').click();assert.equal(await p.locator('[data-priority-item-open]').first().getAttribute('data-priority-item-open'),'50');await p.locator('#contextPanel .us-close-bottom').click();await p.waitForTimeout(350);
  cards.unshift({...cards[0],key:'new-arrival',home_title:'Nouveau client',action:{...cards[0].action,id:70001}});version++;await p.evaluate(()=>renderPriorities());assert.equal(await p.evaluate(()=>homeReader.queueSnapshot().total),1001);assert(await p.locator('[data-reader-key="new-arrival"]').isVisible());
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,readyMs:ready,stepMs:Math.round(step),mountedCards:dom,conditionalResponses:conditional}));await p.close();
 }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
