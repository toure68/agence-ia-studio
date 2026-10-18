'use strict';
if(document.body.dataset.publicDemo==='true'){
 // One configuration table: bank identity, logo, color and synthetic data.
 // Logo markup is trusted, repo-owned SVG; never customer-supplied HTML.
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const month=today.slice(0,7),day=Number(today.slice(-2));
 const date=n=>month+'-'+String(Math.min(day,n)).padStart(2,'0');
 const tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 const dueDate=tomorrow.toISOString().slice(0,10);
 const svg=path=>`<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
 const banks=[
  {id:'horizon',name:'Banque Horizon',logo:svg('<path d="M3 16h18M5 12a7 7 0 0 1 14 0M12 2v2M3 6l2 2m16-2-2 2M7 21h10"/>'),color:'#14765a',data:{opening:0,payments:[],transactions:[
   {date:date(18),label:'Règlement client Atelier',amount:900000},{date:date(15),label:'Fournitures',amount:-60000},{date:date(12),label:'Règlement client Bureaux',amount:600000},{date:date(8),label:'Abonnement professionnel',amount:-40000},{date:date(3),label:'Règlement client Résidence',amount:400000}
  ]}},
  {id:'rivage',name:'Banque Rivage',logo:svg('<path d="M3 8c3-5 6 5 9 0s6 5 9 0M3 14c3-5 6 5 9 0s6 5 9 0M3 20c3-5 6 5 9 0s6 5 9 0"/>'),color:'#246ca5',data:{opening:0,payments:[{date:dueDate,label:'Assurance professionnelle',amount:65000}],transactions:[
   {date:date(18),label:'Charges sociales',amount:-135000},{date:date(16),label:'Règlement client',amount:150000},{date:date(13),label:'Fournitures',amount:-60000},{date:date(9),label:'Règlement client',amount:50000},{date:date(4),label:'Abonnement',amount:-40000}
  ]}},
  {id:'atlas',name:'Banque Atlas',logo:null,color:'#7253a0',data:{opening:0,payments:[],transactions:[
   {date:date(17),label:'Règlement client Hôtel',amount:420000},{date:date(14),label:'Équipement',amount:-70000},{date:date(11),label:'Règlement client Commerce',amount:250000},{date:date(7),label:'Transport',amount:-30000},{date:date(2),label:'Règlement client Cabinet',amount:150000}
  ]}}
 ];
 let selected='all',feedback='',gesture=null;
 const format=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(n/100).replace(/[\u00a0\u202f]/g,' ');
 const signed=n=>(n<0?'−':'+')+' '+format(Math.abs(n));
 const shortDate=d=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',timeZone:'Europe/Paris'}).format(new Date(d+'T12:00:00Z'));
 const period=new Intl.DateTimeFormat('fr-FR',{month:'long',timeZone:'Europe/Paris'}).format(new Date(today+'T12:00:00Z'));
 const totals=b=>({balance:b.data.opening+b.data.transactions.reduce((s,t)=>s+t.amount,0),incoming:b.data.transactions.filter(t=>!t.internal&&t.date.startsWith(month)&&t.amount>0).reduce((s,t)=>s+t.amount,0),outgoing:-b.data.transactions.filter(t=>!t.internal&&t.date.startsWith(month)&&t.amount<0).reduce((s,t)=>s+t.amount,0)});
 const upcoming=b=>b.data.payments.filter(p=>p.date>=today&&p.date<=new Date(new Date(today+'T12:00:00Z').getTime()+7*86400000).toISOString().slice(0,10));
 const shortage=b=>Math.max(0,upcoming(b).reduce((s,p)=>s+p.amount,0)-totals(b).balance);
 const donorFor=b=>banks.filter(d=>d.id!==b.id&&totals(d).balance-upcoming(d).reduce((s,p)=>s+p.amount,0)>=shortage(b)).sort((a,c)=>totals(c).balance-totals(a).balance)[0];
 const initial=b=>b.name.replace(/^Banque\s+/i,'').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
 const latest=b=>b.data.transactions.map((t,i)=>({...t,i})).sort((a,c)=>c.date.localeCompare(a.date)||a.i-c.i);
 const rows=items=>items.map(t=>`<div class="demo-bank-row" data-demo-movement><time datetime="${t.date}">${shortDate(t.date)}</time><span title="${clean(t.label)}">${clean(t.label)}</span><b class="${t.amount<0?'demo-negative':'demo-positive'}">${signed(t.amount)}</b></div>`).join('');
 const css=document.createElement('style');css.textContent=`
 #homeTreasury .demo-bank-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 #homeTreasury .demo-bank-pills{display:flex;gap:12px;overflow-x:auto;padding:6px 4px;margin:8px 0 0;scrollbar-width:thin;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
 #homeTreasury .demo-bank-pill{position:relative;display:flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;flex:0 0 44px;scroll-snap-align:start;border:1px solid #ffffff26;border-radius:13px;background:var(--bank-color,#171d22);color:#fff;padding:0;font:700 15px Manrope,sans-serif;cursor:pointer;box-sizing:border-box}
 #homeTreasury .demo-bank-pill[data-demo-bank=all]{color:var(--home-gold)}
 #homeTreasury .demo-bank-pill[aria-pressed=true]{outline:2px solid #16975b;outline-offset:2px}
 #homeTreasury .demo-bank-dot{position:absolute;right:-1px;top:-1px;width:9px;height:9px;border-radius:50%;background:#d33847;border:2px solid #101318;box-sizing:content-box}
 #homeTreasury .demo-bank-dot[hidden]{display:none}
 #homeTreasury .demo-global-alert{display:flex;align-items:center;gap:6px;width:100%;background:none;border:0;padding:8px 0 0;color:#ef8a8e;text-align:left;font:600 12px/1.5 Manrope,sans-serif;cursor:pointer;min-height:36px}
 #homeTreasury .demo-global-alert span{min-width:0}
 #homeTreasury button:focus-visible,#homeTreasury .demo-bank-scroll:focus-visible{outline:2px solid #e0e6ec;outline-offset:3px}
 #homeTreasury .demo-bank-detail[hidden]{display:none}
 #homeTreasury .demo-detail-heading{display:flex;align-items:center;justify-content:space-between;font-size:12px;margin-top:6px;color:var(--home-muted)}
 #homeTreasury .demo-fold{display:flex;align-items:center;justify-content:center;flex:0 0 44px;height:36px;border:0;background:none;color:var(--home-text);cursor:pointer;touch-action:none}
 #homeTreasury .demo-bank-scroll{max-height:126px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
 #homeTreasury .demo-bank-row{display:flex;align-items:center;justify-content:space-between;gap:7px;min-height:39px;border-top:1px solid #ffffff0b;font-size:12px}
 #homeTreasury .demo-bank-row time{color:var(--home-muted);flex:0 0 34px;font-size:11px}
 #homeTreasury .demo-bank-row>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
 #homeTreasury .demo-bank-row b{font-size:12px;white-space:nowrap}
 #homeTreasury .demo-bank-alert{background:#e46e7208;border:1px solid #e46e7270;border-radius:12px;padding:10px;margin-top:10px;color:#ef8a8e}
 #homeTreasury .demo-bank-alert p{font-size:12px;line-height:1.5;margin:0 0 6px}
 #homeTreasury .demo-rebalance{width:100%;min-height:44px;padding:9px;border:1px solid #ffffff26;border-radius:9px;background:#ffffff04;color:var(--home-text);font:600 12px/1.5 Manrope,sans-serif;cursor:pointer;text-align:left}
 #homeTreasury .demo-bank-note{font-size:11px;color:var(--home-muted);margin:6px 0 0}
 #homeTreasury .demo-bank-status{font-size:12px;color:var(--home-green);margin:8px 0;line-height:1.5}
 #homeTreasury .demo-view-all{display:block;color:var(--home-green);font:600 12px Manrope,sans-serif;padding:10px 0;border:0;background:none;cursor:pointer;min-height:36px}
 #homeTreasury .demo-positive{color:#50ca89!important}
 #homeTreasury .demo-negative{color:#ef8a8e!important}
 .demo-transactions .demo-bank-row{display:flex;gap:10px;padding:12px 0;border-bottom:1px solid #ffffff15;font-size:13px}
 .demo-transactions .demo-bank-row>span{flex:1}.demo-transactions time{min-width:38px}.demo-transactions .demo-positive{color:#50ca89}.demo-transactions .demo-negative{color:#ef8a8e}
 `;document.head.append(css);
 function update(host){
  const bank=banks.find(b=>b.id===selected),scope=bank?[bank]:banks;
  const sum=scope.reduce((s,b)=>{const t=totals(b);for(const k of Object.keys(s))s[k]+=t[k];return s;},{balance:0,incoming:0,outgoing:0});
  host.querySelector('[data-demo-name]').textContent=bank?bank.name.replace(/^Banque /,''):'Toutes les banques';
  const balance=host.querySelector('[data-demo-balance]');balance.textContent=format(sum.balance);balance.classList.toggle('demo-negative',!!bank&&shortage(bank)>0);
  host.querySelector('[data-demo-incoming]').textContent=format(sum.incoming);host.querySelector('[data-demo-outgoing]').textContent=format(sum.outgoing);
  host.querySelectorAll('[data-demo-bank]').forEach(p=>{const b=banks.find(b=>b.id===p.dataset.demoBank);p.setAttribute('aria-pressed',String(p.dataset.demoBank===selected));if(b){const alert=shortage(b)>0;p.querySelector('.demo-bank-dot').hidden=!alert;p.setAttribute('aria-label',b.name+(alert?' · Alerte : solde insuffisant':''));}});
  host.querySelector('.demo-global-alerts').innerHTML=bank?'':banks.filter(b=>shortage(b)>0).map(b=>`<button type="button" class="demo-global-alert" data-demo-alert="${b.id}"><span aria-hidden="true">●</span><span>${clean(b.name)} ${totals(b).balance<0?'à '+signed(totals(b).balance):'· solde insuffisant'}${upcoming(b).length?' · prélèvement '+(upcoming(b)[0].date===dueDate?'demain':shortDate(upcoming(b)[0].date)):''}</span><span aria-hidden="true">›</span></button>`).join('');
  const detail=host.querySelector('.demo-bank-detail');detail.hidden=!bank;if(!bank){detail.replaceChildren();return;}
  const amount=shortage(bank),donor=donorFor(bank),payments=upcoming(bank);
  detail.innerHTML=`${feedback?`<p class="demo-bank-status" role="status">${feedback}</p>`:''}${amount?`<div class="demo-bank-alert" role="status"><p><strong>Solde insuffisant</strong>${payments.length?' · prélèvement de '+format(payments.reduce((s,p)=>s+p.amount,0))+' le '+shortDate(payments[0].date):''}<br>Montant manquant : <strong>${format(amount)}</strong></p>${donor?`<button type="button" class="demo-rebalance" data-demo-rebalance="${bank.id}">Approvisionner depuis ${clean(donor.name)} · ${format(amount)}</button>`:'<p>Aucune autre banque suffisamment approvisionnée.</p>'}<p class="demo-bank-note">Simulation · aucun virement réel</p></div>`:`<div class="demo-detail-heading"><span>5 dernières transactions</span><button type="button" class="demo-fold" data-demo-close aria-label="Revenir à toutes les banques">⌃</button></div><div class="demo-bank-scroll" tabindex="0" role="region" aria-label="Dernières transactions de ${clean(bank.name)}">${rows(latest(bank).slice(0,5))}</div><button type="button" class="demo-view-all" data-demo-all-transactions="${bank.id}">Voir tout →</button>`}`;
 }
 function mount(){
  const host=document.querySelector('#homeTreasury');if(!host||host.querySelector('.demo-multibank'))return;
  selected='all';feedback='';host.innerHTML=`<article class="home-treasury demo-multibank"><div class="home-treasury-top"><span class="module-icon tone-gold" aria-hidden="true">${moduleIcon('treasury')}</span><h2 class="bank-home-title"><span class="treasury-label">Trésorerie</span><span class="demo-bank-name" data-demo-name></span></h2></div><div class="treasury-balance-row"><strong class="demo-total" data-demo-balance aria-label="Solde disponible"></strong><span class="treasury-period">${period}</span></div><div class="home-cash-details"><div class="home-flow"><span>↓ Entrées du mois</span><b class="demo-positive" data-demo-incoming></b></div><div class="home-flow"><span>↑ Sorties du mois</span><b class="demo-negative" data-demo-outgoing></b></div></div><div class="demo-global-alerts"></div><div class="demo-bank-pills" role="group" aria-label="Choisir une banque"><button type="button" class="demo-bank-pill" data-demo-bank="all" aria-label="Toutes les banques" title="Toutes les banques">${svg('<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>')}</button>${banks.map(b=>`<button type="button" class="demo-bank-pill" data-demo-bank="${b.id}" style="--bank-color:${b.color}" title="${clean(b.name)}" aria-controls="demoBankDetail">${b.logo||`<span aria-hidden="true">${clean(initial(b))}</span>`}<span class="demo-bank-dot" hidden aria-hidden="true"></span></button>`).join('')}</div><div id="demoBankDetail" class="demo-bank-detail" hidden></div></article>`;update(host);
 }
 function close(host,focus=false){selected='all';feedback='';update(host);if(focus)host.querySelector('[data-demo-bank="all"]').focus({preventScroll:true});}
 document.addEventListener('click',e=>{
  const host=document.querySelector('#homeTreasury');if(!host?.querySelector('.demo-multibank'))return;
  // Modal transactions belong to this bank view, even outside the home card.
  if(e.target.closest('#modalLayer'))return;
  if(!host.contains(e.target)){if(selected!=='all')close(host);return;}
  const pill=e.target.closest('[data-demo-bank]'),alert=e.target.closest('[data-demo-alert]'),button=e.target.closest('[data-demo-rebalance]'),all=e.target.closest('[data-demo-all-transactions]');
  if(e.target.closest('[data-demo-close]')){e.preventDefault();e.stopImmediatePropagation();close(host,true);return;}
  if(!pill&&!alert&&!button&&!all)return;e.preventDefault();e.stopImmediatePropagation();
  if(pill||alert){const id=(pill||alert).dataset[pill?'demoBank':'demoAlert'];selected=pill&&id===selected?'all':id;feedback='';update(host);return;}
  if(all){const b=banks.find(b=>b.id===all.dataset.demoAllTransactions);openModal(`<h2>${clean(b.name)}</h2><p class="sub">Toutes les transactions · données fictives</p><div class="demo-transactions">${rows(latest(b))}</div>`);return;}
  const recipient=banks.find(b=>b.id===button.dataset.demoRebalance),amount=shortage(recipient),donor=donorFor(recipient);if(!amount||!donor)return;
  donor.data.transactions.unshift({date:today,label:'Virement vers '+recipient.name,amount:-amount,internal:true});recipient.data.transactions.unshift({date:today,label:'Virement depuis '+donor.name,amount,internal:true});
  feedback='✓ Prélèvement couvert · virement simulé';update(host);host.querySelector('[data-demo-bank="'+selected+'"]').focus({preventScroll:true});
 },true);
 document.addEventListener('keydown',e=>{const host=document.querySelector('#homeTreasury');if(e.key==='Escape'&&selected!=='all'&&host?.querySelector('.demo-multibank')&&!document.querySelector('#modalLayer:not(.hide)')){e.preventDefault();close(host,true);}});
 document.addEventListener('pointerdown',e=>{const handle=e.target.closest('#homeTreasury .demo-fold');if(!handle)return;gesture={y:e.clientY,id:e.pointerId};handle.setPointerCapture(e.pointerId);},{passive:true});
 document.addEventListener('pointerup',e=>{if(!gesture||gesture.id!==e.pointerId)return;const g=gesture;gesture=null;if(Math.abs(e.clientY-g.y)>45){const host=document.querySelector('#homeTreasury');if(host)close(host,true);}});
 document.addEventListener('pointercancel',()=>{gesture=null;});
 new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});mount();
}
