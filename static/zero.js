'use strict';
const operationsEnabled=true;
const riskKinds={vehicle:'Véhicule / révision',epi:'EPI',consumable:'Consommables',insurance:'Assurance',qualification:'Habilitation',other:'Autre échéance'};
const assetStates={ready:'Disponible',worn:'À remplacer',broken:'En panne'};

function refreshHomeBadges(badges,riskCards=[],states={}){
 if(tab!=='dashboard')return;
 badges={...badges};
 document.querySelectorAll('.module-grid .module-count').forEach(b=>b.remove());
 for(const [key,count] of Object.entries(badges)){
  const tile=document.querySelector(`.module-grid [data-go="${key}"]`);if(!tile)continue;
  tile.querySelector('.module-count')?.remove();
  if(count){const badge=document.createElement('span');badge.className='module-count';badge.textContent=String(count);badge.setAttribute('aria-label',count+' élément(s) à traiter');(tile.querySelector('.module-face')||tile).append(badge);}
 }
 document.querySelectorAll('.module-grid [data-go]').forEach(tile=>{
  const key=tile.dataset.go,p=modulePresentation(key,{badges,module_states:states});
  for(const state of tileStates)tile.classList.toggle('state-'+state,state===p.state);
  tile.dataset.state=p.state;
  tile.setAttribute('aria-label',(tile.dataset.moduleLabel||tile.querySelector('strong').textContent)+' · '+p.label);
 });
}

async function zeroDashboard(){
 const cid=company.id;
 const [state,workspace]=await Promise.all([api(`/api/companies/${cid}/cockpit`),api(`/api/companies/${cid}/workspace`)]);
 $('#content').innerHTML=`<div class="reference-home"><header class="home-heading"><h1>Bonjour ${clean((me.name||me.display_name||(me.email.toLowerCase()==='mohamedtoure2000@gmail.com'?'Mohamed':me.email.split('@')[0])).split(' ')[0])}</h1><p id="homeDay" class="home-day"></p></header>${assistantDockMarkup()}<section id="homeTreasury" aria-label="Trésorerie">${homeTreasuryMarkup(state)}</section><section id="priorityBlock" aria-label="Priorités à traiter"></section><article class="home-sector"><span class="module-icon tone-blue" aria-hidden="true">${moduleIcon('reports')}</span><div><h2>Veille métier</h2><p>Veille non connectée.</p></div><button class="btn" id="homeSectorInfo">En savoir plus</button></article><div class="home-modules-heading"><h2>Vos modules</h2><a class="btn" data-go="module-library" href="#/module-library">Grille · ${workspace.columns||2}</a></div>${homeModulesMarkup(workspace,state)}</div>`;
 $('#homeTreasury').addEventListener('click',e=>{const command=e.target.closest('[data-home-cash]');if(command){e.preventDefault();openCommand('movement',command.dataset.homeCash);return;}if(e.target.closest('[data-treasury-mode]')){e.preventDefault();openTab('treasury');}});
 const greeting=$('.home-heading h1');greeting.textContent=greeting.textContent.replace(/Bonjour (\p{L})/u,(_,letter)=>'Bonjour '+letter.toLocaleUpperCase('fr'));
 $('#homeSectorInfo').textContent='Choisir mon métier';
 $('#homeSectorInfo').onclick=async()=>{
  const settings=await api(`/api/companies/${cid}/workspace`);
  openModal(`<h2>Choisir mon métier</h2><div class="field"><label for="homeSectorChoice">Mon secteur d’activité</label><select id="homeSectorChoice">${selectMap(settings.domains,settings.domain)}</select></div><p class="tiny sub">Ce choix adapte vos modules. La veille n’est pas encore connectée.</p><button class="btn primary" id="saveHomeSector">Enregistrer</button><button class="btn" id="cancelHomeSector">Annuler</button>`);
  $('#cancelHomeSector').onclick=closeModal;
  $('#saveHomeSector').onclick=async e=>{const button=e.currentTarget;button.disabled=true;try{await api(`/api/companies/${cid}/workspace`,{method:'PUT',body:JSON.stringify({domain:$('#homeSectorChoice').value,visible:settings.visible,columns:settings.columns,dynamic:settings.dynamic,version:settings.version})});closeModal();await renderPriorities();notify('Votre métier est enregistré.');}catch(error){button.disabled=false;notify(error.message);}};
 };
 const gridButton=$('.home-modules-heading [data-go="module-library"]');gridButton.setAttribute('aria-label','Choisir le nombre de colonnes');gridButton.title='Choisir le nombre de colonnes';gridButton.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
 await Promise.all([renderPriorities({cockpit:state,workspace}),mountAssistant()]);
}

function toolLinks(items){return `<div class="tool-list">${items.map(([route,title,icon,id])=>`<a class="task-row" href="#/${route}${id?'/'+id:''}" data-go="${route}"${id?` data-company-id="${id}"`:''}><span><strong>${icon} ${title}</strong></span><span aria-hidden="true">›</span></a>`).join('')}</div>`;}
function renderRequests(){
 $('#content').innerHTML='<div class="heading"><h1>Demandes</h1></div>'+toolLinks([['leads','Devis','📄'],['incoming','Demandes reçues','📥'],['emails','E-mails','✉️'],['clients','Clients','👤'],['activities','Travaux & activités','✅']]);
}
function renderTools(){
 const links=[['clients','Clients','👤'],['activities','Travaux & activités','✅'],['leads','Devis','📄'],['emails','E-mails','✉️'],['reports','Rapports','📊'],['companies','Entreprises','🏢'],['company-edit','Identité & tarifs','🎨',company.id]];
 if(operationsEnabled)links.push(['equipment','Matériel','🧰'],['risks','Prévention & échéances','🛡️'],['conformity','Contrôle du cahier des charges','📋']);
 if(me.role==='owner')links.push(['drafts','Brouillons','✉️'],['team','Équipe','👥',company.id]);
 if(me.role==='owner')links.push(['scanner','Documents & profil','📷']);
 if(me.role==='owner')links.push(['social','Publications','📣']);
 if(me.role==='owner')links.push(['ai-usage','Budget IA','💳']);
 links.push(['module-library','Plus de fonctions','＋']);
 $('#content').innerHTML='<div class="heading"><h1>Outils</h1></div>'+toolLinks(links);
}
async function renderConformity(){
 const data=await api(`/api/companies/${company.id}/conformity`),labels={implemented:'En place',partial:'Partiel',blocked:'Connexion / choix requis',missing:'À développer'};
 $('#content').innerHTML=`<div class="heading"><h1>Conformité</h1></div><p class="msg err">Cahier des charges non encore entièrement réalisé.</p><p class="sub">${data.requirements.length} exigences suivies. « En place » ne signifie pas certification ni validation juridique. Les preuves ci-dessous renvoient aux tests techniques.</p><a class="btn" href="${data.evidence_url}" target="_blank" rel="noopener">Voir les résultats des tests</a><div class="compliance-list">${data.requirements.map(r=>`<article class="card"><div class="between"><strong>${clean(r.id)}</strong><span class="badge compliance-${r.status}">${labels[r.status]}</span></div><h2>${clean(r.requirement)}</h2><p>${clean(r.detail)}</p>${r.evidence?`<small class="sub">Test référencé : ${clean(r.evidence)}</small>`:''}</article>`).join('')}</div>`;
}
async function renderTreasury(){
 const data=await api(`/api/companies/${company.id}/treasury`);
 $('#content').innerHTML=`<div class="heading"><h1>Trésorerie</h1><button class="btn primary" id="cashAdd">＋ Mouvement</button></div><p class="tiny sub">Livre interne, sans connexion bancaire.</p><div class="grid grid2">${Object.entries(data.balances_minor).map(([currency,n])=>`<article class="card"><p class="sub">Solde enregistré · ${clean(currency)}</p><strong class="stat-num">${quoteMoney(n,currency)}</strong></article>`).join('')||'<p class="empty">Aucun mouvement enregistré.</p>'}</div><div class="task-list treasury-list">${data.movements.map(m=>`<article class="task-row"><span><strong>${clean(m.label)}</strong><small>${clean(m.date)} · ${m.direction==='in'?'Entrée':'Sortie'}</small></span><span class="cash-amount">${m.direction==='in'?'+':'−'} ${quoteMoney(m.amount_minor,m.currency)}</span>${!m.checked?`<button class="btn small" data-check-cash="${m.id}">Vérifier</button>`:'<span class="badge">Vérifié</span>'}</article>`).join('')}</div>`;
 $('#cashAdd').onclick=()=>openCommand('movement');$$('[data-check-cash]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api(`/api/companies/${company.id}/treasury/${b.dataset.checkCash}/check`,{method:'POST'});await renderTreasury();}catch(e){b.disabled=false;notify(e.message);}});
}

function dateFromCommand(text,required=false){
 const iso=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/),fr=text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
 if(iso)return iso[0];if(fr)return `${fr[3]}-${fr[2].padStart(2,'0')}-${fr[1].padStart(2,'0')}`;
 const d=new Date();if(/\bdemain\b/i.test(text))d.setDate(d.getDate()+1);
 if(/\bdemain\b|aujourd/i.test(text))return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 if(required){const error=Error('Choisissez une date ci-dessus, ou indiquez « demain », « aujourd’hui » ou une date dans votre consigne.');error.code='date_required';throw error;}
 return null;
}
function interpretCommand(text,context='auto',selectedDate=''){
 text=text.trim();if(text.length<3)throw Error('Écrivez une consigne.');
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();let type=context;
 if(type==='auto')type=/\bprospect\b/.test(normalized)?'prospect':/\b(entree|sortie|depense|encaissement)\b/.test(normalized)?'movement':/\b(materiel|equipement)\b/.test(normalized)?'equipment':/\b(assurance|habilitation|epi|consommable|revision)\b/.test(normalized)?'risk':/\b(echeance|rappel|agenda)\b/.test(normalized)?'task':'activity';
 const title=text.replace(/^(?:ajoute[zr]?|crée[zr]?|cree[zr]?|enregistre[zr]?)\s+(?:(?:un|une|le|la)\s+)?(?:(?:prospect|activité|activite|échéance|echeance|rappel|matériel|materiel|équipement|equipement)\s*:?\s*)?/i,'').trim().slice(0,150);
 if(title.length<2)throw Error('Précisez le nom ou l’action à réaliser.');
 if(!operationsEnabled&&['equipment','risk'].includes(type))throw Error('Le matériel et la prévention seront disponibles après validation de la prochaine étape.');
 if(type==='prospect')return {type,title:'Créer le prospect',path:'/api/prospects',payload:{name:title,sector:'À préciser',diagnosis:text}};
 if(type==='task')return {type,title:'Créer l’échéance',path:`/api/companies/${company.id}/tasks`,payload:{title,description:text,first_due:selectedDate||dateFromCommand(text,true),monthly:/chaque mois|mensuel/i.test(text)}};
 if(type==='movement'){
  const amount=text.match(/(-?\d[\d \u00a0\u202f]*(?:[.,]\d{1,2})?)\s*(€|euros?|EUR|FCFA|XOF|USD|dollars?)/i);if(!amount)throw Error('Précisez le montant et la devise, par exemple : entrée 120 euros client Dupont.');
  amount[1]=amount[1].trim();if(amount.index>0&&/[\d.,]/.test(text[amount.index-1])||!/^\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?$/.test(amount[1]))throw Error('Vérifiez le montant positif, par exemple : 12 800,00 €.');
  const direction=/\b(entree|encaissement)\b/.test(normalized)?'in':/\b(sortie|depense)\b/.test(normalized)?'out':null;if(!direction)throw Error('Précisez entrée ou sortie.');
  const currency=/FCFA|XOF/i.test(amount[2])?'XOF':/USD|dollar/i.test(amount[2])?'USD':'EUR';
  return {type,title:'Enregistrer le mouvement',path:`/api/companies/${company.id}/treasury`,payload:{label:title,direction,amount:amount[1].replace(/[ \u00a0\u202f]/g,'').replace(',','.'),currency,date:dateFromCommand(text)||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date())}};
 }
 if(type==='equipment'){
  const quantity=text.match(/quantit[eé]\s*:?\s*(\d+)/i);let name=title.replace(/^(?:matériel|materiel|équipement|equipement)\s*:?\s*/i,'').split(/quantit[eé]|en panne|[àa] remplacer|r[eé]vision/i)[0].trim();
  return {type,title:'Enregistrer le matériel',path:`/api/companies/${company.id}/equipment`,payload:{name,quantity:quantity?Number(quantity[1]):1,condition:/en panne/.test(normalized)?'broken':/a remplacer/.test(normalized)?'worn':'ready',maintenance_due:dateFromCommand(text)}};
 }
 if(type==='risk'){
  const kind=/assurance|decennale|rc pro/.test(normalized)?'insurance':/habilitation/.test(normalized)?'qualification':/\bepi\b/.test(normalized)?'epi':/consommable/.test(normalized)?'consumable':/vehicule|revision/.test(normalized)?'vehicle':'other';
  return {type,title:'Enregistrer le rappel de prévention',path:`/api/companies/${company.id}/risks`,payload:{title,kind,due:selectedDate||dateFromCommand(text,true),responsible:'',completed:false}};
 }
 return {type:'activity',title:'Créer l’activité',path:`/api/companies/${company.id}/activities`,payload:{title,description:text,priority:/urgent/.test(normalized)?'urgent':'normal',due:dateFromCommand(text)}};
}
function commandPreviewEntries(proposal){
 if(proposal.type!=='movement')return Object.entries(proposal.payload);
 const p=proposal.payload;
 return [['direction',p.direction==='in'?'Entrée':'Sortie'],['amount',quoteMoney(Math.round(Number(p.amount)*100),p.currency)],['label',p.label],['date',p.date.split('-').reverse().join('/')]];
}
function openCommand(context='auto',cashDirection=null){
 stopReading();
 openModal(`<h1>Votre consigne</h1><p class="tiny sub">Commande structurée, sans IA externe. Vérifiez la proposition avant enregistrement.</p><div class="field"><label for="commandText">Que faut-il faire ?</label><textarea id="commandText" maxlength="3000" rows="4" placeholder="Par exemple : ajoute une échéance assurance demain"></textarea></div><div id="commandDateField" class="field command-date-field ${['task','risk'].includes(context)?'':'hide'}"><label for="commandDate">Date de l’événement ou de l’échéance</label><input id="commandDate" type="date" aria-describedby="commandDateHint commandError"><small id="commandDateHint">Choisissez une date ici, ou indiquez-la dans votre consigne.</small></div><p id="commandError" class="command-inline-error hide" role="alert" tabindex="-1"></p><div class="row"><button class="btn" id="previewCommand">Préparer</button></div><div id="commandPreview" aria-live="polite"></div>`);
 let proposal=null,operationId=crypto.randomUUID();
 const resetProposal=()=>{proposal=null;$('#commandPreview').replaceChildren();$('#commandError').classList.add('hide');$('#commandDate').removeAttribute('aria-invalid');};
 $('#commandText').oninput=resetProposal;$('#commandDate').oninput=resetProposal;
 const showCommandError=error=>{const field=$('#commandDateField');if(error.code==='date_required'){field.classList.remove('hide');$('#commandDate').setAttribute('aria-invalid','true');}const message=$('#commandError');message.textContent=error.message;message.classList.remove('hide');message.focus({preventScroll:true});message.scrollIntoView({block:'nearest'});};
 $('#previewCommand').onclick=()=>{try{$('#commandError').classList.add('hide');proposal=interpretCommand($('#commandText').value,context,$('#commandDate').value);$('#commandPreview').innerHTML=`<article class="task-detail"><h2>${clean(proposal.title)}</h2><dl class="report-lines">${commandPreviewEntries(proposal).map(([k,v])=>`<div><dt>${clean(({title:'Action',name:'Nom',description:'Consigne',sector:'Secteur à vérifier',diagnosis:'Consigne',first_due:'Date',due:'Date',monthly:'Chaque mois',priority:'Importance',direction:'Sens',amount:'Montant',currency:'Devise',date:'Date',label:'Libellé',quantity:'Quantité',condition:'État',maintenance_due:'Révision',kind:'Type',responsible:'Responsable',completed:'Terminé'})[k]||k)}</dt><dd>${clean(v===null?'—':v===true?'Oui':v===false?'Non':v)}</dd></div>`).join('')}</dl><button class="btn primary" id="confirmCommand">Confirmer l’enregistrement</button></article>`;$('#confirmCommand').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{const body={...proposal.payload};if(proposal.type==='movement')body.operation_id=operationId;await api(proposal.path,{method:'POST',body:JSON.stringify(body)});const target=({task:'calendar',prospect:'prospects',movement:'treasury',equipment:'equipment',risk:'risks',activity:'activities'})[proposal.type];closeModal();await openTab(target);notify('Enregistrement confirmé.');}catch(err){b.disabled=false;showCommandError(err);}};}catch(e){showCommandError(e);}};
 if(context==='movement'&&['in','out'].includes(cashDirection)){
  const incoming=cashDirection==='in',prefix=incoming?'Entrée':'Sortie';
  $('#modalLayer h1').textContent=incoming?'Nouvelle entrée':'Nouvelle sortie';
  $('#modalLayer h1+p').textContent='Indiquez le montant et le motif. Après confirmation, ce mouvement sera ajouté à vos chiffres réels.';
  $('#commandText').placeholder=prefix+' 120 € — '+(incoming?'règlement client':'achat de fournitures');
  $('#commandText').value=prefix+' ';
 }
 $('#commandText').focus();$('#commandText').setSelectionRange($('#commandText').value.length,$('#commandText').value.length);
}

async function renderEquipment(id=null){
 const records=await api(`/api/companies/${company.id}/equipment`);
 if(id){const a=records.find(r=>r.id===id);if(!a)throw Error('Matériel introuvable');renderFormPage(`<h1>Matériel</h1><form id="assetForm" class="stack"><div class="field"><label>Nom<input name="name" value="${clean(a.name)}" required></label></div><div class="field"><label>Quantité<input name="quantity" type="number" min="0" value="${a.quantity}" required></label></div><div class="field"><label>État<select name="condition">${selectMap(assetStates,a.condition)}</select></label></div><div class="field"><label>Prochaine révision<input name="maintenance_due" type="date" value="${clean(a.maintenance_due)}"></label></div><button class="btn primary">Enregistrer</button></form>`);$('#assetForm').onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target));body.quantity=Number(body.quantity);body.maintenance_due=body.maintenance_due||null;try{await api(`/api/companies/${company.id}/equipment/${id}`,{method:'PUT',body:JSON.stringify(body)});await finishForm('equipment');}catch(err){notify(err.message);}};return;}
 $('#content').innerHTML=`<div class="heading"><h1>Matériel</h1><button class="btn primary" id="addAsset">＋ Matériel</button></div><div class="task-list">${records.map(a=>`<button class="task-row" data-asset="${a.id}"><span><strong>${clean(a.name)} · ${a.quantity}</strong><small>${assetStates[a.condition]}${a.maintenance_due?' · Révision '+clean(a.maintenance_due):''}</small></span><span>›</span></button>`).join('')||'<p class="empty">Aucun matériel.</p>'}</div>`;$('#addAsset').onclick=()=>openCommand('equipment');$$('[data-asset]').forEach(b=>b.onclick=()=>openTab('equipment',{recordId:Number(b.dataset.asset)}));
}
async function renderRisks(id=null){
 const records=await api(`/api/companies/${company.id}/risks`);
 if(id){const r=records.find(x=>x.id===id);if(!r)throw Error('Échéance introuvable');renderFormPage(`<h1>Contrôler l’échéance</h1><form id="riskForm" class="stack"><div class="field"><label>Action<input name="title" value="${clean(r.title)}" required></label></div><div class="field"><label>Type<select name="kind">${selectMap(riskKinds,r.kind)}</select></label></div><div class="field"><label>Date<input name="due" type="date" value="${clean(r.due)}" required></label></div><div class="field"><label>Responsable<input name="responsible" value="${clean(r.responsible)}"></label></div><label class="archive-filter"><input name="completed" type="checkbox" ${r.completed?'checked':''}> Contrôle effectué / renouvellement vérifié</label><button class="btn primary">Valider</button></form>`);$('#riskForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),body=Object.fromEntries(f);body.completed=f.has('completed');try{await api(`/api/companies/${company.id}/risks/${id}`,{method:'PUT',body:JSON.stringify(body)});await finishForm('risks');}catch(err){notify(err.message);}};return;}
 $('#content').innerHTML=`<div class="heading"><h1>Prévention</h1><button class="btn primary" id="addRisk">＋ Échéance</button></div><div class="task-list">${records.map(r=>`<button class="task-row" data-risk="${r.id}"><span><strong>${clean(r.title)}</strong><small>${riskKinds[r.kind]} · ${clean(r.due)}${r.responsible?' · '+clean(r.responsible):''}</small></span><span class="badge">${r.completed?'Vérifié':'À suivre'}</span></button>`).join('')||'<p class="empty">Aucune échéance de prévention.</p>'}</div>`;$('#addRisk').onclick=()=>openCommand('risk');$$('[data-risk]').forEach(b=>b.onclick=()=>openTab('risks',{recordId:Number(b.dataset.risk)}));
}
async function renderMaterial(id){
 const [work,check]=await Promise.all([api(`/api/companies/${company.id}/activities/${id}`),api(`/api/companies/${company.id}/activities/${id}/material`)]);
 $('#content').innerHTML=`<section class="form-page"><h1>${clean(work.title)}</h1><h2>Contrôle du matériel</h2>${!check.requirements_configured?'<p class="msg">Besoins à définir avant de conclure sur la disponibilité du matériel.</p>':check.alerts.length?`<div class="msg err">${check.alerts.map(a=>`<p>${clean(a.name)} : ${a.missing} manquant(s), ${a.available} disponible(s) sur ${a.required}.</p>`).join('')}</div>`:'<p class="msg">Matériel disponible selon l’inventaire enregistré.</p>'}<form id="materialForm" class="stack"><div class="field"><label for="materialNeeds">Besoins : un article par ligne, nom : quantité</label><textarea id="materialNeeds" rows="5" maxlength="5000">${check.items.map(x=>clean(x.name)+': '+x.quantity).join('\n')}</textarea></div><button class="btn primary">Vérifier et enregistrer</button></form><a class="btn" data-go="equipment" href="#/equipment">Ouvrir l’inventaire</a></section>`;
 $('#materialForm').onsubmit=async e=>{e.preventDefault();try{const items=$('#materialNeeds').value.split('\n').filter(x=>x.trim()).map(line=>{const m=line.match(/^(.+?)\s*:\s*(\d+)\s*$/);if(!m)throw Error('Utilisez le format « Perceuse : 2 ».');return {name:m[1].trim(),quantity:Number(m[2])};});await api(`/api/companies/${company.id}/activities/${id}/material`,{method:'PUT',body:JSON.stringify({items})});await renderMaterial(id);}catch(err){notify(err.message);}};
}


// Display-only scenario: never inserted into the company's cashbook.
const homeTreasuryDemo={currency:'EUR',inflows:2920000,outflows:435000,balance:2485000};
function homeTreasuryDemoKey(){return 'aia-treasury-demo-'+me.id+'-'+company.id;}
function showHomeTreasuryDemo(){try{return localStorage.getItem(homeTreasuryDemoKey())!=='real';}catch{return true;}}
function homeTreasuryMarkup(state){
 const demo=showHomeTreasuryDemo(),scenario=homeTreasuryDemo;
 const balances=demo?[[scenario.currency,scenario.balance]]:Object.entries(state.widgets?.treasury?.balances_minor||{});
 const amounts=balances.length?balances.map(([currency,amount])=>`<strong>${clean(quoteMoney(amount,currency))}</strong>`).join(''):`<strong>${clean(quoteMoney(0))}</strong>`;
 const formatFlow=kind=>{const totals=demo?{[scenario.currency]:scenario[kind]}:state.widgets?.treasury?.[kind+'_minor']||{};return Object.entries(totals).map(([currency,amount])=>clean(quoteMoney(amount,currency))).join('<br>')||clean(quoteMoney(0));};
 return `<article class="home-treasury"><div class="home-treasury-top"><span class="module-icon tone-gold" aria-hidden="true">${moduleIcon('treasury')}</span><div><h2>Trésorerie</h2>${demo?'<span class="home-demo-badge">Démonstration · chiffres fictifs</span>':''}</div></div><div class="home-cash-balance"><span>Solde</span><div class="home-balances">${amounts}</div></div><div class="home-cash-details"><button type="button" class="home-flow" data-home-cash="in" aria-label="Enregistrer une entrée d’argent"><span class="home-flow-heading">Entrées <span class="home-flow-plus" aria-hidden="true">+</span></span><b>${formatFlow('inflows')}</b></button><button type="button" class="home-flow" data-home-cash="out" aria-label="Enregistrer une sortie d’argent"><span class="home-flow-heading">Sorties <span class="home-flow-plus" aria-hidden="true">+</span></span><b>${formatFlow('outflows')}</b></button></div></article><button type="button" class="btn home-cash-mode" data-treasury-mode>Voir mes chiffres réels</button>`;
}
function refreshHomeSummary(state,cards){
 const host=document.querySelector('#homeTreasury');if(host){host.treasuryState=state;host.innerHTML=homeTreasuryMarkup(state);}
 const day=document.querySelector('#homeDay');if(day){const date=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Paris'}).format(new Date());const count=cards.filter(c=>!c.fallback).length;day.textContent=date.charAt(0).toUpperCase()+date.slice(1)+' · '+(count?count+' action'+(count>1?'s':'')+' à traiter':'Vos priorités sont à jour');}
}
