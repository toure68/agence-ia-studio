'use strict';
// Guided entry for every form in windows (panels, dialogs): no manual scrolling, no hunting for "Valider".
// - The keyboard key reads "Suivant" and moves to the next empty field; the last one reads "OK" and brings
//   the validate button into view (it never submits on its own).
// - Closed answers move on by themselves: a date/time/list choice, a 10-digit phone, a 5-digit postal code.
// - The current field is outlined and kept in view; a small "2 / 4" progress shows where you are.
// - The validate button stays visible at the bottom of the window, green once required fields are filled.
(()=>{
 const FIELD='input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=search]):not([disabled]):not([readonly]),select:not([disabled]),textarea:not([disabled]):not([readonly])';
 const PRIMARY='button[type=submit],input[type=submit],.btn.primary,#previewCommand,#confirmCommand';
 const visible=el=>!!el&&el.getClientRects().length>0;
 const fieldsOf=box=>[...box.querySelectorAll(FIELD)].filter(f=>visible(f)&&!f.closest('[data-no-guide]'));
 const primaryOf=box=>{const ok=b=>visible(b)&&!b.closest('[data-no-guide]');return [...box.querySelectorAll(PRIMARY)].find(ok)||(box.matches('form')?[...box.querySelectorAll('button:not([type])')].find(ok):null);};
 const filled=f=>f.matches('select')?!!f.value:String(f.value||'').trim().length>0&&(!f.checkValidity||f.checkValidity());
 const wrap=f=>f.closest('.field,label,.row')||f.parentElement;
 const isPhone=f=>f.type==='tel'||/phone|tel/i.test(f.name+' '+f.id);
 const isPostal=f=>/postal|zip|code_?postal|\bcp\b/i.test(f.name+' '+f.id+' '+(f.autocomplete||''));
 function boxes(){
  const roots=[document.querySelector('#contextPanel'),document.querySelector('#modalLayer:not(.hide) .modal')].filter(Boolean);
  const out=new Set();
  for(const root of roots){
   const forms=[...root.querySelectorAll('form')].filter(f=>!f.closest('#assistantChat,[data-no-guide]'));
   for(const form of forms)if(fieldsOf(form).length>=2||(fieldsOf(form).length>=1&&primaryOf(form)))out.add(form);
   if(!forms.length&&root.matches('.modal')&&fieldsOf(root).length&&primaryOf(root))out.add(root);
  }
  return [...out];
 }
 function progress(box){
  const fields=fieldsOf(box);if(fields.length<3){box.querySelector(':scope > .fg-progress')?.remove();return;}
  let bar=box.querySelector(':scope > .fg-progress');
  if(!bar){bar=document.createElement('div');bar.className='fg-progress';bar.setAttribute('aria-hidden','true');bar.innerHTML='<i></i><span></span>';const first=fields[0],anchor=box.contains(wrap(first))&&wrap(first).parentElement===box?wrap(first):null;box.insertBefore(bar,anchor||box.firstChild);}
  const done=fields.filter(filled).length,current=Math.min(done+1,fields.length);
  bar.querySelector('i').style.width=(done/fields.length*100)+'%';
  const text=`${current} / ${fields.length}`;if(bar.querySelector('span').textContent!==text)bar.querySelector('span').textContent=text;
 }
 function ready(box){
  const button=primaryOf(box);if(!button)return;
  if(!button.classList.contains('fg-primary'))button.classList.add('fg-primary'); // add() always mutates: guard against observer loops
  const required=fieldsOf(box).filter(f=>f.required);
  const ok=required.every(filled);
  button.classList.toggle('fg-waiting',required.length>0&&!ok);
  return ok;
 }
 function current(box,field){
  box.querySelectorAll('.fg-current').forEach(e=>e.classList.remove('fg-current'));
  if(field)wrap(field)?.classList.add('fg-current');
 }
 function reveal(el){if(window.universalSheets?.reveal(el))return;requestAnimationFrame(()=>el.scrollIntoView({block:'center',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));}
 function next(box,from){
  const fields=fieldsOf(box),i=fields.indexOf(from);
  const target=fields.slice(i+1).find(f=>!filled(f))||fields.find(f=>f!==from&&!filled(f));
  if(target){target.focus({preventScroll:true});current(box,target);reveal(wrap(target)||target);return;}
  const button=primaryOf(box);if(!button)return;
  from?.blur();current(box,null);reveal(button);
  button.classList.remove('fg-pulse');void button.offsetWidth;button.classList.add('fg-pulse');
 }
 function prepare(){
  for(const box of boxes()){
   const fields=fieldsOf(box);
   fields.forEach((f,i)=>{
    if(f.matches('textarea'))return;
    const hint=i===fields.length-1?'done':'next';
    if(f.getAttribute('enterkeyhint')!==hint)f.setAttribute('enterkeyhint',hint);
   });
   if(!box.dataset.guided){box.dataset.guided='1';
    box.addEventListener('keydown',e=>{
     const f=e.target;if(e.key!=='Enter'||e.shiftKey||e.isComposing||!f.matches?.(FIELD)||f.matches('textarea'))return;
     e.preventDefault();next(box,f);
    });
    box.addEventListener('focusin',e=>{if(e.target.matches?.(FIELD)){current(box,e.target);reveal(wrap(e.target)||e.target);}});
    box.addEventListener('change',e=>{
     const f=e.target;if(!f.matches?.(FIELD))return;progress(box);const was=f.dataset.fgDone==='1';ready(box);
     // Only when the person is still on that field (never steal focus from a tap elsewhere, e.g. on Valider).
     if(f.matches('select,input[type=date],input[type=time],input[type=datetime-local],input[type=month]')&&filled(f)&&!was){f.dataset.fgDone='1';setTimeout(()=>{if(document.activeElement===f)next(box,f);},200);}
    });
    box.addEventListener('input',e=>{
     const f=e.target;if(!f.matches?.(FIELD))return;progress(box);ready(box);
     const digits=String(f.value).replace(/\D/g,'');
     if((isPhone(f)&&/^0\d{9}$/.test(digits))||(isPostal(f)&&/^\d{5}$/.test(digits))){if(f.dataset.fgDone!=='1'){f.dataset.fgDone='1';setTimeout(()=>{if(document.activeElement===f)next(box,f);},200);}}
     else delete f.dataset.fgDone;
    });
   }
   progress(box);ready(box);
  }
 }
 let queued=false;const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;prepare();});}};
 new MutationObserver(records=>{if(records.some(r=>{const t=r.target.nodeType===1?r.target:r.target.parentElement;return t&&(t.closest?.('#contextPanel,#modalLayer')||[...r.addedNodes].some(n=>n.id==='contextLayer'));}))schedule();})
  .observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
 window.formGuidePrepare=prepare;
})();
