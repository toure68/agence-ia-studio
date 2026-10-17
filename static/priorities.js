function priorityPresentation(c){
 if(c.state)return tileState(c.state,c.state_label);
 if(c.action.type==='social')return tileState('warning','À valider');
 if(c.rank===0)return tileState('danger','Urgent');
 if(c.rank<=2)return tileState('warning',c.action.type==='document'?'À vérifier':'Important');
 if(['client','quote','document','email'].includes(c.action.type))return tileState('warning',({client:'À valider',quote:'À finaliser',document:'À vérifier',email:'À relire'})[c.action.type]);
 if(c.action.type==='task')return tileState('warning','À prévoir');
 if(c.workflow_status==='waiting')return tileState('warning','En attente');
 if(c.workflow_status==='doing')return tileState('info','En cours');
 if(c.action.type==='activity')return tileState('info','À faire');
 return tileState('neutral',c.fallback?'À préparer':'À faire');
}
function priorityMarkup(cards){
 if(!cards.length)return '';
 return `<div class="priority-stack" aria-label="Priorités par importance">${cards.map((c,i)=>{
  const level=c.level||(c.rank===0?'urgent':c.rank<=2?'high':'normal');
  const importance=c.importance||({client:'À valider',document:'À vérifier',quote:'À finaliser'})[c.action.type]||(c.rank===0?'Urgente':c.rank<=2?'Importante':'À prévoir');
  const icon=({activity:'✅',task:'🗓️',client:'👤',document:'📄',quote:'🧾',email:'✉️'})[c.action.type]||'📥';
  const presentation=priorityPresentation(c);
  return `<article class="priority-card priority-tier-${Math.min(i+1,5)} ${c.example?'example-card':''} ${c.fallback?'routine-card':''}" data-priority="${clean(c.key)}"><button class="module-tile priority-tile tone-${moduleTone(({task:'calendar',client:'clients',document:'scanner',activity:'activities',quote:'leads',email:'emails',prospect:'prospects',risk:'risks',equipment:'equipment',material:'equipment'})[c.action.type])} state-${presentation.state}" data-state="${presentation.state}" data-priority-open="${i}" aria-label="Priorité ${i+1} : ${clean(c.title)} · ${clean(presentation.label)}${c.example?' · Exemple':''}"><span class="module-icon" aria-hidden="true">${icon}</span><span class="priority-copy"><strong>${clean(c.title)}</strong><span class="priority-labels"><span class="importance ${clean(level)}">${clean(presentation.label)}</span>${c.example?'<span class="example-label">Exemple</span>':''}</span></span></button>${['task','activity'].includes(c.action.type)?`<button class="btn primary priority-validate" data-priority-complete="${i}">Marquer comme faite</button>`:''}${!c.fallback?`<button class="priority-dismiss" data-priority-dismiss="${i}" aria-label="Masquer : ${clean(c.title)}" title="Masquer cette priorité">×</button>`:''}</article>`;
 }).join('')}</div>`;
}
'use strict';
let priorityCards = [];
let priorityRequest = 0;

async function renderPriorities() {
  const host = document.querySelector('#priorityBlock');
  const cid = company?.id;
  if (!host || !cid) return;
  const request=++priorityRequest;
  const [actualCards,cockpit] = await Promise.all([api(`/api/companies/${cid}/priorities`),api(`/api/companies/${cid}/cockpit`)]);
  actualCards.sort((a,b)=>a.rank-b.rank||(a.due||'').localeCompare(b.due||''));
  const cards = actualCards.length ? actualCards : await routinePriorities(cid);
  if (!host.isConnected || company?.id !== cid || request!==priorityRequest) return;
  refreshHomeBadges(cockpit.badges,cockpit.risk_cards,cockpit.module_states);
  priorityCards = cards;
  await refreshInlineActions(cards,cockpit);
  host.innerHTML = priorityMarkup(cards);
  host.querySelectorAll('[data-priority-open]').forEach(btn => btn.onclick = async () => {
    const card = cards[Number(btn.dataset.priorityOpen)];
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
  });
  host.querySelectorAll('[data-priority-complete]').forEach(btn=>btn.onclick=async()=>{
    const card=cards[Number(btn.dataset.priorityComplete)];btn.disabled=true;
    try{await completeInlinePriority(card,cid);await renderPriorities();notify('Tâche traitée.');}catch(e){btn.disabled=false;notify(e.message);}
  });
  host.querySelectorAll('[data-priority-dismiss]').forEach(btn => btn.onclick = async () => {
    btn.disabled = true;
    try {
      const card=cards[Number(btn.dataset.priorityDismiss)];
      if(card.example){completeExample(card.action.id);await renderPriorities();return;}
      await api(`/api/companies/${cid}/priorities/dismiss`, {method:'POST', body:JSON.stringify({key:cards[Number(btn.dataset.priorityDismiss)].key})});
      await renderPriorities();
      notify('Priorité masquée.');
    } catch(e) { btn.disabled = false; notify(e.message); }
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

async function completeInlinePriority(card,cid){
 if(card.action.type==='task')return api(`/api/companies/${cid}/tasks/${card.action.id}/complete`,{method:'POST',body:JSON.stringify({occurrence:card.action.occurrence})});
 if(card.action.type==='activity')return api(`/api/companies/${cid}/activities/${card.action.id}/status`,{method:'PATCH',body:JSON.stringify({status:'done'})});
 throw Error('Cette action nécessite une vérification dans le panneau.');
}
async function refreshInlineActions(cards,cockpit){
 const cid=company.id,host=$('#content');
 const clients=cards.some(c=>c.action.type==='client')?await api(`/api/companies/${cid}/clients`):[];
 if(company.id!==cid||host!==$('#content')||tab!=='dashboard')return;
 const routes={task:'calendar',activity:'activities',client:'clients',document:'scanner',quote:'leads',email:'emails',social:'social',prospect:'prospects',risk:'risks',equipment:'equipment',material:'equipment',lead:'requests'};
 host.querySelectorAll('.module-card').forEach(tile=>{
  const key=tile.dataset.module,card=cards.find(c=>!c.example&&!c.fallback&&routes[c.action.type]===key);
  const insight=tile.querySelector('.module-insight'),actions=tile.querySelector('.module-inline-action');actions.replaceChildren();
  const presentation=modulePresentation(key,cockpit);
  insight.textContent=card?card.title:presentation.label;
  if(!card)return;
  const button=document.createElement('button');button.type='button';button.className='btn small';
  if(['task','activity'].includes(card.action.type)){
   button.textContent='Marquer comme faite';button.onclick=async()=>{button.disabled=true;try{await completeInlinePriority(card,cid);await renderPriorities();notify('Tâche traitée.');}catch(err){button.disabled=false;notify(err.message);}};
  }else if(card.action.type==='client'){
   const client=clients.find(c=>c.id===card.action.id);if(!client||!client.needs_review)return;
   const details=document.createElement('dl');details.className='inline-client-facts';
   for(const [label,key] of [['Nom','name'],['E-mail','email'],['Téléphone','phone'],['Adresse','address'],['Notes','notes']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=client[key]||'Non renseigné';details.append(dt,dd);}
   actions.append(details);button.textContent='Valider ces informations';
   button.onclick=async()=>{button.disabled=true;try{await api(`/api/companies/${cid}/clients/${client.id}/validate`,{method:'POST',body:JSON.stringify({revision:client.review_revision})});await renderPriorities();notify('Fiche client validée.');}catch(err){button.disabled=false;notify(err.message);}};
  }else{
   button.textContent=card.action.type==='email'?'Relire':card.action.type==='quote'?'Vérifier le devis':'Vérifier';
   button.onclick=()=>host.querySelector(`[data-priority-open="${cards.indexOf(card)}"]`)?.click();
  }
  actions.append(button);
 });
}
