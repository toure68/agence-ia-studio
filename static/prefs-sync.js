'use strict';
// Home settings kept in the account (22/10): reader mode, trial messages and function grid follow the user on
// any phone or address. At sign-in the account values are written on this phone before the home is drawn;
// each change made here is sent back to the account. Wallpaper already works this way (wallpaper.js).
const prefsSync=(()=>{
 const MAP={reader:'aia-reader',samples:'aia-reader-samples',reader_screen:'aia-reader-screen',grid:'aia-pages-grid'};
 let sending=false,timer=0,pending={};
 function apply(prefs){
  if(!prefs||typeof prefs!=='object')return;
  sending=true;
  try{for(const [k,key] of Object.entries(MAP)){if(prefs[k]===undefined)continue;localStorage.setItem(key,k==='grid'?JSON.stringify(prefs[k]):String(prefs[k]));}}catch(e){}
  sending=false;
  window.homeReader?.syncAppearance?.();
 }
 function send(){timer=0;const body=pending;pending={};if(typeof api!=='function'||!Object.keys(body).length)return;api('/api/me/prefs',{method:'PUT',body:JSON.stringify(body)}).catch(()=>{});}
 try{
  const base=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   base.call(this,key,value);
   if(sending||this!==window.localStorage||typeof me==='undefined'||!me)return;
   const k=Object.keys(MAP).find(x=>MAP[x]===key);if(!k)return;
   try{pending[k]=k==='grid'?JSON.parse(value):String(value);}catch(e){return;}
   clearTimeout(timer);timer=setTimeout(send,400);
  };
 }catch(e){}
 return {apply};
})();
window.applyPrefs=prefs=>prefsSync.apply(prefs);
