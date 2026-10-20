'use strict';
// Lecteur de notifications (user request 2026-10-20, « Mode lecteur », on by default, switch in the account menu).
// Home middle: the treasury card stays as it is while nothing is being read. Under it, at most 5 small cards
// (iPhone notification style, sorted like the server queue: importance then date) in their own scroll box, so
// the function grid never moves lower than 5 cards; the rest waits hidden below with a counter. Sliding a card
// up "magnetises" it into the reader: the treasury card is replaced, at the same height, by the essentials of
// that action and its own finishing buttons. Sliding back to the top shows the treasury again.
// Nothing to do: one single replacement card (the routine priority) keeps the middle filled.
// Mode off (or the tests that set localStorage aia-reader=off): the classic action cards, unchanged.
const homeReader=(()=>{
 const KEY='aia-reader',P=72,MAX=5;
 const enabled=()=>{try{return localStorage.getItem(KEY)!=='off';}catch{return true;}};
 const doneKey=()=>'aia-reader-done-'+(company?.id||0)+'-'+new Date().toISOString().slice(0,10);
 const doneSet=()=>{try{return new Set(JSON.parse(sessionStorage.getItem(doneKey())||'[]'));}catch{return new Set();}};
 const markDone=key=>{const s=doneSet();s.add(key);try{sessionStorage.setItem(doneKey(),JSON.stringify([...s]));}catch{}};
 let view={cards:[],focus:-1,host:null,cid:null,treasuryH:0,keepKey:null,busy:false};

 // Short verbs on the buttons: the reader above already says what the action is about.
 const verbs={quote:'Vérifier',client:'Vérifier',document:'Vérifier',email:'Relire',social:'Valider',task:'Ouvrir',activity:'Traiter','activity-new':'Créer',lead:'Ouvrir',prospect:'Suivre',equipment:'Contrôler',material:'Contrôler',risk:'Contrôler'};
 const moduleOf=c=>(typeof priorityModules!=='undefined'&&priorityModules[c.action?.type])||'requests';
 const money=c=>{const m=String((c.home_detail||'')+' '+c.title).match(/\d[\d   ]*,\d{2}\s?€/);return m?m[0].trim():'';};
 const sign=c=>c.action?.type==='quote'?{s:'+',word:'à recevoir',cls:'is-in'}:null;
 function copy(c){
  const base=typeof homePriorityCopy==='function'?homePriorityCopy(c):{title:c.title,description:c.description||''};
  const friendly=typeof priorityFriendly==='function'?priorityFriendly:x=>x;
  const amount=money(c);
  let detail=friendly(base.description||'');
  if(amount)detail=detail.replace(amount,'').replace(/^\s*·\s*|\s*·\s*$/g,'').replace(/\s·\s·\s/g,' · ');
  return {title:base.title.replace(/,\s*\d[\d   ]*,\d{2}\s?€\s*:?/,'').trim(),detail:detail.trim(),amount};
 }
 function presentation(c){return typeof priorityPresentation==='function'?priorityPresentation(c):{state:'neutral',label:'À faire'};}
 function buttons(c){
  const inline=typeof inlineActions!=='undefined'&&inlineActions.has(c)?inlineActions.buttons(c):[];
  const list=inline.map((b,i)=>({label:b.label,kind:i?'second':'main',run:()=>finish(c,b)}));
  list.push({label:inline.length?'Détail':(verbs[c.action?.type]||'Ouvrir'),kind:inline.length?'second':'main',run:()=>openAction(c)});
  if(!c.fallback&&!c.example)list.push({label:'Masquer',kind:'quiet',run:()=>dismiss(c)});
  return list;
 }
 async function openAction(c){
  const module=moduleOf(c);
  if(typeof moduleFocusFromPriority==='function'&&!c.fallback&&!c.example&&await moduleFocusFromPriority(module,()=>openPriorityAction(c)))return;
  return openPriorityAction(c);
 }
 async function finish(c,b){
  if(view.busy)return;view.busy=true;
  const card=view.host?.querySelector('.home-reader');card?.querySelectorAll('button').forEach(x=>x.disabled=true);
  try{
   await b.run();markDone(c.key);notify(b.done);
   if(card){const acts=card.querySelector('.reader-actions');if(acts)acts.innerHTML=`<p class="reader-done">✓ ${clean(b.done)}</p>`;}
   view.keepKey=null;setTimeout(()=>{view.busy=false;renderPriorities().catch(()=>{});},650);
  }catch(err){view.busy=false;notify(err.message);card?.querySelectorAll('button').forEach(x=>x.disabled=false);}
 }
 async function dismiss(c){
  if(view.busy)return;view.busy=true;
  try{await api(`/api/companies/${view.cid}/priorities/dismiss`,{method:'POST',body:JSON.stringify({key:c.key})});markDone(c.key);notify('Masquée. Elle ne reviendra plus.');view.keepKey=null;await renderPriorities();}
  catch(err){notify(err.message);}finally{view.busy=false;}
 }

 function counter(){
  const done=doneSet().size,left=view.cards.length;
  return `<span class="reader-count" aria-live="polite"><b>${left}</b> à traiter${done?` · <span class="reader-ok">${done} traité${done>1?'s':''}</span>`:''}</span>`;
 }
 function small(c,i){
  const p=presentation(c),cp=copy(c),key=moduleOf(c);
  return `<button type="button" class="reader-item state-${p.state}" data-reader-item="${i}" aria-label="${clean(cp.title)} · ${clean(p.label)}"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="reader-item-copy"><strong>${clean(cp.title)}</strong><small><span class="reader-state">${clean(p.label)}</span>${cp.amount?' · '+clean(cp.amount):''}${cp.detail?' · '+clean(cp.detail):''}</small></span></button>`;
 }
 function readerMarkup(c){
  const p=presentation(c),cp=copy(c),key=moduleOf(c),sg=sign(c),btns=buttons(c);
  const pos=view.focus+1,total=view.cards.length;
  return `<div class="reader-head"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="reader-state state-${p.state}">${clean(p.label)}</span><span class="reader-pos">${pos} / ${total}</span><span class="reader-tools"><button type="button" class="reader-icon" data-reader-speak aria-label="Écouter l’essentiel" title="Écouter">${typeof speakerIcon!=='undefined'?speakerIcon:'🔊'}</button><button type="button" class="reader-icon" data-reader-open aria-label="Ouvrir le détail" title="Ouvrir le détail"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button type="button" class="reader-icon" data-reader-back aria-label="Revenir à la trésorerie" title="Trésorerie"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></span></div>
  <div class="reader-title"><strong>${clean(cp.title)}</strong>${cp.amount?`<span class="reader-amount ${sg?sg.cls:''}">${sg?sg.s:''}${clean(cp.amount)}${sg?`<small>${sg.word}</small>`:''}</span>`:''}</div>
  <div class="reader-body-wrap"><div class="reader-body" tabindex="0">${cp.detail?clean(cp.detail):'<span class="reader-muted">Aucun détail supplémentaire.</span>'}</div><div class="reader-rail" aria-hidden="true"><i></i></div></div>
  <div class="reader-actions">${btns.map((b,i)=>`<button type="button" class="reader-btn is-${b.kind}" data-reader-run="${i}">${clean(b.label)}</button>`).join('')}</div>`;
 }

 function syncRail(card){
  const body=card?.querySelector('.reader-body'),wrap=card?.querySelector('.reader-body-wrap');if(!body||!wrap)return;
  const over=body.scrollHeight-body.clientHeight>2;wrap.classList.toggle('is-long',over);
  if(!over)return;const thumb=wrap.querySelector('.reader-rail i'),h=Math.max(.25,body.clientHeight/body.scrollHeight);
  thumb.style.height=(h*100)+'%';thumb.style.top=((body.scrollTop/(body.scrollHeight-body.clientHeight))*(1-h)*100)+'%';
 }
 function wireRail(card){
  const body=card.querySelector('.reader-body'),rail=card.querySelector('.reader-rail');let drag=false;
  body.addEventListener('scroll',()=>syncRail(card),{passive:true});
  const to=e=>{const r=rail.getBoundingClientRect(),t=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height));body.scrollTop=t*(body.scrollHeight-body.clientHeight);};
  rail.addEventListener('pointerdown',e=>{drag=true;try{rail.setPointerCapture(e.pointerId);}catch{}to(e);});
  rail.addEventListener('pointermove',e=>{if(drag)to(e);});
  ['pointerup','pointercancel'].forEach(t=>rail.addEventListener(t,()=>{drag=false;}));
  requestAnimationFrame(()=>syncRail(card));
 }
 function showReader(){
  const home=document.querySelector('#content .reference-home'),host=view.host;if(!home||!host)return;
  let card=host.querySelector('.home-reader');
  if(view.focus<0){home.classList.remove('reader-active');if(card)card.hidden=true;host.querySelectorAll('.reader-item').forEach(el=>el.classList.remove('is-read'));hint();return;}
  if(!home.classList.contains('reader-active')){const t=document.querySelector('#homeTreasury .home-treasury');view.treasuryH=t?t.offsetHeight:view.treasuryH;}
  const c=view.cards[view.focus];view.keepKey=c.key;
  card.hidden=false;card.style.height=Math.max(view.treasuryH||0,196)+'px';
  card.className='home-reader state-'+presentation(c).state;
  card.innerHTML=readerMarkup(c);home.classList.add('reader-active');
  card.classList.remove('is-in');void card.offsetWidth;card.classList.add('is-in');
  const btns=buttons(c);
  card.querySelectorAll('[data-reader-run]').forEach(b=>b.onclick=()=>btns[Number(b.dataset.readerRun)].run());
  card.querySelector('[data-reader-open]').onclick=()=>openAction(c);
  card.querySelector('[data-reader-back]').onclick=()=>host.querySelector('.reader-list')?.scrollTo({top:0,behavior:'smooth'});
  const speak=card.querySelector('[data-reader-speak]'),cp=copy(c);
  speak.onclick=()=>{if(typeof readAloud==='function')readAloud([cp.title,presentation(c).label,cp.amount,cp.detail].filter(Boolean).join('. '),speak);};
  wireRail(card);
  host.querySelectorAll('.reader-item').forEach((el,i)=>el.classList.toggle('is-read',i<=view.focus));
  hint();
 }
 function hint(){
  const el=view.host?.querySelector('.reader-hint');if(!el)return;
  const n=view.cards.length,below=n-(view.focus+1)-MAX;
  el.textContent=view.focus>=n-1?'Dernier message':(below>0?`${below} autre${below>1?'s':''} en dessous · `:'')+'↑ Glissez pour lire';
 }
 function goTo(i){view.host?.querySelector('.reader-list')?.scrollTo({top:(i+1)*P,behavior:'smooth'});}

 function render(host,cards,actual,cid){
  view.host=host;view.cid=cid;
  const real=actual.filter(c=>!c.example);
  const home=document.querySelector('#content .reference-home');
  // Nothing left: one single replacement card keeps the middle filled (the routine/first card), no reader.
  if(!real.length){home?.classList.remove('reader-active');view.cards=[];view.focus=-1;host.classList.remove('reader-host');return false;}
  const prevKey=view.keepKey,prevFocus=view.focus;
  view.cards=real;
  const n=real.length,h=Math.min(n,MAX)*P-8;
  host.classList.add('reader-host');
  host.innerHTML=`<h2 class="home-section-title">À faire maintenant</h2><article class="home-reader" hidden aria-live="polite"></article><div class="reader-queue"><div class="reader-bar">${counter()}<span class="reader-hint"></span></div><div class="reader-list${n>MAX?' has-more':''}" style="height:${h}px" aria-label="Messages à traiter">${real.map(small).join('')}<div class="reader-end" style="height:${h}px"><span>✓ Fin de la liste</span><button type="button" class="reader-btn is-second" data-reader-top>Revenir à la trésorerie</button></div></div></div>`;
  const list=host.querySelector('.reader-list');
  host.querySelector('[data-reader-top]').onclick=()=>list.scrollTo({top:0,behavior:'smooth'});
  host.querySelectorAll('[data-reader-item]').forEach(b=>b.onclick=()=>goTo(Number(b.dataset.readerItem)));
  // Keep the place after a refresh: same card if it is still there, otherwise the one that took its place.
  let focus=-1;
  if(prevFocus>=0){const k=prevKey?real.findIndex(c=>c.key===prevKey):-1;focus=k>=0?k:Math.min(prevFocus,n-1);}
  view.focus=focus;
  list.scrollTop=(focus+1)*P;
  showReader();
  let raf=0;
  list.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
   const f=Math.min(n-1,Math.round(list.scrollTop/P)-1);
   if(f!==view.focus){view.focus=f;showReader();}
  });},{passive:true});
  return true;
 }
 function setEnabled(on){try{localStorage.setItem(KEY,on?'on':'off');}catch{}view.focus=-1;view.keepKey=null;syncMenu();if(typeof renderPriorities==='function')renderPriorities().catch(()=>{});}
 function syncMenu(){
  const panel=document.querySelector('.account-panel');if(!panel)return;
  let b=panel.querySelector('#accountReader');
  if(!b){b=document.createElement('button');b.id='accountReader';b.type='button';b.className='btn small';b.setAttribute('role','switch');b.onclick=()=>setEnabled(!enabled());panel.querySelector('#accountWallpaper')?.after(b)||panel.append(b);}
  b.setAttribute('aria-checked',String(enabled()));b.textContent='Mode lecteur : '+(enabled()?'activé':'désactivé');
 }
 document.addEventListener('DOMContentLoaded',syncMenu);if(document.readyState!=='loading')syncMenu();
 return {enabled,render,setEnabled};
})();
window.homeReader=homeReader;
