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
 let railCleanup=()=>{};
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
  if(c._done)return `<button type="button" class="reader-item is-done" data-reader-item="${i}" data-reader-key="${clean(c.key)}" aria-label="${clean(cp.title)} · traité"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="reader-item-copy"><strong>${clean(cp.title)}</strong><small><span class="reader-done-tag">✓ Traité</span> · ${clean(c._done)}</small></span></button>`;
  return `<button type="button" class="reader-item state-${p.state}" data-reader-item="${i}" data-reader-key="${clean(c.key)}" aria-label="${clean(cp.title)} · ${clean(p.label)}"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="reader-item-copy"><strong>${c.sample?'<span class="reader-tag">Essai</span>':''}${clean(cp.title)}</strong><small><span class="reader-state">${clean(p.label)}</span>${cp.amount?' · '+moneyChip(c,cp.amount):''}${c.source?' · '+clean(c.source):''}${cp.detail?' · '+clean(cp.detail):''}</small></span></button>`;
 }
 function readerMarkup(c){
  const p=presentation(c),cp=copy(c),key=moduleOf(c),sg=sign(c),btns=buttons(c);
  const pos=view.focus+1,total=view.cards.length;
  const spk=`<button type="button" class="reader-icon" data-reader-speak aria-label="Écouter l’essentiel" title="Écouter">${typeof speakerIcon!=='undefined'?speakerIcon:'🔊'}</button>`;
  // 22/10 (user): a tapped thumbnail turns the reader itself into an image reader — only the file, nothing else.
  const f=view.file>=0?c.files?.[view.file]:null;
  if(f)return `<div class="reader-stage" data-reader-stage>${f.type==='image'?`<img class="reader-stage-img" src="${clean(f.src)}" alt="${clean(f.name)}">`:`<div class="reader-stage-doc"${f.src?' data-open="1"':''}><span class="reader-file-kind">${FILE_ICON[f.type]||FILE_ICON.other}</span><strong>${clean(f.name)}</strong>${f.pages?`<span>${f.pages} pages</span>`:''}${f.src?'<span>Touchez pour ouvrir</span>':''}</div>`}</div>`;
  // iPhone: integrate the notification information into the reader, without a nested glass card.
  return `${ios()?'':`<div class="reader-head"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="reader-state state-${p.state}">${clean(p.label)}</span><span class="reader-pos">${pos}/${total}</span><span class="reader-tools"><button type="button" class="reader-icon" data-reader-speak aria-label="Écouter l’essentiel" title="Écouter">${typeof speakerIcon!=='undefined'?speakerIcon:'🔊'}</button><button type="button" class="reader-icon" data-reader-open aria-label="Ouvrir le détail" title="Ouvrir le détail"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button type="button" class="reader-icon" data-reader-hide aria-label="Masquer ce message" title="Masquer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button type="button" class="reader-icon" data-reader-back aria-label="Revenir à la trésorerie" title="Trésorerie"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></span></div>`}
  ${ios()?`<div class="reader-card state-${p.state}"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="reader-item-copy"><strong>${c.sample?'<span class="reader-tag">Essai</span>':''}${clean(cp.title)}</strong><small><span class="reader-state">${clean(p.label)}</span>${cp.amount?' · '+moneyChip(c,cp.amount):''}${c.source?' · '+clean(c.source):''}${cp.detail?' · '+clean(cp.detail):''}</small></span>${spk}</div>`:''}
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
  return `<span class="reader-file-slot"><button type="button" class="reader-thumb" data-file="${i}" aria-label="Voir en grand : ${clean(f.name)}">${inner}</button></span>`;
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
   box.innerHTML=`<div class="reader-file-row"><span class="reader-file-slot"><button type="button" class="reader-thumb reader-text-thumb" data-file="-1" aria-label="Afficher le texte du message"><span aria-hidden="true">📝</span><span>Texte</span></button></span><div class="reader-file-window"><div class="reader-thumbs">${c.files.map((f,i)=>fileThumb(f,i)).join('')}</div><button type="button" class="reader-scroll is-prev" data-files-prev aria-label="Images précédentes" hidden>‹</button><button type="button" class="reader-scroll is-next" data-files-next aria-label="Images suivantes" hidden>›</button></div></div>`;
   box.querySelector('.reader-thumbs').addEventListener('scroll',()=>fileOverflow(box),{passive:true});
   box.dataset.file='';
  } // the count is in the reader (« 📎 N pièces jointes »)
  box.querySelectorAll('[data-file]').forEach(t=>{const on=Number(t.dataset.file)===view.file;t.classList.toggle('is-on',on);t.setAttribute('aria-pressed',String(on));});
  if(box.dataset.file!==String(view.file)){box.dataset.file=String(view.file);if(view.file>=0){const strip=box.querySelector('.reader-thumbs'),thumb=strip.querySelector(`[data-file="${view.file}"]`);if(thumb){const tr=thumb.getBoundingClientRect(),sr=strip.getBoundingClientRect();if(tr.left<sr.left||tr.right>sr.right)strip.scrollLeft+=tr.left<sr.left?tr.left-sr.left:tr.right-sr.right;}}}
  box.style.setProperty('--reader-visible-files',String(Math.min(5,c.files.length)));
  fileOverflow(box);requestAnimationFrame(()=>fileOverflow(box));
  queue.classList.add('has-files');
 }
 function syncRail(card){
  const body=card?.querySelector('.reader-body'),wrap=card?.querySelector('.reader-body-wrap');if(!body||!wrap)return;
  const range=body.scrollHeight-body.clientHeight,over=range>2;wrap.classList.toggle('is-long',over);
  if(!over){wrap.classList.remove('is-scrolling');return;}
  const rail=wrap.querySelector('.reader-rail'),thumb=rail.querySelector('i');
  const track=rail.clientHeight,h=Math.min(track,Math.max(24,track*body.clientHeight/body.scrollHeight));
  thumb.style.height=h+'px';thumb.style.top=(Math.max(0,Math.min(1,body.scrollTop/range))*(track-h))+'px';
 }
 function wireRail(card){
  const body=card.querySelector('.reader-body'),wrap=card.querySelector('.reader-body-wrap');let idle;
  const active=()=>{syncRail(card);if(!wrap.classList.contains('is-long'))return;
   wrap.classList.add('is-scrolling');clearTimeout(idle);idle=setTimeout(()=>wrap.classList.remove('is-scrolling'),850);
  };
  body.addEventListener('scroll',active,{passive:true});
  body.addEventListener('touchstart',active,{passive:true});
  const observer=new ResizeObserver(()=>syncRail(card));observer.observe(body);
  railCleanup=()=>{clearTimeout(idle);observer.disconnect();body.removeEventListener('scroll',active);body.removeEventListener('touchstart',active);};
  requestAnimationFrame(()=>{if(card.isConnected)syncRail(card);});
 }
 function showReader(){
  railCleanup();railCleanup=()=>{};
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
 // Give the reader one extra notification row. Short screens still keep a complete
 // queue card and room for attachments; this limit is identical for text and images.
 function readerHeight(){
  if(!ios())return Math.max(view.treasuryH||0,MIN_H);
  const step=Number(document.body.dataset.readerPitch)||69;
  const base=Math.max(180,Math.min(260,innerHeight*.34,(view.treasuryH||0)+(cap()-Math.max(1,cap()-2))*step));
  const card=view.host?.querySelector('.home-reader'),bar=view.host?.querySelector('.reader-bar'),pg=document.querySelector('#content .home-pages');
  const reserve=8+(bar?.getBoundingClientRect().height||26)+(step-9)+9+32+46+2;
  const limit=card&&pg?pg.getBoundingClientRect().top-card.getBoundingClientRect().top-reserve:Infinity;
  return Math.max(180,Math.min(base+step,limit));
 }
 // While reading, the box keeps its size (21/10) down to the last message: the end of the list is never cut.
 function fitList(){
  const list=view.host?.querySelector('.reader-list'),card=view.host?.querySelector('.home-reader');if(!list)return;
  const base=Number(list.dataset.base)||list.offsetHeight;list.dataset.base=base;
  if(ios()){const reading=view.focus>=0&&card&&!card.hidden;
   const gap=parseFloat(getComputedStyle(document.body).getPropertyValue('--reader-gap'))||9;
   let n=cap(),anchor=false;
   if(reading){
    const pg=document.querySelector('#content .home-pages'),files=view.host.querySelector('.reader-files'),queue=list.parentElement;
    const editing=card.classList.contains('is-editing');
    if(!editing)card.style.height=readerHeight()+'px'; // start from the same base, never accumulate spare pixels
    if(pg){
     // Queue cards retain the home height and pitch. Spare room belongs to the
     // image carousel, or stays between the queue and the action buttons.
     const stack=view.cards.length>1?9:0,space=8;
     const room=Math.max(0,pg.getBoundingClientRect().top-list.getBoundingClientRect().top);
     const basePitch=Number(document.body.dataset.readerPitch)||69,cardH=basePitch-gap;
     // Attachment presence never changes the number of notification slots.
     const tail=stack+space;
     n=editing?0:Math.max(0,Math.min(cap(),Math.floor((room-tail+gap)/basePitch)));
     const used=Math.max(0,n*basePitch-(n?gap:0));
     const oldPitch=pitch();
     list.dataset.pitch=String(basePitch);list.style.setProperty('--reader-card-h',cardH+'px');
     anchor=Math.abs(basePitch-oldPitch)>.1;
     if(files){
      const cell=Math.max(1,(queue.clientWidth-5*9)/6),actions=document.querySelector('#content .home-action-row');
      const free=Math.max(0,(actions?.getBoundingClientRect().top||pg.getBoundingClientRect().top)-list.getBoundingClientRect().top-used);
      const size=Math.max(0,Math.min(cell,Math.floor(free*.65)));
      queue.style.setProperty('--reader-file-cell',cell+'px');queue.style.setProperty('--reader-thumb-size',size+'px');
      queue.style.setProperty('--reader-tail-gap',((free-size)/2)+'px');files.classList.toggle('is-compact',size<32);
     }else{queue.style.removeProperty('--reader-thumb-size');queue.style.setProperty('--reader-tail-gap',(stack+space)+'px');}
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
 // The pile follows the finger continuously. At each edge, whole cards fold
 // into a narrower glass layer; release settles magnetically on one message.
 let pileRaf=0;
 function clearPile(){
  cancelAnimationFrame(pileRaf);pileRaf=0;
  const list=view.host?.querySelector('.reader-list');if(!list)return;
  delete list.dataset.pileMotion;
  list.querySelectorAll('.reader-item,.reader-end').forEach(el=>{
   for(const k of ['transform','transform-origin','opacity','visibility','--pile-content'])el.style.removeProperty(k);
  });
  requestAnimationFrame(()=>window.homePages?.stack());
 }
 function paintPile(offset){
  const list=view.host?.querySelector('.reader-list');if(!list)return;
  list.dataset.pileMotion='1';
  const height=list.clientHeight,step=pitch(),cardH=parseFloat(list.style.getPropertyValue('--reader-card-h'))||60;
  list.querySelectorAll('.reader-item,.reader-end').forEach((el,i)=>{
   const h=el.classList.contains('reader-end')?height:cardH,base=i*step-list.scrollTop,y=base+offset;
   const fold=Math.max(0,Math.min(1,(y+h)/h,(height-Math.max(0,y))/h));
   if(fold<.015){el.style.visibility='hidden';el.style.transform='';return;}
   el.style.visibility='visible';el.style.transformOrigin='50% 0';
   el.style.transform=`translateY(${Math.max(0,y)-base}px) scale(${.93+.07*fold},${fold})`;
   el.style.opacity=String(.45+.55*fold);
   el.style.setProperty('--pile-content',String(Math.max(0,Math.min(1,(fold-.4)/.6))));
  });
 }
 function tweenPile(from,to,done){
  cancelAnimationFrame(pileRaf);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){clearPile();done?.();return;}
  const list=view.host?.querySelector('.reader-list'),started=performance.now();
  const frame=now=>{
   if(!list?.isConnected||view.host?.querySelector('.reader-list')!==list){clearPile();return;}
   const t=Math.min(1,(now-started)/300),ease=1-Math.pow(1-t,3);
   paintPile(from+(to-from)*ease);
   if(t<1)pileRaf=requestAnimationFrame(frame);else{clearPile();done?.();}
  };
  paintPile(from);pileRaf=requestAnimationFrame(frame);
 }
 function goTo(i,settled=false){
  clearPile();
  if(ios()){const direction=i-view.focus;view.focus=i;showReader();view.host?.querySelector('.reader-list')?.scrollTo({top:(i+1)*pitch(),behavior:'instant'});
   if(!settled)tweenPile(Math.sign(direction)*pitch(),0);return;}
  view.host?.querySelector('.reader-list')?.scrollTo({top:(i+1)*pitch(),behavior:'smooth'});
 }
 function closeReader(){
  clearPile();
  if(view.focus>=0)window.homePages?.dismissReminder();
  if(ios()){view.focus=-1;showReader();view.host?.querySelector('.reader-list')?.scrollTo({top:0,behavior:'instant'});return;}
  view.host?.querySelector('.reader-list')?.scrollTo({top:0,behavior:'smooth'});
 }
 function step(d){if(view.focus+d<-1||view.focus+d>=view.cards.length)return;if(view.focus+d<0)closeReader();else goTo(view.focus+d);}

 function bindSurface(surface,tapNext=false){
   if(!ios()||!surface||surface.dataset.readerGestures)return;surface.dataset.readerGestures='1';
   let start=null,suppressUntil=0,wheelAt=0;
   surface.addEventListener('touchstart',e=>{
    clearPile();start=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY,offset:0}:null;
   },{passive:true});
   surface.addEventListener('touchmove',e=>{
    if(!start||e.touches.length!==1)return;
    const dx=e.touches[0].clientX-start.x,dy=e.touches[0].clientY-start.y;
    if(Math.abs(dy)<=8||Math.abs(dy)<=Math.abs(dx)*1.3)return;
    e.preventDefault();const limit=pitch();
    const blocked=dy>0&&view.focus<0||dy<0&&view.focus>=view.cards.length-1;
    start.offset=blocked?dy*.12:Math.sign(dy)*Math.min(limit,Math.abs(dy));
    paintPile(start.offset);
   },{passive:false});
   surface.addEventListener('touchend',e=>{
    if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y,offset=start.offset;start=null;
    if(Math.abs(dy)>10||Math.abs(dx)>10)suppressUntil=Date.now()+650;
    const dir=offset<0?1:-1,at=view.focus+dir;
    const commit=Math.abs(offset)>=pitch()*.3&&at>=-1&&at<view.cards.length;
    tweenPile(offset,commit?-dir*pitch():0,()=>{if(commit){if(at<0)closeReader();else goTo(at,true);}});
   },{passive:true});
   surface.addEventListener('touchcancel',()=>{const offset=start?.offset||0;start=null;tweenPile(offset,0);},{passive:true});
   surface.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();return;}if(tapNext&&!e.target.closest('button[data-filler],.reader-item,[data-reader-top]')){if(view.focus>=0)closeReader();else step(1);}},true);
   surface.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)<=Math.abs(e.deltaX))return;e.preventDefault();if(Date.now()-wheelAt>250&&Math.abs(e.deltaY)>8){wheelAt=Date.now();step(e.deltaY>0?1:-1);}},{passive:false});
   surface.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();step(e.key==='ArrowDown'?1:-1);}});
 }

 function render(host,cards,actual,cid){
  clearPile();
  view.host=host;view.cid=cid;
  const pending=[...samples(),...actual.filter(c=>!c.example)].filter(c=>!doneCards.some(d=>d.c.key===c.key));
  const real=pending.length||doneCards.length?[...doneCards.map(d=>({...d.c,_done:d.label})),...pending]:[];
  const home=document.querySelector('#content .reference-home');
  // Nothing left: one single replacement card keeps the middle filled (the routine/first card), no reader.
  if(!real.length){if(typeof homeActions!=='undefined')homeActions.hide();home?.classList.remove('reader-active');view.cards=[];view.focus=-1;host.classList.remove('reader-host');return false;}
  home?.querySelector('.home-filler')?.remove(); // remove old idle overlays before new arrivals are drawn
  const prevKey=view.keepKey,prevFocus=view.focus;
  view.cards=real;
  const n=real.length,h=Math.min(n,cap())*pitch()-8;
  host.classList.add('reader-host');
  host.innerHTML=`<h2 class="home-section-title">À faire maintenant</h2><article class="home-reader" hidden aria-live="polite"></article><div class="reader-queue"><div class="reader-bar">${counter()}<span class="reader-hint"></span></div><div class="reader-list${n>cap()?' has-more':''}" style="height:${h}px" aria-label="Messages à traiter">${real.map(small).join('')}<div class="reader-end" style="height:${h}px"><button type="button" class="reader-end-btn" data-reader-top aria-label="Fin de la liste · revenir à l’accueil">✓ Fin de la liste <span aria-hidden="true">· Accueil ↑</span></button><div class="reader-invitation" hidden></div></div></div></div>`;
  const list=host.querySelector('.reader-list');
  // The terminal invitation remains outside the messages and shares list gestures.
  host.querySelector('.reader-end').onclick=e=>{const target=e.target.closest('[data-filler]');if(target)window.homePages?.openFiller(target.dataset.filler);else closeReader();};
  host.querySelectorAll('[data-reader-item]').forEach(b=>b.onclick=()=>goTo(Number(b.dataset.readerItem)));
  // Keep the place after a refresh: same card if it is still there, otherwise the one that took its place.
  let focus=-1;
  if(prevFocus>=0){const k=prevKey?real.findIndex(c=>c.key===prevKey):-1;focus=k>=0?k:Math.min(prevFocus,n-1);}
  view.focus=focus;
  list.scrollTop=(focus+1)*pitch();
  showReader();
  bindSurface(list,true);
  let raf=0;
  list.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
   const f=Math.min(n-1,Math.round(list.scrollTop/pitch())-1);
   if(ios()){if(f!==view.focus)goTo(f);else if(Math.abs(list.scrollTop-(f+1)*pitch())>.5)list.scrollTop=(f+1)*pitch();}
   else if(f!==view.focus){view.focus=f;showReader();}
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
 return {enabled,render,setEnabled,setSamples,readingModules,bindSurface,step,close:closeReader,showFile,fileShown:()=>view.file,reflow};
})();
window.homeReader=homeReader;
