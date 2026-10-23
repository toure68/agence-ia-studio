'use strict';
if(window.opener){window.opener.postMessage({type:'aia-mail-connected',account_id:Number(document.documentElement.dataset.mailAccount)||0,company_id:Number(document.documentElement.dataset.mailCompany)||0},location.origin);window.close();}
