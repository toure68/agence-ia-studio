'use strict';
// « Banques d'essai » in the account menu (22/10): one tap adds fictitious banks (« Essai · … ») and movements
// of the month to see how the treasury dial behaves; the same button removes them all. Owner only.
(()=>{
 let present=false;
 async function check(){const cid=typeof company!=='undefined'&&company?company.id:null;if(!cid||typeof api!=='function')return;
  try{const d=await api(`/api/companies/${cid}/banks`);const list=Array.isArray(d)?d:(d.banks||d.items||[]);present=list.some(b=>String(b.name||'').startsWith('Essai · '));}catch(e){}}
 async function toggle(btn){
  const cid=typeof company!=='undefined'&&company?company.id:null;if(!cid||typeof api!=='function')return;
  btn.disabled=true;
  try{
   const on=btn.getAttribute('aria-checked')==='true';
   if(on){if(!confirm('Supprimer les banques d’essai et leurs mouvements ?'))return;await api(`/api/companies/${cid}/trial-treasury`,{method:'DELETE'});notify('Banques d’essai supprimées.');}
   else{await api(`/api/companies/${cid}/trial-treasury`,{method:'POST'});notify('Banques d’essai ajoutées.');}
   document.querySelector('.account-menu')?.removeAttribute('open');
   if(typeof refreshCockpit==='function')await refreshCockpit();else location.reload();
  }catch(e){notify(e.message||'Impossible pour le moment.');}
  finally{btn.disabled=false;await check();sync();}
 }
 function sync(){
  const panel=document.querySelector('.account-panel');if(!panel)return;
  let b=panel.querySelector('#accountTrialBanks');
  if(!b){b=document.createElement('button');b.id='accountTrialBanks';b.type='button';b.className='btn small';b.setAttribute('role','switch');b.onclick=()=>toggle(b);(panel.querySelector('#accountReaderSamples')||panel.querySelector('#accountWallpaper'))?.after(b)||panel.append(b);}
  b.hidden=typeof me!=='undefined'&&me&&me.role!=='owner';
  const on=present;b.setAttribute('aria-checked',String(on));b.textContent='Banques d’essai : '+(on?'affichées':'masquées');
 }
 document.addEventListener('toggle',e=>{if(e.target.matches?.('.account-menu')&&e.target.open){sync();check().then(sync);}},true);
 document.addEventListener('DOMContentLoaded',sync);if(document.readyState!=='loading')sync();
})();
