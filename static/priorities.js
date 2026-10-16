function priorityMarkup(cards){
 if(!cards.length)return '<div class="priority-empty" role="status"><span class="priority-check" aria-hidden="true">✓</span><span>Tout est à jour</span><button class="text-button" id="resetPriorityExamples">Revoir les exemples</button></div>';
 const examples=cards.every(c=>c.example);
 return `<div class="priority-heading"><h2>${examples?'Exemples de priorités':'À traiter'} <span class="badge">${cards.length}</span></h2></div>
 <div class="priority-rail" aria-label="Cartes prioritaires" tabindex="0">${cards.map((c,i)=>`<article class="priority-card ${c.kind==='calendar'?'calendar':'urgent'} ${c.example?'example-card':''}" data-priority="${clean(c.key)}" aria-label="Priorité ${i+1} sur ${cards.length}"><div class="priority-badges"><span class="badge">${c.example?'Exemple':c.kind==='calendar'?'Échéance':'Suivi'}</span><span class="importance ${clean(c.level||(c.rank===0?'urgent':c.rank<=2?'high':'normal'))}">${clean(c.importance||(c.rank===0?'Urgente':c.rank<=2?'Importante':'À prévoir'))}</span></div><h3>${clean(c.title)}</h3><p>${clean(c.description)}</p><div class="priority-actions"><button class="btn primary" data-priority-open="${i}">${clean(c.action_label)} →</button><button class="btn small" data-priority-dismiss="${i}" title="Retirer de mes priorités sans modifier le dossier">Masquer</button></div></article>`).join('')}</div>
 <div class="priority-controls"><span class="tiny sub" id="priorityPosition" aria-live="polite">1 / ${cards.length}</span><div class="row"><button class="back-circle carousel-control" id="priorityPrev" aria-label="Priorité précédente">‹</button><button class="back-circle carousel-control" id="priorityNext" aria-label="Priorité suivante">›</button></div></div>`;
}
'use strict';
let priorityCards = [];

async function renderPriorities() {
  const host = document.querySelector('#priorityBlock');
  const cid = company?.id;
  if (!host || !cid) return;
  const actualCards = await api(`/api/companies/${cid}/priorities`);
  const cards = actualCards.length ? actualCards : visibleExamples();
  if (!host.isConnected || company?.id !== cid) return;
  priorityCards = cards;
  host.innerHTML = priorityMarkup(cards);
  const reset = host.querySelector('#resetPriorityExamples');
  if(reset)reset.onclick=async()=>{try{sessionStorage.removeItem(exampleStorageKey());}catch(e){}await renderPriorities();};
  const rail = host.querySelector('.priority-rail');
  if (!rail) return;
  const updatePosition = () => {
    const items = [...rail.children];
    const index = items.reduce((best, el, i) => Math.abs(el.getBoundingClientRect().left - rail.getBoundingClientRect().left) < Math.abs(items[best].getBoundingClientRect().left - rail.getBoundingClientRect().left) ? i : best, 0);
    host.querySelector('#priorityPosition').textContent = `${index+1} / ${cards.length}`;
    host.querySelector('#priorityPrev').disabled = rail.scrollLeft < 2;
    host.querySelector('#priorityNext').disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
  };
  rail.addEventListener('scroll', updatePosition, {passive:true});
  host.querySelector('#priorityPrev').onclick = () => rail.scrollBy({left: -rail.clientWidth, behavior:'smooth'});
  host.querySelector('#priorityNext').onclick = () => rail.scrollBy({left: rail.clientWidth, behavior:'smooth'});
  updatePosition();
  host.querySelectorAll('[data-priority-open]').forEach(btn => btn.onclick = async () => {
    const card = cards[Number(btn.dataset.priorityOpen)];
    try {
      if (card.action.type === 'example') return await openTab('priority-example',{recordId:card.action.id});
      if (card.action.type === 'activity') return await openTab('activity',{recordId:card.action.id});
      if (card.action.type === 'task') return await openTab('calendar', {taskId:card.action.id});
      if (card.action.type === 'prospect') {
        await openTab('prospects');
        return await prospectDetail(card.action.id);
      }
      await openTab('leads');
      leadDetail(card.action.id);
    } catch (e) { notify(e.message); }
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
   const button=e.target.querySelector('button');
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
