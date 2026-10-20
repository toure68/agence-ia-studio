'use strict';
// Phone habit (user request 2026-10-20): a phone number calls, an e-mail writes, an address opens the map.
// Under each filled phone / e-mail / address field of a window, a small button does it with the phone's own app
// (Téléphone, Mail, Plans or Google Maps). It follows what is typed and hides while the field is empty.
(()=>{
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const ICON={
  tel:'<path d="M6.6 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.1 6.1l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  map:'<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.4"/>'
 };
 function kind(el){
  if(el.type==='tel'||el.inputMode==='tel')return 'tel';
  if(el.type==='email'||el.inputMode==='email')return 'mail';
  if((el.getAttribute('autocomplete')||'')==='street-address')return 'map';
  return null;
 }
 function target(el,k){
  const v=(el.value||'').trim();
  if(k==='tel'){const n=v.replace(/[^\d+]/g,'');return n.replace(/\D/g,'').length>=6?{href:'tel:'+n,label:'Appeler '+v}:null;}
  if(k==='mail')return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?{href:'mailto:'+v,label:'Écrire à '+v}:null;
  if(v.length<4)return null;
  const city=el.form?.querySelector('[autocomplete="address-level2"]')?.value?.trim(),q=encodeURIComponent([v,city].filter(Boolean).join(', '));
  return {href:ios?'https://maps.apple.com/?q='+q:'https://www.google.com/maps/search/?api=1&query='+q,label:'Itinéraire',blank:true};
 }
 function sync(el){
  const k=el._contactKind,a=el._contactLink;if(!k||!a)return;
  const t=target(el,k);a.hidden=!t;if(!t)return;
  a.href=t.href;a.querySelector('span').textContent=t.label;a.setAttribute('aria-label',t.label);
  if(t.blank){a.target='_blank';a.rel='noopener';}
 }
 function wire(el){
  if(el._contactKind!==undefined)return;
  const k=kind(el);el._contactKind=k;if(!k||el.closest('#auth,.chat-composer,[data-no-contact]'))return;
  const a=document.createElement('a');a.className='contact-go is-'+k;a.hidden=true;
  a.innerHTML=`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICON[k]}</svg><span></span>`;
  el.after(a);el._contactLink=a;
  el.addEventListener('input',()=>sync(el));el.addEventListener('change',()=>sync(el));
  if(k==='map'){const city=el.form?.querySelector('[autocomplete="address-level2"]');city?.addEventListener('input',()=>sync(el));}
  sync(el);
 }
 let queued=false;
 function scan(){
  queued=false;
  document.querySelectorAll('#contextPanel input, #modalLayer:not(.hide) input, #contextPanel textarea[autocomplete="street-address"]').forEach(wire);
  // Values filled by code (a client chosen in a quote) do not fire "input": resync the visible links.
  document.querySelectorAll('#contextPanel input, #modalLayer:not(.hide) input').forEach(el=>{if(el._contactLink)sync(el);});
 }
 const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(scan);}};
 const start=()=>{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});document.addEventListener('change',schedule,true);schedule();};
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
})();
