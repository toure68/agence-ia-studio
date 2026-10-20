'use strict';
// Option C (chosen 20/10/2026): an action is finished where it is shown. Touching an action (home card, list row,
// list of actions) unfolds it in place: its details and the buttons that finish it. No other window opens unless
// "Voir le détail" is touched. One API call per button; the lists and home cards refresh afterwards.
const inlineActions=(()=>{
 const cid=()=>company.id;
 const iso=d=>d.toISOString().slice(0,10);
 const plusMonths=(value,n)=>{const d=new Date((value||new Date().toISOString().slice(0,10))+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return iso(d);};
 async function equipment(id){const r=(await api(`/api/companies/${cid()}/equipment`)).find(x=>x.id===id);if(!r)throw Error('Matériel introuvable');return r;}
 async function risk(id){const r=(await api(`/api/companies/${cid()}/risks`)).find(x=>x.id===id);if(!r)throw Error('Échéance introuvable');return r;}
 const putEquipment=(r,change)=>api(`/api/companies/${cid()}/equipment/${r.id}`,{method:'PUT',body:JSON.stringify({name:r.name,quantity:r.quantity,condition:r.condition,maintenance_due:r.maintenance_due||null,...change})});
 const putRisk=(r,change)=>api(`/api/companies/${cid()}/risks/${r.id}`,{method:'PUT',body:JSON.stringify({title:r.title,kind:r.kind,due:r.due,responsible:r.responsible||'',completed:!!r.completed,...change})});
 // Buttons that finish each kind of action; the first one is the green one.
 function buttons(card){
  const t=card.action?.type,id=Number(card.action?.id),label=card.state_label||'';
  if(t==='equipment'&&/Révision/.test(label))return [
   {label:'Révision faite',done:'Révision faite · prochaine dans un an',run:async()=>{const r=await equipment(id);await putEquipment(r,{maintenance_due:plusMonths(r.maintenance_due,12)});}},
   {label:'Reporter d’un mois',done:'Révision reportée d’un mois',run:async()=>{const r=await equipment(id);await putEquipment(r,{maintenance_due:plusMonths(r.maintenance_due,1)});}}];
  if(t==='equipment')return [
   {label:label==='En panne'?'Réparé':'Remplacé',done:label==='En panne'?'Matériel réparé':'Matériel remplacé',run:async()=>{await putEquipment(await equipment(id),{condition:'ready'});}},
   ...(label==='En panne'?[{label:'À remplacer',done:'Marqué à remplacer',run:async()=>{await putEquipment(await equipment(id),{condition:'worn'});}}]:[])];
  if(t==='risk')return [
   {label:'Contrôle effectué',done:'Contrôle effectué',run:async()=>{await putRisk(await risk(id),{completed:true});}},
   {label:'Reporter d’un mois',done:'Échéance reportée d’un mois',run:async()=>{const r=await risk(id);await putRisk(r,{due:plusMonths(r.due,1)});}}];
  if(t==='task'&&card.due)return [
   {label:'Terminé',done:'Tâche terminée',run:async()=>{await api(`/api/companies/${cid()}/tasks/${id}/complete`,{method:'POST',body:JSON.stringify({occurrence:card.due})});}}];
  if(t==='client')return [
   {label:'Fiche correcte',done:'Fiche client validée',run:async()=>{const c=await api(`/api/companies/${cid()}/clients/${id}`);await api(`/api/companies/${cid()}/clients/${id}/validate`,{method:'POST',body:JSON.stringify({revision:c.review_revision})});}}];
  return [];
 }
 const has=card=>!!card&&!card.example&&!card.fallback&&buttons(card).length>0;
 function panel(card){
  const friendly=typeof priorityFriendly==='function'?priorityFriendly:x=>x;
  const p=typeof priorityPresentation==='function'?priorityPresentation(card):{label:card.state_label||''};
  const b=buttons(card);
  return `<div class="inline-panel" data-inline-key="${clean(card.key)}"><dl class="inline-facts"><dt>Action</dt><dd>${clean(card.title)}</dd><dt>État</dt><dd>${clean(p.label||'À traiter')}</dd>${card.description?`<dt>Détail</dt><dd>${clean(friendly(card.description))}</dd>`:''}</dl><div class="inline-buttons">${b.map((x,i)=>`<button type="button" class="${i?'inline-secondary':'inline-primary'}" data-inline-run="${i}">${clean(x.label)}</button>`).join('')}<button type="button" class="inline-secondary" data-inline-detail>Voir le détail</button></div></div>`;
 }
 async function run(card,i,host,anchor){
  const b=buttons(card)[i];if(!b)return;
  host.querySelectorAll('button').forEach(x=>x.disabled=true);
  try{await b.run();notify(b.done);host.dataset.inlineDone='1';host.innerHTML=`<p class="inline-done">✓ ${clean(b.done)}</p>`;
   anchor.classList.remove('row-todo');anchor.classList.add('row-quiet','inline-finished');const chip=anchor.querySelector('.row-chip');if(chip){chip.textContent='Fait';chip.classList.remove('is-danger');chip.classList.add('is-done');}
   if(typeof renderPriorities==='function')renderPriorities().catch(()=>{});
   if(typeof listStatusRefresh==='function')listStatusRefresh();
   document.dispatchEvent(new CustomEvent('inline-action-done',{detail:{card}}));
  }catch(err){notify(err.message);host.querySelectorAll('button').forEach(x=>x.disabled=false);}
 }
 // Toggle the panel right after `anchor` (a row or a card). Returns true when handled inline.
 function toggle(anchor,card){
  if(!has(card))return false;
  const next=anchor.nextElementSibling;
  if(next?.classList.contains('inline-panel')){next.remove();anchor.setAttribute('aria-expanded','false');return true;}
  anchor.parentElement.querySelectorAll(':scope>.inline-panel').forEach(p=>p.remove());
  anchor.insertAdjacentHTML('afterend',panel(card));anchor.setAttribute('aria-expanded','true');
  const host=anchor.nextElementSibling;
  host.addEventListener('click',e=>{
   const r=e.target.closest('[data-inline-run]'),d=e.target.closest('[data-inline-detail]');
   if(r){e.stopPropagation();run(card,Number(r.dataset.inlineRun),host,anchor);}
   if(d){e.stopPropagation();
    // From a home card the detail opens like any action window (on the function frame, strip below).
    const module=typeof priorityModules!=='undefined'?priorityModules[card.action?.type]:null;
    if(anchor.closest('.priority-card')&&module&&typeof moduleFocusFromPriority==='function')moduleFocusFromPriority(module,()=>openPriorityAction(card)).then(ok=>{if(!ok)openPriorityAction(card);});
    else openPriorityAction(card);}
  });
  host.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  return true;
 }
 return {has,toggle,buttons,run};
})();
window.inlineActions=inlineActions;
