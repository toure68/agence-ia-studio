'use strict';
// Reuse only authentication cookies between visual checks on the isolated test server.
// Do not weaken the application's login throttle or share module/localStorage preferences.
const fs=require('node:fs');
let state;
module.exports=async function openSessionPage(browser,options){
 const file=process.env.UI_AUTH_STATE_PATH;
 if(!state&&file&&fs.existsSync(file))state=JSON.parse(fs.readFileSync(file,'utf8'));
 const page=await browser.newPage({...options,storageState:state});
 await page.goto('http://127.0.0.1:8123/');
 if(!state){
  await page.locator('#loginEmail').fill(process.env.ADMIN_EMAIL||'ui-owner@example.test');
  await page.locator('#loginPassword').fill(process.env.ADMIN_PASSWORD||'local-ui-smoke-test-only');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await page.locator('.home-pages').waitFor();
  const saved=await page.context().storageState();state={cookies:saved.cookies,origins:[]};
  if(file)fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});
 }else await page.locator('.home-pages').waitFor();
 return page;
};
