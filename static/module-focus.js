'use strict';
// Function dial ("cadran des fonctions"): tapping a function on the home grid opens it in place,
// in the same frame as the grid, instead of switching screens. The grid and the reserve are hidden;
// a small strip of the other functions sits at the bottom to switch without leaving the frame.
// "Voir tout →" opens the full function (existing panel with its forms and details).
const moduleFocus={key:null,height:0,peek:new Map()};
const moduleFocusNew={clients:'client-new',leads:'quote-new',activities:'activity-new',calendar:'task-new',prospects:'prospect-new'};
const moduleFocusNewLabel={clients:'Nouveau client',leads:'Nouveau devis',activities:'Nouvelle activité',calendar:'Nouvelle tâche',prospects:'Nouveau prospect'};
function moduleFocusHome(){return document.querySelector('#content .reference-home');}
function moduleFocusModules(){
 const w=homeLayout.workspace,s=homeLayout.state||{};if(!w)return [];
 return homeGridModules(w,s).modules;
}
// App strip. Opened from an action card ("action mode", user request 2026-10-20): the strip only shows the
// functions that still have actions to do (with their count), so every action is handled from one window.
function moduleFocusStripKeys(key,modules){
 if(!moduleDock.actions)return modules;
 const counts=homeLayout.state?.action_counts||{},all=homeLayout.workspace?.modules||modules;
 return all.filter(m=>m.key===key||(counts[m.key]||0)>0);
}
function moduleFocusStrip(key,modules){
 const counts=homeLayout.state?.action_counts||{};
 return moduleFocusStripKeys(key,modules).map(m=>{const n=moduleDock.actions?counts[m.key]||0:0;return `<button type="button" class="focus-app tone-${moduleTone(m.key)}${m.key===key?' is-current':''}" data-focus-app="${m.key}" aria-label="${clean(m.label)}${n?` · ${n} à traiter`:''}" aria-pressed="${m.key===key}" title="${clean(m.label)}"><span class="focus-app-name" aria-hidden="true">${clean(({prospects:'Prospects','company-edit':'Identité',scanner:'Documents'})[m.key]||m.label)}</span><span class="module-icon" aria-hidden="true">${moduleIcon(m.key)}</span>${n?`<i class="focus-app-count" aria-hidden="true">${n>9?'9+':n}</i>`:''}</button>`;}).join('');
}
// In action mode, touching a function of the strip opens its actions (one: that action; several: their list).
function moduleFocusActionOpener(key){
 if(!moduleDock.actions||typeof openPriorityAction!=='function')return null;
 const members=moduleFocusActions(key);if(!members.length)return null;
 return members.length===1?()=>openPriorityAction(members[0]):()=>openPriorityGroup({module:key,members},company.id);
}
function moduleFocusMoney(minor,currency){try{return quoteMoney(minor,currency||'EUR');}catch{return String(minor/100);}}
function moduleFocusDate(value){
 if(!/^\d{4}-\d{2}-\d{2}/.test(value||''))return value||'';
 const d=new Date(value.slice(0,10)+'T12:00:00Z'),today=new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date())+'T12:00:00Z'),diff=Math.round((d-today)/86400000);
 if(diff===0)return 'aujourd’hui';if(diff===1)return 'demain';if(diff===-1)return 'hier';
 return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'Europe/Paris'}).format(d);
}
// Actions to do for this function (the same ones as the home action cards), shown first and tappable:
// a tap opens the action's window docked on the frame. Then the read-only lines.
function moduleFocusActions(key){const moduleOf=c=>(typeof priorityModules!=='undefined'&&priorityModules[c.action?.type])||c.action?.type||c.module;const seen=new Set();return (typeof priorityCards!=='undefined'?priorityCards:[]).filter(c=>{if(seen.has(c.key))return false;seen.add(c.key);return moduleOf(c)===key&&!c.fallback&&!c.example;});}
function moduleFocusRows(key){
 const actions=moduleFocusActions(key);
 const actionRows=actions.map((c,i)=>`<li><button type="button" class="focus-row is-action tone-${clean((typeof priorityPresentation==='function'?priorityPresentation(c).state:'warning')||'warning')}" data-focus-priority="${i}" style="--i:${i}"><span class="focus-dot" aria-hidden="true"></span><span class="focus-title" title="${clean(c.title)}">${clean(c.title)}</span><small>${clean(typeof priorityPresentation==='function'?priorityPresentation(c).label:'À traiter')}</small><b aria-hidden="true">›</b></button></li>`).join('');
 const peek=moduleFocus.peek.get(key);
 let lines='';
 if(!peek)lines=actions.length?'':'<li class="focus-skeleton"></li><li class="focus-skeleton"></li><li class="focus-skeleton"></li>';
 else if(peek.error)lines=actions.length?'':`<li class="focus-empty">${clean(peek.error)}</li>`;
 else{
  const titles=new Set(actions.map(c=>String(c.title).toLowerCase()));
  lines=peek.items.filter(it=>!titles.has(String(it.title).toLowerCase())).slice(0,Math.max(0,3-actions.length)).map((it,i)=>`<li class="focus-row tone-${clean(it.tone||'neutral')}" style="--i:${actions.length+i}"><span class="focus-dot" aria-hidden="true"></span><span class="focus-title" title="${clean(it.title)}">${clean(it.title)}</span><small>${clean(it.meta.replace(/\d{4}-\d{2}-\d{2}/g,moduleFocusDate))}</small>${it.amount_minor!=null?`<b>${clean(moduleFocusMoney(it.amount_minor,it.currency))}</b>`:''}</li>`).join('');
  if(!actions.length&&!lines)return '<p class="focus-empty">Rien à signaler pour le moment.</p>';
 }
 return `<ul class="focus-list${!peek&&!actions.length?' is-loading':''}">${actionRows}${lines}</ul>`;
}
async function moduleFocusLoad(key){
 if(moduleFocus.peek.has(key)&&!moduleFocus.peek.get(key).error)return;
 try{moduleFocus.peek.set(key,await api(`/api/companies/${company.id}/module-peek/${encodeURIComponent(key)}`));}
 catch{moduleFocus.peek.set(key,{error:'Aperçu indisponible · ouvrez la fonction pour le détail.',items:[]});}
 const body=document.querySelector('#moduleFocus [data-focus-rows]');
 if(body&&moduleFocus.key===key)body.innerHTML=moduleFocusRows(key);
}
function moduleFocusMarkup(key){
 const modules=moduleFocusModules(),w=homeLayout.workspace,s=homeLayout.state||{};
 const module=modules.find(m=>m.key===key)||w?.modules?.find(m=>m.key===key)||{key,label:key};
 const p=modulePresentation(key,s),widget=moduleWidget(key,s),count=(s.action_counts||{})[key]||0,id=['company-edit','team'].includes(key)?company.id:null;
 const status=count?`${count} à traiter`:p.label==='Normal'?'À jour':p.label;
 const statusTone=count||['danger','warning'].includes(p.state)?(p.state==='danger'?'is-danger':'is-warning'):'is-ok';
 const create=moduleFocusNew[key]?`<a class="focus-btn is-primary" data-focus-go="${moduleFocusNew[key]}" href="#/${moduleFocusNew[key]}">＋ ${clean(moduleFocusNewLabel[key])}</a>`:'';
 const strip=moduleFocusStrip(key,modules);
 return `<div class="focus-head"><button type="button" class="focus-back focus-apps-button" data-focus-close aria-label="Toutes les fonctions" title="Toutes les fonctions"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="currentColor"><circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></g></svg></button><span class="module-icon tone-${moduleTone(key)}" aria-hidden="true">${moduleIcon(key)}</span><h2 class="focus-title-main">${clean(module.label)}</h2><span class="focus-status ${statusTone}"><i aria-hidden="true"></i>${clean(status)}</span></div>
<div class="focus-kpis"><div><span>${clean(widget.label)}</span><b>${clean(widget.value)}</b></div><div><span>Actions</span><b>${count}</b></div><div><span>État</span><b class="focus-state">${clean(p.label==='Normal'?'Normal':p.label)}</b></div></div>
<div class="focus-body" data-focus-rows>${moduleFocusRows(key)}</div>
<div class="focus-actions${create?'':' is-single'}"><a class="focus-btn" data-focus-go="${key}" data-focus-open href="#/${key}${id?'/'+id:''}"${id?` data-company-id="${id}"`:''}>Voir tout →</a>${create}</div>
<nav class="focus-apps" aria-label="Autres fonctions">${strip}</nav>`;
}
// The frame takes exactly the grid's size (measured with the grid briefly shown, before any paint),
// whatever the function's content: the content adapts, the frame never grows.
function moduleFocusSize(){
 // The frame covers the whole function block (grid + "Réserve de fonctions" button): nothing around it moves.
 const home=moduleFocusHome(),grid=home?.querySelector('.module-grid:not(.module-reserve-grid-inline)'),frame=home?.querySelector('#moduleFocus');if(!grid||!frame)return;
 const key=home.dataset.moduleFocus;delete home.dataset.moduleFocus;frame.hidden=true;
 const launch=home.querySelector('.module-reserve-launch'),top=grid.getBoundingClientRect().top;
 const bottom=launch&&launch.getClientRects().length?launch.getBoundingClientRect().bottom:grid.getBoundingClientRect().bottom;
 const after=launch&&launch.getClientRects().length?parseFloat(getComputedStyle(launch).marginBottom)||0:parseFloat(getComputedStyle(grid).marginBottom)||0;
 frame.hidden=false;if(key)home.dataset.moduleFocus=key;
 const height=Math.round(bottom-top);
 if(height>0){frame.style.height=height+'px';frame.style.marginBottom=after+'px';}
}
addEventListener('resize',()=>{if(moduleFocus.key)moduleFocusSize();});
function moduleFocusOpen(key){
 const home=moduleFocusHome(),grid=home?.querySelector('.module-grid:not(.module-reserve-grid-inline)');if(!home||!grid)return false;
 let frame=home.querySelector('#moduleFocus');
 if(!frame){frame=document.createElement('section');frame.id='moduleFocus';frame.className='module-focus';frame.setAttribute('aria-live','polite');grid.before(frame);}
 const switching=!!moduleFocus.key&&moduleFocus.key!==key;
 moduleFocus.key=key;home.dataset.moduleFocus=key;
 moduleFocusSize();
 frame.setAttribute('aria-label',(moduleFocusModules().find(m=>m.key===key)?.label||key));
 frame.innerHTML=`<div class="focus-inner">${moduleFocusMarkup(key)}</div>`;
 frame.classList.remove('is-entering','is-switching');void frame.offsetWidth;frame.classList.add(switching?'is-switching':'is-entering');
 const reserve=home.querySelector('#homeReserve');if(reserve&&!reserve.hidden){reserve.hidden=true;home.querySelector('[data-reserve-toggle]')?.setAttribute('aria-expanded','false');}
 moduleFocusLoad(key);
 // Center the current function in the strip without moving the page.
 const current=frame.querySelector('.focus-app.is-current'),strip=frame.querySelector('.focus-apps');if(current&&strip)strip.scrollLeft=Math.max(0,current.offsetLeft-(strip.clientWidth-current.offsetWidth)/2);
 (switching?frame.querySelector(`[data-focus-app="${key}"]`):frame.querySelector('[data-focus-close]'))?.focus({preventScroll:true});
 return true;
}
function moduleFocusClose(){
 const home=moduleFocusHome(),key=moduleFocus.key;moduleFocus.key=null;
 if(!home)return;delete home.dataset.moduleFocus;home.querySelector('#moduleFocus')?.remove();
 if(key)home.querySelector(`.module-grid [data-go="${key}"]`)?.focus({preventScroll:true});
}
document.addEventListener('click',e=>{
 const home=e.target.closest('#content .reference-home,#cockpitContent .reference-home');if(!home)return;
 const tile=e.target.closest('.module-grid:not(.module-reserve-grid-inline) .module-tile[data-go]'),app=e.target.closest('[data-focus-app]'),close=e.target.closest('[data-focus-close]'),go=e.target.closest('[data-focus-go]');
 const act=e.target.closest('[data-focus-priority]');
 if(!tile&&!app&&!close&&!go&&!act)return;
 if(tile&&(e.metaKey||e.ctrlKey||e.shiftKey))return;
 if(tile&&tile.getAttribute('aria-disabled')==='true')return;
 e.preventDefault();e.stopImmediatePropagation();
 // A docked window is open over the frame: the app strip below it switches function directly.
 if(home.closest('#cockpitContent')){if(!app)return;return moduleFocusSwitch(app.dataset.focusApp);}
 if(close)return moduleFocusClose();
 if(act){const card=moduleFocusActions(moduleFocus.key)[Number(act.dataset.focusPriority)];if(card){moduleFocusDock();openPriorityAction(card);}return;}
 // Own attribute (not data-go) so the frame's buttons never clash with the full function's own links.
 if(go){moduleFocusDock();const route=go.dataset.focusGo;if(['task-new','activity-new'].includes(route))return openCommand(route==='task-new'?'task':'activity');return openTab(route,{companyId:go.dataset.companyId?Number(go.dataset.companyId):null});}
 const key=(tile||app).dataset.go||(tile||app).dataset.focusApp;
 moduleDock.actions=false; // a function opened from the grid: the strip shows every function
 if(!moduleFocusWindow(key))openTab(key);
},true);
// A function opens directly as its full window, docked on the frame (same place, same size), with the app strip
// below it. Tapping another app switches window; closing the window goes back to the home grid.
// `open` opens something else than the function's full view in that window (e.g. one action).
function moduleFocusWindow(key,open){
 if(!moduleFocusOpen(key))return false;
 const frame=document.querySelector('#moduleFocus');
 const r=frame.getBoundingClientRect();
 // The app strip must be on screen: a frame taller than the screen is aligned on its bottom (window above the strip).
 if(r.height>innerHeight-16){if(r.bottom>innerHeight-4||r.bottom<innerHeight-40)frame.scrollIntoView({block:'end'});}
 else if(r.top<8||r.bottom>innerHeight-8)frame.scrollIntoView({block:'center'});
 if(!moduleFocusDock()){moduleFocusClose();return false;} // too little room: the normal full window opens instead
 frame.classList.add('is-direct');moduleDock.direct=true;
 if(open)open();
 else{const id=['company-edit','team'].includes(key)?company.id:null;openTab(key,{companyId:id});}
 return true;
}
window.moduleFocusWindow=moduleFocusWindow;
// Another app touched while a window is open: close this window, let the navigation back to the home finish
// (history), then open the other function's window. Closing in between does not fold the frame.
function moduleFocusSwitch(key){
 moduleDock.switching=true;closeContext();
 navigationQueue.then(()=>navigationQueue).catch(()=>{}).then(()=>{moduleDock.switching=false;if(!moduleFocusWindow(key,moduleFocusActionOpener(key)))openTab(key);});
}
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape'||!moduleFocus.key||document.querySelector('#modalLayer:not(.hide)')||document.querySelector('#contextPanel'))return;
 e.preventDefault();moduleFocusClose();
});
// Second window (full function, form): opens exactly on the frame — same place, same size —
// with a back arrow and a "Déployer" button for when the whole screen is needed.
const moduleDock={armed:0,seen:false,direct:false,switching:false,preferExpanded:true,actions:false};
function moduleDockSetExpanded(on,remember){
 document.body.classList.toggle('dock-expanded',on);if(remember)moduleDock.preferExpanded=on;
 const shell=document.querySelector('#shell');if(shell&&document.querySelector('#contextLayer'))shell.inert=on;
 moduleDockBar(on);
 const expand=document.querySelector('#dockExpand');
 if(expand){expand.textContent=on?'⤡':'⤢';expand.setAttribute('aria-label',on?'Réduire sur le cadre':'Déployer en plein écran');expand.title=expand.getAttribute('aria-label');}
}
function moduleFocusDock(){
 const frame=document.querySelector('#moduleFocus');if(!frame)return false;
 // The app strip stays visible under the window: wherever you are, the other functions are one tap away.
 const strip=frame.querySelector('.focus-apps'),stripTop=strip&&strip.getClientRects().length?strip.getBoundingClientRect().top-6:null;
 // The window also takes the row just above the frame (Assistant IA): the assistant is then in the window header.
 const head=document.querySelector('.reference-home .home-modules-heading'),hr=head&&head.getClientRects().length?head.getBoundingClientRect():null;
 const r=frame.getBoundingClientRect(),top=Math.max(8,hr&&hr.bottom<=r.top+1&&r.top-hr.bottom<40?hr.top:r.top),bottom=Math.min(innerHeight-8,stripTop??r.bottom);
 // Not enough visible room on the frame: the window opens full screen — unless windows open maximized anyway
 // (default; the iPhone-style home has a small 4×2 function page), then the frame only anchors the window.
 if(bottom-top<260&&!(moduleDock.preferExpanded&&document.documentElement.classList.contains('home-ios')))return false;
 const s=document.documentElement.style;
 s.setProperty('--dock-top',top+'px');s.setProperty('--dock-left',r.left+'px');s.setProperty('--dock-width',r.width+'px');s.setProperty('--dock-height',(bottom-top)+'px');
 document.body.classList.add('dock-to-focus');document.body.classList.remove('dock-expanded');
 moduleDock.armed=Date.now();moduleDock.seen=false;
 return true;
}
function moduleDockSync(){
 if(!document.body.classList.contains('dock-to-focus'))return;
 const layer=document.querySelector('#contextLayer'),modal=document.querySelector('#modalLayer:not(.hide)');
 if(layer||modal){
  moduleDock.seen=true;
  // Docked (not deployed) window: the home around it, including the app strip, stays usable.
  const shell=document.querySelector('#shell');if(shell&&layer&&!modal)shell.inert=document.body.classList.contains('dock-expanded');
  const header=layer?.querySelector('.context-header');
  if(header&&!header.querySelector('#dockExpand')){
   const expand=document.createElement('button');expand.type='button';expand.id='dockExpand';expand.className='dock-expand';expand.setAttribute('aria-label','Déployer en plein écran');expand.title='Déployer en plein écran';expand.textContent='⤢';
   expand.onclick=()=>moduleDockSetExpanded(!document.body.classList.contains('dock-expanded'),true);
   header.append(expand);
   const apps=document.createElement('button');apps.type='button';apps.id='dockApps';apps.className='dock-apps';apps.setAttribute('aria-label','Toutes les fonctions');apps.title='Toutes les fonctions';
   apps.innerHTML=document.querySelector('#moduleFocus .focus-apps-button')?.innerHTML||'⋯';
   apps.onclick=()=>{closeContext();moduleFocusClose();};
   const back=document.createElement('button');back.type='button';back.id='dockBack';back.className='dock-back';
   back.onclick=()=>{if(moduleDockSteps()>1)history.back();else closeContext();};
   header.prepend(apps,back);
   // Assistant IA in the window header (the function name is already in the strip below): usable without closing.
   const assistant=document.createElement('button');assistant.type='button';assistant.id='dockAssistant';assistant.className='dock-assistant';
   assistant.setAttribute('aria-label','Ouvrir l’assistant IA');
   assistant.innerHTML='<span class="dock-assistant-spark" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="m9 2 2 5 5 2-5 2-2 5-2-5-5-2 5-2zM18 13l1.3 3.2 3.2 1.3-3.2 1.3L18 22l-1.3-3.2-3.2-1.3 3.2-1.3z"/></svg></span><b>Assistant IA</b><span class="dock-assistant-hint">· Poser une question</span>';
   assistant.onclick=()=>{if(typeof tab!=='undefined'&&tab==='assistant')return;openTab('assistant');};
   back.after(assistant);moduleDockCount();
   // Windows open maximized by default (background blurred, everything visible); ⤡ puts them back on the frame,
   // and that choice is kept for the next windows until the app is reloaded.
   if(moduleDock.preferExpanded)moduleDockSetExpanded(true);
   new MutationObserver(moduleDockCount).observe(layer,{childList:true,subtree:true});
  }
  // The strip follows the window on top (form sheet opened or closed).
  if(document.body.classList.contains('dock-expanded'))moduleDockBar(true);
 }else if(moduleDock.seen||Date.now()-moduleDock.armed>5000){document.body.classList.remove('dock-to-focus','dock-expanded','dock-keyboard');moduleDock.seen=false;moduleDockBar(false);if(moduleDock.direct&&!moduleDock.switching){moduleDock.direct=false;moduleDock.actions=false;moduleFocusClose();}}
}
// Full screen (⤢): the home is covered, so the same app strip is shown fixed under the window.
// Touching an app closes the window and switches the function dial, exactly like the strip on the dial.
function moduleDockBar(on){
 let bar=document.querySelector('#dockAppBar');
 if(!on){bar?.remove();return;}
 const source=document.querySelector('#moduleFocus .focus-apps');
 // Host: the window on top (a form sheet if one is open, otherwise the function window).
 const host=document.querySelector('#modalLayer:not(.hide) .modal')||document.querySelector('#contextPanel');
 if(!source||!host){bar?.remove();return;}
 if(!bar){
  bar=document.createElement('nav');bar.id='dockAppBar';bar.className='reference-home dock-app-bar'+(moduleDock.actions?' is-actions':'');bar.setAttribute('aria-label',moduleDock.actions?'Fonctions avec des actions à traiter':'Toutes les fonctions');
  bar.innerHTML=source.innerHTML;
  bar.addEventListener('click',e=>{
   const app=e.target.closest('[data-focus-app]');if(!app)return;
   e.preventDefault();const key=app.dataset.focusApp;
   document.body.classList.remove('dock-expanded');moduleDockBar(false);if(document.querySelector('#modalLayer:not(.hide)'))closeModal();moduleFocusSwitch(key);
  });
 }
 if(bar.parentElement!==host){
  host.append(bar);
  if(host.matches('.modal')){const cs=getComputedStyle(host);bar.style.marginLeft='-'+cs.paddingLeft;bar.style.marginRight='-'+cs.paddingRight;}
  else{bar.style.marginLeft='';bar.style.marginRight='';}
  const current=bar.querySelector('.is-current');if(current)bar.scrollLeft=Math.max(0,current.offsetLeft-(bar.clientWidth-current.offsetWidth)/2);
 }
}
// Action cards (green buttons on home): the action's window opens directly, docked exactly like a function
// window, with the app strip below.
async function moduleFocusFromPriority(module,open){
 const known=(homeLayout.workspace?.modules||[]).some(m=>m.key===module);
 if(!known)return false;
 moduleDock.actions=true;
 const ok=moduleFocusWindow(module,open);if(!ok)moduleDock.actions=false;
 return ok;
}
window.moduleFocusFromPriority=moduleFocusFromPriority;
window.moduleFocusDock=moduleFocusDock;
// One back button, iOS style: a large chevron, with a small number of the steps back to the function frame.
function moduleDockSteps(){try{return Math.max(1,(history.state?.aiaDepth||0)-(contextState?.depth||0));}catch{return 1;}}
function moduleDockCount(){
 const back=document.querySelector('#dockBack');if(!back)return;
 const n=moduleDockSteps();
 if(back.dataset.n!==String(n)){back.dataset.n=n;back.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M15 4.5 7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="dock-back-n">'+n+'</span>';}
 back.setAttribute('aria-label',n>1?`Revenir en arrière (${n} étapes jusqu’à la fonction)`:'Revenir à la fonction');
}
addEventListener('popstate',()=>setTimeout(moduleDockCount,0));
// Typing in a docked window: while the keyboard is open, the window leaves the frame and fills the whole
// visible area between the top of the screen and the keyboard, with the active field kept in view.
// When the keyboard closes, it goes back exactly onto the function frame.
function moduleDockKeyboard(){
 const vv=window.visualViewport,active=document.activeElement;
 const typing=!!active&&active.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,select,[contenteditable="true"]')&&!!active.closest('#contextPanel,#modalLayer .modal');
 const keyboard=!!vv&&innerHeight-vv.height>120;
 // Typing mode, for every window and form: the window takes the whole visible area above the keyboard, the
 // non-essential parts (close bar, handle, speaker) step aside, and the active field is brought to the middle.
 const kb=typing&&keyboard;
 document.body.classList.toggle('kb-open',kb);
 const on=document.body.classList.contains('dock-to-focus')&&kb;
 document.body.classList.toggle('dock-keyboard',on);
 if(kb)requestAnimationFrame(()=>active.scrollIntoView({block:'center',inline:'nearest'}));
}
window.visualViewport?.addEventListener('resize',moduleDockKeyboard,{passive:true});
window.visualViewport?.addEventListener('scroll',moduleDockKeyboard,{passive:true});
document.addEventListener('focusin',()=>setTimeout(moduleDockKeyboard,60));
document.addEventListener('focusout',()=>setTimeout(moduleDockKeyboard,60));
new MutationObserver(moduleDockSync).observe(document.body,{childList:true,subtree:false});
{const m=document.querySelector('#modalLayer');if(m)new MutationObserver(moduleDockSync).observe(m,{attributes:true,attributeFilter:['class'],childList:true});}
// The home is rebuilt when the dashboard is opened again: start from the grid.
new MutationObserver(()=>{if(moduleFocus.key&&!document.querySelector('#moduleFocus'))moduleFocus.key=null;}).observe(document.documentElement,{childList:true,subtree:true});
