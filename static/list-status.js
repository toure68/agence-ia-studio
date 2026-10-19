'use strict';
// Lists in windows (material, prevention, clients, tasks…): you must see at once what is waiting for you.
// A row with a pending action (the same actions as the home cards) gets a readable state chip ("Révision à faire",
// "À valider"…); a row with nothing to do is quieter (grey). Dates are written in clear words.
(()=>{
 const MAP={asset:'equipment',risk:'risk','task-open':'task','client-open':'client','quote-open':'quote','mail-open':'email','activity-open':'activity','social-post':'social'};
 let cache={t:0,cid:null,list:[]},queued=false;
 async function actions(){
  if(typeof company==='undefined'||!company)return [];
  if(cache.cid===company.id&&Date.now()-cache.t<400)return cache.list;
  const list=await api(`/api/companies/${company.id}/priorities`);cache={t:Date.now(),cid:company.id,list};return list;
 }
 const friendly=t=>typeof priorityFriendly==='function'?priorityFriendly(t):t;
 function dates(row){
  const walk=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let n;
  while((n=walk.nextNode()))if(/\d{4}-\d{2}-\d{2}/.test(n.nodeValue))n.nodeValue=friendly(n.nodeValue).replace(/^le /,'');
 }
 async function run(){
  queued=false;
  const roots=[document.querySelector('#contextPanel .context-scroll'),document.querySelector('#modalLayer:not(.hide) .modal')].filter(Boolean);
  const rows=roots.flatMap(r=>[...r.querySelectorAll('.task-row:not([data-row-state])')]);
  if(!rows.length)return;
  const keyed=rows.map(row=>{
   row.dataset.rowState='pending';dates(row);
   if(row.hasAttribute('data-priority-item-open'))return {row,all:true};
   for(const [attr,type] of Object.entries(MAP)){const v=row.getAttribute('data-'+attr);if(v!=null)return {row,type,id:Number(v)};}
   return {row};
  });
  if(!keyed.some(k=>k.type||k.all)){keyed.forEach(k=>k.row.dataset.rowState='plain');return;}
  let list=[];try{list=await actions();}catch{}
  for(const k of keyed){
   if(k.all){k.row.dataset.rowState='todo';k.row.classList.add('row-todo');continue;}
   if(!k.type){k.row.dataset.rowState='plain';continue;}
   const card=list.find(c=>c.action?.type===k.type&&Number(c.action.id)===k.id&&!c.example&&!c.fallback);
   if(!card){k.row.dataset.rowState='quiet';k.row.classList.add('row-quiet');continue;}
   k.row.dataset.rowState='todo';k.row.classList.add('row-todo');
   const p=typeof priorityPresentation==='function'?priorityPresentation(card):{label:'À traiter',state:'warning'};
   const chip=document.createElement('span');chip.className='row-chip'+(p.state==='danger'?' is-danger':'');chip.textContent=p.label||'À traiter';
   k.row.insertBefore(chip,k.row.lastElementChild);
  }
 }
 const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(()=>run().catch(()=>{}));}};
 new MutationObserver(records=>{if(records.some(r=>{const t=r.target.nodeType===1?r.target:r.target.parentElement;return t&&(t.closest?.('#contextPanel,#modalLayer')||[...r.addedNodes].some(n=>n.id==='contextLayer'));}))schedule();}).observe(document.body,{childList:true,subtree:true});
 window.listStatusRefresh=()=>{cache.t=0;document.querySelectorAll('[data-row-state]').forEach(r=>{delete r.dataset.rowState;r.classList.remove('row-todo','row-quiet');r.querySelector('.row-chip')?.remove();});schedule();};
})();
