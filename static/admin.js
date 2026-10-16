'use strict';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n||0);
const timestamp=s=>s?new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}):'—';
let me=null,companies=[],company=null,leads=[],prospects=[],tab='dashboard',currentProspect=null,csrf='';
function notify(m){const e=$('#toast');e.textContent=m;e.classList.remove('hide');setTimeout(()=>e.classList.add('hide'),4500);}
async function api(path,opts={}){const method=opts.method||'GET';let headers={'Accept':'application/json',...opts.headers};if(opts.body)headers['Content-Type']='application/json';if(!['GET','HEAD'].includes(method))headers['X-CSRF-Token']=csrf;const response=await fetch(path,{credentials:'same-origin',...opts,headers});const obj=await response.json().catch(()=>({}));if(!response.ok)throw new Error(typeof obj.detail==='string'?obj.detail:(Array.isArray(obj.detail)?obj.detail.map(x=>x.msg).join(', '):'Erreur du serveur'));return obj;}
function options(items,selected){return items.map(x=>`<option value="${clean(x)}" ${selected===x?'selected':''}>${clean(x)}</option>`).join('');}
function showApp(){me&&$('#auth').classList.add('hide');$('#shell').classList.remove('hide');$('#userEmail').textContent=me.email;document.querySelectorAll('.owner-only').forEach(x=>x.classList.toggle('hide',me.role!=='owner'));}
function showAuth(){me=null;csrf='';$('#auth').classList.remove('hide');$('#shell').classList.add('hide');}
async function refreshCompanies(){companies=await api('/api/companies');const mailCompany=Number(new URLSearchParams(location.search).get('mail_company'));if(mailCompany&&companies.some(c=>c.id===mailCompany))company=companies.find(c=>c.id===mailCompany);if(!company||!companies.some(c=>c.id===company.id))company=companies[0]||null;$('#companySelect').replaceChildren(...companies.map(c=>{let option=document.createElement('option');option.value=c.id;option.textContent=c.name+' · '+c.city;option.selected=company?.id===c.id;return option;}));}
function finishForm(parent){
 if(history.state?.aiaFrom===parent&&(history.state?.aiaDepth||0)>0){history.back();return;}
 return openTab(parent,{replaceHistory:true});
}
async function openTab(next,{updateHistory=true,replaceHistory=false,taskId=null,companyId=null,recordId=null}={}){
 if(!me)return;
 const labels={dashboard:'Accueil',leads:'Devis',prospects:'Prospection',companies:'Entreprises',calendar:'Agenda','prospect-new':'Nouveau prospect','task-new':'Nouvelle échéance','company-new':'Nouvelle entreprise','company-edit':'Identité & tarifs',team:'Équipe',clients:'Clients','client-new':'Nouveau client','client-edit':'Client',activities:'Activités','activity-new':'Nouvelle activité','activity-edit':'Modifier l’activité',activity:'Activité',reports:'Rapports',drafts:'Brouillons',draft:'Brouillon','priority-example':'Exemple',incoming:'Demandes reçues','quote-new':'Nouveau devis','quote-edit':'Modifier le devis',quote:'Devis',emails:'E-mails',email:'E-mail'};
 const ownerTabs=new Set(['prospects','prospect-new','company-new','team','drafts','draft']);
 const recordRoutes=new Set(['client-edit','activity','activity-edit','draft','priority-example','quote','quote-edit','email']);
 if(!labels[next]||(ownerTabs.has(next)&&me.role!=='owner'))next='dashboard';
 if(['company-edit','team'].includes(next)){
   companyId=companyId||company?.id;
   if(!companies.some(c=>c.id===companyId))next='dashboard';
 }
 stopReading();activeRecognition?.stop();
 closeModal();
 document.querySelector('.account-menu')?.removeAttribute('open');
 const previousTab=tab;
 tab=next;
 const id=next==='calendar'?taskId:['company-edit','team'].includes(next)?companyId:recordRoutes.has(next)?recordId:null;
 const route='#/'+next+(id?'/'+id:'');
 if(updateHistory&&location.hash!==route){
   const depth=history.state?.aiaDepth||0;
   if(replaceHistory)history.replaceState({aiaDepth:depth,aiaFrom:history.state?.aiaFrom||null},'',route);
   else history.pushState({aiaDepth:depth+1,aiaFrom:previousTab},'',route);
 }
 const active=({'prospect-new':'prospects','task-new':'calendar','company-new':'companies','company-edit':'companies',team:'companies'})[next]||next;
 document.querySelectorAll('.owner-only').forEach(x=>x.classList.toggle('hide',me.role!=='owner'));
 document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('active',el.dataset.tab===active));
 $('#topLabel').textContent=next==='dashboard'?'':labels[next];
 $('#moduleBack').classList.toggle('hide',next==='dashboard');
 $('#content').innerHTML='<p class="sub" role="status">Chargement…</p>';
 try{
   if(next==='dashboard')await dashboard();
   else if(next==='leads')await renderQuotations();
   else if(next==='incoming')await renderLeads();
   else if(next==='quote-new')await renderQuotationForm();
   else if(next==='quote-edit')await renderQuotationForm(recordId);
   else if(next==='quote')await renderQuotation(recordId);
   else if(next==='emails')await renderEmails();
   else if(next==='email')await renderEmail(recordId);
   else if(next==='prospects')await renderProspects();
   else if(next==='companies')await renderCompanies();
   else if(next==='calendar')await calendarTasks(taskId);
   else if(next==='task-new')await renderTaskForm();
   else if(next==='prospect-new')renderProspectForm();
   else if(next==='company-new')renderCompanyForm();
   else if(next==='company-edit')renderCompanyForm(companyId);
   else if(next==='team')renderTeamForm(companyId);
   else if(next==='clients')await renderClients();
   else if(next==='client-new')await renderClientForm();
   else if(next==='client-edit')await renderClientForm(recordId);
   else if(next==='activities')await renderActivities();
   else if(next==='activity-new')await renderActivityForm();
   else if(next==='activity-edit')await renderActivityForm(recordId);
   else if(next==='activity')await renderActivity(recordId);
   else if(next==='reports')await renderReports();
   else if(next==='drafts')await renderDrafts();
   else if(next==='draft')await renderDrafts(recordId);
   else if(next==='priority-example')await renderPriorityExample(recordId);
   window.scrollTo(0,0);
 }catch(err){$('#content').innerHTML='<div class="msg err">'+clean(err.message)+'</div>';}
}
function readRoute(){
 const parts=location.hash.replace(/^#\/?/,'').split('/');
 const id=/^\d+$/.test(parts[1]||'')?Number(parts[1]):null;
 return {tab:parts[0]||'dashboard',taskId:parts[0]==='calendar'?id:null,companyId:['company-edit','team'].includes(parts[0])?id:null,recordId:['client-edit','activity','activity-edit','draft','priority-example','quote','quote-edit','email'].includes(parts[0])?id:null};
}
function backIcon(){return '<svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true"><path d="M15 4.5 7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
function renderFormPage(html){
  $('#content').innerHTML='<section class="form-page">'+html+'</section>';
}
function goBack(){
 if((history.state?.aiaDepth||0)>0){history.back();return;}
 const parent=({'prospect-new':'prospects','task-new':'calendar','company-new':'companies','company-edit':'companies','team':'companies',clients:'dashboard','client-new':'clients','client-edit':'clients','activity-new':'activities','activity-edit':'activities',activity:'activities',activities:'dashboard',draft:'drafts',drafts:'dashboard',reports:'dashboard','priority-example':'dashboard','quote-new':'leads','quote-edit':'leads',quote:'leads',email:'emails',emails:'dashboard',incoming:'leads'})[tab]||'dashboard';
 return openTab(parent,{replaceHistory:true});
}
async function dashboard(){
 const modules=[
  {tab:'clients',icon:'👤',name:'Clients'},
  {tab:'activities',icon:'✅',name:'Activités'},
  {tab:'leads',icon:'📄',name:'Devis'},
  {tab:'emails',icon:'✉️',name:'E-mails'},
  ...(me.role==='owner'?[{tab:'prospects',icon:'🤝',name:'Prospection'}]:[]),
  {tab:'calendar',icon:'🗓️',name:'Agenda',tone:'blue'},
  {tab:'reports',icon:'📊',name:'Rapports'},
  ...(me.role==='owner'?[{tab:'drafts',icon:'✉️',name:'Brouillons'}]:[]),
  {tab:'companies',icon:'🏢',name:'Entreprises'},
  ...(company?[{tab:'company-edit',id:company.id,icon:'🎨',name:'Identité & tarifs'}]:[]),
  ...(company&&me.role==='owner'?[{tab:'team',id:company.id,icon:'👥',name:'Équipe'}]:[])
 ];
 $('#content').innerHTML=`<header class="home-heading"><h1>Bonjour ${clean(me.name||me.display_name||(me.email.toLowerCase()==='mohamedtoure2000@gmail.com'?'Mohamed Touré':me.email.split('@')[0]))}</h1></header>
 <section id="priorityBlock" aria-label="Actions prioritaires"></section>
 <nav class="module-grid" aria-label="Fonctions de l’entreprise">${modules.map(m=>`<a class="module-tile ${m.tone||'green'}" href="#/${m.tab}${m.id?'/'+m.id:''}" data-go="${m.tab}"${m.id?` data-company-id="${m.id}"`:''}><span class="module-icon" aria-hidden="true">${m.icon}</span><span class="module-copy"><strong>${m.name}</strong></span><span class="module-chevron" aria-hidden="true">›</span></a>`).join('')}</nav>
`;
 await renderPriorities();
}
async function renderLeads(){if(!company)return;leads=await api('/api/companies/'+company.id+'/leads');$('#content').innerHTML=`<div class="heading"><div><h1>Demandes de devis</h1><p class="sub">${clean(company.name)} · ${leads.length} demande(s) dans la base centralisée</p></div><div class="row"><button class="btn" id="reloadLeads" aria-label="Actualiser" title="Actualiser">↻</button><a class="btn" href="/api/companies/${company.id}/leads-export">Exporter CSV</a></div></div>${leads.length?`<div class="tablewrap"><table><thead><tr><th>Client</th><th>Prestation</th><th>Montant estimé</th><th>Statut</th><th>Date</th><th></th></tr></thead><tbody>${leads.map(l=>`<tr><td><b>${clean(l.name)}</b><div class="tiny sub">${clean(l.phone)}</div></td><td>${clean(({'home':'Logement','office':'Bureaux','after':'Après travaux','windows':'Vitres'})[l.service]||l.service)}<div class="tiny sub">${l.area} m²</div></td><td>${money(l.amount)}</td><td><span class="badge">${clean(l.status)}</span></td><td>${timestamp(l.created)}</td><td><button class="linklike" data-lead="${l.id}">Détails →</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aucune demande.</div>'}`;$('#reloadLeads').onclick=renderLeads;}
function openModal(html){
 $('#modalLayer').innerHTML=`<div class="modal-wrap" id="modalBackdrop"><div class="modal" role="dialog" aria-modal="true"><button type="button" class="back-circle" id="closeModal" aria-label="Retour" title="Retour">${backIcon()}</button>${html}</div></div>`;
 $('#modalLayer').classList.remove('hide');
 $('#closeModal').onclick=closeModal;
 $('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal();};
}
function closeModal(){$('#modalLayer').classList.add('hide');$('#modalLayer').replaceChildren();}
function leadDetail(id){const l=leads.find(x=>x.id===id);if(!l)return;openModal(`<h2>Demande de ${clean(l.name)}</h2><form id="leadEdit" class="stack" style="margin-top:20px"><div class="field"><label>Statut</label><select name="status">${options(['Nouveau','À rappeler','Devis envoyé','Signé','Perdu'],l.status)}</select></div><div class="field"><label>Notes internes</label><textarea name="notes" maxlength="4000">${clean(l.notes)}</textarea></div><button class="btn primary">Enregistrer le suivi</button></form><details class="record-details"><summary>Coordonnées & devis</summary><div class="grid grid2"><div class="card-flat"><b>Contact</b><p class="small">${clean(l.phone)}<br>${clean(l.email)||'Pas d’email'}</p></div><div class="card-flat"><b>Devis indicatif</b><div class="stat-num">${money(l.amount)}</div><span class="tiny sub">${clean(l.service)} · ${l.area} m²</span></div></div></details>`);$('#leadEdit').onsubmit=async e=>{e.preventDefault();try{await api('/api/companies/'+company.id+'/leads/'+id,{method:'PATCH',body:JSON.stringify({status:e.target.status.value,notes:e.target.notes.value})});closeModal();notify('Demande mise à jour.');await renderLeads();}catch(err){notify(err.message)}};}
async function renderProspects(){prospects=await api('/api/prospects');const statuses=['À contacter','Contacté','Réponse reçue','Intéressé','Démo prévue','Accord de principe','Signé','Refus'];$('#content').innerHTML=`<div class="heading"><div><h1>Prospection</h1></div><div class="row"><a class="btn" href="/api/prospects-export">Exporter CSV</a><button class="btn primary" id="newProspect">+ Prospect</button></div></div>${prospects.length?`<div class="tablewrap"><table><thead><tr><th>Entreprise</th><th>Secteur / ville</th><th>Email</th><th>Étape</th><th></th></tr></thead><tbody>${prospects.map(p=>`<tr><td><b>${clean(p.name)}</b><div class="tiny sub">${clean(p.contact)}</div></td><td>${clean(p.sector)}<div class="tiny sub">${clean(p.city)}</div></td><td>${clean(p.email)||'—'}</td><td><span class="badge">${clean(p.stage)}</span></td><td><button class="linklike" data-prospect="${p.id}">Suivi →</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aucun prospect.</div>'}`;$('#newProspect').onclick=newProspect;}
function newProspect(){return openTab('prospect-new');}
function renderProspectForm(){renderFormPage(`<h1>Nouveau prospect</h1><form id="prospectForm" class="stack"><div class="fields"><div class="field"><label>Entreprise *</label><input name="name" minlength="2" required></div><div class="field"><label>Secteur *</label><select name="sector"><option>Nettoyage</option><option>Garage automobile</option><option>Artisan rénovation</option><option>Autre</option></select></div><div class="field"><label>Ville</label><input name="city"></div><div class="field"><label>Site web</label><input name="website" placeholder="https://..."></div><div class="field"><label>Email professionnel (si public)</label><input name="email" type="email"></div><div class="field"><label>Contact professionnel</label><input name="contact"></div><div class="field span2"><label>Constat vérifié / besoin éventuel</label><textarea name="diagnosis" placeholder="Ne pas inventer d'absence de site ou de manque de clients."></textarea></div></div><button class="btn primary">Enregistrer le prospect</button></form>`);$('#prospectForm').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target),data={};for(const [k,v] of f.entries())data[k]=v;try{await api('/api/prospects',{method:'POST',body:JSON.stringify(data)});closeModal();notify('Prospect créé.');await finishForm('prospects');}catch(err){notify(err.message)}};}
async function prospectDetail(id){let p=prospects.find(x=>x.id===id);if(!p)return;currentProspect=id;const hist=await api('/api/prospects/'+id+'/history');const guidance=await api('/api/prospects/'+id+'/next-action');const statuses=['À contacter','Contacté','Réponse reçue','Intéressé','Démo prévue','Accord de principe','Signé','Refus'];openModal(`<h2>${clean(p.name)}</h2><p class="small sub">${clean(p.sector)} · ${clean(p.city)} · ${clean(p.website||'Pas de site renseigné')}</p><div class="card-flat"><b>Diagnostic commercial</b><p class="small mono" style="margin:8px 0 0">${clean(p.diagnosis||'Aucun diagnostic renseigné.')}</p></div><div class="field" style="margin-top:15px"><label>Étape commerciale</label><select id="prospectStage">${options(statuses,p.stage)}</select></div><button class="btn small" id="saveStage" style="margin-top:8px">Enregistrer l'étape</button><hr class="hr"><h3>Historique des échanges</h3><div class="history">${hist.interactions.length?hist.interactions.map(x=>`<div class="history-item"><div class="tiny sub">${clean(x.direction)} · ${timestamp(x.created)}</div><div class="mono">${clean(x.body)}</div></div>`).join(''):'<p class="sub tiny">Aucun échange enregistré.</p>'}</div><form id="interactionForm" style="margin-top:15px" class="stack"><div class="field"><label>Ajouter une réponse ou note (saisie manuelle)</label><select name="direction"><option value="reçu">Réponse reçue</option><option value="envoyé">Message envoyé</option><option value="note">Note interne</option></select></div><div class="field"><textarea name="body" placeholder="Copiez ici uniquement un échange réel ; ne simulez pas un accord..." required minlength="2"></textarea></div><button class="btn small">Ajouter à l'historique</button></form><hr class="hr"><div class="card-flat" style="background:#f3f8fc;margin-bottom:16px"><b>Étape suivante suggérée</b><p class="small" style="margin:7px 0 3px">${clean(guidance.recommended_action)}</p><span class="tiny sub">Conseil de suivi · aucun envoi automatique${guidance.human_review_required?' · validation humaine requise':''}</span></div><h3>Brouillon commercial</h3><details class="privacy-note"><summary>Confidentialité</summary><p>Si une clé IA externe est configurée, le nom de l’entreprise, son diagnostic et les échanges enregistrés peuvent être transmis au fournisseur pour rédiger le brouillon. Aucun email n’est envoyé.</p></details><div class="row"><select id="draftObjective" class="control" style="max-width:215px"><option value="premier_contact">Premier contact</option><option value="relance">Relance</option><option value="objection">Réponse à une objection</option></select><button class="btn primary" id="draftButton">✧ Préparer un message</button></div><div id="generatedDraft" style="margin-top:14px"></div>${hist.drafts.length?`<p class="tiny sub">Dernier brouillon : ${clean(hist.drafts[0].provider)} · ${timestamp(hist.drafts[0].created)}</p>`:''}`);$('#saveStage').onclick=async()=>{try{p=await api('/api/prospects/'+id,{method:'PATCH',body:JSON.stringify({stage:$('#prospectStage').value})});prospects=prospects.map(x=>x.id===id?p:x);notify('Statut enregistré');}catch(err){notify(err.message)}};$('#interactionForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/prospects/'+id+'/history',{method:'POST',body:JSON.stringify(Object.fromEntries(f.entries()))});notify('Interaction enregistrée');await prospectDetail(id);}catch(err){notify(err.message)}};$('#draftButton').onclick=async()=>{let btn=$('#draftButton');btn.disabled=true;btn.textContent='Préparation en cours…';try{const d=await api('/api/prospects/'+id+'/drafts',{method:'POST',body:JSON.stringify({objective:$('#draftObjective').value})});$('#generatedDraft').innerHTML=`<div class="card-flat" style="background:#f1faf6"><div class="between"><b>Brouillon à vérifier</b><span class="tiny sub">${clean(d.provider)}</span></div><p style="margin-top:12px"><b>Objet : </b>${clean(d.subject)}</p><div class="mono">${clean(d.body)}</div><div class="row" style="margin-top:13px"><button class="btn small mute" id="copyDraft">Copier le message</button><span class="tiny sub">Non envoyé • accord humain nécessaire</span></div></div>`;$('#copyDraft').onclick=async()=>{try{await navigator.clipboard.writeText('Objet : '+d.subject+'\n\n'+d.body);notify('Message copié');}catch(e){notify('Copie indisponible dans ce navigateur')}};}catch(err){notify(err.message)}finally{btn.disabled=false;btn.textContent='✧ Préparer un message'}};}
async function renderCompanies(){const cards=companies.map(c=>`<article class="card stack"><div class="between"><div class="row"><span class="logo-icon" style="background:${clean(c.color)};color:#fff">✧</span><div><b>${clean(c.name)}</b><div class="small sub">${clean(c.city)}</div></div></div><span class="badge blue">${clean(c.slug)}</span></div><p class="sub small">${clean(c.headline)}</p><div class="row"><a class="btn small" target="_blank" rel="noopener" href="/site/${encodeURIComponent(c.slug)}">↗ Site public</a><button class="btn small" data-editcompany="${c.id}">Personnaliser</button>${me.role==='owner'?`<button class="btn small" data-adduser="${c.id}">Accès équipe</button>`:''}</div></article>`).join('');$('#content').innerHTML=`<div class="heading"><div><h1>Entreprises</h1></div>${me.role==='owner'?'<button class="btn primary" id="createCompany">+ Nouvelle entreprise</button>':''}</div><div class="grid grid2">${cards}</div>`;if(me.role==='owner')$('#createCompany').onclick=()=>companyForm();}
function companyForm(id){return openTab(id?'company-edit':'company-new',{companyId:id||null});}
function renderCompanyForm(id){
 const c=id?companies.find(x=>x.id===id):null;
 const rates=c?`<hr class="hr"><h3>Tarifs de vos prestations</h3><div class="grid grid2">${Object.entries(c.rates).map(([key,r])=>`<div class="card-flat"><b>${clean(r.label)}</b><div class="fields" style="margin-top:10px"><div class="field"><label>€/m²</label><input name="rateunit:${key}" type="number" step="0.1" min="0.1" max="100000" value="${clean(r.unit)}" required></div><div class="field"><label>Prix minimum (€)</label><input name="ratemin:${key}" type="number" step="0.1" min="0.1" max="1000000" value="${clean(r.min)}" required></div></div></div>`).join('')}</div>`:'';
 renderFormPage(`<h1>${c?'Identité & tarifs':'Nouvelle entreprise'}</h1><form id="companyForm" class="stack"><div class="fields"><div class="field"><label>Nom commercial *</label><input name="name" value="${clean(c?.name||'')}" required></div><div class="field"><label>Ville *</label><input name="city" value="${clean(c?.city||'')}" required></div><div class="field span2"><label>Accroche commerciale *</label><input name="headline" value="${clean(c?.headline||'Un espace impeccable, un esprit tranquille.')}" required></div><div class="field"><label>Couleur de marque</label><input name="color" type="color" value="${clean(c?.color||'#14866e')}"></div><div class="field"><label>Contact téléphone</label><input name="phone" value="${clean(c?.phone||'')}"></div><div class="field span2"><label>Contact email</label><input name="email" type="email" value="${clean(c?.email||'')}"></div></div>${rates}<button class="btn primary">Enregistrer</button></form>`);
 $('#companyForm').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target),data={};for(const key of ['name','city','headline','color','phone','email'])data[key]=form.get(key);try{const v=await api(c?'/api/companies/'+c.id:'/api/companies',{method:c?'PUT':'POST',body:JSON.stringify(data)});if(c){const prices={};for(const key of Object.keys(c.rates)){prices[key]={unit:Number(form.get('rateunit:'+key)),minimum:Number(form.get('ratemin:'+key))}}await api('/api/companies/'+c.id+'/rates',{method:'PUT',body:JSON.stringify({rates:prices})});}closeModal();notify('Entreprise enregistrée');await refreshCompanies();if(!c)company=companies.find(x=>x.id===v.id)||company;await finishForm('companies');}catch(err){notify(err.message)}};
}
function userForm(id){return openTab('team',{companyId:id});}
function renderTeamForm(id){const c=companies.find(x=>x.id===id);renderFormPage(`<h1>Accès équipe</h1><p class="form-context">${clean(c?.name||'')}</p><form id="userForm" class="stack"><div class="field"><label>Email du gestionnaire</label><input name="email" type="email" required></div><div class="field"><label>Mot de passe initial (12 caractères minimum)</label><input name="password" type="password" minlength="12" autocomplete="new-password" required></div><button class="btn primary">Créer le compte</button></form>`);$('#userForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/companies/'+id+'/users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries()))});notify('Compte créé');await finishForm('companies');}catch(err){notify(err.message)}};}
async function start(){try{me=await api('/api/me');csrf=me.csrf;showApp();await refreshCompanies();const route=readRoute();if(!Number.isInteger(history.state?.aiaDepth))history.replaceState({aiaDepth:0},'',location.href);await openTab(route.tab,{taskId:route.taskId,companyId:route.companyId,recordId:route.recordId,updateHistory:false});}catch(err){showAuth();try{const s=await api('/api/setup');if(!s.ready)$('#authMessage').textContent='Configuration requise : renseignez ADMIN_EMAIL et ADMIN_PASSWORD (12 caractères min.) sur le serveur, puis redémarrez.';}catch(e){$('#authMessage').textContent='Serveur non disponible.'}}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();try{const x=await api('/api/login',{method:'POST',body:JSON.stringify({email:$('#loginEmail').value,password:$('#loginPassword').value})});csrf=x.csrf;await start();$('#loginPassword').value='';}catch(err){$('#authMessage').textContent=err.message}};
$('#passwordBtn').onclick=()=>{
 openModal(`<h2>Changer mon mot de passe</h2><form id="passwordForm" class="stack"><div class="field"><label>Mot de passe actuel</label><input type="password" name="old_password" autocomplete="current-password" required></div><div class="field"><label>Nouveau mot de passe (12 caractères minimum)</label><input type="password" name="new_password" autocomplete="new-password" minlength="12" required></div><button class="btn primary">Modifier le mot de passe</button></form>`);
 $('#passwordForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/password',{method:'POST',body:JSON.stringify(Object.fromEntries(f.entries()))});closeModal();showAuth();$('#authMessage').textContent='Mot de passe modifié. Reconnectez-vous.';}catch(err){notify(err.message)}};
};
$('#logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'});}catch(e){}showAuth();};
$('#companySelect').onchange=async e=>{company=companies.find(c=>c.id===Number(e.target.value));await openTab(tab);};
$$('#sideNav').forEach(el=>el.addEventListener('click',e=>{const x=e.target.closest('[data-tab]');if(x)openTab(x.dataset.tab)}));
$('#content').addEventListener('click',e=>{let x=e.target.closest('[data-go]');if(x){e.preventDefault();return openTab(x.dataset.go,{companyId:x.dataset.companyId?Number(x.dataset.companyId):null,recordId:x.dataset.recordId?Number(x.dataset.recordId):null});}x=e.target.closest('[data-lead]');if(x)return leadDetail(Number(x.dataset.lead));x=e.target.closest('[data-prospect]');if(x)return prospectDetail(Number(x.dataset.prospect));x=e.target.closest('[data-editcompany]');if(x)return companyForm(Number(x.dataset.editcompany));x=e.target.closest('[data-adduser]');if(x)return userForm(Number(x.dataset.adduser));});
$('#moduleBack').addEventListener('click',e=>{if(e.target.closest('[data-back]'))goBack();});
window.addEventListener('popstate',()=>{if(me){const route=readRoute();openTab(route.tab,{taskId:route.taskId,companyId:route.companyId,recordId:route.recordId,updateHistory:false});}});
window.addEventListener('hashchange',()=>{const route=readRoute();if(me&&(route.tab!==tab||route.taskId||route.companyId||route.recordId))openTab(route.tab,{taskId:route.taskId,companyId:route.companyId,recordId:route.recordId,updateHistory:false});});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
start();
