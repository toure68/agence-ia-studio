'use strict';
let signatureObserver=null;
function quotationActions(q){
 const id=q.id,cid=company.id,s=q.signature;
 return `${s?`<p class="msg">Signature recueillie auprès de <strong>${clean(s.signer_name)}</strong> le ${timestamp(s.signed_at)}. Cette version est conservée sans modification.</p>`:''}<div class="row"><a class="btn primary" href="/api/companies/${cid}/quotations/${id}/pdf" target="_blank" rel="noopener">Télécharger PDF</a><a class="btn" href="/api/companies/${cid}/quotations/${id}/pdf?preview=true" target="_blank" rel="noopener">Voir le PDF</a>${!s?`<a class="btn" data-go="quote-edit" data-record-id="${id}" href="#/quote-edit/${id}">Modifier</a>${q.status!=='declined'?`<a class="btn" data-go="quote-sign" data-record-id="${id}" href="#/quote-sign/${id}">Signer le devis</a>`:''}`:'<a class="btn" data-go="quote-new" href="#/quote-new">Créer un nouveau devis</a>'}</div>`;
}

async function renderSignaturePage(id){
 const cid=company.id,q=await api(`/api/companies/${cid}/quotations/${id}`);
 if(q.signature)return openTab('quote',{recordId:id,replaceHistory:true});
 renderFormPage(`<h1>Signer ${clean(q.reference)}</h1><p class="signature-summary"><strong>${clean(q.data.title)}</strong><br>${clean(q.data.customer_name)} · ${quoteMoney(q.total_minor,q.data.currency)}</p><p>Relisez le devis, puis laissez la personne concernée saisir son nom et signer elle-même dans la zone ci-dessous.</p><a class="btn" href="/api/companies/${cid}/quotations/${id}/pdf?preview=true" target="_blank" rel="noopener">Lire le devis en PDF</a><form id="signatureForm" class="stack" data-no-dictation><div class="field"><label for="signerName">Nom et prénom de la personne qui signe</label><input id="signerName" type="text" maxlength="150" minlength="2" required autocomplete="name"></div><label for="signatureCanvas">Votre signature au doigt, au stylet ou à la souris</label><canvas id="signatureCanvas" class="signature-canvas" width="600" height="200" aria-label="Zone de signature manuscrite">Votre navigateur ne permet pas le tracé de signature.</canvas><p id="signatureStatus" class="tiny sub" role="status" aria-live="polite">Tracez votre signature dans le cadre.</p><button id="clearSignature" class="btn" type="button">Effacer et recommencer</button><label class="signature-consent"><input id="signatureConsent" type="checkbox" required><span>J’ai lu ce devis, je confirme être la personne nommée et je valide ma signature ainsi que son contenu.</span></label><button class="btn primary" type="submit">Signer et valider ce devis</button><p class="tiny sub">La signature sera enregistrée uniquement après cette validation.</p></form>`);
 const canvas=$('#signatureCanvas'),context=canvas.getContext('2d');let strokes=[],active=null,points=0;
 signatureObserver?.disconnect();
 function paint(){
  if(!canvas.isConnected)return;
  const box=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
  canvas.width=Math.round(box.width*ratio);canvas.height=Math.round(box.height*ratio);
  context.setTransform(ratio,0,0,ratio,0,0);context.lineWidth=2.2;context.lineCap='round';context.lineJoin='round';context.strokeStyle='#163d32';
  for(const stroke of strokes){context.beginPath();stroke.forEach((p,i)=>i?context.lineTo(p.x*box.width,p.y*box.height):context.moveTo(p.x*box.width,p.y*box.height));context.stroke();}
 }
 function position(e){const b=canvas.getBoundingClientRect();return {x:Number(Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)).toFixed(5)),y:Number(Math.max(0,Math.min(1,(e.clientY-b.top)/b.height)).toFixed(5))};}
 canvas.onpointerdown=e=>{if(active||strokes.length>=64||points>=5000)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);active={id:e.pointerId,stroke:[position(e)]};strokes.push(active.stroke);points++;};
 canvas.onpointermove=e=>{if(!active||active.id!==e.pointerId)return;e.preventDefault();if(points>=5000||active.stroke.length>=512){$('#signatureStatus').textContent='Tracé trop long : vous pouvez effacer et recommencer.';return;}const p=position(e),last=active.stroke.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)<.002)return;active.stroke.push(p);points++;paint();};
 function end(e){if(!active||active.id!==e.pointerId)return;if(active.stroke.length<2){points-=active.stroke.length;strokes.pop();}active=null;paint();$('#signatureStatus').textContent=strokes.length?'Signature tracée. Relisez et confirmez pour l’enregistrer.':'Tracez votre signature dans le cadre.';}
 canvas.onpointerup=end;canvas.onpointercancel=end;
 $('#clearSignature').onclick=()=>{strokes=[];active=null;points=0;$('#signatureConsent').checked=false;paint();$('#signatureStatus').textContent='Tracez votre signature dans le cadre.';};
 signatureObserver=new ResizeObserver(()=>{if(!canvas.isConnected){signatureObserver?.disconnect();return;}paint();});signatureObserver.observe(canvas);paint();
 $('#signatureForm').onsubmit=async e=>{
  e.preventDefault();if(active)return notify('Terminez le tracé avant de valider.');if(!strokes.length)return notify('Tracez votre signature avant de valider.');
  const button=e.submitter;button.disabled=true;
  try{await api(`/api/companies/${cid}/quotations/${id}/signature`,{method:'POST',body:JSON.stringify({signer_name:$('#signerName').value,confirmed:$('#signatureConsent').checked,content_hash:q.content_hash,strokes})});signatureObserver?.disconnect();await openTab('quote',{recordId:id,replaceHistory:true});notify('Signature enregistrée. Le PDF signé est disponible.');}
  catch(err){button.disabled=false;notify(err.message);}
 };
}
