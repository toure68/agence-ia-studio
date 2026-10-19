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
function moduleFocusMoney(minor,currency){try{return quoteMoney(minor,currency||'EUR');}catch{return String(minor/100);}}
function moduleFocusDate(value){
 if(!/^\d{4}-\d{2}-\d{2}/.test(value||''))return value||'';
 const d=new Date(value.slice(0,10)+'T12:00:00Z'),today=new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date())+'T12:00:00Z'),diff=Math.round((d-today)/86400000);
 if(diff===0)return 'aujourd’hui';if(diff===1)return 'demain';if(diff===-1)return 'hier';
 return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'Europe/Paris'}).format(d);
}
function moduleFocusRows(key){
 const peek=moduleFocus.peek.get(key);
 if(!peek)return '<ul class="focus-list is-loading" aria-busy="true"><li class="focus-skeleton"></li><li class="focus-skeleton"></li><li class="focus-skeleton"></li></ul>';
 if(peek.error)return `<p class="focus-empty">${clean(peek.error)}</p>`;
 if(!peek.items.length)return '<p class="focus-empty">Rien à signaler pour le moment.</p>';
 return `<ul class="focus-list">${peek.items.map((it,i)=>`<li class="focus-row tone-${clean(it.tone||'neutral')}" style="--i:${i}"><span class="focus-dot" aria-hidden="true"></span><span class="focus-title" title="${clean(it.title)}">${clean(it.title)}</span><small>${clean(it.meta.replace(/\d{4}-\d{2}-\d{2}/g,moduleFocusDate))}</small>${it.amount_minor!=null?`<b>${clean(moduleFocusMoney(it.amount_minor,it.currency))}</b>`:''}</li>`).join('')}</ul>`;
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
 const strip=modules.map(m=>`<button type="button" class="focus-app tone-${moduleTone(m.key)}${m.key===key?' is-current':''}" data-focus-app="${m.key}" aria-label="${clean(m.label)}" aria-pressed="${m.key===key}" title="${clean(m.label)}"><span class="focus-app-name" aria-hidden="true">${clean(({prospects:'Prospects','company-edit':'Identité',scanner:'Documents'})[m.key]||m.label)}</span><span class="module-icon" aria-hidden="true">${moduleIcon(m.key)}</span></button>`).join('');
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
 if(!tile&&!app&&!close&&!go)return;
 if(tile&&(e.metaKey||e.ctrlKey||e.shiftKey))return;
 if(tile&&tile.getAttribute('aria-disabled')==='true')return;
 e.preventDefault();e.stopImmediatePropagation();
 // A docked window is open over the frame: the app strip below it switches function directly.
 if(home.closest('#cockpitContent')){if(!app)return;closeContext();}
 if(close)return moduleFocusClose();
 // Own attribute (not data-go) so the frame's buttons never clash with the full function's own links.
 if(go){moduleFocusDock();const route=go.dataset.focusGo;if(['task-new','activity-new'].includes(route))return openCommand(route==='task-new'?'task':'activity');return openTab(route,{companyId:go.dataset.companyId?Number(go.dataset.companyId):null});}
 const key=(tile||app).dataset.go||(tile||app).dataset.focusApp;
 if(!moduleFocusOpen(key))openTab(key);
},true);
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape'||!moduleFocus.key||document.querySelector('#modalLayer:not(.hide)')||document.querySelector('#contextPanel'))return;
 e.preventDefault();moduleFocusClose();
});
// Second window (full function, form): opens exactly on the frame — same place, same size —
// with a back arrow and a "Déployer" button for when the whole screen is needed.
const moduleDock={armed:0,seen:false};
function moduleFocusDock(){
 const frame=document.querySelector('#moduleFocus');if(!frame)return;
 // The app strip stays visible under the window: wherever you are, the other functions are one tap away.
 const strip=frame.querySelector('.focus-apps'),stripTop=strip&&strip.getClientRects().length?strip.getBoundingClientRect().top-6:null;
 const r=frame.getBoundingClientRect(),top=Math.max(8,r.top),bottom=Math.min(innerHeight-8,stripTop??r.bottom);
 if(bottom-top<260)return; // not enough visible room: the window opens full screen
 const s=document.documentElement.style;
 s.setProperty('--dock-top',top+'px');s.setProperty('--dock-left',r.left+'px');s.setProperty('--dock-width',r.width+'px');s.setProperty('--dock-height',(bottom-top)+'px');
 document.body.classList.add('dock-to-focus');document.body.classList.remove('dock-expanded');
 moduleDock.armed=Date.now();moduleDock.seen=false;
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
   expand.onclick=()=>{document.body.classList.toggle('dock-expanded');const shell=document.querySelector('#shell');if(shell)shell.inert=document.body.classList.contains('dock-expanded');expand.textContent=document.body.classList.contains('dock-expanded')?'⤡':'⤢';expand.setAttribute('aria-label',document.body.classList.contains('dock-expanded')?'Revenir au cadre':'Déployer en plein écran');};
   header.append(expand);
   const apps=document.createElement('button');apps.type='button';apps.id='dockApps';apps.className='dock-apps';apps.setAttribute('aria-label','Toutes les fonctions');apps.title='Toutes les fonctions';
   apps.innerHTML=document.querySelector('#moduleFocus .focus-apps-button')?.innerHTML||'⋯';
   apps.onclick=()=>{closeContext();moduleFocusClose();};
   const back=document.createElement('button');back.type='button';back.id='dockBack';back.className='dock-back';
   back.onclick=()=>{if(moduleDockSteps()>1)history.back();else closeContext();};
   header.prepend(apps,back);moduleDockCount();
   new MutationObserver(moduleDockCount).observe(layer,{childList:true,subtree:true});
  }
 }else if(moduleDock.seen||Date.now()-moduleDock.armed>5000){document.body.classList.remove('dock-to-focus','dock-expanded','dock-keyboard');moduleDock.seen=false;}
}
// Action cards (green buttons on home): open the matching function in the function dial, bring it into view,
// then the action's window docks on it exactly as if it had been opened from the dial itself.
async function moduleFocusFromPriority(module){
 const known=(homeLayout.workspace?.modules||[]).some(m=>m.key===module);
 if(!known||!moduleFocusOpen(module))return false;
 const frame=document.querySelector('#moduleFocus');if(!frame)return false;
 const r=frame.getBoundingClientRect();
 if(r.top<8||r.bottom>innerHeight-8){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  frame.scrollIntoView({block:r.height>innerHeight-16?'start':'center',behavior:reduce?'auto':'smooth'});
  await new Promise(resolve=>setTimeout(resolve,reduce?30:420));
 }
 moduleFocusDock();
 return true;
}
window.moduleFocusFromPriority=moduleFocusFromPriority;
window.moduleFocusDock=moduleFocusDock;
// One back button that says how many steps lead back to the function frame ("‹ 3").
function moduleDockSteps(){try{return Math.max(1,(history.state?.aiaDepth||0)-(contextState?.depth||0));}catch{return 1;}}
function moduleDockCount(){
 const back=document.querySelector('#dockBack');if(!back)return;
 const n=moduleDockSteps(),text=`‹ ${n}`;
 if(back.textContent!==text)back.textContent=text;
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
 const on=document.body.classList.contains('dock-to-focus')&&typing&&keyboard;
 document.body.classList.toggle('dock-keyboard',on);
 if(on)requestAnimationFrame(()=>active.scrollIntoView({block:'nearest',inline:'nearest'}));
}
window.visualViewport?.addEventListener('resize',moduleDockKeyboard,{passive:true});
window.visualViewport?.addEventListener('scroll',moduleDockKeyboard,{passive:true});
document.addEventListener('focusin',()=>setTimeout(moduleDockKeyboard,60));
document.addEventListener('focusout',()=>setTimeout(moduleDockKeyboard,60));
new MutationObserver(moduleDockSync).observe(document.body,{childList:true,subtree:false});
{const m=document.querySelector('#modalLayer');if(m)new MutationObserver(moduleDockSync).observe(m,{attributes:true,attributeFilter:['class']});}
// The home is rebuilt when the dashboard is opened again: start from the grid.
new MutationObserver(()=>{if(moduleFocus.key&&!document.querySelector('#moduleFocus'))moduleFocus.key=null;}).observe(document.documentElement,{childList:true,subtree:true});
