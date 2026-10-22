'use strict';
// Accueil façon iPhone (user request 2026-10-20), on by default (localStorage aia-pages=off restores the previous
// layout; the older UI tests use it):
// - the home never scrolls vertically: everything fits one screen (only pulling down refreshes);
// - top: the réglages shown directly as small icons (no menu to open);
// - middle: treasury / reader + the small cards (as many as fit, at most 5);
// - functions: pages of 4 × 2 squares swiped sideways like iPhone home screens, with dots; the functions that
//   have an action to do are always on the first page (they take the place of quiet ones); iOS-style red
//   number badges; no « Réserve de fonctions » button;
// - bottom: the Assistant IA bar.
// Opening a function keeps the existing window and its function strip fixed at the bottom (swipe sideways only).
const homePages=(()=>{
 const KEY='aia-pages';
 // Columns and rows come from the grid réglage (« Grille » icon at the end of the functions): 4 × 2 by default.
 // Kept on this phone (aia-pages-grid) so the home keeps 4 × 2 until the user picks something else here.
 const GRID_KEY='aia-pages-grid';
 const layout=()=>{let v=null;try{v=JSON.parse(localStorage.getItem(GRID_KEY)||'null');}catch{}const cols=[2,3,4].includes(v?.cols)?v.cols:4,rows=Number.isInteger(v?.rows)?Math.min(3,Math.max(1,v.rows)):2;return {cols,rows};};
 // A choice in the grid panel (columns square or rows −/+) is kept for this home and applied at once.
 document.addEventListener('click',e=>{
  const pick=e.target.closest('#homeColumnChooser [data-set-columns],#homeColumnChooser [data-rows-step]');if(!pick||!on())return;
  const cur=layout();let {cols,rows}=cur;
  if(pick.dataset.setColumns)cols=Number(pick.dataset.setColumns);else rows=Math.min(3,Math.max(1,rows+Number(pick.dataset.rowsStep)));
  try{localStorage.setItem(GRID_KEY,JSON.stringify({cols,rows}));}catch{}
  setTimeout(()=>{const v=document.querySelector('#homeRowsValue');if(v)v.textContent=String(rows);document.querySelectorAll('#homeColumnChooser [data-set-columns]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.setColumns)===cols)));
   const box=document.querySelector('#content .home-pages');if(box&&homeLayout.workspace){page=0;box.dataset.force='1';updateHomeGrid(homeLayout.workspace,homeLayout.state);}},0);
 },true);
 const GRID_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
 const on=()=>{try{return localStorage.getItem(KEY)!=='off';}catch{return true;}};
 document.documentElement.classList.toggle('home-ios',on());
 let page=0;

 // Functions in order: those with an action first (worst first), then the ones checked for the home, then the rest.
 function orderedKeys(workspace,state){
  const counts=state?.action_counts||{},weight=k=>({danger:4,warning:3,info:1})[state?.module_states?.[k]?.state]||0;
  const all=workspace.modules.map(m=>m.key),visible=[...new Set(workspace.visible||[])].filter(k=>all.includes(k));
  const action=all.filter(k=>(counts[k]||0)>0||weight(k)>=3).sort((a,b)=>weight(b)-weight(a)||(counts[b]||0)-(counts[a]||0));
  return [...new Set([...action,...visible,...all])];
 }
 let reserve=false;
 function setReserve(on,force){on=!!on;if(on===reserve&&!force)return;reserve=on;const box=document.querySelector('#content .home-pages');if(box&&homeLayout.workspace&&typeof updateHomeGrid==='function'){box.dataset.force='1';updateHomeGrid(homeLayout.workspace,homeLayout.state);if(typeof observeHomeGrids==='function')observeHomeGrids();window.homeActions?.place();}} // sizes set at once: the grid never jumps
 function pagesMarkup(base,workspace,state){
  const {cols:COLS,rows:ROWS}=layout(),PER=COLS*ROWS;
  const ws={...workspace,columns:COLS,rows:10,dynamic:false,visible:orderedKeys(workspace,state)};
  const html=base(ws,state);homeLayout.workspace=workspace; // the real layout stays the saved one
  const box=document.createElement('div');box.innerHTML=html;
  // While reading (22/10): the first function row shows the function of the message being read (marked) then
  // the functions of the next messages, each once, in the same order; the other functions follow unchanged.
  let els=[...box.querySelector('.module-grid').children];
  if(reserve&&ROWS>1&&window.homeReader?.readingModules){const want=window.homeReader.readingModules(COLS);
   const picked=want.map(k=>els.find(e=>e.dataset.module===k)).filter(Boolean);els=[...picked,...els.filter(e=>!picked.includes(e))];
   if(picked[0])picked[0].classList.add('is-reading');}
  const cards=els.map(c=>c.outerHTML),pages=[];
  // Last square: the grid réglage (columns and rows), right after the functions.
  cards.push(`<article class="module-card home-grid-card" data-module="grille"><button type="button" class="module-tile home-grid-tile" data-grid-tile aria-label="Régler la grille : colonnes et rangées" title="Colonnes et rangées">${COLS===4?`<span class="module-face"><span class="module-icon" aria-hidden="true">${GRID_ICON}</span></span><span class="module-copy"><strong>Grille</strong></span>`:`<span class="module-icon" aria-hidden="true">${GRID_ICON}</span><span class="widget-copy"><span class="module-copy"><strong>Grille</strong></span></span>`}</button></article>`);
  // While reading (21/10): the first row of every page is kept free for the action buttons and the functions
  // flow onto the next rows/pages, so none is hidden — all stay reachable by swiping. Normal order otherwise.
  if(reserve&&ROWS>1){const per=COLS*(ROWS-1),slot='<article class="module-card home-slot-reserved" aria-hidden="true"></article>'.repeat(COLS);for(let i=0;i<cards.length;i+=per)pages.push([slot,...cards.slice(i,i+per)]);}
  else for(let i=0;i<cards.length;i+=PER)pages.push(cards.slice(i,i+PER));
  const at=Math.min(page,Math.max(0,pages.length-1));
  return `<div class="module-grid home-pages" data-columns="${COLS}" data-layout="${COLS}x${ROWS}" aria-label="Fonctions, balayez pour la page suivante">${pages.map((p,i)=>`<nav class="module-grid home-page" data-columns="${COLS}" data-page="${i}" aria-label="Fonctions, page ${i+1} sur ${pages.length}">${p.join('')}</nav>`).join('')}</div><div class="home-page-dots" role="tablist" aria-label="Pages de fonctions">${pages.map((_,i)=>`<button type="button" role="tab" class="home-page-dot" data-page-dot="${i}" aria-label="Page ${i+1}" aria-selected="${i===at}"></button>`).join('')}</div>`;
 }
 function wirePages(){
  const box=document.querySelector('.home-pages');if(!box||box.dataset.wired)return;box.dataset.wired='1';
  const dots=[...document.querySelectorAll('.home-page-dot')];
  box.addEventListener('click',e=>{if(!e.target.closest('[data-grid-tile]'))return;e.preventDefault();e.stopPropagation();
   const t=document.querySelector('#content [data-columns-toggle]');if(t)setTimeout(()=>{if(t.getAttribute('aria-expanded')!=='true')t.click();const {cols,rows}=layout();const v=document.querySelector('#homeRowsValue');if(v)v.textContent=String(rows);document.querySelectorAll('#homeColumnChooser [data-set-columns]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.setColumns)===cols)));},0);},true);
  requestAnimationFrame(()=>{box.scrollLeft=page*box.clientWidth;});
  let raf=0;box.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
   page=Math.round(box.scrollLeft/Math.max(1,box.clientWidth));dots.forEach((d,i)=>d.setAttribute('aria-selected',String(i===page)));});},{passive:true});
  dots.forEach(d=>d.onclick=()=>box.scrollTo({left:Number(d.dataset.pageDot)*box.clientWidth,behavior:'smooth'}));
 }

 // One screen: the cards list gets the room left once everything else is laid out.
 function fit(){
  const home=document.querySelector('#content .reference-home');if(!home||!on())return;
  // Counted with the treasury shown; while reading, the reader's extra height comes out of the list (reader.js).
  if(home.classList.contains('reader-active'))return;
  // 10px kept under the home for its floating frame (21/10).
  const top=home.getBoundingClientRect().top+scrollY,h=Math.max(480,innerHeight-top-10);
  home.style.setProperty('--home-ios-height',h+'px');
  const block=home.querySelector('#priorityBlock'),list=block?.querySelector('.reader-list');
  // Folded treasury height, kept (also across openings): the reader and the unfolded treasury use it (21/10).
  const tre=home.querySelector('#homeTreasury .home-treasury');
  if(tre&&tre.classList.contains('is-folded')&&tre.offsetHeight){document.body.dataset.treasuryFolded=String(tre.offsetHeight);try{localStorage.setItem('aia-treasury-folded-h',String(tre.offsetHeight));}catch(e){}}
  else if(!document.body.dataset.treasuryFolded){try{const v=Number(localStorage.getItem('aia-treasury-folded-h'));if(v)document.body.dataset.treasuryFolded=String(v);}catch(e){}}
  // Unfolded treasury = a panel laid OVER the notification cards (21/10, user's idea): its place keeps the folded
  // height, so the cards never move nor change count; it stops just above the function pages and scrolls inside.
  const box=home.querySelector('#homeTreasury'),fhNow=Number(document.body.dataset.treasuryFolded)||0;
  if(box){const open=!!tre&&!tre.classList.contains('is-folded')&&fhNow>0;box.classList.toggle('is-open',open);
   if(fhNow)document.body.style.setProperty('--treasury-folded',fhNow+'px');
   const pg=home.querySelector('.home-pages');if(pg)document.body.style.setProperty('--treasury-overlay-max',Math.max(fhNow,pg.getBoundingClientRect().top-box.getBoundingClientRect().top-10)+'px');}
  const hs=getComputedStyle(home);let free=h-parseFloat(hs.paddingTop)-parseFloat(hs.paddingBottom);for(const el of home.children){const cs=getComputedStyle(el);if(el===block||cs.display==='none'||el.id==='moduleFocus'&&el.hidden||cs.position==='absolute'||cs.position==='fixed')continue; // laid-over parts (stack, reminder, back zone) take no room
  free-=el.getBoundingClientRect().height+parseFloat(cs.marginTop)+parseFloat(cs.marginBottom);}
  const bar=block?.querySelector('.reader-bar');
  free-=(bar?bar.offsetHeight:26)+(block?parseFloat(getComputedStyle(block).marginBottom)||0:0)+2;
  // The cards fill the room exactly (21/10): as many as fit at 44px or more (at most 5), each one sized so the
  // space left above the function pages is only the margin (the 7px stack hangs there). Height 44–60px + 6px gap.
  free-=2;
  const room=free+6;
  // Cards as on the « Façon iPhone » mock-up (22/10): 60px high (38px round icon + 11px padding), 9px apart; as many as fit (no 5-card limit), and the
  // little room left is shared between the gaps (8–16px) so nothing stays empty under the cards.
  const cardH=60;let slots=Math.max(2,Math.min(9,Math.floor((room+2)/(cardH+9))));
  const gap=Math.max(9,Math.min(26,Math.floor((room+2-slots*cardH)/slots))),step=String(cardH+gap);
  document.body.style.setProperty('--reader-gap',gap+'px');
  const b=document.body;
  if(b.dataset.readerSlots!==String(slots)||b.dataset.readerPitch!==step){b.dataset.readerSlots=String(slots);b.dataset.readerPitch=step;b.style.setProperty('--reader-card-h',cardH+'px');if(list&&typeof renderPriorities==='function')renderPriorities().catch(()=>{});}
 }
 // Waiting cards peek out right under the last visible card, like an iPhone notification stack (widest edge on
 // top, narrower below); it moves up a little each time a card comes up. Laid over: the grid never moves.
 // The room between the cards and the grid is never empty: when no card fills it (end of the list, nothing to
 // read), « Préparer demain / Veille » cards, only when there is no notification at all.
 // Next real agenda item for the reminder card (module-peek/calendar), fetched at most every 5 minutes.
 let next={at:0,item:null,busy:false};
 function loadNext(){
  if(next.busy||Date.now()-next.at<300000)return;
  const cid=typeof company!=='undefined'&&company?company.id:null;if(!cid||typeof api!=='function')return;
  next.busy=true;api(`/api/companies/${cid}/module-peek/calendar`).then(d=>{next.item=(d?.items||[])[0]||null;}).catch(()=>{next.item=null;}).finally(()=>{next.at=Date.now();next.busy=false;requestAnimationFrame(stack);});
 }
 function friendlyDate(iso){
  if(!iso)return '';const d=new Date(iso+'T12:00:00'),t=new Date();t.setHours(12,0,0,0);const diff=Math.round((d-t)/864e5);
  if(diff===0)return 'aujourd’hui';if(diff===1)return 'demain';if(diff<0)return 'en retard';
  return 'le '+d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
 }
 function reminderCard(){
  loadNext();
  const esc=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const icon=k=>typeof moduleIcon==='function'?moduleIcon(k):'';
  if(next.item)return `<button type="button" class="filler-row filler-card filler-reminder" data-filler="reminder"><span class="module-icon" aria-hidden="true">${icon('calendar')}</span><span class="filler-copy"><span class="filler-tag">Rappel</span><strong>${esc(next.item.title)}</strong><small>${esc(friendlyDate(next.item.meta))}</small></span><span aria-hidden="true">›</span></button>`;
  return `<button type="button" class="filler-row filler-card filler-reminder" data-filler="idea"><span class="module-icon" aria-hidden="true">${icon('drafts')}</span><span class="filler-copy"><span class="filler-tag">Idée</span><strong>Un problème au quotidien ?</strong><small>Décrivez-le, l’Assistant IA cherche une solution</small></span><span aria-hidden="true">›</span></button>`;
 }
 function openIdea(){
  try{const cid=company?.id,uid=me?.id;if(cid&&uid&&typeof assistantDrafts!=='undefined'){const k=uid+':'+cid,d=assistantDrafts.get(k)||{text:'',files:[],requestId:null};if(!d.text)d.text='Mon problème au quotidien : ';assistantDrafts.set(k,d);}}catch(e){}
  document.querySelector('#assistantDock')?.click();
 }
 // Bottom of the last visible thing in the cards block (e.g. the single replacement card), or its top when empty.
 function lastBottom(block){if(!block)return 0;const kids=[...block.querySelectorAll('.priority-card,.priority-stack>*,article')].filter(e=>e.offsetParent&&!e.closest('.home-filler'));return kids.length?Math.max(...kids.map(e=>e.getBoundingClientRect().bottom)):block.getBoundingClientRect().top;}
 let lastRest=-1;
 function stack(){
  const home=document.querySelector('#content .reference-home');if(!home||!on())return;
  const pages=home.querySelector('.home-pages'),list=home.querySelector('.reader-list'),block=home.querySelector('#priorityBlock');
  if(!pages)return;
  const hr=home.getBoundingClientRect(),pr=pages.getBoundingClientRect();
  const items=[...home.querySelectorAll('.reader-item')];
  const lr=list?.getBoundingClientRect();
  const shown=lr?items.filter(e=>{const r=e.getBoundingClientRect();return r.bottom>lr.top+2&&r.top<lr.bottom-2;}).length:0;
  const reading=home.classList.contains('reader-active');
  const read=reading?home.querySelectorAll('.reader-item.is-read').length:0;
  const rest=Math.max(0,items.length-read-shown);
  // Stack above the grid.
  let el=home.querySelector('.home-stack');
  if(rest){
   if(!el){el=document.createElement('button');el.type='button';el.className='home-stack';home.append(el);
    el.onclick=()=>{const l=home.querySelector('.reader-list');if(l)l.scrollBy({top:Number(document.body.dataset.readerPitch)||54,behavior:'smooth'});};}
   el.setAttribute('aria-label',rest+' autre'+(rest>1?'s':'')+' message'+(rest>1?'s':'')+' en attente');
   if(!el.firstChild)el.innerHTML='<i></i><i></i>';
   // Hangs right under the last visible card, like the iPhone notification stack (21/10): widest edge on top,
   // narrower below; never over the function pages.
   const vis=lr?items.filter(e=>{const r=e.getBoundingClientRect();return r.bottom>lr.top+2&&r.top<lr.bottom-2;}):[];
   const under=vis.length?Math.max(...vis.map(e=>e.getBoundingClientRect().bottom)):pr.top-20;
   el.style.top=(Math.min(under+2,pr.top-8)-hr.top)+'px';
   if(lastRest>=0&&rest!==lastRest){el.classList.remove('is-moving');void el.offsetWidth;el.classList.add('is-moving');}
  }else el?.remove();
  lastRest=rest;
  // Filler in the empty room.
  const after=lr&&shown?Math.max(...items.filter(e=>{const r=e.getBoundingClientRect();return r.bottom>lr.top+2&&r.top<lr.bottom-2;}).map(e=>e.getBoundingClientRect().bottom)):(block?.querySelector('.reader-bar')?.getBoundingClientRect().bottom||lastBottom(block)||pr.top); // under the replacement card when there is no notification (21/10)
  const top=after+8,bottom=pr.top-(rest?24:10),room=bottom-top;
  let f=home.querySelector('.home-filler');
  // While reading, the whole empty room under the cards is a touch zone back to the home (treasury + cards).
  // It starts under the cards box, so it never covers a card nor blocks sliding them (21/10).
  let z=home.querySelector('.home-back-zone');
  const zTop=lr?lr.bottom+(rest?12:4):top,zBottom=pr.top-(rest?12:4);
  if(reading&&zBottom-zTop>=24){
   if(!z){z=document.createElement('button');z.type='button';z.className='home-back-zone';z.setAttribute('aria-label','Revenir à l’accueil');home.append(z);
    z.onclick=()=>home.querySelector('.reader-list')?.scrollTo({top:0,behavior:'smooth'});}
   z.style.top=(zTop-hr.top)+'px';z.style.height=(zBottom-zTop)+'px';
  }else z?.remove();
  if(room>=64&&!reading){
   if(!f){f=document.createElement('section');f.className='home-filler';f.setAttribute('aria-label','À préparer');home.append(f);
    f.addEventListener('click',e=>{const b=e.target.closest('[data-filler]');if(!b)return;let k=b.dataset.filler;
     if(k==='idea'){openIdea();return;}
     if(k==='reminder')k='calendar';
     const tile=home.querySelector(`.home-pages [data-go="${k}"]`);if(tile)tile.click();else if(typeof openTab==='function')openTab(k);});}
   // « Préparer demain » and « Veille concurrentielle » are never part of the notification group (user request
   // 21/10): they show as their own cards only when there is no notification card at all (pending or done).
   // While notifications are there, only the reminder card below may fill the room (never while reading).
   // With a few notifications that leave room (21/10): ONE reminder card of another style, never counted as a
   // notification, gone as soon as a notification is touched (reading). Real next agenda item, otherwise an
   // invitation to describe a daily problem to the Assistant IA. Nothing invented.
   const solo=items.length===0,tall=room>=150;
   f.classList.toggle('is-tall',tall);f.classList.toggle('is-cards',true);f.classList.toggle('is-reminder',!solo);
   const row=(k,title,sub)=>`<button type="button" class="filler-row filler-card" data-filler="${k}"><span class="module-icon" aria-hidden="true">${typeof moduleIcon==='function'?moduleIcon(k):''}</span><span class="filler-copy"><strong>${title}</strong><small>${sub}</small></span><span aria-hidden="true">›</span></button>`;
   f.innerHTML=solo?row('calendar','Préparer demain','Rendez-vous, chantiers et rappels de demain')+(tall?row('veille','Veille concurrentielle','Marchés, prix et nouveautés de votre métier'):''):reminderCard();
   if(!f.innerHTML){f.remove();return;}
   f.style.top=(top-hr.top)+'px';f.style.height=room+'px';
  }else f?.remove();
 }
 let watcher=null,stackWatch=null;
 function sync(){if(!on())return;wirePages();setTimeout(()=>window.homeActions?.place(),0);requestAnimationFrame(fit);setTimeout(fit,350);setTimeout(stack,400);
  const block=document.querySelector('#content #priorityBlock');
  if(block&&!block.dataset.stackWatch){block.dataset.stackWatch='1';stackWatch=new MutationObserver(()=>requestAnimationFrame(stack));stackWatch.observe(block,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
   block.addEventListener('scroll',()=>requestAnimationFrame(stack),{capture:true,passive:true});
   block.addEventListener('pointerdown',e=>{if(e.target.closest('.reader-list'))document.querySelector('#content .home-filler.is-reminder')?.remove();},{capture:true,passive:true});}
  // Re-fit when a block changes height (treasury folded/unfolded, grid sized, settings shown…).
  const home=document.querySelector('#content .reference-home');if(!home||typeof ResizeObserver!=='function')return;
  watcher?.disconnect();watcher=new ResizeObserver(()=>requestAnimationFrame(fit));
  for(const el of home.children)if(el.id!=='priorityBlock')watcher.observe(el);
 }
 function install(){
  if(!on()||typeof homeModulesMarkup!=='function')return;
  // Folding/unfolding the treasury re-lays the panel at once (no frame where it pushes the cards).
  if(typeof bankDialSetOpen==='function'){const baseFold=bankDialSetOpen;window.bankDialSetOpen=bankDialSetOpen=function(host,open){baseFold(host,open);fit();requestAnimationFrame(fit);};}
  const base=homeModulesMarkup;
  window.homeModulesMarkup=homeModulesMarkup=function(workspace,state){homeLayout.workspace=workspace;homeLayout.state=state;requestAnimationFrame(observeHomeGrids);setTimeout(sync,0);return pagesMarkup(base,workspace,state);};
  const baseUpdate=updateHomeGrid;
  window.updateHomeGrid=updateHomeGrid=function(workspace,state){
   const box=document.querySelector('#content .home-pages');if(!box)return baseUpdate(workspace,state);
   page=Math.round(box.scrollLeft/Math.max(1,box.clientWidth));
   const next=document.createElement('div');next.innerHTML=homeModulesMarkup(workspace,state);
   const sig=el=>el.dataset.layout+'#'+[...el.querySelectorAll('[data-module]')].map(n=>n.dataset.module+':'+(n.querySelector('.module-count')?.textContent||'')).join('|');
   const newBox=next.querySelector('.home-pages');if(!box.dataset.force&&sig(box)===sig(newBox))return;
   box.nextElementSibling?.classList.contains('home-page-dots')&&box.nextElementSibling.remove();
   box.replaceWith(...next.childNodes);sync();
  };
 }
 install();
 addEventListener('resize',()=>requestAnimationFrame(fit));
 document.addEventListener('DOMContentLoaded',()=>{const c=document.querySelector('#content');if(c)new MutationObserver(sync).observe(c,{childList:true});});
 return {on,sync,fit,orderedKeys,layout,setReserve};
})();
window.homePages=homePages;

// Reader actions in the function grid (user requests 21/10): while a message is open in the reader, the FIRST ROW
// of the function pages is a space reserved for its action buttons, drawn like the reader buttons (green main, grey
// others, red refuse, words written) and filling the whole row (1 wide button, 2 halves, many compact). The
// functions flow onto the next rows/pages meanwhile (setReserve), never hidden; normal order back on the home.
const homeActions=(()=>{
 const esc=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 let current=null;
 function place(){
  const home=document.querySelector('#content .reference-home'),row=home?.querySelector('.home-action-row'),box=home?.querySelector('.home-pages');
  if(!home||!row||!box)return;
  const pg=box.querySelectorAll('.home-page')[Math.round(box.scrollLeft/Math.max(1,box.clientWidth))]||box.querySelector('.home-page');
  const cols=Number(box.dataset.columns)||4,tiles=[...(pg?.children||[])].slice(0,cols);if(!tiles.length)return;
  const hr=home.getBoundingClientRect(),a=tiles[0].getBoundingClientRect(),z=tiles[tiles.length-1].getBoundingClientRect();
  // Horizontal place taken from the fixed pages box, not from a page that may be sliding.
  const br=box.getBoundingClientRect(),pr=pg.getBoundingClientRect(),x=br.left+(a.left-pr.left);
  row.style.top=(a.top-hr.top)+'px';row.style.left=(x-hr.left)+'px';row.style.width=(z.right-a.left)+'px';row.style.height=a.height+'px';
 }
 // Shows the actions; returns how many of them were placed in the reserved row (0 when there is no iPhone grid).
 function show(btns){
  const home=document.querySelector('#content .reference-home'),box=home?.querySelector('.home-pages');
  if(!home||!box||!homePages.on())return 0;
  // All the actions, in one row filling its whole width (21/10): 1 → one wide button, 2 → two halves, many → compact.
  const list=btns;current=btns;
  let row=home.querySelector('.home-action-row');
  if(!row){row=document.createElement('div');row.className='home-action-row';row.setAttribute('role','group');row.setAttribute('aria-label','Actions du message ouvert');home.append(row);
   row.addEventListener('click',e=>{const b=e.target.closest('[data-action-run]');if(!b||b.disabled)return;current?.[Number(b.dataset.actionRun)]?.run();});}
  row.classList.toggle('is-many',list.length>4);
  row.innerHTML=list.map((b,i)=>`<button type="button" class="reader-btn is-${b.kind==='main'||b.kind==='danger'||b.kind==='done'?b.kind:'second'}" data-action-run="${i}"${b.kind==='done'?' disabled aria-disabled="true"':''}>${esc(b.label)}</button>`).join('');
  home.classList.add('actions-in-grid');homePages.setReserve(true,true);
  place();requestAnimationFrame(place);
  return list.length;
 }
 function hide(){
  current=null;const home=document.querySelector('#content .reference-home');
  home?.querySelector('.home-action-row')?.remove();home?.classList.remove('actions-in-grid');homePages.setReserve(false);
 }
 addEventListener('resize',()=>requestAnimationFrame(place));
 return {show,hide,place};
})();
window.homeActions=homeActions;
