import base64
import json
import shutil
import pytest
from fastapi.testclient import TestClient
from test_app import env,auth
from document_fixtures import kbis_png,quote_pdf,two_column_kbis_png,KBIS_ROWS
from document_routes import valid_siret,valid_iban,extract_proposal

def owner(env):
    c=TestClient(env.app);return c,auth(c,'owner@demo.test','correct horse battery staple')

def upload(c,h,kind,raw,name='exemple.pdf',cid=1):
    return c.post(f'/api/companies/{cid}/documents',headers=h,json={'filename':name,'kind':kind,'data':base64.b64encode(raw).decode()})

def test_personal_modules_empty_home_domains_and_scope(env):
    c,h=owner(env);path='/api/companies/1/workspace';state=c.get(path).json()
    assert len(state['modules'])==17 and len(state['visible'])==16 and state['version']==0
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

@pytest.mark.skipif(not shutil.which('tesseract'),reason='OCR executable required')
def test_two_column_kbis_ocr_saved_fields_and_legacy_document(env):
    c,h=owner(env);did=upload(c,h,'kbis',two_column_kbis_png(),'kbis-colonnes.png').json()['id']
    path=f'/api/companies/1/documents/{did}'
    doc=c.get(path).json();fields=doc['proposal']['fields']
    assert fields['legal_name']=='INFONET'
    assert fields['rcs_number']=='123 456 789 R.C.S. Paris'
    assert '75008 Paris' in fields['address'] and fields['trade_name']=='INFONET WEB GROUP'
    assert fields['representative'].startswith('JULIEN DUP') and fields['activity']=='PORTAILS INTERNET'
    assert 'siret' not in fields and 'personal_address' not in fields
    # Previously failed imports recover on opening, without reupload or changes
    # to either the stored source or the existing company profile.
    from document_routes import profile_cipher
    with env.db() as con:
        cipher=profile_cipher(env.SECRET)
        payload=json.loads(cipher.decrypt(con.execute('SELECT payload FROM source_documents WHERE id=?',(did,)).fetchone()['payload']))
        payload['proposal']['fields']={}
        con.execute('UPDATE source_documents SET payload=? WHERE id=?',(cipher.encrypt(json.dumps(payload).encode()),did))
    assert c.get(path).json()['proposal']['fields']==fields
    assert c.get('/api/companies/1/profile').json()['fields']=={}
    assert c.post(path+'/confirm',headers=h,json={'confirmed':True,'profile_fields':fields}).status_code==200
    from document_routes import checked_fields
    assert c.get('/api/companies/1/profile').json()['fields']==checked_fields(fields)

def test_label_values_next_line_and_document_specific_fields():
    text='\n'.join(x for row in KBIS_ROWS for x in row)
    fields=extract_proposal(text,'kbis')['fields']
    assert fields['legal_name']=='INFONET' and fields['activity']=='PORTAILS INTERNET'
    assert fields['address']=='75 avenue des Champs-Élysées 75008 Paris'
    identity='Nom: MARTIN\nPrénoms: ALICE\nDate de naissance 12/05/1990\nLieu de naissance LYON\nNationalité FRANÇAISE\nNuméro de carte ABC123456\nDate d’expiration 12/05/2030\nAdresse du domicile 12 rue du Test\n75001 Paris'
    fields=extract_proposal(identity,'identity')['fields']
    assert fields=={'last_name':'MARTIN','first_name':'ALICE','birth_date':'12/05/1990','birth_place':'LYON','nationality':'FRANÇAISE','document_number':'ABC123456','expiry_date':'12/05/2030','personal_address':'12 rue du Test 75001 Paris'}
    assert 'legal_name' not in fields and 'address' not in fields
    assert extract_proposal('Titulaire du compte ALICE MARTIN\nIBAN\nFR1420041010050500013M02606\nBIC PSSTFRPPPAR','rib')['fields']=={'account_holder':'ALICE MARTIN','iban':'FR1420041010050500013M02606','bic':'PSSTFRPPPAR'}
    assert extract_proposal('Facture électricité\n12 rue du Test\n75001 Paris','address')['fields']['personal_address']=='12 rue du Test 75001 Paris'

def test_identity_save_encryption_and_quote_privacy(env,monkeypatch):
    import document_routes
    monkeypatch.setattr(document_routes,'read_document',lambda raw,kind=None:('Nom MARTIN\nPrénom ALICE\nNuméro de passeport ABC123456\nAdresse 12 rue du Test 75001 Paris','application/pdf'))
    c,h=owner(env);did=upload(c,h,'passport',quote_pdf()).json()['id']
    fields=c.get(f'/api/companies/1/documents/{did}').json()['proposal']['fields']
    assert fields['last_name']=='MARTIN' and fields['document_number']=='ABC123456'
    assert c.post(f'/api/companies/1/documents/{did}/confirm',headers=h,json={'confirmed':True,'profile_fields':fields}).status_code==200
    from document_routes import checked_fields
    assert c.get('/api/companies/1/profile').json()['fields']==checked_fields(fields)
    with env.db() as con:assert b'ABC123456' not in con.execute('SELECT payload FROM company_profiles WHERE company_id=1').fetchone()['payload']
    q=c.post('/api/companies/1/quotations',headers=h,json={'customer_name':'Client test','title':'Devis test identité','lines':[{'description':'Prestation','quantity':1,'unit_price':'10'}]}).json()
    assert 'document_number' not in q['issuer'] and 'personal_address' not in q['issuer'] and 'last_name' not in q['issuer']


def test_home_columns_persist_scope_validation_and_legacy_save(env):
    c,h=owner(env);path='/api/companies/1/workspace';state=c.get(path).json()
    assert state['columns']==2
    payload={'domain':state['domain'],'visible':state['visible'],'version':state['version'],'columns':3}
    assert c.put(path,json=payload).status_code==403
    assert c.put(path,headers=h,json={**payload,'columns':5}).status_code==422
    assert c.put(path,headers=h,json=payload).status_code==200
    saved=c.get(path).json();assert saved['columns']==3 and saved['visible']==state['visible']
    assert c.put(path,headers=h,json={**payload,'columns':4}).status_code==409
    # A client from before this feature may omit columns without resetting the choice.
    assert c.put(path,headers=h,json={'domain':saved['domain'],'visible':saved['visible'],'version':saved['version']}).status_code==200
    assert c.get(path).json()['columns']==3
    c.post('/api/companies/1/users',headers=h,json={'email':'columns@demo.test','password':'columns-password-very-long'})
    m=TestClient(env.app);mh=auth(m,'columns@demo.test','columns-password-very-long');other=m.get(path).json()
    assert other['columns']==2
    assert m.put(path,headers=mh,json={'domain':other['domain'],'visible':other['visible'],'version':other['version'],'columns':4}).status_code==200
    assert c.get(path).json()['columns']==3
    cid=c.post('/api/companies',headers=h,json={'name':'Autre grille','city':'Paris','headline':'Test isolation'}).json()['id']
    assert c.get(f'/api/companies/{cid}/workspace').json()['columns']==2
    assert m.get(f'/api/companies/{cid}/workspace').status_code==403
    env.init_db();assert c.get(path).json()['columns']==3 and m.get(path).json()['columns']==4


def test_home_columns_migration_preserves_existing_personal_home(env):
    c,h=owner(env);path='/api/companies/1/workspace'
    assert c.put(path,headers=h,json={'domain':'agriculture','visible':['clients','equipment'],'version':0}).status_code==200
    with env.db() as con:con.execute('ALTER TABLE workspace_preferences DROP COLUMN columns')
    env.init_db()
    state=c.get(path).json()
    assert state['columns']==2 and state['domain']=='agriculture' and state['visible']==['clients','equipment'] and state['version']==1


def test_dynamic_home_usage_ten_day_boundary_and_isolation(env,monkeypatch):
    import workspace_routes
    from types import SimpleNamespace
    clock=[1800000000.0];monkeypatch.setattr(workspace_routes,'time',SimpleNamespace(time=lambda:clock[0]))
    c,h=owner(env);path='/api/companies/1/workspace';state=c.get(path).json()
    assert state['dynamic'] is True and not state['inactive']
    assert c.post(path+'/usage/clients').status_code==403
    assert c.post(path+'/usage/unknown',headers=h).status_code==403
    clock[0]+=10*86400-1;assert not c.get(path).json()['inactive']
    clock[0]+=1;assert 'clients' in c.get(path).json()['inactive']
    assert c.post(path+'/usage/clients',headers=h).status_code==200
    state=c.get(path).json();assert 'clients' not in state['inactive'] and 'equipment' in state['inactive']
    assert c.put(path,headers=h,json={'domain':state['domain'],'visible':state['visible'],'version':state['version'],'dynamic':False}).status_code==200
    state=c.get(path).json();assert state['dynamic'] is False
    assert c.put(path,headers=h,json={'domain':state['domain'],'visible':state['visible'],'version':state['version']}).status_code==200
    assert c.get(path).json()['dynamic'] is False
    c.post('/api/companies/1/users',headers=h,json={'email':'usage@demo.test','password':'usage-password-very-long'})
    m=TestClient(env.app);mh=auth(m,'usage@demo.test','usage-password-very-long')
    assert m.get(path).json()['dynamic'] is True and not m.get(path).json()['inactive']
    assert m.post(path+'/usage/social',headers=mh).status_code==403
    cid=c.post('/api/companies',headers=h,json={'name':'Usage séparé','city':'Paris','headline':'Test usage'}).json()['id']
    assert m.post(f'/api/companies/{cid}/workspace/usage/clients',headers=mh).status_code==403
    assert not c.get(f'/api/companies/{cid}/workspace').json()['inactive']
    env.init_db();assert c.get(path).json()['dynamic'] is False and 'clients' not in c.get(path).json()['inactive']


def test_home_rows_free_choice_persist_and_survive_other_saves(env):
    c,h=owner(env);path='/api/companies/1/workspace';state=c.get(path).json()
    assert state['rows'] is None
    base={'domain':state['domain'],'visible':state['visible']}
    assert c.put(path,headers=h,json={**base,'version':state['version'],'rows':0}).status_code==422
    assert c.put(path,headers=h,json={**base,'version':state['version'],'rows':11}).status_code==422
    assert c.put(path,headers=h,json={**base,'version':state['version'],'rows':5,'columns':2}).status_code==200
    saved=c.get(path).json();assert saved['rows']==5 and saved['columns']==2
    # Changing columns or saving from the settings page keeps the chosen rows.
    assert c.put(path,headers=h,json={**base,'version':saved['version'],'columns':3}).status_code==200
    again=c.get(path).json();assert again['rows']==5 and again['columns']==3
