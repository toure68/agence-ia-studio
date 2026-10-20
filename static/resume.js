'use strict';
// Resume where you left off (Netflix habit, user request 2026-10-20): a phone call, a look at an e-mail… and when
// the entrepreneur comes back — even if the phone closed the app meanwhile — the same company, the same window,
// what was typed in it, the assistant draft and the scroll position are back. Kept on this phone only, per
// account, for 24 hours. Closing the window, sending a form or logging out forgets it. Passwords, keys and file
// fields are never kept.
const aiaResume=(()=>{
 const KEY='aia-resume',MAX_AGE=24*3600*1000;
 const SECRET=/password|passe|api.?key|token|secret|iban|card|carte|cvc|otp|code_?sms/i;
 const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch{return null;}};
 const write=v=>{try{v?localStorage.setItem(KEY,JSON.stringify(v)):localStorage.removeItem(KEY);}catch{}};
 const fieldKey=el=>(el.form?.id||'')+'|'+(el.name||el.id);
 const keep=el=>(el.name||el.id)&&!el.disabled&&!el.closest('#auth,[data-no-resume]')&&!/^(password|file|hidden|submit|button)$/.test(el.type)&&!SECRET.test((el.name||'')+' '+(el.id||'')+' '+(el.getAttribute('autocomplete')||''));
 function fields(root){
  const out={};if(!root)return out;
  root.querySelectorAll('input,textarea,select').forEach(el=>{
   if(!keep(el))return;
   if(el.type==='checkbox'||el.type==='radio'){if(el.checked!==el.defaultChecked)out[fieldKey(el)+(el.type==='radio'?'='+el.value:'')]={c:el.checked};return;}
   if(el.tagName==='SELECT'){const d=[...el.options].find(o=>o.defaultSelected)?.value??el.options[0]?.value;if(el.value!==d)out[fieldKey(el)]={v:el.value};return;}
   if(el.value!==el.defaultValue)out[fieldKey(el)]={v:el.value};
  });
  return out;
 }
 let paused=false;
 function save(){
  if(paused||typeof me==='undefined'||!me||typeof company==='undefined'||!company)return;
  const panel=document.querySelector('#contextPanel'),onHome=typeof tab==='undefined'||tab==='dashboard';
  const route=!onHome&&typeof readRoute==='function'?readRoute():null;
  const draft=document.querySelector('#assistantMessage')?.value||'';
  const scroller=panel?.querySelector('.context-scroll')||panel;
  const snap={t:Date.now(),user:me.id??me.email,cid:company.id,route:route&&route.tab!=='dashboard'?route:null,fields:route?fields(panel||document.querySelector('#content')):{},scroll:route&&scroller?scroller.scrollTop:0,home:onHome?scrollY:0,draft};
  write(snap);
 }
 let timer=0;const later=()=>{clearTimeout(timer);timer=setTimeout(save,400);};
 // The phone may close the app without warning: save when it goes to the background, and shortly after typing.
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});
 addEventListener('pagehide',save);
 // Every tap may change the screen (a window opened or closed): saved a moment later.
 document.addEventListener('click',later,true);addEventListener('popstate',later);
 document.addEventListener('input',later,true);document.addEventListener('change',later,true);
 // A sent form is done: its typed values are not brought back (the window itself still is).
 document.addEventListener('submit',e=>{const s=read();if(s?.fields){for(const k of Object.keys(s.fields))if(k.startsWith((e.target.id||'')+'|'))delete s.fields[k];write(s);}setTimeout(save,800);},true);
 function fresh(){const s=read();return s&&Date.now()-s.t<MAX_AGE&&s.user===(me.id??me.email)?s:null;}
 // Before the first screen: the same company as before.
 function pickCompany(){
  const s=fresh();if(!s||!Array.isArray(companies))return;
  const c=companies.find(x=>x.id===s.cid);if(c&&c!==company){company=c;const sel=document.querySelector('#companySelect');if(sel)sel.value=String(c.id);}
 }
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(test,ms=4000){const end=Date.now()+ms;while(Date.now()<end){if(test())return true;await wait(60);}return false;}
 function fill(root,saved){
  let n=0;
  root.querySelectorAll('input,textarea,select').forEach(el=>{
   if(!keep(el))return;
   const k=fieldKey(el)+(el.type==='radio'?'='+el.value:''),v=saved[k];if(!v)return;
   if('c' in v){if(el.checked!==v.c){el.checked=v.c;el.dispatchEvent(new Event('change',{bubbles:true}));n++;}return;}
   if(el.value!==v.v){el.value=v.v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));n++;}
  });
  return n;
 }
 // After the first screen: reopen the window, put back what was typed, the draft and the scroll.
 async function restore(started){
  const s=fresh();if(!s||s.cid!==company?.id)return false;
  paused=true;let back=false;
  try{
   const draft=document.querySelector('#assistantMessage');
   if(draft&&s.draft&&!draft.value){draft.value=s.draft;draft.dispatchEvent(new Event('input',{bubbles:true}));back=true;}
   if(s.route){
    const same=started&&started.tab===s.route.tab&&(started.recordId||null)===(s.route.recordId||null);
    if(!same){await openTab(s.route.tab,{taskId:s.route.taskId,companyId:s.route.companyId,recordId:s.route.recordId});}
    await until(()=>tab===s.route.tab&&(document.querySelector('#contextPanel .context-scroll, #content')?.querySelector('form,.task-row,h1')));
    const root=document.querySelector('#contextPanel')||document.querySelector('#content');
    await wait(120);
    if(root&&s.fields&&Object.keys(s.fields).length)fill(root,s.fields);
    const scroller=document.querySelector('#contextPanel .context-scroll')||document.querySelector('#contextPanel');
    if(scroller&&s.scroll)scroller.scrollTop=s.scroll;
    back=back||!same||Object.keys(s.fields||{}).length>0;
   }else if(s.home){scrollTo(0,s.home);}
   if(back&&typeof notify==='function')notify('Vous reprenez là où vous en étiez.');
  }catch(err){}
  finally{paused=false;save();}
  return back;
 }
 return {save,restore,pickCompany,forget:()=>{paused=true;write(null);}};
})();
window.aiaResume=aiaResume;
