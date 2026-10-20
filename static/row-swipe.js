'use strict';
// Swipe a row to the left to show its finishing button (Mail / Rappels habit): "Terminé", "Révision faite",
// "Contrôle effectué"… Touching it finishes the action in one call (same as option C). Swiping back, touching
// the row or anywhere else closes it. Only rows whose action can be finished in place get the gesture.
const rowSwipe=(()=>{
 const W=120;let open=null;
 function close(){if(!open)return;const {row,act}=open;open=null;row.style.transform='';row.classList.remove('is-swiped');setTimeout(()=>act.remove(),180);}
 function reveal(row,card){
  close();
  const b=inlineActions.buttons(card)[0];if(!b)return;
  const parent=row.parentElement;if(getComputedStyle(parent).position==='static')parent.style.position='relative';
  const act=document.createElement('button');act.type='button';act.className='swipe-act';act.textContent=b.label;
  act.style.top=row.offsetTop+'px';act.style.height=row.offsetHeight+'px';
  act.onclick=e=>{e.stopPropagation();close();
   const host=document.createElement('div');host.className='inline-panel';row.after(host);inlineActions.run(card,0,host,row);};
  row.before(act);row.classList.add('is-swiped');row.style.transform=`translateX(-${W}px)`;open={row,act};
 }
 function attach(row,card){
  if(row._swipe||!inlineActions.has(card))return;row._swipe=true;
  let s=null,moved=false;
  row.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;s={x:e.touches[0].clientX,y:e.touches[0].clientY,base:open?.row===row?-W:0};moved=false;},{passive:true});
  row.addEventListener('touchmove',e=>{
   if(!s)return;const dx=e.touches[0].clientX-s.x,dy=e.touches[0].clientY-s.y;
   if(!moved){if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){s=null;return;}if(Math.abs(dx)<10)return;moved=true;row.style.transition='none';}
   e.preventDefault();row.style.transform=`translateX(${Math.max(-W-30,Math.min(0,s.base+dx))}px)`;
  },{passive:false});
  row.addEventListener('touchend',e=>{
   if(!s)return;const dx=e.changedTouches[0].clientX-s.x,base=s.base;s=null;row.style.transition='';
   if(!moved)return;
   const x=base+dx;if(x<-W/2&&!row.classList.contains('inline-finished'))reveal(row,card);else{row.style.transform='';if(open?.row===row)close();}
  });
  // A tap on a swiped row (or after a swipe) only closes it.
  row.addEventListener('click',e=>{if(moved||open?.row===row){e.preventDefault();e.stopImmediatePropagation();moved=false;close();}},true);
 }
 document.addEventListener('touchstart',e=>{if(open&&!open.row.contains(e.target)&&!open.act.contains(e.target))close();},{passive:true,capture:true});
 return {attach,close};
})();
window.rowSwipe=rowSwipe;
