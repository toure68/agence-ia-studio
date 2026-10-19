'use strict';
// Exports (CSV…) stay inside the app: instead of leaving for a bare file page, the file is fetched and handed
// to the iPhone share sheet (Enregistrer dans Fichiers, Mail, Messages…). On computers it downloads as usual.
(()=>{
 const isExport=a=>{try{const u=new URL(a.href,location.href);return u.origin===location.origin&&/^\/api\/.*-export$/.test(u.pathname);}catch{return false;}};
 const nameOf=(res,fallback)=>{const m=/filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition')||'');return m?m[1]:fallback;};
 function download(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}
 async function hand(file){
  if(navigator.canShare?.({files:[file]})){
   try{await navigator.share({files:[file],title:file.name});return;}
   catch(e){
    if(e?.name==='AbortError')return;
    // The share sheet needs a fresh tap after the download: offer one, without leaving the app.
    if(typeof openModal==='function'){openModal(`<h2>Fichier prêt</h2><p class="sub">${clean(file.name)}</p><button type="button" class="btn primary" id="shareExport">Enregistrer ou partager</button>`);
     document.querySelector('#shareExport').onclick=async()=>{try{await navigator.share({files:[file],title:file.name});}catch{download(file);}if(typeof closeModal==='function')closeModal();};return;}
   }
  }
  download(file);
 }
 document.addEventListener('click',async e=>{
  const a=e.target.closest('a[href]');if(!a||!isExport(a)||e.metaKey||e.ctrlKey)return;
  if(document.body.dataset.publicDemo==='true')return; // the read-only demo explains instead
  e.preventDefault();e.stopImmediatePropagation();
  a.setAttribute('aria-busy','true');
  try{
   const res=await fetch(a.href,{credentials:'same-origin'});if(!res.ok)throw Error('Export impossible pour le moment.');
   const blob=await res.blob(),file=new File([blob],nameOf(res,'export.csv'),{type:blob.type||'text/csv'});
   await hand(file);
  }catch(err){if(typeof notify==='function')notify(err.message||'Export impossible.');}
  finally{a.removeAttribute('aria-busy');}
 },true);
})();
