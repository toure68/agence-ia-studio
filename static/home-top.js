'use strict';
// Home top, cleaned (user request 2026-10-20): no greeting, no date chip, no action-count chip, no top header on
// the home. The Assistant IA bar is at the very top and stays fixed while the home scrolls, with the account
// menu (réglages) right next to it. The date lives on the treasury card / the reader (a small tab on the card's
// top edge, same place in both). In the réglages: « Grille des fonctions » (columns/rows chooser, set once) and
// « Entreprise » (only when the account has several companies).
// Windows keep their own assistant in their header (#dockAssistant), so the assistant is always reachable.
const homeTop=(()=>{
 function dateLabel(){const d=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Paris'}).format(new Date());return d.charAt(0).toUpperCase()+d.slice(1);}
 const menu=()=>document.querySelector('.account-menu');
 const headerRow=()=>document.querySelector('.top .row');
 // The account menu sits in the home bar while the home is shown, back in the top header elsewhere.
 function placeMenu(){
  const m=menu();if(!m)return;
  const slot=document.querySelector('#content .home-account-slot');
  if(slot){if(m.parentElement!==slot)slot.append(m);}
  else if(headerRow()&&m.parentElement!==headerRow()){m.removeAttribute('open');headerRow().append(m);}
 }
 function placeCompany(){
  const select=document.querySelector('#companySelect'),panel=document.querySelector('.account-panel');if(!select||!panel)return;
  let row=panel.querySelector('.account-company');
  if(!row){row=document.createElement('label');row.className='account-company';row.innerHTML='<span>Entreprise</span>';panel.prepend(row);}
  if(select.parentElement!==row)row.append(select);
  row.hidden=select.options.length<=1;
 }
 function gridItem(){
  const panel=document.querySelector('.account-panel');if(!panel)return;
  let b=panel.querySelector('#accountGrid');
  if(!b){b=document.createElement('button');b.id='accountGrid';b.type='button';b.className='btn small';b.textContent='Grille des fonctions';
   b.onclick=()=>{menu()?.removeAttribute('open');const t=document.querySelector('#content [data-columns-toggle]');
    if(!t){notify('Ouvrez l’accueil pour régler la grille.');return;}
    // After this click has finished bubbling (the chooser closes on outside clicks).
    setTimeout(()=>{if(t.getAttribute('aria-expanded')!=='true')t.click();document.querySelector('#homeColumnChooser')?.scrollIntoView({block:'center',behavior:'smooth'});},0);};
   panel.querySelector('#accountWallpaper')?.after(b)||panel.append(b);}
  b.hidden=!document.querySelector('#content .reference-home');
 }
 function stampDate(){
  const label=dateLabel();
  document.querySelector('#homeTreasury')?.setAttribute('data-date',label);
  document.querySelectorAll('#content .home-reader').forEach(r=>r.setAttribute('data-date',label));
 }
 function sync(){placeMenu();placeCompany();gridItem();stampDate();}
 function start(){
  const content=document.querySelector('#content');if(!content)return;
  new MutationObserver(()=>sync()).observe(content,{childList:true,subtree:false});
  const select=document.querySelector('#companySelect');
  if(select)new MutationObserver(()=>placeCompany()).observe(select,{childList:true});
  sync();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
 return {sync,dateLabel,stampDate};
})();
window.homeTop=homeTop;
