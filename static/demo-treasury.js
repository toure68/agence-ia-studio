'use strict';
// Local, synthetic interaction only. No API requests or banking connection.
if(document.body.dataset.publicDemo==='true'){
 const banks=[
  {id:'horizon',name:'Banque Horizon',balance:1800000,incoming:1900000,outgoing:100000,due:0},
  {id:'rivage',name:'Banque Rivage',balance:-35000,incoming:200000,outgoing:235000,due:65000},
  {id:'atlas',name:'Banque Atlas',balance:720000,incoming:820000,outgoing:100000,due:0}
 ];
 const movements=banks.flatMap(b=>[
  {bank:b.id,label:'Règlements clients',amount:b.incoming},
  {bank:b.id,label:'Charges et fournitures',amount:-b.outgoing}
 ]);
 let selected='all',feedback='';
 const format=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(n/100).replace(/[\u00a0\u202f]/g,' ');
 const signed=n=>(n<0?'−':'+')+' '+format(Math.abs(n));
 const shortage=b=>Math.max(0,b.due-b.balance);
 const donorFor=b=>banks.filter(d=>d.id!==b.id&&d.balance-d.due>=shortage(b)).sort((a,c)=>c.balance-c.due-(a.balance-a.due))[0];
 const css=document.createElement('style');
 css.textContent=`
 #homeTreasury .demo-bank-pills{display:flex;gap:8px;overflow-x:auto;padding:5px 2px 10px;margin:14px 0 0;scrollbar-width:thin}
 #homeTreasury .demo-bank-pill{flex:0 0 auto;border:1px solid #ffffff26;border-radius:999px;background:#ffffff06;color:inherit;padding:10px 13px;font:inherit;font-size:13px;min-height:44px;cursor:pointer}
 #homeTreasury .demo-bank-pill[aria-pressed=true]{background:#ffffff14;border-color:#a4b1bd}
 #homeTreasury .demo-bank-pill.is-alert{border-color:#e46e72;box-shadow:0 0 0 1px #e46e7228}
 #homeTreasury .demo-bank-pill:focus-visible,#homeTreasury .demo-rebalance:focus-visible{outline:2px solid #e0e6ec;outline-offset:3px}
 #homeTreasury .demo-bank-summary{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 0 12px;font-size:14px}
 #homeTreasury .demo-bank-summary strong{font-size:20px;white-space:nowrap}
 #homeTreasury .demo-bank-alert{border:1px solid #e46e7270;border-radius:12px;padding:12px;margin:4px 0 12px;background:#e46e7208}
 #homeTreasury .demo-bank-alert p{font-size:13px;line-height:1.5;margin:0 0 9px}
 #homeTreasury .demo-rebalance{width:100%;white-space:normal;line-height:1.4;text-align:left;padding:10px 12px;min-height:44px}
 #homeTreasury .demo-bank-note{font-size:12px;color:var(--home-muted);margin:8px 0 0}
 #homeTreasury .demo-bank-movements{margin:0;padding:0;list-style:none;max-height:240px;overflow:auto;overscroll-behavior:contain}
 #homeTreasury .demo-bank-movements li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #ffffff0c;font-size:13px}
 #homeTreasury .demo-bank-movements small{display:block;margin-top:3px}
 #homeTreasury .demo-bank-movements b{white-space:nowrap;font-size:13px}
 #homeTreasury .demo-positive{color:var(--home-green,#50ca89)}
 #homeTreasury .demo-negative{color:#ef8a8e}
 #homeTreasury .demo-bank-status{font-size:13px;line-height:1.5;margin:0 0 10px}
 #homeTreasury .demo-bank-title{font-size:13px;margin:6px 0 8px;color:var(--home-muted)}
 `;
 document.head.append(css);
 function render(host){
  const bank=banks.find(b=>b.id===selected),total=banks.reduce((sum,b)=>sum+b.balance,0);
  const visible=banks.filter(b=>selected==='all'||b.id===selected);
  const alerts=visible.filter(b=>shortage(b)>0);
  const items=movements.filter(m=>selected==='all'||m.bank===selected);
  host.innerHTML=`<article class="home-treasury demo-multibank">
   <div class="home-treasury-top"><span class="module-icon tone-gold" aria-hidden="true">${moduleIcon('treasury')}</span><div><h2>Trésorerie</h2><span class="home-demo-badge">Démonstration · chiffres fictifs</span></div></div>
   <div class="home-cash-balance"><span>Solde global · toutes les banques</span><div class="home-balances"><strong data-demo-global>${format(total)}</strong></div></div>
   <div class="home-cash-details"><div class="home-flow"><span>Entrées</span><b class="demo-positive">${format(banks.reduce((s,b)=>s+b.incoming,0))}</b></div><div class="home-flow"><span>Sorties</span><b class="demo-negative">${format(banks.reduce((s,b)=>s+b.outgoing,0))}</b></div></div>
   <div class="demo-bank-pills" role="group" aria-label="Filtrer par banque"><button type="button" class="demo-bank-pill" data-demo-bank="all" aria-pressed="${selected==='all'}">Tous</button>${banks.map(b=>`<button type="button" class="demo-bank-pill ${shortage(b)>0?'is-alert':''}" data-demo-bank="${b.id}" aria-pressed="${selected===b.id}" aria-label="${b.name}${shortage(b)>0?' · Alerte : solde insuffisant':''}">${b.name}${shortage(b)>0?' · !':''}</button>`).join('')}</div>
   <div class="demo-bank-detail" aria-live="polite" aria-atomic="true">
    ${bank?`<div class="demo-bank-summary"><span>Solde · ${bank.name}</span><strong class="${bank.balance<0?'demo-negative':''}" data-demo-balance>${signed(bank.balance)}</strong></div>`:''}
    ${feedback?`<p class="demo-bank-status" role="status">${feedback}</p>`:''}
    ${alerts.map(b=>{const donor=donorFor(b);return `<div class="demo-bank-alert"><p><strong>${b.name}</strong> · ${b.balance<0?'Solde négatif : '+signed(b.balance)+'. ':''}Prélèvement de ${format(b.due)} prévu demain. Il manque <strong>${format(shortage(b))}</strong>.</p>${donor?`<button type="button" class="btn demo-rebalance" data-demo-rebalance="${b.id}">Approvisionner depuis ${donor.name} · ${format(shortage(b))}</button>`:'<p>Aucune autre banque ne dispose du montant nécessaire.</p>'}<p class="demo-bank-note">Virement fictif en un clic · aucun virement bancaire réel.</p></div>`;}).join('')}
    <h3 class="demo-bank-title">Mouvements · ${bank?bank.name:'toutes les banques'}</h3>
    <ul class="demo-bank-movements">${items.map(m=>`<li><span>${m.label}<small>${banks.find(b=>b.id===m.bank).name}${m.internal?' · Virement interne':''}</small></span><b class="${m.amount<0?'demo-negative':'demo-positive'}">${signed(m.amount)}</b></li>`).join('')}</ul>
   </div>
  </article>`;
 }
 function mount(){const host=document.querySelector('#homeTreasury');if(host&&!host.querySelector('.demo-multibank'))render(host);}
 document.addEventListener('click',e=>{
  const pill=e.target.closest('#homeTreasury [data-demo-bank]');
  const button=e.target.closest('#homeTreasury [data-demo-rebalance]');
  if(!pill&&!button)return;
  e.preventDefault();e.stopImmediatePropagation();
  const host=e.target.closest('#homeTreasury');
  if(pill){selected=pill.dataset.demoBank;feedback='';render(host);host.querySelector(`[data-demo-bank="${selected}"]`).focus({preventScroll:true});return;}
  const recipient=banks.find(b=>b.id===button.dataset.demoRebalance),amount=shortage(recipient),donor=donorFor(recipient);
  if(!amount||!donor)return;
  donor.balance-=amount;recipient.balance+=amount;
  movements.unshift({bank:recipient.id,label:'Depuis '+donor.name,amount,internal:true},{bank:donor.id,label:'Vers '+recipient.name,amount:-amount,internal:true});
  feedback=`Virement simulé : ${format(amount)} de ${donor.name} vers ${recipient.name}. Prélèvement couvert. Solde global inchangé.`;
  render(host);
  host.querySelector(`[data-demo-bank="${selected}"]`).focus({preventScroll:true});
 },true);
 new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
 mount();
}
