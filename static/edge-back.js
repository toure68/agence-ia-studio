'use strict';
// Swipe from the left edge towards the right = back one step (iPhone / Android habit), like the ‹ button.
// In a Safari tab the browser already does it (and our steps follow the history); the app opened from the home
// screen has no such gesture, so it is added only there. At the first step it closes the window (home grid).
(()=>{
 const enabled=()=>window.__edgeBackForce===true||navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
 let start=null,hint=null;
 function back(){
  if(document.querySelector('#modalLayer:not(.hide) .modal')){closeModal();return;}
  const dock=document.querySelector('#dockBack');
  if(dock&&dock.getClientRects().length){dock.click();return;}
  if(document.querySelector('#contextPanel')){goBack();return;}
  if(typeof tab!=='undefined'&&tab!=='dashboard')goBack();
 }
 function showHint(dx){
  if(!hint){hint=document.createElement('div');hint.className='edge-back-hint';hint.setAttribute('aria-hidden','true');hint.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 4.5 7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';document.body.append(hint);}
  const p=Math.max(0,Math.min(1,dx/80));hint.style.opacity=p;hint.style.transform=`translate(${Math.round(p*18)}px,-50%) scale(${.7+p*.3})`;
 }
 function hideHint(){hint?.remove();hint=null;}
 addEventListener('touchstart',e=>{
  if(!enabled()||e.touches.length!==1){start=null;return;}
  const t=e.touches[0];start=t.clientX<=24?{x:t.clientX,y:t.clientY}:null;
 },{passive:true,capture:true});
 addEventListener('touchmove',e=>{
  if(!start)return;const t=e.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
  if(Math.abs(dy)>16&&Math.abs(dy)>dx){start=null;hideHint();return;} // vertical: it is a scroll
  if(dx>8)showHint(dx);
 },{passive:true,capture:true});
 addEventListener('touchend',e=>{
  if(!start)return;const t=e.changedTouches[0],dx=t.clientX-start.x,dy=Math.abs(t.clientY-start.y);start=null;hideHint();
  if(dx>70&&dy<dx*0.6)back();
 },{passive:true,capture:true});
 addEventListener('touchcancel',()=>{start=null;hideHint();},{passive:true,capture:true});
 window.edgeBack=back;
})();
