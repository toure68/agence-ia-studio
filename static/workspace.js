'use strict';
const profileLabels={legal_name:'Raison sociale',siret:'SIRET',rcs_number:'Immatriculation RCS',legal_form:'Forme juridique',capital:'Capital social',trade_name:'Nom commercial',activity:'Activité',representative:'Représentant légal',address:'Adresse du siège',iban:'IBAN',account_holder:'Titulaire du compte',bic:'BIC / SWIFT',last_name:'Nom',first_name:'Prénom(s)',birth_date:'Date de naissance',birth_place:'Lieu de naissance',nationality:'Nationalité',document_number:'Numéro du document',expiry_date:'Date de fin de validité',personal_address:'Adresse personnelle',insurer:'Assureur',policy_number:'Numéro de contrat',sex:'Sexe',issue_date:'Date de délivrance',issuing_authority:'Autorité de délivrance',issuing_country:'Pays émetteur (code)',document_holder:'Nom complet du titulaire',email:'Email',phone:'Téléphone'};
const documentKinds={kbis:'Extrait Kbis',registration:'Immatriculation / avis SIRENE',identity:'Carte d’identité',passport:'Passeport',residence:'Titre de séjour',address:'Justificatif de domicile / facture',rib:'RIB / coordonnées bancaires',insurance:'Attestation d’assurance',quote:'Ancien devis / tarifs',other:'Autre document'};
const documentFields={kbis:['legal_name','rcs_number','siret','legal_form','capital','address','trade_name','activity','representative'],registration:['legal_name','siret','rcs_number','address','activity'],identity:['last_name','first_name','birth_date','birth_place','nationality','document_number','issue_date','expiry_date','sex','issuing_country','issuing_authority','personal_address'],passport:['last_name','first_name','birth_date','birth_place','nationality','document_number','issue_date','expiry_date','sex','issuing_country','issuing_authority'],residence:['last_name','first_name','birth_date','nationality','document_number','issue_date','expiry_date','sex','issuing_country','issuing_authority','personal_address'],address:['document_holder','personal_address'],rib:['account_holder','iban','bic'],insurance:['insurer','document_holder','policy_number','issue_date','expiry_date'],quote:['legal_name','siret','address'],other:Object.keys(profileLabels)};

const moduleTones={requests:'blue',clients:'blue',activities:'gold',leads:'green',emails:'blue',prospects:'gold',calendar:'blue',reports:'green',drafts:'purple',companies:'blue','company-edit':'gold',team:'purple',treasury:'gold',equipment:'blue',risks:'purple',scanner:'gold'};
function moduleTone(key){return moduleTones[key]||'green';}
const tileStates=new Set(['neutral','info','success','warning','danger']);
function tileState(state,label){return {state:tileStates.has(state)?state:'neutral',label:label||'Normal'};}
function modulePresentation(key,state){const p=state.module_states?.[key];return p?tileState(p.state,p.label):tileState('neutral','Normal');}
const widgetIconPaths={
 requests:'<path d="M4 4h16v16H4zM4 13h5l2 3h2l2-3h5M12 2v8m-3-3 3 3 3-3"/>',
 clients:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
 activities:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',
 leads:'<path d="M6 2h8l4 4v16H6zM14 2v5h4M9 11h6m-6 4h6m-6 4h4"/>',
 emails:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m3 6 9 7 9-7"/>',
 prospects:'<circle cx="10" cy="9" r="6"/><path d="m15 14 7 7M7 9h6m-3-3v6"/>',
 calendar:'<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M7 2v5m10-5v5M3 10h18m-13 5h2m4 0h2m-8 4h2"/>',
 reports:'<path d="M3 3v18h19M7 17v-5m5 5V6m5 11V9"/>',
 drafts:'<path d="M5 3h10l4 4v14H5zM9 10h6m-6 4h4m1 6 7-7 2 2-7 7-3 1z"/>',
 companies:'<path d="M4 22V3h16v19M2 22h20M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2m-6 7v-4h4v4"/>',
 'company-edit':'<path d="m4 17 12-12 3 3L7 20l-4 1zM14 7l3 3M4 4h6M4 8h3M14 21h7"/>',
 team:'<circle cx="9" cy="8" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8m2 3a6 6 0 0 1 3 5v2"/>',
 treasury:'<path d="M6 3h16v13M2 10c2 0 4-2 4-4m12 0c0 2 2 4 4 4M2 16c2 0 4 2 4 4m12 0c0-2 2-4 4-4"/><rect x="2" y="6" width="20" height="14" rx="2"/><text x="12" y="16" text-anchor="middle" font-size="9" font-weight="800" stroke="none" fill="currentColor">€</text>',
 equipment:'<path d="M9 3h6l2 5h5v13H2V8h5zM2 13h20m-13-1v4h6v-4"/>',
 risks:'<path d="m12 2 9 4v6c0 5-5 9-9 11-4-2-9-6-9-11V6zM12 7v6m0 4h.01"/>',
 scanner:'<path d="M8 2H3v5m13-5h5v5M3 17v5h5m13-5v5h-5M7 6h10v12H7zM5 12h14"/>',
 social:'<path d="m4 10 13-6v16L4 14zM4 10H2v4h2m3 1 2 7h4l-3-6M20 9l3-2m-3 8 3 2"/>'
};
const filledWidgetIcons={
 clients:'<circle cx="12" cy="7" r="4.5"/><path d="M3 22v-3a9 9 0 0 1 18 0v3z"/>',
 equipment:'<path fill-rule="evenodd" d="M8 3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3h4a2 2 0 0 1 2 2v4H2V8a2 2 0 0 1 2-2h4zm2 3h4V3h-4zM2 14h8v2h4v-2h8v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>',
 leads:'<path d="M5 1h9v6h6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2m11 0 4 4h-4z"/><path d="m7 14 3 3 6-7" fill="none" stroke="#164a30" stroke-width="2.2"/>',
 calendar:'<rect x="2" y="4" width="20" height="19" rx="2"/><path d="M2 9h20M7 1v5m10-5v5" fill="none" stroke="#352443" stroke-width="2"/><path d="M6 12h3v3H6zm5 0h3v3h-3zm5 0h3v3h-3zM6 17h3v3H6zm5 0h3v3h-3zm5 0h3v3h-3z" fill="#352443"/>',
 team:'<circle cx="12" cy="7" r="4"/><circle cx="3.5" cy="9" r="2.5"/><circle cx="20.5" cy="9" r="2.5"/><path d="M5 22v-4a7 7 0 0 1 14 0v4zM0 19v-3a4 4 0 0 1 5-4l2 1a9 9 0 0 0-4 6zm24 0h-3a9 9 0 0 0-4-6l2-1a4 4 0 0 1 5 4z"/>',
 scanner:'<path d="M2 5a2 2 0 0 1 2-2h5l3 3h8a2 2 0 0 1 2 2v2H5l-3 10zm3 7h18l-4 10H1z"/>',
 reports:'<rect x="2" y="15" width="4" height="8" rx="1" fill="#ed6265"/><rect x="7.5" y="11" width="4" height="12" rx="1" fill="#edbe54"/><rect x="13" y="6" width="4" height="17" rx="1" fill="#58c57e"/><rect x="18.5" y="1" width="4" height="22" rx="1" fill="#58a9dd"/>',
 treasury:'<path d="m1 7 11-6 11 6-11 6zm1 4 10 5 10-5v4l-10 5-10-5zm0 7 10 5 10-5v3l-10 5-10-5z"/>'
};
function moduleIcon(key){const name=Object.hasOwn(widgetIconPaths,key)?key:'requests';return `<svg data-icon="${name}" viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${widgetIconPaths[name]}</svg>`;}

function moduleWidget(key,state){
 const data=state.widgets?.[key];
 if(!data)return {value:'—',label:'À actualiser',detail:'Données à actualiser'};
 if(key==='treasury'){
  const balances=Object.entries(data.balances_minor||{});
  const format=([currency,amount])=>new Intl.NumberFormat('fr-FR',{style:'currency',currency}).format(amount/100);
  const detail=balances.length?'Solde interne : '+balances.map(format).join(' · '):'Aucun mouvement enregistré';
  if(balances.length>1)return {value:String(balances.length),label:'Devises · interne',detail};
  if(!balances.length)return {value:'—',label:'Aucun mouvement',detail};
  const [currency,amount]=balances[0];
  return {value:quoteMoney(amount,currency),label:'Solde interne',detail};
 }
 const value=typeof data.value==='number'?new Intl.NumberFormat('fr-FR',{notation:'compact',maximumFractionDigits:1}).format(data.value):String(data.value),label=data.label;
 return {value,label,detail:String(data.value)+' · '+label};
}
function widgetMarkup(widget){return `<span class="widget-metric" title="${clean(widget.detail)}"><b class="widget-value">${clean(widget.value)}</b><span class="widget-caption">${clean(widget.label)}</span></span>`;}
function refreshHomeWidgets(state){
 document.querySelectorAll('#content .module-grid .module-tile[data-go]').forEach(tile=>{
  const widget=moduleWidget(tile.dataset.go,state),host=tile.querySelector('.widget-metric');
  if(host){const value=host.querySelector('.widget-value'),label=host.querySelector('.widget-caption');if(value.textContent!==widget.value)value.textContent=widget.value;if(label.textContent!==widget.label)label.textContent=widget.label;host.title=widget.detail;}
  tile.setAttribute('aria-label',tile.dataset.moduleLabel+' · '+widget.detail+' · '+modulePresentation(tile.dataset.go,state).label);
 });
}
function homeGridModules(workspace,state={}){
 const columns=[2,3,4].includes(workspace.columns)?workspace.columns:2;
 const byKey=new Map(workspace.modules.map(m=>[m.key,m]));
 const selected=[...new Set(workspace.visible)].filter(key=>byKey.has(key));
 const dynamic=workspace.dynamic!==false,inactive=new Set(workspace.inactive||[]);
 const weight=key=>({danger:4,warning:3,info:2})[state.module_states?.[key]?.state]||0;
 const urgent=key=>weight(key)>=3;
 const recent=key=>workspace.last_used?.[key]||0;
 let keys=dynamic?[...new Set([...workspace.modules.filter(m=>urgent(m.key)).map(m=>m.key),...selected.filter(key=>!inactive.has(key)||urgent(key))])]:[...selected];
 if(dynamic)keys.sort((a,b)=>weight(b)-weight(a)||recent(b)-recent(a));
 // Row cap: the user's chosen rows (1–10), else 3 rows in 2 and 3 columns and 2 rows in 4 columns.
 // Modules with an action to do (urgent) always show, adding rows if needed; the rest stays in the reserve.
 const rows=Number.isInteger(workspace.rows)&&workspace.rows>=1&&workspace.rows<=10?workspace.rows:({2:3,3:3,4:2})[columns];
 const cap=rows*columns;
 const urgentKeys=keys.filter(urgent),calm=keys.filter(key=>!urgent(key));
 const kept=new Set([...urgentKeys,...calm.slice(0,Math.max(0,cap-urgentKeys.length))]);
 keys=keys.filter(key=>kept.has(key));
 if(keys.length&&keys.length%columns){
  // Fill the last row from the reserve; this never goes past the cap unless urgent modules already did.
  const others=workspace.modules.filter(m=>!keys.includes(m.key)&&!calm.includes(m.key)&&(!dynamic||!inactive.has(m.key)||urgent(m.key)));
  others.sort((a,b)=>weight(b.key)-weight(a.key)||Number(workspace.suggested?.includes(b.key)||false)-Number(workspace.suggested?.includes(a.key)||false)||recent(b.key)-recent(a.key));
  const pool=[...calm.filter(key=>!kept.has(key)),...others.map(m=>m.key)];
  keys.push(...pool.slice(0,columns-keys.length%columns));
  // Every displayed row has equal cells: drop calm modules rather than leave a gap.
  while(keys.length%columns&&keys.some(key=>!urgent(key))){const i=keys.map(urgent).lastIndexOf(false);keys.splice(i,1);}
 }
 return {columns,modules:keys.map(key=>({...byKey.get(key),automatic:!selected.includes(key)}))};
}
// Measure the real two-column reference, including gaps, before scaling dense cards.
// One observer is reused; detached home grids are released on the next render.
let homeGridObserver;
const measuredHomeGrids=new Set();
function sizeHomeGrid(grid){
 const width=grid.getBoundingClientRect().width;
 if(!width)return;
 if(grid.closest('.reference-home')){
  const columns=Number(grid.dataset.columns)||2,gap=parseFloat(getComputedStyle(grid).columnGap)||0;
  const reference=(width-gap)/2,cell=(width-gap*(columns-1))/columns,scale=cell/reference;
  grid.style.setProperty('--home-grid-scale',String(scale));
  grid.style.setProperty('--home-grid-height',`${(matchMedia('(max-width:750px)').matches?112:132)*scale}px`);
  return;
 }
 const reference=(width-12)/2,cell=(width-16)/3,scale=cell/reference;
 grid.style.setProperty('--module-reference-width',`${reference-2}px`);
 grid.style.setProperty('--module-scale',String(scale));
 if(grid.dataset.columns==='3')grid.style.setProperty('--module-height',`${(matchMedia('(max-width:750px)').matches?88:112)*scale}px`);
 else grid.style.removeProperty('--module-height');
}
function observeHomeGrids(){
 if(!homeGridObserver)homeGridObserver=new ResizeObserver(entries=>entries.forEach(({target})=>sizeHomeGrid(target)));
 for(const grid of measuredHomeGrids)if(!grid.isConnected){homeGridObserver.unobserve(grid);measuredHomeGrids.delete(grid);}
 document.querySelectorAll('.module-grid').forEach(grid=>{
  sizeHomeGrid(grid);
  if(!measuredHomeGrids.has(grid)){measuredHomeGrids.add(grid);homeGridObserver.observe(grid);}
 });
}
function homeModulesMarkup(workspace,state){
 requestAnimationFrame(observeHomeGrids);
 const grid=homeGridModules(workspace,state),shortLabels={prospects:'Prospects','company-edit':'Identité',scanner:'Documents'};
 const counts=state.action_counts||{};
 return `<nav class="module-grid" data-columns="${grid.columns}" aria-label="Fonctions de l’entreprise">${grid.modules.map(m=>{
  const id=['company-edit','team'].includes(m.key)?company.id:null,n=counts[m.key]||0,p=modulePresentation(m.key,state);
  const icon=`<span class="module-icon" aria-hidden="true">${moduleIcon(m.key)}</span>`,widget=widgetMarkup(moduleWidget(m.key,state)),count=n?`<span class="module-count" aria-label="${n} élément(s) à traiter">${n}</span>`:'';
  const label=`<span class="module-copy"><strong>${clean(grid.columns>2?(shortLabels[m.key]||m.label):m.label)}</strong><p class="module-insight">${n?n+' élément(s) à traiter':p.label==='Normal'?'':clean(p.label)}</p></span>`;
  return `<article class="module-card tone-${moduleTone(m.key)}" data-module="${m.key}"${m.automatic?' data-reserve-fill="true"':''}><a class="module-tile tone-${moduleTone(m.key)} state-${p.state}" data-state="${p.state}" data-go="${m.key}" data-module-label="${clean(m.label)}" title="${clean(m.label)}" aria-label="${clean(m.label)} · ${clean(p.label)}" href="#/${m.key}${id?'/'+id:''}"${id?` data-company-id="${id}"`:''}>${grid.columns===4?`<span class="module-face">${icon}${widget}${count}</span>${label}`:`${icon}<span class="widget-copy">${label}${widget}</span>${count}<span class="module-chevron" aria-hidden="true">›</span>`}</a></article>`;
 }).join('')}</nav><a class="module-search-launch" data-go="module-library" href="#/module-library"><span aria-hidden="true">⌕</span> Rechercher vos modules…</a><a class="btn more-functions" data-go="module-library" href="#/module-library">Tous les modules</a><a class="module-reserve-launch" data-go="module-reserve" href="#/module-reserve"><span class="module-reserve-plus" aria-hidden="true">＋</span><span>Réserve de fonctions</span></a>`;
}
function updateHomeGrid(workspace,state){
 const current=$('#content .module-grid');if(!current)return;
 const fragment=document.createElement('div');fragment.innerHTML=homeModulesMarkup(workspace,state);
 const next=fragment.querySelector('.module-grid'),keys=grid=>[...grid.children].map(node=>node.dataset.module).join('|');
 if(current.dataset.columns!==next.dataset.columns||keys(current)!==keys(next))current.replaceWith(next);
}
function trackModuleUse(route){
 const key=({'client-new':'clients','client-edit':'clients','activity-new':'activities','activity-edit':'activities',activity:'activities','quote-new':'leads','quote-edit':'leads',quote:'leads','quote-sign':'leads',email:'emails','task-new':'calendar','prospect-new':'prospects','company-new':'companies',incoming:'requests',draft:'drafts',document:'scanner',material:'equipment','social-new':'social','social-post':'social'})[route]||route;
 if(!Object.hasOwn(moduleTones,key)&&key!=='social')return;
 // A successful panel visit records use; no business action is triggered.
 return api(`/api/companies/${company.id}/workspace/usage/${key}`,{method:'POST',keepAfterPanelClose:true}).catch(()=>{});
}

async function renderModuleReserve(){
 const cid=company.id,[workspace,state]=await Promise.all([api(`/api/companies/${cid}/workspace`),api(`/api/companies/${cid}/cockpit`)]);
 const shown=new Set(homeGridModules(workspace,state).modules.map(m=>m.key));
 const reserve=workspace.modules.filter(m=>!shown.has(m.key));
 $('#content').innerHTML=`<section class="module-reserve"><p class="tiny sub">Fonctions rangées hors de l’accueil. Une fonction utilisée récemment ou avec une action à faire remonte toute seule.</p><div class="module-reserve-grid">${reserve.map(m=>{const id=['company-edit','team'].includes(m.key)?cid:null,p=modulePresentation(m.key,state);return `<a class="module-reserve-item tone-${moduleTone(m.key)}" data-go="${m.key}" href="#/${m.key}${id?'/'+id:''}"${id?` data-company-id="${id}"`:''}><span class="module-icon" aria-hidden="true">${moduleIcon(m.key)}</span><span><strong>${clean(m.label)}</strong>${p.label&&p.label!=='Normal'?`<small>${clean(p.label)}</small>`:''}</span></a>`;}).join('')||'<p class="empty">Toutes vos fonctions sont déjà sur l’accueil.</p>'}</div><a class="btn module-reserve-manage" data-go="module-library" href="#/module-library">Gérer mes fonctions</a></section>`;
}
async function renderModuleLibrary(){
 const cid=company.id,state=await api(`/api/companies/${cid}/workspace`);let selected=new Set(state.visible),domain=state.domain;
 $('#content').innerHTML=`<section class="form-page"><h1>Mes fonctions</h1><p class="tiny sub">Afficher ou masquer un bouton conserve ses données.</p><p class="tiny sub">Le mode dynamique remonte les alertes et range les fonctions inactives depuis dix jours. Les modules restent accessibles dans la réserve.</p><div class="field"><label for="activityDomain">Mon domaine d’activité</label><select id="activityDomain">${selectMap(state.domains,domain)}</select></div><label class="check"><input type="checkbox" id="dynamicHome" ${state.dynamic!==false?'checked':''}> Mode dynamique (recommandé)</label><div class="field"><label for="homeColumns">Colonnes sur l’accueil</label><div class="home-column-controls"><select id="homeColumns">${[2,3,4].map(n=>`<option value="${n}" ${n===(state.columns||2)?'selected':''}>${n} colonnes${n===2?' (par défaut)':''}</option>`).join('')}</select><button type="button" class="btn primary" id="saveModules">Enregistrer</button></div></div><div class="list-filters"><input id="moduleSearch" class="control" type="search" aria-label="Rechercher une fonction" placeholder="Rechercher une fonction"><select id="moduleScope" class="control" aria-label="Fonctions proposées"><option value="all">Tous les domaines</option><option value="suggested">Adaptées à mon activité</option></select></div><div class="row library-controls"><button class="btn" id="suggestModules">Proposer selon mon activité</button><button class="btn" id="selectAllModules">Tout afficher</button><button class="btn" id="clearModules">Tout masquer</button></div><div id="moduleLibrary" class="module-library"></div><button class="btn primary library-save" id="saveModulesBottom">Enregistrer mon accueil</button></section>`;
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
 $('#saveModules').onclick=async()=>{$$('#saveModules,#saveModulesBottom').forEach(b=>b.disabled=true);try{await api(`/api/companies/${cid}/workspace`,{method:'PUT',body:JSON.stringify({domain,visible:state.modules.filter(m=>selected.has(m.key)).map(m=>m.key),version:state.version,columns:Number($('#homeColumns').value),dynamic:$('#dynamicHome').checked})});await finishForm('dashboard');notify('Votre accueil est enregistré.');}catch(err){$$('#saveModules,#saveModulesBottom').forEach(b=>b.disabled=false);notify(err.message);}};$('#saveModulesBottom').onclick=()=>$('#saveModules').click();draw();
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

