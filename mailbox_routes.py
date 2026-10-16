"""Per-user Gmail OAuth inbox; synchronization never sends messages.
Replies are sent only from an authenticated, CSRF-protected explicit confirmation.
"""
import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
import time
from email.message import EmailMessage
from email.utils import parseaddr
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlencode, quote
from contextlib import asynccontextmanager

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

SCOPES='https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send'
GMAIL='https://gmail.googleapis.com/gmail/v1/users/me'

class MailSettings(BaseModel):
    keywords:str=Field(min_length=2,max_length=500)
    automatic:bool=False

class Reply(BaseModel):
    subject:str=Field(min_length=2,max_length=300)
    body:str=Field(min_length=10,max_length=20000)

class Send(BaseModel):
    revision:int=Field(gt=0)
    confirmed:bool=False

class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__();self.parts=[];self.hidden=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.hidden+=1
        if tag in ('p','br','div','li'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden:self.parts.append(data)

def plain_body(payload):
    plain=[];html=[]
    def walk(part,depth=0):
        if depth>12:return
        data=part.get('body',{}).get('data','')
        if data and not part.get('filename') and len(data)<500000:
            try:text=base64.urlsafe_b64decode(data+'='*(-len(data)%4)).decode('utf-8','replace')
            except (ValueError,TypeError):text=''
            if part.get('mimeType')=='text/plain':plain.append(text)
            elif part.get('mimeType')=='text/html':html.append(text)
        for child in part.get('parts',[])[:50]:walk(child,depth+1)
    walk(payload)
    if plain:return '\n'.join(plain)[:30000]
    parser=TextOnly();parser.feed('\n'.join(html));return unescape(''.join(parser.parts))[:30000]

def category(text):
    text=text.lower()
    for group,words in [('Factures',('facture','paiement','règlement','invoice')),('Clients',('devis','commande','client','quote')),('Équipe',('équipe','planning','salarié','paie')),('Fournisseurs',('livraison','fournisseur','stock'))]:
        if any(w in text for w in words):return group
    return 'Activité'


def init_schema(db):
    with db() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS mail_accounts (
          user_id INTEGER NOT NULL REFERENCES users(id), company_id INTEGER NOT NULL REFERENCES companies(id),
          email TEXT NOT NULL DEFAULT '', token TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '',
          automatic INTEGER NOT NULL DEFAULT 0, cursor TEXT NOT NULL DEFAULT '', last_sync REAL NOT NULL DEFAULT 0,
          syncing INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', PRIMARY KEY(user_id,company_id));
        CREATE TABLE IF NOT EXISTS mail_oauth_states (
          state TEXT PRIMARY KEY,user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS mail_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,company_id INTEGER NOT NULL,
          gmail_id TEXT NOT NULL,thread_id TEXT NOT NULL,sender TEXT NOT NULL,reply_to TEXT NOT NULL,
          subject TEXT NOT NULL,body TEXT NOT NULL,received TEXT NOT NULL,category TEXT NOT NULL,
          message_id TEXT NOT NULL DEFAULT '',reply_subject TEXT NOT NULL DEFAULT '',reply_body TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 0,send_status TEXT NOT NULL DEFAULT 'draft',sent_id TEXT NOT NULL DEFAULT '',
          UNIQUE(user_id,company_id,gmail_id));
        CREATE INDEX IF NOT EXISTS idx_mail_scope ON mail_messages(user_id,company_id,id);
        ''')


def install(app,db,require,own_company,utcnow,secret):
    cipher=Fernet(base64.urlsafe_b64encode(hashlib.sha256((secret+':gmail-tokens').encode()).digest()))
    def config():
        return (os.environ.get('GMAIL_CLIENT_ID',''),os.environ.get('GMAIL_CLIENT_SECRET',''),os.environ.get('GMAIL_REDIRECT_URI',''))
    def account(con,uid,cid):
        row=con.execute('SELECT * FROM mail_accounts WHERE user_id=? AND company_id=?',(uid,cid)).fetchone()
        if not row:raise HTTPException(409,'Configurez les intérêts et connectez Gmail.')
        return dict(row)
    def message(con,uid,cid,mid):
        row=con.execute('SELECT * FROM mail_messages WHERE id=? AND user_id=? AND company_id=?',(mid,uid,cid)).fetchone()
        if not row:raise HTTPException(404,'E-mail introuvable')
        return dict(row)
    def scope(req,cid,write=False):
        user=require(req,tenant_id=cid,write=write)
        with db() as con:own_company(con,cid)
        return user['id']
    def access(a):
        if not a['token']:raise HTTPException(409,'Connectez Gmail.')
        try:refresh=cipher.decrypt(a['token'].encode()).decode()
        except InvalidToken:raise HTTPException(409,'Reconnectez Gmail.')
        client_id,client_secret,_=config()
        try:
            r=httpx.post('https://oauth2.googleapis.com/token',data={'client_id':client_id,'client_secret':client_secret,'refresh_token':refresh,'grant_type':'refresh_token'},timeout=20)
            if r.status_code!=200:raise HTTPException(409,'Autorisation Gmail expirée : reconnectez la boîte.')
            return r.json()['access_token']
        except (httpx.HTTPError,KeyError):raise HTTPException(502,'Gmail ne répond pas. Réessayez plus tard.')
    def gmail(method,path,token,**kw):
        try:
            r=httpx.request(method,GMAIL+path,headers={'Authorization':'Bearer '+token},timeout=20,**kw)
            if r.status_code>=400:raise HTTPException(502,'Gmail a refusé la requête. Vérifiez la connexion et ses autorisations.')
            return r.json()
        except httpx.HTTPError:raise HTTPException(502,'Réponse Gmail indisponible.')
    def synchronize(uid,cid):
        with db() as con:
            a=account(con,uid,cid)
            if not a['token']:raise HTTPException(409,'Connectez Gmail.')
            if a['syncing'] and time.time()-a['last_sync']<300:raise HTTPException(409,'Synchronisation déjà en cours.')
            claimed=con.execute('UPDATE mail_accounts SET syncing=1,last_sync=?,error=? WHERE user_id=? AND company_id=? AND (syncing=0 OR last_sync<?)',(time.time(),'',uid,cid,time.time()-300))
            if claimed.rowcount!=1:raise HTTPException(409,'Synchronisation déjà en cours.')
        try:
            token=access(a)
            words=re.findall(r'[\wÀ-ÿ-]{2,}',a['keywords'])[:30]
            if not words:raise HTTPException(422,'Ajoutez les mots-clés de votre activité.')
            query='-in:spam -in:trash -in:sent {'+' '.join(words)+'}'
            params={'maxResults':20,'q':query}
            if a['cursor']:params['pageToken']=a['cursor']
            listing=gmail('GET','/messages',token,params=params);count=0
            for item in listing.get('messages',[]):
                mid=str(item['id'])
                with db() as con:
                    exists=con.execute('SELECT 1 FROM mail_messages WHERE user_id=? AND company_id=? AND gmail_id=?',(uid,cid,mid)).fetchone()
                if exists:continue
                full=gmail('GET','/messages/'+quote(mid,safe=''),token,params={'format':'full'})
                payload=full.get('payload',{});headers={h['name'].lower():h['value'] for h in payload.get('headers',[])}
                sender=headers.get('from','')[:500];reply_to=parseaddr(headers.get('reply-to') or sender)[1]
                if not re.fullmatch(r'[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+',reply_to):reply_to=''
                subject=headers.get('subject','Sans objet')[:300];body=plain_body(payload) or full.get('snippet','')[:1000]
                with db() as con:
                    current=con.execute('SELECT token FROM mail_accounts WHERE user_id=? AND company_id=?',(uid,cid)).fetchone()
                    if not current or current['token']!=a['token']:raise HTTPException(409,'Connexion modifiée pendant le tri.')
                    con.execute('INSERT OR IGNORE INTO mail_messages(user_id,company_id,gmail_id,thread_id,sender,reply_to,subject,body,received,category,message_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                      (uid,cid,mid,str(full.get('threadId','')),sender,reply_to,subject,body,headers.get('date','')[:200],category(subject+' '+body[:4000]),headers.get('message-id','')[:300]))
                count+=1
            with db() as con:
                con.execute('UPDATE mail_accounts SET cursor=?,error=? WHERE user_id=? AND company_id=?',(listing.get('nextPageToken',''),'',uid,cid))
            return {'imported':count,'more':bool(listing.get('nextPageToken'))}
        except HTTPException as e:
            with db() as con:con.execute('UPDATE mail_accounts SET error=? WHERE user_id=? AND company_id=?',(str(e.detail),uid,cid))
            raise
        finally:
            with db() as con:con.execute('UPDATE mail_accounts SET syncing=0 WHERE user_id=? AND company_id=?',(uid,cid))

    @app.get('/api/companies/{cid}/mail/status')
    def status(cid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            row=con.execute('SELECT email,keywords,automatic,last_sync,error,token FROM mail_accounts WHERE user_id=? AND company_id=?',(uid,cid)).fetchone()
        value=dict(row) if row else {'email':'','keywords':'','automatic':0,'last_sync':0,'error':''}
        value['connected']=bool(value.pop('token',''));value['configured']=all(config());return value

    @app.put('/api/companies/{cid}/mail/settings')
    def settings(cid:int,data:MailSettings,req:Request):
        uid=scope(req,cid,True)
        if not re.findall(r'[\wÀ-ÿ-]{2,}',data.keywords):raise HTTPException(422,'Mots-clés invalides')
        with db() as con:
            con.execute('INSERT INTO mail_accounts(user_id,company_id,keywords,automatic) VALUES (?,?,?,?) ON CONFLICT(user_id,company_id) DO UPDATE SET keywords=excluded.keywords,automatic=excluded.automatic,cursor=\'\'',(uid,cid,data.keywords,int(data.automatic)))
        return {'ok':True}

    @app.post('/api/companies/{cid}/mail/connect')
    def connect(cid:int,req:Request):
        uid=scope(req,cid,True)
        if not all(config()):raise HTTPException(409,'Connexion Google à configurer : identifiants OAuth manquants sur le serveur.')
        client_id,_,redirect=config();state=secrets.token_urlsafe(40)
        with db() as con:
            account(con,uid,cid)
            con.execute('DELETE FROM mail_oauth_states WHERE expires<?',(time.time(),))
            con.execute('INSERT INTO mail_oauth_states VALUES (?,?,?,?)',(hashlib.sha256(state.encode()).hexdigest(),uid,cid,time.time()+600))
        return {'url':'https://accounts.google.com/o/oauth2/v2/auth?'+urlencode({'client_id':client_id,'redirect_uri':redirect,'response_type':'code','scope':SCOPES,'state':state,'access_type':'offline','prompt':'consent'})}

    @app.get('/api/mail/gmail/callback')
    def callback(req:Request,state:str='',code:str='',error:str=''):
        user=require(req)
        digest=hashlib.sha256(state.encode()).hexdigest()
        with db() as con:
            row=con.execute('SELECT * FROM mail_oauth_states WHERE state=? AND user_id=? AND expires>?',(digest,user['id'],time.time())).fetchone()
            if not row:raise HTTPException(400,'Autorisation expirée ou invalide. Recommencez la connexion.')
            cid=row['company_id'];require(req,tenant_id=cid)
            claimed=con.execute('DELETE FROM mail_oauth_states WHERE state=?',(digest,))
            if claimed.rowcount!=1:raise HTTPException(400,'Autorisation déjà utilisée.')
        if error or not code:raise HTTPException(400,'Connexion Google annulée.')
        client_id,client_secret,redirect=config()
        try:r=httpx.post('https://oauth2.googleapis.com/token',data={'code':code,'client_id':client_id,'client_secret':client_secret,'redirect_uri':redirect,'grant_type':'authorization_code'},timeout=20)
        except httpx.HTTPError:raise HTTPException(502,'Connexion Google indisponible.')
        tokens=r.json()
        if r.status_code!=200 or not tokens.get('refresh_token'):raise HTTPException(409,'Autorisation Gmail incomplète. Reconnectez la boîte.')
        granted=set(tokens.get('scope','').split())
        if not set(SCOPES.split()).issubset(granted):raise HTTPException(409,'Les accès de lecture et d’envoi doivent être autorisés.')
        profile=gmail('GET','/profile',tokens['access_token'])
        with db() as con:
            old=account(con,user['id'],cid)
            if old['email'] and old['email']!=profile['emailAddress']:
                con.execute('DELETE FROM mail_messages WHERE user_id=? AND company_id=?',(user['id'],cid))
            con.execute('UPDATE mail_accounts SET email=?,token=?,cursor=?,error=? WHERE user_id=? AND company_id=?',
              (profile['emailAddress'],cipher.encrypt(tokens['refresh_token'].encode()).decode(),'','',user['id'],cid))
        return RedirectResponse(f'/?mail_company={cid}#/emails',status_code=303)

    @app.post('/api/companies/{cid}/mail/sync')
    def sync(cid:int,req:Request):return synchronize(scope(req,cid,True),cid)

    @app.post('/api/companies/{cid}/mail/disconnect')
    def disconnect(cid:int,req:Request):
        uid=scope(req,cid,True)
        with db() as con:
            a=account(con,uid,cid)
        if a['token']:
            try:httpx.post('https://oauth2.googleapis.com/revoke',data={'token':cipher.decrypt(a['token'].encode()).decode()},timeout=10)
            except (httpx.HTTPError,InvalidToken):pass
        with db() as con:
            con.execute('DELETE FROM mail_oauth_states WHERE user_id=? AND company_id=?',(uid,cid))
            con.execute('DELETE FROM mail_accounts WHERE user_id=? AND company_id=?',(uid,cid))
            con.execute('DELETE FROM mail_messages WHERE user_id=? AND company_id=?',(uid,cid))
        return {'ok':True}

    @app.get('/api/companies/{cid}/mail/messages')
    def messages(cid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:
            return [dict(r) for r in con.execute('SELECT id,sender,subject,received,category,send_status,revision FROM mail_messages WHERE user_id=? AND company_id=? ORDER BY id DESC LIMIT 1000',(uid,cid))]

    @app.get('/api/companies/{cid}/mail/messages/{mid}')
    def detail(cid:int,mid:int,req:Request):
        uid=scope(req,cid)
        with db() as con:return message(con,uid,cid,mid)

    @app.put('/api/companies/{cid}/mail/messages/{mid}/reply')
    def reply(cid:int,mid:int,data:Reply,req:Request):
        uid=scope(req,cid,True)
        if '\r' in data.subject or '\n' in data.subject:raise HTTPException(422,'Objet invalide')
        if '[Complétez ici' in data.body:raise HTTPException(422,'Complétez le brouillon avant de l’enregistrer pour envoi.')
        with db() as con:
            m=message(con,uid,cid,mid)
            if m['send_status'] in ('sending','sent','uncertain'):raise HTTPException(409,'Réponse déjà envoyée ou à vérifier dans Gmail.')
            cur=con.execute("UPDATE mail_messages SET reply_subject=?,reply_body=?,revision=revision+1 WHERE id=? AND send_status='draft'",(data.subject,data.body,mid))
            if cur.rowcount!=1:raise HTTPException(409,'Un envoi est déjà lancé.')
            return message(con,uid,cid,mid)

    @app.post('/api/companies/{cid}/mail/messages/{mid}/send')
    def send(cid:int,mid:int,data:Send,req:Request):
        uid=scope(req,cid,True)
        if not data.confirmed:raise HTTPException(422,'Validation explicite obligatoire avant envoi.')
        with db() as con:
            m=message(con,uid,cid,mid);a=account(con,uid,cid)
            if m['revision']!=data.revision or not m['reply_body'] or not m['reply_to']:raise HTTPException(409,'Vérifiez et enregistrez la réponse avant envoi.')
            if m['send_status']!='draft':raise HTTPException(409,'Envoi déjà effectué ou à vérifier dans Gmail.')
        token=access(a)
        mail=EmailMessage();mail['From']=a['email'];mail['To']=m['reply_to'];mail['Subject']=m['reply_subject'];mail.set_content(m['reply_body'])
        if m['message_id'] and '\r' not in m['message_id'] and '\n' not in m['message_id']:
            mail['In-Reply-To']=m['message_id'];mail['References']=m['message_id']
        raw=base64.urlsafe_b64encode(mail.as_bytes()).decode()
        with db() as con:
            cur=con.execute("UPDATE mail_messages SET send_status='sending' WHERE id=? AND user_id=? AND company_id=? AND revision=? AND send_status='draft'",(mid,uid,cid,data.revision))
            if cur.rowcount!=1:raise HTTPException(409,'Réponse modifiée ou envoi déjà lancé.')
        try:
            result=gmail('POST','/messages/send',token,json={'raw':raw,'threadId':m['thread_id']})
            if not result.get('id'):raise HTTPException(502,'Confirmation d’envoi manquante.')
        except Exception:
            with db() as con:con.execute("UPDATE mail_messages SET send_status='uncertain' WHERE id=?",(mid,))
            raise HTTPException(502,'Envoi non confirmé : vérifiez les messages envoyés dans Gmail avant toute nouvelle tentative.')
        with db() as con:con.execute("UPDATE mail_messages SET send_status='sent',sent_id=? WHERE id=?",(result['id'],mid))
        return {'sent':True}

    async def worker():
        while True:
            await asyncio.sleep(60)
            with db() as con:
                accounts=[dict(r) for r in con.execute("SELECT user_id,company_id FROM mail_accounts WHERE automatic=1 AND token<>'' AND last_sync<?",(time.time()-900,))]
            for a in accounts:
                try:await asyncio.to_thread(synchronize,a['user_id'],a['company_id'])
                except Exception:pass
    running={}
    async def start():running['task']=asyncio.create_task(worker())
    async def stop():
        task=running.get('task')
        if task:
            task.cancel()
            try:await task
            except asyncio.CancelledError:pass
    previous_lifespan=app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(application):
        async with previous_lifespan(application):
            await start()
            try:yield
            finally:await stop()
    app.router.lifespan_context=lifespan
