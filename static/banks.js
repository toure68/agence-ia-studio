'use strict';
// 22/10 (user): today's date sits inside the treasury dial (day + month) instead of a tab above the card.
function dialDate(month,m){const t=bankToday();if((m||t.slice(0,7))!==t.slice(0,7))return `<span class="dial-month">${clean(month)}</span>`;
 const wd=new Intl.DateTimeFormat('fr-FR',{weekday:'short',timeZone:'Europe/Paris'}).format(new Date(t+'T12:00:00Z'));
 return `<span class="dial-month dial-today"><small>${clean(wd)}</small><b>${Number(t.slice(8,10))}</b><small>${clean(month)}</small></span>`;}
async function bankTry(action){try{return await action();}catch(error){notify(error.message);}}
function bankSigned(amount,currency){return (amount<0?'−':'+')+' '+quoteMoney(Math.abs(amount),currency);}
function bankAmountClass(amount){return amount<0?'bank-negative':amount>0?'bank-positive':'';}
function bankToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function bankDate(value){return value?value.split('-').reverse().join('/'):'—';}
function bankAmount(value){const n=String(value).trim().replace(/[ \u00a0\u202f]/g,'').replace(',','.');if(!/^-?\d+(?:\.\d{1,2})?$/.test(n))throw Error('Indiquez un montant, par exemple 1 250,00.');return n;}
async function refreshBankViews(){
 if(tab==='treasury')await renderTreasury();else if(tab==='dashboard')await refreshCockpit();
}
async function openBankEditor(id=null){
 const cid=company.id,data=await api(`/api/companies/${cid}/banks`),bank=data.banks.find(b=>b.id===id);
 openModal(`<h2>${bank?'Modifier la banque':'Ajouter une banque'}</h2><form id="bankEditor" class="stack"><div class="field"><label>Nom de la banque<input name="name" maxlength="100" required value="${clean(bank?.name||'')}"></label></div><div class="field"><label>Devise<select name="currency" ${bank?'disabled':''}>${options(['EUR','XOF','USD'],bank?.currency||'EUR')}</select></label></div><div class="field"><label>Solde initial<input name="opening_balance" inputmode="decimal" required value="${bank?(bank.opening_minor/100).toFixed(2).replace('.',','):'0,00'}"></label><small>Solde avant les mouvements enregistrés. Les anciennes opérations « Sans banque » restent à affecter ; ne comptez pas ces montants deux fois.</small></div><div class="field"><label>Argent réservé ou bloqué<input name="reserved" inputmode="decimal" required value="${bank?(bank.reserved_minor/100).toFixed(2).replace('.',','):'0,00'}"></label><small>Hors prélèvements prévus ci-dessous : ils sont réservés automatiquement sous sept jours.</small></div><p class="bank-form-error" role="alert"></p><button class="btn primary" type="submit">Enregistrer la banque</button></form><button class="btn" id="closeBankEditor">Annuler</button>`);
 $('#closeBankEditor').onclick=closeModal;
 $('#bankEditor').onsubmit=async e=>{e.preventDefault();const form=e.target,button=e.submitter;button.disabled=true;try{const payload={name:form.elements.name.value,currency:form.elements.currency.value,opening_balance:bankAmount(form.elements.opening_balance.value),reserved:bankAmount(form.elements.reserved.value)};if(bank)payload.version=bank.version;await api(`/api/companies/${cid}/banks${bank?'/'+bank.id:''}`,{method:bank?'PUT':'POST',body:JSON.stringify(payload)});try{localStorage.setItem(homeTreasuryDemoKey(),'real');}catch{}closeModal();await refreshBankViews();notify('Banque enregistrée.');}catch(error){button.disabled=false;form.querySelector('[role="alert"]').textContent=error.message;}};
}
async function openBankMovement(id,direction='in'){
 const cid=company.id,data=await api(`/api/companies/${cid}/banks`);
 if(!data.banks.length)return openCommand('movement',direction);
 openModal(`<h2>Nouveau mouvement</h2><form id="bankMovement" class="stack"><div class="field"><label>Banque<select name="bank_id" required><option value="">Choisir la banque</option>${data.banks.map(b=>`<option value="${b.id}" ${b.id===id?'selected':''}>${clean(b.name)}</option>`).join('')}</select></label></div><div class="field"><label>Sens<select name="direction">${selectMap({in:'Entrée (+)',out:'Sortie (−)'},direction||'in')}</select></label></div><div class="field"><label>Montant <span id="bankMoveCurrency"></span><input name="amount" inputmode="decimal" required placeholder="0,00"></label></div><div class="field"><label>Motif<input name="label" minlength="2" maxlength="200" required></label></div><div class="field"><label>Date<input name="date" type="date" required value="${bankToday()}"></label></div><p class="bank-form-error" role="alert"></p><button class="btn primary" type="submit">Préparer</button><div id="bankMovementPreview"></div></form><button class="btn" id="closeBankMovement">Annuler</button>`);
 const form=$('#bankMovement'),preview=$('#bankMovementPreview');let payload=null;const operation=crypto.randomUUID();
 const clear=()=>{payload=null;preview.replaceChildren();form.querySelector('[role="alert"]').textContent='';const b=data.banks.find(b=>b.id===Number(form.elements.bank_id.value));$('#bankMoveCurrency').textContent=b?quoteMoney(0,b.currency).replace(/[\d ,.]/g,''):'';};
 form.oninput=clear;form.onchange=clear;clear();$('#closeBankMovement').onclick=closeModal;
 form.onsubmit=e=>{e.preventDefault();try{const bank=data.banks.find(b=>b.id===Number(form.elements.bank_id.value));if(!bank)throw Error('Choisissez une banque.');const amount=bankAmount(form.elements.amount.value);if(Number(amount)<=0)throw Error('Le montant doit être positif.');payload={bank_id:bank.id,currency:bank.currency,direction:form.elements.direction.value,amount,label:form.elements.label.value,date:form.elements.date.value,operation_id:operation};preview.innerHTML=`<article class="task-detail"><strong>${clean(bank.name)} · ${payload.direction==='in'?'Entrée':'Sortie'}</strong><p>${clean(quoteMoney(Math.round(Number(amount)*100),bank.currency))} · ${bankDate(payload.date)}</p><button type="button" class="btn primary" id="confirmBankMovement">Confirmer l’enregistrement</button></article>`;$('#confirmBankMovement').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await api(`/api/companies/${cid}/treasury`,{method:'POST',body:JSON.stringify(payload)});closeModal();await refreshBankViews();notify('Mouvement enregistré sur '+bank.name+'.');}catch(error){button.disabled=false;form.querySelector('[role="alert"]').textContent=error.message;}};}catch(error){form.querySelector('[role="alert"]').textContent=error.message;}};
}
async function openBankFunding(targetId){
 const cid=company.id,data=await api(`/api/companies/${cid}/banks`),target=data.banks.find(b=>b.id===Number(targetId));if(!target)return;
 const sources=data.banks.filter(b=>b.id!==target.id&&b.currency===target.currency&&b.available_minor>0).sort((a,b)=>b.available_minor-a.available_minor);
 if(!sources.length){openModal(`<h2>Approvisionner ${clean(target.name)}</h2><p>Aucune autre banque dans cette devise ne dispose d’un montant disponible. Vous pouvez enregistrer une entrée sur ce compte.</p><button class="btn primary" id="fundByEntry">+ Entrée</button><button class="btn" id="cancelBankFunding">Fermer</button>`);$('#fundByEntry').onclick=()=>openBankMovement(target.id,'in');$('#cancelBankFunding').onclick=closeModal;return;}
 openModal(`<h2>Approvisionner ${clean(target.name)}</h2><p>Besoin : ${clean(quoteMoney(target.shortfall_minor,target.currency))} pour couvrir le découvert, les réserves et les prélèvements sous sept jours.</p><form id="bankFunding" class="stack"><div class="field"><label>Banque source<select name="source_id">${sources.map(b=>`<option value="${b.id}">${clean(b.name)} · ${clean(quoteMoney(b.available_minor,b.currency))} disponibles</option>`).join('')}</select></label></div><div class="field"><label>Montant à transférer<input name="amount" inputmode="decimal" required value="${(Math.min(target.shortfall_minor||sources[0].available_minor,sources[0].available_minor)/100).toFixed(2).replace('.',',')}"></label></div><p class="tiny sub">L’application ne déclenche aucun virement bancaire. Enregistrez ce transfert interne après avoir effectué le virement auprès de votre banque.</p><p class="bank-form-error" role="alert"></p><button class="btn primary" type="submit">Virement effectué : enregistrer</button></form><button class="btn" id="cancelBankFunding">Annuler</button>`);
 $('#cancelBankFunding').onclick=closeModal;const operation=crypto.randomUUID();
 $('#bankFunding').onsubmit=async e=>{e.preventDefault();const form=e.target,button=e.submitter;button.disabled=true;try{await api(`/api/companies/${cid}/bank-transfers`,{method:'POST',body:JSON.stringify({source_id:Number(form.elements.source_id.value),target_id:target.id,amount:bankAmount(form.elements.amount.value),operation_id:operation,confirmed:true})});closeModal();await refreshBankViews();notify('Transfert interne enregistré ; le solde total est conservé.');}catch(error){button.disabled=false;form.querySelector('[role="alert"]').textContent=error.message;}};
}
async function openBankDebit(){
 const cid=company.id,data=await api(`/api/companies/${cid}/banks`);if(!data.banks.length)return openBankEditor();
 openModal(`<h2>Prévoir un prélèvement</h2><form id="bankDebit" class="stack"><div class="field"><label>Banque<select name="bank_id">${data.banks.map(b=>`<option value="${b.id}">${clean(b.name)} · ${b.currency==='EUR'?'€':b.currency==='XOF'?'FCFA':'$'}</option>`).join('')}</select></label></div><div class="field"><label>Motif<input name="label" minlength="2" maxlength="200" required></label></div><div class="field"><label>Montant<input name="amount" inputmode="decimal" required placeholder="0,00"></label></div><div class="field"><label>Date prévue<input name="due" type="date" value="${bankToday()}" required></label></div><p class="tiny sub">Ce montant entre dans le non disponible lorsqu’il est prévu sous sept jours, y compris en retard. Aucun débit réel n’est déclenché.</p><p class="bank-form-error" role="alert"></p><button class="btn primary" type="submit">Enregistrer le prélèvement prévu</button></form><button class="btn" id="cancelBankDebit">Annuler</button>`);
 $('#cancelBankDebit').onclick=closeModal;const operation=crypto.randomUUID();
 $('#bankDebit').onsubmit=async e=>{e.preventDefault();const f=e.target,b=e.submitter;b.disabled=true;try{await api(`/api/companies/${cid}/bank-debits`,{method:'POST',body:JSON.stringify({bank_id:Number(f.elements.bank_id.value),label:f.elements.label.value,amount:bankAmount(f.elements.amount.value),due:f.elements.due.value,operation_id:operation})});closeModal();await refreshBankViews();notify('Prélèvement prévu enregistré.');}catch(error){b.disabled=false;f.querySelector('[role="alert"]').textContent=error.message;}};
}
function confirmBankDebit(debit){
 const cid=company.id;
 openModal(`<h2>Prélèvement effectué ?</h2><p>${clean(debit.bank_name)} · ${clean(debit.label)} · ${clean(quoteMoney(debit.amount_minor,debit.currency))}</p><p>Confirmez uniquement si le débit a réellement eu lieu. Il sera alors enregistré une seule fois dans les sorties de cette banque.</p><button class="btn primary" id="confirmPaidDebit">Confirmer le débit effectué</button><button class="btn" id="cancelPaidDebit">Annuler</button>`);
 $('#cancelPaidDebit').onclick=closeModal;$('#confirmPaidDebit').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{await api(`/api/companies/${cid}/bank-debits/${debit.id}/paid`,{method:'POST',body:JSON.stringify({confirmed:true})});closeModal();await refreshBankViews();notify('Prélèvement enregistré dans les sorties.');}catch(error){b.disabled=false;notify(error.message);}};
}
function cancelBankDebit(debit){
 const cid=company.id;openModal(`<h2>Annuler cette prévision ?</h2><p>${clean(debit.bank_name)} · ${clean(debit.label)} · ${clean(quoteMoney(debit.amount_minor,debit.currency))}</p><p>Le montant ne sera plus réservé. Aucun mouvement d’argent ne sera créé.</p><button class="btn primary" id="confirmCancelDebit">Annuler la prévision</button><button class="btn" id="keepDebit">Conserver</button>`);
 $('#keepDebit').onclick=closeModal;$('#confirmCancelDebit').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{await api(`/api/companies/${cid}/bank-debits/${debit.id}/cancel`,{method:'POST',body:JSON.stringify({confirmed:true})});closeModal();await refreshBankViews();notify('Prévision annulée.');}catch(error){b.disabled=false;notify(error.message);}};
}
async function assignBankMovement(movement){
 const cid=company.id,data=await api(`/api/companies/${cid}/banks`),banks=data.banks.filter(b=>b.currency===movement.currency);
 if(!banks.length)return openBankEditor();
 openModal(`<h2>Affecter à une banque</h2><p>${clean(movement.label)} · ${clean(quoteMoney(movement.amount_minor,movement.currency))}</p><form id="assignBankMovement" class="stack"><div class="field"><label>Banque<select name="bank_id">${banks.map(b=>`<option value="${b.id}">${clean(b.name)}</option>`).join('')}</select></label></div><p class="tiny sub">Cette affectation conserve le montant et le solde général.</p><p class="bank-form-error" role="alert"></p><button class="btn primary" type="submit">Confirmer l’affectation</button></form><button class="btn" id="cancelAssignment">Annuler</button>`);
 $('#cancelAssignment').onclick=closeModal;$('#assignBankMovement').onsubmit=async e=>{e.preventDefault();const f=e.target,b=e.submitter;b.disabled=true;try{await api(`/api/companies/${cid}/treasury/${movement.id}/bank`,{method:'PUT',body:JSON.stringify({bank_id:Number(f.elements.bank_id.value),confirmed:true})});closeModal();await refreshBankViews();notify('Mouvement affecté à la banque.');}catch(error){b.disabled=false;f.querySelector('[role="alert"]').textContent=error.message;}};
}

// Treasury page: bank list, planned debits and per-movement bank labels (no wheel).
function enhanceTreasuryPage(data){
 const content=$('#content');if(!content||!content.querySelector('.heading'))return;
 const banks=data.banks||[],debits=data.debits||[];
 content.querySelector('.heading').insertAdjacentHTML('afterend',`<div class="bank-ledger-controls"><button class="btn" id="addLedgerBank">＋ Banque</button>${banks.length?'<button class="btn" id="planBankDebit">Prélèvement prévu</button>':''}</div><section class="bank-ledger-list" aria-label="Vos banques">${banks.map((b,i)=>`<article class="card bank-ledger-card"><span class="bank-pill bank-pill-static" style="--bank-color:${bankColor(i)}" aria-hidden="true">${bankPillFace(b)}</span><span class="bank-ledger-copy"><strong>${clean(b.name)}</strong><small>Solde ${clean(quoteMoney(b.balance_minor,b.currency))} · Disponible <b class="${bankAmountClass(b.available_minor)}">${clean(quoteMoney(b.available_minor,b.currency))}</b></small></span><button type="button" class="btn small" data-bank-logo="${b.id}">Logo</button><button type="button" class="btn small" data-edit-bank="${b.id}">Modifier</button></article>`).join('')||'<p class="empty">Ajoutez votre première banque pour suivre chaque compte séparément.</p>'}</section>${debits.length?`<section class="bank-debit-list"><h2>Prélèvements prévus</h2>${debits.map(d=>`<article class="task-row"><span><strong>${clean(d.bank_name)} · ${clean(d.label)}</strong><small>${bankDate(d.due)} · ${clean(quoteMoney(d.amount_minor,d.currency))}</small></span><button class="btn small" data-pay-bank-debit="${d.id}">Débit effectué</button><button class="btn small" data-cancel-bank-debit="${d.id}">Annuler la prévision</button></article>`).join('')}</section>`:''}`);
 $('#addLedgerBank').onclick=()=>bankTry(()=>openBankEditor());
 const plan=$('#planBankDebit');if(plan)plan.onclick=()=>bankTry(openBankDebit);
 content.querySelectorAll('[data-edit-bank]').forEach(b=>b.onclick=()=>bankTry(()=>openBankEditor(Number(b.dataset.editBank))));
 content.querySelectorAll('[data-bank-logo]').forEach(b=>b.onclick=()=>openBankLogo(banks.find(x=>x.id===Number(b.dataset.bankLogo))));
 content.querySelectorAll('[data-pay-bank-debit]').forEach(b=>b.onclick=()=>confirmBankDebit(debits.find(d=>d.id===Number(b.dataset.payBankDebit))));
 content.querySelectorAll('[data-cancel-bank-debit]').forEach(b=>b.onclick=()=>cancelBankDebit(debits.find(d=>d.id===Number(b.dataset.cancelBankDebit))));
 content.querySelectorAll('.treasury-list .task-row').forEach((row,i)=>{const m=data.movements[i];if(!m)return;const label=row.querySelector('small');if(label)label.textContent+=' · '+(m.bank_name||'Sans banque')+(m.transfer_id?' · Transfert interne':'');if(!m.bank_id&&banks.length){const button=document.createElement('button');button.type='button';button.className='btn small';button.textContent='Affecter à une banque';button.onclick=()=>assignBankMovement(m);row.append(button);}});
 const add=$('#cashAdd');if(add&&banks.length)add.onclick=()=>bankTry(()=>openBankMovement(null,'in'));
}

// Home card: bank pills. "Tous" is always the default view.
const bankHomeSelection=new Map();
const bankPalette=['#14765a','#246ca5','#7253a0','#a0612b','#2b7f8f','#8f2b55'];
function bankColor(index){return bankPalette[index%bankPalette.length];}
function bankInitials(name){return String(name).replace(/^Banque\s+/i,'').split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'?';}
function bankHomeKey(){return (me?.id||'')+'-'+(company?.id||'');}
function bankHomeSelected(banks){const id=bankHomeSelection.get(bankHomeKey());return banks.some(b=>String(b.id)===String(id))?String(id):'all';}
function bankShortDate(value){if(!value)return '';const tomorrow=new Date(bankToday()+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);if(value===tomorrow.toISOString().slice(0,10))return 'demain';if(value===bankToday())return 'aujourd’hui';return 'le '+bankDate(value).slice(0,5);}
// Home treasury dial (Apple Watch Ultra–style face): read-only, compact, identical size for "Toutes" and each bank.
let bankHomeTab='last';
const bankDialShown=new Map();
function bankDialShort(name){return String(name||'').replace(/^Banque\s+/i,'');}
function bankDialDay(value,future){
 if(!value)return '';
 const today=bankToday(),day=(a,b)=>Math.round((new Date(a+'T12:00:00Z')-new Date(b+'T12:00:00Z'))/86400000),diff=day(value,today);
 if(diff===0)return 'auj.';
 if(diff===1)return 'demain';
 if(diff===-1)return 'hier';
 if(future&&diff>1&&diff<=14)return 'dans '+diff+' j';
 return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'Europe/Paris'}).format(new Date(value+'T12:00:00Z'));
}
function bankDialRisk(bank,debit){return !!bank&&bank.shortfall_minor>0&&!!bank.next_due&&debit.due<=bank.next_due;}
function bankDialRows(treasury,bank,tab){
 const banks=treasury.banks||[],owner=id=>banks.find(b=>String(b.id)===String(id));
 if(tab==='next'){
  const items=(treasury.debits||[]).filter(d=>!bank||String(d.bank_id)===String(bank.id)).sort((a,c)=>String(a.due).localeCompare(String(c.due))).slice(0,3);
  if(!items.length)return '<li class="dial-empty">Aucun prélèvement prévu</li>';
  return items.map((d,i)=>{const o=owner(d.bank_id),risk=bankDialRisk(o,d),where=!bank&&o?'<span class="dial-where"> · '+clean(bankDialShort(o.name))+'</span>':'';return `<li class="bank-row dial-row is-next${risk?' is-risk':''}" style="--i:${i}"><span class="dial-dot" aria-hidden="true"></span><span class="dial-label" title="${clean(d.label)}">${clean(d.label)}</span><small>${risk?'à couvrir · ':''}${clean(bankDialDay(d.due,true))}${where}</small><b>${clean(bankSigned(-d.amount_minor,d.currency||o?.currency||'EUR'))}</b></li>`;}).join('');
 }
 const items=(bank?(bank.latest||[]).map(m=>({...m,bank})):banks.flatMap(b=>(b.latest||[]).map(m=>({...m,bank:b})))).sort((a,c)=>String(c.date).localeCompare(String(a.date))||(Number(c.id)||0)-(Number(a.id)||0)).slice(0,3);
 if(!items.length)return '<li class="dial-empty">Aucune opération enregistrée</li>';
 return items.map((m,i)=>{const incoming=m.direction==='in',where=!bank?'<span class="dial-where"> · '+clean(bankDialShort(m.bank.name))+'</span>':'';return `<li class="bank-row dial-row ${incoming?'is-in':'is-out'}" style="--i:${i}"><span class="dial-dot" aria-hidden="true"></span><span class="dial-label" title="${clean(m.label)}">${clean(m.label)}</span><small><time datetime="${clean(m.date)}">${clean(bankDialDay(m.date))}</time>${where}</small><b class="${incoming?'bank-positive':'bank-negative'}">${clean(bankSigned(incoming?m.amount_minor:-m.amount_minor,m.currency))}</b></li>`;}).join('');
}
function bankDialTab(bank){return bankHomeTab==='alert'&&!(bank&&bank.shortfall_minor>0)?'last':bankHomeTab;}
function bankDialAlert(treasury,bank){
 const banks=treasury.banks||[],due=(treasury.debits||[]).filter(d=>String(d.bank_id)===String(bank.id)&&bank.next_due&&d.due<=bank.next_due);
 const source=banks.filter(b=>b.id!==bank.id&&b.currency===bank.currency&&b.available_minor>=bank.shortfall_minor).sort((a,c)=>c.available_minor-a.available_minor)[0];
 const when=bank.next_due?' · prélèvement '+bankShortDate(bank.next_due):'';
 return `<div class="bank-home-alert dial-alert" role="status"><p>Manque <strong>${clean(quoteMoney(bank.shortfall_minor,bank.currency))}</strong>${when}${due.length>1?' ('+due.length+')':''}</p><button type="button" class="bank-fund" data-bank-fund="${bank.id}" aria-label="Approvisionner ${clean(bank.name)} de ${clean(quoteMoney(bank.shortfall_minor,bank.currency))}${source?' depuis '+clean(source.name):''}">${source?`Approvisionner depuis ${clean(bankDialShort(source.name))}`:'Approvisionner cette banque'}</button></div>`;
}
function bankDialPanel(treasury,bank){const tab=bankDialTab(bank);return tab==='alert'?bankDialAlert(treasury,bank):`<ul class="dial-list" aria-live="polite">${bankDialRows(treasury,bank,tab)}</ul>`;}
function bankDialTabs(treasury,bank){
 const current=bankDialTab(bank),debits=(treasury.debits||[]).filter(d=>!bank||String(d.bank_id)===String(bank.id)),risk=debits.some(d=>bankDialRisk((treasury.banks||[]).find(b=>String(b.id)===String(d.bank_id)),d));
 const tab=(id,label,extra='')=>`<button type="button" class="dial-tab" data-dial-tab="${id}" aria-pressed="${current===id}">${label}${extra}</button>`;
 return `<div class="dial-tabs" role="group" aria-label="Opérations">${tab('last','Derniers')}${tab('next','À venir',debits.length?`<span class="dial-tab-dot${risk?' is-risk':''}" aria-label="${debits.length} prélèvement${debits.length>1?'s':''} prévu${debits.length>1?'s':''}${risk?', dont un à couvrir':''}"></span>`:'')}<button type="button" class="dial-more bank-view-all" data-bank-all title="Ouvrir la Trésorerie${bank?' de '+clean(bankDialShort(bank.name)):''}">Voir tout →</button></div><div class="dial-panel">${bankDialPanel(treasury,bank)}</div>`;
}
function bankDialCount(key,minor,currency){return `<span data-dial-count="${Number(minor)||0}" data-dial-key="${key}" data-dial-currency="${clean(currency)}">${clean(quoteMoney(minor,currency))}</span>`;}
// Folded by default: health ring, balance, month in/out (and any alert, always). A tap on the top unfolds
// the full dial (tabs, banks); the choice is kept on this device.
const bankFoldKey='aia-treasury-open';
function bankDialOpen(){try{return localStorage.getItem(bankFoldKey)==='1';}catch{return false;}}
function bankDialSetOpen(host,open){try{localStorage.setItem(bankFoldKey,open?'1':'0');}catch{}bankHomeRepaint(host);host.querySelector('[data-dial-fold]')?.focus({preventScroll:true});}
function bankHomeMarkup(treasury){
 const banks=treasury.banks||[],selected=bankHomeSelected(banks),bank=banks.find(b=>String(b.id)===selected);
 const alerts=banks.filter(b=>b.shortfall_minor>0);
 const currencies=Object.keys(treasury.balances_minor||{}),multi=!bank&&currencies.length>1,main=bank?bank.currency:(currencies[0]||banks[0]?.currency||'EUR');
 const pick=map=>Number((map||{})[main]||0);
 const balanceMinor=bank?bank.balance_minor:pick(treasury.balances_minor),inMinor=bank?(bank.month_inflows_minor||0):pick(treasury.month_inflows_minor),outMinor=bank?(bank.month_outflows_minor||0):pick(treasury.month_outflows_minor);
 const negative=bank?bank.shortfall_minor>0:balanceMinor<0;
 const list=map=>Object.entries(map||{}).map(([c,a])=>clean(quoteMoney(a,c))).join(' · ')||clean(quoteMoney(0));
 const balance=`<strong class="bank-total${negative?' bank-negative':''}${multi?' is-multi':''}">${multi?list(treasury.balances_minor):bankDialCount('balance',balanceMinor,main)}</strong>`;
 const flows=`<p class="dial-flows"><span class="bank-positive"><span aria-hidden="true">↓ </span><span class="sr-only">Entrées du mois </span>${multi?list(treasury.month_inflows_minor):bankDialCount('in',inMinor,main)}</span><span class="bank-negative"><span aria-hidden="true">↑ </span><span class="sr-only">Sorties du mois </span>${multi?list(treasury.month_outflows_minor):bankDialCount('out',outMinor,main)}</span></p>`;
 const max=Math.max(inMinor,outMinor,1),share=v=>Math.round(Math.min(1,v/max)*92);
 const arc=(cls,r,v)=>`<circle class="dial-arc ${cls}${v?'':' is-empty'}" cx="42" cy="42" r="${r}" pathLength="100" style="--dial:${100-share(v)}"/>`;
 const month=new Intl.DateTimeFormat('fr-FR',{month:'short',timeZone:'Europe/Paris'}).format(new Date((treasury.month||bankToday().slice(0,7))+'-15T12:00:00Z'));
 const ring=`<div class="dial-ring-wrap" aria-hidden="true"><svg class="dial-ring" viewBox="0 0 84 84"><circle class="dial-track" cx="42" cy="42" r="37"/>${arc('dial-arc-in',37,inMinor)}<circle class="dial-track dial-track-inner" cx="42" cy="42" r="27"/>${arc('dial-arc-out',27,outMinor)}</svg>${dialDate(month,treasury.month)}</div>`;
 let status;
 if(bank)status=bank.shortfall_minor>0?'<span class="dial-status is-alert"><i class="dial-pulse" aria-hidden="true"></i><span>Alerte</span></span>':'<span class="dial-status is-ok"><i class="dial-pulse" aria-hidden="true"></i><span>À jour</span></span>';
 else if(alerts.length){const a=alerts[0];status=`<button type="button" class="dial-status is-alert bank-global-alert" data-bank-pill="${a.id}" aria-label="Alerte : ${clean(a.name)} à ${clean(bankSigned(a.available_minor,a.currency))}${a.next_due?', prélèvement '+bankShortDate(a.next_due):''}"><i class="dial-pulse" aria-hidden="true"></i><span>${clean(bankDialShort(a.name))}${a.next_due?' · '+bankShortDate(a.next_due):''}${alerts.length>1?' +'+(alerts.length-1):''}</span></button>`;}
 else status='<span class="dial-status is-ok"><i class="dial-pulse" aria-hidden="true"></i><span>À jour</span></span>';
 const open=bankDialOpen(),body=open?bankDialTabs(treasury,bank):'';
 const alertBank=bank?(bank.shortfall_minor>0?bank:null):alerts[0];
 const foldAlert=!open&&alertBank?`<div class="dial-fold-alert">${bankDialAlert(treasury,alertBank)}</div>`:'';
 const toggle=`<button type="button" class="dial-fold-toggle" data-dial-fold aria-expanded="${open}" aria-label="${open?'Replier':'Déplier'} la trésorerie" title="${open?'Replier':'Déplier'}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
 const pills=`<div class="bank-pills" role="group" aria-label="Choisir une banque"><button type="button" class="bank-pill bank-pill-all" data-bank-pill="all" aria-pressed="${!bank}" aria-label="Toutes les banques" title="Toutes les banques"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/></svg></button>${banks.map((b,i)=>`<button type="button" class="bank-pill" data-bank-pill="${b.id}" style="--bank-color:${bankColor(i)}" aria-pressed="${String(b.id)===selected}" aria-label="${clean(b.name)}${b.shortfall_minor>0?' · Alerte : solde insuffisant':''}" title="${clean(b.name)}">${bankPillFace(b)}${b.shortfall_minor>0?'<span class="bank-pill-dot" aria-hidden="true"></span>':''}</button>`).join('')}<button type="button" class="bank-pill bank-pill-add" data-bank-add aria-label="Ajouter une banque" title="Ajouter une banque"><span aria-hidden="true">＋</span></button></div>`;
 const back=bank?'<button type="button" class="bank-fold bank-back" data-bank-pill="all" aria-label="Revenir à toutes les banques"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 4.5 7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>':'';
 queueMicrotask(()=>bankDialAnimate(document.querySelector('#homeTreasury')));
 return `<article class="home-treasury bank-home bank-dial${bank?' is-bank':''}${open?'':' is-folded'}" data-bank-selected="${clean(selected)}"><div class="home-treasury-top dial-head">${back}<h2 class="bank-home-title"><span class="treasury-label">Trésorerie</span><span class="bank-home-name" title="${clean(bank?bank.name:'Toutes les banques')}">${clean(bank?bankDialShort(bank.name):'Toutes')}</span></h2>${status}${toggle}</div><div class="dial-mid">${ring}<div class="dial-balance"><span class="sr-only">Solde</span>${balance}${flows}</div></div>${open?`<div class="dial-body">${body}</div><div class="dial-foot">${pills}</div>`:foldAlert}</article>`;
}
function bankDialReduced(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{return false;}}
function bankDialAnimate(host){
 // Amounts tick from the previously shown value to the new one; final text is already correct in the markup.
 if(!host)return;const reduce=bankDialReduced();
 host.querySelectorAll('[data-dial-count]').forEach(el=>{
  const key=el.dataset.dialKey+'-'+el.dataset.dialCurrency,to=Number(el.dataset.dialCount),currency=el.dataset.dialCurrency,from=bankDialShown.has(key)?bankDialShown.get(key):0;
  bankDialShown.set(key,to);if(reduce||from===to)return;
  const start=performance.now(),duration=700;
  const step=now=>{if(!el.isConnected)return;const k=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-k,3);el.textContent=quoteMoney(k<1?Math.round(from+(to-from)*ease):to,currency);if(k<1)requestAnimationFrame(step);};
  el.textContent=quoteMoney(from,currency);requestAnimationFrame(step);
 });
}
function bankHomeRepaint(host,focus){
 if(!host?.treasuryState)return;host.innerHTML=homeTreasuryMarkup(host.treasuryState);
 if(focus){const pill=host.querySelector(`[data-bank-pill="${focus}"].bank-pill`);if(pill)pill.focus({preventScroll:true});}
}
function bankHomeSelect(host,id){
 const banks=host.treasuryState?.widgets?.treasury?.banks||[],current=bankHomeSelected(banks);
 const next=id!=='all'&&String(id)===current?'all':String(id),bank=banks.find(b=>String(b.id)===next);
 bankHomeTab=bank&&bank.shortfall_minor>0?'alert':'last';
 bankHomeSelection.set(bankHomeKey(),next);bankHomeRepaint(host,next);
}
function bankHomeShowTab(host,tab){
 const treasury=host.treasuryState?.widgets?.treasury;if(!treasury)return;
 bankHomeTab=tab==='next'?'next':'last';
 const bank=(treasury.banks||[]).find(b=>String(b.id)===bankHomeSelected(treasury.banks||[]));
 host.querySelectorAll('[data-dial-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dialTab===bankHomeTab)));
 const panel=host.querySelector('.dial-panel');if(panel)panel.innerHTML=bankDialPanel(treasury,bank);
}
document.addEventListener('click',e=>{
 const host=e.target.closest('#homeTreasury');if(!host||!host.querySelector('.bank-home'))return;
 const pill=e.target.closest('[data-bank-pill]'),add=e.target.closest('[data-bank-add]'),fund=e.target.closest('[data-bank-fund]'),all=e.target.closest('[data-bank-all]'),tab=e.target.closest('[data-dial-tab]');
 // Fold/unfold: the chevron, or a tap anywhere on the top of the dial (title, ring, balance) outside its buttons.
 const fold=e.target.closest('[data-dial-fold]')||(!e.target.closest('button,a')&&e.target.closest('.bank-dial .dial-head,.bank-dial .dial-mid'));
 if(!pill&&!add&&!fund&&!all&&!tab&&!fold)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(fold&&!pill)return bankDialSetOpen(host,!bankDialOpen());
 if(tab)return bankHomeShowTab(host,tab.dataset.dialTab);
 if(pill)return bankHomeSelect(host,pill.dataset.bankPill);
 if(add)return bankTry(()=>openBankEditor());
 if(fund)return bankTry(()=>openBankFunding(Number(fund.dataset.bankFund)));
 return bankTry(()=>openTab('treasury'));
},true);
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape'||document.querySelector('#modalLayer:not(.hide)'))return;
 const host=document.querySelector('#homeTreasury');if(!host?.querySelector('.bank-home[data-bank-selected]:not([data-bank-selected="all"])'))return;
 e.preventDefault();bankHomeTab='last';bankHomeSelection.set(bankHomeKey(),'all');bankHomeRepaint(host,'all');
});

// Bank logos: uploaded by the user for their own accounts, re-cropped server-side, never part of the code.
function bankPillFace(b){if(typeof b.demo_face==='string')return b.demo_face; // public demo only: repo-owned SVG
 return b.logo&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.logo)?`<img class="bank-pill-logo" src="${b.logo}" alt="">`:`<span aria-hidden="true">${clean(bankInitials(b.name))}</span>`;}
async function bankSquareImage(file){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Choisissez une image PNG, JPEG ou WebP.');
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Image illisible.'));i.src=url;});
  const side=Math.min(image.naturalWidth,image.naturalHeight),canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  canvas.getContext('2d').drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,256,256);
  return canvas.toDataURL('image/png');
 }finally{URL.revokeObjectURL(url);}
}
function openBankLogo(bank){
 if(!bank)return;const cid=company.id;
 openModal(`<h2>Logo · ${clean(bank.name)}</h2><p class="tiny sub">Image privée, visible uniquement dans votre entreprise. Conseil : le symbole seul, sans texte, reste net en petit.</p><div class="bank-logo-preview"><span class="bank-pill bank-pill-static" id="bankLogoPreview">${bankPillFace(bank)}</span></div><div class="field"><label for="bankLogoFile">Choisir une image</label><input id="bankLogoFile" type="file" accept="image/png,image/jpeg,image/webp"></div><p class="bank-form-error" role="alert"></p><button class="btn primary" id="saveBankLogo" type="button">Enregistrer le logo</button>${bank.logo?'<button class="btn" id="removeBankLogo" type="button">Retirer le logo</button>':''}<button class="btn" id="closeBankLogo" type="button">Fermer</button>`);
 let image=null;const error=document.querySelector('#modalLayer .bank-form-error');
 $('#closeBankLogo').onclick=closeModal;
 $('#bankLogoFile').onchange=async e=>{error.textContent='';const file=e.target.files[0];if(!file)return;try{image=await bankSquareImage(file);$('#bankLogoPreview').innerHTML=`<img class="bank-pill-logo" src="${image}" alt="">`;}catch(err){image=null;error.textContent=err.message;}};
 $('#saveBankLogo').onclick=async e=>{if(!image){error.textContent='Choisissez d’abord une image.';return;}const button=e.currentTarget;button.disabled=true;try{await api(`/api/companies/${cid}/banks/${bank.id}/logo`,{method:'PUT',body:JSON.stringify({image})});closeModal();await refreshBankViews();notify('Logo enregistré.');}catch(err){button.disabled=false;error.textContent=err.message;}};
 const remove=$('#removeBankLogo');if(remove)remove.onclick=async e=>{const button=e.currentTarget;button.disabled=true;try{await api(`/api/companies/${cid}/banks/${bank.id}/logo`,{method:'DELETE'});closeModal();await refreshBankViews();notify('Logo retiré.');}catch(err){button.disabled=false;error.textContent=err.message;}};
}
