'use strict';
// Synthetic state held in this tab only; no requests or real transfers.
if(document.body.dataset.publicDemo==='true'){
 const banks=[{id:'horizon',name:'Banque Horizon',balance:1800000,incoming:1900000,outgoing:100000,due:0},{id:'rivage',name:'Banque Rivage',balance:-35000,incoming:200000,outgoing:235000,due:65000},{id:'atlas',name:'Banque Atlas',balance:720000,incoming:820000,outgoing:100000,due:0}];
 const movements=banks.flatMap(b=>[{bank:b.id,label:'Règlements clients',amount:b.incoming},{bank:b.id,label:'Charges et fournitures',amount:-b.outgoing}]);
 let selected='all',feedback='',gesture=null;
 const format=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(n/100).replace(/[\u00a0\u202f]/g,' ');
 const signed=n=>(n<0?'−':'+')+' '+format(Math.abs(n));
 const shortage=b=>Math.max(0,b.due-b.balance);
 const donorFor=b=>banks.filter(d=>d.id!==b.id&&d.balance-d.due>=shortage(b)).sort((a,c)=>c.balance-c.due-(a.balance-a.due))[0];
 const chevron='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
 const css=document.createElement('style');
 css.textContent=`
 #homeTreasury .demo-total{display:block;font-size:clamp(20px,5.3vw,22px);font-weight:800;line-height:1.05;letter-spacing:-.03em;white-space:nowrap;margin-top:1px}
 #homeTreasury .home-treasury-top h2{font-size:11px;line-height:14px;letter-spacing:.07em}
 #homeTreasury .home-cash-details{margin-top:12px;gap:8px}
 #homeTreasury .home-flow{min-height:58px;padding:8px 10px}
 #homeTreasury .home-flow span{font-size:12px}
 #homeTreasury .home-flow b{font-size:clamp(15px,4vw,18px)}
 #homeTreasury .demo-bank-pills{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:3px 1px;margin:10px 0 0}
 #homeTreasury .demo-bank-pill{min-width:0;border:1px solid #ffffff26;border-radius:999px;background:#ffffff06;color:inherit;padding:8px 6px;font:inherit;font-size:12px;min-height:44px;cursor:pointer;text-align:center}
 #homeTreasury .demo-bank-pill[aria-pressed=true]{background:#ffffff14;border-color:#a4b1bd}
 #homeTreasury .demo-bank-pill.is-alert{border-color:#e46e72;box-shadow:0 0 0 1px #e46e7218}
 #homeTreasury button:focus-visible,#homeTreasury .demo-bank-scroll:focus-visible{outline:2px solid #e0e6ec;outline-offset:2px}
 #homeTreasury .demo-bank-detail{margin-top:8px;border-top:1px solid #ffffff12}
 #homeTreasury .demo-bank-detail[hidden]{display:none}
 #homeTreasury .demo-bank-summary{display:flex;justify-content:space-between;align-items:center;gap:8px;height:40px;font-size:12px}
 #homeTreasury .demo-bank-summary strong{font-size:16px;white-space:nowrap}
 #homeTreasury .demo-fold{display:flex;align-items:center;justify-content:center;flex:0 0 44px;height:40px;border:0;background:none;color:inherit;cursor:pointer;touch-action:none}
 #homeTreasury .demo-bank-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
 #homeTreasury .demo-bank-scroll{height:108px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
 #homeTreasury .demo-bank-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:36px;border-top:1px solid #ffffff0b;font-size:12px}
 #homeTreasury .demo-bank-row>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 #homeTreasury .demo-bank-row b{font-size:12px;white-space:nowrap}
 #homeTreasury .demo-bank-alert{color:#ef8a8e}
 #homeTreasury .demo-rebalance{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:44px;width:100%;padding:7px 9px;margin:3px 0;border:1px solid #e46e7260;border-radius:10px;background:#ffffff04;color:inherit;font:inherit;font-size:12px;cursor:pointer}
 #homeTreasury .demo-rebalance span{min-width:0;text-align:left}
 #homeTreasury .demo-rebalance b{white-space:nowrap}
 #homeTreasury .demo-bank-status{font-size:12px;color:var(--home-green);padding:8px 0;margin:0}
 #homeTreasury .demo-bank-note{font-size:11px;color:var(--home-muted);margin:6px 0}
 #homeTreasury .demo-positive{color:var(--home-green,#50ca89)}
 #homeTreasury .demo-negative{color:#ef8a8e}
 `;
 document.head.append(css);
 function update(host){
  const bank=banks.find(b=>b.id===selected),detail=host.querySelector('.demo-bank-detail');
  host.querySelectorAll('[data-demo-bank]').forEach(p=>{const b=banks.find(b=>b.id===p.dataset.demoBank);p.setAttribute('aria-pressed',String(p.dataset.demoBank===selected));if(b){p.classList.toggle('is-alert',shortage(b)>0);p.setAttribute('aria-label',b.name+(shortage(b)>0?' · Solde insuffisant':''));}});
  detail.hidden=!bank;if(!bank){detail.replaceChildren();return;}
  const amount=shortage(bank),donor=donorFor(bank);
  detail.innerHTML=`<div class="demo-bank-summary"><span class="demo-bank-name">${bank.name}</span><strong class="${bank.balance<0?'demo-negative':''}" data-demo-balance>${signed(bank.balance)}</strong><button type="button" class="demo-fold" aria-label="Replier les détails de la banque" data-demo-close>${chevron}</button></div>
   <div class="demo-bank-scroll" tabindex="0" role="region" aria-label="Détails défilants de ${bank.name}">
   ${feedback?`<p class="demo-bank-status" role="status">${feedback}</p>`:''}
   ${bank.due?`<div class="demo-bank-row ${amount?'demo-bank-alert':''}"><span>Prélèvement demain</span><b>− ${format(bank.due)}</b></div>`:''}
   ${amount?`<div class="demo-bank-row demo-bank-alert"><span>À approvisionner</span><b>${format(amount)}</b></div>${donor?`<button type="button" class="demo-rebalance" data-demo-rebalance="${bank.id}" aria-label="Simuler un approvisionnement de ${format(amount)} depuis ${donor.name}"><span>⇄ Depuis ${donor.name}</span><b>${format(amount)}</b></button>`:'<p class="demo-bank-note">Aucun compte suffisamment approvisionné.</p>'}`:''}
   ${movements.filter(m=>m.bank===bank.id).map(m=>`<div class="demo-bank-row" data-demo-movement><span>${m.label}</span><b class="${m.amount<0?'demo-negative':'demo-positive'}">${signed(m.amount)}</b></div>`).join('')}
   <p class="demo-bank-note">Simulation · aucun virement réel</p></div>`;
 }
 function mount(){
  const host=document.querySelector('#homeTreasury');if(!host||host.querySelector('.demo-multibank'))return;
  selected='all';feedback='';
  host.innerHTML=`<article class="home-treasury demo-multibank"><div class="home-treasury-top"><span class="module-icon tone-gold" aria-hidden="true">${moduleIcon('treasury')}</span><div><h2>Trésorerie · total</h2><strong class="demo-total" data-demo-global>${format(banks.reduce((s,b)=>s+b.balance,0))}</strong></div></div>
   <div class="home-cash-details"><div class="home-flow"><span>↓ Entrées</span><b class="demo-positive">${format(banks.reduce((s,b)=>s+b.incoming,0))}</b></div><div class="home-flow"><span>↑ Sorties</span><b class="demo-negative">${format(banks.reduce((s,b)=>s+b.outgoing,0))}</b></div></div>
   <div class="demo-bank-pills" role="group" aria-label="Choisir une banque"><button type="button" class="demo-bank-pill" data-demo-bank="all" aria-label="Tous les comptes, replier les détails" aria-pressed="true">Tous</button>${banks.map(b=>`<button type="button" class="demo-bank-pill" data-demo-bank="${b.id}" aria-pressed="false" aria-controls="demoBankDetail">${b.name.replace(/^Banque /,'')}</button>`).join('')}</div><div id="demoBankDetail" class="demo-bank-detail" hidden></div></article>`;
  update(host);
 }
 function close(host,focus=false){selected='all';feedback='';update(host);if(focus)host.querySelector('[data-demo-bank="all"]').focus({preventScroll:true});}
 document.addEventListener('click',e=>{
  const host=document.querySelector('#homeTreasury');if(!host?.querySelector('.demo-multibank'))return;
  if(!host.contains(e.target)){if(selected!=='all')close(host);return;}
  const pill=e.target.closest('[data-demo-bank]'),button=e.target.closest('[data-demo-rebalance]');
  if(e.target.closest('[data-demo-close]')){e.preventDefault();e.stopImmediatePropagation();close(host,true);return;}
  if(!pill&&!button)return;e.preventDefault();e.stopImmediatePropagation();
  if(pill){selected=pill.dataset.demoBank===selected?'all':pill.dataset.demoBank;feedback='';update(host);return;}
  const recipient=banks.find(b=>b.id===button.dataset.demoRebalance),amount=shortage(recipient),donor=donorFor(recipient);if(!amount||!donor)return;
  donor.balance-=amount;recipient.balance+=amount;
  movements.unshift({bank:recipient.id,label:'⇄ Depuis '+donor.name,amount},{bank:donor.id,label:'⇄ Vers '+recipient.name,amount:-amount});
  feedback='✓ Prélèvement couvert · virement simulé';update(host);host.querySelector('[data-demo-close]').focus({preventScroll:true});
 },true);
 document.addEventListener('keydown',e=>{const host=document.querySelector('#homeTreasury');if(e.key==='Escape'&&selected!=='all'&&host?.querySelector('.demo-multibank')){e.preventDefault();close(host,true);}});
 document.addEventListener('pointerdown',e=>{const detail=e.target.closest('#homeTreasury .demo-bank-detail');if(!detail)return;const scroll=detail.querySelector('.demo-bank-scroll');gesture={x:e.clientX,y:e.clientY,id:e.pointerId,handle:!!e.target.closest('.demo-bank-summary'),top:scroll.scrollTop<=0,bottom:scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-1};if(e.target.closest('.demo-fold'))e.target.closest('.demo-fold').setPointerCapture(e.pointerId);},{passive:true});
 document.addEventListener('pointerup',e=>{if(!gesture||gesture.id!==e.pointerId)return;const g=gesture;gesture=null;const dy=e.clientY-g.y,dx=e.clientX-g.x;if(Math.abs(dy)>45&&Math.abs(dy)>Math.abs(dx)&&(g.handle||(dy>0&&g.top)||(dy<0&&g.bottom))){const host=document.querySelector('#homeTreasury');if(host)close(host,true);}});
 document.addEventListener('pointercancel',()=>{gesture=null;});
 new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});mount();
}
