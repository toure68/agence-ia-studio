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
 // The demo feeds the same dial as the real app (banks.js) with a synthetic snapshot; nothing is ever written.
 const format=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(n/100).replace(/[  ]/g,' ');
 const signed=n=>(n<0?'−':'+')+' '+format(Math.abs(n));
 const shortDate=d=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',timeZone:'Europe/Paris'}).format(new Date(d+'T12:00:00Z'));
 const totals=b=>({balance:b.data.opening+b.data.transactions.reduce((s,t)=>s+t.amount,0),incoming:b.data.transactions.filter(t=>!t.internal&&t.date.startsWith(month)&&t.amount>0).reduce((s,t)=>s+t.amount,0),outgoing:-b.data.transactions.filter(t=>!t.internal&&t.date.startsWith(month)&&t.amount<0).reduce((s,t)=>s+t.amount,0)});
 const upcoming=b=>b.data.payments.filter(p=>p.date>=today&&p.date<=new Date(new Date(today+'T12:00:00Z').getTime()+7*86400000).toISOString().slice(0,10));
 const latest=b=>b.data.transactions.map((t,i)=>({...t,i})).sort((a,c)=>c.date.localeCompare(a.date)||a.i-c.i);
 const rows=items=>items.map(t=>`<div class="demo-bank-row" data-demo-movement><time datetime="${t.date}">${shortDate(t.date)}</time><span title="${clean(t.label)}">${clean(t.label)}</span><b class="${t.amount<0?'demo-negative':'demo-positive'}">${signed(t.amount)}</b></div>`).join('');
 const css=document.createElement('style');css.textContent=`
 .demo-transactions .demo-bank-row{display:flex;gap:10px;padding:12px 0;border-bottom:1px solid #ffffff15;font-size:13px}
 .demo-transactions .demo-bank-row>span{flex:1}.demo-transactions time{min-width:38px}.demo-transactions .demo-positive{color:#50ca89}.demo-transactions .demo-negative{color:#ef8a8e}
 `;document.head.append(css);
 function snapshot(){
  let seq=0;const sum={balance:0,incoming:0,outgoing:0};
  const list=banks.map(b=>{
   const t=totals(b),due=upcoming(b),planned=due.reduce((s,p)=>s+p.amount,0),available=t.balance-planned;
   for(const k in sum)sum[k]+=t[k];
   return {id:b.id,name:b.name,currency:'EUR',balance_minor:t.balance,available_minor:available,shortfall_minor:Math.max(0,-available),upcoming_minor:planned,next_due:due[0]?.date||null,
    month_inflows_minor:t.incoming,month_outflows_minor:t.outgoing,demo_face:b.logo||undefined,
    latest:latest(b).slice(0,5).map(m=>({id:1000-(seq++),label:m.label,direction:m.amount<0?'out':'in',amount_minor:Math.abs(m.amount),currency:'EUR',date:m.date}))};
  });
  const debits=banks.flatMap(b=>b.data.payments.filter(p=>p.date>=today).map((p,k)=>({id:b.id+'-'+k,bank_id:b.id,label:p.label,amount_minor:p.amount,due:p.date,currency:'EUR',bank_name:b.name})));
  return {banks:list,debits,month,balances_minor:{EUR:sum.balance},month_inflows_minor:{EUR:sum.incoming},month_outflows_minor:{EUR:sum.outgoing}};
 }
 function render(){
  const host=document.querySelector('#homeTreasury');if(!host)return;
  host.treasuryState={demoBanks:true,widgets:{treasury:snapshot()}};host.innerHTML=homeTreasuryMarkup(host.treasuryState);
 }
 function mount(){const host=document.querySelector('#homeTreasury');if(host&&!host.treasuryState?.demoBanks)render();}
 // Window capture runs before banks.js' document listener: demo actions are simulated locally.
 addEventListener('click',e=>{
  const host=document.querySelector('#homeTreasury');if(!host?.treasuryState?.demoBanks||!host.contains(e.target))return;
  const fund=e.target.closest('[data-bank-fund]'),all=e.target.closest('[data-bank-all]'),add=e.target.closest('[data-bank-add]');
  if(!fund&&!all&&!add)return;e.preventDefault();e.stopImmediatePropagation();
  if(add){notify('Démonstration : l’ajout d’une banque est désactivé.');return;}
  if(all){
   const id=bankHomeSelected(host.treasuryState.widgets.treasury.banks),scope=id==='all'?banks:banks.filter(b=>b.id===id);
   const items=scope.flatMap(b=>latest(b)).sort((a,c)=>c.date.localeCompare(a.date));
   openModal(`<h2>${clean(scope.length===1?scope[0].name:'Toutes les banques')}</h2><p class="sub">Toutes les transactions · données fictives</p><div class="demo-transactions">${rows(items)}</div>`);return;
  }
  const recipient=banks.find(b=>b.id===fund.dataset.bankFund);if(!recipient)return;
  const amount=Math.max(0,upcoming(recipient).reduce((s,p)=>s+p.amount,0)-totals(recipient).balance);
  const donor=banks.filter(d=>d!==recipient&&totals(d).balance-upcoming(d).reduce((s,p)=>s+p.amount,0)>=amount).sort((a,c)=>totals(c).balance-totals(a).balance)[0];
  if(!amount||!donor)return;
  donor.data.transactions.unshift({date:today,label:'Virement vers '+recipient.name,amount:-amount,internal:true});
  recipient.data.transactions.unshift({date:today,label:'Virement depuis '+donor.name,amount,internal:true});
  render();notify('✓ Prélèvement couvert · virement simulé');
 },true);
 new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});mount();
}
