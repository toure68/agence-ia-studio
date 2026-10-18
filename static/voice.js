'use strict';
let activeSpeechButton=null,speechQueue=[];
const speakerIcon='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let speechRun=0,speechVoicesListener=null;
const speechMemory=new Map();
function speechStorageKey(){return 'aia-reading-'+(typeof me!=='undefined'&&me?.id?me.id:'device');}
function normalizeSpeechSettings(value={}){const rate=Number(value.rate);return {voice:typeof value.voice==='string'?value.voice:'',rate:Number.isFinite(rate)&&rate>=.8&&rate<=1.2?rate:.96};}
function speechSettings(){const key=speechStorageKey();if(speechMemory.has(key))return speechMemory.get(key);try{return normalizeSpeechSettings(JSON.parse(localStorage.getItem(key)||'{}'));}catch(e){return speechMemory.get(key)||normalizeSpeechSettings();}}
function saveSpeechSettings(value){const key=speechStorageKey(),settings=normalizeSpeechSettings(value);speechMemory.set(key,settings);try{localStorage.setItem(key,JSON.stringify(settings));}catch(e){}return settings;}
function speechVoiceKey(v){return v.voiceURI||v.name+'|'+v.lang;}
function frenchVoices(){const seen=new Set();return (window.speechSynthesis?.getVoices()||[]).filter(v=>/^fr(?:[-_]|$)/i.test(v.lang)&&!seen.has(speechVoiceKey(v))&&seen.add(speechVoiceKey(v)));}
function preferredVoice(settings){
 const voices=frenchVoices(),selected=voices.find(v=>speechVoiceKey(v)===settings.voice);if(selected)return selected;
 const score=v=>(/premium|enhanced|amélior|natural|neural/i.test(v.name)?100:0)+(v.localService!==false?20:0)+(/^fr[-_]fr$/i.test(v.lang)?10:0)+(v.default?5:0)-(/compact|espeak|mbrola/i.test(v.name)?40:0);
 return voices.slice().sort((a,b)=>score(b)-score(a))[0]||null;
}
function speechChunks(text){
 const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('fr',{granularity:'sentence'}).segment(text)].map(s=>s.segment):text.split(/(?<=[.!?])\s+|\n+/);
 const chunks=[];let current='';
 for(const segment of segments){
  const sentence=segment.trim();if(!sentence)continue;
  if(sentence.length<=850){if(current&&current.length+sentence.length+1>850){chunks.push(current);current='';}current+=(current?' ':'')+sentence;continue;}
  if(current){chunks.push(current);current='';}
  for(const word of sentence.split(/\s+/)){if(current&&current.length+word.length+1>850){chunks.push(current);current='';}current+=(current?' ':'')+word;}
 }
 if(current)chunks.push(current);return chunks;
}
function stopReading(){speechRun++;if(window.speechSynthesis)window.speechSynthesis.cancel();if(activeSpeechButton){activeSpeechButton.setAttribute('aria-pressed','false');activeSpeechButton=null;}speechQueue=[];}
function readAloud(text,button,preview=null){
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return notify('Lecture vocale indisponible dans ce navigateur.');
 const stop=activeSpeechButton===button&&window.speechSynthesis.speaking;stopReading();if(stop)return;
 const content=text.trim().slice(0,30000);if(!content)return;
 const run=speechRun,settings=preview?normalizeSpeechSettings(preview):speechSettings(),voice=preferredVoice(settings);
 activeSpeechButton=button;button.setAttribute('aria-pressed','true');
 speechQueue=speechChunks(content).map(chunk=>{const u=new SpeechSynthesisUtterance(chunk);u.lang=voice?.lang||'fr-FR';if(voice)u.voice=voice;u.rate=settings.rate;u.pitch=1;return u;});
 function next(){if(run!==speechRun)return;const u=speechQueue.shift();if(!u){button.setAttribute('aria-pressed','false');activeSpeechButton=null;return;}u.onend=next;u.onerror=()=>{if(run===speechRun)stopReading();};speechSynthesis.speak(u);}
 next();
}
function openSpeechSettings(){
 document.querySelector('.account-menu')?.removeAttribute('open');stopReading();const settings=speechSettings();
 openModal(`<h2>Voix de lecture</h2><p class="tiny sub">Choisissez la voix la plus agréable à l’écoute parmi celles proposées par votre appareil.</p><form id="speechSettingsForm" class="stack"><div class="field"><label for="speechVoice">Voix française</label><select id="speechVoice"></select></div><p id="speechAvailability" class="tiny sub" role="status"></p><div class="field"><label for="speechRate">Vitesse de lecture : <output id="speechRateValue"></output></label><input id="speechRate" type="range" min="0.8" max="1.2" step="0.01" value="${settings.rate}"></div><button id="speechTest" class="btn" type="button" aria-pressed="false">Écouter un exemple</button><button class="btn primary" type="submit">Enregistrer ma voix</button></form>`);
 const select=$('#speechVoice'),rate=$('#speechRate');let selected=settings.voice;
 function populate(){if(!select.isConnected)return;const voices=frenchVoices();select.replaceChildren(new Option('Choix automatique',''));for(const v of voices)select.add(new Option(v.name+' · '+v.lang+(v.localService===false?' · service du navigateur':''),speechVoiceKey(v)));if(selected&&voices.some(v=>speechVoiceKey(v)===selected))select.value=selected;$('#speechAvailability').textContent=voices.length?voices.length+' voix française(s) disponible(s).':"La voix française par défaut sera utilisée. Vous pouvez installer d’autres voix dans les réglages d’accessibilité de l’iPhone ; seules celles proposées par le navigateur apparaîtront ici.";}
 select.onchange=()=>{selected=select.value;stopReading();};rate.oninput=()=>{$('#speechRateValue').textContent=Number(rate.value).toLocaleString('fr-FR')+' ×';};rate.oninput();populate();
 if(window.speechSynthesis?.addEventListener){if(speechVoicesListener)speechSynthesis.removeEventListener('voiceschanged',speechVoicesListener);speechVoicesListener=()=>{if(select.isConnected)populate();else{speechSynthesis.removeEventListener('voiceschanged',speechVoicesListener);speechVoicesListener=null;}};speechSynthesis.addEventListener('voiceschanged',speechVoicesListener);}
 $('#speechTest').onclick=e=>readAloud('Bonjour. Voici votre lecture. Vous pouvez écouter vos messages, vérifier vos priorités et avancer à votre rythme.',e.currentTarget,{voice:select.value,rate:Number(rate.value)});
 $('#speechSettingsForm').onsubmit=e=>{e.preventDefault();saveSpeechSettings({voice:select.value,rate:Number(rate.value)});stopReading();closeModal();notify('Votre voix de lecture est enregistrée sur cet appareil.');};
}
function speechButton(getText,label='Lire à voix haute'){
 const b=document.createElement('button');b.type='button';b.className='voice-button';b.setAttribute('aria-label',label);b.title=label;b.setAttribute('aria-pressed','false');b.innerHTML=speakerIcon;b.onclick=()=>readAloud(getText(),b);return b;
}
function enhanceVoice(){
 document.querySelectorAll('.priority-card').forEach(card=>{if(card.querySelector('.voice-button'))return;const title=card.querySelector('.priority-copy strong')?.textContent||'';const importance=card.querySelector('.importance')?.textContent||'';const detail=card.querySelector('.priority-description')?.textContent||'';card.append(speechButton(()=>[title,importance,detail].filter(Boolean).join('. '),'Écouter cette priorité'));});
 const back=document.querySelector('#moduleBack');if(back&&!back.querySelector('.voice-button'))back.append(speechButton(()=>document.querySelector('#content')?.innerText||'','Lire cette page'));
 const toast=document.querySelector('#toast');if(toast&&!toast.classList.contains('hide')&&!toast.querySelector('.voice-button')){const text=toast.textContent;toast.append(speechButton(()=>text,'Écouter cette notification'));}
}
window.addEventListener('DOMContentLoaded',()=>{new MutationObserver(()=>enhanceVoice()).observe(document.querySelector('#shell'),{childList:true,subtree:true});new MutationObserver(()=>enhanceVoice()).observe(document.querySelector('#toast'),{childList:true,attributes:true,attributeFilter:['class']});enhanceVoice();});
window.addEventListener('pagehide',()=>{stopReading();});

