import base64
import json
import shutil
import pytest
from fastapi.testclient import TestClient
from test_app import env,auth
from document_fixtures import kbis_png,quote_pdf
from document_routes import valid_siret,valid_iban,extract_proposal

def owner(env):
    c=TestClient(env.app);return c,auth(c,'owner@demo.test','correct horse battery staple')

def upload(c,h,kind,raw,name='exemple.pdf',cid=1):
    return c.post(f'/api/companies/{cid}/documents',headers=h,json={'filename':name,'kind':kind,'data':base64.b64encode(raw).decode()})

def test_personal_modules_empty_home_domains_and_scope(env):
    c,h=owner(env);path='/api/companies/1/workspace';state=c.get(path).json()
    assert len(state['modules'])==16 and len(state['visible'])==16 and state['version']==0
    assert c.put(path,json={'domain':'agriculture','visible':[],'version':0}).status_code==403
    assert c.put(path,headers=h,json={'domain':'agriculture','visible':[],'version':0}).status_code==200
    state=c.get(path).json();assert state['visible']==[] and 'equipment' in state['suggested'] and 'prospects' not in state['suggested']
    assert c.put(path,headers=h,json={'domain':'agriculture','visible':['prospects'],'version':0}).status_code==409
    assert c.put(path,headers=h,json={'domain':'agriculture','visible':['prospects'],'version':1}).status_code==200
    assert c.get(path).json()['visible']==['prospects']  # Outside the recommended domain remains allowed.
    c.post('/api/companies/1/users',headers=h,json={'email':'personal@demo.test','password':'personal-password-very-long'})
    m=TestClient(env.app);mh=auth(m,'personal@demo.test','personal-password-very-long');other=m.get(path).json()
    assert 'prospects' not in other['visible'] and 'scanner' not in other['visible']
    assert m.put(path,headers=mh,json={'domain':'commerce','visible':['prospects'],'version':0}).status_code==403
    assert m.put(path,headers=mh,json={'domain':'commerce','visible':['clients'],'version':0}).status_code==200
    assert c.get(path).json()['visible']==['prospects']
    cid=c.post('/api/companies',headers=h,json={'name':'Atelier test','city':'Paris','headline':'Test domaine'}).json()['id']
    assert c.get(f'/api/companies/{cid}/workspace').json()['version']==0
    assert c.put(f'/api/companies/{cid}/activity-domain',headers=h,json={'domain':'agriculture'}).status_code==200
    defaults=c.get(f'/api/companies/{cid}/workspace').json();assert 'equipment' in defaults['visible'] and 'prospects' not in defaults['visible']
    assert m.get(f'/api/companies/{cid}/workspace').status_code==403
    env.init_db();assert m.get(path).json()['visible']==['clients']

def test_document_review_no_automatic_changes_and_tariffs(env):
    c,h=owner(env);raw=quote_pdf();r=upload(c,h,'quote',raw);assert r.status_code==201,r.text;did=r.json()['id']
    assert upload(c,h,'quote',raw).json()['id']==did
    assert c.get('/api/companies/1/profile').json()['fields']=={}
    doc=c.get(f'/api/companies/1/documents/{did}').json();assert doc['proposal']['fields']['siret']=='73282932000074'
    rates=doc['proposal']['rates'];assert len(rates)==1 and rates[0]['unit_price']=='25.50'
    assert c.get('/api/companies/1/tariff-catalog').json()==[]
    payload={'confirmed':False,'profile_fields':doc['proposal']['fields'],'rates':[{k:v for k,v in rates[0].items() if k!='source'}]}
    assert c.post(f'/api/companies/1/documents/{did}/confirm',headers=h,json=payload).status_code==422
    payload['confirmed']=True
    assert c.post(f'/api/companies/1/documents/{did}/confirm',headers=h,json=payload).status_code==200
    assert c.post(f'/api/companies/1/documents/{did}/confirm',headers=h,json=payload).status_code==409
    assert c.get('/api/companies/1/profile').json()['fields']['siret']=='73282932000074'
    assert c.get('/api/companies/1/tariff-catalog').json()[0]['unit_price_minor']==2550
    assert c.get(f'/api/companies/1/documents/{did}/source').content==raw
    with env.db() as con:
        row=con.execute('SELECT original,payload FROM source_documents WHERE id=?',(did,)).fetchone()
        assert not row['original'].startswith(b'%PDF-') and b'73282932000074' not in row['payload']
    assert upload(c,h,'other',quote_pdf(4)).status_code==413
    assert upload(c,h,'other',b'<svg>untrusted</svg>').status_code==415
    assert c.post('/api/companies/1/documents',headers=h,json={'filename':'bad.png','kind':'kbis','data':'???='}).status_code==422

@pytest.mark.skipif(not shutil.which('tesseract'),reason='OCR executable is required in deployment and CI')
def test_real_photo_ocr_and_iban_review(env):
    c,h=owner(env);r=upload(c,h,'kbis',kbis_png(),'photo-test.png');assert r.status_code==201,r.text
    did=r.json()['id'];doc=c.get(f'/api/companies/1/documents/{did}').json()
    assert doc['proposal']['fields']['iban']=='FR1420041010050500013M02606'
    assert doc['proposal']['fields']['siret']=='73282932000074'
    bad={'confirmed':True,'profile_fields':{'iban':'FR1420041010050500013M02600'}}
    assert c.post(f'/api/companies/1/documents/{did}/confirm',headers=h,json=bad).status_code==422
    assert c.get('/api/companies/1/profile').json()['fields']=={}
    assert c.post(f'/api/companies/1/documents/{did}/confirm',headers=h,json={'confirmed':True,'profile_fields':doc['proposal']['fields']}).status_code==200
    assert c.get('/api/companies/1/profile').json()['fields']['iban']=='FR1420041010050500013M02606'
    q=c.post('/api/companies/1/quotations',headers=h,json={'customer_name':'Client test','title':'Devis avec profil','lines':[{'description':'Prestation test','quantity':1,'unit_price':'10'}]}).json()
    assert q['issuer']['siret']=='73282932000074' and 'iban' not in q['issuer']
    from pypdf import PdfReader
    import io
    text=''.join(p.extract_text() for p in PdfReader(io.BytesIO(c.get(f"/api/companies/1/quotations/{q['id']}/pdf").content)).pages)
    assert '73282932000074' in text and 'FR1420041010050500013M02606' not in text

def test_document_and_bank_privacy_profile_conflicts(env):
    c,h=owner(env);did=upload(c,h,'quote',quote_pdf()).json()['id']
    cid=c.post('/api/companies',headers=h,json={'name':'Autre entreprise','city':'Paris','headline':'Test isolation'}).json()['id']
    assert c.get(f'/api/companies/{cid}/documents/{did}').status_code==404
    c.post('/api/companies/1/users',headers=h,json={'email':'docs@demo.test','password':'docs-password-very-long'})
    m=TestClient(env.app);mh=auth(m,'docs@demo.test','docs-password-very-long')
    for path in ['/profile','/documents',f'/documents/{did}',f'/documents/{did}/source']:
        assert m.get('/api/companies/1'+path).status_code==403
        assert TestClient(env.app).get('/api/companies/1'+path).status_code==401
    assert upload(m,mh,'quote',quote_pdf()).status_code==403
    update={'confirmed':True,'fields':{'legal_name':'Profil vérifié'},'version':0}
    assert c.put('/api/companies/1/profile',json=update).status_code==403
    assert c.put('/api/companies/1/profile',headers=h,json=update).status_code==200
    assert c.put('/api/companies/1/profile',headers=h,json=update).status_code==409
    assert c.put('/api/companies/1/profile',headers=h,json={**update,'version':1,'fields':{'unknown':'injection'}}).status_code==422
    env.init_db();assert c.get('/api/companies/1/profile').json()['fields']['legal_name']=='Profil vérifié'

def test_extraction_does_not_invent_identifiers_or_totals():
    assert valid_siret('73282932000074') and not valid_siret('00000000000000')
    assert valid_iban('FR1420041010050500013M02606') and not valid_iban('FR1420041010050500013M02600')
    proposal=extract_proposal('SIRET: 12345678901234\nTOTAL: 1000 EUR\nTVA : 200 EUR','quote')
    assert proposal['fields']=={} and proposal['rates']==[] and proposal['review_required'] is True

def test_document_removal_keeps_verified_profile(env):
    c,h=owner(env);did=upload(c,h,'quote',quote_pdf()).json()['id']
    c.post(f'/api/companies/1/documents/{did}/confirm',headers=h,json={'confirmed':True,'profile_fields':{'legal_name':'Profil à conserver'},'rates':[{'description':'Tarif test','unit_price':'5','currency':'EUR','unit':'heure'}]})
    assert c.delete(f'/api/companies/1/documents/{did}').status_code==403
    assert c.delete(f'/api/companies/1/documents/{did}',headers=h).status_code==200
    assert c.get(f'/api/companies/1/documents/{did}/source').status_code==404
    assert c.get('/api/companies/1/tariff-catalog').json()==[]
    assert c.get('/api/companies/1/profile').json()['fields']['legal_name']=='Profil à conserver'
