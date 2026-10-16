'use strict';
const workStates={todo:'À faire',doing:'En cours',waiting:'En attente',done:'Terminée',cancelled:'Annulée'};
const workPriorities={urgent:'Urgente',high:'Élevée',normal:'Normale',low:'Faible'};
const workCategories={operations:'Opérations',commercial:'Commercial',administration:'Administration',projet:'Projet',finance:'Finance',equipe:'Équipe'};
function selectMap(values,selected){return Object.entries(values).map(([key,label])=>`<option value="${clean(key)}" ${key===selected?'selected':''}>${clean(label)}</option>`).join('');}

async function renderClients(){
 const cid=company?.id;if(!cid)throw Error('Sélectionnez une entreprise.');
 const records=await api(`/api/companies/${cid}/clients`);
 $('#content').innerHTML=`<div class="heading"><h1>Clients</h1><a class="btn primary" href="#/client-new" data-go="client-new">＋ Client</a></div><div class="list-filters"><input class="control" id="clientSearch" type="search" placeholder="Rechercher" aria-label="Rechercher un client"><label class="archive-filter"><input id="clientArchived" type="checkbox"> Archives</label></div><div class="task-list" id="clientList"></div>`;
 function draw(){
  const search=$('#clientSearch').value.toLocaleLowerCase('fr');const archived=$('#clientArchived').checked;
  const visible=records.filter(c=>c.archived===archived&&[c.name,c.email,c.phone].join(' ').toLocaleLowerCase('fr').includes(search));
  $('#clientList').innerHTML=visible.length?visible.map(c=>`<button class="task-row" data-client-open="${c.id}"><span><strong>${clean(c.name)}</strong><small>${clean(c.email||c.phone||'')}</small></span><span aria-hidden="true">›</span></button>`).join(''):'<p class="empty">Aucun client.</p>';
  document.querySelectorAll('[data-client-open]').forEach(b=>b.onclick=()=>openTab('client-edit',{recordId:Number(b.dataset.clientOpen)}));
 }
 $('#clientSearch').oninput=draw;$('#clientArchived').onchange=draw;draw();
}

async function renderClientForm(id=null){
 const cid=company?.id;if(!cid)throw Error('Sélectionnez une entreprise.');
 const c=id?await api(`/api/companies/${cid}/clients/${id}`):{};
 renderFormPage(`<h1>${id?'Modifier le client':'Nouveau client'}</h1><form id="clientForm" class="stack"><div class="field"><label for="clientName">Nom</label><input id="clientName" name="name" required minlength="2" maxlength="150" value="${clean(c.name)}"></div><div class="fields"><div class="field"><label for="clientEmail">Email</label><input id="clientEmail" name="email" type="email" maxlength="200" value="${clean(c.email)}"></div><div class="field"><label for="clientPhone">Téléphone</label><input id="clientPhone" name="phone" type="tel" maxlength="60" value="${clean(c.phone)}"></div></div><div class="field"><label for="clientAddress">Adresse</label><input id="clientAddress" name="address" maxlength="400" value="${clean(c.address)}"></div><div class="field"><label for="clientNotes">Notes</label><textarea id="clientNotes" name="notes" maxlength="3000">${clean(c.notes)}</textarea></div>${id?`<label class="archive-filter"><input name="archived" type="checkbox" ${c.archived?'checked':''}> Archiver ce client</label>`:''}<button class="btn primary">Enregistrer</button></form>`);
 $('#clientForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter||e.target.querySelector('button[type="submit"],button:not([type])');button.disabled=true;const form=new FormData(e.target);const data=Object.fromEntries(form.entries());data.archived=form.has('archived');try{await api(`/api/companies/${cid}/clients${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify(data)});await finishForm('clients');notify('Client enregistré.');}catch(err){button.disabled=false;notify(err.message);}};
}

async function renderActivities(){
 const cid=company?.id;if(!cid)throw Error('Sélectionnez une entreprise.');
 const records=await api(`/api/companies/${cid}/activities`);
 $('#content').innerHTML=`<div class="heading"><h1>Activités</h1><a class="btn primary" href="#/activity-new" data-go="activity-new">＋ Activité</a></div><div class="list-filters"><input class="control" id="activitySearch" type="search" placeholder="Rechercher" aria-label="Rechercher une activité"><select class="control" id="activityFilter" aria-label="État des activités"><option value="open">À traiter</option><option value="all">Toutes</option>${selectMap(workStates,'')}</select></div><div class="task-list" id="activityList"></div>`;
 function draw(){
  const status=$('#activityFilter').value,search=$('#activitySearch').value.toLocaleLowerCase('fr');
  const weight={urgent:0,high:1,normal:2,low:3};
  const visible=records.filter(w=>(status==='all'||status==='open'&&!['done','cancelled'].includes(w.status)||w.status===status)&&[w.title,w.assignee,w.client_name].join(' ').toLocaleLowerCase('fr').includes(search)).sort((a,b)=>weight[a.priority]-weight[b.priority]||(a.due||'9999').localeCompare(b.due||'9999'));
  $('#activityList').innerHTML=visible.length?visible.map(w=>`<button class="task-row" data-activity-open="${w.id}"><span><strong>${clean(w.title)}</strong><small>${clean(workStates[w.status])}${w.assignee?' · '+clean(w.assignee):''}${w.due?' · '+timestamp(w.due+'T12:00:00'):''}</small></span><span class="importance ${clean(w.priority)}">${clean(workPriorities[w.priority])}</span></button>`).join(''):'<p class="empty">Aucune activité.</p>';
  document.querySelectorAll('[data-activity-open]').forEach(b=>b.onclick=()=>openTab('activity',{recordId:Number(b.dataset.activityOpen)}));
 }
 $('#activitySearch').oninput=draw;$('#activityFilter').onchange=draw;draw();
}

async function renderActivityForm(id=null){
 const cid=company?.id;if(!cid)throw Error('Sélectionnez une entreprise.');
 const [w,clients]=await Promise.all([id?api(`/api/companies/${cid}/activities/${id}`):Promise.resolve({}),api(`/api/companies/${cid}/clients`)]);
 renderFormPage(`<h1>${id?'Modifier l’activité':'Nouvelle activité'}</h1><form id="activityForm" class="stack"><div class="field"><label for="activityTitle">Action</label><input id="activityTitle" name="title" required minlength="2" maxlength="150" value="${clean(w.title)}"></div><div class="field"><label for="activityDescription">Description</label><textarea id="activityDescription" name="description" maxlength="4000">${clean(w.description)}</textarea></div><div class="fields"><div class="field"><label for="activityCategory">Domaine</label><select id="activityCategory" name="category">${selectMap(workCategories,w.category||'operations')}</select></div><div class="field"><label for="activityPriority">Importance</label><select id="activityPriority" name="priority">${selectMap(workPriorities,w.priority||'normal')}</select></div><div class="field"><label for="activityAssignee">Responsable</label><input id="activityAssignee" name="assignee" maxlength="120" value="${clean(w.assignee)}"></div><div class="field"><label for="activityDue">Échéance</label><input id="activityDue" name="due" type="date" value="${clean(w.due)}"></div><div class="field"><label for="activityStatus">État</label><select id="activityStatus" name="status">${selectMap(workStates,w.status||'todo')}</select></div><div class="field"><label for="activityClient">Client</label><select id="activityClient" name="client_id"><option value="">Aucun</option>${clients.filter(c=>!c.archived||c.id===w.client_id).map(c=>`<option value="${c.id}" ${c.id===w.client_id?'selected':''}>${clean(c.name)}</option>`).join('')}</select></div></div><button class="btn primary">Enregistrer</button></form>`);
 $('#activityForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter||e.target.querySelector('button[type="submit"],button:not([type])');button.disabled=true;const data=Object.fromEntries(new FormData(e.target).entries());data.due=data.due||null;data.client_id=data.client_id?Number(data.client_id):null;try{await api(`/api/companies/${cid}/activities${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify(data)});await finishForm('activities');notify('Activité enregistrée.');}catch(err){button.disabled=false;notify(err.message);}};
}

async function renderActivity(id){
 const cid=company?.id;if(!cid||!id)throw Error('Activité introuvable.');
 const w=await api(`/api/companies/${cid}/activities/${id}`);
 const closed=['done','cancelled'].includes(w.status);
 $('#content').innerHTML=`<section class="form-page"><h1>${clean(w.title)}</h1><article class="task-detail"><div class="task-meta"><span class="importance ${clean(w.priority)}">${clean(workPriorities[w.priority])}</span><span class="badge">${clean(workStates[w.status])}</span></div>${w.description?`<p>${clean(w.description)}</p>`:''}<dl class="activity-facts"><div><dt>Domaine</dt><dd>${clean(workCategories[w.category])}</dd></div>${w.assignee?`<div><dt>Responsable</dt><dd>${clean(w.assignee)}</dd></div>`:''}${w.due?`<div><dt>Échéance</dt><dd>${timestamp(w.due+'T12:00:00')}</dd></div>`:''}${w.client_name?`<div><dt>Client</dt><dd>${clean(w.client_name)}</dd></div>`:''}</dl><div class="row">${!closed&&w.status!=='doing'?'<button class="btn" data-work-status="doing">Démarrer</button>':''}${!closed?'<button class="btn primary" data-work-status="done">Terminer</button>':''}<a class="btn" href="#/material/${w.id}" data-go="material" data-record-id="${w.id}">Matériel</a><a class="btn" href="#/activity-edit/${w.id}" data-go="activity-edit" data-record-id="${w.id}">Modifier</a></div></article></section>`;
 if(!operationsEnabled)document.querySelectorAll('[data-go="material"]').forEach(link=>link.remove());
 document.querySelectorAll('[data-work-status]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api(`/api/companies/${cid}/activities/${id}/status`,{method:'PATCH',body:JSON.stringify({status:b.dataset.workStatus})});await renderActivity(id);notify('État enregistré.');}catch(e){b.disabled=false;notify(e.message);}});
}

async function renderReports(){
 const cid=company?.id;if(!cid)throw Error('Sélectionnez une entreprise.');
 const r=await api(`/api/companies/${cid}/reports`);
 const total=Object.values(r.activities).reduce((a,b)=>a+b,0),open=['todo','doing','waiting'].reduce((sum,key)=>sum+(r.activities[key]||0),0);
 $('#content').innerHTML=`<div class="heading"><h1>Rapports</h1></div><div class="grid grid2">${[['Clients actifs',r.clients_active],['Activités à traiter',open],['Activités terminées',r.activities.done||0],['Activités en retard',r.overdue]].map(([label,value])=>`<article class="card"><p class="sub">${label}</p><strong class="stat-num">${value}</strong></article>`).join('')}</div><section class="report-section"><h2>Suivi des activités</h2><p class="sub">${total} activité(s) enregistrée(s)</p><dl class="report-lines">${Object.entries(workStates).map(([key,label])=>`<div><dt>${label}</dt><dd>${r.activities[key]||0}</dd></div>`).join('')}</dl></section><section class="report-section"><h2>Demandes clients</h2><dl class="report-lines">${Object.entries(r.leads).map(([label,n])=>`<div><dt>${clean(label)}</dt><dd>${n}</dd></div>`).join('')||'<div><dt>Demandes reçues</dt><dd>0</dd></div>'}<div><dt>Montants estimés des devis</dt><dd>${money(r.estimates_total)}</dd></div><div><dt>Devis marqués signés</dt><dd>${money(r.estimates_signed)}</dd></div></dl></section>`;
 const quotes=r.quotations||{};
 $('#content').insertAdjacentHTML('beforeend',`<section class="report-section"><h2>Devis créés</h2><dl class="report-lines">${Object.entries(quoteStates).map(([key,label])=>`<div><dt>${label}</dt><dd>${quotes[key]||0}</dd></div>`).join('')}${(r.quotation_totals||[]).map(t=>`<div><dt>Devis acceptés · ${clean(t.currency)}</dt><dd>${quoteMoney(t.total_minor,t.currency)}</dd></div>`).join('')}</dl></section>`);

}

async function renderDrafts(id=null){
 const drafts=await api('/api/drafts');
 if(id){
  const d=drafts.find(x=>x.id===id);if(!d)throw Error('Brouillon introuvable.');
  $('#content').innerHTML=`<section class="form-page"><h1>${clean(d.subject)}</h1><article class="task-detail"><p class="sub">${clean(d.prospect_name)} · Brouillon</p><p class="draft-body">${clean(d.body)}</p><div class="row"><button class="btn primary" id="copySavedDraft">Copier</button><button class="btn" id="openDraftProspect">Ouvrir le suivi</button></div></article></section>`;
  $('#copySavedDraft').onclick=async()=>{try{await navigator.clipboard.writeText('Objet : '+d.subject+'\n\n'+d.body);notify('Brouillon copié.');}catch(e){notify('Copie indisponible.');}};
  $('#openDraftProspect').onclick=async()=>{await openTab('prospects');await prospectDetail(d.prospect_id);};
  return;
 }
 $('#content').innerHTML='<div class="heading"><h1>Brouillons</h1></div><div class="list-filters"><input class="control" id="draftSearch" type="search" placeholder="Rechercher" aria-label="Rechercher un brouillon"></div><div class="task-list" id="draftList"></div>';
 function draw(){const search=$('#draftSearch').value.toLocaleLowerCase('fr');const visible=drafts.filter(d=>[d.subject,d.prospect_name].join(' ').toLocaleLowerCase('fr').includes(search));$('#draftList').innerHTML=visible.length?visible.map(d=>`<button class="task-row" data-draft-open="${d.id}"><span><strong>${clean(d.subject)}</strong><small>${clean(d.prospect_name)} · ${timestamp(d.created)}</small></span><span aria-hidden="true">›</span></button>`).join(''):'<p class="empty">Aucun brouillon.</p>';document.querySelectorAll('[data-draft-open]').forEach(b=>b.onclick=()=>openTab('draft',{recordId:Number(b.dataset.draftOpen)}));}
 $('#draftSearch').oninput=draw;draw();
}

const priorityExamples=[
 {key:'example-1',kind:'urgent',title:'Répondre à un client',description:'Une demande attend une réponse. Vérifier le besoin et préparer le suivi.',importance:'Urgente',level:'urgent',action_label:'Voir le traitement',action:{type:'example',id:1},example:true},
 {key:'example-2',kind:'urgent',title:'Préparer une intervention',description:'Confirmer les étapes et désigner un responsable avant le démarrage.',importance:'Élevée',level:'high',action_label:'Voir le traitement',action:{type:'example',id:2},example:true},
 {key:'example-3',kind:'calendar',title:'Valider le travail de l’équipe',description:'Contrôler les tâches réalisées et clôturer celles qui sont terminées.',importance:'Normale',level:'normal',action_label:'Voir le traitement',action:{type:'example',id:3},example:true}
];
function exampleStorageKey(){return 'aia-priority-examples:'+me.id+':'+company.id;}
function completedExamples(){try{const value=JSON.parse(sessionStorage.getItem(exampleStorageKey())||'[]');return Array.isArray(value)?value:[];}catch(e){return [];}}
function visibleExamples(){const completed=completedExamples();return priorityExamples.filter(c=>!completed.includes(c.action.id));}
function completeExample(id){try{sessionStorage.setItem(exampleStorageKey(),JSON.stringify([...new Set([...completedExamples(),id])]))}catch(e){notify('La simulation ne peut pas être mémorisée dans ce navigateur.');}}
async function renderPriorityExample(id){
 const c=priorityExamples.find(x=>x.action.id===id);if(!c)throw Error('Exemple introuvable.');
 const steps={1:['Lire la demande du client','Préparer une réponse adaptée','Mettre à jour le suivi'],2:['Vérifier le dossier et les moyens nécessaires','Désigner un responsable','Confirmer la prochaine étape'],3:['Contrôler le travail réalisé','Vérifier les éléments manquants','Marquer les tâches comme terminées']}[id];
 $('#content').innerHTML=`<section class="form-page"><span class="badge">Exemple</span><h1>${clean(c.title)}</h1><article class="task-detail"><span class="importance ${c.level}">${clean(c.importance)}</span><p>${clean(c.description)}</p><ol class="example-steps">${steps.map(step=>`<li>${clean(step)}</li>`).join('')}</ol><p class="tiny sub">Simulation · aucune donnée métier enregistrée</p><button class="btn primary" id="finishPriorityExample">Terminer l’exemple</button></article></section>`;
 $('#finishPriorityExample').onclick=async()=>{completeExample(id);await finishForm('dashboard');};
}
