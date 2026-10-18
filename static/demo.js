'use strict';
if(document.body.dataset.publicDemo==='true'){
 const style=document.createElement('style');
 style.textContent='.demo-notice{padding:9px 14px;text-align:center;font:12px/1.4 Manrope,sans-serif;background:#111820;color:#e0e6ec;border-bottom:1px solid #303640}body[data-public-demo] #auth,body[data-public-demo] #logout,body[data-public-demo] #passwordBtn{display:none!important}';
 document.head.append(style);
 const explain=()=>notify('Démonstration en lecture seule : les modifications, connexions et envois sont désactivés.');
 document.addEventListener('click',e=>{
  const link=e.target.closest('a[href]');
  if(link){const url=new URL(link.href,location.href);if(url.origin===location.origin&&(/^\/api\//.test(url.pathname)||/^\/site\//.test(url.pathname))){e.preventDefault();explain();}}
  if(e.target.closest('#chatConnect,#chatMic,#chatAttachMenu')){e.preventDefault();e.stopImmediatePropagation();explain();}
 },true);
 document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();explain();},true);
}
