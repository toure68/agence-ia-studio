const $=s=>document.querySelector(s);
const slug=decodeURIComponent(location.pathname.split('/').pop());
let firm=null;
const money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const serviceIcons={home:'⌂',office:'▥',after:'✦',windows:'◈'};
const freq={once:1,weekly:.9,monthly:.95};
async function api(path,options={}){const r=await fetch(path,options);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Erreur réseau');return d;}
function calculate(){if(!firm)return;const s=$('#service').value,a=Math.max(0,Number($('#area').value)),v=firm.rates[s];$('#estimated').textContent=v?money(Math.round(Math.max(v.min,v.unit*a)*freq[$('#frequency').value])):'—';}
async function init(){try{firm=await api('/api/public/'+encodeURIComponent(slug));document.title=firm.name+' · Devis';$('#brand').textContent=firm.name;$('#headline').textContent=firm.headline;$('#cityBadge').textContent=firm.city;$('#footBrand').textContent=firm.name;$('#footCity').textContent=firm.city;document.documentElement.style.setProperty('--green',firm.color);const rates=Object.entries(firm.rates);$('#serviceCards').replaceChildren(...rates.map(([key,rate])=>{const e=document.createElement('article');e.className='card';const a=document.createElement('div');a.className='service-icon';a.textContent=serviceIcons[key]||'✧';const b=document.createElement('h3');b.textContent=rate.label;const c=document.createElement('div');c.className='sub small';c.textContent='À partir de '+money(rate.min);e.append(a,b,c);return e;}));rates.forEach(([k,v])=>{let o=document.createElement('option');o.value=k;o.textContent=v.label;$('#service').appendChild(o)});['#service','#area','#frequency'].forEach(s=>$(s).addEventListener('input',calculate));calculate();
 if(!firm.quotes_enabled){
   const form=$('#quoteForm');
   form.querySelectorAll('input, select, button').forEach(x=>x.disabled=true);
   $('#quoteMessage').className='msg';
   $('#quoteMessage').textContent='Mode démonstration : le formulaire de contact est désactivé. Aucune donnée personnelle ne doit être saisie ici.';
   form.querySelector('button[type=submit]').textContent='Démonstration — envoi désactivé';
 }else{$('#quoteForm').addEventListener('submit',sendQuote);} }catch(e){$('#publicApp').textContent='Impossible de charger cette entreprise : '+e.message;}}
async function sendQuote(e){e.preventDefault();const btn=$('#quoteForm button[type=submit]');btn.disabled=true;$('#quoteMessage').textContent='Enregistrement…';const data={name:$('#fullname').value.trim(),phone:$('#phone').value.trim(),email:$('#email').value.trim(),service:$('#service').value,area:Number($('#area').value),frequency:$('#frequency').value,website:$('#website').value,privacy_ack:$('#privacy').checked};try{const out=await api('/api/public/'+encodeURIComponent(slug)+'/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});$('#quoteMessage').className='msg';$('#quoteMessage').textContent='Votre demande n° '+(out.reference||'—')+' est enregistrée. Estimation : '+money(out.estimate||0)+'. L’entreprise doit maintenant vous recontacter.';$('#quoteForm').reset();calculate();}catch(err){$('#quoteMessage').className='msg err';$('#quoteMessage').textContent=err.message;}finally{btn.disabled=false;}}
init();
