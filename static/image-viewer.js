'use strict';
// Attachments viewer (user request 22/10): a tap on a thumbnail of the reader turns the screen into an image
// reader — the chosen file big, full screen, no border, no buttons on top, no notification cards — with the
// small carousel at the bottom to change file in the same order. Phone habits: swipe sideways = next/previous,
// swipe down (or the edge back gesture, Escape) = close. Pure app code, no AI.
const imageViewer=(()=>{
 const KIND={pdf:'PDF',doc:'DOC',xls:'XLS',other:'FICHIER'};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let box=null,files=[],at=0,back=null;
 function stage(f){
  if(f.type==='image')return `<img class="iv-img" src="${esc(f.src)}" alt="${esc(f.name)}">`;
  const open=f.src?` data-open="1"`:'';
  return `<div class="iv-doc"${open}><span class="iv-kind">${KIND[f.type]||KIND.other}</span><strong>${esc(f.name)}</strong>${f.pages?`<span>${f.pages} pages</span>`:''}${f.src?'<span>Touchez pour ouvrir</span>':''}</div>`;
 }
 function mini(f,i){
  const inner=f.type==='image'?`<img src="${esc(f.src)}" alt="">`:`<span class="iv-kind">${KIND[f.type]||KIND.other}</span>`;
  return `<button type="button" class="iv-mini${i===at?' is-on':''}" data-i="${i}" aria-label="${esc(f.name)} (${i+1} sur ${files.length})" aria-pressed="${i===at}">${inner}</button>`;
 }
 function draw(){
  if(!box)return;const f=files[at];
  box.querySelector('.iv-stage').innerHTML=stage(f);
  box.querySelector('.iv-strip').innerHTML=files.map(mini).join('');
  box.querySelector('.iv-strip .is-on')?.scrollIntoView({block:'nearest',inline:'center'});
  box.setAttribute('aria-label',`${f.name} — ${at+1} sur ${files.length}`);
 }
 function go(i){if(!files.length)return;at=(i+files.length)%files.length;draw();}
 function close(){if(!box)return;box.remove();box=null;document.body.classList.remove('iv-open');removeEventListener('keydown',key,true);const b=back;back=null;b?.focus?.({preventScroll:true});}
 function key(e){if(!box)return;if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='ArrowRight')go(at+1);else if(e.key==='ArrowLeft')go(at-1);}
 function open(list,i=0){
  if(!list?.length)return;close();files=list;at=Math.max(0,Math.min(i,list.length-1));back=document.activeElement;
  box=document.createElement('div');box.className='img-viewer';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<button type="button" class="sr-only iv-close">Fermer les pièces jointes</button><div class="iv-stage"></div><div class="iv-strip" role="group" aria-label="Pièces jointes"></div>';
  document.body.append(box);document.body.classList.add('iv-open');draw();
  box.querySelector('.iv-close').onclick=close;
  box.querySelector('.iv-strip').addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)go(Number(b.dataset.i));});
  box.querySelector('.iv-stage').addEventListener('click',e=>{const d=e.target.closest('[data-open]');if(d&&files[at]?.src)window.open(files[at].src,'_blank','noopener');});
  let x0=null,y0=0;const st=box.querySelector('.iv-stage');
  st.addEventListener('touchstart',e=>{if(e.touches.length!==1){x0=null;return;}x0=e.touches[0].clientX;y0=e.touches[0].clientY;},{passive:true});
  st.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;
   if(dy>70&&dy>Math.abs(dx)*1.3)close();else if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)go(at+(dx<0?1:-1));},{passive:true});
  addEventListener('keydown',key,true);
  box.querySelector('.iv-close').focus({preventScroll:true});
 }
 return {open,close,isOpen:()=>!!box};
})();
window.imageViewer=imageViewer;
