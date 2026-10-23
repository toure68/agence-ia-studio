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
 const pitch=()=>ios()?(Number(view.host?.querySelector('.reader-list')?.dataset.pitch)||Number(document.body.dataset.readerPitch)||54):72;
 // iPhone home: up to six cards (home-pages.js measures the screen); the reader reflows the queue below.
 const cap=()=>ios()?Math.max(1,Math.min(6,Number(document.body.dataset.readerSlots)||4)):MAX;
 const enabled=()=>{try{return localStorage.getItem(KEY)!=='off';}catch{return true;}};
 const doneKey=()=>'aia-reader-done-'+(company?.id||0)+'-'+new Date().toISOString().slice(0,10);
 const doneSet=()=>{try{return new Set(JSON.parse(sessionStorage.getItem(doneKey())||'[]'));}catch{return new Set();}};
 const markDone=key=>{const s=doneSet();s.add(key);try{sessionStorage.setItem(doneKey(),JSON.stringify([...s]));}catch{}};
 let view={cards:[],focus:-1,host:null,cid:null,treasuryH:0,keepKey:null,busy:false,full:false,editing:null,draft:{},file:-1};
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
  // 22/10 (user): a tapped thumbnail turns the reader itself into an image reader — only the file, nothing else.
  const f=view.file>=0?c.files?.[view.file]:null;
  if(f)return `<div class="reader-stage" data-reader-stage>${f.type==='image'?`<img class="reader-stage-img" src="${clean(f.src)}" alt="${clean(f.name)}">`:`<div class="reader-stage-doc"${f.src?' data-open="1"':''}><span class="reader-file-kind">${FILE_ICON[f.type]||FILE_ICON.other}</span><strong>${clean(f.name)}</strong>${f.pages?`<span>${f.pages} pages</span>`:''}${f.src?'<span>Touchez pour ouvrir</span>':''}</div>`}</div>`;
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
  // a tap on a small thumbnail under the cards shows that file in the reader itself (image mode, view.file).
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
 function fileOverflow(box){
  const strip=box?.querySelector('.reader-thumbs');if(!strip)return;
  const left=strip.scrollLeft>2,right=strip.scrollWidth-strip.clientWidth-strip.scrollLeft>2;
  box.classList.toggle('can-prev',left);box.classList.toggle('can-next',right);
  for(const [key,on] of [['prev',left],['next',right]]){const button=box.querySelector(`[data-files-${key}]`);button.hidden=!on;}
 }
 // Thumbnails stay in the queue flow, below the cards; a vertical swipe still changes message.
 function syncFiles(){
  const host=view.host,queue=host?.querySelector('.reader-queue'),list=host?.querySelector('.reader-list');if(!queue||!list)return;
  const c=view.focus>=0?view.cards[view.focus]:null;let box=queue.querySelector('.reader-files');
  if(!c||!c.files?.length||!ios()){box?.remove();queue.classList.remove('has-files');return;}
  if(!box){box=document.createElement('div');box.className='reader-files';box.setAttribute('role','group');box.setAttribute('aria-label','Pièces jointes');queue.append(box);
   // Text stays pinned next to the images, even when the carousel is scrolled to its end.
   box.addEventListener('click',e=>{
    const strip=box.querySelector('.reader-thumbs');
    if(e.target.closest('[data-files-prev],[data-files-next]')){strip.scrollBy({left:(e.target.closest('[data-files-next]')?1:-1)*Math.max(58,strip.clientWidth-58),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
    const b=e.target.closest('[data-file]'),cur=view.focus>=0?view.cards[view.focus]:null;if(!b||!cur?.files?.length)return;const i=Number(b.dataset.file);showFile(i<0||view.file===i?-1:i);
   });
   let y0=null,x0=0;box.addEventListener('touchstart',e=>{y0=e.touches[0].clientY;x0=e.touches[0].clientX;},{passive:true});
   box.addEventListener('touchend',e=>{if(y0===null)return;const dy=e.changedTouches[0].clientY-y0,dx=e.changedTouches[0].clientX-x0;y0=null;if(Math.abs(dy)>40&&Math.abs(dy)>Math.abs(dx)*1.5)goTo(view.focus+(dy<0?1:-1));},{passive:true});}
  if(box.dataset.card!==c.key){box.dataset.card=c.key;
   box.innerHTML=`<div class="reader-file-row"><button type="button" class="reader-thumb reader-text-thumb" data-file="-1" aria-label="Afficher le texte du message"><span aria-hidden="true">📝</span><span>Texte</span></button><div class="reader-file-window"><div class="reader-thumbs">${c.files.map((f,i)=>fileThumb(f,i)).join('')}</div><button type="button" class="reader-scroll is-prev" data-files-prev aria-label="Images précédentes" hidden>‹</button><button type="button" class="reader-scroll is-next" data-files-next aria-label="Images suivantes" hidden>›</button></div></div>`;
   box.querySelector('.reader-thumbs').addEventListener('scroll',()=>fileOverflow(box),{passive:true});
   box.dataset.file='';
  } // the count is in the reader (« 📎 N pièces jointes »)
  box.querySelectorAll('[data-file]').forEach(t=>{const on=Number(t.dataset.file)===view.file;t.classList.toggle('is-on',on);t.setAttribute('aria-pressed',String(on));});
  if(box.dataset.file!==String(view.file)){box.dataset.file=String(view.file);if(view.file>=0){const strip=box.querySelector('.reader-thumbs'),thumb=strip.querySelector(`[data-file="${view.file}"]`);if(thumb){const tr=thumb.getBoundingClientRect(),sr=strip.getBoundingClientRect();if(tr.left<sr.left||tr.right>sr.right)strip.scrollLeft+=tr.left<sr.left?tr.left-sr.left:tr.right-sr.right;}}}
  fileOverflow(box);requestAnimationFrame(()=>fileOverflow(box));
  queue.classList.add('has-files');
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
  if(view.focus<0){view.file=-1;view.keepKey=null;view.host?.querySelector('.reader-files')?.remove();view.host?.querySelector('.reader-queue')?.classList.remove('has-files');if(typeof homeActions!=='undefined')homeActions.hide();home.classList.remove('reader-active');if(card)card.hidden=true;host.querySelectorAll('.reader-item').forEach(el=>el.classList.remove('is-read'));fitList();hint();return;}
  // The reader is always sized on the FOLDED treasury (21/10): an unfolded treasury never makes it taller.
  if(!home.classList.contains('reader-active')){const t=document.querySelector('#homeTreasury .home-treasury'),folded=Number(document.body.dataset.treasuryFolded)||0;view.treasuryH=t&&t.classList.contains('is-folded')?t.offsetHeight:(folded||(t?t.offsetHeight:view.treasuryH));}
  const c=view.cards[view.focus];if(view.keepKey!==c.key){view.full=false;view.editing=null;view.file=-1;}view.keepKey=c.key;
  if(view.file>=0&&!c.files?.[view.file])view.file=-1;
  const editing=view.editing===c.key;
  card.hidden=false;card.style.height=editing?'auto':readerHeight()+'px';
  card.className='home-reader state-'+presentation(c).state+(editing?' is-editing':'')+(view.full&&c.sample?' is-full':'')+(c._done?' is-done':'')+(view.file>=0?' is-image':'');
  card.innerHTML=readerMarkup(c);home.classList.add('reader-active');
  // 22/10 (user): a small closing grip at the bottom middle of the reader (retractable container): tap or swipe up = close.
  if(ios()){const g=document.createElement('button');g.type='button';g.className='reader-grip';g.setAttribute('aria-label','Fermer le lecteur');g.onclick=closeReader;
   let gy=null;g.addEventListener('touchstart',e=>{gy=e.touches[0].clientY;},{passive:true});g.addEventListener('touchend',e=>{if(gy!==null&&gy-e.changedTouches[0].clientY>25)closeReader();gy=null;},{passive:true});card.append(g);}
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
  wireStage(card,c);
  const speak=card.querySelector('[data-reader-speak]'),cp=copy(c);
  if(speak)speak.onclick=()=>{if(typeof readAloud==='function')readAloud([presentation(c).label,cp.title,(sign(c)?.s==='−'?'à payer ':sign(c)?'à recevoir ':'')+cp.amount,cp.detail].filter(Boolean).join('. '),speak);};
  card.querySelectorAll('[data-draft]').forEach(f=>f.oninput=()=>{view.draft[f.dataset.draft]=f.value;});
  card.querySelector('[data-draft]')?.focus({preventScroll:true});
  if(card.querySelector('.reader-body'))wireRail(card);
  host.querySelectorAll('.reader-list .reader-item').forEach((el,i)=>el.classList.toggle('is-read',i<=view.focus));
  syncFiles();
  fitList();
  hint();
 }
 // The reader may be taller than the treasury (to show 3–4 lines of text, or while editing): the list gets
 // shorter by the same amount, so the function grid below never moves.
 // iPhone-style home: the reader takes the place of the treasury and of two small cards, so 2 stay visible and
 // nothing below moves; elsewhere it is at least 300px and the list gives up the difference.
 function readerHeight(){return ios()?Math.max(180,Math.min(260,innerHeight*.34,(view.treasuryH||0)+(cap()-Math.max(1,cap()-2))*(Number(document.body.dataset.readerPitch)||69))):Math.max(view.treasuryH||0,MIN_H);}
 // While reading, the box keeps its size (21/10) down to the last message: the end of the list is never cut.
 function fitList(){
  const list=view.host?.querySelector('.reader-list'),card=view.host?.querySelector('.home-reader');if(!list)return;
  const base=Number(list.dataset.base)||list.offsetHeight;list.dataset.base=base;
  if(ios()){const reading=view.focus>=0&&card&&!card.hidden;
   const gap=parseFloat(getComputedStyle(document.body).getPropertyValue('--reader-gap'))||9;
   let n=Math.min(view.cards.length,cap()),anchor=false;
   if(reading){
    const pg=document.querySelector('#content .home-pages'),files=view.host.querySelector('.reader-files'),queue=list.parentElement;
    const editing=card.classList.contains('is-editing');
    if(!editing)card.style.height=readerHeight()+'px'; // start from the same base, never accumulate spare pixels
    if(pg){
     // Files replace queue slots; the reader keeps the same height in text and image mode.
     // One compact separation only: no cumulative comfort reserve under the thumbnails.
     const stack=view.cards.length>1?9:0,space=12;
     const fileSpace=files?files.getBoundingClientRect().height+space:0;
     const tail=stack+space+fileSpace;
     const room=Math.max(0,pg.getBoundingClientRect().top-list.getBoundingClientRect().top);
     const basePitch=Number(document.body.dataset.readerPitch)||69;
     n=editing?0:Math.max(0,Math.min(cap(),Math.floor((room-tail+gap)/basePitch)));
     const available=Math.max(0,room-tail);
     // Share the remainder within the complete cards, rather than creating a blank block
     // or changing the reader's height. Their gaps remain the same.
     const step=n?(available+gap)/n:basePitch,oldPitch=pitch();
     list.dataset.pitch=String(step);list.style.setProperty('--reader-card-h',Math.max(0,step-gap)+'px');
     anchor=Math.abs(step-oldPitch)>.1;
     queue.style.setProperty('--reader-tail-gap',(stack+space)+'px');
    }
   }else{delete list.dataset.pitch;list.style.removeProperty('--reader-card-h');}
   list.style.height=Math.max(0,n*pitch()-(n?gap:0))+'px';const end=list.querySelector('.reader-end');if(end)end.style.height=list.style.height;
   if(anchor)list.scrollTop=(view.focus+1)*pitch();return;} // the end block matches the box, so sliding back from the last card works at once
  const extra=view.focus>=0&&card&&!card.hidden?Math.max(0,card.offsetHeight-(view.treasuryH||0)):0;
  list.style.height=Math.max(Math.min(base,pitch()-8),base-extra)+'px';
 }
 function hint(){
  const el=view.host?.querySelector('.reader-hint');if(!el)return;
  const n=view.cards.length,below=n-(view.focus+1)-cap();
  el.textContent=view.focus>=n-1?'Dernier message · ↓ Glissez pour revoir':(below>0?`${below} autre${below>1?'s':''} en dessous · `:'')+'↑ Glissez pour lire';
 }
 // Image mode: swipe sideways = next / previous file (same order as the thumbnails); a PDF with a link opens on tap.
 function showFile(i){view.file=i;showReader();}
 function wireStage(card,c){
  const st=card.querySelector('[data-reader-stage]');if(!st)return;
  st.addEventListener('click',e=>{const f=c.files?.[view.file];if(e.target.closest('[data-open]')&&f?.src)window.open(f.src,'_blank','noopener');});
  let x0=null,y0=0;
  st.addEventListener('touchstart',e=>{if(e.touches.length!==1){x0=null;return;}x0=e.touches[0].clientX;y0=e.touches[0].clientY;},{passive:true});
  st.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;
   if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){const n=c.files.length;showFile((view.file+(dx<0?1:-1)+n)%n);}},{passive:true});
 }
 function goTo(i){
  if(ios()){view.focus=i;showReader();view.host?.querySelector('.reader-list')?.scrollTo({top:(i+1)*pitch(),behavior:'instant'});return;}
  view.host?.querySelector('.reader-list')?.scrollTo({top:(i+1)*pitch(),behavior:'smooth'});
 }
 function closeReader(){
  if(ios()){view.focus=-1;showReader();view.host?.querySelector('.reader-list')?.scrollTo({top:0,behavior:'instant'});return;}
  view.host?.querySelector('.reader-list')?.scrollTo({top:0,behavior:'smooth'});
 }
 function step(d){if(view.focus+d<-1||view.focus+d>=view.cards.length)return;if(view.focus+d<0)closeReader();else goTo(view.focus+d);}

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
  host.querySelector('.reader-end').onclick=closeReader;
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
  view.focus=-1;view.keepKey=null;syncMenu();notify(on?`${window.readerSamples?.length||0} messages d’essai ajoutés au lecteur (rien n’est envoyé).`:'Messages d’essai retirés.');
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
 function reflow(){if(view.focus>=0){fitList();fileOverflow(view.host?.querySelector('.reader-files'));requestAnimationFrame(()=>window.homePages?.stack());}}
 return {enabled,render,setEnabled,setSamples,readingModules,step,close:closeReader,showFile,fileShown:()=>view.file,reflow};
})();
window.homeReader=homeReader;
