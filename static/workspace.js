'use strict';
const profileLabels={legal_name:'Raison sociale',siret:'SIRET',rcs_number:'Immatriculation RCS',legal_form:'Forme juridique',capital:'Capital social',trade_name:'Nom commercial',activity:'Activité',representative:'Représentant légal',address:'Adresse du siège',iban:'IBAN',account_holder:'Titulaire du compte',bic:'BIC / SWIFT',last_name:'Nom',first_name:'Prénom(s)',birth_date:'Date de naissance',birth_place:'Lieu de naissance',nationality:'Nationalité',document_number:'Numéro du document',expiry_date:'Date de fin de validité',personal_address:'Adresse personnelle',insurer:'Assureur',policy_number:'Numéro de contrat',sex:'Sexe',issue_date:'Date de délivrance',issuing_authority:'Autorité de délivrance',issuing_country:'Pays émetteur (code)',document_holder:'Nom complet du titulaire',email:'Email',phone:'Téléphone'};
const documentKinds={kbis:'Extrait Kbis',registration:'Immatriculation / avis SIRENE',identity:'Carte d’identité',passport:'Passeport',residence:'Titre de séjour',address:'Justificatif de domicile / facture',rib:'RIB / coordonnées bancaires',insurance:'Attestation d’assurance',quote:'Ancien devis / tarifs',other:'Autre document'};
const documentFields={kbis:['legal_name','rcs_number','siret','legal_form','capital','address','trade_name','activity','representative'],registration:['legal_name','siret','rcs_number','address','activity'],identity:['last_name','first_name','birth_date','birth_place','nationality','document_number','issue_date','expiry_date','sex','issuing_country','issuing_authority','personal_address'],passport:['last_name','first_name','birth_date','birth_place','nationality','document_number','issue_date','expiry_date','sex','issuing_country','issuing_authority'],residence:['last_name','first_name','birth_date','nationality','document_number','issue_date','expiry_date','sex','issuing_country','issuing_authority','personal_address'],address:['document_holder','personal_address'],rib:['account_holder','iban','bic'],insurance:['insurer','document_holder','policy_number','issue_date','expiry_date'],quote:['legal_name','siret','address'],other:Object.keys(profileLabels)};

const moduleTones={requests:'blue',clients:'green',activities:'gold',leads:'blue',emails:'blue',prospects:'gold',calendar:'purple',reports:'green',drafts:'purple',companies:'blue','company-edit':'gold',team:'purple',treasury:'gold',equipment:'blue',risks:'purple',scanner:'green'};
function moduleTone(key){return moduleTones[key]||'green';}
const tileStates=new Set(['neutral','info','success','warning','danger']);
function tileState(state,label){return {state:tileStates.has(state)?state:'neutral',label:label||'Normal'};}
function modulePresentation(key,state){const p=state.module_states?.[key];return p?tileState(p.state,p.label):tileState((state.badges?.[key]||0)>0?'warning':'neutral',(state.badges?.[key]||0)>0?'À traiter':'Normal');}
function homeModulesMarkup(workspace,state){
 const byKey=Object.fromEntries(workspace.modules.map(m=>[m.key,m]));
 const counts={...state.badges,equipment:state.risk_cards.filter(c=>['equipment','material'].includes(c.action.type)).length,risks:state.risk_cards.filter(c=>c.action.type==='risk').length};
 return `<nav class="module-grid" aria-label="Fonctions de l’entreprise">${workspace.visible.map(key=>byKey[key]).filter(Boolean).map(m=>{
  const id=['company-edit','team'].includes(m.key)?company.id:null,n=counts[m.key]||0,p=modulePresentation(m.key,state);
  return `<article class="module-card" data-module="${m.key}"><a class="module-tile tone-${moduleTone(m.key)} state-${p.state}" data-state="${p.state}" data-go="${m.key}" aria-label="${clean(m.label)} · ${clean(p.label)}" href="#/${m.key}${id?'/'+id:''}"${id?` data-company-id="${id}"`:''}><span class="module-icon" aria-hidden="true">${m.icon}</span><span class="module-copy"><strong>${clean(m.label)}</strong></span>${n?`<span class="module-count" aria-label="${n} élément(s) à traiter">${n}</span>`:''}<span class="module-chevron" aria-hidden="true">›</span></a><div class="module-inline" aria-label="État et action de ${clean(m.label)}"><p class="module-insight">${n?n+' élément(s) à traiter':clean(p.label)}</p><div class="module-inline-action"></div></div></article>`;
 }).join('')}</nav><a class="btn more-functions" data-go="module-library" href="#/module-library">＋ Plus de fonctions</a>`;
}

async function renderModuleLibrary(){
 const cid=company.id,state=await api(`/api/companies/${cid}/workspace`);let selected=new Set(state.visible),domain=state.domain;
 $('#content').innerHTML=`<section class="form-page"><h1>Mes fonctions</h1><p class="tiny sub">Afficher ou masquer un bouton conserve ses données.</p><div class="field"><label for="activityDomain">Mon domaine d’activité</label><select id="activityDomain">${selectMap(state.domains,domain)}</select></div><div class="list-filters"><input id="moduleSearch" class="control" type="search" aria-label="Rechercher une fonction" placeholder="Rechercher une fonction"><select id="moduleScope" class="control" aria-label="Fonctions proposées"><option value="all">Tous les domaines</option><option value="suggested">Adaptées à mon activité</option></select></div><div class="row library-controls"><button class="btn" id="suggestModules">Proposer selon mon activité</button><button class="btn" id="selectAllModules">Tout afficher</button><button class="btn" id="clearModules">Tout masquer</button></div><div id="moduleLibrary" class="module-library"></div><button class="btn primary library-save" id="saveModules">Enregistrer mon accueil</button></section>`;
 function recommended(m){return domain==='general'||!m.domains.length||m.domains.includes(domain);}
 function draw(){
  const query=$('#moduleSearch').value.toLocaleLowerCase('fr'),only=$('#moduleScope').value==='suggested';
  const modules=state.modules.filter(m=>(!only||recommended(m))&&m.label.toLocaleLowerCase('fr').includes(query));
  $('#moduleLibrary').innerHTML=modules.map(m=>`<article class="library-card"><label><input type="checkbox" data-module-key="${m.key}" ${selected.has(m.key)?'checked':''}><span>${m.icon} <strong>${clean(m.label)}</strong>${recommended(m)?'<small>Adapté à mon activité</small>':''}</span></label><a class="btn small" data-go="${m.key}" href="#/${m.key}${['company-edit','team'].includes(m.key)?'/'+cid:''}"${['company-edit','team'].includes(m.key)?` data-company-id="${cid}"`:''}>Ouvrir</a></article>`).join('')||'<p class="empty">Aucune fonction trouvée.</p>';
  $$('[data-module-key]').forEach(box=>box.onchange=()=>box.checked?selected.add(box.dataset.moduleKey):selected.delete(box.dataset.moduleKey));
 }
 $('#activityDomain').onchange=e=>{domain=e.target.value;draw();};$('#moduleScope').onchange=draw;$('#moduleSearch').oninput=draw;
 $('#suggestModules').onclick=()=>{selected=new Set(state.modules.filter(recommended).map(m=>m.key));draw();};
 $('#selectAllModules').onclick=()=>{selected=new Set(state.modules.map(m=>m.key));draw();};$('#clearModules').onclick=()=>{selected.clear();draw();};
 $('#saveModules').onclick=async e=>{e.currentTarget.disabled=true;try{await api(`/api/companies/${cid}/workspace`,{method:'PUT',body:JSON.stringify({domain,visible:state.modules.filter(m=>selected.has(m.key)).map(m=>m.key),version:state.version})});await finishForm('dashboard');notify('Votre accueil est enregistré.');}catch(err){if($('#saveModules'))$('#saveModules').disabled=false;notify(err.message);}};draw();
}

function profileFields(fields,prefix='profile',keys=Object.keys(profileLabels)){
 return keys.map(key=>`<div class="field"><label for="${prefix}-${key}">${profileLabels[key]}</label><input id="${prefix}-${key}" data-profile-field="${key}" maxlength="600" ${key==='email'?'type="email"':'type="text"'} value="${clean(fields[key]||'')}"></div>`).join('');
}

async function renderScanner(){
 const cid=company.id;const [profile,documents]=await Promise.all([api(`/api/companies/${cid}/profile`),api(`/api/companies/${cid}/documents`)]);
 $('#content').innerHTML=`<section class="form-page"><h1>Documents & profil</h1><form id="scanForm" class="stack card"><div class="field"><label for="scanKind">Type de document</label><select id="scanKind">${selectMap(documentKinds,'kbis')}</select></div><div class="row"><label class="btn" for="cameraFile">📷 Prendre une photo</label><label class="btn" for="scanFile">Choisir un fichier</label></div><input id="cameraFile" class="file-input" type="file" accept="image/jpeg,image/png" capture="environment" aria-label="Prendre une photo du document"><input id="scanFile" class="file-input" type="file" accept="image/jpeg,image/png,application/pdf" aria-label="Choisir un document"><p id="scanFilename" class="tiny sub">JPEG, PNG ou PDF · 8 Mo et 3 pages maximum.</p><button class="btn primary" id="readDocument" type="submit" disabled>Lire le document</button><p id="scanStatus" class="tiny sub" role="status" aria-live="polite"></p></form><details class="profile-details"><summary>Informations vérifiées</summary><form id="profileForm" class="stack" data-no-dictation><div class="fields">${profileFields(profile.fields,'profile',[...new Set(['legal_name','siret','address','email','phone','iban',...Object.keys(profile.fields)])])}</div><button class="btn primary" type="submit">Enregistrer les informations vérifiées</button></form></details><h2 class="archive-title">Historique des documents</h2><div class="task-list">${documents.map(d=>`<a class="task-row" data-go="document" data-record-id="${d.id}" href="#/document/${d.id}"><span><strong>${clean(d.filename)}</strong><small>${documentKinds[d.kind]} · ${d.reviewed?'Vérifié':'À vérifier'}</small></span><span>›</span></a>`).join('')||'<p class="empty">Aucun document importé.</p>'}</div></section>`;
 let file=null;
 function selectFile(e){file=e.target.files[0]||null;$('#scanFilename').textContent=file?file.name:'Aucun fichier sélectionné.';$('#readDocument').disabled=!file;}
 $('#scanFile').onchange=selectFile;$('#cameraFile').onchange=selectFile;
 const scanHints={passport:'Photographiez la page avec la photo, avec les lignes du bas bien visibles.',identity:'Importez le recto puis le verso séparément pour compléter les informations de la même personne.',residence:'Importez le recto puis le verso séparément, avec les lignes du bas bien visibles.',address:'Le nom du titulaire et l’adresse du logement doivent être lisibles.',rib:'Le titulaire, l’IBAN et le BIC doivent être entièrement visibles.',insurance:'Le titulaire, le numéro de contrat et les dates doivent être lisibles.'};
 $('#scanKind').insertAdjacentHTML('afterend','<p id="scanHint" class="tiny sub"></p>');$('#scanKind').onchange=()=>{$('#scanHint').textContent=scanHints[$('#scanKind').value]||'Photographiez le document entier, à plat et sans reflet.';};$('#scanKind').onchange();
 $('#scanForm').onsubmit=async e=>{
  e.preventDefault();if(!file)return;if(file.size>8*1024*1024)return notify('8 Mo maximum par document.');
  const button=$('#readDocument');button.disabled=true;$('#scanStatus').textContent='Lecture du document en cours…';
  try{
   const encoded=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('Impossible de lire le fichier.'));r.readAsDataURL(file);});
   const result=await api(`/api/companies/${cid}/documents`,{method:'POST',body:JSON.stringify({filename:file.name,kind:$('#scanKind').value,data:encoded})});
   if(tab==='scanner'&&company.id===cid)await openTab('document',{recordId:result.id});else notify('Document importé. Retrouvez-le dans Documents & profil.');
  }catch(err){if($('#scanStatus'))$('#scanStatus').textContent=err.message;button.disabled=false;}
 };
 $('#profileForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const fields=Object.fromEntries($$('#profileForm [data-profile-field]').map(x=>[x.dataset.profileField,x.value]));await api(`/api/companies/${cid}/profile`,{method:'PUT',body:JSON.stringify({confirmed:true,fields,version:profile.version})});await renderScanner();notify('Profil enregistré.');}catch(err){button.disabled=false;notify(err.message);}};
}

async function renderDocument(id){
 const cid=company.id;let doc=await api(`/api/companies/${cid}/documents/${id}`);
 if(!doc.reviewed&&['identity','passport','residence'].includes(doc.kind)&&(doc.analysis_version||0)<2){
  try{await api(`/api/companies/${cid}/documents/${id}/reanalyze`,{method:'POST'});doc=await api(`/api/companies/${cid}/documents/${id}`);}
  catch(err){doc.proposal.notes.push('La nouvelle lecture n’a pas abouti : '+err.message);}
 }
 const p=doc.proposal;
 $('#content').innerHTML=`<section class="form-page"><h1>Vérifier le document</h1><p>${clean(doc.filename)} · ${clean(documentKinds[doc.kind])}</p><a class="btn" href="/api/companies/${cid}/documents/${id}/source" target="_blank" rel="noopener">Télécharger l’original</a>${p.notes.map(n=>`<p class="msg">${clean(n)}</p>`).join('')}<details class="ocr-text"><summary>Texte reconnu</summary><pre>${clean(doc.text)}</pre></details>${doc.reviewed?'<p class="msg">Document déjà vérifié. Les informations validées sont conservées dans le profil et les tarifs.</p>':`<form id="documentReview" class="stack" data-no-dictation><h2>Informations reconnues</h2><p class="tiny sub">Vérifiez les valeurs préremplies et corrigez-les si nécessaire avant de les enregistrer.</p><div class="fields">${profileFields(p.fields,'import',Object.keys(p.fields))}</div><details><summary>Compléter les informations manquantes</summary><div class="fields">${profileFields({},'import',(documentFields[doc.kind]||documentFields.other).filter(k=>!p.fields[k]))}</div></details>${Object.keys(p.evidence).length?`<details><summary>Extraits à vérifier</summary>${Object.entries(p.evidence).map(([k,v])=>`<p><strong>${profileLabels[k]}</strong> : ${clean(v)}</p>`).join('')}</details>`:''}${p.rates.length?`<h2>Tarifs unitaires proposés</h2><div class="stack">${p.rates.map((r,i)=>`<article class="card imported-rate" data-rate-index="${i}"><label class="archive-filter"><input data-use-rate type="checkbox" checked> Reprendre ce tarif</label><div class="field"><label>Désignation<input data-rate="description" maxlength="300" value="${clean(r.description)}"></label></div><div class="fields"><div class="field"><label>Prix unitaire<input data-rate="unit_price" type="number" step="0.01" min="0" max="100000000" value="${clean(r.unit_price)}"></label></div><div class="field"><label>Devise<select data-rate="currency">${options(['EUR','XOF','USD'],r.currency)}</select></label></div><div class="field"><label>Unité<input data-rate="unit" maxlength="40" value="${clean(r.unit)}"></label></div></div><small>${clean(r.source)}</small></article>`).join('')}</div>`:''}<button class="btn primary" type="submit">Valider et enregistrer les informations</button></form>`}</section>`;
 $('#content .form-page').insertAdjacentHTML('beforeend','<button class="btn warn" id="deleteDocument" type="button">Supprimer ce document</button>');
 $('#deleteDocument').onclick=async e=>{if(!confirm('Supprimer ce document et ses tarifs importés ? Le profil déjà validé reste conservé.'))return;e.currentTarget.disabled=true;try{await api(`/api/companies/${cid}/documents/${id}`,{method:'DELETE'});await finishForm('scanner');notify('Document supprimé.');}catch(err){if($('#deleteDocument'))$('#deleteDocument').disabled=false;notify(err.message);}};
 if(!doc.reviewed)$('#documentReview').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{
  const fields=Object.fromEntries($$('#documentReview [data-profile-field]').filter(x=>x.value.trim()).map(x=>[x.dataset.profileField,x.value.trim()]));
  const rates=$$('.imported-rate').filter(r=>r.querySelector('[data-use-rate]').checked).map(r=>Object.fromEntries(Array.from(r.querySelectorAll('[data-rate]')).map(x=>[x.dataset.rate,x.value])));
  await api(`/api/companies/${cid}/documents/${id}/confirm`,{method:'POST',body:JSON.stringify({confirmed:true,profile_fields:fields,rates})});
  await finishForm('scanner');notify('Sélection vérifiée et enregistrée.');
 }catch(err){button.disabled=false;notify(err.message);}};
}

function addTariffPicker(catalog){
 if(!catalog.length)return;
 $('#quoteLines').insertAdjacentHTML('beforebegin',`<div class="field"><label for="catalogTariff">Reprendre un tarif validé</label><select id="catalogTariff"><option value="">Choisir un tarif</option>${catalog.map(r=>`<option value="${r.id}">${clean(r.description)} · ${quoteMoney(r.unit_price_minor,r.currency)} / ${clean(r.unit)}</option>`).join('')}</select></div>`);
 $('#catalogTariff').onchange=e=>{const r=catalog.find(x=>x.id===Number(e.target.value));if(!r)return;
  if($$('.quote-line').length>=30)return notify('30 lignes maximum.');
  const used=$$('.quote-line').some(row=>row.querySelector('[name="description"]').value.trim());
  if(used&&$('#quoteCurrency').value!==r.currency){e.target.value='';return notify('Ce tarif utilise une autre devise. Créez un devis séparé.');}
  if(!used){$('#quoteLines').replaceChildren();$('#quoteCurrency').value=r.currency;}
  $('#quoteLines').append(quotationLine({description:r.description,quantity:1,unit_price:(r.unit_price_minor/100).toFixed(2)}));updateQuotePreview();e.target.value='';
 };
}
