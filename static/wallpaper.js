'use strict';
// Glass design: each user picks a home wallpaper (saved on their account); every home card and window is
// frosted glass that takes the wallpaper's colours. The glass gets darker on bright wallpapers so white text
// always stays readable. Default: "Uni nuit". Previous look (no glass) is kept on branch sauvegarde/avant-verre.
(()=>{
 const WALLS=[
  {id:'nuit',name:'Uni nuit',lum:.05,bg:'#0b0f14'},
  {id:'emeraude',name:'Émeraude',lum:.18,bg:'radial-gradient(120% 70% at 20% 0%,#2f9e86 0%,#145c4f 35%,transparent 70%),radial-gradient(90% 60% at 100% 60%,#0f766e 0%,transparent 60%),linear-gradient(#0b2a25,#05110f)'},
  {id:'ocean',name:'Océan',lum:.16,bg:'radial-gradient(90% 60% at 10% 10%,#3b5bdb 0%,transparent 60%),radial-gradient(80% 60% at 100% 45%,#7c3aed 0%,transparent 60%),radial-gradient(100% 60% at 30% 100%,#0ea5e9 0%,transparent 60%),#0a1030'},
  {id:'couchant',name:'Couchant',lum:.48,bg:'radial-gradient(100% 60% at 80% 0%,#ffb35c 0%,transparent 60%),radial-gradient(110% 70% at 0% 40%,#ff5e62 0%,transparent 65%),radial-gradient(100% 70% at 100% 100%,#8e2de2 0%,transparent 70%),#3a0d3f'},
  {id:'aurore',name:'Aurore',lum:.22,bg:'radial-gradient(70% 45% at 15% 15%,#22d3ee 0%,transparent 60%),radial-gradient(70% 50% at 85% 35%,#4ade80 0%,transparent 60%),radial-gradient(90% 60% at 50% 95%,#a855f7 0%,transparent 65%),#04060c'},
  {id:'sable',name:'Sable clair',lum:.82,bg:'radial-gradient(90% 60% at 10% 0%,#ffe8c7 0%,transparent 60%),radial-gradient(90% 70% at 100% 60%,#e9d5ff 0%,transparent 65%),#f6efe6'}
 ];
 const KEY='aia-wallpaper';
 const store={get(){try{return localStorage.getItem(KEY)}catch(e){return null}},set(v){try{localStorage.setItem(KEY,v)}catch(e){}}};
 const find=id=>WALLS.find(w=>w.id===id)||WALLS[0];
 function apply(id){
  const w=find(id);
  let wall=document.getElementById('appWall');
  if(!wall){wall=document.createElement('div');wall.id='appWall';wall.setAttribute('aria-hidden','true');document.body.prepend(wall);}
  wall.style.background=w.bg;
  document.body.dataset.wall=w.id;
  // Readability guard: brighter wallpaper -> darker glass.
  document.documentElement.style.setProperty('--glass-tint',Math.min(.72,Math.max(.22,.18+w.lum*.62)).toFixed(2));
  store.set(w.id);
  return w;
 }
 async function choose(id){
  const w=apply(id);
  for(const b of document.querySelectorAll('[data-wallpaper]'))b.setAttribute('aria-pressed',b.dataset.wallpaper===w.id);
  try{await api('/api/me/wallpaper',{method:'PUT',body:JSON.stringify({wallpaper:w.id})});if(typeof me==='object'&&me)me.wallpaper=w.id;}
  catch(err){if(typeof notify==='function')notify(err.message);}
 }
 function picker(){
  const current=document.body.dataset.wall||'nuit';
  openModal(`<h2>Fond d’écran</h2><p class="wall-note">Le verre prend la couleur du fond. Sur un fond clair, il se fonce pour que le texte reste lisible.</p><div class="wall-grid" role="group" aria-label="Choisir un fond d’écran">${WALLS.map(w=>`<button type="button" class="wall-swatch" data-wallpaper="${w.id}" aria-pressed="${w.id===current}"><i style="background:${w.bg}"></i><span>${w.name}</span></button>`).join('')}</div>`);
  document.querySelector('#modalLayer .wall-grid')?.addEventListener('click',e=>{const b=e.target.closest('[data-wallpaper]');if(b)choose(b.dataset.wallpaper);});
 }
 document.addEventListener('click',e=>{
  if(!e.target.closest('#accountWallpaper'))return;
  e.preventDefault();e.target.closest('details')?.removeAttribute('open');picker();
 });
 apply(store.get()||'nuit'); // no flash on load; the account's choice replaces it once /api/me answers
 window.applyWallpaper=id=>apply(id||store.get()||'nuit');
 window.WALLPAPERS=WALLS.map(w=>w.id);
})();
