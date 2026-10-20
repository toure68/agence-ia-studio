'use strict';
// Phone habits, not a copy of the phone (user request 2026-10-20): every field calls the phone's own tools.
// The right native keyboard (phone pad, @, decimal, numbers, .com), the phone's autofill (name, e-mail,
// address, postal code), capitals on names, no autocorrect on e-mails/web addresses, "Rechercher" key on searches.
// Only attributes are added (never the field type), so no new validation can block an existing form.
(()=>{
 const RULES=[
  {re:/phone|^tel|_tel|mobile|portable/i,set:{inputmode:'tel',autocomplete:'tel'}},
  {re:/e-?mail|courriel/i,set:{inputmode:'email',autocomplete:'email',autocapitalize:'off',autocorrect:'off',spellcheck:'false'}},
  {re:/website|site_?web|url/i,set:{inputmode:'url',autocomplete:'url',autocapitalize:'off',autocorrect:'off',spellcheck:'false'}},
  {re:/postal|zip|cp$/i,set:{inputmode:'numeric',autocomplete:'postal-code'}},
  {re:/siret|siren/i,set:{inputmode:'numeric',autocomplete:'off'}},
  {re:/iban/i,set:{autocapitalize:'characters',autocorrect:'off',spellcheck:'false',autocomplete:'off'}},
  {re:/address|adresse/i,set:{autocomplete:'street-address'}},
  {re:/city|ville/i,set:{autocomplete:'address-level2',autocapitalize:'words'}},
  {re:/amount|price|prix|montant|balance|solde|vat|tva|rate|budget|usd$|_eur|cost|cout/i,set:{inputmode:'decimal'}},
  {re:/quantity|qty|quantite|calls$|reserved/i,set:{inputmode:'numeric'}},
  {re:/fullname|full_name|customer_name|signer|contact|responsible|assignee|client_?name|^name$/i,set:{autocapitalize:'words'}}
 ];
 const SKIP=/^(hidden|checkbox|radio|file|submit|button|range|color|date|time|datetime-local|month|week|password)$/;
 function tune(el){
  if(el.dataset.native==='1')return;el.dataset.native='1';
  const type=(el.getAttribute('type')||'text').toLowerCase();
  if(el.tagName==='INPUT'&&SKIP.test(type))return;
  if(type==='search'){if(!el.hasAttribute('enterkeyhint'))el.setAttribute('enterkeyhint','search');return;}
  const key=[el.name,el.id,el.getAttribute('aria-label')||''].join(' ');
  if(type==='email')Object.entries(RULES[1].set).forEach(([k,v])=>{if(!el.hasAttribute(k))el.setAttribute(k,v);});
  if(type==='tel'&&!el.hasAttribute('autocomplete'))el.setAttribute('autocomplete','tel');
  if(type==='number'&&!el.hasAttribute('inputmode'))el.setAttribute('inputmode',/\.|any/.test(el.getAttribute('step')||'')?'decimal':'numeric');
  if(el.tagName==='TEXTAREA'){if(!el.hasAttribute('autocapitalize'))el.setAttribute('autocapitalize','sentences');if(/address|adresse/i.test((el.name||'')+' '+(el.id||''))&&!el.hasAttribute('autocomplete'))el.setAttribute('autocomplete','street-address');return;}
  if(type!=='text'&&type!=='tel'&&type!=='email'&&type!=='url')return;
  // One rule per field: the first matching one (phone before e-mail before the others).
  const rule=RULES.find(r=>r.re.test(el.name||'')||r.re.test(el.id||''))||RULES.find(r=>r.re.test(key));
  if(!rule)return;
  for(const [k,v] of Object.entries(rule.set))if(!el.hasAttribute(k))el.setAttribute(k,v);
 }
 const scan=root=>{if(root.matches?.('input,textarea'))tune(root);root.querySelectorAll?.('input,textarea').forEach(tune);};
 const start=()=>{scan(document);new MutationObserver(list=>{for(const m of list)m.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n);});}).observe(document.body,{childList:true,subtree:true});};
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
 window.nativeFields={tune,scan};
})();
