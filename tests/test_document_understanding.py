import base64
import json
import shutil
import pytest
from test_app import env
from test_workspace_documents import owner,upload
from document_fixtures import PASSPORT_MRZ,IDENTITY_MRZ,identity_png,typed_pdf
from document_understanding import read_mrz,interpret_document,normalized_date
from document_routes import extract_proposal,profile_cipher

@pytest.mark.parametrize('kind,mrz,number',[('passport',PASSPORT_MRZ,'L898902C3'),('identity',IDENTITY_MRZ,'D23145890'),('residence',IDENTITY_MRZ,'D23145890'),('identity','I<UTOERIKSSON<<ANNA<MARIA'.ljust(36,'<')+'\nD231458907UTO7408122F1204159<<<<<<<6','D23145890')])
def test_mrz_layouts_check_digits_and_field_meaning(kind,mrz,number):
    result=extract_proposal(mrz,kind);f=result['fields']
    assert f=={'last_name':'ERIKSSON','first_name':'ANNA MARIA','document_number':number,'birth_date':'12/08/74','expiry_date':'15/04/12','nationality':'UTO','sex':'F','issuing_country':'UTO'}
    assert 'deux chiffres' in ' '.join(result['notes'])
    assert 'legal_name' not in f and 'siret' not in f
    # Individual and composite checks must all pass; never repair O/0 or a
    # check digit to manufacture a plausible document number.
    invalid=mrz.replace(number,number[:-1]+'4',1)
    assert not read_mrz(invalid)[0]
    assert not read_mrz(mrz[:-1]+'7')[0] if len(mrz.splitlines())==2 else True

def test_bilingual_multiple_fields_and_dates_without_guessing():
    text='Nom / Surname MARTIN\nPrénoms / Given names ALICE\nDate de naissance / Date of birth 12 05 1990\nSexe / Sex F  Nationalité / Nationality FRANÇAISE\nPassport No. AB1234567\nDate of expiry 2030-05-12\nDate of issue 12 mai 2020\nAuthority PREFECTURE DE PARIS'
    f=extract_proposal(text,'passport')['fields']
    assert f=={'last_name':'MARTIN','first_name':'ALICE','birth_date':'12/05/1990','sex':'F','nationality':'FRANÇAISE','document_number':'AB1234567','expiry_date':'12/05/2030','issue_date':'12/05/2020','issuing_authority':'PREFECTURE DE PARIS'}
    f=extract_proposal('Nom / Surname\nMARTIN\nPrénoms / Given names\nALICE\nSexe / Sex    Nationalité / Nationality\nF    FRANÇAISE','identity')['fields']
    assert f['last_name']=='MARTIN' and f['first_name']=='ALICE' and f['sex']=='F' and f['nationality']=='FRANÇAISE'
    assert normalized_date('31/02/2001') is None
    assert normalized_date('12 AUG/AOÛT 74')=='12/08/74'
    assert normalized_date('15 AVR/APR 2012')=='15/04/2012'
    assert normalized_date('12 JAN/FEB 1974') is None
    assert extract_proposal('Type / Type Country code / Code du pays Passport No. / N° de passeport\nPP UTO L898902C3','passport')['fields']['document_number']=='L898902C3'
    assert 'birth_date' not in extract_proposal('Date de naissance 31/02/2001','identity')['fields']
    assert extract_proposal('Né(e) le 12/05/1990 à BAMAKO\nSexe Féminin','identity')['fields']=={'birth_date':'12/05/1990','birth_place':'BAMAKO','sex':'F'}

def test_visual_and_coded_conflicts_do_not_silently_overwrite():
    f,e,notes=interpret_document('Nom / Surname MARTIN\nDate de naissance 12/08/1974\n'+PASSPORT_MRZ,'passport')
    assert 'last_name' not in f and f['birth_date']=='12/08/1974'
    assert any('diffère' in n and 'Nom' in n for n in notes)
    assert 'document_number' not in interpret_document('Document No. AB12345\nDocument No. CD67890\n'+PASSPORT_MRZ,'identity')[0]
    assert not read_mrz(PASSPORT_MRZ+'\n'+IDENTITY_MRZ)[0]
    mrz='P<UTOMUELLER<<ANNA<MARIA'.ljust(44,'<')+'\n'+PASSPORT_MRZ.splitlines()[1]
    assert interpret_document('Surname MÜLLER\n'+mrz,'passport')[0]['last_name']=='MÜLLER'

def test_utility_customer_address_insurance_and_bank_fields():
    text='FACTURE ELECTRICITE\nAdresse du fournisseur 10 rue Fournisseur 69001 Lyon\nTitulaire du contrat ALICE MARTIN\nAdresse de consommation 12 rue du Test\n75001 Paris'
    f=extract_proposal(text,'address')['fields'];assert f=={'document_holder':'ALICE MARTIN','personal_address':'12 rue du Test 75001 Paris'}
    assert extract_proposal('10 rue Fournisseur\n69001 Lyon\n12 rue du Test\n75001 Paris','address')['fields']=={}
    f=extract_proposal('Assureur ASSURANCE TEST\nPolicy holder ALICE MARTIN\nPolicy number AB123456\nDate of expiry 12/05/2030','insurance')['fields']
    assert f=={'insurer':'ASSURANCE TEST','document_holder':'ALICE MARTIN','policy_number':'AB123456','expiry_date':'12/05/2030'}
    f=extract_proposal('Account holder ALICE MARTIN\nIBAN FR14 2004 1010 0505\n0001 3M02 606\nSWIFT code PSSTFRPPPAR','rib')['fields']
    assert f=={'account_holder':'ALICE MARTIN','iban':'FR1420041010050500013M02606','bic':'PSSTFRPPPAR'}

@pytest.mark.skipif(not shutil.which('tesseract'),reason='OCR executable required')
@pytest.mark.parametrize('kind,number',[('passport','L898902C3'),('identity','D23145890')])
def test_identity_photo_to_form_to_saved_profile(env,kind,number):
    c,h=owner(env);r=upload(c,h,kind,identity_png(kind),'specimen.png');assert r.status_code==201,r.text
    path=f"/api/companies/1/documents/{r.json()['id']}";doc=c.get(path).json();f=doc['proposal']['fields']
    assert f['last_name']=='ERIKSSON' and f['first_name']=='ANNA MARIA'
    assert f['document_number']==number and f['birth_date']=='12/08/1974' and f['expiry_date']=='15/04/2012'
    assert 'legal_name' not in f and 'address' not in f
    assert c.get('/api/companies/1/profile').json()['fields']=={}
    assert c.post(path+'/confirm',headers=h,json={'confirmed':True,'profile_fields':f}).status_code==200
    assert c.get('/api/companies/1/profile').json()['fields']==f
    assert c.post(path+'/reanalyze',headers=h).status_code==409

def test_existing_identity_reanalysis_scope_and_preserved_source(env,monkeypatch):
    import document_routes
    c,h=owner(env)
    raw=typed_pdf(['Nom / Surname MARTIN','Prénom / Given name ALICE','Passport No. AB1234567'])
    did=upload(c,h,'passport',raw).json()['id'];path=f'/api/companies/1/documents/{did}'
    with env.db() as con:
        cipher=profile_cipher(env.SECRET)
        con.execute('UPDATE source_documents SET payload=? WHERE id=?',(cipher.encrypt(json.dumps({'text':'Ancienne lecture vide','proposal':{'fields':{},'rates':[],'notes':[],'evidence':{}}}).encode()),did))
    assert c.post(path+'/reanalyze').status_code==403
    assert c.post(path+'/reanalyze',headers=h).status_code==200
    d=c.get(path).json();assert d['analysis_version']==2 and d['proposal']['fields']['document_number']=='AB1234567'
    assert c.get(path+'/source').content==raw
    assert c.get('/api/companies/1/profile').json()['fields']=={}
    cid=c.post('/api/companies',headers=h,json={'name':'Autre','city':'Paris','headline':'Test isolation'}).json()['id']
    assert c.post(f'/api/companies/{cid}/documents/{did}/reanalyze',headers=h).status_code==404
