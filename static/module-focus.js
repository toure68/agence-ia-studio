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
 const create=moduleFocusNew[key]?`<a class="focus-btn is-primary" data-focus-go="${moduleFocusNew[key]}" href="#/${moduleFocusNew[key]}"><span aria-hidden="true">＋</span> ${clean(moduleFocusNewLabel[key])}</a>`:'';
 const strip=modules.map(m=>`<button type="button" class="focus-app tone-${moduleTone(m.key)}${m.key===key?' is-current':''}" data-focus-app="${m.key}" aria-label="${clean(m.label)}" aria-pressed="${m.key===key}" title="${clean(m.label)}"><span class="module-icon" aria-hidden="true">${moduleIcon(m.key)}</span></button>`).join('');
 return `<div class="focus-head"><button type="button" class="focus-back" data-focus-close aria-label="Revenir aux fonctions">‹</button><span class="module-icon tone-${moduleTone(key)}" aria-hidden="true">${moduleIcon(key)}</span><h2 class="focus-title-main">${clean(module.label)}</h2><span class="focus-status ${statusTone}"><i aria-hidden="true"></i>${clean(status)}</span></div>
<div class="focus-kpis"><div><span>${clean(widget.label)}</span><b>${clean(widget.value)}</b></div><div><span>À traiter</span><b>${count}</b></div><div><span>État</span><b class="focus-state">${clean(p.label==='Normal'?'Normal':p.label)}</b></div></div>
<div class="focus-body" data-focus-rows>${moduleFocusRows(key)}</div>
<div class="focus-actions${create?'':' is-single'}"><a class="focus-btn" data-focus-go="${key}" data-focus-open href="#/${key}${id?'/'+id:''}"${id?` data-company-id="${id}"`:''}>Voir tout →</a>${create}</div>
<nav class="focus-apps" aria-label="Autres fonctions">${strip}</nav>`;
}
function moduleFocusOpen(key){
 const home=moduleFocusHome(),grid=home?.querySelector('.module-grid:not(.module-reserve-grid-inline)');if(!home||!grid)return false;
 if(!moduleFocus.key)moduleFocus.height=Math.round(grid.getBoundingClientRect().height);
 let frame=home.querySelector('#moduleFocus');
 if(!frame){frame=document.createElement('section');frame.id='moduleFocus';frame.className='module-focus';frame.setAttribute('aria-live','polite');grid.before(frame);}
 const switching=!!moduleFocus.key&&moduleFocus.key!==key;
 moduleFocus.key=key;home.dataset.moduleFocus=key;
 frame.style.minHeight=Math.max(moduleFocus.height,360)+'px';
 frame.setAttribute('aria-label',(moduleFocusModules().find(m=>m.key===key)?.label||key));
 frame.innerHTML=moduleFocusMarkup(key);
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
 const home=e.target.closest('#content .reference-home');if(!home)return;
 const tile=e.target.closest('.module-grid:not(.module-reserve-grid-inline) .module-tile[data-go]'),app=e.target.closest('[data-focus-app]'),close=e.target.closest('[data-focus-close]'),go=e.target.closest('[data-focus-go]');
 if(!tile&&!app&&!close&&!go)return;
 if(tile&&(e.metaKey||e.ctrlKey||e.shiftKey))return;
 if(tile&&tile.getAttribute('aria-disabled')==='true')return;
 e.preventDefault();e.stopImmediatePropagation();
 if(close)return moduleFocusClose();
 // Own attribute (not data-go) so the frame's buttons never clash with the full function's own links.
 if(go){const route=go.dataset.focusGo;if(['task-new','activity-new'].includes(route))return openCommand(route==='task-new'?'task':'activity');return openTab(route,{companyId:go.dataset.companyId?Number(go.dataset.companyId):null});}
 const key=(tile||app).dataset.go||(tile||app).dataset.focusApp;
 if(!moduleFocusOpen(key))openTab(key);
},true);
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape'||!moduleFocus.key||document.querySelector('#modalLayer:not(.hide)')||document.querySelector('#contextPanel'))return;
 e.preventDefault();moduleFocusClose();
});
// The home is rebuilt when the dashboard is opened again: start from the grid.
new MutationObserver(()=>{if(moduleFocus.key&&!document.querySelector('#moduleFocus'))moduleFocus.key=null;}).observe(document.documentElement,{childList:true,subtree:true});
