'use strict';
// Second-level windows (panels, dialogs, forms) use the app's dark universe. Older pages still carry
// light backgrounds or dark text in their own styles: this pass detects them once rendered and tags
// them so the dark theme can override them, so no screen ever shows white-on-white or dark-on-dark.
(()=>{
 const skip=new Set(['INPUT','SELECT','TEXTAREA','BUTTON','IMG','SVG','PATH','CANVAS','VIDEO','AUDIO','OPTION','IFRAME','PICTURE','SOURCE','G','CIRCLE','RECT','LINE','POLYLINE','POLYGON','ELLIPSE','USE']);
 const rgb=value=>{const m=String(value).match(/rgba?\(([^)]+)\)/);if(!m)return null;const [r,g,b,a=1]=m[1].split(/[\s,/]+/).filter(Boolean).map(Number);return {r,g,b,a};};
 const lum=({r,g,b})=>(0.2126*r+0.7152*g+0.0722*b)/255;
 const lightGradient=image=>/gradient/.test(image)&&[...image.matchAll(/rgba?\(([^)]+)\)/g)].some(m=>{const c=rgb(m[0]);return c&&c.a>0.3&&lum(c)>0.78;});
 function scan(root){
  if(!root||!root.isConnected)return;
  for(const el of root.querySelectorAll('*')){
   if(skip.has(el.tagName.toUpperCase())||el.closest('svg')||el.matches('.badge,.btn,[class*="chip"],[class*="pill"],[class*="tag"],.surface-was-light'))continue;
   const cs=getComputedStyle(el),bg=rgb(cs.backgroundColor);
   if((bg&&bg.a>0.3&&lum(bg)>0.78)||lightGradient(cs.backgroundImage))el.classList.add('surface-was-light'); // tagged elements are skipped above, so no mutation loop
  }
  // Light buttons/chips (e.g. a pale "Vérifié" pill with light text): tint them for the dark universe.
  for(const el of root.querySelectorAll('.btn,.badge,[class*="chip"],[class*="pill"],button')){
   if(el.classList.contains('tint-was-light')||el.matches('.primary,.fg-primary,[type=submit]'))continue;
   const bg=rgb(getComputedStyle(el).backgroundColor);if(bg&&bg.a>0.3&&lum(bg)>0.78)el.classList.add('tint-was-light');
  }
  for(const el of root.querySelectorAll('*')){
   if(skip.has(el.tagName.toUpperCase())||el.closest('svg')||el.matches('.btn,.badge,[class*="chip"],[class*="pill"],.text-was-dark')||el.closest('.btn,.badge'))continue;
   if(!el.childNodes.length||![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
   const color=rgb(getComputedStyle(el).color);
   if(color&&lum(color)<0.22)el.classList.add('text-was-dark'); // very dark ink only: red/green status colors keep their meaning
  }
 }
 let queued=false;
 function run(){
  queued=false;
  scan(document.querySelector('#contextPanel'));
  const modal=document.querySelector('#modalLayer:not(.hide) .modal');if(modal)scan(modal);
 }
 const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(run);}};
 new MutationObserver(records=>{
  if(records.some(r=>{const t=r.target.nodeType===1?r.target:r.target.parentElement;return t&&(t.closest?.('#contextPanel,#modalLayer')||t.id==='contextLayer'||[...r.addedNodes].some(n=>n.id==='contextLayer'));}))schedule();
 }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 window.darkSurfacesScan=run;
})();
