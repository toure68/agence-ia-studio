'use strict';
// The cockpit DOM stays mounted: drafts, attachments and scroll survive a panel.
let contextState=null;
function syncContextLayers(){
 const modal=!$('#modalLayer').classList.contains('hide'),panel=$('#contextPanel');
 $('#shell').inert=Boolean(panel)||modal;
 if(panel){panel.inert=modal;panel.setAttribute('aria-hidden',String(modal));}
 document.body.classList.toggle('has-floating-layer',Boolean(panel)||modal);
}
async function prepareContext(next){
 if(next==='dashboard')return;
 if(!contextState){
  if(!$('#content .module-grid'))await zeroDashboard();
  const cockpit=$('#content'),back=$('#moduleBack');
  contextState={cockpit,back,parent:back.parentNode,scroll:window.scrollY,focus:document.activeElement,cid:company.id,depth:history.state?.aiaDepth||0};
  cockpit.id='cockpitContent';
  const layer=document.createElement('div');layer.id='contextLayer';layer.className='context-layer';
  layer.innerHTML='<section id="contextPanel" class="context-panel" role="dialog" aria-modal="true" aria-label="Détails de la fonction" tabindex="-1"><div class="sheet-handle" aria-label="Glisser vers le bas pour fermer"></div><header class="context-header"><span id="contextTitle"></span><button type="button" id="closeContext" class="back-circle" aria-label="Fermer le panneau">×</button></header><div class="context-scroll"><section id="content"></section></div></section>';
  document.body.append(layer);$('#contextPanel .context-header').prepend(back);
  $('#content').addEventListener('click',handleContentClick);
  layer.onclick=e=>{if(e.target===layer)closeContext();};$('#closeContext').onclick=closeContext;
  bindSheetGesture($('#contextPanel'),()=>closeContext());
  document.body.style.setProperty('--cockpit-scroll',`-${contextState.scroll}px`);
  document.body.classList.add('context-open');syncContextLayers();
 }
}
function restoreCockpit(){
 if(!contextState)return false;
 const saved=contextState;contextState=null;
 closeModal();saved.parent.prepend(saved.back);saved.back.classList.add('hide');
 $('#contextLayer')?.remove();saved.cockpit.id='content';
 document.body.classList.remove('context-open');document.body.style.removeProperty('--cockpit-scroll');
 syncContextLayers();window.scrollTo(0,saved.scroll);
 if(saved.focus?.isConnected)saved.focus.focus({preventScroll:true});
 return true;
}
function closeContext(){
 if(!contextState)return;
 const depth=contextState.depth,steps=(history.state?.aiaDepth||0)-depth;
 restoreCockpit();tab='dashboard';$('#topLabel').textContent='';
 if(steps>0)history.go(-steps);else history.replaceState({aiaDepth:depth},'','#/dashboard');
 refreshCockpit().catch(err=>notify(err.message));
}
async function refreshCockpit(){
 if(tab!=='dashboard'||!company)return;
 const cid=company.id,host=$('#content');
 const [workspace,state]=await Promise.all([api(`/api/companies/${cid}/workspace`),api(`/api/companies/${cid}/cockpit`)]);
 if(tab!=='dashboard'||company.id!==cid||host!==$('#content'))return;
 const fragment=document.createElement('div');fragment.innerHTML=homeModulesMarkup(workspace,state);
 host.querySelector('.module-grid')?.replaceWith(fragment.querySelector('.module-grid'));
 await renderPriorities();
}
function bindSheetGesture(panel,close){
 let start=null;
 const eligible=target=>!target.closest('input,textarea,select,button,a,canvas,video,audio,label')&&(!(panel.querySelector('.context-scroll')||panel).scrollTop||target.closest('.sheet-handle,.context-header'));
 panel.addEventListener('touchstart',e=>{if(e.touches.length===1&&eligible(e.target))start={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
 panel.addEventListener('touchmove',e=>{if(!start||e.touches.length!==1)return;const dx=e.touches[0].clientX-start.x,dy=e.touches[0].clientY-start.y;if(dy>12&&dy>Math.abs(dx)*1.5){e.preventDefault();panel.style.transform=`translateY(${Math.min(dy,260)}px)`;}},{passive:false});
 panel.addEventListener('touchend',e=>{if(!start)return;const point=e.changedTouches[0],dy=point.clientY-start.y,dx=point.clientX-start.x;start=null;panel.style.transform='';if(dy>90&&dy>Math.abs(dx)*1.5)close();});
 panel.addEventListener('touchcancel',()=>{start=null;panel.style.transform='';});
 // Pointer support on the drag handle also makes mouse and pen behavior consistent.
 const handle=panel.querySelector('.sheet-handle');let pointer=null;
 handle?.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;pointer={y:e.clientY,id:e.pointerId};handle.setPointerCapture(e.pointerId);});
 handle?.addEventListener('pointerup',e=>{if(pointer&&e.pointerId===pointer.id&&e.clientY-pointer.y>90)close();pointer=null;});
}
document.addEventListener('keydown',e=>{
 const dialog=!$('#modalLayer').classList.contains('hide')?$('#modalLayer [role="dialog"]'):$('#contextPanel');
 if(!dialog)return;
 if(e.key==='Escape'){e.preventDefault();if(!$('#modalLayer').classList.contains('hide'))closeModal();else closeContext();return;}
 if(e.key==='Tab'){
  const nodes=[...dialog.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
  const first=nodes[0],last=nodes.at(-1);
  if(!first){e.preventDefault();dialog.focus();}
  else if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}
 }
});
