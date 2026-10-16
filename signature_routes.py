"""Explicit, on-device handwriting capture bound to immutable quotation terms.

This records a signature collected in the application, not a qualified certificate.
"""
import base64
import hashlib
import json
import math
from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo
from cryptography.fernet import Fernet,InvalidToken
from fastapi import HTTPException,Request
from pydantic import BaseModel,Field,ValidationError

CONSENT='J’ai lu ce devis, je confirme être la personne nommée et je valide ma signature ainsi que son contenu.'

class Point(BaseModel):
    x:float=Field(ge=0,le=1,allow_inf_nan=False)
    y:float=Field(ge=0,le=1,allow_inf_nan=False)

Stroke=Annotated[list[Point],Field(min_length=2,max_length=512)]
class SignatureInput(BaseModel):
    signer_name:str=Field(min_length=2,max_length=150)
    content_hash:str=Field(pattern=r'^[a-f0-9]{64}$')
    confirmed:bool=False
    strokes:list[Stroke]=Field(min_length=1,max_length=64)

def content_hash(q):
    data={k:v for k,v in q['data'].items() if k!='status'}
    terms={k:q[k] for k in ('company_id','reference','issuer','created','subtotal_minor','tax_minor','total_minor')}
    terms['data']=data
    return hashlib.sha256(json.dumps(terms,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

def cipher(secret):
    if not secret:raise HTTPException(503,'La signature n’est pas configurée.')
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(('aia-signatures:'+secret).encode()).digest()))

def init_schema(con):
    con.execute('''CREATE TABLE IF NOT EXISTS quotation_signatures (
      quote_id INTEGER PRIMARY KEY REFERENCES quotations(id),company_id INTEGER NOT NULL REFERENCES companies(id),
      recorded_by INTEGER NOT NULL REFERENCES users(id),content_hash TEXT NOT NULL,signed_at TEXT NOT NULL,payload BLOB NOT NULL)''')

def signature_for(con,cid,qid,secret,paths=False):
    row=con.execute('SELECT * FROM quotation_signatures WHERE company_id=? AND quote_id=?',(cid,qid)).fetchone()
    if not row:return None
    try:data=json.loads(cipher(secret).decrypt(row['payload']))
    except (InvalidToken,ValueError):raise HTTPException(503,'La signature enregistrée est illisible.')
    result={'signer_name':data['signer_name'],'signed_at':row['signed_at'],'content_hash':row['content_hash'],'consent':data['consent']}
    if paths:result['strokes']=data['strokes']
    return result

def install(app,db,require,get_quote,utcnow,secret):
    @app.post('/api/companies/{cid}/quotations/{qid}/signature',status_code=201)
    async def sign(cid:int,qid:int,req:Request):
        user=require(req,tenant_id=cid,write=True)
        body=bytearray()
        async for chunk in req.stream():
            body.extend(chunk)
            if len(body)>256*1024:raise HTTPException(413,'Signature trop volumineuse. Recommencez le tracé.')
        try:data=SignatureInput.model_validate_json(body)
        except ValidationError:raise HTTPException(422,'Nom, tracé et confirmation de signature obligatoires.')
        name=' '.join(data.signer_name.split())
        if not data.confirmed or len(name)<2 or not any(c.isalpha() for c in name):raise HTTPException(422,'Confirmez votre nom et votre accord avant de signer.')
        if sum(len(s) for s in data.strokes)>5000:raise HTTPException(422,'Tracé trop long. Recommencez la signature.')
        ink=sum(math.hypot(b.x-a.x,b.y-a.y) for s in data.strokes for a,b in zip(s,s[1:]))
        if ink<.08:raise HTTPException(422,'Dessinez votre signature dans la zone prévue.')
        payload={'signer_name':name,'strokes':[[p.model_dump() for p in s] for s in data.strokes],'consent':CONSENT}
        encrypted=cipher(secret).encrypt(json.dumps(payload,ensure_ascii=False).encode())
        with db() as con:
            con.execute('BEGIN IMMEDIATE');q=get_quote(con,cid,qid)
            if q.get('signature'):raise HTTPException(409,'Ce devis est déjà signé.')
            if data.content_hash!=content_hash(q):raise HTTPException(409,'Le devis a changé. Relisez la nouvelle version avant de signer.')
            if q['status']=='declined':raise HTTPException(409,'Ce devis a été refusé. Préparez une nouvelle version.')
            today=datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()
            if q['data'].get('valid_until') and q['data']['valid_until']<today:raise HTTPException(409,'Ce devis est expiré. Préparez une nouvelle version avant de signer.')
            now=utcnow()
            con.execute('INSERT INTO quotation_signatures VALUES (?,?,?,?,?,?)',(qid,cid,user['id'],data.content_hash,now,encrypted))
            q['data']['status']='accepted'
            con.execute("UPDATE quotations SET status='accepted',payload=?,updated=? WHERE company_id=? AND id=?",(json.dumps(q['data']),now,cid,qid));con.execute('COMMIT')
        return {'ok':True,'signed_at':now}
