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
 const KEY='aia-reader',MAX=5,MIN_H=300;
 // Card pitch (height + gap): 64 + 8 normally; on the iPhone-style home, sized to fill the room (home-pages.js).
 const ios=()=>document.documentElement.classList.contains('home-ios');
 const pitch=()=>ios()?(Number(document.body.dataset.readerPitch)||54):72;
 // Accueil façon iPhone (home-pages.js): as many small cards as fit on the one screen, at most 5.
 // iPhone-style home: 4 small cards with the treasury (3 if the screen is too short — home-pages.js sets
 // body[data-reader-slots]), 2 fewer while reading; the rest waits in the stack under the functions.
 const cap=()=>ios()?Math.max(1,Math.min(5,Number(document.body.dataset.readerSlots)||4)):MAX;
 const enabled=()=>{try{return localStorage.getItem(KEY)!=='off';}catch{return true;}};
 const doneKey=()=>'aia-reader-done-'+(company?.id||0)+'-'+new Date().toISOString().slice(0,10);
 const doneSet=()=>{try{return new Set(JSON.parse(sessionStorage.getItem(doneKey())||'[]'));}catch{return new Set();}};
 const markDone=key=>{const s=doneSet();s.add(key);try{sessionStorage.setItem(doneKey(),JSON.stringify([...s]));}catch{}};
 let view={cards:[],focus:-1,host:null,cid:null,treasuryH:0,keepKey:null,busy:false,full:false,editing:null,draft:{}};
 // Messages d'essai (reader-samples.js): off by default, switch in the account menu, buttons simulated.
 const SAMPLES='aia-reader-samples';
 const samplesOn=()=>{try{return localStorage.getItem(SAMPLES)==='on';}catch{return false;}};
 const samples=()=>{if(!samplesOn()||!Array.isArray(window.readerSamples))return [];const done=doneSet();return window.readerSamples.filter(c=>!done.has(c.key)).map(c=>({...c,sample:true}));};

 // Short verbs on the buttons: the reader above already says what the action is about.
 const verbs={quote:'Vérifier',client:'Vérifier',document:'Vérifier',email:'Relire',social:'Valider',task:'Ouvrir',activity:'Traiter','activity-new':'Créer',lead:'Ouvrir',prospect:'Suivre',equipment:'Contrôler',material:'Contrôler',risk:'Contrôler'};
 const moduleOf=c=>c.module||(typeof priorityModules!=='undefined'&&priorityModules[c.action?.type])||'requests';
 const money=c=>{const m=String((c.home_detail||'')+' '+c.title).match(/\d[\d   ]*,\d{2}\s?€/);return m?m[0].trim():'';};
 const sign=c=>c.sample?(c.sign==='+'?{s:'+',word:'à recevoir',cls:'is-in'}:c.sign==='−'?{s:'−',word:'à payer',cls:'is-out'}:null):c.action?.type==='quote'?{s:'+',word:'à recevoir',cls:'is-in'}:null;
 function copy(c){
  if(c.sample)return {title:c.title,detail:c.body||'',amount:c.amount||''};
  const base=typeof homePriorityCopy==='function'?homePriorityCopy(c):{title:c.title,description:c.description||''};
  const friendly=typeof priorityFriendly==='function'?priorityFriendly:x=>x;
  const amount=money(c);
  let detail=friendly(base.description||'');
  if(amount)detail=detail.replace(amount,'').replace(/^\s*·\s*|\s*·\s*$/g,'').replace(/\s·\s·\s/g,' · ');
  return {title:base.title.replace(/,\s*\d[\d   ]*,\d{2}\s?€\s*:?/,'').trim(),detail:detail.trim(),amount};
 }
 // Cards done this session stay in the list, before the pending ones (they can be slid back into the reader),
 // marked « ✓ Traité » with their buttons greyed out, so they are never taken for a new message.
 const doneCards=[];
 function keepDone(c,label){if(!c||doneCards.some(d=>d.c.key===c.key))return;const {_done,...plain}=c;doneCards.push({c:plain,label});}
 // After an action the next pending card comes up.
 function nextKey(c){const i=view.cards.findIndex(x=>x.key===c.key);return view.cards.slice(i+1).find(x=>!x._done)?.key||null;}
 function presentation(c){return typeof priorityPresentation==='function'?priorityPresentation(c):{state:'neutral',label:'À faire'};}
 function buttons(c){
  if(c._done)return [{label:'✓ '+c._done,kind:'done',run:()=>{}}];
  if(c.sample)return sampleButtons(c);
  const inline=typeof inlineActions!=='undefined'&&inlineActions.has(c)?inlineActions.buttons(c):[];
  const list=inline.map((b,i)=>({label:b.label,kind:i?'second':'main',run:()=>finish(c,b)}));
  list.push({label:inline.length?'Détail':(verbs[c.action?.type]||'Ouvrir'),kind:inline.length?'second':'main',run:()=>openAction(c)});
  return list;
 }
 function sampleButtons(c){
  if(view.editing===c.key)return [{label:'Annuler',kind:'second',run:()=>{view.editing=null;showReader();}},{label:'Enregistrer et envoyer',kind:'main',run:()=>sampleDone(c,'Modifié et envoyé'+(view.draft.amount?' · '+view.draft.amount:'')+(view.draft.date?' · '+view.draft.date:''))}];
  return (c.actions||[]).map((a,i)=>({label:a.l,kind:a.t==='p'?'main':a.t==='d'?'danger':'second',run:()=>{
   if(a.t==='e'){view.editing=c.key;view.full=false;view.draft={amount:c.edit?.amount||c.amount||'',date:c.edit?.date||'',note:''};showReader();return;}
   if(a.t==='r'){const url='mailto:'+(c.mail||'')+'?subject='+encodeURIComponent('Re : '+c.state_label+' — '+c.title);try{window.open(url,'_blank');}catch{}notify('Ouverture de votre messagerie… (essai : rien n’est envoyé)');return;}
   sampleDone(c,a.d||a.l);
  }}));
 }
 function sampleDone(c,text){
  if(view.busy)return;view.busy=true;markDone(c.key);notify(text+' (essai)');keepDone(c,text);const nk=nextKey(c);
  const card=view.host?.querySelector('.home-reader');
  if(card){card.style.height=readerHeight()+'px';card.classList.remove('is-editing');const acts=card.querySelector('.reader-actions');if(acts)acts.innerHTML=`<p class="reader-done">✓ ${clean(text)}</p>`;}
  view.editing=null;view.keepKey=nk;setTimeout(()=>{view.busy=false;renderPriorities().catch(()=>{});},650);
 }
 async function openAction(c){
  if(c.sample){view.full=!view.full;view.editing=null;showReader();return;}
  const module=moduleOf(c);
  if(typeof moduleFocusFromPriority==='function'&&!c.fallback&&!c.example&&await moduleFocusFromPriority(module,()=>openPriorityAction(c)))return;
  return openPriorityAction(c);
 }
 async function finish(c,b){
  if(view.busy)return;view.busy=true;
  const card=view.host?.querySelector('.home-reader');card?.querySelectorAll('button').forEach(x=>x.disabled=true);
  try{
   await b.run();markDone(c.key);notify(b.done);keepDone(c,b.done);const nk=nextKey(c);
   if(card){const acts=card.querySelector('.reader-actions');if(acts)acts.innerHTML=`<p class="reader-done">✓ ${clean(b.done)}</p>`;}
   view.keepKey=nk;setTimeout(()=>{view.busy=false;renderPriorities().catch(()=>{});},650);
  }catch(err){view.busy=false;notify(err.message);card?.querySelectorAll('button').forEach(x=>x.disabled=false);}
 }
 async function dismiss(c){
  if(view.busy)return;view.busy=true;
  try{await api(`/api/companies/${view.cid}/priorities/dismiss`,{method:'POST',body:JSON.stringify({key:c.key})});markDone(c.key);notify('Masquée. Elle ne reviendra plus.');keepDone(c,'Masquée');view.keepKey=nextKey(c);await renderPriorities();}
  catch(err){notify(err.message);}finally{view.busy=false;}
 }

 function counter(){
  const left=view.cards.filter(c=>!c._done).length,done=Math.max(doneSet().size,doneCards.length);
  return `<span class="reader-count" aria-live="polite"><b>${left}</b> à traiter${done?` · <span class="reader-ok">${done} traité${done>1?'s':''}</span>`:''}</span>`;
 }
 // Money in the small cards follows the same colour code as the reader: + green when it comes in, − red when it goes out.
 function moneyChip(c,amount){const sg=sign(c);return sg?`<b class="reader-money ${sg.cls}">${sg.s}${clean(amount)}</b>`:clean(amount);}
 function small(c,i){
  const p=presentation(c),cp=copy(c),key=moduleOf(c);
  if(c._done)return `<button type="button" class="reader-item is-done" data-reader-item="${i}" aria-label="${clean(cp.title)} · traité"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="reader-item-copy"><strong>${clean(cp.title)}</strong><small><span class="reader-done-tag">✓ Traité</span> · ${clean(c._done)}</small></span></button>`;
  return `<button type="button" class="reader-item state-${p.state}" data-reader-item="${i}" aria-label="${clean(cp.title)} · ${clean(p.label)}"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="reader-item-copy"><strong>${c.sample?'<span class="reader-tag">Essai</span>':''}${clean(cp.title)}</strong><small><span class="reader-state">${clean(p.label)}</span>${cp.amount?' · '+moneyChip(c,cp.amount):''}${c.source?' · '+clean(c.source):''}${cp.detail?' · '+clean(cp.detail):''}</small></span></button>`;
 }
 function readerMarkup(c){
  const p=presentation(c),cp=copy(c),key=moduleOf(c),sg=sign(c),btns=buttons(c);
  const pos=view.focus+1,total=view.cards.length;
  const spk=`<button type="button" class="reader-icon" data-reader-speak aria-label="Écouter l’essentiel" title="Écouter">${typeof speakerIcon!=='undefined'?speakerIcon:'🔊'}</button>`;
  // iPhone (22/10, user): no tool row; the card sits at the very top and carries the speaker.
  return `${ios()?'':`<div class="reader-head"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="reader-state state-${p.state}">${clean(p.label)}</span><span class="reader-pos">${pos}/${total}</span><span class="reader-tools"><button type="button" class="reader-icon" data-reader-speak aria-label="Écouter l’essentiel" title="Écouter">${typeof speakerIcon!=='undefined'?speakerIcon:'🔊'}</button><button type="button" class="reader-icon" data-reader-open aria-label="Ouvrir le détail" title="Ouvrir le détail"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button type="button" class="reader-icon" data-reader-hide aria-label="Masquer ce message" title="Masquer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button type="button" class="reader-icon" data-reader-back aria-label="Revenir à la trésorerie" title="Trésorerie"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></span></div>`}
  ${ios()?`<div class="reader-card">${small(c,view.focus).replace(/ data-reader-item="\d+"/,'').replace(/^<button type="button"/,'<div').replace(/<\/button>$/,spk+'</div>')}</div>`:''}
  <div class="reader-title"><strong>${c.sample?'<span class="reader-tag">Essai</span>':''}${clean(cp.title)}</strong>${cp.amount?`<span class="reader-amount ${sg?sg.cls:''}">${sg?sg.s:''}${clean(cp.amount)}${sg?`<small>${sg.word}</small>`:''}</span>`:''}</div>
  ${facts(c)}<div class="reader-body-wrap"><div class="reader-body" tabindex="0">${bodyMarkup(c,cp)}</div><div class="reader-rail" aria-hidden="true"><i></i></div></div>
  <div class="reader-actions">${btns.map((b,i)=>`<button type="button" class="reader-btn is-${b.kind}" data-reader-run="${i}"${b.kind==='done'?' disabled aria-disabled="true"':''}>${clean(b.label)}</button>`).join('')}</div>`;
 }

 function facts(c){
  const src=c.source&&!ios()?`<span class="reader-fact is-source">${clean(c.source)}${c.time?' · '+clean(c.time):''}</span>`:'';
  const f=src+(c.facts||[]).map(([k,v])=>`<span class="reader-fact"><span>${clean(k)}</span> <b>${clean(v)}</b></span>`).join('');
  return c.must||f?`<div class="reader-facts">${c.must?'<span class="reader-fact is-must">À lire en entier</span>':''}${f}</div>`:'';
 }
 function bodyMarkup(c,cp){
  // Attachments (22/10, step 2): files are kept apart from the text — only « 📎 N pièces jointes » on top;
  // small thumbnails under the cards open the full-screen viewer (static/image-viewer.js).
  if(c.files?.length&&view.editing!==c.key&&!(c.sample&&view.full)){const n=c.files.length;
   const row=(k,v)=>v?`<div><dt>${k}</dt><dd>${clean(v)}</dd></div>`:'';
   // Shown like an e-mail (22/10): header, the full text, then the attachment chosen under the reader.
   return `<div class="reader-mail-files">📎 ${n} pièce${n>1?'s':''} jointe${n>1?'s':''} · en bas</div><dl class="reader-mail">${row('De',c.from||c.source)}${row('À',c.to)}${row('Objet',c.subject||cp.title)}${row('Reçu',c.date||c.time)}</dl><div class="reader-mail-text">${clean(c.raw||cp.detail||'')}</div>`;}
  if(view.editing===c.key){const d=view.draft;return `<div class="reader-edit">${c.edit&&('amount' in c.edit||c.amount)?`<label>Montant / quantité<input data-draft="amount" value="${clean(d.amount)}" inputmode="decimal" autocomplete="off"></label>`:''}${c.edit&&'date' in c.edit?`<label>Date<input data-draft="date" value="${clean(d.date)}" autocomplete="off"></label>`:''}<label>Message joint (facultatif)<textarea data-draft="note" rows="2" placeholder="Ex. : livraison possible le 28 plutôt que le 23">${clean(d.note)}</textarea></label></div>`;}
  if(c.sample&&view.full)return `<span class="reader-origin">Message d’origine</span>${clean(c.raw||c.body||'')}`;
  return cp.detail?clean(cp.detail):'<span class="reader-muted">Aucun détail supplémentaire.</span>';
 }
 const FILE_ICON={pdf:'PDF',doc:'DOC',xls:'XLS',other:'FICHIER'};
 function fileThumb(f,i){
  const inner=f.type==='image'?`<img src="${clean(f.src)}" alt="">`:`<span class="reader-file-kind">${FILE_ICON[f.type]||FILE_ICON.other}</span>`;
  return `<button type="button" class="reader-thumb" data-file="${i}" aria-label="Voir en grand : ${clean(f.name)}">${inner}</button>`;
 }
 // Thumbnails carousel laid over the cards box (4 visible, swipe sideways for the others); a vertical swipe on it
 // still moves to the next / previous message.
 function syncFiles(){
  const host=view.host,queue=host?.querySelector('.reader-queue'),list=host?.querySelector('.reader-list');if(!queue||!list)return;
  const c=view.focus>=0?view.cards[view.focus]:null;let box=queue.querySelector('.reader-files');
  if(!c||!c.files?.length||!ios()){box?.remove();queue.classList.remove('has-files');return;}
  if(!box){box=document.createElement('div');box.className='reader-files';box.setAttribute('role','group');box.setAttribute('aria-label','Pièces jointes');queue.append(box);
   box.addEventListener('click',e=>{const b=e.target.closest('[data-file]'),cur=view.focus>=0?view.cards[view.focus]:null;if(b&&cur?.files?.length)window.imageViewer?.open(cur.files,Number(b.dataset.file));});
   let y0=null,x0=0;box.addEventListener('touchstart',e=>{y0=e.touches[0].clientY;x0=e.touches[0].clientX;},{passive:true});
   box.addEventListener('touchend',e=>{if(y0===null)return;const dy=e.changedTouches[0].clientY-y0,dx=e.changedTouches[0].clientX-x0;y0=null;if(Math.abs(dy)>40&&Math.abs(dy)>Math.abs(dx)*1.5)goTo(view.focus+(dy<0?1:-1));},{passive:true});}
  if(box.dataset.card!==c.key){box.dataset.card=c.key;
   box.innerHTML=`<div class="reader-thumbs">${c.files.map((f,i)=>fileThumb(f,i)).join('')}</div>`;} // the count is in the reader (« 📎 N pièces jointes »)
  queue.classList.add('has-files');box.style.top=(list.offsetTop+list.offsetHeight+6)+'px';box.style.height='';
  // Measured after drawing: if the thumbnails would reach the function pages, drop as many cards as needed.
  const pg=document.querySelector('#content .home-pages');
  if(pg){const over=box.getBoundingClientRect().bottom-(pg.getBoundingClientRect().top-4);
   if(over>0){const p=pitch(),g=parseFloat(getComputedStyle(document.body).getPropertyValue('--reader-gap'))||6,n=Math.max(0,Math.round((list.offsetHeight+g)/p)-Math.ceil(over/p));
    list.style.height=Math.max(0,n*p-g)+'px';const end=list.querySelector('.reader-end');if(end)end.style.height=list.style.height;box.style.top=(list.offsetTop+list.offsetHeight+6)+'px';}}
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
  if(view.focus<0&&doneCards.length&&!view.busy){doneCards.length=0;view.keepKey=null;setTimeout(()=>renderPriorities().catch(()=>{}),0);}
  if(view.focus<0){view.host?.querySelector('.reader-files')?.remove();view.host?.querySelector('.reader-queue')?.classList.remove('has-files');if(typeof homeActions!=='undefined')homeActions.hide();home.classList.remove('reader-active');if(card)card.hidden=true;host.querySelectorAll('.reader-item').forEach(el=>el.classList.remove('is-read'));fitList();hint();return;}
  // The reader is always sized on the FOLDED treasury (21/10): an unfolded treasury never makes it taller.
  if(!home.classList.contains('reader-active')){const t=document.querySelector('#homeTreasury .home-treasury'),folded=Number(document.body.dataset.treasuryFolded)||0;view.treasuryH=t&&t.classList.contains('is-folded')?t.offsetHeight:(folded||(t?t.offsetHeight:view.treasuryH));}
  const c=view.cards[view.focus];if(view.keepKey!==c.key){view.full=false;view.editing=null;}view.keepKey=c.key;
  const editing=view.editing===c.key;
  card.hidden=false;card.style.height=editing?'auto':readerHeight()+'px';
  card.className='home-reader state-'+presentation(c).state+(editing?' is-editing':'')+(view.full&&c.sample?' is-full':'')+(c._done?' is-done':'');
  card.innerHTML=readerMarkup(c);home.classList.add('reader-active');
  if(typeof homeTop!=='undefined')card.dataset.date=homeTop.dateLabel();
  card.classList.remove('is-in');void card.offsetWidth;card.classList.add('is-in');
  const btns=buttons(c);
  card.querySelectorAll('[data-reader-run]').forEach(b=>b.onclick=()=>btns[Number(b.dataset.readerRun)].run());
  // iPhone home (21/10): the actions move into the first row of the function grid; the card keeps the rest.
  const placed=ios()&&typeof homeActions!=='undefined'?homeActions.show(btns):0;
  card.querySelectorAll('[data-reader-run]').forEach(b=>{if(Number(b.dataset.readerRun)<placed)b.hidden=true;});
  card.classList.toggle('actions-out',placed>0&&placed>=btns.length);
  (card.querySelector('[data-reader-open]')||{}).onclick=()=>openAction(c);
  (card.querySelector('[data-reader-hide]')||{}).onclick=()=>c.sample?sampleDone(c,'Masqué'):dismiss(c);
  (card.querySelector('[data-reader-back]')||{}).onclick=()=>host.querySelector('.reader-list')?.scrollTo({top:0,behavior:'smooth'});
  const speak=card.querySelector('[data-reader-speak]'),cp=copy(c);
  speak.onclick=()=>{if(typeof readAloud==='function')readAloud([presentation(c).label,cp.title,(sign(c)?.s==='−'?'à payer ':sign(c)?'à recevoir ':'')+cp.amount,cp.detail].filter(Boolean).join('. '),speak);};
  card.querySelectorAll('[data-draft]').forEach(f=>f.oninput=()=>{view.draft[f.dataset.draft]=f.value;});
  card.querySelector('[data-draft]')?.focus({preventScroll:true});
  wireRail(card);
  host.querySelectorAll('.reader-list .reader-item').forEach((el,i)=>el.classList.toggle('is-read',i<=view.focus));
  fitList();
  syncFiles();
  hint();
 }
 // The reader may be taller than the treasury (to show 3–4 lines of text, or while editing): the list gets
 // shorter by the same amount, so the function grid below never moves.
 // iPhone-style home: the reader takes the place of the treasury and of two small cards, so 2 stay visible and
 // nothing below moves; elsewhere it is at least 300px and the list gives up the difference.
 function readerHeight(){return ios()?(view.treasuryH||0)+(cap()-Math.max(1,cap()-2))*pitch():Math.max(view.treasuryH||0,MIN_H);}
 // While reading, the box keeps its size (21/10) down to the last message: the end of the list is never cut.
 function fitList(){
  const list=view.host?.querySelector('.reader-list'),card=view.host?.querySelector('.home-reader');if(!list)return;
  const base=Number(list.dataset.base)||list.offsetHeight;list.dataset.base=base;
  if(ios()){const reading=view.focus>=0&&card&&!card.hidden;
   // While reading (22/10): as many cards as fit between the reader and the function pages (no empty room).
   let room=0;if(reading){const pg=document.querySelector('#content .home-pages'),lt=list.getBoundingClientRect().top;if(pg)room=pg.getBoundingClientRect().top-lt-8;
    // A message with attachments keeps the cards and puts its thumbnails under them: one row of 4 + names.
    const cur=view.cards[view.focus];if(cur?.files?.length)room-=46+6;}
   const n=card?.classList.contains('is-editing')?0:reading?Math.max(1,room>0?Math.floor((room+(parseFloat(getComputedStyle(document.body).getPropertyValue('--reader-gap'))||6))/pitch()):cap()-2):Math.min(view.cards.length,cap());list.style.height=Math.max(0,n*pitch()-(parseFloat(getComputedStyle(document.body).getPropertyValue('--reader-gap'))||6))+'px';const end=list.querySelector('.reader-end');if(end)end.style.height=list.style.height;return;} // the end block matches the box, so sliding back from the last card works at once
  const extra=view.focus>=0&&card&&!card.hidden?Math.max(0,card.offsetHeight-(view.treasuryH||0)):0;
  list.style.height=Math.max(Math.min(base,pitch()-8),base-extra)+'px';
 }
 function hint(){
  const el=view.host?.querySelector('.reader-hint');if(!el)return;
  const n=view.cards.length,below=n-(view.focus+1)-cap();
  el.textContent=view.focus>=n-1?'Dernier message · ↓ Glissez pour revoir':(below>0?`${below} autre${below>1?'s':''} en dessous · `:'')+'↑ Glissez pour lire';
 }
 function goTo(i){view.host?.querySelector('.reader-list')?.scrollTo({top:(i+1)*pitch(),behavior:'smooth'});}

 function render(host,cards,actual,cid){
  view.host=host;view.cid=cid;
  const pending=[...samples(),...actual.filter(c=>!c.example)].filter(c=>!doneCards.some(d=>d.c.key===c.key));
  const real=pending.length||doneCards.length?[...doneCards.map(d=>({...d.c,_done:d.label})),...pending]:[];
  const home=document.querySelector('#content .reference-home');
  // Nothing left: one single replacement card keeps the middle filled (the routine/first card), no reader.
  if(!real.length){if(typeof homeActions!=='undefined')homeActions.hide();home?.classList.remove('reader-active');view.cards=[];view.focus=-1;host.classList.remove('reader-host');return false;}
  const prevKey=view.keepKey,prevFocus=view.focus;
  view.cards=real;
  const n=real.length,h=Math.min(n,cap())*pitch()-8;
  host.classList.add('reader-host');
  host.innerHTML=`<h2 class="home-section-title">À faire maintenant</h2><article class="home-reader" hidden aria-live="polite"></article><div class="reader-queue"><div class="reader-bar">${counter()}<span class="reader-hint"></span></div><div class="reader-list${n>cap()?' has-more':''}" style="height:${h}px" aria-label="Messages à traiter">${real.map(small).join('')}<div class="reader-end" style="height:${h}px"><button type="button" class="reader-end-btn" data-reader-top aria-label="Fin de la liste · revenir à l’accueil">✓ Fin de la liste <span aria-hidden="true">· Accueil ↑</span></button></div></div></div>`;
  const list=host.querySelector('.reader-list');
  // The whole end block (button and the empty room under it) goes back to the home (21/10).
  host.querySelector('.reader-end').onclick=()=>list.scrollTo({top:0,behavior:'smooth'});
  host.querySelectorAll('[data-reader-item]').forEach(b=>b.onclick=()=>goTo(Number(b.dataset.readerItem)));
  // Keep the place after a refresh: same card if it is still there, otherwise the one that took its place.
  let focus=-1;
  if(prevFocus>=0){const k=prevKey?real.findIndex(c=>c.key===prevKey):-1;focus=k>=0?k:Math.min(prevFocus,n-1);}
  view.focus=focus;
  list.scrollTop=(focus+1)*pitch();
  showReader();
  let raf=0;
  list.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
   const f=Math.min(n-1,Math.round(list.scrollTop/pitch())-1);
   if(f!==view.focus){view.focus=f;showReader();}
  });},{passive:true});
  return true;
 }
 function setEnabled(on){try{localStorage.setItem(KEY,on?'on':'off');}catch{}view.focus=-1;view.keepKey=null;syncMenu();if(typeof renderPriorities==='function')renderPriorities().catch(()=>{});}
 // Switching the test messages on puts them all back (the ones used today are shown again).
 function setSamples(on){
  try{localStorage.setItem(SAMPLES,on?'on':'off');if(on){const s=[...doneSet()].filter(k=>!String(k).startsWith('essai-'));sessionStorage.setItem(doneKey(),JSON.stringify(s));}}catch{}
  view.focus=-1;view.keepKey=null;syncMenu();notify(on?'16 messages d’essai ajoutés au lecteur (rien n’est envoyé).':'Messages d’essai retirés.');
  if(typeof renderPriorities==='function')renderPriorities().catch(()=>{});
 }
 function syncMenu(){
  const panel=document.querySelector('.account-panel');if(!panel)return;
  let b=panel.querySelector('#accountReader');
  if(!b){b=document.createElement('button');b.id='accountReader';b.type='button';b.className='btn small';b.setAttribute('role','switch');b.onclick=()=>setEnabled(!enabled());panel.querySelector('#accountWallpaper')?.after(b)||panel.append(b);}
  b.setAttribute('aria-checked',String(enabled()));b.textContent='Mode lecteur : '+(enabled()?'activé':'désactivé');
  let t=panel.querySelector('#accountReaderSamples');
  if(!t){t=document.createElement('button');t.id='accountReaderSamples';t.type='button';t.className='btn small';t.setAttribute('role','switch');t.onclick=()=>setSamples(!samplesOn());b.after(t);}
  t.hidden=!enabled();t.setAttribute('aria-checked',String(samplesOn()));t.textContent='Messages d’essai : '+(samplesOn()?'affichés':'masqués');
 }
 document.addEventListener('DOMContentLoaded',syncMenu);if(document.readyState!=='loading')syncMenu();
 function readingModules(max){
  if(view.focus<0)return [];const out=[];
  for(let i=view.focus;i<view.cards.length&&out.length<max;i++){const c=view.cards[i];if(c._done&&i!==view.focus)continue;const k=moduleOf(c);if(!out.includes(k))out.push(k);}
  return out;
 }
 return {enabled,render,setEnabled,setSamples,readingModules};
})();
window.homeReader=homeReader;
