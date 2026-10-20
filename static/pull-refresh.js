'use strict';
// Pull the home down to refresh it (Mail / WhatsApp habit), in the app opened from the home screen only:
// a Safari tab already reloads the page by itself. Windows keep their own habit: pulling them down closes them.
(()=>{
 const enabled=()=>window.__pullRefreshForce===true||navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
 const LIMIT=72;
 let start=null,dist=0,busy=false,spot=null;
 const onHome=()=>typeof tab!=='undefined'&&tab==='dashboard'&&!document.querySelector('#contextLayer')&&!document.querySelector('#modalLayer:not(.hide)')&&!document.body.classList.contains('dock-to-focus');
 function show(p){
  if(!spot){spot=document.createElement('div');spot.className='pull-refresh';spot.setAttribute('aria-hidden','true');spot.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/></svg>';document.body.append(spot);}
  spot.style.opacity=Math.min(1,p*1.4);spot.style.transform=`translate(-50%,${Math.round(p*56)}px) rotate(${Math.round(p*270)}deg)`;spot.classList.toggle('is-ready',p>=1);
 }
 function hide(){if(!spot)return;const s=spot;spot=null;s.style.opacity=0;setTimeout(()=>s.remove(),200);}
 addEventListener('touchstart',e=>{
  start=null;if(busy||!enabled()||e.touches.length!==1||!onHome()||(document.scrollingElement?.scrollTop||scrollY)>0)return;
  if(e.target.closest('input,textarea,select,.focus-apps,.priority-rail,.module-focus,[data-no-pull]'))return;
  start={x:e.touches[0].clientX,y:e.touches[0].clientY};dist=0;
 },{passive:true});
 addEventListener('touchmove',e=>{
  if(!start)return;const t=e.touches[0],dy=t.clientY-start.y,dx=t.clientX-start.x;
  if(dy<=0||Math.abs(dx)>dy){if(dist>0)hide();start=null;return;}
  dist=dy*.5;show(Math.min(1.15,dist/LIMIT));
 },{passive:true});
 addEventListener('touchend',async()=>{
  if(!start)return;start=null;
  if(dist<LIMIT){hide();return;}
  busy=true;show(1);spot?.classList.add('is-busy');
  try{if(typeof refreshCockpit==='function')await refreshCockpit();}catch(err){if(typeof notify==='function')notify(err.message);}
  finally{busy=false;hide();}
 });
 addEventListener('touchcancel',()=>{start=null;hide();});
})();
