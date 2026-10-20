'use strict';
// Accueil façon iPhone (user request 2026-10-20), on by default (localStorage aia-pages=off restores the previous
// layout; the older UI tests use it):
// - the home never scrolls vertically: everything fits one screen (only pulling down refreshes);
// - top: the réglages shown directly as small icons (no menu to open);
// - middle: treasury + exactly 4 small cards, or the reader + exactly 2 (reader.js), never cut in half;
// - functions: pages of 4 × 3 squares swiped sideways like iPhone home screens, with dots; the functions that
//   have an action to do are always on the first page (they take the place of quiet ones); iOS-style red
//   number badges; no « Réserve de fonctions » button;
// - bottom: the Assistant IA bar.
// Opening a function keeps the existing window and its function strip fixed at the bottom (swipe sideways only).
const homePages=(()=>{
 const KEY='aia-pages',PER=12,COLS=4; // 4 columns × 3 rows per page (user decision 2026-10-20)
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
 function pagesMarkup(base,workspace,state){
  const ws={...workspace,columns:COLS,rows:10,dynamic:false,visible:orderedKeys(workspace,state)};
  const html=base(ws,state);homeLayout.workspace=workspace; // the real layout stays the saved one
  const box=document.createElement('div');box.innerHTML=html;
  const cards=[...box.querySelector('.module-grid').children],pages=[];
  for(let i=0;i<cards.length;i+=PER)pages.push(cards.slice(i,i+PER));
  const at=Math.min(page,Math.max(0,pages.length-1));
  return `<div class="module-grid home-pages" data-columns="${COLS}" aria-label="Fonctions, balayez pour la page suivante">${pages.map((p,i)=>`<nav class="module-grid home-page" data-columns="${COLS}" data-page="${i}" aria-label="Fonctions, page ${i+1} sur ${pages.length}">${p.map(c=>c.outerHTML).join('')}</nav>`).join('')}</div><div class="home-page-dots" role="tablist" aria-label="Pages de fonctions">${pages.map((_,i)=>`<button type="button" role="tab" class="home-page-dot" data-page-dot="${i}" aria-label="Page ${i+1}" aria-selected="${i===at}"></button>`).join('')}</div>`;
 }
 function wirePages(){
  const box=document.querySelector('.home-pages');if(!box||box.dataset.wired)return;box.dataset.wired='1';
  const dots=[...document.querySelectorAll('.home-page-dot')];
  requestAnimationFrame(()=>{box.scrollLeft=page*box.clientWidth;});
  let raf=0;box.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
   page=Math.round(box.scrollLeft/Math.max(1,box.clientWidth));dots.forEach((d,i)=>d.setAttribute('aria-selected',String(i===page)));});},{passive:true});
  dots.forEach(d=>d.onclick=()=>box.scrollTo({left:Number(d.dataset.pageDot)*box.clientWidth,behavior:'smooth'}));
 }

 // Réglages as icons, straight on the home (each one does what its menu entry does).
 const I=p=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
 const SETTINGS=[
  {id:'accountWallpaper',label:'Fond',icon:I('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>')},
  {id:'accountReader',label:'Lecteur',icon:I('<rect x="4" y="3" width="16" height="7" rx="2"/><path d="M4 14h16M4 18h10"/>'),sw:true},
  {id:'accountSpeech',label:'Voix',icon:I('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>')},
  {id:'accountReaderSamples',label:'Essais',icon:I('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/>'),sw:true},
  {id:'accountTools',label:'Outils',icon:I('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>')},
  {id:'accountAudit',label:'Conformité',icon:I('<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>')},
  {id:'company',label:'Entreprise',icon:I('<path d="M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M3 21h18"/>')},
  {id:'passwordBtn',label:'Mot de passe',icon:I('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l2 2"/>')},
  {id:'logout',label:'Quitter',icon:I('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>')}
 ];
 function chooseCompany(){
  const select=document.querySelector('#companySelect');if(!select)return;
  openModal(`<h2>Entreprise</h2><div class="stack company-pick">${[...select.options].map(o=>`<button type="button" class="btn${o.selected?' primary':''}" data-pick-company="${clean(o.value)}">${clean(o.title||o.textContent)}</button>`).join('')}</div>`);
  document.querySelectorAll('[data-pick-company]').forEach(b=>b.onclick=()=>{closeModal();select.value=b.dataset.pickCompany;select.dispatchEvent(new Event('change'));});
 }
 function settingsRow(){
  const home=document.querySelector('#content .reference-home,#cockpitContent .reference-home');if(!home)return;
  let row=home.querySelector('.home-settings');
  if(!row){row=document.createElement('nav');row.className='home-settings';row.setAttribute('aria-label','Réglages');home.prepend(row);
   row.innerHTML=SETTINGS.map(s=>`<button type="button" class="home-setting" data-setting="${s.id}" title="${s.label}">${s.icon}<span>${s.label}</span></button>`).join('');
   row.addEventListener('click',e=>{const b=e.target.closest('[data-setting]');if(!b)return;const id=b.dataset.setting;
    if(id==='company')return chooseCompany();
    const target=document.getElementById(id);if(!target)return notify('Réglage indisponible ici.');
    target.click();setTimeout(syncSettings,50);});}
  syncSettings();
 }
 function syncSettings(){
  document.querySelectorAll('.home-setting').forEach(b=>{
   const id=b.dataset.setting,s=SETTINGS.find(x=>x.id===id),target=document.getElementById(id);
   if(id==='company'){b.hidden=(document.querySelector('#companySelect')?.options.length||0)<=1;return;}
   b.hidden=!target||target.hidden||target.classList.contains('hide');
   if(s.sw){const active=target?.getAttribute('aria-checked')==='true';b.classList.toggle('is-on',active);b.setAttribute('aria-pressed',String(active));
    b.setAttribute('aria-label',(target?.textContent||s.label));}
   else b.setAttribute('aria-label',target?.textContent||s.label);
  });
 }

 // One screen: the cards list gets the room left once everything else is laid out.
 // One screen: the home is exactly the visible height; the function pages take what is left (CSS flex).
 function fit(){
  const home=document.querySelector('#content .reference-home');if(!home||!on())return;
  const top=home.getBoundingClientRect().top+scrollY,h=Math.max(480,innerHeight-top);
  home.style.setProperty('--home-ios-height',h+'px');
 }
 let watcher=null;
 function sync(){if(!on())return;settingsRow();wirePages();requestAnimationFrame(fit);setTimeout(fit,350);
  // Re-fit when a block changes height (treasury folded/unfolded, grid sized, settings shown…).
  const home=document.querySelector('#content .reference-home');if(!home||typeof ResizeObserver!=='function')return;
  watcher?.disconnect();watcher=new ResizeObserver(()=>requestAnimationFrame(fit));
  for(const el of home.children)if(el.id!=='priorityBlock')watcher.observe(el);
 }
 function install(){
  if(!on()||typeof homeModulesMarkup!=='function')return;
  const base=homeModulesMarkup;
  window.homeModulesMarkup=homeModulesMarkup=function(workspace,state){homeLayout.workspace=workspace;homeLayout.state=state;requestAnimationFrame(observeHomeGrids);setTimeout(sync,0);return pagesMarkup(base,workspace,state);};
  const baseUpdate=updateHomeGrid;
  window.updateHomeGrid=updateHomeGrid=function(workspace,state){
   const box=document.querySelector('#content .home-pages');if(!box)return baseUpdate(workspace,state);
   page=Math.round(box.scrollLeft/Math.max(1,box.clientWidth));
   const next=document.createElement('div');next.innerHTML=homeModulesMarkup(workspace,state);
   const sig=el=>[...el.querySelectorAll('[data-module]')].map(n=>n.dataset.module+':'+(n.querySelector('.module-count')?.textContent||'')).join('|');
   const newBox=next.querySelector('.home-pages');if(sig(box)===sig(newBox))return;
   box.nextElementSibling?.classList.contains('home-page-dots')&&box.nextElementSibling.remove();
   box.replaceWith(...next.childNodes);sync();
  };
 }
 install();
 addEventListener('resize',()=>requestAnimationFrame(fit));
 document.addEventListener('DOMContentLoaded',()=>{const c=document.querySelector('#content');if(c)new MutationObserver(sync).observe(c,{childList:true});});
 return {on,sync,fit,orderedKeys};
})();
window.homePages=homePages;
