'use strict';
const operationsEnabled=true;
const riskKinds={vehicle:'Véhicule / révision',epi:'EPI',consumable:'Consommables',insurance:'Assurance',qualification:'Habilitation',other:'Autre échéance'};
const assetStates={ready:'Disponible',worn:'À remplacer',broken:'En panne'};

function refreshHomeBadges(badges,riskCards=[]){
 if(tab!=='dashboard')return;
 badges={...badges,equipment:riskCards.filter(c=>c.action.type==='equipment'||c.action.type==='material').length,risks:riskCards.filter(c=>c.action.type==='risk').length};
 for(const [key,count] of Object.entries(badges)){
  const tile=document.querySelector(`.module-grid [data-go="${key}"]`);if(!tile)continue;
  tile.querySelector('.module-count')?.remove();
  if(count){const badge=document.createElement('span');badge.className='module-count';badge.textContent=String(count);badge.setAttribute('aria-label',count+' élément(s) à traiter');tile.append(badge);}
 }
}

async function zeroDashboard(){
 const cid=company.id;
 const [state,workspace]=await Promise.all([api(`/api/companies/${cid}/cockpit`),api(`/api/companies/${cid}/workspace`)]);
 $('#content').innerHTML=`<header class="home-heading"><h1>Bonjour ${clean(me.name||me.display_name||(me.email.toLowerCase()==='mohamedtoure2000@gmail.com'?'Mohamed Touré':me.email.split('@')[0]))}</h1></header><section id="priorityBlock" aria-label="Priorités à traiter"></section>`+homeModulesMarkup(workspace,state);
 await renderPriorities();
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
 links.push(['module-library','Plus de fonctions','＋']);
 $('#content').innerHTML='<div class="heading"><h1>Outils</h1></div>'+toolLinks(links);
}
async function renderConformity(){
 const data=await api(`/api/companies/${company.id}/conformity`),labels={implemented:'En place',partial:'Partiel',blocked:'Connexion / choix requis',missing:'À développer'};
 $('#content').innerHTML=`<div class="heading"><h1>Conformité</h1></div><p class="msg err">Cahier des charges non encore entièrement réalisé.</p><p class="sub">${data.requirements.length} exigences suivies. « En place » ne signifie pas certification ni validation juridique. Les preuves ci-dessous renvoient aux tests techniques.</p><a class="btn" href="${data.evidence_url}" target="_blank" rel="noopener">Voir les résultats des tests</a><div class="compliance-list">${data.requirements.map(r=>`<article class="card"><div class="between"><strong>${clean(r.id)}</strong><span class="badge compliance-${r.status}">${labels[r.status]}</span></div><h2>${clean(r.requirement)}</h2><p>${clean(r.detail)}</p>${r.evidence?`<small class="sub">Test référencé : ${clean(r.evidence)}</small>`:''}</article>`).join('')}</div>`;
}
async function renderTreasury(){
 const data=await api(`/api/companies/${company.id}/treasury`);
 $('#content').innerHTML=`<div class="heading"><h1>Trésorerie</h1><button class="btn primary" id="cashVoice">${micIcon} Mouvement</button></div><p class="tiny sub">Livre interne, sans connexion bancaire.</p><div class="grid grid2">${Object.entries(data.balances_minor).map(([currency,n])=>`<article class="card"><p class="sub">Solde enregistré · ${clean(currency)}</p><strong class="stat-num">${quoteMoney(n,currency)}</strong></article>`).join('')||'<p class="empty">Aucun mouvement enregistré.</p>'}</div><div class="task-list treasury-list">${data.movements.map(m=>`<article class="task-row"><span><strong>${clean(m.label)}</strong><small>${clean(m.date)} · ${m.direction==='in'?'Entrée':'Sortie'}</small></span><span class="cash-amount">${m.direction==='in'?'+':'−'} ${quoteMoney(m.amount_minor,m.currency)}</span>${!m.checked?`<button class="btn small" data-check-cash="${m.id}">Vérifier</button>`:'<span class="badge">Vérifié</span>'}</article>`).join('')}</div>`;
 $('#cashVoice').onclick=()=>openVoiceCommand('movement');$$('[data-check-cash]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api(`/api/companies/${company.id}/treasury/${b.dataset.checkCash}/check`,{method:'POST'});await renderTreasury();}catch(e){b.disabled=false;notify(e.message);}});
}

function dateFromCommand(text,required=false){
 const iso=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/),fr=text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
 if(iso)return iso[0];if(fr)return `${fr[3]}-${fr[2].padStart(2,'0')}-${fr[1].padStart(2,'0')}`;
 const d=new Date();if(/\bdemain\b/i.test(text))d.setDate(d.getDate()+1);
 if(/\bdemain\b|aujourd/i.test(text))return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 if(required)throw Error('Indiquez une date : demain, aujourd’hui ou 24/10/2026.');
 return null;
}
function interpretCommand(text,context='auto'){
 text=text.trim();if(text.length<3)throw Error('Dites ou écrivez une consigne.');
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();let type=context;
 if(type==='auto')type=/\bprospect\b/.test(normalized)?'prospect':/\b(entree|sortie|depense|encaissement)\b/.test(normalized)?'movement':/\b(materiel|equipement)\b/.test(normalized)?'equipment':/\b(assurance|habilitation|epi|consommable|revision)\b/.test(normalized)?'risk':/\b(echeance|rappel|agenda)\b/.test(normalized)?'task':'activity';
 const title=text.replace(/^(?:ajoute[zr]?|crée[zr]?|cree[zr]?|enregistre[zr]?)\s+(?:(?:un|une|le|la)\s+)?(?:(?:prospect|activité|activite|échéance|echeance|rappel|matériel|materiel|équipement|equipement)\s*:?\s*)?/i,'').trim().slice(0,150);
 if(title.length<2)throw Error('Précisez le nom ou l’action à réaliser.');
 if(!operationsEnabled&&['equipment','risk'].includes(type))throw Error('Le matériel et la prévention seront disponibles après validation de la prochaine étape.');
 if(type==='prospect')return {type,title:'Créer le prospect',path:'/api/prospects',payload:{name:title,sector:'À préciser',diagnosis:text}};
 if(type==='task')return {type,title:'Créer l’échéance',path:`/api/companies/${company.id}/tasks`,payload:{title,description:text,first_due:dateFromCommand(text,true),monthly:/chaque mois|mensuel/i.test(text)}};
 if(type==='movement'){
  const amount=text.match(/(\d+(?:[.,]\d{1,2})?)\s*(€|euros?|EUR|FCFA|XOF|USD|dollars?)/i);if(!amount)throw Error('Précisez le montant et la devise, par exemple : entrée 120 euros client Dupont.');
  const direction=/\b(entree|encaissement)\b/.test(normalized)?'in':/\b(sortie|depense)\b/.test(normalized)?'out':null;if(!direction)throw Error('Précisez entrée ou sortie.');
  const currency=/FCFA|XOF/i.test(amount[2])?'XOF':/USD|dollar/i.test(amount[2])?'USD':'EUR';
  return {type,title:'Enregistrer le mouvement',path:`/api/companies/${company.id}/treasury`,payload:{label:title,direction,amount:amount[1].replace(',','.'),currency,date:dateFromCommand(text)||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date())}};
 }
 if(type==='equipment'){
  const quantity=text.match(/quantit[eé]\s*:?\s*(\d+)/i);let name=title.replace(/^(?:matériel|materiel|équipement|equipement)\s*:?\s*/i,'').split(/quantit[eé]|en panne|[àa] remplacer|r[eé]vision/i)[0].trim();
  return {type,title:'Enregistrer le matériel',path:`/api/companies/${company.id}/equipment`,payload:{name,quantity:quantity?Number(quantity[1]):1,condition:/en panne/.test(normalized)?'broken':/a remplacer/.test(normalized)?'worn':'ready',maintenance_due:dateFromCommand(text)}};
 }
 if(type==='risk'){
  const kind=/assurance|decennale|rc pro/.test(normalized)?'insurance':/habilitation/.test(normalized)?'qualification':/\bepi\b/.test(normalized)?'epi':/consommable/.test(normalized)?'consumable':/vehicule|revision/.test(normalized)?'vehicle':'other';
  return {type,title:'Enregistrer le rappel de prévention',path:`/api/companies/${company.id}/risks`,payload:{title,kind,due:dateFromCommand(text,true),responsible:'',completed:false}};
 }
 return {type:'activity',title:'Créer l’activité',path:`/api/companies/${company.id}/activities`,payload:{title,description:text,priority:/urgent/.test(normalized)?'urgent':'normal',due:dateFromCommand(text)}};
}
function openVoiceCommand(context='auto',listen=false){
 stopReading();
 openModal(`<h1>Votre consigne</h1><p class="tiny sub">Commande structurée, sans IA externe. Vérifiez la proposition avant enregistrement.</p><div class="field"><label for="voiceCommand">Que faut-il faire ?</label><textarea id="voiceCommand" maxlength="3000" rows="4" placeholder="Par exemple : ajoute une échéance assurance demain"></textarea></div><div class="row"><button class="btn primary" id="startCommandMic">${micIcon} Dicter</button><button class="btn" id="previewCommand">Préparer</button></div><div id="commandPreview" aria-live="polite"></div>`);
 let proposal=null,operationId=crypto.randomUUID();
 $('#startCommandMic').onclick=e=>dictate($('#voiceCommand'),e.currentTarget);
 $('#voiceCommand').oninput=()=>{proposal=null;$('#commandPreview').replaceChildren();};
 $('#previewCommand').onclick=()=>{try{proposal=interpretCommand($('#voiceCommand').value,context);$('#commandPreview').innerHTML=`<article class="task-detail"><h2>${clean(proposal.title)}</h2><dl class="report-lines">${Object.entries(proposal.payload).map(([k,v])=>`<div><dt>${clean(({title:'Action',name:'Nom',description:'Consigne',sector:'Secteur à vérifier',diagnosis:'Consigne',first_due:'Date',due:'Date',monthly:'Chaque mois',priority:'Importance',direction:'Sens',amount:'Montant',currency:'Devise',date:'Date',label:'Libellé',quantity:'Quantité',condition:'État',maintenance_due:'Révision',kind:'Type',responsible:'Responsable',completed:'Terminé'})[k]||k)}</dt><dd>${clean(v===null?'—':v===true?'Oui':v===false?'Non':v)}</dd></div>`).join('')}</dl><button class="btn primary" id="confirmVoiceCommand">Confirmer l’enregistrement</button></article>`;$('#confirmVoiceCommand').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{const body={...proposal.payload};if(proposal.type==='movement')body.operation_id=operationId;await api(proposal.path,{method:'POST',body:JSON.stringify(body)});const target=({task:'calendar',prospect:'prospects',movement:'treasury',equipment:'equipment',risk:'risks',activity:'activities'})[proposal.type];closeModal();await openTab(target);notify('Enregistrement confirmé.');}catch(err){b.disabled=false;notify(err.message);}};}catch(e){notify(e.message);}};
 $('#voiceCommand').focus();
 if(listen)dictate($('#voiceCommand'),$('#startCommandMic'));
}

async function renderEquipment(id=null){
 const records=await api(`/api/companies/${company.id}/equipment`);
 if(id){const a=records.find(r=>r.id===id);if(!a)throw Error('Matériel introuvable');renderFormPage(`<h1>Matériel</h1><form id="assetForm" class="stack"><div class="field"><label>Nom<input name="name" value="${clean(a.name)}" required></label></div><div class="field"><label>Quantité<input name="quantity" type="number" min="0" value="${a.quantity}" required></label></div><div class="field"><label>État<select name="condition">${selectMap(assetStates,a.condition)}</select></label></div><div class="field"><label>Prochaine révision<input name="maintenance_due" type="date" value="${clean(a.maintenance_due)}"></label></div><button class="btn primary">Enregistrer</button></form>`);$('#assetForm').onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target));body.quantity=Number(body.quantity);body.maintenance_due=body.maintenance_due||null;try{await api(`/api/companies/${company.id}/equipment/${id}`,{method:'PUT',body:JSON.stringify(body)});await finishForm('equipment');}catch(err){notify(err.message);}};return;}
 $('#content').innerHTML=`<div class="heading"><h1>Matériel</h1><button class="btn primary" id="addAssetVoice">${micIcon} Matériel</button></div><div class="task-list">${records.map(a=>`<button class="task-row" data-asset="${a.id}"><span><strong>${clean(a.name)} · ${a.quantity}</strong><small>${assetStates[a.condition]}${a.maintenance_due?' · Révision '+clean(a.maintenance_due):''}</small></span><span>›</span></button>`).join('')||'<p class="empty">Aucun matériel.</p>'}</div>`;$('#addAssetVoice').onclick=()=>openVoiceCommand('equipment');$$('[data-asset]').forEach(b=>b.onclick=()=>openTab('equipment',{recordId:Number(b.dataset.asset)}));
}
async function renderRisks(id=null){
 const records=await api(`/api/companies/${company.id}/risks`);
 if(id){const r=records.find(x=>x.id===id);if(!r)throw Error('Échéance introuvable');renderFormPage(`<h1>Contrôler l’échéance</h1><form id="riskForm" class="stack"><div class="field"><label>Action<input name="title" value="${clean(r.title)}" required></label></div><div class="field"><label>Type<select name="kind">${selectMap(riskKinds,r.kind)}</select></label></div><div class="field"><label>Date<input name="due" type="date" value="${clean(r.due)}" required></label></div><div class="field"><label>Responsable<input name="responsible" value="${clean(r.responsible)}"></label></div><label class="archive-filter"><input name="completed" type="checkbox" ${r.completed?'checked':''}> Contrôle effectué / renouvellement vérifié</label><button class="btn primary">Valider</button></form>`);$('#riskForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),body=Object.fromEntries(f);body.completed=f.has('completed');try{await api(`/api/companies/${company.id}/risks/${id}`,{method:'PUT',body:JSON.stringify(body)});await finishForm('risks');}catch(err){notify(err.message);}};return;}
 $('#content').innerHTML=`<div class="heading"><h1>Prévention</h1><button class="btn primary" id="addRiskVoice">${micIcon} Échéance</button></div><div class="task-list">${records.map(r=>`<button class="task-row" data-risk="${r.id}"><span><strong>${clean(r.title)}</strong><small>${riskKinds[r.kind]} · ${clean(r.due)}${r.responsible?' · '+clean(r.responsible):''}</small></span><span class="badge">${r.completed?'Vérifié':'À suivre'}</span></button>`).join('')||'<p class="empty">Aucune échéance de prévention.</p>'}</div>`;$('#addRiskVoice').onclick=()=>openVoiceCommand('risk');$$('[data-risk]').forEach(b=>b.onclick=()=>openTab('risks',{recordId:Number(b.dataset.risk)}));
}
async function renderMaterial(id){
 const [work,check]=await Promise.all([api(`/api/companies/${company.id}/activities/${id}`),api(`/api/companies/${company.id}/activities/${id}/material`)]);
 $('#content').innerHTML=`<section class="form-page"><h1>${clean(work.title)}</h1><h2>Contrôle du matériel</h2>${!check.requirements_configured?'<p class="msg">Besoins à définir avant de conclure sur la disponibilité du matériel.</p>':check.alerts.length?`<div class="msg err">${check.alerts.map(a=>`<p>${clean(a.name)} : ${a.missing} manquant(s), ${a.available} disponible(s) sur ${a.required}.</p>`).join('')}</div>`:'<p class="msg">Matériel disponible selon l’inventaire enregistré.</p>'}<form id="materialForm" class="stack"><div class="field"><label for="materialNeeds">Besoins : un article par ligne, nom : quantité</label><textarea id="materialNeeds" rows="5" maxlength="5000">${check.items.map(x=>clean(x.name)+': '+x.quantity).join('\n')}</textarea></div><button class="btn primary">Vérifier et enregistrer</button></form><a class="btn" data-go="equipment" href="#/equipment">Ouvrir l’inventaire</a></section>`;
 $('#materialForm').onsubmit=async e=>{e.preventDefault();try{const items=$('#materialNeeds').value.split('\n').filter(x=>x.trim()).map(line=>{const m=line.match(/^(.+?)\s*:\s*(\d+)\s*$/);if(!m)throw Error('Utilisez le format « Perceuse : 2 ».');return {name:m[1].trim(),quantity:Number(m[2])};});await api(`/api/companies/${company.id}/activities/${id}/material`,{method:'PUT',body:JSON.stringify({items})});await renderMaterial(id);}catch(err){notify(err.message);}};
}
