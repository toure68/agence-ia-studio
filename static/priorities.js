function priorityMarkup(cards){
 if(!cards.length)return '';
 return `<div class="priority-stack" aria-label="Priorités par importance">${cards.map((c,i)=>{
  const level=c.level||(c.rank===0?'urgent':c.rank<=2?'high':'normal');
  const importance=c.importance||(c.rank===0?'Urgente':c.rank<=2?'Importante':'À prévoir');
  const icon=c.action.type==='activity'?'✅':c.kind==='calendar'?'🗓️':'📥';
  return `<article class="priority-card priority-tier-${Math.min(i+1,4)} ${c.example?'example-card':''} ${c.fallback?'routine-card':''}" data-priority="${clean(c.key)}"><button class="module-tile priority-tile ${c.kind==='calendar'?'blue':'green'}" data-priority-open="${i}" aria-label="${clean(c.title)} · ${clean(importance)}${c.example?' · Exemple':''}"><span class="module-icon" aria-hidden="true">${icon}</span><span class="priority-copy"><strong>${clean(c.title)}</strong><span class="priority-labels"><span class="importance ${clean(level)}">${clean(importance)}</span>${c.example?'<span class="example-label">Exemple</span>':''}</span></span></button>${['task','activity'].includes(c.action.type)?`<button class="btn primary priority-validate" data-priority-complete="${i}">Marquer comme faite</button>`:''}${!c.fallback?`<button class="priority-dismiss" data-priority-dismiss="${i}" aria-label="Masquer : ${clean(c.title)}" title="Masquer cette priorité">×</button>`:''}</article>`;
 }).join('')}</div>`;
}
'use strict';
let priorityCards = [];

async function renderPriorities() {
  const host = document.querySelector('#priorityBlock');
  const cid = company?.id;
  if (!host || !cid) return;
  const [actualCards,cockpit] = await Promise.all([api(`/api/companies/${cid}/priorities`),api(`/api/companies/${cid}/cockpit`)]);
  refreshHomeBadges(cockpit.badges);
  actualCards.sort((a,b)=>a.rank-b.rank||(a.due||'').localeCompare(b.due||''));
  const cards = (actualCards.length ? actualCards : await routinePriorities(cid)).slice(0,1);
  if (!host.isConnected || company?.id !== cid) return;
  priorityCards = cards;
  host.innerHTML = priorityMarkup(cards);
  host.querySelectorAll('[data-priority-open]').forEach(btn => btn.onclick = async () => {
    const card = cards[Number(btn.dataset.priorityOpen)];
    try {
      if (card.action.type === 'example') return await openTab('priority-example',{recordId:card.action.id});
      if (card.action.type === 'activity-new') return openVoiceCommand('activity',true);
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
    try{if(card.action.type==='task')await api(`/api/companies/${cid}/tasks/${card.action.id}/complete`,{method:'POST',body:JSON.stringify({occurrence:card.action.occurrence})});else await api(`/api/companies/${cid}/activities/${card.action.id}/status`,{method:'PATCH',body:JSON.stringify({status:'done'})});await renderPriorities();notify('Tâche traitée.');}catch(e){btn.disabled=false;notify(e.message);}
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
