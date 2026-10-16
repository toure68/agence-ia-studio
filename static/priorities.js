'use strict';
let priorityCards = [];

async function renderPriorities() {
  const host = document.querySelector('#priorityBlock');
  const cid = company?.id;
  if (!host || !cid) return;
  const cards = await api(`/api/companies/${cid}/priorities`);
  if (!host.isConnected || company?.id !== cid) return;
  priorityCards = cards;
  host.innerHTML = `<div class="between priority-heading"><div><p class="eyebrow">À faire maintenant</p><h2>Vos priorités <span class="badge">${cards.length}</span></h2></div><button class="btn small" id="calendarTasks">Échéances</button></div>
    <p class="sub small">Alertes de suivi selon vos dossiers et échéances configurées. Aucune action externe automatique.</p>
    ${cards.length ? `<div class="priority-rail" aria-label="Cartes prioritaires" tabindex="0">${cards.map((c,i) => `<article class="priority-card ${c.kind === 'calendar' ? 'calendar' : 'urgent'}" data-priority="${clean(c.key)}" aria-label="Priorité ${i+1} sur ${cards.length}"><span class="badge">${c.kind === 'calendar' ? 'Calendrier' : 'Suivi assisté'}</span><h3>${clean(c.title)}</h3><p>${clean(c.description)}</p><div class="priority-actions"><button class="btn primary" data-priority-open="${i}">${clean(c.action_label)} →</button><button class="btn small" data-priority-dismiss="${i}" title="Retirer de mes priorités sans modifier le dossier">Retirer de mes priorités</button></div></article>`).join('')}</div>
    <div class="between priority-controls"><span class="tiny sub" id="priorityPosition" aria-live="polite">1 / ${cards.length} · Faites défiler les cartes</span><div class="row"><button class="btn small" id="priorityPrev" aria-label="Priorité précédente">←</button><button class="btn small" id="priorityNext" aria-label="Priorité suivante">→</button></div></div>` : '<div class="priority-empty">Aucune priorité en attente. Vos prochaines échéances apparaîtront ici à partir de J−7.</div>'}`;
  host.querySelector('#calendarTasks').onclick = () => calendarTasks().catch(e => notify(e.message));
  const rail = host.querySelector('.priority-rail');
  if (!rail) return;
  const updatePosition = () => {
    const items = [...rail.children];
    const index = items.reduce((best, el, i) => Math.abs(el.getBoundingClientRect().left - rail.getBoundingClientRect().left) < Math.abs(items[best].getBoundingClientRect().left - rail.getBoundingClientRect().left) ? i : best, 0);
    host.querySelector('#priorityPosition').textContent = `${index+1} / ${cards.length} · Faites défiler les cartes`;
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
      if (card.action.type === 'task') return await calendarTasks(card.action.id);
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
      await api(`/api/companies/${cid}/priorities/dismiss`, {method:'POST', body:JSON.stringify({key:cards[Number(btn.dataset.priorityDismiss)].key})});
      await renderPriorities();
      notify('Carte retirée de vos priorités. Le dossier reste disponible.');
    } catch(e) { btn.disabled = false; notify(e.message); }
  });
}

async function calendarTasks(selectedId = null) {
  const cid = company?.id;
  if (!cid) return;
  const tasks = await api(`/api/companies/${cid}/tasks`);
  if (company?.id !== cid) return;
  const selected = tasks.find(t => t.id === selectedId);
  const visible = selected ? [selected] : tasks;
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  openModal(`<h2>${selected ? clean(selected.title) : 'Calendrier des échéances'}</h2><p class="small sub">${clean(company.name)} · Dates définies par votre équipe. Une tâche mensuelle réapparaît pour l’échéance suivante après validation. Une validation enregistre le suivi ; elle n’envoie aucun document.</p><div class="stack">${visible.length ? visible.map(t => `<article class="card-flat"><b>${clean(t.title)}</b><p class="small">${clean(t.description)}</p><p class="tiny sub">${t.monthly ? 'Chaque mois' : 'Une seule fois'} · ${t.next_due ? 'Prochaine échéance : ' + timestamp(t.next_due+'T12:00:00') : 'Terminée'}</p>${t.next_due ? `<button class="btn primary small" data-complete-task="${t.id}">Marquer cette échéance comme traitée</button>` : ''}</article>`).join('') : '<p class="sub">Aucune échéance configurée. Ajoutez vos tâches réelles ci-dessous.</p>'}</div>
    ${selected ? '<button class="btn small" id="allCalendarTasks">Toutes les échéances</button>' : ''}
    <hr class="hr"><h3>Ajouter une échéance</h3><form id="taskForm" class="stack"><div class="field"><label for="taskTitle">Action à effectuer</label><input id="taskTitle" name="title" required minlength="2" maxlength="150" placeholder="Ex. Valider les bulletins de paie"></div><div class="field"><label for="taskDescription">Description et consignes</label><textarea id="taskDescription" name="description" required minlength="2" maxlength="2000"></textarea></div><div class="field"><label for="taskDate">Première date d’échéance</label><input id="taskDate" name="first_due" type="date" value="${clean(today)}" required></div><div class="field"><label for="taskRepeat">Répétition</label><select id="taskRepeat" name="repeat"><option value="once">Une seule fois</option><option value="monthly">Chaque mois à cette date</option></select></div><p class="tiny sub">Pour un jour absent du mois (ex. 31 février), le dernier jour du mois est retenu. Les dates fiscales ou de paie sont à configurer selon votre situation.</p><button class="btn primary">Enregistrer l’échéance</button></form>`);
  const all = document.querySelector('#allCalendarTasks');
  if (all) all.onclick = () => calendarTasks().catch(e=>notify(e.message));
  document.querySelectorAll('[data-complete-task]').forEach(btn => btn.onclick = async () => {
    const task = tasks.find(t=>t.id===Number(btn.dataset.completeTask));
    btn.disabled = true;
    try {
      await api(`/api/companies/${cid}/tasks/${task.id}/complete`, {method:'POST',body:JSON.stringify({occurrence:task.next_due})});
      closeModal();
      if (tab==='dashboard') await renderPriorities();
      notify('Échéance traitée et enregistrée.');
    } catch(e) { btn.disabled = false; notify(e.message); }
  });
  document.querySelector('#taskForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const form = new FormData(e.target);
    btn.disabled = true;
    try {
      await api(`/api/companies/${cid}/tasks`, {method:'POST',body:JSON.stringify({title:form.get('title'),description:form.get('description'),first_due:form.get('first_due'),monthly:form.get('repeat')==='monthly'})});
      await calendarTasks();
      if (tab==='dashboard') await renderPriorities();
      notify('Échéance enregistrée.');
    } catch(err) { btn.disabled = false; notify(err.message); }
  };
}

setInterval(() => {
  if (me && tab==='dashboard' && !document.hidden && document.querySelector('#modalLayer').classList.contains('hide')) {
    renderPriorities().catch(()=>{});
  }
}, 60000);
