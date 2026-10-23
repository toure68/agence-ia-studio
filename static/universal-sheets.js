'use strict';
// One mounted cockpit, one reusable sheet behavior for local and API-backed interfaces.
const universalSheets=(()=>{
 let queued=false,closing=null,transaction=null;
 const enabled=()=>document.documentElement.classList.contains('home-ios')&&typeof company!=='undefined'&&!!company&&typeof me!=='undefined'&&!!me;
 const active=()=>document.querySelector('#modalLayer:not(.hide) .universal-sheet')||document.querySelector('#contextPanel.universal-sheet');
 const intermediate=new Set(['assistantForm','scanForm','socialCreate','mailReplyForm','interactionForm','mailComposeForm','mailInlineForm']);
 function request(method,path){return transaction&&!['GET','HEAD'].includes(method.toUpperCase())&&!/module-use|module-peek|workspace\/usage|\/track/.test(path)?transaction:null;}
 function result(tx,ok){if(tx){tx.saved=tx.saved||ok;tx.failed=tx.failed||!ok;}}
 function viewport(){const v=visualViewport;return {height:v?.height||innerHeight,top:v?.offsetTop||0};}
 function layout(panel){
  if(!panel?.isConnected)return;const v=viewport(),keyboard=innerHeight-v.height>120,full=panel.dataset.snap==='full';
  const safe=Math.max(8,parseFloat(getComputedStyle(panel).getPropertyValue('--us-safe-top'))||0);
  const height=Math.max(120,v.height-(full||keyboard?safe+8:Math.round(v.height*.5)));
  panel.style.setProperty('--us-height',height+'px');panel.style.setProperty('--us-bottom',Math.max(0,innerHeight-v.top-v.height)+8+'px');
 }
 function reveal(field){
  const panel=field?.closest('.universal-sheet');if(!panel)return false;if(field===panel||field.closest('.us-handle,.us-footer'))return true;layout(panel);
  requestAnimationFrame(()=>{const sc=panel.querySelector('.us-scroll,.context-scroll')||panel,button=panel.querySelector('.fg-primary,button[type=submit],#confirmCommand'),r=field.getBoundingClientRect(),s=sc.getBoundingClientRect(),b=button?.getBoundingClientRect();
   const top=s.top+8,bottom=Math.min(s.bottom-8,b&&b.top>top?b.top-8:s.bottom-8);if(r.bottom>bottom)sc.scrollTop+=r.bottom-bottom;else if(r.top<top)sc.scrollTop-=top-r.top;
  });return true;
 }
 async function complete(){
  if(closing)return closing;const top=active(),modalOnly=top?.dataset.closeScope==='modal';const panels=modalOnly?[top]:[...document.querySelectorAll('.universal-sheet')];
  document.activeElement?.blur();panels.forEach(p=>p.classList.add('us-closing'));
  closing=new Promise(resolve=>setTimeout(()=>{closeModal();if(contextState&&!modalOnly)closeContext();if(!contextState)document.body.classList.remove('us-open');closing=null;resolve();},matchMedia('(prefers-reduced-motion:reduce)').matches?0:180));return closing;
 }
 function snap(panel,state){panel.dataset.snap=state;layout(panel);panel.querySelector('.us-expand')?.setAttribute('aria-label',state==='full'?'Réduire le panneau':'Agrandir le panneau');}
 function wire(panel){
  if(panel.dataset.usWired)return;panel.dataset.usWired='1';panel.dataset.snap='half';
  // A modal's contents scroll independently, leaving its handle and close control in place.
  if(panel.matches('.modal')){const body=document.createElement('div');body.className='us-scroll';while(panel.firstChild)body.append(panel.firstChild);panel.append(body);}
  const bar=document.createElement('div');bar.className='us-handle';bar.innerHTML='<button type="button" class="us-collapse" aria-label="Fermer et retrouver l’accueil">⌄</button><button type="button" class="us-expand" aria-label="Agrandir le panneau">⤢</button>';
  const footer=document.createElement('footer');footer.className='us-footer';footer.innerHTML='<button type="button" class="us-close-bottom" aria-label="Fermer et retrouver l’accueil"><span aria-hidden="true">×</span> Fermer</button>';footer.querySelector('button').onclick=()=>complete();panel.append(footer);
  panel.prepend(bar);bar.querySelector('.us-collapse').onclick=()=>complete();bar.querySelector('.us-expand').onclick=()=>snap(panel,panel.dataset.snap==='full'?'half':'full');
  let start=null,suppress=false;
  const down=(x,y)=>{start={x,y};suppress=false;panel.classList.add('us-dragging');};
  const move=(x,y)=>{if(!start)return;const dy=y-start.y;if(Math.abs(dy)>8)suppress=true;panel.style.setProperty('--us-drag',Math.max(-120,Math.min(260,dy))+'px');};
  const end=(x,y,cancel=false)=>{if(!start)return;const dx=x-start.x,dy=y-start.y;start=null;panel.classList.remove('us-dragging');panel.style.removeProperty('--us-drag');if(cancel||Math.abs(dy)<=Math.abs(dx)*1.3)return;if(dy>85)complete();else if(dy< -45)snap(panel,'full');};
  bar.addEventListener('touchstart',e=>{if(e.touches.length===1)down(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  bar.addEventListener('touchmove',e=>{if(!start)return;e.preventDefault();move(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
  bar.addEventListener('touchend',e=>{const t=e.changedTouches[0];if(suppress)e.preventDefault();end(t.clientX,t.clientY);},{passive:false});bar.addEventListener('touchcancel',()=>end(0,0,true));
  bar.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'){down(e.clientX,e.clientY);}});bar.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'){if(start&&Math.abs(e.clientY-start.y)>8)bar.setPointerCapture(e.pointerId);move(e.clientX,e.clientY);}});bar.addEventListener('pointerup',e=>{if(e.pointerType!=='touch')end(e.clientX,e.clientY);});bar.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();suppress=false;}},true);
 }
 function terminal(element,event){
  if(!element[event]||element[event]._usWrapped)return;
  const handler=element[event];const wrapped=async function(e){const tx={saved:false,failed:false};transaction=tx;try{await handler.call(this,e);if(tx.saved&&!tx.failed&&active())await complete();}finally{if(transaction===tx)transaction=null;}};wrapped._usWrapped=true;element[event]=wrapped;
 }
 function forms(panel){
  for(const form of panel.querySelectorAll('form'))if(!intermediate.has(form.id))terminal(form,'onsubmit');
  // These confirmations are the terminal step of a preview, never the preview itself.
  for(const button of panel.querySelectorAll('#confirmBankMovement,#confirmPaidDebit,#confirmCancelDebit,#saveBankLogo,#removeBankLogo'))terminal(button,'onclick');
 }
 function sync(){queued=false;const assistant=document.querySelector('#contextPanel[data-module="assistant"].universal-sheet');if(assistant){assistant.classList.remove('universal-sheet');assistant.querySelector(':scope > .us-handle')?.remove();assistant.querySelector(':scope > .us-footer')?.remove();delete assistant.dataset.usWired;delete assistant.dataset.snap;assistant.style.removeProperty('--us-height');assistant.style.removeProperty('--us-bottom');}
  const panels=enabled()?[...document.querySelectorAll('#contextPanel:not([data-module="assistant"]),#modalLayer:not(.hide) .modal')]:[];
  document.body.classList.toggle('us-open',panels.length>0);
  for(const panel of panels){panel.querySelector(':scope > .assistant-collapse')?.remove();panel.classList.add('universal-sheet');wire(panel);layout(panel);forms(panel);}
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(sync);}}
 new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.attributeName==='data-module'||r.attributeName==='class'&&r.target.id==='modalLayer'))schedule();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-module']});
 visualViewport?.addEventListener('resize',()=>{document.querySelectorAll('.universal-sheet').forEach(layout);reveal(document.activeElement);},{passive:true});visualViewport?.addEventListener('scroll',()=>document.querySelectorAll('.universal-sheet').forEach(layout),{passive:true});
 document.addEventListener('click',e=>{const p=active(),b=e.target.closest('button');if(p&&(e.target.id==='contextLayer'||e.target.id==='modalBackdrop'||b&&p.contains(b)&&!b.matches('[type=submit]')&&/^(Annuler|Fermer|Fermer et retrouver l’accueil)$/.test(b.textContent.trim()))){e.preventDefault();e.stopImmediatePropagation();complete();}},true);
 document.addEventListener('focusin',e=>reveal(e.target));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active()){e.preventDefault();e.stopImmediatePropagation();complete();}},true);
 return {enabled,active,request,result,complete,reveal,sync};
})();
window.universalSheets=universalSheets;
