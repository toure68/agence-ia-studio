function priorityPresentation(c){
 if(c.state)return tileState(c.state,c.state_label);
 if(c.action.type==='social')return tileState('success','Prêt à valider');
 if(c.rank===0)return tileState('danger','Urgent');
 if(c.rank<=2)return tileState('warning',c.action.type==='document'?'À vérifier':'Important');
 if(['client','quote','document','email'].includes(c.action.type))return tileState('warning',({client:'À valider',quote:'À finaliser',document:'À vérifier',email:'À relire'})[c.action.type]);
 if(c.action.type==='task')return tileState('warning','À prévoir');
 if(c.workflow_status==='waiting')return tileState('warning','En attente');
 if(c.workflow_status==='doing')return tileState('info','En cours');
 if(c.action.type==='activity')return tileState('info','À faire');
 return tileState('neutral',c.fallback?'À préparer':'À faire');
}
const priorityModules={activity:'activities','activity-new':'activities',task:'calendar',client:'clients',document:'scanner',quote:'leads',email:'emails',equipment:'equipment',material:'equipment',risk:'risks',social:'social',prospect:'prospects',lead:'requests'};
function groupPriorityCards(cards){
 const groups=new Map(),seen=new Set();
 for(const card of cards){
  if(seen.has(card.key))continue;seen.add(card.key);
  const module=priorityModules[card.action.type]||card.action.type;
  if(!groups.has(module))groups.set(module,{...card,module,members:[]});
  groups.get(module).members.push(card);
 }
 return [...groups.values()];
}
function priorityMarkup(cards){
 const visible=cards.slice(0,3);
 return `<h2 class="home-section-title">À faire maintenant</h2><div class="priority-stack" aria-label="Priorités par importance">${visible.map((c,i)=>{
  const presentation=priorityPresentation(c),key=priorityModules[c.action.type]||'requests';
  const tone=semanticTone(key,presentation);
  const action=c.members.length>1?'Voir les '+c.members.length+' actions':c.action_label||'Ouvrir le dossier';
  return `<article class="priority-card priority-tier-${i+1} tone-${tone} ${c.fallback?'routine-card':''} ${c.example?'example-card':''}" data-priority="${clean(c.key)}" data-priority-module="${clean(c.module)}"><button type="button" class="module-tile priority-tile tone-${tone} state-${presentation.state}" data-state="${presentation.state}" data-priority-open="${i}" aria-label="Priorité ${i+1} : ${clean(c.title)} · ${clean(presentation.label)}"><span class="priority-top"><span class="module-icon" aria-hidden="true">${moduleIcon(key)}</span><span class="priority-copy"><strong>${clean(c.title)}</strong><span class="priority-labels"><span class="importance">${clean(presentation.label)}</span>${c.members.length>1?`<span class="priority-group-count">${c.members.length} actions</span>`:''}</span></span></span><span class="priority-description">${clean(c.description||'Ouvrez le dossier pour vérifier les informations et continuer.')}</span><span class="priority-cta">${clean(action)}</span></button>${!c.fallback?`<button class="priority-dismiss" data-priority-dismiss="${i}" aria-label="Masquer : ${clean(c.title)}" title="Masquer cette priorité">×</button>`:''}</article>`;
 }).join('')}</div>${cards.length>3?`<button class="btn home-all-actions" id="homeAllActions">Toutes les actions · ${cards.reduce((n,c)=>n+c.members.length,0)}</button>`:''}`;
}
'use strict';
let priorityCards = [];
let priorityRequest = 0;

async function renderPriorities(initial={}) {
  const host = document.querySelector('#priorityBlock');
  const cid = company?.id;
  if (!host || !cid) return;
  const request=++priorityRequest;
  const [actualCards,cockpit,workspace] = await Promise.all([api(`/api/companies/${cid}/priorities`),initial.cockpit||api(`/api/companies/${cid}/cockpit`),initial.workspace||api(`/api/companies/${cid}/workspace`)]);
  actualCards.sort((a,b)=>a.rank-b.rank||(a.due||'').localeCompare(b.due||''));
  const cards = actualCards.length ? actualCards : await routinePriorities(cid);
  if (!host.isConnected || company?.id !== cid || request!==priorityRequest) return;
  // The badges and action cards share one queue, including actions outside the first three cards.
  cockpit.action_counts={};
  for(const group of groupPriorityCards(actualCards))cockpit.action_counts[group.module]=group.members.filter(c=>!c.example&&!c.fallback).length;
  cockpit.action_counts.treasury=cockpit.badges?.treasury||0;
  updateHomeGrid(workspace,cockpit);
  refreshHomeBadges(cockpit.action_counts,[],cockpit.module_states);
  refreshHomeWidgets(cockpit);
  refreshHomeSummary(cockpit,cards);
  priorityCards = cards;
  refreshHomeMessages(cards,cockpit);
  const displayCards=groupPriorityCards(cards);
  host.innerHTML = priorityMarkup(displayCards);
  const all=host.querySelector("#homeAllActions");if(all)all.onclick=()=>openPriorityGroup({module:"all",members:cards},cid);
  host.querySelectorAll('[data-priority-open]').forEach(btn => btn.onclick = async () => {
    const group=displayCards[Number(btn.dataset.priorityOpen)];
    if(group.members.length===1)return openPriorityAction(group.members[0]);
    openPriorityGroup(group,cid);
  });
  host.querySelectorAll('[data-priority-dismiss]').forEach(btn => btn.onclick = async () => {
    btn.disabled = true;
    try {
      const card=displayCards[Number(btn.dataset.priorityDismiss)];
      if(card.example){completeExample(card.action.id);await renderPriorities();return;}
      await api(`/api/companies/${cid}/priorities/dismiss`, {method:'POST', body:JSON.stringify({key:card.key})});
      await renderPriorities();
      notify('Priorité masquée.');
    } catch(e) { btn.disabled = false; notify(e.message); }
  });
}

async function openPriorityAction(card){
    try {
      if (card.action.type === 'example') return await openTab('priority-example',{recordId:card.action.id});
      if (card.action.type === 'client') return await openTab('client-edit',{recordId:card.action.id});
      if (card.action.type === 'document') return await openTab('document',{recordId:card.action.id});
      if (card.action.type === 'social') return await openTab('social-post',{recordId:card.action.id});
      if (card.action.type === 'activity-new') return openCommand('activity');
      if (card.action.type === 'risk') return await openTab('risks',{recordId:card.action.id});
      if (card.action.type === 'equipment') return await openTab('equipment',{recordId:card.action.id});
      if (card.action.type === 'material') return await openTab('material',{recordId:card.action.id});
      if (card.action.type === 'quote') return await openTab('quote',{recordId:card.action.id});
      if (card.action.type === 'email') return await openTab('email',{recordId:card.action.id});
      if (card.action.type === 'activity') return await openTab('activity',{recordId:card.action.id});
      if (card.action.type === 'task') return await openTab('calendar', {taskId:card.action.id});
      if (card.action.type === 'prospect') {
        await openTab('prospects');
        return await prospectDetail(card.action.id);
      }
      await openTab('incoming');
      leadDetail(card.action.id);
    } catch (e) { notify(e.message); }

}
function openPriorityGroup(group,cid){
 const names={activities:'Activités',calendar:'Agenda',clients:'Clients',scanner:'Documents',leads:'Devis',emails:'E-mails',equipment:'Matériel',risks:'Prévention',social:'Publications',prospects:'Prospection',requests:'Demandes'};
 openModal(`<h2>${clean(names[group.module]||'Actions à traiter')}</h2><p class="sub">${group.members.length} actions à traiter</p><div class="task-list priority-group-list">${group.members.map((card,i)=>`<button type="button" class="task-row" data-priority-item-open="${i}"><span><strong>${clean(card.title)}</strong><small>${clean(priorityPresentation(card).label)}</small></span><span aria-hidden="true">›</span></button>`).join('')}</div><button type="button" class="btn" id="closePriorityGroup">Fermer et retrouver l’accueil</button>`);
 $('#closePriorityGroup').onclick=closeModal;
 $('#modalLayer').querySelectorAll('[data-priority-item-open]').forEach(btn=>btn.onclick=async()=>{
  if(company?.id!==cid){closeModal();return;}
  const card=group.members[Number(btn.dataset.priorityItemOpen)];closeModal();await openPriorityAction(card);
 });
}

function renderCalendarPage(html) {
  document.querySelector('#content').innerHTML='<section class="calendar-page">'+html+'</section>';
}

async function calendarTasks(selectedId=null){
 const cid=company?.id;
 if(!cid)return;
 const tasks=await api(`/api/companies/${cid}/tasks`);
 if(company?.id!==cid)return;
 const selected=tasks.find(t=>t.id===selectedId);
 if(selectedId&&!selected)throw Error('Échéance introuvable.');
 const dueLabel=t=>t.next_due?timestamp(t.next_due+'T12:00:00'):'Terminée';
 if(selected){
   renderCalendarPage(`<h1>${clean(selected.title)}</h1><article class="task-detail"><p>${clean(selected.description)}</p><div class="task-meta"><span>${dueLabel(selected)}</span>${selected.monthly?'<span class="badge">Mensuelle</span>':''}</div>${selected.next_due?`<button class="btn primary" id="completeTask" data-complete-task="${selected.id}">Marquer comme faite</button>`:''}</article>`);
   const button=$('#completeTask');
   if(button)button.onclick=async()=>{
     button.disabled=true;
     try{
       await api(`/api/companies/${cid}/tasks/${selected.id}/complete`,{method:'POST',body:JSON.stringify({occurrence:selected.next_due})});
       await finishForm('calendar');
       notify('Échéance traitée.');
     }catch(e){button.disabled=false;notify(e.message);}
   };
 }else{
   renderCalendarPage(`<div class="heading"><h1>Agenda</h1><a class="btn primary" href="#/task-new" data-go="task-new">＋ Échéance</a></div>
   <div class="task-list">${tasks.length?tasks.map(t=>`<button class="task-row" data-task-open="${t.id}"><span><strong>${clean(t.title)}</strong><small>${dueLabel(t)}${t.monthly?' · Mensuelle':''}</small></span><span aria-hidden="true">›</span></button>`).join(''):'<p class="empty">Aucune échéance.</p>'}</div>`);
   document.querySelectorAll('[data-task-open]').forEach(button=>button.onclick=()=>openTab('calendar',{taskId:Number(button.dataset.taskOpen)}));
 }
}
async function renderTaskForm(){
 const cid=company?.id;
 if(!cid)throw Error('Sélectionnez une entreprise.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 renderFormPage(`<h1>Nouvelle échéance</h1><form id="taskForm" class="stack">
 <div class="field"><label for="taskTitle">Action</label><input id="taskTitle" name="title" required minlength="2" maxlength="150"></div>
 <div class="field"><label for="taskDescription">Description</label><textarea id="taskDescription" name="description" required minlength="2" maxlength="2000"></textarea></div>
 <div class="field"><label for="taskDate">Date</label><input id="taskDate" name="first_due" type="date" value="${clean(today)}" required></div>
 <div class="field"><label for="taskRepeat">Répétition</label><select id="taskRepeat" name="repeat"><option value="once">Une fois</option><option value="monthly">Chaque mois</option></select></div>
 <button class="btn primary">Enregistrer</button></form>`);
 $('#taskForm').onsubmit=async e=>{
   e.preventDefault();
   const button=e.submitter||e.target.querySelector('button[type="submit"],button:not([type])');
   const form=new FormData(e.target);
   button.disabled=true;
   try{
     await api(`/api/companies/${cid}/tasks`,{method:'POST',body:JSON.stringify({title:form.get('title'),description:form.get('description'),first_due:form.get('first_due'),monthly:form.get('repeat')==='monthly'})});
     await finishForm('calendar');
     notify('Échéance enregistrée.');
   }catch(err){button.disabled=false;notify(err.message);}
 };
}

setInterval(() => {
  if (me && tab==='dashboard' && !document.hidden && document.querySelector('#modalLayer').classList.contains('hide')) {
    renderPriorities().catch(()=>{});
  }
}, 60000);
document.addEventListener('visibilitychange',()=>{
 if(me&&tab==='dashboard'&&!document.hidden&&document.querySelector('#modalLayer').classList.contains('hide'))renderPriorities().catch(()=>{});
});

function refreshHomeMessages(cards,cockpit){
 if(tab!=='dashboard')return;
 const routes={task:'calendar',activity:'activities',client:'clients',document:'scanner',quote:'leads',email:'emails',social:'social',prospect:'prospects',risk:'risks',equipment:'equipment',material:'equipment',lead:'requests'};
 document.querySelectorAll('#content .module-card').forEach(tile=>{
  const key=tile.dataset.module,card=cards.find(c=>!c.example&&!c.fallback&&routes[c.action.type]===key);
  const label=modulePresentation(key,cockpit).label;
  const message=card?card.title:label==='Normal'?'':label;
  const insight=tile.querySelector('.module-insight');insight.textContent=message;insight.title=message;
 });
}

