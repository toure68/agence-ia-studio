"""Direct provider mail. Durable local drafts; no intermediary service or outbound sync sends."""
import base64
import hashlib
import json
import os
import re
import secrets
import time
from contextvars import ContextVar
from urllib.parse import quote, urlencode
from email.utils import parseaddr
import httpx
from cryptography.fernet import InvalidToken
from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, Response
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
        CREATE TABLE IF NOT EXISTS mail_unified_states(state TEXT PRIMARY KEY,user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,expires REAL NOT NULL,account_key TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS mail_compositions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,source_id INTEGER,mode TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,payload BLOB NOT NULL,account_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',sent_id TEXT NOT NULL DEFAULT '',operation TEXT NOT NULL,updated REAL NOT NULL,subject TEXT NOT NULL DEFAULT '');
        ''')
        if 'subject' not in {r['name'] for r in con.execute('PRAGMA table_info(mail_compositions)')}:con.execute("ALTER TABLE mail_compositions ADD COLUMN subject TEXT NOT NULL DEFAULT ''")
        if 'account_key' not in {r['name'] for r in con.execute('PRAGMA table_info(mail_unified_states)')}:con.execute("ALTER TABLE mail_unified_states ADD COLUMN account_key TEXT NOT NULL DEFAULT ''")

        con.execute("CREATE TABLE IF NOT EXISTS mail_connections(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,email TEXT NOT NULL DEFAULT '',token TEXT NOT NULL DEFAULT '',keywords TEXT NOT NULL DEFAULT 'Activité',automatic INTEGER NOT NULL DEFAULT 1,cursor TEXT NOT NULL DEFAULT '',last_sync REAL NOT NULL DEFAULT 0,syncing INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',provider TEXT NOT NULL DEFAULT 'gmail',grant_hash TEXT NOT NULL DEFAULT '',last_change REAL NOT NULL DEFAULT 0,mail_service TEXT NOT NULL DEFAULT '',inbox_id TEXT NOT NULL DEFAULT '',auth_invalid INTEGER NOT NULL DEFAULT 0,service TEXT NOT NULL DEFAULT '',UNIQUE(user_id,company_id,grant_hash))")
        for table,fields in {'mail_messages':{'connection_id':'INTEGER NOT NULL DEFAULT 0'},'mail_compositions':{'connection_id':'INTEGER NOT NULL DEFAULT 0'},'mail_unified_states':{'connection_id':'INTEGER NOT NULL DEFAULT 0','service':"TEXT NOT NULL DEFAULT ''"}}.items():
            existing={r['name'] for r in con.execute('PRAGMA table_info('+table+')')}
            for name,definition in fields.items():
                if name not in existing:con.execute('ALTER TABLE '+table+' ADD COLUMN '+name+' '+definition)

        # Retire intermediary authorizations without deleting mail or encrypted drafts.
        for table in ('mail_accounts','mail_connections'):
            con.execute("UPDATE "+table+" SET provider='imported',token='',automatic=0,auth_invalid=1,syncing=0,error='Autorisation directe du fournisseur nécessaire.' WHERE provider='nylas'")
        con.execute("UPDATE mail_messages SET provider='imported' WHERE provider='nylas'")


class FileData(BaseModel):
    name:str=Field(min_length=1,max_length=180)
    content_type:str=Field(default='application/octet-stream',max_length=120)
    data:str=Field(max_length=12*1024*1024)


class Composition(BaseModel):
    reader:bool=False
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


def install(app,db,require,own_company,cipher,account,message,scope,category,TextOnly,throttle,gmail_adapter):
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
        c=gmail_adapter['config']();return {k:c[k] for k in ('client_id','client_secret','redirect_uri')}
    def ready():return all(config().values())
    def key(a):return a.get('grant_hash') or hashlib.sha256(a['token'].encode()).hexdigest()
    def current(uid,cid,allow_gmail=False):
        with db() as con:a=account(con,uid,cid)
        if a.get('provider')!='gmail' or not a['token'] or a.get('auth_invalid'):
            raise HTTPException(409,'Autorisez directement votre compte Gmail pour envoyer ou actualiser. Les copies restent consultables.')
        return a
    def unchanged(con,uid,cid,a):
        if account(con,uid,cid,a.get('connection_id',0))['token']!=a['token']:raise HTTPException(409,'La connexion a changé. Rouvrez la messagerie.')
    def public(m):
        result={k:v for k,v in m.items() if k not in ('gmail_id','remote_id','message_id')}
        result['attachments']=json.loads(m['attachments']);return result
    def request(a,method,path,**kw):
        return gmail_adapter['request'](method,path,gmail_adapter['access'](a),**kw)
    def upsert(uid,cid,a,obj):
        rid=str(obj.get('id',''))
        if not rid:return None
        payload=obj.get('payload',{});headers={h['name'].lower():h['value'] for h in payload.get('headers',[])}
        sender=headers.get('from','')[:500];reply=parseaddr(headers.get('reply-to') or sender)[1]
        if not re.fullmatch(r'[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+',reply):reply=''
        body=gmail_adapter['plain_body'](payload) or obj.get('snippet','')[:1000]
        files=[]
        def walk(part,depth=0):
            if depth>20:return
            b=part.get('body',{})
            if part.get('filename') and b.get('attachmentId'):
                files.append({'id':b['attachmentId'],'filename':part['filename'][:180],'content_type':part.get('mimeType','application/octet-stream'),'size':b.get('size',0)})
            for child in part.get('parts',[])[:50]:walk(child,depth+1)
        walk(payload)
        aid=a.get('connection_id',0);gid=rid if not aid else 'gmail:'+str(aid)+':'+rid
        labels=obj.get('labelIds',[]);subject=headers.get('subject','Sans objet')[:300]
        with db() as con:
            unchanged(con,uid,cid,a)
            con.execute("INSERT INTO mail_messages(user_id,company_id,gmail_id,thread_id,sender,reply_to,subject,body,received,category,message_id,provider,remote_id,attachments,folders,unread,archived,connection_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,'gmail',?,?,?,?,?,?) ON CONFLICT(user_id,company_id,gmail_id) DO UPDATE SET unread=excluded.unread,archived=excluded.archived,folders=excluded.folders,remote_deleted=0",
              (uid,cid,gid,str(obj.get('threadId',rid)),sender,reply,subject,body,headers.get('date','')[:200],category(subject+' '+body[:4000]),headers.get('message-id','')[:300],rid,json.dumps(files[:100]),json.dumps(labels),int('UNREAD' in labels),int('INBOX' not in labels),aid))
            update_account(con,a,{'last_change':time.time()})
            return con.execute('SELECT id FROM mail_messages WHERE user_id=? AND company_id=? AND gmail_id=?',(uid,cid,gid)).fetchone()[0]
    def synchronize(uid,cid,aid=0):
        selected.set(aid);a=current(uid,cid)
        with db() as con:
            if a['syncing'] and time.time()-a['last_sync']<300:raise HTTPException(409,'Synchronisation déjà en cours.')
            table='mail_connections' if aid else 'mail_accounts'
            claim=con.execute('UPDATE '+table+' SET syncing=1,last_sync=? WHERE user_id=? AND company_id=?'+(' AND id=?' if aid else '')+' AND (syncing=0 OR last_sync<?)',(time.time(),uid,cid,*([aid] if aid else []),time.time()-300))
            if claim.rowcount!=1:raise HTTPException(409,'Synchronisation déjà en cours.')
        try:
            token=gmail_adapter['access'](a)
            words=re.findall(r'[\wÀ-ÿ-]{2,}',a['keywords'])[:30]
            if not words:raise HTTPException(422,'Ajoutez les mots-clés de votre activité.')
            params={'maxResults':20,'q':'-in:spam -in:trash -in:sent {'+' '.join(words)+'}'}
            if a['cursor']:params['pageToken']=a['cursor']
            listing=gmail_adapter['request']('GET','/messages',token,params=params);count=0
            for item in listing.get('messages',[]):
                rid=item['id'];gid=rid if not aid else 'gmail:'+str(aid)+':'+rid
                with db() as con:exists=con.execute('SELECT 1 FROM mail_messages WHERE user_id=? AND company_id=? AND gmail_id=?',(uid,cid,gid)).fetchone()
                if exists:continue
                full=gmail_adapter['request']('GET','/messages/'+quote(rid,safe=''),token,params={'format':'full'})
                if upsert(uid,cid,a,full):count+=1
            with db() as con:
                unchanged(con,uid,cid,a);update_account(con,a,{'cursor':listing.get('nextPageToken',''),'error':''})
            return {'imported':count,'more':bool(listing.get('nextPageToken'))}
        except HTTPException as e:
            with db() as con:update_account(con,a,{'error':str(e.detail)})
            raise
        finally:
            with db() as con:update_account(con,a,{'syncing':0})
    def disconnect(uid,cid,a):
        if a['provider']=='gmail' and a['token']:
            try:httpx.post('https://oauth2.googleapis.com/revoke',data={'token':cipher.decrypt(a['token'].encode()).decode()},timeout=10)
            except (httpx.HTTPError,InvalidToken):pass
        with db() as con:con.execute('DELETE FROM mail_compositions WHERE user_id=? AND company_id=? AND connection_id=?',(uid,cid,a.get('connection_id',0)))
    def display(a):
        service=a.get('service') or ('gmail' if a['provider']=='gmail' or a.get('mail_service')=='google' else 'outlook' if a.get('mail_service')=='microsoft' else a.get('mail_service')) or 'other'
        return {'id':a.get('connection_id',0),'email':a['email'],'service':service,'connected':a['provider']=='gmail' and bool(a['token']) and not a.get('auth_invalid'),'error':bool(a.get('error')),'legacy':False}
    @app.get('/api/companies/{cid}/mail/unified/accounts')
    def connections(cid:int,req:Request):
        uid=scope(req,cid)
        from mail_providers import PROVIDERS
        with db() as con:
            rows=[{**dict(r),'connection_id':0} for r in con.execute("SELECT * FROM mail_accounts WHERE user_id=? AND company_id=? AND email<>''",(uid,cid))]
            rows += [{**dict(r),'connection_id':r['id']} for r in con.execute('SELECT * FROM mail_connections WHERE user_id=? AND company_id=?',(uid,cid))]
        return {'configured':ready(),'providers':[{'id':k,**v,'supported':k=='gmail'} for k,v in PROVIDERS.items()],'accounts':[display(a) for a in rows]}
    def status_value(a):
        return {**display(a),'configured':ready(),'provider':a['provider'],'connection_id':a.get('connection_id',0),'error':a['error'],'keywords':a['keywords'],'automatic':bool(a['automatic']),'last_sync':a['last_sync'],'realtime':False}
    @app.get('/api/companies/{cid}/mail/unified/status')
    def status(cid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            try:return status_value(account(con,uid,cid))
            except HTTPException:
                if selected.get():raise
                return {'configured':ready(),'connected':False,'email':'','provider':'gmail','realtime':False}
    @app.get('/api/companies/{cid}/mail/unified/boxes/{aid}/status')
    def box_status(cid:int,aid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:return status_value(account(con,uid,cid,aid))
    @app.get('/api/companies/{cid}/mail/unified/boxes/{aid}/messages')
    def box_messages(cid:int,aid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            account(con,uid,cid,aid)
            return [dict(r) for r in con.execute('SELECT id,sender,subject,received,category,send_status,revision,provider,unread,archived,connection_id FROM mail_messages WHERE user_id=? AND company_id=? AND connection_id=? AND remote_deleted=0 ORDER BY id DESC LIMIT 1000',(uid,cid,aid))]
    @app.get('/api/companies/{cid}/mail/unified/boxes/{aid}/messages/{mid}')
    def box_detail(cid:int,aid:int,mid:int,req:Request):
        uid=scope(req,cid);selected.set(aid)
        with db() as con:
            account(con,uid,cid);return public(message(con,uid,cid,mid))
    @app.put('/api/companies/{cid}/mail/unified/boxes/{aid}/settings')
    def box_settings(cid:int,aid:int,payload:dict,req:Request):
        uid=scope(req,cid,True);words=payload.get('keywords','')
        if not isinstance(words,str) or not 2<=len(words)<=500:raise HTTPException(422,'Précisez vos activités (2 à 500 caractères).')
        with db() as con:update_account(con,account(con,uid,cid,aid),{'keywords':words,'automatic':int(bool(payload.get('automatic'))),'cursor':''})
        return {'ok':True}
    @app.post('/api/companies/{cid}/mail/unified/boxes/{aid}/sync')
    def box_sync(cid:int,aid:int,req:Request):return synchronize(scope(req,cid,True),cid,aid)
    @app.post('/api/companies/{cid}/mail/unified/boxes/{aid}/disconnect')
    def box_disconnect(cid:int,aid:int,req:Request):
        uid=scope(req,cid,True)
        if aid<=0:raise HTTPException(422,'Boîte invalide.')
        with db() as con:a=account(con,uid,cid,aid)
        disconnect(uid,cid,a)
        with db() as con:
            con.execute('DELETE FROM mail_ai WHERE user_id=? AND company_id=? AND message_id IN (SELECT id FROM mail_messages WHERE user_id=? AND company_id=? AND connection_id=?)',(uid,cid,uid,cid,aid))
            con.execute('DELETE FROM mail_messages WHERE user_id=? AND company_id=? AND connection_id=?',(uid,cid,aid))
            con.execute('DELETE FROM mail_connections WHERE id=? AND user_id=? AND company_id=?',(aid,uid,cid))
        return {'ok':True}
    @app.get('/api/companies/{cid}/mail/unified/version')
    def version(cid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            try:return {'version':account(con,uid,cid)['last_change']}
            except HTTPException:return {'version':0}
    @app.post('/api/companies/{cid}/mail/connect')
    @app.post('/api/companies/{cid}/mail/unified/connect')
    def connect(cid:int,req:Request,payload:ConnectIntent|None=None):
        uid=scope(req,cid,True);intent=payload or ConnectIntent();cfg=config()
        if intent.service not in ('','gmail'):raise HTTPException(409,'La connexion directe de ce fournisseur n’est pas encore disponible. Gmail est pris en charge.')
        if not ready():raise HTTPException(409,'Connexion Google à configurer : identifiants OAuth manquants sur le serveur.')
        throttle('mail-connect:'+str(uid),30,3600);state=secrets.token_urlsafe(40)
        with db() as con:
            con.execute("INSERT OR IGNORE INTO mail_accounts(user_id,company_id,keywords) VALUES (?,?,'Clients commandes factures')",(uid,cid))
            aid=-1 if intent.add else selected.get();old=None if aid<0 else account(con,uid,cid,aid)
            con.execute('DELETE FROM mail_unified_states WHERE expires<?',(time.time(),))
            con.execute('INSERT INTO mail_unified_states(state,user_id,company_id,expires,account_key,connection_id,service) VALUES (?,?,?,?,?,?,?)',(hashlib.sha256(state.encode()).hexdigest(),uid,cid,time.time()+600,hashlib.sha256(old['token'].encode()).hexdigest() if old else '',aid,'gmail'))
        from mailbox_routes import SCOPES
        params={'client_id':cfg['client_id'],'redirect_uri':cfg['redirect_uri'],'response_type':'code','scope':SCOPES,'state':state,'access_type':'offline','prompt':'consent'}
        if intent.login_hint:params['login_hint']=intent.login_hint.strip()
        return {'url':'https://accounts.google.com/o/oauth2/v2/auth?'+urlencode(params)}
    @app.get('/api/mail/gmail/callback')
    def callback(req:Request,state:str='',code:str='',error:str=''):
        user=require(req);digest=hashlib.sha256(state.encode()).hexdigest()
        with db() as con:
            r=con.execute('SELECT * FROM mail_unified_states WHERE state=? AND user_id=? AND expires>?',(digest,user['id'],time.time())).fetchone()
            if not r:raise HTTPException(400,'Autorisation expirée ou invalide.')
            cid=r['company_id'];require(req,tenant_id=cid);own_company(con,cid)
            if con.execute('DELETE FROM mail_unified_states WHERE state=?',(digest,)).rowcount!=1:raise HTTPException(400,'Autorisation déjà utilisée.')
        if error or not code:raise HTTPException(400,'Connexion Google annulée.')
        cfg=config()
        try:
            response=httpx.post('https://oauth2.googleapis.com/token',data={'code':code,'client_id':cfg['client_id'],'client_secret':cfg['client_secret'],'redirect_uri':cfg['redirect_uri'],'grant_type':'authorization_code'},timeout=20)
            tokens=response.json()
        except (httpx.HTTPError,ValueError):raise HTTPException(502,'Connexion Google indisponible.')
        from mailbox_routes import SCOPES
        if response.status_code!=200 or not tokens.get('refresh_token') or not set(SCOPES.split()).issubset(set(tokens.get('scope','').split())):raise HTTPException(409,'Autorisation Gmail incomplète. Autorisez la lecture et l’envoi.')
        profile=gmail_adapter['request']('GET','/profile',tokens['access_token']);email=profile.get('emailAddress','').strip().lower()
        if not email:raise HTTPException(502,'Adresse Gmail indisponible.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE');aid=r['connection_id']
            if aid>=0:
                old=account(con,user['id'],cid,aid)
                if hashlib.sha256(old['token'].encode()).hexdigest()!=r['account_key']:raise HTTPException(409,'La connexion a changé. Recommencez.')
                if old['email'] and old['email'].casefold()!=email.casefold():raise HTTPException(409,'Choisissez la même adresse. Pour une autre, utilisez Ajouter un compte.')
            else:
                old=con.execute('SELECT * FROM mail_accounts WHERE user_id=? AND company_id=? AND lower(email)=?',(user['id'],cid,email)).fetchone()
                if old:aid=0;old={**dict(old),'connection_id':0}
                else:
                    old=con.execute('SELECT * FROM mail_connections WHERE user_id=? AND company_id=? AND lower(email)=?',(user['id'],cid,email)).fetchone()
                    if old:aid=old['id'];old={**dict(old),'connection_id':aid}
                    else:
                        stable=hashlib.sha256(('gmail:'+email).encode()).hexdigest()
                        aid=con.execute("INSERT INTO mail_connections(user_id,company_id,email,grant_hash,service,provider) VALUES (?,?,?,?,'gmail','gmail')",(user['id'],cid,email,stable)).lastrowid
                        old=account(con,user['id'],cid,aid)
            a=dict(old);stable=a.get('grant_hash') or (hashlib.sha256(a['token'].encode()).hexdigest() if a['token'] else hashlib.sha256(('gmail:'+email).encode()).hexdigest())
            # Keep account identity, all imported messages, drafts and pending-send guards.
            update_account(con,a,{'email':email,'token':cipher.encrypt(tokens['refresh_token'].encode()).decode(),'provider':'gmail','grant_hash':stable,'mail_service':'google','auth_invalid':0,'error':'','cursor':'','last_sync':0,'last_change':time.time()})
            con.commit()
        return HTMLResponse('<!doctype html><html lang="fr" data-mail-account="'+str(aid)+'" data-mail-company="'+str(cid)+'"><meta charset="utf-8"><title>Gmail connecté</title><p>Gmail connecté directement. Vous pouvez fermer cette fenêtre.</p><a href="/?mail_company='+str(cid)+'&amp;mail_account='+str(aid)+'#/emails">Revenir à l’application</a><script src="/static/mail-auth.js" defer></script></html>',headers={'Cache-Control':'no-store'})
    @app.get('/api/companies/{cid}/mail/unified/messages/{mid}/thread')
    def thread(cid:int,mid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            m=message(con,uid,cid,mid);a=account(con,uid,cid)
            rows=[public(dict(r)) for r in con.execute('SELECT * FROM mail_messages WHERE user_id=? AND company_id=? AND connection_id=? AND provider=? AND thread_id=? AND remote_deleted=0 ORDER BY id LIMIT 100',(uid,cid,selected.get(),m['provider'],m['thread_id']))]
        return {'messages':rows,'selected':mid,'version':a['last_change'],'email':a['email']}
    @app.post('/api/companies/{cid}/mail/unified/messages/{mid}/refresh')
    def refresh_thread(cid:int,mid:int,req:Request):
        uid=scope(req,cid,True);a=current(uid,cid)
        with db() as con:m=message(con,uid,cid,mid)
        if m['provider']!='gmail':raise HTTPException(409,'Cette copie importée reste consultable. Actualisez Gmail pour retrouver son fil natif.')
        obj=request(a,'GET','/threads/'+quote(m['thread_id'],safe=''),params={'format':'full'})
        for item in obj.get('messages',[])[:100]:upsert(uid,cid,a,item)
        return {'ok':True}
    @app.get('/api/companies/{cid}/mail/unified/folders')
    def folders(cid:int,req:Request):
        a=current(scope(req,cid),cid)
        return request(a,'GET','/labels').get('labels',[])
    @app.post('/api/companies/{cid}/mail/unified/messages/{mid}/action')
    def action(cid:int,mid:int,payload:MailAction,req:Request):
        uid=scope(req,cid,True);a=current(uid,cid)
        with db() as con:m=message(con,uid,cid,mid)
        if m['provider']!='gmail':raise HTTPException(409,'Actualisez Gmail pour classer le message natif. Cette copie importée reste conservée.')
        change={'addLabelIds':[],'removeLabelIds':[]}
        if payload.action=='read':change['removeLabelIds']=['UNREAD']
        elif payload.action=='unread':change['addLabelIds']=['UNREAD']
        elif payload.action=='archive':change['removeLabelIds']=['INBOX']
        else:
            allowed={f['id'] for f in request(a,'GET','/labels').get('labels',[]) if f.get('type')=='user' or f['id']=='INBOX'}
            if payload.folder_id not in allowed:raise HTTPException(422,'Choisissez un dossier de cette boîte.')
            change['addLabelIds']=[payload.folder_id]
            if payload.folder_id!='INBOX':change['removeLabelIds']=['INBOX']
        obj=request(a,'POST','/messages/'+quote(m['remote_id'] or m['gmail_id'],safe='')+'/modify',json=change)
        labels=obj.get('labelIds')
        if not isinstance(labels,list):raise HTTPException(502,'Confirmation de classement manquante.')
        with db() as con:
            unchanged(con,uid,cid,a)
            con.execute('UPDATE mail_messages SET folders=?,unread=?,archived=? WHERE id=?',(json.dumps(labels),int('UNREAD' in labels),int('INBOX' not in labels),mid))
            update_account(con,a,{'last_change':time.time()})
        return {'ok':True}
    def attachment(uid,cid,mid,aid):
        a=current(uid,cid)
        with db() as con:m=message(con,uid,cid,mid)
        if m['provider']!='gmail':raise HTTPException(409,'Retrouvez cette pièce jointe dans la boîte d’origine puis actualisez Gmail.')
        meta=next((f for f in json.loads(m['attachments']) if f['id']==aid),None)
        if not meta:raise HTTPException(404,'Pièce jointe introuvable.')
        if int(meta.get('size') or 0)>MAX_FILES:raise HTTPException(413,'16 Mo maximum.')
        obj=request(a,'GET','/messages/'+quote(m['remote_id'] or m['gmail_id'],safe='')+'/attachments/'+quote(aid,safe=''))
        encoded=obj.get('data','')
        if len(encoded)>((MAX_FILES+2)//3)*4:raise HTTPException(413,'16 Mo maximum.')
        try:body=base64.urlsafe_b64decode(encoded+'='*(-len(encoded)%4))
        except ValueError:raise HTTPException(502,'Pièce jointe invalide.')
        if len(body)>MAX_FILES:raise HTTPException(413,'16 Mo maximum.')
        return meta,body
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

    @app.get('/api/companies/{cid}/mail/unified/messages/{mid}/reader-reply')
    def reader_reply(cid:int,mid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            m=message(con,uid,cid,mid)
            attempted=bool(con.execute("SELECT 1 FROM mail_ai WHERE user_id=? AND company_id=? AND message_id=? AND kind='reply'",(uid,cid,mid)).fetchone())
            rows=con.execute("SELECT id FROM mail_compositions WHERE user_id=? AND company_id=? AND connection_id=? AND source_id=? AND mode='reply' ORDER BY id DESC",(uid,cid,selected.get(),mid)).fetchall()
            for row in rows:
                d=draft(con,uid,cid,row['id'])
                if d['content'].get('reader'):
                    return {'attempted':True,'draft':public_draft(d),'source_status':m['send_status']}
            return {'attempted':attempted,'draft':None,'source_status':m['send_status']}

    @app.delete('/api/companies/{cid}/mail/unified/drafts/{did}')
    def discard_reader_reply(cid:int,did:int,payload:Confirm,req:Request):
        uid=scope(req,cid,True)
        if not payload.confirmed:raise HTTPException(422,'Confirmez le refus de la proposition.')
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            d=draft(con,uid,cid,did)
            if not d['content'].get('reader'):raise HTTPException(409,'Ce brouillon ne vient pas du lecteur.')
            removed=con.execute("DELETE FROM mail_compositions WHERE id=? AND revision=? AND status='draft'",(did,payload.revision))
            if removed.rowcount!=1:raise HTTPException(409,'Proposition modifiée ou envoi engagé. Rouvrez le message.')
        return {'ok':True}

    @app.put('/api/companies/{cid}/mail/unified/drafts')
    def save(cid:int,payload:Composition,req:Request):
        uid=scope(req,cid,True);a=current(uid,cid,allow_gmail=True);total=0
        if any(c in payload.subject+payload.to for c in '\r\n'):raise HTTPException(422,'Objet ou destinataire invalide.')
        for f in payload.files:
            if any(c in f.name+f.content_type for c in '\r\n\x00'):raise HTTPException(422,'Fichier invalide.')
            try:raw=base64.b64decode(f.data,validate=True)
            except ValueError:raise HTTPException(422,'Contenu du fichier invalide.')
            if len(raw)>MAX_FILE:raise HTTPException(413,'8 Mo maximum par fichier.')
            total+=len(raw)
        if total>MAX_FILES:raise HTTPException(413,'16 Mo maximum par message.')
        if payload.reader and payload.mode!='reply':raise HTTPException(422,'La proposition du lecteur doit répondre à un message.')
        content=payload.model_dump(exclude={'id','revision'})
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            unchanged(con,uid,cid,a)
            if payload.mode!='new':
                if not payload.source_id:raise HTTPException(422,'Message source requis.')
                m=message(con,uid,cid,payload.source_id)
                if m['provider'] not in ('gmail','imported') or m['remote_deleted']:raise HTTPException(409,'Message source indisponible.')
                if payload.mode=='reply' and m['send_status'] in ('sending','sent','uncertain'):raise HTTPException(409,'Réponse déjà envoyée ou à vérifier dans les messages envoyés.')
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
                if payload.reader:
                    rows=con.execute("SELECT id FROM mail_compositions WHERE user_id=? AND company_id=? AND connection_id=? AND source_id=? AND mode='reply'",(uid,cid,selected.get(),payload.source_id)).fetchall()
                    if any(draft(con,uid,cid,r['id'])['content'].get('reader') for r in rows):
                        raise HTTPException(409,'Une proposition existe déjà. Rouvrez le message pour la retrouver.')
                did=con.execute('INSERT INTO mail_compositions(user_id,company_id,source_id,mode,payload,account_key,operation,updated,subject,connection_id) VALUES (?,?,?,?,?,?,?,?,?,?)',(uid,cid,payload.source_id,payload.mode,blob,key(a),secrets.token_hex(20),time.time(),payload.subject,selected.get())).lastrowid
            return dict(con.execute('SELECT id,revision,status FROM mail_compositions WHERE id=?',(did,)).fetchone())

    @app.post('/api/companies/{cid}/mail/unified/drafts/{did}/send')
    def send(cid:int,did:int,payload:Confirm,req:Request):
        uid=scope(req,cid,True);throttle('mail-send:'+str(uid),30,3600)
        if not payload.confirmed:raise HTTPException(422,'Vérifiez le message puis confirmez explicitement son envoi.')
        a=current(uid,cid,allow_gmail=True)
        with db() as con:
            d=draft(con,uid,cid,did);c=d['content']
            if d['account_key']!=key(a):raise HTTPException(409,'La connexion a changé : rouvrez le brouillon.')
            if d['revision']!=payload.revision or d['status']!='draft':raise HTTPException(409,'Révision modifiée ou envoi déjà engagé. Vérifiez les messages envoyés.')
            if not re.fullmatch(r'[^\s@<>,;\r\n]+@[^\s@<>,;\r\n]+\.[^\s@<>,;\r\n]+',c['to']) or not c['subject'].strip() or not c['body'].strip():raise HTTPException(422,'Complétez le destinataire, l’objet et le message.')
            source=message(con,uid,cid,d['source_id']) if d['source_id'] else None
            if source and source['provider'] not in ('gmail','imported'):raise HTTPException(409,'La boîte source a changé.')
            if source and c['mode']=='reply' and source['send_status'] in ('sending','sent','uncertain'):raise HTTPException(409,'Réponse déjà envoyée ou à vérifier dans les messages envoyés.')
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
        legacy_token=gmail_adapter['access'](a)
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            unchanged(con,uid,cid,a)
            claimed=con.execute("UPDATE mail_compositions SET status='sending' WHERE id=? AND revision=? AND status='draft'",(did,payload.revision))
            if claimed.rowcount!=1:raise HTTPException(409,'Envoi déjà engagé ou brouillon modifié.')
            if source and c['mode']=='reply':
                claimed_source=con.execute("UPDATE mail_messages SET send_status='sending' WHERE id=? AND send_status='draft'",(source['id'],))
                if claimed_source.rowcount!=1:raise HTTPException(409,'Une réponse est déjà engagée pour ce message.')
            con.commit()
        try:
            if a['provider']=='gmail':
                from email.message import EmailMessage
                mail=EmailMessage();mail['From']=a['email'];mail['To']=c['to'];mail['Subject']=c['subject'];mail.set_content(c['body'])
                if source and c['mode']=='reply' and source['message_id'] and not any(ch in source['message_id'] for ch in '\r\n'):
                    mail['In-Reply-To']=source['message_id'];mail['References']=source['message_id']
                for name,raw,mime in files:
                    main,sub=mime.split('/',1) if '/' in mime else ('application','octet-stream')
                    mail.add_attachment(raw,maintype=main,subtype=sub,filename=name)
                message_body={'raw':base64.urlsafe_b64encode(mail.as_bytes()).decode()}
                if source and c['mode']=='reply' and source['provider']=='gmail':message_body['threadId']=source['thread_id']
                result=gmail_adapter['request']('POST','/messages/send',legacy_token,json=message_body)
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


    return {'synchronize':synchronize,'disconnect':disconnect}
