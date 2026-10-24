"""Owner-only Google OAuth setup. Client secrets never leave encrypted server storage."""
import base64
import hashlib
import json
import os
import re
import time
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, ValidationError

CALLBACK='https://agence-ia-studio.onrender.com/api/mail/gmail/callback'


def init_schema(db):
    with db() as con:
        con.execute('CREATE TABLE IF NOT EXISTS google_mail_config(id INTEGER PRIMARY KEY CHECK(id=1),payload BLOB NOT NULL,updated REAL NOT NULL)')


class GoogleClient(BaseModel):
    client_id:str=Field(min_length=1,max_length=254)
    client_secret:str=Field(default='',max_length=512)


def install(app,db,require,own_company,secret,throttle):
    cipher=Fernet(base64.urlsafe_b64encode(hashlib.sha256((secret+':google-oauth-client').encode()).digest()))
    def read():
        with db() as con:r=con.execute('SELECT payload FROM google_mail_config WHERE id=1').fetchone()
        if r:
            try:return {**json.loads(cipher.decrypt(r['payload']).decode()),'source':'application'}
            except (InvalidToken,ValueError,TypeError):return {'client_id':'','client_secret':'','redirect_uri':CALLBACK,'source':'unavailable'}
        return {'client_id':os.environ.get('GMAIL_CLIENT_ID','').strip(),'client_secret':os.environ.get('GMAIL_CLIENT_SECRET','').strip(),'redirect_uri':os.environ.get('GMAIL_REDIRECT_URI','').strip() or CALLBACK,'source':'environment'}
    def public():
        c=read()
        return {'configured':all(c.get(k) for k in ('client_id','client_secret','redirect_uri')),'client_id':c['client_id'],'secret_set':bool(c['client_secret']),'redirect_uri':CALLBACK,'source':c['source']}
    def owner(req,cid,write=False):
        u=require(req,tenant_id=cid,owner=True,write=write)
        with db() as con:own_company(con,cid)
        return u
    @app.get('/api/companies/{cid}/mail/google/setup')
    def status(cid:int,req:Request):
        owner(req,cid);return public()
    @app.put('/api/companies/{cid}/mail/google/setup')
    async def save(cid:int,req:Request):
        u=owner(req,cid,True);throttle('google-client:'+str(u['id']),20,3600)
        chunks=[];size=0
        async for chunk in req.stream():
            size+=len(chunk)
            if size>4096:raise HTTPException(413,'Configuration Google trop volumineuse.')
            chunks.append(chunk)
        try:data=GoogleClient.model_validate(json.loads(b''.join(chunks)))
        except (ValueError,TypeError,UnicodeError,ValidationError):raise HTTPException(422,'Paramètres Google invalides.')
        client=data.client_id.strip();secret_value=data.client_secret.strip();old=read()
        if not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com',client):raise HTTPException(422,'Utilisez l’identifiant client OAuth Google, terminé par .apps.googleusercontent.com.')
        if not secret_value and old['client_id']==client:secret_value=old['client_secret']
        if len(secret_value)<8 or re.search(r'\s',secret_value):raise HTTPException(422,'Renseignez le secret du client OAuth Google. Ce n’est pas votre mot de passe Gmail.')
        payload={'client_id':client,'client_secret':secret_value,'redirect_uri':CALLBACK}
        with db() as con:
            con.execute('INSERT INTO google_mail_config(id,payload,updated) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated',(cipher.encrypt(json.dumps(payload).encode()),time.time()))
        return public()
    return read
