'use strict';
// The provider adapter supplies data; all reading and writing stays in the mounted cockpit.
const mailClient=(()=>{
 const activeAccounts=new Map(),accountEmails=new Map();
 const accountKey=()=>String(me?.id||'')+':'+String(company?.id||'');
 const selected=()=>{if(activeAccounts.has(accountKey()))return activeAccounts.get(accountKey());const q=new URLSearchParams(location.search);return Number(q.get('mail_company'))===company?.id?Math.max(0,Number(q.get('mail_account'))||0):0;};
 const emailKey=()=>accountKey()+':'+selected();
 function selectAccount(id){activeAccounts.set(accountKey(),Number(id)||0);}
 function scopedUrl(url,aid=selected()){
  if(!aid)return url;
  const root=`/api/companies/${company.id}/mail`;
  for(const route of ['status','settings','sync','disconnect','messages'])if(url===root+'/'+route||route==='messages'&&url.startsWith(root+'/messages/'))url=root+'/unified/boxes/'+aid+url.slice(root.length);
  return url+(url.includes('?')?'&':'?')+'account_id='+aid;
 }
 const mailApi=(url,options)=>api(scopedUrl(url),options);
 let popup=null,watchTimer=null,watchVersion=null,watchGeneration=0,composeBusy=false;
 const base=()=>`/api/companies/${company.id}/mail`;
 const unified=()=>base()+'/unified';
 const demo=()=>document.body.dataset.publicDemo==='true';
 const button=(id,label,primary=false)=>`<button type="button" class="btn${primary?' primary':''}" id="${id}">${label}</button>`;
 const size=n=>n>=1048576?(n/1048576).toFixed(1)+' Mo':Math.max(1,Math.round((n||0)/1024))+' Ko';
 const drafts=new Map();
 function modal(html){openModal(html);const p=document.querySelector('#modalLayer .modal');p.dataset.closeScope='modal';p.dataset.mailOverlay='true';return p;}
 function watch(host,changed,initialVersion=null){
  const generation=++watchGeneration;clearTimeout(watchTimer);watchVersion=initialVersion;if(demo())return;const cid=company.id,aid=selected();
  const tick=async()=>{if(generation!==watchGeneration||!host.isConnected||company?.id!==cid||selected()!==aid)return;try{if(!document.hidden){const v=await mailApi(unified()+'/version');if(generation!==watchGeneration||!host.isConnected||company?.id!==cid||selected()!==aid)return;if(watchVersion===null||watchVersion!==v.version)await changed();watchVersion=v.version;}}catch{}if(generation===watchGeneration&&host.isConnected&&company?.id===cid)watchTimer=setTimeout(tick,20000);};tick();
 }
 async function connect(replace=false){
  const options=typeof replace==='object'?replace:{};replace=typeof replace==='boolean'?replace:false;
  if(replace===true&&!confirm('Cette autorisation peut remplacer la boîte actuelle. Si vous choisissez une autre boîte, ses copies et brouillons locaux seront supprimés. Continuer ?'))return;
  if(demo())return notify('Démonstration : aucune boîte réelle ne sera connectée.');
  popup=window.open('','aia-mail-auth','popup,width=520,height=720');
  if(!popup)return notify('Autorisez la fenêtre de connexion puis réessayez.');
  popup.document.title='Connexion de votre messagerie';popup.document.body.textContent='Ouverture de la connexion sécurisée…';
  try{const r=await mailApi(unified()+'/connect',{method:'POST',body:JSON.stringify({replace_confirmed:replace===true,...options})});popup.location.href=r.url;}catch(e){popup.close();notify(e.message);}
 }
 async function notificationMessage(card){
  const cid=company.id,aid=card.action.connection_id||0;
  const message=await api(scopedUrl(`/api/companies/${cid}/mail/messages/${card.action.id}`,aid));
  if(company.id!==cid)throw Error('L’entreprise a changé. Rouvrez la notification.');
  if((message.connection_id||0)!==aid)throw Error('La boîte a changé. Rouvrez la notification.');
  return message;
 }
 async function loadNotification(card){
  const message=await notificationMessage(card),aid=card.action.connection_id||0;
  card.raw=message.body||'';card.from=message.sender;card.subject=message.subject;
  card.date=timestamp(message.received);card._mailLoaded=true;
  const attachments=Array.isArray(message.attachments)?message.attachments:JSON.parse(message.attachments||'[]');
  card.files=attachments.map(f=>({name:f.filename||'Pièce jointe',type:/^image\/(png|jpeg|gif|webp)$/.test(f.content_type)?'image':f.content_type==='application/pdf'?'pdf':'other',
   src:scopedUrl(`/api/companies/${company.id}/mail/unified/messages/${message.id}/attachments/${encodeURIComponent(f.id)}`,aid)}));
 }
 async function openNotification(card,mode){
  try{const cid=company.id,message=await notificationMessage(card);if(company.id!==cid)return;
   selectAccount(card.action.connection_id||0);
   if(mode==='thread')return await openTab('email',{recordId:message.id});
   if(mode==='actions')return actions(message);
   await composer(message,mode);
  }catch(error){notify(error.message);}
 }
 window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===popup&&e.data?.type==='aia-mail-connected'){popup=null;if(e.data.company_id&&e.data.company_id!==company?.id)return notify('Messagerie connectée dans l’entreprise d’origine.');selectAccount(e.data.account_id||0);window.mailConnections?.refresh(true);if(document.querySelector('#modalLayer:not(.hide) .mail-provider-sheet')){closeModal();openTab('emails');}else if(tab==='emails')renderEmails();else notify('Messagerie connectée. Ouvrez E-mails pour actualiser.');}});
 async function mailbox(status,messages,legacy){
  accountEmails.set(emailKey(),status.email||'');
  const host=$('#content'),connected=status.connected;let rows=messages;
  host.innerHTML=`<section class="mail-workspace"><div class="heading"><h1>E-mails</h1>${button('mailNew','Nouveau message',true)}</div>${demo()?'<p class="msg">Exemple fictif · aucun envoi possible</p>':''}<p class="tiny sub">${connected?clean(status.email):'Connectez votre boîte pour lire et répondre depuis cet écran.'}</p><div class="row">${button('mailSync','Actualiser')}${button('mailConnect','Connecter Gmail')}</div>${!status.configured&&!connected?'<p class="msg">La connexion directe à Google reste à configurer. Les copies déjà importées restent consultables.</p>':''}${status.error?`<p class="msg err">${clean(status.error)}</p>`:''}<details class="mail-settings"><summary>Connexion et préférences</summary><form id="mailSettingsForm" class="stack"><div class="field"><label for="mailKeywords">Activités et intérêts</label><textarea id="mailKeywords" required minlength="2" maxlength="500">${clean(legacy.keywords||'Clients, commandes, factures')}</textarea></div><label><input id="mailAutomatic" type="checkbox" ${legacy.automatic?'checked':''}> Actualisation de secours toutes les 15 minutes</label><button type="submit" class="btn">Enregistrer les préférences</button></form><p class="tiny sub">${status.realtime?'Mises à jour automatiques par notifications du fournisseur.':'Les notifications instantanées restent à configurer. Actualisez manuellement si nécessaire.'}</p>${connected?button('mailDisconnect','Déconnecter cette boîte'):''}</details><div class="list-filters"><input class="control" id="mailSearch" type="search" placeholder="Rechercher un e-mail" aria-label="Rechercher un e-mail"><select class="control" id="mailView" aria-label="Vue de messagerie"><option value="inbox">Réception</option><option value="archive">Archives</option><option value="all">Tous les messages</option></select></div><p class="tiny sub" id="mailUpdate" role="status"></p><div id="mailList" class="task-list"></div><details id="mailSaved"><summary>Brouillons et envois</summary><div id="mailDraftList"></div></details></section>`;
  if(window.mailConnections){const manage=document.createElement('button');manage.type='button';manage.className='btn';manage.id='mailManageAccounts';manage.textContent='Mes messageries';manage.onclick=()=>mailConnections.manage();host.querySelector('.heading').append(manage);}
  function draw(){if(!host.isConnected)return;const search=$('#mailSearch').value.toLocaleLowerCase('fr'),view=$('#mailView').value;$('#mailList').innerHTML=rows.filter(m=>(view==='all'||view==='archive'&&m.archived||view==='inbox'&&!m.archived)&&[m.subject,m.sender].join(' ').toLocaleLowerCase('fr').includes(search)).map(m=>`<button type="button" class="task-row mail-row" data-mail-id="${m.id}"><span><strong>${clean(m.subject)}</strong><small>${clean(m.sender)}${m.unread?' · Non lu':''}</small></span><span aria-hidden="true">›</span></button>`).join('')||'<p class="empty">Aucun message dans cette vue.</p>';host.querySelectorAll('[data-mail-id]').forEach(b=>b.onclick=()=>openTab('email',{recordId:Number(b.dataset.mailId)}));}
  async function loadDrafts(){if(!connected)return;try{const ds=await mailApi(unified()+'/drafts');if(!host.isConnected)return;$('#mailDraftList').innerHTML=ds.map(d=>`<button type="button" class="task-row" data-draft-id="${d.id}"><span>${clean(d.subject||'Sans objet')}<small>${clean(({draft:'Brouillon',sent:'Envoyé',sending:'Envoi engagé',uncertain:'Envoi à vérifier'})[d.status])}</small></span></button>`).join('')||'<p class="sub">Aucun brouillon enregistré.</p>';host.querySelectorAll('[data-draft-id]').forEach(b=>b.onclick=async()=>{try{await composer(null,'new',await mailApi(unified()+'/drafts/'+b.dataset.draftId));}catch(e){notify(e.message);}});}catch(e){notify(e.message);}}
  $('#mailSearch').oninput=draw;$('#mailView').onchange=draw;draw();await loadDrafts();
  $('#mailNew').disabled=!connected;$('#mailSync').disabled=!connected;$('#mailConnect').disabled=!status.configured||demo();$('#mailNew').onclick=()=>composer();$('#mailConnect').onclick=()=>connect(!!legacy.connected);
  $('#mailSettingsForm').onsubmit=async e=>{e.preventDefault();try{await mailApi(base()+'/settings',{method:'PUT',body:JSON.stringify({keywords:$('#mailKeywords').value,automatic:$('#mailAutomatic').checked})});notify('Préférences enregistrées.');}catch(e){notify(e.message);}};
  $('#mailSync').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{const r=await mailApi(base()+'/sync',{method:'POST'});rows=await mailApi(base()+'/messages');draw();$('#mailUpdate').textContent=r.more?'Premiers messages actualisés. Appuyez de nouveau pour charger la suite.':'Messages actualisés.';if(tab==='emails')await refreshCockpit();}catch(e){notify(e.message);}finally{b.disabled=false;}};
  const disconnect=$('#mailDisconnect');if(disconnect)disconnect.onclick=async()=>{if(!confirm('Déconnecter cette boîte et supprimer ses copies et brouillons locaux ? Les originaux restent chez votre fournisseur.'))return;try{await mailApi(base()+'/disconnect',{method:'POST'});selectAccount(0);await window.mailConnections?.refresh(true);await renderEmails();}catch(e){notify(e.message);}};
  watch(host,async()=>{rows=await mailApi(base()+'/messages');draw();$('#mailUpdate').textContent='Nouveaux changements synchronisés.';});
 }
 function attachmentMarkup(m){const files=Array.isArray(m.attachments)?m.attachments:JSON.parse(m.attachments||'[]');return files.length?`<div class="mail-files">${files.map((f,i)=>`<button type="button" class="btn mail-file" data-file-index="${i}" data-file-mid="${m.id}">📎 ${clean(f.filename||'Pièce jointe')} <small>${size(f.size)}</small></button>`).join('')}</div>`:'';}
 async function thread(m){
  const host=$('#content'),cid=company.id,result=await mailApi(unified()+`/messages/${m.id}/thread`);if(company.id!==cid||host!==$('#content'))return;if(result.email)accountEmails.set(emailKey(),result.email);
  host.innerHTML=`<section class="mail-thread"><div class="heading"><h1>${clean(m.subject)}</h1>${button('mailMore','⋯')}</div><p class="tiny sub" id="mailThreadUpdate" role="status"></p><div class="row">${button('mailThreadRefresh','Actualiser le fil')}</div><div class="mail-turns">${result.messages.map(item=>`<article class="mail-turn" data-mail-turn="${item.id}"><p class="sub"><strong>${clean(item.sender)}</strong><br>${clean(timestamp(item.received))}</p><div class="mail-body">${clean(item.body)}</div>${attachmentMarkup(item)}</article>`).join('')}</div><div class="row mail-reply-actions">${button('mailReply','Répondre',true)}${button('mailForward','Transférer')}${button('mailDockReply','Réponse longue')}</div><section id="mailInline" aria-label="Votre réponse"></section></section>`;
  $('#mailMore').setAttribute('aria-label','Actions sur cet e-mail');$('#mailMore').onclick=()=>actions(m);$('#mailReply').onclick=()=>inline(m);$('#mailForward').onclick=()=>composer(m,'forward');$('#mailDockReply').onclick=()=>composer(m,'reply');
  host.querySelectorAll('[data-file-index]').forEach(b=>b.onclick=()=>{const msg=result.messages.find(x=>x.id===Number(b.dataset.fileMid));openFile(msg,Number(b.dataset.fileIndex));});
  $('#mailThreadRefresh').onclick=async e=>{e.currentTarget.disabled=true;try{await mailApi(unified()+`/messages/${m.id}/refresh`,{method:'POST'});await thread(await mailApi(base()+`/messages/${m.id}`));}catch(e){notify(e.message);if($('#mailThreadRefresh'))$('#mailThreadRefresh').disabled=false;}};
  const aid=document.createElement('section');aid.className='mail-ai task-detail';aid.innerHTML='<h2>Aide IA</h2><p class="tiny sub">À votre demande, sur votre crédit IA. Les pièces jointes ne sont pas analysées.</p><div class="row"><button type="button" class="btn" data-kind="summary">Résumer</button><button type="button" class="btn" data-kind="reply">Proposer une réponse</button></div><p class="sub" role="status"></p><div class="mail-body"></div><div class="mail-ai-use"></div>';host.querySelector('.mail-reply-actions').before(aid);
  aid.querySelectorAll('[data-kind]').forEach(b=>b.onclick=async()=>{const status=aid.querySelector('[role=status]'),output=aid.querySelector('.mail-body'),use=aid.querySelector('.mail-ai-use');status.textContent='Analyse en cours…';use.replaceChildren();aid.querySelectorAll('[data-kind]').forEach(b=>b.disabled=true);try{const r=await mailApi(base()+`/messages/${m.id}/analyse`,{method:'POST',body:JSON.stringify({kind:b.dataset.kind})});if(!aid.isConnected)return;output.textContent=r.text;status.textContent=r.cached?'Analyse déjà enregistrée, sans nouvel appel IA.':'Proposition IA à vérifier avant utilisation.';if(r.kind==='reply'){const take=document.createElement('button');take.type='button';take.className='btn';take.textContent='Utiliser dans ma réponse';take.onclick=()=>{const d=state(m,'reply');if(d.body.trim()&&!confirm('Remplacer le texte actuel de la réponse par cette proposition ?'))return;d.body=r.text;inline(m);};use.append(take);}}catch(e){status.textContent=e.message;}finally{aid.querySelectorAll('[data-kind]').forEach(b=>b.disabled=false);}});
  watch(host,()=>{$('#mailThreadUpdate').textContent='Le fil a changé. Appuyez sur Actualiser pour charger les nouveautés. Votre saisie est conservée.';},result.version??0);
 }
 function compositionKey(source,mode){return (me?.id||'')+':'+company.id+':'+selected()+':'+mode+':'+(source?.id||'new');}
 function state(source,mode,saved){
  const k=compositionKey(source,mode);if(saved){const d={...saved,key:k};drafts.set(k,d);return d;}if(drafts.has(k))return drafts.get(k);
  const d={key:k,id:null,revision:0,source_id:source?.id||null,mode,to:mode==='reply'?source.reply_to:'',subject:source?((mode==='forward'?'Tr: ':'Re: ')+source.subject).slice(0,300):'',body:mode==='forward'?`\n\n—— Message transféré ——\nDe : ${source.sender}\nObjet : ${source.subject}\n\n${source.body}`:'',files:[],forwarded:[]};drafts.set(k,d);return d;
 }
 function markup(d,source,inlineMode){
  const files=source?(Array.isArray(source.attachments)?source.attachments:JSON.parse(source.attachments||'[]')):[];
  return `<form id="${inlineMode?'mailInlineForm':'mailComposeForm'}" class="stack mail-compose"><div class="field"><label>À<input name="to" type="email" autocomplete="email" maxlength="500" required value="${clean(d.to)}" ${d.mode==='reply'?'readonly':''}></label></div><div class="field"><label>Objet<input name="subject" maxlength="300" required value="${clean(d.subject)}"></label></div><div class="field"><label>${d.mode==='reply'?'Votre réponse':'Votre message'}<textarea name="body" rows="${inlineMode?4:8}" maxlength="30000" required>${clean(d.body)}</textarea></label></div>${d.mode==='forward'&&files.length?`<fieldset><legend>Pièces jointes à transférer</legend>${files.map(f=>`<label class="mail-attach-choice"><input type="checkbox" name="forwarded" value="${clean(f.id)}" ${d.forwarded.includes(f.id)?'checked':''}> ${clean(f.filename||'Pièce jointe')} · ${size(f.size)}</label>`).join('')}</fieldset>`:''}<label class="btn mail-file-picker">Joindre un fichier<input type="file" class="file-input" multiple aria-label="Joindre des fichiers au message"></label><p class="tiny sub">4 fichiers maximum · 8 Mo chacun · 16 Mo au total, y compris les fichiers transférés.</p><div class="mail-compose-files"></div><p class="mail-compose-status sub" role="status"></p><div class="row">${button('mailSaveDraft','Enregistrer le brouillon')}<button type="submit" class="btn primary mail-review">Vérifier avant envoi</button>${inlineMode?button('mailExpandComposer','Agrandir'):''}</div><section class="mail-send-review" aria-live="polite"></section></form>`;
 }
 function inline(source){const box=$('#mailInline'),d=state(source,'reply');box.innerHTML='<h2>Votre réponse</h2>'+markup(d,source,true);bind(box.querySelector('form'),d,source,false);const field=box.querySelector('textarea');field.focus({preventScroll:true});universalSheets.reveal(field);}
 async function composer(source=null,mode='new',saved=null){
  if(saved?.source_id&&!source)source=await mailApi(base()+`/messages/${saved.source_id}`);if(saved)mode=saved.mode;
  const d=state(source,mode,saved),panel=modal(`<h2>${mode==='new'?'Nouveau message':mode==='reply'?'Votre réponse':'Transférer le message'}</h2>${markup(d,source,false)}`);bind(panel.querySelector('form'),d,source,true);panel.dataset.mailComposer='true';
 }
 function bind(form,d,source,isDocked){
  const formAccount=selected(),formCompany=company.id;
  const formApi=(url,opts)=>{if(formAccount!==selected()||formCompany!==company.id)throw Error('La boîte a changé. Rouvrez votre brouillon.');return mailApi(url,opts);};
  let saved=false,dirty=true,version=0;
  const error=form.querySelector('.mail-compose-status'),review=form.querySelector('.mail-send-review'),baseActions=form.querySelector(':scope > .row');
  const capture=()=>{d.to=form.elements.to.value;d.subject=form.elements.subject.value;d.body=form.elements.body.value;d.forwarded=[...form.querySelectorAll('[name=forwarded]:checked')].map(f=>f.value);};
  function changed(){capture();version++;dirty=true;saved=false;form.classList.remove('is-reviewing');review.replaceChildren();baseActions.hidden=false;error.textContent='Brouillon conservé pendant cette session. Enregistrez-le pour le retrouver après fermeture de l’application.';}
  form.addEventListener('input',changed);form.addEventListener('change',changed);
  function files(){const list=form.querySelector('.mail-compose-files');list.replaceChildren();d.files.forEach((f,i)=>{const row=document.createElement('div');row.className='mail-file-row';const name=document.createElement('span');name.textContent=f.name;const remove=document.createElement('button');remove.type='button';remove.className='btn small';remove.textContent='Retirer';remove.onclick=()=>{d.files.splice(i,1);files();changed();};row.append(name,remove);list.append(row);});}
  form.querySelector('input[type=file]').onchange=async e=>{const chosen=[...e.target.files];e.target.value='';if(d.files.length+chosen.length>4)return error.textContent='4 fichiers maximum.';if(chosen.some(f=>f.size>8*1048576)||chosen.reduce((n,f)=>n+f.size,0)+d.files.reduce((n,f)=>n+Math.floor(f.data.length*3/4),0)>16*1048576)return error.textContent='Limite : 8 Mo par fichier et 16 Mo au total.';try{const loaded=await Promise.all(chosen.map(async f=>({name:f.name,content_type:f.type||'application/octet-stream',data:await fileBase64(f)})));d.files.push(...loaded);files();changed();}catch(e){error.textContent=e.message;}};files();
  async function save(){capture();if(demo())throw Error('Démonstration en lecture seule : aucun brouillon envoyé au fournisseur.');const at=version,payload={id:d.id,revision:d.revision,source_id:d.source_id,mode:d.mode,to:d.to,subject:d.subject,body:d.body,files:d.files,forwarded:d.forwarded};const response=await formApi(unified()+'/drafts',{method:'PUT',body:JSON.stringify(payload)});d.id=response.id;d.revision=response.revision;saved=at===version;dirty=!saved;error.textContent=saved?'Brouillon enregistré. Aucun message envoyé.':'Le brouillon a changé pendant l’enregistrement. Enregistrez à nouveau.';return saved;}
  form.querySelector('#mailSaveDraft').onclick=async()=>{try{await save();}catch(e){error.textContent=e.message;}};
  const expand=form.querySelector('#mailExpandComposer');if(expand)expand.onclick=()=>{capture();form.remove();composer(source,d.mode);};
  form.onsubmit=async e=>{e.preventDefault();if(composeBusy)return;composeBusy=true;try{if(!form.reportValidity())return;if(d.status&&d.status!=='draft')throw Error('Cet envoi est déjà engagé ou à vérifier. Aucun renvoi automatique.');if(!saved||dirty)if(!await save())return;
   form.classList.add('is-reviewing');review.innerHTML=`<div class="mail-confirm"><h3>Vérifiez avant d’envoyer</h3>${accountEmails.get(emailKey())?`<p>De : <strong>${clean(accountEmails.get(emailKey()))}</strong></p>`:''}<p>À : <strong>${clean(d.to)}</strong><br>Objet : ${clean(d.subject)}</p><p>${d.files.length+d.forwarded.length} pièce(s) jointe(s)</p><p class="mail-body">${clean(d.body)}</p>${button('mailEditReview','Modifier le message')}${button('mailConfirmSend','Confirmer et envoyer',true)}</div>`;
   review.querySelector('#mailEditReview').onclick=()=>{form.classList.remove('is-reviewing');review.replaceChildren();baseActions.hidden=false;const field=form.querySelector('textarea');field.focus({preventScroll:true});universalSheets.reveal(field);};
   baseActions.hidden=true;review.querySelector('#mailConfirmSend').classList.add('fg-primary');review.querySelector('#mailConfirmSend').onclick=async e=>{const b=e.currentTarget;b.disabled=true;form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);try{if(!saved||dirty)throw Error('Le texte a changé : vérifiez-le de nouveau.');await formApi(unified()+`/drafts/${d.id}/send`,{method:'POST',body:JSON.stringify({revision:d.revision,confirmed:true})});d.status='sent';drafts.delete(d.key);if(isDocked)closeModal();if(source&&tab==='email')await thread(await formApi(base()+`/messages/${source.id}`));else if(tab==='emails')await renderEmails();notify('Message envoyé.');if(tab==='dashboard')renderPriorities().catch(()=>{});}catch(e){error.textContent=e.message;try{const current=await formApi(unified()+'/drafts/'+d.id);d.status=current.status;}catch{}if(d.status==='draft'){b.disabled=false;form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=false);}}};
   const sc=form.closest('.us-scroll,.context-scroll');if(sc)sc.scrollTop=0;
  }catch(e){error.textContent=e.message;}finally{composeBusy=false;}};
  if(d.status&&d.status!=='draft'){error.textContent=d.status==='sent'?'Message envoyé.':'Envoi engagé ou non confirmé : vérifiez votre dossier Envoyés. Aucun renvoi automatique.';form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);}
 }
 function actions(m){const panel=modal(`<h2>Actions sur l’e-mail</h2><div class="stack">${button('mailMarkRead',m.unread?'Marquer comme lu':'Marquer comme non lu')}${button('mailArchive','Archiver')}${button('mailMove','Déplacer dans un dossier')}</div><p class="sub" role="status" id="mailActionStatus"></p>`);
  const act=async payload=>{try{await mailApi(unified()+`/messages/${m.id}/action`,{method:'POST',body:JSON.stringify(payload)});closeModal();if(tab==='email')await thread(await mailApi(base()+`/messages/${m.id}`));notify('E-mail mis à jour.');if(tab==='dashboard')renderPriorities().catch(()=>{});}catch(e){panel.querySelector('#mailActionStatus').textContent=e.message;}};
  $('#mailMarkRead').onclick=()=>act({action:m.unread?'read':'unread'});$('#mailArchive').onclick=()=>act({action:'archive'});$('#mailMove').onclick=async()=>{try{const folders=await mailApi(unified()+'/folders');const box=panel.querySelector('.stack');box.innerHTML='<label class="field">Dossier<select id="mailTargetFolder">'+folders.map(f=>`<option value="${clean(f.id)}">${clean(f.name)}</option>`).join('')+'</select></label>'+button('mailConfirmMove','Déplacer');box.querySelector('#mailConfirmMove').onclick=()=>act({action:'move',folder_id:box.querySelector('select').value});}catch(e){$('#mailActionStatus').textContent=e.message;}};
 }
 async function openFile(m,index){
  const files=Array.isArray(m.attachments)?m.attachments:JSON.parse(m.attachments||'[]'),meta=files[index];if(!meta)return;
  if(demo())return notify('Exemple fictif : aucune pièce jointe réelle à télécharger.');
  try{const r=await fetch(unified()+`/messages/${m.id}/attachments/${encodeURIComponent(meta.id)}`,{credentials:'same-origin'});if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.detail||'Téléchargement impossible.');}const data=await r.blob(),mime=String(meta.content_type||'application/octet-stream').split(';')[0].trim().toLowerCase(),file=new File([data],meta.filename||'piece-jointe',{type:mime}),url=URL.createObjectURL(file);const p=modal(`<h2>${clean(file.name)}</h2><div class="mail-file-preview"></div>${button('mailSaveFile','Enregistrer ou partager',true)}`),preview=p.querySelector('.mail-file-preview');
   if(/^image\/(png|jpeg|gif|webp)$/.test(mime)){const img=document.createElement('img');img.src=url;img.alt=file.name;preview.append(img);}else if(mime==='application/pdf'){const frame=document.createElement('iframe');frame.src=url;frame.title=file.name;frame.setAttribute('sandbox','');preview.append(frame);}else preview.textContent='Ce format peut être enregistré ou partagé.';
   p.querySelector('#mailSaveFile').onclick=async()=>{try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file]});else{const a=document.createElement('a');a.href=url;a.download=file.name;a.click();}}catch(e){if(e.name!=='AbortError')notify('Partage indisponible. Réessayez.');}};
   const observer=new MutationObserver(()=>{if(!p.isConnected){URL.revokeObjectURL(url);observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
  }catch(e){notify(e.message);}
 }
 return {mailbox,thread,composer,connect,selected,selectAccount,scopedUrl,loadNotification,openNotification};
})();
window.mailClient=mailClient;
