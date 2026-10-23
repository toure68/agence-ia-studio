"""Nylas adapter. No provider credentials in the browser; no sends from sync/webhooks."""
import asyncio
import base64
import gzip
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from html import escape, unescape
from urllib.parse import quote, urlencode

import httpx
from cryptography.fernet import InvalidToken
from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field
from typing import Literal

MAX_FILE=8*1024*1024
MAX_FILES=16*1024*1024


def init_schema(db):
    with db() as con:
        additions={'mail_accounts':{'provider':"TEXT NOT NULL DEFAULT 'gmail'",'grant_hash':"TEXT NOT NULL DEFAULT ''",'last_change':'REAL NOT NULL DEFAULT 0','mail_service':"TEXT NOT NULL DEFAULT ''",'inbox_id':"TEXT NOT NULL DEFAULT ''",'auth_invalid':'INTEGER NOT NULL DEFAULT 0'},
          'mail_messages':{'provider':"TEXT NOT NULL DEFAULT 'gmail'",'remote_id':"TEXT NOT NULL DEFAULT ''",'attachments':"TEXT NOT NULL DEFAULT '[]'",'folders':"TEXT NOT NULL DEFAULT '[]'",'unread':'INTEGER NOT NULL DEFAULT 1','archived':'INTEGER NOT NULL DEFAULT 0','remote_deleted':'INTEGER NOT NULL DEFAULT 0'}}
        for table,fields in additions.items():
            existing={r['name'] for r in con.execute('PRAGMA table_info('+table+')')}
            for name,definition in fields.items():
                if name not in existing:con.execute('ALTER TABLE '+table+' ADD COLUMN '+name+' '+definition)
        con.executescript('''
        CREATE INDEX IF NOT EXISTS idx_mail_grant ON mail_accounts(grant_hash);
        CREATE TABLE IF NOT EXISTS mail_unified_states(state TEXT PRIMARY KEY,user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,expires REAL NOT NULL,account_key TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS mail_compositions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,source_id INTEGER,mode TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,payload BLOB NOT NULL,account_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',sent_id TEXT NOT NULL DEFAULT '',operation TEXT NOT NULL,updated REAL NOT NULL,subject TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS mail_events(id TEXT PRIMARY KEY,grant_hash TEXT NOT NULL,remote_id TEXT NOT NULL,kind TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,due REAL NOT NULL DEFAULT 0,claimed REAL NOT NULL DEFAULT 0,done INTEGER NOT NULL DEFAULT 0);
        ''')
        if 'subject' not in {r['name'] for r in con.execute('PRAGMA table_info(mail_compositions)')}:con.execute("ALTER TABLE mail_compositions ADD COLUMN subject TEXT NOT NULL DEFAULT ''")
        if 'account_key' not in {r['name'] for r in con.execute('PRAGMA table_info(mail_unified_states)')}:con.execute("ALTER TABLE mail_unified_states ADD COLUMN account_key TEXT NOT NULL DEFAULT ''")

        con.execute("CREATE TABLE IF NOT EXISTS mail_connections(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,email TEXT NOT NULL DEFAULT '',token TEXT NOT NULL DEFAULT '',keywords TEXT NOT NULL DEFAULT 'Activité',automatic INTEGER NOT NULL DEFAULT 1,cursor TEXT NOT NULL DEFAULT '',last_sync REAL NOT NULL DEFAULT 0,syncing INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',provider TEXT NOT NULL DEFAULT 'nylas',grant_hash TEXT NOT NULL DEFAULT '',last_change REAL NOT NULL DEFAULT 0,mail_service TEXT NOT NULL DEFAULT '',inbox_id TEXT NOT NULL DEFAULT '',auth_invalid INTEGER NOT NULL DEFAULT 0,service TEXT NOT NULL DEFAULT '',UNIQUE(user_id,company_id,grant_hash))")
        for table,fields in {'mail_messages':{'connection_id':'INTEGER NOT NULL DEFAULT 0'},'mail_compositions':{'connection_id':'INTEGER NOT NULL DEFAULT 0'},'mail_unified_states':{'connection_id':'INTEGER NOT NULL DEFAULT 0','service':"TEXT NOT NULL DEFAULT ''"}}.items():
            existing={r['name'] for r in con.execute('PRAGMA table_info('+table+')')}
            for name,definition in fields.items():
                if name not in existing:con.execute('ALTER TABLE '+table+' ADD COLUMN '+name+' '+definition)


class FileData(BaseModel):
    name:str=Field(min_length=1,max_length=180)
    content_type:str=Field(default='application/octet-stream',max_length=120)
    data:str=Field(max_length=12*1024*1024)


class Composition(BaseModel):
    id:int|None=None
    revision:int=0
    source_id:int|None=None
    mode:Literal['new','reply','forward']='new'
    to:str=Field(default='',max_length=500)
    subject:str=Field(default='',max_length=300)
    body:str=Field(default='',max_length=30000)
    files:list[FileData]=Field(default_factory=list,max_length=4)
    forwarded:list[str]=Field(default_factory=list,max_length=30)


class Confirm(BaseModel):
    revision:int=Field(gt=0)
    confirmed:bool=False


class ConnectIntent(BaseModel):
    replace_confirmed:bool=False
    add:bool=False
    service:str=Field(default='',max_length=40)
    login_hint:str=Field(default='',max_length=254)


class MailAction(BaseModel):
    action:Literal['read','unread','archive','move']
    folder_id:str=Field(default='',max_length=512)


def install(app,db,require,own_company,cipher,account,message,scope,category,TextOnly,throttle):
    # Request-local selection, copied by FastAPI into each sync worker. Never a global active mailbox.
    selected=ContextVar('mail_connection',default=0)
    legacy_scope,legacy_account,legacy_message=scope,account,message
    def scope(req,cid,write=False):
        uid=legacy_scope(req,cid,write)
        try:aid=int(req.query_params.get('account_id','0'))
        except ValueError:raise HTTPException(422,'Boîte invalide.')
        if aid<0:raise HTTPException(422,'Boîte invalide.')
        selected.set(aid)
        if aid:
            with db() as con:account(con,uid,cid)
        return uid
    def account(con,uid,cid,aid=None):
        aid=selected.get() if aid is None else aid
        if not aid:return {**legacy_account(con,uid,cid),'connection_id':0}
        r=con.execute('SELECT * FROM mail_connections WHERE id=? AND user_id=? AND company_id=?',(aid,uid,cid)).fetchone()
        if not r:raise HTTPException(404,'Boîte introuvable.')
        return {**dict(r),'connection_id':aid}
    def message(con,uid,cid,mid):
        m=legacy_message(con,uid,cid,mid)
        if m['connection_id']!=selected.get():raise HTTPException(404,'E-mail introuvable dans cette boîte.')
        return m
    def update_account(con,a,values):
        table='mail_connections' if a.get('connection_id') else 'mail_accounts'
        where='id=? AND user_id=? AND company_id=?' if a.get('connection_id') else 'user_id=? AND company_id=?'
        args=([a['connection_id']] if a.get('connection_id') else [])+[a['user_id'],a['company_id']]
        con.execute('UPDATE '+table+' SET '+','.join(k+'=?' for k in values)+' WHERE '+where, list(values.values())+args)
    def config():
        region=os.environ.get('NYLAS_REGION','eu')
        return {'key':os.environ.get('NYLAS_API_KEY',''),'client':os.environ.get('NYLAS_CLIENT_ID',''),
          'redirect':os.environ.get('NYLAS_REDIRECT_URI',''),'base':'https://api.'+('us' if region=='us' else 'eu')+'.nylas.com/v3'}
    def ready():return all(config()[k] for k in ('key','client','redirect'))
    def grant(a,check_valid=True):
        if check_valid and a.get('auth_invalid'):raise HTTPException(409,'Autorisation expirée : reconnectez votre messagerie.')
        if a.get('provider')!='nylas' or not a['token']:raise HTTPException(409,'Connectez votre messagerie unifiée.')
        try:return cipher.decrypt(a['token'].encode()).decode()
        except InvalidToken:raise HTTPException(409,'Reconnectez votre messagerie.')
    def key(a):return a.get('grant_hash') or hashlib.sha256(a['token'].encode()).hexdigest()
    def call(method,path,**kw):
        cfg=config()
        if not cfg['key']:raise HTTPException(503,'Le service de messagerie unifiée reste à configurer.')
        headers={'Authorization':'Bearer '+cfg['key'],**kw.pop('headers',{})};missing_ok=kw.pop('missing_ok',False)
        try:
            r=httpx.request(method,cfg['base']+path,headers=headers,timeout=30,follow_redirects=False,**kw)
            if r.status_code==404 and missing_ok:return r
            if r.status_code>=400:raise HTTPException(429 if r.status_code==429 else 502,'Le fournisseur de messagerie a refusé la demande. Vérifiez la connexion et réessayez plus tard.')
            return r
        except httpx.HTTPError:raise HTTPException(502,'Le service de messagerie ne répond pas.')
    def data(method,path,**kw):
        try:return call(method,path,**kw).json()
        except (ValueError,TypeError):raise HTTPException(502,'Réponse de messagerie invalide.')
    def prefix(a):return '/grants/'+quote(grant(a),safe='')
    def current(uid,cid):
        with db() as con:
            a=account(con,uid,cid);grant(a)
        return a
    def unchanged(con,uid,cid,a):
        if account(con,uid,cid,a.get('connection_id',0))['token']!=a['token']:raise HTTPException(409,'La connexion a changé. Rouvrez la messagerie.')
    def text(raw):
        p=TextOnly();p.feed(str(raw or ''));return unescape(''.join(p.parts))[:30000]
    def upsert(uid,cid,a,obj):
        rid=str(obj.get('id',''))[:512]
        if not rid:return None
        sender=obj.get('from') or [];who=sender[0] if sender else {};address=str(who.get('email',''))
        reply=(obj.get('reply_to') or sender or [{}])[0].get('email','')
        subject=str(obj.get('subject') or 'Sans objet')[:300];body=text(obj.get('body') or obj.get('snippet'))
        parts=[{k:f.get(k) for k in ('id','filename','content_type','size','is_inline')} for f in (obj.get('attachments') or [])[:100] if f.get('id')]
        received=datetime.fromtimestamp(int(obj.get('date') or time.time()),timezone.utc).isoformat()
        outgoing=address.casefold()==a['email'].casefold();folders=obj.get('folders') or []
        if outgoing:reply=(obj.get('to') or [{}])[0].get('email','')
        archived=int(bool(a.get('inbox_id')) and a['inbox_id'] not in folders)
        gid='nylas:'+hashlib.sha256(grant(a).encode()).hexdigest()+':'+rid
        with db() as con:
            unchanged(con,uid,cid,a)
            update_account(con,a,{'last_change':time.time()})
            con.execute('''INSERT INTO mail_messages(user_id,company_id,gmail_id,thread_id,sender,reply_to,subject,body,received,category,provider,remote_id,attachments,folders,unread,send_status,archived,connection_id)
              VALUES (?,?,?,?,?,?,?,?,?,?,'nylas',?,?,?,?,?,?,?) ON CONFLICT(user_id,company_id,gmail_id) DO UPDATE SET subject=excluded.subject,body=excluded.body,sender=excluded.sender,reply_to=excluded.reply_to,attachments=excluded.attachments,folders=excluded.folders,unread=excluded.unread,archived=excluded.archived,remote_deleted=0''',
              (uid,cid,gid,str(obj.get('thread_id') or rid)[:512],(str(who.get('name') or '')+' <'+address+'>')[:500],reply[:300],subject,body,received,category(subject+' '+body),rid,json.dumps(parts),json.dumps(folders),int(bool(obj.get('unread',False))),'sent' if outgoing else 'draft',archived,a.get('connection_id',0)))
            return con.execute('SELECT id FROM mail_messages WHERE user_id=? AND company_id=? AND gmail_id=?',(uid,cid,gid)).fetchone()['id']
    def synchronize(uid,cid,aid=0):
        selected.set(aid);a=current(uid,cid)
        with db() as con:
            table='mail_connections' if aid else 'mail_accounts'
            claimed=con.execute('UPDATE '+table+' SET syncing=1,last_sync=? WHERE user_id=? AND company_id=?'+(' AND id=?' if aid else '')+' AND (syncing=0 OR last_sync<?)',(time.time(),uid,cid,*([aid] if aid else []),time.time()-300))
            if claimed.rowcount!=1:raise HTTPException(409,'Synchronisation déjà en cours.')
        try:
            fs=data('GET',prefix(a)+'/folders',params={'limit':200}).get('data',[])
            inbox=next((f['id'] for f in fs if '\\Inbox' in (f.get('attributes') or [])),'')
            if not inbox:raise HTTPException(409,'Le dossier Réception n’est pas encore disponible. Réessayez dans quelques minutes.')
            a['inbox_id']=inbox
            with db() as con:
                unchanged(con,uid,cid,a);update_account(con,a,{'inbox_id':inbox})
            params={'limit':50}
            if a['cursor']:params['page_token']=a['cursor']
            listing=data('GET',prefix(a)+'/messages',params=params)
            count=0
            for obj in listing.get('data',[]):
                if upsert(uid,cid,a,obj):count+=1
            with db() as con:
                unchanged(con,uid,cid,a)
                update_account(con,a,{'cursor':listing.get('next_cursor') or '', 'error':''})
            return {'imported':count,'more':bool(listing.get('next_cursor'))}
        except HTTPException as e:
            with db() as con:update_account(con,a,{'error':str(e.detail)})
            raise
        finally:
            with db() as con:update_account(con,a,{'syncing':0})
    def revoke(uid,cid,a):
        # A grant may be shared by explicitly connected company scopes.
        with db() as con:
            others=con.execute('SELECT count(*) FROM mail_accounts WHERE grant_hash=? AND NOT (user_id=? AND company_id=?) AND length(token)>0',(a['grant_hash'],uid,cid)).fetchone()[0]
        with db() as con:others+=con.execute('SELECT count(*) FROM mail_connections WHERE grant_hash=? AND id<>? AND length(token)>0',(a['grant_hash'],a.get('connection_id',0))).fetchone()[0]
        if not others:call('DELETE','/grants/'+quote(grant(a,False),safe=''),missing_ok=True)
    def disconnect(uid,cid,a):
        # On revocation failure retain the local reference so the user can retry.
        revoke(uid,cid,a)
        with db() as con:
            con.execute('DELETE FROM mail_compositions WHERE user_id=? AND company_id=? AND connection_id=?',(uid,cid,a.get('connection_id',0)))
            con.execute('DELETE FROM mail_unified_states WHERE user_id=? AND company_id=? AND connection_id=?',(uid,cid,a.get('connection_id',0)))
    def public(m):
        result={k:v for k,v in m.items() if k not in ('gmail_id','remote_id','message_id')}
        result['attachments']=json.loads(m['attachments']);return result

    @app.get('/api/companies/{cid}/mail/unified/accounts')
    def connections(cid:int,req:Request):
        uid=scope(req,cid)
        from mail_providers import PROVIDERS
        with db() as con:
            rows=[{**dict(r),'connection_id':0} for r in con.execute("SELECT * FROM mail_accounts WHERE user_id=? AND company_id=? AND token<>''",(uid,cid))]
            rows += [{**dict(r),'connection_id':r['id']} for r in con.execute('SELECT * FROM mail_connections WHERE user_id=? AND company_id=? ORDER BY id',(uid,cid))]
        def display(a):
            service=a.get('service') or ('gmail' if a['provider']=='gmail' or a.get('mail_service')=='google' else 'outlook' if a.get('mail_service')=='microsoft' else a.get('mail_service'))
            service=service if service in PROVIDERS else 'other'
            connected=bool(a['token']) and not a.get('auth_invalid') and (a['provider']=='gmail' or bool(config()['key']))
            return {'id':a['connection_id'],'email':a['email'],'service':service,'connected':connected,'error':bool(a.get('error')),'legacy':a['provider']=='gmail'}
        return {'configured':ready(),'providers':[{'id':k,**v} for k,v in PROVIDERS.items()],'accounts':[display(a) for a in rows]}

    @app.get('/api/companies/{cid}/mail/unified/boxes/{aid}/status')
    def box_status(cid:int,aid:int,req:Request):
        uid=scope(req,cid);selected.set(aid)
        with db() as con:a=account(con,uid,cid)
        return {'configured':ready(),'connected':bool(a['token']) and not a['auth_invalid'] and bool(config()['key']),'provider':'nylas','connection_id':aid,'email':a['email'],'error':a['error'],'keywords':a['keywords'],'automatic':bool(a['automatic']),'realtime':bool(os.environ.get('NYLAS_WEBHOOK_SECRET'))}

    @app.get('/api/companies/{cid}/mail/unified/boxes/{aid}/messages')
    def box_messages(cid:int,aid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            account(con,uid,cid,aid)
            return [dict(r) for r in con.execute('SELECT id,sender,subject,received,category,send_status,revision,provider,unread,archived,connection_id FROM mail_messages WHERE user_id=? AND company_id=? AND connection_id=? AND remote_deleted=0 ORDER BY id DESC LIMIT 1000',(uid,cid,aid))]

    @app.put('/api/companies/{cid}/mail/unified/boxes/{aid}/settings')
    def box_settings(cid:int,aid:int,payload:dict,req:Request):
        uid=scope(req,cid,True)
        keywords=payload.get('keywords','')
        if not isinstance(keywords,str) or not 2<=len(keywords)<=500:raise HTTPException(422,'Précisez vos activités (2 à 500 caractères).')
        with db() as con:
            a=account(con,uid,cid,aid);update_account(con,a,{'keywords':keywords,'automatic':int(bool(payload.get('automatic'))),'cursor':''})
        return {'ok':True}

    @app.post('/api/companies/{cid}/mail/unified/boxes/{aid}/sync')
    def box_sync(cid:int,aid:int,req:Request):
        return synchronize(scope(req,cid,True),cid,aid)

    @app.post('/api/companies/{cid}/mail/unified/boxes/{aid}/disconnect')
    def box_disconnect(cid:int,aid:int,req:Request):
        uid=scope(req,cid,True)
        if aid<=0:raise HTTPException(422,'Utilisez la déconnexion de la boîte principale.')
        with db() as con:a=account(con,uid,cid,aid)
        disconnect(uid,cid,a)
        with db() as con:
            mids=[r[0] for r in con.execute('SELECT id FROM mail_messages WHERE user_id=? AND company_id=? AND connection_id=?',(uid,cid,aid))]
            for mid in mids:con.execute('DELETE FROM mail_ai WHERE user_id=? AND company_id=? AND message_id=?',(uid,cid,mid))
            con.execute('DELETE FROM mail_messages WHERE user_id=? AND company_id=? AND connection_id=?',(uid,cid,aid))
            con.execute('DELETE FROM mail_connections WHERE id=? AND user_id=? AND company_id=?',(aid,uid,cid))
        return {'ok':True}

    @app.get('/api/companies/{cid}/mail/unified/status')
    def status(cid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            try:a=account(con,uid,cid)
            except HTTPException as e:
                if selected.get():raise
                a={}
        return {'configured':ready(),'connected':a.get('provider')=='nylas' and bool(a.get('token')) and not a.get('auth_invalid') and bool(config()['key']),'provider':a.get('provider','nylas'),
          'email':a.get('email',''),'error':a.get('error',''),'last_sync':a.get('last_sync',0),'realtime':bool(os.environ.get('NYLAS_WEBHOOK_SECRET')),'connection_id':a.get('connection_id',0)}

    @app.get('/api/companies/{cid}/mail/unified/version')
    def version(cid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            try:a=account(con,uid,cid)
            except HTTPException:a={}
        return {'version':a.get('last_change',0)}

    @app.post('/api/companies/{cid}/mail/unified/connect')
    def connect(cid:int,req:Request,payload:ConnectIntent|None=None):
        uid=scope(req,cid,True);throttle('mail-connect:'+str(uid),10,3600)
        if not ready():raise HTTPException(503,'Le service de messagerie unifiée reste à configurer.')
        from mail_providers import PROVIDERS
        service=payload.service if payload else ''
        if service and service not in PROVIDERS:raise HTTPException(422,'Messagerie inconnue. Choisissez Autre messagerie.')
        state=secrets.token_urlsafe(40);cfg=config();adding=bool(payload and payload.add)
        aid=-1 if adding else selected.get()
        with db() as con:
            old=None if adding else (account(con,uid,cid) if selected.get() else con.execute('SELECT * FROM mail_accounts WHERE user_id=? AND company_id=?',(uid,cid)).fetchone())
            oldkey=hashlib.sha256(old['token'].encode()).hexdigest() if old else ''
            if old and old['token'] and not (payload and payload.replace_confirmed):raise HTTPException(409,'Confirmez le remplacement de la connexion actuelle avant de continuer.')
            con.execute('DELETE FROM mail_unified_states WHERE expires<?',(time.time(),))
            con.execute('INSERT INTO mail_unified_states(state,user_id,company_id,expires,account_key,connection_id,service) VALUES (?,?,?,?,?,?,?)',(hashlib.sha256(state.encode()).hexdigest(),uid,cid,time.time()+600,oldkey,aid,service))
        params={'client_id':cfg['client'],'redirect_uri':cfg['redirect'],'response_type':'code','state':state}
        if service:params['provider']=PROVIDERS[service]['provider']
        if payload and payload.login_hint:params['login_hint']=payload.login_hint.strip()
        return {'url':cfg['base']+'/connect/auth?'+urlencode(params)}

    @app.get('/api/mail/unified/callback')
    def callback(req:Request,state:str='',code:str='',error:str=''):
        user=require(req);digest=hashlib.sha256(state.encode()).hexdigest()
        with db() as con:
            r=con.execute('SELECT * FROM mail_unified_states WHERE state=? AND user_id=? AND expires>?',(digest,user['id'],time.time())).fetchone()
            if not r:raise HTTPException(400,'Autorisation expirée ou invalide.')
            cid=r['company_id'];require(req,tenant_id=cid,write=False);own_company(con,cid)
            if con.execute('DELETE FROM mail_unified_states WHERE state=?',(digest,)).rowcount!=1:raise HTTPException(400,'Autorisation déjà utilisée.')
        if error or not code:raise HTTPException(400,'Connexion annulée. Vous pouvez fermer cette fenêtre.')
        cfg=config();result=data('POST','/connect/token',json={'client_id':cfg['client'],'client_secret':cfg['key'],'grant_type':'authorization_code','code':code,'redirect_uri':cfg['redirect']})
        gid=result.get('grant_id');email=result.get('email','')
        if not gid:raise HTTPException(502,'Autorisation de messagerie incomplète.')
        info=data('GET','/grants/'+quote(gid,safe='')).get('data',{});email=info.get('email') or email
        if not email:raise HTTPException(502,'Adresse de la boîte indisponible.')
        if r['connection_id']!=0:
            aid=r['connection_id'];gh=hashlib.sha256(gid.encode()).hexdigest()
            with db() as con:
                con.execute('BEGIN IMMEDIATE')
                default=con.execute("SELECT * FROM mail_accounts WHERE user_id=? AND company_id=? AND provider='nylas' AND grant_hash=?",(user['id'],cid,gh)).fetchone()
                if default:raise HTTPException(409,'Cette boîte est déjà connectée. Retrouvez-la dans vos messageries.')
                existing=con.execute('SELECT * FROM mail_connections WHERE user_id=? AND company_id=? AND grant_hash=?',(user['id'],cid,gh)).fetchone()
                if aid>0:
                    old=account(con,user['id'],cid,aid)
                    if hashlib.sha256(old['token'].encode()).hexdigest()!=r['account_key'] or old['grant_hash']!=gh:raise HTTPException(409,'Choisissez la même boîte pour la reconnecter. Pour une autre adresse, utilisez Ajouter un compte.')
                elif existing:aid=existing['id']
                values=(user['id'],cid,email,cipher.encrypt(gid.encode()).decode(),gh,str(info.get('provider') or '')[:30],r['service'])
                con.execute("INSERT INTO mail_connections(user_id,company_id,email,token,grant_hash,mail_service,service) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,company_id,grant_hash) DO UPDATE SET email=excluded.email,token=excluded.token,error='',auth_invalid=0,last_sync=0",values)
                aid=con.execute('SELECT id FROM mail_connections WHERE user_id=? AND company_id=? AND grant_hash=?',(user['id'],cid,gh)).fetchone()['id']
                con.commit()
            return callback_page(cid,aid)
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            old=con.execute('SELECT * FROM mail_accounts WHERE user_id=? AND company_id=?',(user['id'],cid)).fetchone()
            if con.execute('SELECT 1 FROM mail_connections WHERE user_id=? AND company_id=? AND grant_hash=?',(user['id'],cid,hashlib.sha256(gid.encode()).hexdigest())).fetchone():raise HTTPException(409,'Cette boîte est déjà connectée. Retrouvez-la dans vos messageries.')
            oldkey=hashlib.sha256(old['token'].encode()).hexdigest() if old else ''
            if oldkey!=r['account_key']:raise HTTPException(409,'Une autre connexion a été modifiée entre-temps. Recommencez.')
            if old and old['token'] and (old['provider']!='nylas' or old['grant_hash']!=hashlib.sha256(gid.encode()).hexdigest()):
                if old['provider']=='nylas':revoke(user['id'],cid,dict(old))
                now=con.execute('SELECT token FROM mail_accounts WHERE user_id=? AND company_id=?',(user['id'],cid)).fetchone()
                if not now or now['token']!=old['token']:raise HTTPException(409,'La connexion a changé entre-temps. Recommencez.')
                con.execute('DELETE FROM mail_messages WHERE user_id=? AND company_id=? AND connection_id=0',(user['id'],cid));con.execute('DELETE FROM mail_ai WHERE user_id=? AND company_id=? AND message_id NOT IN (SELECT id FROM mail_messages)',(user['id'],cid));con.execute('DELETE FROM mail_compositions WHERE user_id=? AND company_id=? AND connection_id=0',(user['id'],cid))
            con.execute("INSERT INTO mail_accounts(user_id,company_id,email,token,provider,grant_hash,keywords,automatic,mail_service) VALUES (?,?,?,?,'nylas',?,'Activité',1,?) ON CONFLICT(user_id,company_id) DO UPDATE SET email=excluded.email,token=excluded.token,provider='nylas',grant_hash=excluded.grant_hash,cursor='',error='',last_sync=0,mail_service=excluded.mail_service,inbox_id='',auth_invalid=0",(user['id'],cid,email,cipher.encrypt(gid.encode()).decode(),hashlib.sha256(gid.encode()).hexdigest(),str(info.get('provider') or '')[:30]))
            con.commit()
        return callback_page(cid)

    def callback_page(cid,aid=0):
        return HTMLResponse('<!doctype html><html lang="fr" data-mail-account="'+str(aid)+'" data-mail-company="'+str(cid)+'"><meta charset="utf-8"><title>Messagerie connectée</title><p>Messagerie connectée. Vous pouvez fermer cette fenêtre.</p><a href="/?mail_company='+str(cid)+'&amp;mail_account='+str(aid)+'#/emails">Revenir à l’application</a><script src="/static/mail-auth.js" defer></script></html>',headers={'Cache-Control':'no-store'})

    @app.get('/api/companies/{cid}/mail/unified/messages/{mid}/thread')
    def thread(cid:int,mid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:m=message(con,uid,cid,mid)
        if m['provider']!='nylas':raise HTTPException(409,'Ce message utilise la connexion Gmail existante.')
        with db() as con:
            con.execute('BEGIN')
            rows=[public(dict(r)) for r in con.execute("SELECT * FROM mail_messages WHERE user_id=? AND company_id=? AND provider='nylas' AND thread_id=? AND connection_id=? AND remote_deleted=0 ORDER BY received,id LIMIT 100",(uid,cid,m['thread_id'],selected.get()))]
            a=account(con,uid,cid);revision=a['last_change']
        return {'messages':rows,'selected':mid,'version':revision,'email':a['email']}

    @app.post('/api/companies/{cid}/mail/unified/messages/{mid}/refresh')
    def refresh_thread(cid:int,mid:int,req:Request):
        uid=scope(req,cid,True);a=current(uid,cid);throttle('mail-refresh:'+str(uid),30,60)
        with db() as con:m=message(con,uid,cid,mid)
        if m['provider']!='nylas':raise HTTPException(409,'Message incompatible.')
        result=data('GET',prefix(a)+'/messages',params={'thread_id':m['thread_id'],'limit':50})
        for obj in result.get('data',[]):upsert(uid,cid,a,obj)
        return {'ok':True,'more':bool(result.get('next_cursor'))}

    @app.get('/api/companies/{cid}/mail/unified/folders')
    def folders(cid:int,req:Request):
        a=current(scope(req,cid),cid)
        return data('GET',prefix(a)+'/folders',params={'limit':200}).get('data',[])

    @app.post('/api/companies/{cid}/mail/unified/messages/{mid}/action')
    def action(cid:int,mid:int,payload:MailAction,req:Request):
        uid=scope(req,cid,True);a=current(uid,cid)
        with db() as con:m=message(con,uid,cid,mid)
        if m['provider']!='nylas':raise HTTPException(409,'Message incompatible.')
        path=prefix(a)+'/messages/'+quote(m['remote_id'],safe='');change={}
        if payload.action in ('read','unread'):change={'unread':payload.action=='unread'}
        else:
            # Refresh labels before modifying them so Gmail's unrelated labels are retained.
            fresh=data('GET',path).get('data',{});fs=data('GET',prefix(a)+'/folders',params={'limit':200}).get('data',[])
            allowed={f['id'] for f in fs}
            if payload.action=='move':
                if payload.folder_id not in allowed:raise HTTPException(422,'Choisissez un dossier de cette boîte.')
                remaining=[f for f in fresh.get('folders',[]) if f!=a.get('inbox_id')] if a.get('mail_service')=='google' else []
                change={'folders':list(dict.fromkeys(remaining+[payload.folder_id]))}
            else:
                inbox={f['id'] for f in fs if '\\Inbox' in (f.get('attributes') or [])}
                archive=next((f['id'] for f in fs if '\\Archive' in (f.get('attributes') or [])),None)
                if a.get('mail_service')!='google' and not archive:raise HTTPException(409,'Le dossier Archives n’est pas encore disponible dans cette boîte.')
                remain=[f for f in fresh.get('folders',[]) if f not in inbox] if a.get('mail_service')=='google' else []
                if archive and archive not in remain:remain.append(archive)
                change={'folders':remain}
        data('PUT',path,json=change)
        with db() as con:
            unchanged(con,uid,cid,a)
            update_account(con,a,{'last_change':time.time()})
            if 'unread' in change:con.execute('UPDATE mail_messages SET unread=? WHERE id=?',(int(change['unread']),mid))
            else:con.execute('UPDATE mail_messages SET folders=?,archived=? WHERE id=?',(json.dumps(change['folders']),int(payload.action=='archive'),mid))
        return {'ok':True}

    def attachment(uid,cid,mid,aid):
        a=current(uid,cid)
        with db() as con:m=message(con,uid,cid,mid)
        if m['provider']!='nylas':raise HTTPException(409,'Message incompatible.')
        meta=next((f for f in json.loads(m['attachments']) if f['id']==aid),None)
        if not meta:raise HTTPException(404,'Pièce jointe introuvable.')
        if int(meta.get('size') or 0)>MAX_FILES:raise HTTPException(413,'Pièce jointe trop volumineuse pour cette application (16 Mo).')
        # Stream into a bounded buffer. Do not follow a redirect with the API key.
        cfg=config();chunks=[];size=0
        if not cfg['key']:raise HTTPException(503,'La connexion unifiée reste à configurer.')
        try:
            with httpx.stream('GET',cfg['base']+prefix(a)+'/attachments/'+quote(aid,safe='')+'/download',params={'message_id':m['remote_id']},headers={'Authorization':'Bearer '+cfg['key']},timeout=30,follow_redirects=False) as r:
                if r.status_code!=200:raise HTTPException(502,'Téléchargement refusé par la messagerie.')
                for chunk in r.iter_bytes():
                    size+=len(chunk)
                    if size>MAX_FILES:raise HTTPException(413,'La pièce jointe dépasse 16 Mo.')
                    chunks.append(chunk)
        except httpx.HTTPError:raise HTTPException(502,'Téléchargement interrompu. Réessayez.')
        return meta,b''.join(chunks)

    @app.get('/api/companies/{cid}/mail/unified/messages/{mid}/attachments/{aid}')
    def download(cid:int,mid:int,aid:str,req:Request):
        uid=scope(req,cid);meta,body=attachment(uid,cid,mid,aid)
        name=re.sub(r'[\r\n/\\\x00-\x1f]','_',str(meta.get('filename') or 'piece-jointe'))[:180]
        return Response(body,media_type='application/octet-stream',headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(name,safe=''),'Cache-Control':'no-store'})

    def draft(con,uid,cid,did):
        r=con.execute('SELECT * FROM mail_compositions WHERE id=? AND user_id=? AND company_id=? AND connection_id=?',(did,uid,cid,selected.get())).fetchone()
        if not r:raise HTTPException(404,'Brouillon introuvable.')
        d=dict(r)
        try:d['content']=json.loads(cipher.decrypt(d['payload']).decode())
        except (InvalidToken,ValueError):raise HTTPException(409,'Brouillon indisponible.')
        return d
    def public_draft(d):return {'id':d['id'],'revision':d['revision'],'status':d['status'],**d['content']}

    @app.get('/api/companies/{cid}/mail/unified/drafts')
    def drafts(cid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            return [dict(r) for r in con.execute('SELECT id,revision,status,mode,source_id,subject,updated FROM mail_compositions WHERE user_id=? AND company_id=? AND connection_id=? ORDER BY updated DESC LIMIT 100',(uid,cid,selected.get()))]

    @app.get('/api/companies/{cid}/mail/unified/drafts/{did}')
    def get_draft(cid:int,did:int,req:Request):
        uid=scope(req,cid)
        with db() as con:return public_draft(draft(con,uid,cid,did))

    @app.put('/api/companies/{cid}/mail/unified/drafts')
    def save(cid:int,payload:Composition,req:Request):
        uid=scope(req,cid,True);a=current(uid,cid);total=0
        if any(c in payload.subject+payload.to for c in '\r\n'):raise HTTPException(422,'Objet ou destinataire invalide.')
        for f in payload.files:
            if any(c in f.name+f.content_type for c in '\r\n\x00'):raise HTTPException(422,'Fichier invalide.')
            try:raw=base64.b64decode(f.data,validate=True)
            except ValueError:raise HTTPException(422,'Contenu du fichier invalide.')
            if len(raw)>MAX_FILE:raise HTTPException(413,'8 Mo maximum par fichier.')
            total+=len(raw)
        if total>MAX_FILES:raise HTTPException(413,'16 Mo maximum par message.')
        content=payload.model_dump(exclude={'id','revision'})
        with db() as con:
            unchanged(con,uid,cid,a)
            if payload.mode!='new':
                if not payload.source_id:raise HTTPException(422,'Message source requis.')
                m=message(con,uid,cid,payload.source_id)
                if m['provider']!='nylas' or m['remote_deleted']:raise HTTPException(409,'Message source indisponible.')
                if payload.mode=='reply' and payload.to.casefold()!=m['reply_to'].casefold():raise HTTPException(422,'Le destinataire de la réponse doit correspondre au message.')
                allowed={f['id']:int(f.get('size') or 0) for f in json.loads(m['attachments'])}
                if payload.mode!='forward' and payload.forwarded:raise HTTPException(422,'Transfert de fichiers invalide.')
                if any(f not in allowed for f in payload.forwarded):raise HTTPException(422,'Pièce jointe source inconnue.')
                total+=sum(allowed[f] for f in set(payload.forwarded))
                if total>MAX_FILES:raise HTTPException(413,'Les fichiers transférés dépassent 16 Mo au total.')
            elif payload.source_id or payload.forwarded:raise HTTPException(422,'Le nouveau message ne doit pas avoir de source.')
            blob=cipher.encrypt(json.dumps(content).encode())
            if payload.id:
                d=draft(con,uid,cid,payload.id)
                if d['account_key']!=key(a):raise HTTPException(409,'La boîte a changé. Créez un nouveau brouillon.')
                changed=con.execute("UPDATE mail_compositions SET payload=?,source_id=?,mode=?,subject=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND status='draft'",(blob,payload.source_id,payload.mode,payload.subject,time.time(),payload.id,payload.revision))
                if changed.rowcount!=1:raise HTTPException(409,'Brouillon modifié ou envoi déjà engagé. Rouvrez-le.')
                did=payload.id
            else:
                did=con.execute('INSERT INTO mail_compositions(user_id,company_id,source_id,mode,payload,account_key,operation,updated,subject,connection_id) VALUES (?,?,?,?,?,?,?,?,?,?)',(uid,cid,payload.source_id,payload.mode,blob,key(a),secrets.token_hex(20),time.time(),payload.subject,selected.get())).lastrowid
            return dict(con.execute('SELECT id,revision,status FROM mail_compositions WHERE id=?',(did,)).fetchone())

    @app.post('/api/companies/{cid}/mail/unified/drafts/{did}/send')
    def send(cid:int,did:int,payload:Confirm,req:Request):
        uid=scope(req,cid,True);throttle('mail-send:'+str(uid),30,3600)
        if not payload.confirmed:raise HTTPException(422,'Vérifiez le message puis confirmez explicitement son envoi.')
        a=current(uid,cid)
        with db() as con:
            d=draft(con,uid,cid,did);c=d['content']
            if d['account_key']!=key(a):raise HTTPException(409,'La connexion a changé : rouvrez le brouillon.')
            if d['revision']!=payload.revision or d['status']!='draft':raise HTTPException(409,'Révision modifiée ou envoi déjà engagé. Vérifiez les messages envoyés.')
            if not re.fullmatch(r'[^\s@<>,;\r\n]+@[^\s@<>,;\r\n]+\.[^\s@<>,;\r\n]+',c['to']) or not c['subject'].strip() or not c['body'].strip():raise HTTPException(422,'Complétez le destinataire, l’objet et le message.')
            source=message(con,uid,cid,d['source_id']) if d['source_id'] else None
        files=[]
        for f in c['files']:files.append((f['name'],base64.b64decode(f['data']),f['content_type']))
        for aid in c['forwarded']:
            meta,raw=attachment(uid,cid,d['source_id'],aid)
            if sum(len(f[1]) for f in files)+len(raw)>MAX_FILES:raise HTTPException(413,'16 Mo maximum par message.')
            name=re.sub(r'[\r\n/\\\x00-\x1f]','_',str(meta.get('filename') or 'piece-jointe'))[:180]
            mime=str(meta.get('content_type') or 'application/octet-stream').split(';')[0]
            if not re.fullmatch(r'[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+',mime):mime='application/octet-stream'
            files.append((name,raw,mime))
        if sum(len(f[1]) for f in files)>MAX_FILES:raise HTTPException(413,'16 Mo maximum par message.')
        body={'to':[{'email':c['to']}],'subject':c['subject'],'body':c['body'],'is_plaintext':True}
        if c['mode']=='reply' and source:body['reply_to_message_id']=source['remote_id']
        with db() as con:
            unchanged(con,uid,cid,a)
            claimed=con.execute("UPDATE mail_compositions SET status='sending' WHERE id=? AND revision=? AND status='draft'",(did,payload.revision))
            if claimed.rowcount!=1:raise HTTPException(409,'Envoi déjà engagé ou brouillon modifié.')
        try:
            kwargs={'headers':{'Idempotency-Key':d['operation']}}
            if files:kwargs['files']=[('message',(None,json.dumps(body),'application/json'))]+[('file'+str(i),(name,raw,mime)) for i,(name,raw,mime) in enumerate(files)]
            else:kwargs['json']=body
            result=data('POST',prefix(a)+'/messages/send',**kwargs).get('data',{})
            if not result.get('id'):raise HTTPException(502,'Confirmation d’envoi manquante.')
        except Exception:
            with db() as con:
                con.execute("UPDATE mail_compositions SET status='uncertain' WHERE id=?",(did,))
                if source and c['mode']=='reply':con.execute("UPDATE mail_messages SET send_status='uncertain' WHERE id=? AND user_id=? AND company_id=?",(source['id'],uid,cid))
            raise HTTPException(502,'Envoi non confirmé. Vérifiez votre dossier Envoyés avant toute nouvelle tentative ; aucun renvoi automatique.')
        with db() as con:
            con.execute("UPDATE mail_compositions SET status='sent',sent_id=?,updated=? WHERE id=?",(result['id'],time.time(),did))
            if source and c['mode']=='reply':con.execute("UPDATE mail_messages SET send_status='sent',reply_subject=?,reply_body=?,sent_id=? WHERE id=? AND user_id=? AND company_id=?",(c['subject'],c['body'],result['id'],source['id'],uid,cid))
        return {'sent':True}

    @app.get('/api/mail/unified/webhook')
    def challenge(challenge:str=''):
        if not os.environ.get('NYLAS_API_KEY'):raise HTTPException(503,'Service non configuré.')
        return PlainTextResponse(challenge[:1024])

    @app.post('/api/mail/unified/webhook')
    async def webhook(req:Request):
        secret=os.environ.get('NYLAS_WEBHOOK_SECRET','')
        if not secret:raise HTTPException(503,'Notifications non configurées.')
        chunks=[];size=0
        async for chunk in req.stream():
            size+=len(chunk)
            if size>2*1024*1024:raise HTTPException(413,'Notification trop volumineuse.')
            chunks.append(chunk)
        raw=b''.join(chunks)
        signature=hmac.new(secret.encode(),raw,hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature.encode(),req.headers.get('x-nylas-signature','').encode()):raise HTTPException(403,'Signature de notification invalide.')
        try:
            if req.headers.get('content-encoding')=='gzip':
                with gzip.GzipFile(fileobj=io.BytesIO(raw)) as f:raw=f.read(2*1024*1024+1)
            if len(raw)>2*1024*1024:raise ValueError()
            event=json.loads(raw);obj=event.get('data',{}).get('object',{});rid=obj.get('id','');kind=event.get('type','');gid=obj.get('grant_id') or (rid if kind.startswith('grant.') else '');eid=event.get('id')
            if not eid or not gid or len(str(eid))>512:raise ValueError()
        except (ValueError,AttributeError,TypeError,OSError,EOFError):raise HTTPException(400,'Notification invalide.')
        if not kind.startswith(('message.created','message.updated','message.deleted','grant.expired','grant.deleted')):return {'ok':True}
        with db() as con:
            con.execute('INSERT OR IGNORE INTO mail_events(id,grant_hash,remote_id,kind) VALUES (?,?,?,?)',(eid,hashlib.sha256(gid.encode()).hexdigest(),str(rid)[:512],kind[:100]))
        return {'ok':True}

    def process_events():
        with db() as con:events=[dict(r) for r in con.execute('SELECT * FROM mail_events WHERE done=0 AND attempts<8 AND due<? AND claimed<? LIMIT 20',(time.time(),time.time()-90))]
        for event in events:
            with db() as con:
                claimed=con.execute('UPDATE mail_events SET claimed=?,attempts=attempts+1 WHERE id=? AND done=0 AND claimed<?',(time.time(),event['id'],time.time()-90))
                if claimed.rowcount!=1:continue
                accounts=[{**dict(r),'connection_id':0} for r in con.execute("SELECT * FROM mail_accounts WHERE provider='nylas' AND grant_hash=? AND token<>''",(event['grant_hash'],))]+[{**dict(r),'connection_id':r['id']} for r in con.execute("SELECT * FROM mail_connections WHERE grant_hash=? AND token<>''",(event['grant_hash'],))]
            try:
                for a in accounts:
                    uid,cid=a['user_id'],a['company_id']
                    if event['kind'].startswith('grant.'):
                        with db() as con:update_account(con,a,{'error':'Autorisation expirée : reconnectez votre boîte.','auth_invalid':1,'last_change':time.time()})
                    elif event['kind'].startswith('message.deleted'):
                        with db() as con:
                            con.execute("UPDATE mail_messages SET remote_deleted=1,archived=1 WHERE user_id=? AND company_id=? AND provider='nylas' AND remote_id=? AND connection_id=?",(uid,cid,event['remote_id'],a.get('connection_id',0)))
                            update_account(con,a,{'last_change':time.time()})
                    else:
                        if not a.get('inbox_id'):raise HTTPException(409,'La première synchronisation est nécessaire.')
                        upsert(uid,cid,a,data('GET',prefix(a)+'/messages/'+quote(event['remote_id'],safe='')).get('data',{}))
                with db() as con:con.execute('UPDATE mail_events SET done=1 WHERE id=?',(event['id'],))
            except Exception:
                with db() as con:con.execute('UPDATE mail_events SET due=?,claimed=0 WHERE id=?',(time.time()+min(900,15*2**event['attempts']),event['id']))
        with db() as con:con.execute('DELETE FROM mail_events WHERE done=1 AND claimed<?',(time.time()-86400*7,))

    async def worker():
        while True:
            await asyncio.sleep(5)
            try:
                await asyncio.to_thread(process_events)
                with db() as con:boxes=[dict(r) for r in con.execute("SELECT id,user_id,company_id FROM mail_connections WHERE automatic=1 AND auth_invalid=0 AND token<>'' AND last_sync<?",(time.time()-900,))]
                for box in boxes:
                    try:await asyncio.to_thread(synchronize,box['user_id'],box['company_id'],box['id'])
                    except Exception:pass
            except Exception:pass
    previous=app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(application):
        async with previous(application):
            task=asyncio.create_task(worker())
            try:yield
            finally:
                task.cancel()
                try:await task
                except asyncio.CancelledError:pass
    app.router.lifespan_context=lifespan
    # Exposed only to the legacy adapter and isolated tests; never a public processing endpoint.
    return {'synchronize':synchronize,'disconnect':disconnect,'process_events':process_events}
