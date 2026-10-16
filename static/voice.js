'use strict';
let activeRecognition=null,activeSpeechButton=null,speechQueue=[];
const speakerIcon='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const micIcon='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3m-3 0h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
function stopReading(){if(window.speechSynthesis)window.speechSynthesis.cancel();if(activeSpeechButton){activeSpeechButton.setAttribute('aria-pressed','false');activeSpeechButton=null;}speechQueue=[];}
function readAloud(text,button){
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return notify('Lecture vocale indisponible dans ce navigateur.');
 const stop=activeSpeechButton===button&&window.speechSynthesis.speaking;stopReading();if(stop)return;
 const content=text.trim().slice(0,30000);if(!content)return;
 activeSpeechButton=button;button.setAttribute('aria-pressed','true');
 const chunks=content.match(/[^.!?\n]{1,220}(?:[.!?\n]+|$)|.{1,220}/g)||[content];
 speechQueue=chunks.map(chunk=>{const u=new SpeechSynthesisUtterance(chunk);u.lang='fr-FR';const voice=speechSynthesis.getVoices().find(v=>v.lang==='fr-FR');if(voice)u.voice=voice;u.rate=1;return u;});
 const last=speechQueue[speechQueue.length-1];last.onend=()=>{if(activeSpeechButton===button){button.setAttribute('aria-pressed','false');activeSpeechButton=null;}};
 speechQueue.forEach(u=>{u.onerror=()=>stopReading();speechSynthesis.speak(u);});
}
function speechButton(getText,label='Lire à voix haute'){
 const b=document.createElement('button');b.type='button';b.className='voice-button';b.setAttribute('aria-label',label);b.title=label;b.setAttribute('aria-pressed','false');b.innerHTML=speakerIcon;b.onclick=()=>readAloud(getText(),b);return b;
}
function dictate(input,button){
 if(activeRecognition){activeRecognition.stop();return;}
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){input.focus();return notify('Pour dicter sur cet iPhone, utilisez le micro du clavier.');}
 const r=new Recognition();activeRecognition=r;r.lang='fr-FR';r.interimResults=false;r.continuous=false;
 const start=input.selectionStart??input.value.length,end=input.selectionEnd??start,original=input.value;
 button.setAttribute('aria-pressed','true');button.setAttribute('aria-label','Arrêter la dictée');
 r.onresult=e=>{const text=Array.from(e.results).map(result=>result[0].transcript).join(' ');input.value=original.slice(0,start)+(start&&original[start-1]!==' '?' ':'')+text+original.slice(end);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
 r.onerror=e=>notify(e.error==='not-allowed'?'Autorisez le microphone dans Safari, ou utilisez celui du clavier.':'La dictée est indisponible. Vous pouvez utiliser le micro du clavier.');
 r.onend=()=>{activeRecognition=null;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Dicter');};
 try{r.start();}catch(e){activeRecognition=null;button.setAttribute('aria-pressed','false');notify('Impossible de démarrer la dictée. Utilisez le micro du clavier.');}
}
function enhanceVoice(){
 document.querySelectorAll('#content input:not([type]),#content input[type="text"],#content input[type="search"],#content input[type="email"],#content input[type="tel"],#content textarea').forEach(input=>{
  if(input.dataset.voiceReady||input.readOnly||input.disabled)return;input.dataset.voiceReady='1';const b=document.createElement('button');b.type='button';b.className='voice-button dictation-button';b.setAttribute('aria-label','Dicter');b.title='Dicter';b.setAttribute('aria-pressed','false');b.innerHTML=micIcon+'<span>Dicter</span>';b.onclick=()=>dictate(input,b);input.insertAdjacentElement('afterend',b);
 });
 document.querySelectorAll('.priority-card').forEach(card=>{if(card.querySelector('.voice-button'))return;const title=card.querySelector('.priority-copy strong')?.textContent||'';const importance=card.querySelector('.importance')?.textContent||'';card.append(speechButton(()=>title+'. '+importance,'Écouter cette priorité'));});
 const back=document.querySelector('#moduleBack');if(back&&!back.querySelector('.voice-button'))back.append(speechButton(()=>document.querySelector('#content')?.innerText||'','Lire cette page'));
 const toast=document.querySelector('#toast');if(toast&&!toast.classList.contains('hide')&&!toast.querySelector('.voice-button')){const text=toast.textContent;toast.append(speechButton(()=>text,'Écouter cette notification'));}
}
window.addEventListener('DOMContentLoaded',()=>{new MutationObserver(()=>enhanceVoice()).observe(document.querySelector('#shell'),{childList:true,subtree:true});new MutationObserver(()=>enhanceVoice()).observe(document.querySelector('#toast'),{childList:true,attributes:true,attributeFilter:['class']});enhanceVoice();});
window.addEventListener('pagehide',()=>{stopReading();activeRecognition?.stop();});
