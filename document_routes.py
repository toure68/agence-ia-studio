"""Bounded local OCR, encrypted source documents and explicitly reviewed profiles."""
import base64
import binascii
import hashlib
import io
import json
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import warnings
import unicodedata

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError, field_validator
from starlette.concurrency import run_in_threadpool
from document_understanding import IDENTITY_KINDS, interpret_document, read_mrz

MAX_BYTES=8*1024*1024
MAX_BODY=12*1024*1024
MAX_COMPANY_BYTES=32*1024*1024
OCR_SLOTS=threading.BoundedSemaphore(2)
ANALYSIS_VERSION=2
PROFILE_KEYS=('legal_name','siret','iban','address','email','phone','rcs_number','legal_form','capital','trade_name','activity','representative','last_name','first_name','birth_date','birth_place','nationality','document_number','expiry_date','personal_address','account_holder','bic','insurer','policy_number','sex','issue_date','issuing_authority','issuing_country','document_holder')
KINDS={'kbis','rib','quote','identity','passport','residence','address','registration','insurance','other'}

def profile_cipher(secret):
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(('aia-documents:'+secret).encode()).digest()))

def issuer_details(db,cid,secret):
    with db() as con:row=con.execute('SELECT payload FROM company_profiles WHERE company_id=?',(cid,)).fetchone()
    if not row:return {}
    try:fields=json.loads(profile_cipher(secret).decrypt(row['payload']))
    except (InvalidToken,ValueError):raise HTTPException(503,'Le profil vérifié est illisible.')
    # Banking identifiers never enter the general quotation API or PDF.
    return {k:fields[k] for k in ('legal_name','siret','address') if fields.get(k)}

def valid_siret(value):
    if not re.fullmatch(r'\d{14}',value) or len(set(value))==1:return False
    digits=[int(c) for c in value]
    return sum((d*2-9 if d*2>9 else d*2) if i%2==0 else d for i,d in enumerate(digits))%10==0

def valid_iban(value):
    if not re.fullmatch(r'[A-Z]{2}\d{2}[A-Z0-9]{11,30}',value):return False
    expected={'FR':27,'DE':22,'ES':24,'GB':22,'PT':25,'NL':18,'BE':16,'IT':27,'CH':21,'LU':20}
    if value[:2] in expected and len(value)!=expected[value[:2]]:return False
    digits=''.join(str(ord(c)-55) if c.isalpha() else c for c in value[4:]+value[:4])
    return int(digits)%97==1

def checked_fields(fields):
    if any(k not in PROFILE_KEYS for k in fields):raise HTTPException(422,'Champ de profil inconnu')
    result={k:str(v).strip() for k,v in fields.items()}
    if any(len(v)>600 for v in result.values()):raise HTTPException(422,'Champ trop long')
    if result.get('siret'):
        result['siret']=re.sub(r'\s','',result['siret'])
        if not valid_siret(result['siret']):raise HTTPException(422,'SIRET invalide : vérifiez les chiffres.')
    if result.get('iban'):
        result['iban']=re.sub(r'\s','',result['iban']).upper()
        if not valid_iban(result['iban']):raise HTTPException(422,'IBAN invalide : vérifiez les caractères.')
    if result.get('email') and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',result['email']):raise HTTPException(422,'Email invalide')
    return result

class Tariff(BaseModel):
    description:str=Field(min_length=2,max_length=300)
    unit_price:Decimal=Field(ge=0,le=100000000,max_digits=11,decimal_places=2)
    currency:str=Field(pattern='^(EUR|XOF|USD)$')
    unit:str=Field(default='unité',min_length=1,max_length=40)

class Review(BaseModel):
    confirmed:bool=False
    profile_fields:dict[str,str]=Field(default_factory=dict,max_length=len(PROFILE_KEYS))
    rates:list[Tariff]=Field(default_factory=list,max_length=30)

class ProfileUpdate(BaseModel):
    confirmed:bool=False
    fields:dict[str,str]=Field(max_length=len(PROFILE_KEYS))
    version:int=Field(ge=0)

class Upload(BaseModel):
    filename:str=Field(min_length=1,max_length=200)
    kind:str=Field(pattern='^('+'|'.join(sorted(KINDS))+')$')
    data:str=Field(min_length=4,max_length=MAX_BODY)

def extract_proposal(text,kind):
    fields={};evidence={};notes=[]
    lines=[l.strip() for l in text.splitlines() if l.strip()]
    # Fold one character at a time so match offsets still refer to the original
    # accented value. Labels may precede a value in the same row or on the next.
    def fold(value):
        return ''.join(''.join(c for c in unicodedata.normalize('NFD',ch) if not unicodedata.combining(c)) for ch in value).lower().replace('’',"'").replace('‘',"'")
    business=kind in ('kbis','registration','quote','other')
    person=kind=='other'
    labels=[]
    if business:
        labels += [('legal_name',r'denomination(?:\s+ou raison sociale)?|raison sociale|entreprise'),('address',r'adresse du siege|siege social|adresse'),('rcs_number',r'immatriculation au rcs,?\s*(?:numero)?|numero rcs|rcs'),('legal_form',r'forme juridique'),('capital',r'capital social'),('trade_name',r'nom commercial'),('activity',r'activite\(?s?\)?\s+exercee\(?s?\)?|activite principale|activite'),('representative',r'nom,?\s*prenoms?|representant legal|gerant')]
    if person:
        labels += [('last_name',r'nom de famille|nom de naissance|surname|nom'),('first_name',r'prenoms?\(?s?\)?|given names?'),('birth_date',r'date de naissance|date of birth|ne\(e\) le'),('birth_place',r'lieu de naissance|place of birth'),('nationality',r'nationalite|nationality'),('document_number',r'numero (?:du (?:document|titre)|de (?:carte|passeport))|document no\.?|passport no\.?'),('expiry_date',r'date d.expiration|date de fin de validite|valable jusqu.au|date of expiry'),('personal_address',r'adresse(?: du domicile)?|domicile(?: personnel)?')]
    # Longest matching label wins (e.g. "nom commercial" before "nom").
    def label_match(line):
        candidates=[]
        for key,pattern in labels:
            m=re.match(r'^(?:'+pattern+r')(?=\s|[:\-]|$)\s*[:\-]?\s*',fold(line))
            if m:candidates.append((m.end(),key))
        return max(candidates,default=None)
    for i,line in enumerate(lines):
        match=label_match(line)
        if not match:continue
        end,key=match;value=line[end:].strip(' :\t-')
        if not value and i+1<len(lines) and not label_match(lines[i+1]):
            candidate=lines[i+1]
            if not re.match(r'^(identification|gestion|renseignements|gerant|extrait|fin de)',fold(candidate)):value=candidate
        if value and key not in fields:
            if key in ('address','personal_address'):
                following=i+1 if line[end:].strip(' :\t-') else i+2
                if following<len(lines) and re.match(r'^\d{5}\s+\D',lines[following]):value+=' '+lines[following]
            fields[key]=value[:600];evidence[key]=(line+' '+value if end>=len(line) else line)[:600]
    for i,line in enumerate(lines):
        if kind in ('kbis','registration','rib','quote','other') and 'siret' in line.lower():
            source=line+' '+(lines[i+1] if i+1<len(lines) else '')
            for m in re.finditer(r'(?<!\d)(?:\d[ .]?){13}\d(?!\d)',source):
                value=re.sub(r'\D','',m[0])
                if valid_siret(value):fields['siret']=value;evidence['siret']=line[:600]
                else:notes.append('Un numéro SIRET lu n’a pas passé le contrôle : vérifiez le document.')
        if kind in ('kbis','registration','rib','quote','other') and ('iban' in line.lower() or re.match(r'^[A-Z]{2}\s*\d{2}',line)):
            compact=re.sub(r'\s','',(line+' '+(lines[i+1] if i+1<len(lines) else '')).upper())
            for start in re.finditer(r'[A-Z]{2}\d{2}',compact):
                for length in range(34,14,-1):
                    candidate=compact[start.start():start.start()+length]
                    if len(candidate)==length and valid_iban(candidate):fields['iban']=candidate;evidence['iban']=line[:600];break
                if 'iban' in fields:break
        if kind in ('kbis','registration','quote','other'):
            m=re.search(r'[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}',line)
            if m:fields['email']=m[0].rstrip('.,;');evidence['email']=line[:600]
            m=re.search(r'(?:t[ée]l(?:[ée]phone)?|phone)\s*[:.]?\s*(\+?[\d ()\-.]{8,30})',line,re.I)
            if m:fields['phone']=m[1].strip();evidence['phone']=line[:600]
    if kind in IDENTITY_KINDS|{'address','rib','insurance'}:
        typed,proof,warnings=interpret_document(text,kind);fields.update(typed);evidence.update(proof);notes+=warnings
    if kind=='rib' and re.search(r'\bIBAN\b',text,re.I) and 'iban' not in fields:notes.append('L’IBAN n’a pas passé le contrôle de lecture : vérifiez la photo ou le numéro.')
    if kind in ('kbis','registration') and 'rcs_number' in fields and 'siret' not in fields:
        notes.append('Le numéro RCS est repris séparément. Aucun SIRET n’est déduit de ce numéro.')
    rates=[]
    if kind=='quote':
        for line in lines:
            if re.match(r'^(total|sous.total|tva|remise|acompte|siret|iban|quantit)',line,re.I):continue
            m=re.fullmatch(r'(.{2,150}?)\s*[:|]?\s+(\d{1,8}(?:[.,]\d{1,2})?)\s*(EUR|€|FCFA|XOF|USD|\$)\s*(?:/\s*([\w²³ -]{1,30}))?',line,re.I)
            if m:
                cur=m[3].upper();cur='EUR' if cur=='€' else 'XOF' if cur=='FCFA' else 'USD' if cur=='$' else cur
                rates.append({'description':m[1].rstrip(' :|'),'unit_price':m[2].replace(',','.'),'currency':cur,'unit':(m[4] or 'unité').strip(),'source':line[:600]})
        if not rates:notes.append('Aucun tarif unitaire fiable reconnu. Les tableaux complexes ne sont pas interprétés automatiquement.')
    if not fields and not rates:notes.append('Aucun champ exploitable reconnu : vérifiez la qualité du document ou complétez le profil.')
    return {'fields':fields,'evidence':evidence,'rates':rates[:30],'notes':list(dict.fromkeys(notes)),'review_required':True}

@lru_cache(maxsize=1)
def ocr_languages():
    if not shutil.which('tesseract'):raise HTTPException(503,'La numérisation locale n’est pas disponible sur ce serveur.')
    result=subprocess.run(['tesseract','--list-langs'],capture_output=True,text=True,timeout=5)
    return 'fra+eng' if 'fra' in result.stdout.splitlines() else 'eng'

def image_text(raw,kind=None):
    from PIL import Image, ImageOps, UnidentifiedImageError
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            image=Image.open(io.BytesIO(raw))
            if image.width*image.height>24000000:raise HTTPException(413,'Image trop grande : 24 mégapixels maximum.')
            image=ImageOps.exif_transpose(image);image.load()
            image=ImageOps.autocontrast(image.convert('L'));image.thumbnail((2600,2600))
            with tempfile.TemporaryDirectory(prefix='aia-ocr-') as folder:
                path=Path(folder)/'scan.png';image.save(path)
                result=subprocess.run(['tesseract',str(path),'stdout','-l',ocr_languages(),'--psm','6','-c','preserve_interword_spaces=1'],capture_output=True,timeout=20)
                if result.returncode:raise HTTPException(422,'Lecture impossible : utilisez une photo plus nette.')
                text=result.stdout.decode('utf-8',errors='replace')[:100000]
                if kind in IDENTITY_KINDS and not read_mrz(text)[0]:
                    # A targeted second reading avoids mixing portrait/background
                    # text into the machine-readable lines at the bottom.
                    crop=image.crop((0,int(image.height*.52),image.width,image.height));crop.save(path)
                    try:
                        extra=subprocess.run(['tesseract',str(path),'stdout','-l','eng','--psm','6','-c','tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'],capture_output=True,timeout=12)
                        candidate=extra.stdout.decode('utf-8',errors='replace') if extra.returncode==0 else ''
                    except subprocess.TimeoutExpired:candidate=''
                    if read_mrz(candidate)[0]:text+='\n'+candidate
                return text[:100000]
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning):
        raise HTTPException(422,'Image illisible. Utilisez JPEG ou PNG.')

def read_document(raw,kind=None):
    try:
        if raw.startswith(b'%PDF-'):
            from pypdf import PdfReader
            try:
                reader=PdfReader(io.BytesIO(raw))
                if reader.is_encrypted:raise HTTPException(422,'Retirez le mot de passe du PDF avant import.')
                if not 1<=len(reader.pages)<=3:raise HTTPException(413,'Trois pages maximum par import.')
                texts=[p.extract_text() or '' for p in reader.pages]
            except HTTPException:raise
            except Exception:raise HTTPException(422,'PDF illisible')
            if any(len(t.strip())<30 for t in texts):
                if not shutil.which('pdftoppm'):raise HTTPException(503,'La lecture des PDF scannés est indisponible.')
                with tempfile.TemporaryDirectory(prefix='aia-pdf-') as folder:
                    source=Path(folder)/'source.pdf';source.write_bytes(raw)
                    result=subprocess.run(['pdftoppm','-f','1','-l','3','-scale-to','2400','-png',str(source),str(Path(folder)/'page')],capture_output=True,timeout=25)
                    if result.returncode:raise HTTPException(422,'Impossible de lire ce PDF scanné.')
                    pages=sorted(Path(folder).glob('page-*.png'))
                    texts=[image_text(page.read_bytes(),kind) for page in pages]
            return '\n'.join(texts)[:100000],'application/pdf'
        if raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff'):
            return image_text(raw,kind),'image/png' if raw.startswith(b'\x89PNG') else 'image/jpeg'
        raise HTTPException(415,'Formats acceptés : JPEG, PNG et PDF.')
    except subprocess.TimeoutExpired:raise HTTPException(422,'Lecture trop longue : importez une page plus simple ou plus nette.')

def init_schema(db):
    with db() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS company_profiles (
          company_id INTEGER PRIMARY KEY REFERENCES companies(id),payload BLOB NOT NULL,version INTEGER NOT NULL,updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS source_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL REFERENCES companies(id),user_id INTEGER NOT NULL REFERENCES users(id),
          filename TEXT NOT NULL,kind TEXT NOT NULL,digest TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,
          original BLOB NOT NULL,payload BLOB NOT NULL,reviewed INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL,
          UNIQUE(company_id,digest,kind));
        CREATE TABLE IF NOT EXISTS imported_tariffs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL REFERENCES companies(id),document_id INTEGER NOT NULL REFERENCES source_documents(id),
          description TEXT NOT NULL,unit_price_minor INTEGER NOT NULL,currency TEXT NOT NULL,unit TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_documents_company ON source_documents(company_id,id);
        ''')

def install(app,db,require,own_company,utcnow,secret):
    cipher=profile_cipher(secret)
    def encrypt(value):return cipher.encrypt(json.dumps(value,ensure_ascii=False).encode())
    def decrypt(value):
        try:return json.loads(cipher.decrypt(value))
        except (InvalidToken,ValueError):raise HTTPException(503,'La clé de lecture des documents est indisponible.')
    def scope(req,cid,write=False):
        u=require(req,tenant_id=cid,owner=True,write=write)
        with db() as con:own_company(con,cid)
        return u
    def get_doc(con,cid,did):
        row=con.execute('SELECT * FROM source_documents WHERE company_id=? AND id=?',(cid,did)).fetchone()
        if not row:raise HTTPException(404,'Document introuvable')
        return row
    def profile(con,cid):
        row=con.execute('SELECT * FROM company_profiles WHERE company_id=?',(cid,)).fetchone()
        return {'fields':decrypt(row['payload']) if row else {},'version':row['version'] if row else 0}
    def save_profile(con,cid,fields,version):
        con.execute('INSERT INTO company_profiles VALUES (?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated=excluded.updated',
          (cid,encrypt(fields),version,utcnow()))

    async def analyze(raw,kind):
        if not OCR_SLOTS.acquire(blocking=False):raise HTTPException(429,'Deux lectures sont déjà en cours. Réessayez dans un instant.')
        try:return await run_in_threadpool(read_document,raw,kind)
        finally:OCR_SLOTS.release()

    @app.get('/api/companies/{cid}/profile')
    def read_profile(cid:int,req:Request):
        scope(req,cid)
        with db() as con:return profile(con,cid)

    @app.put('/api/companies/{cid}/profile')
    def update_profile(cid:int,data:ProfileUpdate,req:Request):
        scope(req,cid,True)
        if not data.confirmed:raise HTTPException(422,'Vérifiez et confirmez les informations.')
        fields=checked_fields(data.fields)
        with db() as con:
            con.execute('BEGIN IMMEDIATE');current=profile(con,cid)
            if current['version']!=data.version:raise HTTPException(409,'Le profil a changé. Rechargez la page.')
            save_profile(con,cid,fields,current['version']+1);con.execute('COMMIT')
        return {'ok':True}

    @app.get('/api/companies/{cid}/documents')
    def documents(cid:int,req:Request):
        scope(req,cid)
        with db() as con:return [dict(r) for r in con.execute('SELECT id,filename,kind,size,reviewed,created FROM source_documents WHERE company_id=? ORDER BY id DESC',(cid,))]

    @app.get('/api/companies/{cid}/documents/{did}')
    def document(cid:int,did:int,req:Request):
        scope(req,cid)
        with db() as con:
            row=get_doc(con,cid,did)
            payload=decrypt(row['payload'])
            # Proposals are derived from retained OCR text; re-read with the current
            # parser without modifying a reviewed document or saved profile.
            if not row['reviewed']:payload['proposal']=extract_proposal(payload['text'],row['kind'])
            return {'id':did,'filename':row['filename'],'kind':row['kind'],'reviewed':bool(row['reviewed']),**payload}

    @app.get('/api/companies/{cid}/documents/{did}/source')
    def original(cid:int,did:int,req:Request):
        scope(req,cid)
        with db() as con:row=get_doc(con,cid,did)
        ext={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'}[row['mime']]
        return Response(cipher.decrypt(row['original']),media_type='application/octet-stream',headers={'Content-Disposition':f'attachment; filename="document-{did}.{ext}"'})

    @app.post('/api/companies/{cid}/documents/{did}/reanalyze')
    async def reanalyze(cid:int,did:int,req:Request):
        scope(req,cid,True)
        with db() as con:row=get_doc(con,cid,did)
        if row['reviewed']:raise HTTPException(409,'Ce document a déjà été validé.')
        text,mime=await analyze(cipher.decrypt(row['original']),row['kind'])
        payload={'text':text,'proposal':extract_proposal(text,row['kind']),'analysis_version':ANALYSIS_VERSION}
        with db() as con:
            con.execute('BEGIN IMMEDIATE');current=get_doc(con,cid,did)
            if current['reviewed']:raise HTTPException(409,'Ce document vient d’être validé. Rechargez la page.')
            con.execute('UPDATE source_documents SET payload=? WHERE company_id=? AND id=?',(encrypt(payload),cid,did));con.execute('COMMIT')
        return {'ok':True}

    @app.delete('/api/companies/{cid}/documents/{did}')
    def remove_document(cid:int,did:int,req:Request):
        scope(req,cid,True)
        with db() as con:
            con.execute('BEGIN IMMEDIATE');get_doc(con,cid,did)
            con.execute('DELETE FROM imported_tariffs WHERE company_id=? AND document_id=?',(cid,did))
            con.execute('DELETE FROM source_documents WHERE company_id=? AND id=?',(cid,did));con.execute('COMMIT')
        return {'ok':True}

    @app.post('/api/companies/{cid}/documents',status_code=201)
    async def upload(cid:int,req:Request):
        user=scope(req,cid,True)
        body=bytearray()
        async for chunk in req.stream():
            body.extend(chunk)
            if len(body)>MAX_BODY:raise HTTPException(413,'Fichier trop volumineux : 8 Mo maximum.')
        try:
            data=Upload.model_validate_json(body)
            raw=base64.b64decode(data.data,validate=True)
        except (ValidationError,ValueError,binascii.Error):raise HTTPException(422,'Import de document invalide')
        if not raw or len(raw)>MAX_BYTES:raise HTTPException(413,'Fichier vide ou supérieur à 8 Mo.')
        digest=hashlib.sha256(raw).hexdigest()
        with db() as con:
            old=con.execute('SELECT id FROM source_documents WHERE company_id=? AND digest=? AND kind=?',(cid,digest,data.kind)).fetchone()
            if old:return {'id':old['id'],'duplicate':True}
        text,mime=await analyze(raw,data.kind)
        proposal=extract_proposal(text,data.kind)
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            count,size=con.execute('SELECT COUNT(*),COALESCE(SUM(size),0) FROM source_documents WHERE company_id=?',(cid,)).fetchone()
            if count>=100 or size+len(raw)>MAX_COMPANY_BYTES:raise HTTPException(413,'Limite d’archives atteinte pour cette entreprise.')
            con.execute('INSERT OR IGNORE INTO source_documents(company_id,user_id,filename,kind,digest,mime,size,original,payload,created) VALUES (?,?,?,?,?,?,?,?,?,?)',
              (cid,user['id'],data.filename,data.kind,digest,mime,len(raw),cipher.encrypt(raw),encrypt({'text':text,'proposal':proposal,'analysis_version':ANALYSIS_VERSION}),utcnow()))
            did=con.execute('SELECT id FROM source_documents WHERE company_id=? AND digest=? AND kind=?',(cid,digest,data.kind)).fetchone()['id']
            con.execute('COMMIT')
        return {'id':did,'duplicate':False}

    @app.post('/api/companies/{cid}/documents/{did}/confirm')
    def confirm(cid:int,did:int,data:Review,req:Request):
        scope(req,cid,True)
        if not data.confirmed:raise HTTPException(422,'La confirmation humaine est obligatoire.')
        fields=checked_fields(data.profile_fields)
        with db() as con:
            con.execute('BEGIN IMMEDIATE');row=get_doc(con,cid,did)
            if row['reviewed']:raise HTTPException(409,'Ce document a déjà été validé.')
            if fields:
                current=profile(con,cid);save_profile(con,cid,{**current['fields'],**fields},current['version']+1)
            for rate in data.rates:
                con.execute('INSERT INTO imported_tariffs(company_id,document_id,description,unit_price_minor,currency,unit) VALUES (?,?,?,?,?,?)',
                  (cid,did,rate.description,int(rate.unit_price*100),rate.currency,rate.unit))
            payload=decrypt(row['payload']);payload['proposal']=extract_proposal(payload['text'],row['kind'])
            payload['review']={'fields':fields,'rates':[r.model_dump(mode='json') for r in data.rates],'confirmed_at':utcnow()}
            con.execute('UPDATE source_documents SET reviewed=1,payload=? WHERE id=? AND company_id=?',(encrypt(payload),did,cid));con.execute('COMMIT')
        return {'ok':True,'rates_imported':len(data.rates)}

    @app.get('/api/companies/{cid}/tariff-catalog')
    def tariffs(cid:int,req:Request):
        require(req,tenant_id=cid)
        with db() as con:
            own_company(con,cid)
            return [dict(r) for r in con.execute('SELECT id,description,unit_price_minor,currency,unit FROM imported_tariffs WHERE company_id=? ORDER BY id DESC',(cid,))]
